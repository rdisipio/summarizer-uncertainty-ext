import type { ExtensionMessage, ScoreResult, SummaryResult } from "./types";

const HOST_ID = "stylo-root";

// Band → CSS class mapping
const BAND_CLASS: Record<string, string> = {
  low: "",
  medium: "unc-medium",
  high: "unc-high",
  very_high: "unc-very-high",
};

// ── Shadow DOM setup ──────────────────────────────────────────────────────────

function getOrCreateHost(): { host: HTMLElement; shadow: ShadowRoot } {
  let host = document.getElementById(HOST_ID);
  if (host) return { host, shadow: (host as any)._shadow as ShadowRoot };

  host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "closed" });
  (host as any)._shadow = shadow;

  shadow.innerHTML = `
    <style>
      .panel {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 380px;
        max-height: 60vh;
        overflow-y: auto;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 32px rgba(0,0,0,0.18);
        padding: 16px;
        z-index: 2147483647;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        color: #1a1a1a;
        box-sizing: border-box;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .title { font-weight: 600; font-size: 13px; color: #555; }
      .close {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 16px;
        color: #999;
        padding: 0;
        line-height: 1;
      }
      .close:hover { color: #333; }
      .body { line-height: 1.6; margin-bottom: 12px; min-height: 32px; }
      .spinner {
        display: inline-block;
        width: 16px; height: 16px;
        border: 2px solid #ddd;
        border-top-color: #555;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        vertical-align: middle;
        margin-right: 8px;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .scoring-note {
        font-size: 12px;
        color: #aaa;
        margin-bottom: 10px;
        display: none;
      }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .actions button {
        padding: 5px 12px;
        border-radius: 6px;
        border: 1px solid #ddd;
        background: #fafafa;
        cursor: pointer;
        font-size: 12px;
        color: #333;
      }
      .actions button:hover { background: #f0f0f0; }
      .error { color: #c0392b; font-size: 13px; }

      /* Uncertainty highlights */
      .unc-medium   { background: #fff3cd; border-radius: 3px; padding: 0 2px; }
      .unc-high     { background: #ffd6a5; border-radius: 3px; padding: 0 2px; }
      .unc-very-high { background: #ffadad; border-radius: 3px; padding: 0 2px; }
    </style>
    <div class="panel">
      <div class="header">
        <span class="title">Stylo</span>
        <button class="close" id="btn-close">✕</button>
      </div>
      <div class="body" id="body"></div>
      <div class="scoring-note" id="scoring-note">
        <span class="spinner"></span>Scoring uncertainty…
      </div>
      <div class="actions" id="actions" style="display:none">
        <button id="btn-save">Save</button>
        <button id="btn-compare">Compare models</button>
        <button id="btn-edit">Suggest edits</button>
      </div>
    </div>
  `;

  shadow.getElementById("btn-close")!.addEventListener("click", () => host!.remove());
  document.body.appendChild(host);
  return { host, shadow };
}

// ── Render helpers ────────────────────────────────────────────────────────────

function showLoading() {
  const { shadow } = getOrCreateHost();
  shadow.getElementById("body")!.innerHTML =
    '<span class="spinner"></span>Summarizing…';
  shadow.getElementById("actions")!.style.display = "none";
  shadow.getElementById("scoring-note")!.style.display = "none";
}

function showError(message: string) {
  const { shadow } = getOrCreateHost();
  shadow.getElementById("body")!.innerHTML =
    `<span class="error">⚠ ${escapeHtml(message)}</span>`;
  shadow.getElementById("actions")!.style.display = "none";
  shadow.getElementById("scoring-note")!.style.display = "none";
}

function showSummary(result: SummaryResult) {
  const { shadow } = getOrCreateHost();
  shadow.getElementById("body")!.textContent = result.summary;
  shadow.getElementById("actions")!.style.display = "flex";
  // Show spinner while we wait for scores
  const note = shadow.getElementById("scoring-note")!;
  note.style.display = "block";
  wireButtons(shadow, result);
}

function applyScores(score: ScoreResult) {
  const { shadow } = getOrCreateHost();
  const body = shadow.getElementById("body")!;
  const note = shadow.getElementById("scoring-note")!;

  if (!score.sentence_results.length) {
    note.style.display = "none";
    return;
  }

  // Replace text with highlighted spans, one per sentence
  const html = score.sentence_results
    .map((s) => {
      const cls = BAND_CLASS[s.uncertainty_band] ?? "";
      const text = escapeHtml(s.sentence_text);
      return cls ? `<span class="${cls}" title="${s.uncertainty_band} uncertainty">${text}</span>` : text;
    })
    .join(" ");

  body.innerHTML = html;
  note.style.display = "none";
}

// ── Button wiring ─────────────────────────────────────────────────────────────

function wireButtons(shadow: ShadowRoot, result: SummaryResult) {
  shadow.getElementById("btn-save")!.onclick = () => saveItem(result);
  shadow.getElementById("btn-compare")!.onclick = () => requestComparison(result);
  shadow.getElementById("btn-edit")!.onclick = () => requestEdits(result);
}

async function saveItem(result: SummaryResult) {
  const stored = await chrome.storage.local.get("savedItems");
  const savedItems: SummaryResult[] = Array.isArray(stored.savedItems) ? stored.savedItems : [];
  savedItems.push({ ...result, savedAt: Date.now() } as SummaryResult & { savedAt: number });
  await chrome.storage.local.set({ savedItems });

  const { shadow } = getOrCreateHost();
  const btn = shadow.getElementById("btn-save") as HTMLButtonElement;
  btn.textContent = "Saved ✓";
  btn.disabled = true;
}

function requestComparison(_result: SummaryResult) {
  // TODO step 7
}

function requestEdits(_result: SummaryResult) {
  // TODO step 8
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: ExtensionMessage) => {
  switch (msg.type) {
    case "STYLO_LOADING":
      showLoading();
      break;
    case "STYLO_ERROR":
      showError(msg.message);
      break;
    case "SHOW_SUMMARY":
      showSummary(msg.result);
      break;
    case "UPDATE_SCORE":
      applyScores(msg.score);
      break;
  }
});

// ── Util ──────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
