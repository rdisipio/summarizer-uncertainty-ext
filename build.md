# Build Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Chrome browser with Developer mode enabled
- OpenRouter API key
- Scoring server token (HF Spaces)

---

## Step 1 — Scaffold the project

```bash
npm create vite@latest stylo-ext -- --template vanilla-ts
cd stylo-ext
npm install
npm install -D vite-plugin-web-extension
```

The plugin handles multi-entry bundling: background service worker, content script, and settings page are separate output bundles, which is required by Chrome MV3.

---

## Step 2 — Write manifest.json

Create `src/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Stylo",
  "version": "0.1.0",
  "description": "Uncertainty-aware text summarization",
  "permissions": ["contextMenus", "storage", "activeTab", "scripting"],
  "host_permissions": [
    "https://openrouter.ai/*",
    "https://rdisipio-sentence-uncertainty.hf.space/*"
  ],
  "background": {
    "service_worker": "src/background.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content.ts"]
    }
  ],
  "options_page": "src/settings.html",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## Step 3 — Settings page

Files: `src/settings.html` + `src/settings.ts`

Two inputs saved to `chrome.storage.local`:
- OpenRouter API key
- Scoring server token

Users open this page once via `chrome://extensions` → Details → Extension options.

For personal/development builds, `vite.config.ts` injects `OPENROUTER_API_KEY` and `HF_UNCERTAINTY_API_TOKEN` from `.env` at build time via Vite `define`, so the fields are pre-populated on first open. Only those two specific variables are injected — other keys in `.env` are not touched.

> **Caveat:** The two keys are stored in plaintext inside `dist/src/settings.js`. This is acceptable for a personal unpacked extension. Before any public distribution, remove the `define` block from `vite.config.ts` so users supply their own keys and nothing is baked into the bundle.

```typescript
// src/settings.ts
const form = document.getElementById("settings-form") as HTMLFormElement;

// Load saved values on open
const saved = await chrome.storage.local.get(["openrouterKey", "scoringToken"]);
(document.getElementById("openrouter-key") as HTMLInputElement).value = saved.openrouterKey ?? "";
(document.getElementById("scoring-token") as HTMLInputElement).value = saved.scoringToken ?? "";

// Save on submit
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({
    openrouterKey: (document.getElementById("openrouter-key") as HTMLInputElement).value,
    scoringToken: (document.getElementById("scoring-token") as HTMLInputElement).value,
  });
});
```

---

## Step 4 — Background service worker

File: `src/background.ts`

Responsibilities:
1. Register the "Summarize" context menu item on install
2. On click: read keys from storage, call OpenRouter, call scoring endpoint
3. Send result to the content script via `chrome.tabs.sendMessage`

```typescript
// src/background.ts
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "summarize", title: "Summarize", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "summarize" || !tab?.id) return;

  const { openrouterKey, scoringToken } = await chrome.storage.local.get(["openrouterKey", "scoringToken"]);
  const text = info.selectionText ?? "";

  // 1. Generate summary via OpenRouter
  const summaryRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: `Summarize this:\n\n${text}` }],
    }),
  });
  const summaryData = await summaryRes.json();
  const summary = summaryData.choices[0].message.content;

  // 2. Score uncertainty
  const scoreRes = await fetch("https://rdisipio-sentence-uncertainty.hf.space/score", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Token": scoringToken },
    body: JSON.stringify({ source: text, summary, sample_count: 5, seed: 0, compute_consistency: false }),
  });
  const scoreData = await scoreRes.json();

  // 3. Send to content script
  chrome.tabs.sendMessage(tab.id, { type: "SHOW_SUMMARY", summary, score: scoreData });
});
```

---

## Step 5 — Content script and overlay

File: `src/content.ts`

Uses Shadow DOM to isolate styles from the host page. Renders a floating panel near the user's selection.

```typescript
// src/content.ts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SHOW_SUMMARY") renderOverlay(msg.summary, msg.score);
});

function renderOverlay(summary: string, score: any) {
  // Remove any existing overlay
  document.getElementById("stylo-root")?.remove();

  const host = document.createElement("div");
  host.id = "stylo-root";
  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>
      /* scoped styles here */
      .panel { position: fixed; bottom: 24px; right: 24px; width: 360px; background: white;
                border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.15); padding: 16px; z-index: 999999; }
      .summary { font-size: 14px; line-height: 1.5; margin-bottom: 12px; }
      .score { font-size: 12px; color: #888; margin-bottom: 12px; }
      .actions { display: flex; gap: 8px; }
      button { padding: 6px 12px; border-radius: 6px; border: 1px solid #ddd; cursor: pointer; font-size: 13px; }
    </style>
    <div class="panel">
      <div class="summary">${summary}</div>
      <div class="score">Uncertainty score: ${JSON.stringify(score)}</div>
      <div class="actions">
        <button id="btn-save">Save</button>
        <button id="btn-compare">Compare models</button>
        <button id="btn-edit">Suggest edits</button>
        <button id="btn-close">✕</button>
      </div>
    </div>
  `;

  shadow.getElementById("btn-close")?.addEventListener("click", () => host.remove());
  shadow.getElementById("btn-save")?.addEventListener("click", () => saveItem(summary, score));
  // btn-compare and btn-edit wired up in later steps

  document.body.appendChild(host);
}

async function saveItem(summary: string, score: any) {
  const { savedItems = [] } = await chrome.storage.local.get("savedItems");
  savedItems.push({ summary, score, savedAt: Date.now() });
  await chrome.storage.local.set({ savedItems });
}
```

---

## Step 6 — Compare models button

When clicked, the content script sends a message back to the background worker requesting a second summary with a different model. The background worker returns both summaries; the overlay re-renders in a two-column layout. The user clicks "I prefer this" on one — that pairwise signal is saved alongside both summaries.

---

## Step 7 — Suggest edits button

Sends the current summary back to OpenRouter with a system prompt instructing the model to propose targeted edits. The overlay updates to show the revised version with a diff highlight or accept/reject interface.

---

## Step 8 — Load unpacked and test

1. Run `npm run build` — output goes to `dist/`
2. Open `chrome://extensions`
3. Enable Developer mode (top-right toggle)
4. Click "Load unpacked" → select the `dist/` folder
5. Navigate to any article, highlight a paragraph, right-click → Summarize

To iterate: edit code → `npm run build` → click the refresh icon on the extension card in `chrome://extensions`.

---

## File structure (target)

```
stylo-ext/
  src/
    manifest.json
    background.ts
    content.ts
    settings.html
    settings.ts
  icons/
    icon16.png
    icon48.png
    icon128.png
  vite.config.ts
  package.json
  dist/          ← built output, load this in Chrome
```
