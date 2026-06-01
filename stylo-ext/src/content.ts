import type { ExtensionMessage, ScoreResult, SummaryResult } from "./types";

const HOST_ID = "stylo-root";

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
        transition: width 0.2s ease;
      }
      .panel.comparing { width: 740px; }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .title { font-weight: 600; font-size: 13px; color: #555; }
      .close {
        background: none; border: none; cursor: pointer;
        font-size: 16px; color: #999; padding: 0; line-height: 1;
      }
      .close:hover { color: #333; }

      /* Single-summary view */
      .body { line-height: 1.6; margin-bottom: 12px; min-height: 32px; }

      /* Side-by-side comparison view */
      .compare-grid {
        display: none;
        gap: 12px;
        margin-bottom: 12px;
      }
      .compare-grid.visible { display: grid; grid-template-columns: 1fr 1fr; }
      .compare-col {
        border: 1px solid #eee;
        border-radius: 8px;
        padding: 10px;
      }
      .compare-col.preferred { border-color: #4caf50; background: #f9fff9; }
      .model-badge {
        font-size: 11px;
        font-weight: 600;
        color: #888;
        margin-bottom: 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .col-body { line-height: 1.6; font-size: 13px; margin-bottom: 10px; min-height: 32px; }
      .col-scoring {
        font-size: 11px; color: #aaa; margin-bottom: 8px; display: none;
      }
      .prefer-btn {
        width: 100%;
        padding: 5px;
        border-radius: 6px;
        border: 1px solid #ddd;
        background: #fafafa;
        cursor: pointer;
        font-size: 12px;
      }
      .prefer-btn:hover { background: #f0f0f0; }
      .prefer-btn.chosen { background: #e8f5e9; border-color: #4caf50; color: #2e7d32; }

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
      .scoring-note { font-size: 12px; color: #aaa; margin-bottom: 10px; display: none; }
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

      .unc-medium    { background: #fff3cd; border-radius: 3px; padding: 0 2px; }
      .unc-high      { background: #ffd6a5; border-radius: 3px; padding: 0 2px; }
      .unc-very-high { background: #ffadad; border-radius: 3px; padding: 0 2px; }
    </style>
    <div class="panel" id="panel">
      <div class="header">
        <span class="title">Stylo</span>
        <button class="close" id="btn-close">✕</button>
      </div>
      <div class="body" id="body"></div>
      <div class="scoring-note" id="scoring-note">
        <span class="spinner"></span>Scoring uncertainty…
      </div>
      <div class="compare-grid" id="compare-grid">
        <div class="compare-col" id="col-original">
          <div class="model-badge" id="badge-original"></div>
          <div class="col-body" id="body-original"></div>
          <div class="col-scoring" id="scoring-original">
            <span class="spinner"></span>Scoring…
          </div>
          <button class="prefer-btn" id="prefer-original">I prefer this</button>
        </div>
        <div class="compare-col" id="col-comparison">
          <div class="model-badge" id="badge-comparison"></div>
          <div class="col-body" id="body-comparison">
            <span class="spinner"></span>Generating…
          </div>
          <div class="col-scoring" id="scoring-comparison">
            <span class="spinner"></span>Scoring…
          </div>
          <button class="prefer-btn" id="prefer-comparison" disabled>I prefer this</button>
        </div>
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

// ── State ─────────────────────────────────────────────────────────────────────

let originalResult: SummaryResult | null = null;
let comparisonResult: SummaryResult | null = null;

// ── Render helpers ────────────────────────────────────────────────────────────

function showLoading() {
  const { shadow } = getOrCreateHost();
  shadow.getElementById("body")!.innerHTML = '<span class="spinner"></span>Summarizing…';
  shadow.getElementById("actions")!.style.display = "none";
  shadow.getElementById("scoring-note")!.style.display = "none";
}

function showError(message: string) {
  const { shadow } = getOrCreateHost();
  shadow.getElementById("body")!.innerHTML = `<span class="error">⚠ ${escapeHtml(message)}</span>`;
  shadow.getElementById("actions")!.style.display = "none";
  shadow.getElementById("scoring-note")!.style.display = "none";
}

function showSummary(result: SummaryResult) {
  originalResult = result;
  comparisonResult = null;
  const { shadow } = getOrCreateHost();
  shadow.getElementById("panel")!.classList.remove("comparing");
  shadow.getElementById("compare-grid")!.classList.remove("visible");
  shadow.getElementById("body")!.textContent = result.summary;
  shadow.getElementById("body")!.style.display = "block";
  shadow.getElementById("actions")!.style.display = "flex";
  shadow.getElementById("scoring-note")!.style.display = "block";
  wireButtons(shadow, result);
}

function applyScores(score: ScoreResult) {
  const { shadow } = getOrCreateHost();
  const isComparing = shadow.getElementById("compare-grid")!.classList.contains("visible");

  if (isComparing) {
    applyHighlights(shadow.getElementById("body-original")!, score);
    (shadow.getElementById("scoring-original") as HTMLElement).style.display = "none";
  } else {
    applyHighlights(shadow.getElementById("body")!, score);
    shadow.getElementById("scoring-note")!.style.display = "none";
  }
}

function showComparison(result: SummaryResult) {
  comparisonResult = result;
  const { shadow } = getOrCreateHost();

  // Switch to comparing layout
  shadow.getElementById("panel")!.classList.add("comparing");
  shadow.getElementById("body")!.style.display = "none";
  shadow.getElementById("scoring-note")!.style.display = "none";

  const grid = shadow.getElementById("compare-grid")!;
  grid.classList.add("visible");

  // Populate original column
  shadow.getElementById("badge-original")!.textContent = originalResult?.model ?? "";
  shadow.getElementById("body-original")!.textContent = originalResult?.summary ?? "";
  const origScoring = shadow.getElementById("scoring-original") as HTMLElement;
  origScoring.style.display = "block";

  // Populate comparison column
  shadow.getElementById("badge-comparison")!.textContent = result.model;
  shadow.getElementById("body-comparison")!.textContent = result.summary;
  const cmpScoring = shadow.getElementById("scoring-comparison") as HTMLElement;
  cmpScoring.style.display = "block";
  (shadow.getElementById("prefer-comparison") as HTMLButtonElement).disabled = false;

  wirePreferenceButtons(shadow);
}

function applyComparisonScores(score: ScoreResult) {
  const { shadow } = getOrCreateHost();
  applyHighlights(shadow.getElementById("body-comparison")!, score);
  (shadow.getElementById("scoring-comparison") as HTMLElement).style.display = "none";
}

function applyHighlights(el: HTMLElement, score: ScoreResult) {
  if (!score.sentence_results.length) return;
  el.innerHTML = score.sentence_results
    .map((s) => {
      const cls = BAND_CLASS[s.uncertainty_band] ?? "";
      const text = escapeHtml(s.sentence_text);
      return cls
        ? `<span class="${cls}" title="${s.uncertainty_band} uncertainty">${text}</span>`
        : text;
    })
    .join(" ");
}

// ── Button wiring ─────────────────────────────────────────────────────────────

function wireButtons(shadow: ShadowRoot, result: SummaryResult) {
  shadow.getElementById("btn-save")!.onclick = () => saveItem(result);
  shadow.getElementById("btn-compare")!.onclick = () => requestComparison(result);
  shadow.getElementById("btn-edit")!.onclick = () => requestEdits(result);
}

function wirePreferenceButtons(shadow: ShadowRoot) {
  const btnOrig = shadow.getElementById("prefer-original") as HTMLButtonElement;
  const btnCmp  = shadow.getElementById("prefer-comparison") as HTMLButtonElement;

  btnOrig.onclick = () => {
    savePreference("original");
    btnOrig.classList.add("chosen");
    btnOrig.textContent = "Preferred ✓";
    btnCmp.disabled = true;
  };

  btnCmp.onclick = () => {
    savePreference("comparison");
    btnCmp.classList.add("chosen");
    btnCmp.textContent = "Preferred ✓";
    btnOrig.disabled = true;
  };
}

async function saveItem(result: SummaryResult) {
  const stored = await chrome.storage.local.get("savedItems");
  const savedItems = Array.isArray(stored.savedItems) ? stored.savedItems : [];
  savedItems.push({ ...result, savedAt: Date.now() });
  await chrome.storage.local.set({ savedItems });

  const { shadow } = getOrCreateHost();
  const btn = shadow.getElementById("btn-save") as HTMLButtonElement;
  btn.textContent = "Saved ✓";
  btn.disabled = true;
}

async function savePreference(preferred: "original" | "comparison") {
  const stored = await chrome.storage.local.get("preferences");
  const preferences = Array.isArray(stored.preferences) ? stored.preferences : [];
  preferences.push({
    savedAt: Date.now(),
    preferred,
    original: originalResult,
    comparison: comparisonResult,
  });
  await chrome.storage.local.set({ preferences });
}

function requestComparison(result: SummaryResult) {
  chrome.runtime.sendMessage({ type: "COMPARE_REQUEST", source: result.source });

  // Optimistically set up the comparison panel while waiting
  showComparison({ source: result.source, summary: "", model: "…" });
}

function requestEdits(_result: SummaryResult) {
  // TODO step 8
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: ExtensionMessage) => {
  switch (msg.type) {
    case "STYLO_LOADING":         showLoading(); break;
    case "STYLO_ERROR":           showError(msg.message); break;
    case "SHOW_SUMMARY":          showSummary(msg.result); break;
    case "UPDATE_SCORE":          applyScores(msg.score); break;
    case "SHOW_COMPARISON":       showComparison(msg.result); break;
    case "UPDATE_COMPARISON_SCORE": applyComparisonScores(msg.score); break;
  }
});

// ── Util ──────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
