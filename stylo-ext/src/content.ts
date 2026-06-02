import type { ExtensionMessage, ScoreResult, SummaryResult } from "./types";

const HOST_ID = "pocket-stylo-root";

const BAND_CLASS: Record<string, string> = {
  low: "",
  mid: "unc-medium",
  high: "unc-high",
};

const BAND_LABEL: Record<string, string> = {
  low: "low",
  mid: "mid",
  high: "high",
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
        background: #f3f2eb;
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
        border: 1px solid #e8dfc8;
        border-radius: 8px;
        padding: 10px;
        background: #f3f2eb;
      }
      .compare-col.preferred { border-color: #4caf50; background: #f4fbf0; }
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

      .unc-medium    { background: #ffe066; border-radius: 3px; padding: 0 2px; }
      .unc-high      { background: #ffd6a5; border-radius: 3px; padding: 0 2px; }

      /* Clickable sentences (after scoring) */
      .sentence { cursor: pointer; border-radius: 3px; position: relative; }
      .sentence:hover { outline: 1px dashed #bbb; }
      .sentence.user-flagged { outline: 2px solid #7c3aed; background: #f5f3ff; padding: 0 2px; }

      /* Uncertainty tooltip */
      .sentence::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: calc(100% + 5px);
        left: 50%;
        transform: translateX(-50%);
        background: #2c2c2c;
        color: #f5f5f5;
        font-size: 11px;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.12s ease;
        z-index: 10;
      }
      .sentence:hover::after { opacity: 1; }

      /* Suggest edits panel */
      .edits-panel {
        display: none;
        margin-top: 12px;
        border-top: 1px solid #eee;
        padding-top: 12px;
      }
      .edits-panel.visible { display: block; }
      .edits-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .edits-label { font-size: 11px; font-weight: 600; color: #888; }
      .btn-regen {
        background: none; border: none; cursor: pointer; font-size: 14px;
        color: #aaa; padding: 0; line-height: 1;
      }
      .btn-regen:hover { color: #555; }
      .edits-body { line-height: 1.6; font-size: 14px; margin-bottom: 10px; }
      .edited-sentence { outline: 1px dashed #bbb; border-radius: 3px; padding: 0 2px; }
      .edits-actions { display: flex; gap: 8px; }
      .edits-actions button {
        padding: 5px 12px; border-radius: 6px; border: 1px solid #ddd;
        background: #fafafa; cursor: pointer; font-size: 12px; color: #333;
      }
      .edits-actions button:hover { background: #f0f0f0; }
    </style>
    <div class="panel" id="panel">
      <div class="header">
        <span class="title">PocketStylo</span>
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
      <div class="edits-panel" id="edits-panel">
        <div class="edits-header">
          <span class="edits-label">Suggested revision</span>
          <button class="btn-regen" id="btn-regen" title="Regenerate">↺</button>
        </div>
        <div class="edits-body" id="edits-body"></div>
        <div class="edits-actions">
          <button id="btn-use-edits">Use this</button>
          <button id="btn-discard-edits">Discard</button>
        </div>
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
let lastOriginalScore: ScoreResult | null = null;
let originalScoreStale = false;
let preferredSide: "left" | "right" | null = null;
const userSelectedSentences = new Set<string>();

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
  lastOriginalScore = null;
  originalScoreStale = false;
  preferredSide = null;
  userSelectedSentences.clear();
  const { shadow } = getOrCreateHost();
  shadow.getElementById("panel")!.classList.remove("comparing");
  shadow.getElementById("compare-grid")!.classList.remove("visible");
  shadow.getElementById("body")!.textContent = result.summary;
  shadow.getElementById("body")!.style.display = "block";
  shadow.getElementById("actions")!.style.display = "flex";
  shadow.getElementById("scoring-note")!.style.display = "block";
  shadow.getElementById("edits-panel")!.classList.remove("visible");
  const label = result.style ? `PocketStylo — ${result.style}` : "PocketStylo";
  shadow.querySelector(".title")!.textContent = label;
  wireButtons(shadow, result);
}

function applyScores(score: ScoreResult) {
  lastOriginalScore = score;
  originalScoreStale = false;
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
  if (result.summary) comparisonResult = result; // only set when real content arrives, not the optimistic placeholder
  const { shadow } = getOrCreateHost();

  // Switch to comparing layout
  shadow.getElementById("panel")!.classList.add("comparing");
  shadow.getElementById("body")!.style.display = "none";
  shadow.getElementById("scoring-note")!.style.display = "none";

  const grid = shadow.getElementById("compare-grid")!;
  grid.classList.add("visible");

  // Populate original column with the current accepted summary
  shadow.getElementById("badge-original")!.textContent = originalResult?.model ?? "";
  const bodyOriginal = shadow.getElementById("body-original")!;
  const origScoring = shadow.getElementById("scoring-original") as HTMLElement;
  if (lastOriginalScore && !originalScoreStale) {
    // Score is valid — show highlights
    applyHighlights(bodyOriginal, lastOriginalScore);
    origScoring.style.display = "none";
  } else if (!originalScoreStale) {
    // Score hasn't arrived yet — show text and wait
    bodyOriginal.textContent = originalResult?.summary ?? "";
    origScoring.style.display = "block";
  } else {
    // Score was invalidated by an accepted edit — show accepted text, no spinner
    bodyOriginal.textContent = originalResult?.summary ?? "";
    origScoring.style.display = "none";
  }

  // Reset preference buttons for this round
  const btnOrig = shadow.getElementById("prefer-original") as HTMLButtonElement;
  const btnCmp  = shadow.getElementById("prefer-comparison") as HTMLButtonElement;
  for (const btn of [btnOrig, btnCmp]) {
    btn.textContent = "I prefer this";
    btn.disabled = false;
    btn.classList.remove("chosen");
  }
  shadow.getElementById("col-original")!.classList.remove("preferred");
  shadow.getElementById("col-comparison")!.classList.remove("preferred");

  // Populate comparison column — disable prefer button until real content arrives
  shadow.getElementById("badge-comparison")!.textContent = result.model || "…";
  if (result.summary) {
    shadow.getElementById("body-comparison")!.textContent = result.summary;
    btnCmp.disabled = false;
  } else {
    shadow.getElementById("body-comparison")!.innerHTML = '<span class="spinner"></span>Generating…';
    btnCmp.disabled = true;
  }
  const cmpScoring = shadow.getElementById("scoring-comparison") as HTMLElement;
  cmpScoring.style.display = result.summary ? "block" : "none";

  wirePreferenceButtons(shadow);
}

function showRegenLeft(result: SummaryResult) {
  const { shadow } = getOrCreateHost();

  // Ensure compare grid is visible
  shadow.getElementById("panel")!.classList.add("comparing");
  shadow.getElementById("body")!.style.display = "none";
  shadow.getElementById("scoring-note")!.style.display = "none";
  shadow.getElementById("compare-grid")!.classList.add("visible");

  // Reset preference buttons
  const btnOrig = shadow.getElementById("prefer-original") as HTMLButtonElement;
  const btnCmp  = shadow.getElementById("prefer-comparison") as HTMLButtonElement;
  for (const btn of [btnOrig, btnCmp]) {
    btn.textContent = "I prefer this";
    btn.disabled = false;
    btn.classList.remove("chosen");
  }

  // LEFT column gets the new generation
  shadow.getElementById("badge-original")!.textContent = result.model || "…";
  const bodyOriginal = shadow.getElementById("body-original")!;
  const origScoring  = shadow.getElementById("scoring-original") as HTMLElement;
  if (result.summary) {
    bodyOriginal.textContent = result.summary;
    origScoring.style.display = "none";
    btnOrig.disabled = false;
  } else {
    bodyOriginal.innerHTML = '<span class="spinner"></span>Generating…';
    origScoring.style.display = "none";
    btnOrig.disabled = true;
  }

  // RIGHT column keeps the current preferred text untouched
  // (comparisonResult / originalResult already hold it; badge+body were set in previous round)

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
      const bandCls = BAND_CLASS[s.uncertainty_band] ?? "";
      const userCls = userSelectedSentences.has(s.sentence_text) ? " user-flagged" : "";
      const cls = ["sentence", bandCls, userCls].filter(Boolean).join(" ");
      const text = escapeHtml(s.sentence_text);
      const bandLabel = BAND_LABEL[s.uncertainty_band] ?? s.uncertainty_band;
      const score_label = s.uncertainty_score != null
        ? `Uncertainty: ${bandLabel} (${Math.round(s.uncertainty_score)}%)`
        : `Uncertainty: ${bandLabel}`;
      return `<span class="${cls}" data-sentence="${escapeHtml(s.sentence_text)}" data-tooltip="${escapeHtml(score_label)}">${text}</span>`;
    })
    .join(" ");

  el.querySelectorAll<HTMLSpanElement>(".sentence").forEach((span) => {
    span.addEventListener("click", () => {
      const text = span.dataset.sentence ?? "";
      if (userSelectedSentences.has(text)) {
        userSelectedSentences.delete(text);
        span.classList.remove("user-flagged");
      } else {
        userSelectedSentences.add(text);
        span.classList.add("user-flagged");
      }
    });
  });
}

// ── Button wiring ─────────────────────────────────────────────────────────────

function wireButtons(shadow: ShadowRoot, _initial: SummaryResult) {
  // Always read originalResult at click time so edits approved via "Use this" are reflected
  shadow.getElementById("btn-save")!.onclick    = () => originalResult && saveItem(originalResult);
  shadow.getElementById("btn-compare")!.onclick = () => originalResult && requestComparison(originalResult);
  shadow.getElementById("btn-edit")!.onclick    = () => originalResult && requestEdits(originalResult);
}

function wirePreferenceButtons(shadow: ShadowRoot) {
  const btnOrig = shadow.getElementById("prefer-original") as HTMLButtonElement;
  const btnCmp  = shadow.getElementById("prefer-comparison") as HTMLButtonElement;

  btnOrig.onclick = () => {
    savePreference("original");
    preferredSide = "left";
    btnOrig.classList.add("chosen");
    btnOrig.textContent = "Preferred ✓";
    btnCmp.disabled = true;
  };

  btnCmp.onclick = () => {
    savePreference("comparison");
    preferredSide = "right";
    btnCmp.classList.add("chosen");
    btnCmp.textContent = "Preferred ✓";
    btnOrig.disabled = true;
    // The preferred text stays on the right — update originalResult so
    // Save / Suggest edits operate on it, but don't rearrange the columns
    if (comparisonResult) {
      originalResult = { ...comparisonResult };
      lastOriginalScore = null;
      originalScoreStale = true;
    }
  };
}

async function saveItem(result: SummaryResult) {
  const stored = await chrome.storage.local.get("savedItems");
  const savedItems = Array.isArray(stored.savedItems) ? stored.savedItems : [];
  savedItems.push({ ...result, savedAt: Date.now() });
  await chrome.storage.local.set({ savedItems });

  const { host, shadow } = getOrCreateHost();
  const btn = shadow.getElementById("btn-save") as HTMLButtonElement;
  btn.textContent = "Saved ✓";
  btn.disabled = true;
  btn.style.background = "#4caf50";
  btn.style.color = "#fff";
  btn.style.borderColor = "#4caf50";

  setTimeout(() => host.remove(), 2000);
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
  if (preferredSide === "right") {
    // Preferred text is on the right — regenerate the LEFT with the default model
    chrome.runtime.sendMessage({ type: "REGEN_LEFT_REQUEST", source: result.source, style: result.style });
    showRegenLeft({ source: result.source, summary: "", model: "…" });
  } else {
    // Normal flow — regenerate the RIGHT with the compare model
    chrome.runtime.sendMessage({ type: "COMPARE_REQUEST", source: result.source });
    showComparison({ source: result.source, summary: "", model: "…" });
  }
}

function requestEdits(result: SummaryResult) {
  const { shadow } = getOrCreateHost();
  shadow.getElementById("edits-body")!.innerHTML = '<span class="spinner"></span>Revising…';
  shadow.getElementById("edits-panel")!.classList.add("visible");

  const highUncertaintySentences = [
    ...(lastOriginalScore?.sentence_results ?? [])
      .filter((s) => s.uncertainty_band === "high")
      .map((s) => s.sentence_text),
    ...userSelectedSentences,
  ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

  chrome.runtime.sendMessage({
    type: "SUGGEST_EDITS_REQUEST",
    source: result.source,
    summary: result.summary,
    model: result.model,
    style: result.style,
    highUncertaintySentences,
  });
}

function collapseToSingleView(text: string, style?: string) {
  const { shadow } = getOrCreateHost();
  shadow.getElementById("panel")!.classList.remove("comparing");
  shadow.getElementById("compare-grid")!.classList.remove("visible");
  shadow.getElementById("edits-panel")!.classList.remove("visible");
  const body = shadow.getElementById("body")!;
  body.textContent = text;
  body.style.display = "block";
  shadow.getElementById("actions")!.style.display = "flex";
  const label = style ? `PocketStylo — ${style}` : "PocketStylo";
  shadow.querySelector(".title")!.textContent = label;

  // Re-score the accepted text so sentence spans and click handlers come back
  if (originalResult) {
    shadow.getElementById("scoring-note")!.style.display = "block";
    chrome.runtime.sendMessage({
      type: "RESCORE_REQUEST",
      source: originalResult.source,
      summary: text,
    });
  } else {
    shadow.getElementById("scoring-note")!.style.display = "none";
  }
}

function showEdits(revised: string) {
  const { shadow } = getOrCreateHost();
  const body = shadow.getElementById("edits-body")!;

  const originalSentences = new Set(splitSentences(originalResult?.summary ?? ""));
  const html = splitSentences(revised)
    .map((s) =>
      originalSentences.has(s)
        ? escapeHtml(s)
        : `<span class="edited-sentence">${escapeHtml(s)}</span>`,
    )
    .join(" ");
  body.innerHTML = html;

  shadow.getElementById("btn-regen")!.onclick = () => {
    if (originalResult) requestEdits(originalResult);
  };

  shadow.getElementById("btn-use-edits")!.onclick = () => {
    if (originalResult) originalResult = { ...originalResult, summary: revised };
    lastOriginalScore = null;
    originalScoreStale = true;
    comparisonResult = null;
    preferredSide = null;
    collapseToSingleView(revised, originalResult?.style);
  };

  shadow.getElementById("btn-discard-edits")!.onclick = () => {
    shadow.getElementById("edits-panel")!.classList.remove("visible");
  };
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text.trim()];
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: ExtensionMessage) => {
  switch (msg.type) {
    case "STYLO_LOADING":         showLoading(); break;
    case "STYLO_ERROR":           showError(msg.message); break;
    case "SHOW_SUMMARY":          showSummary(msg.result); break;
    case "UPDATE_SCORE":          applyScores(msg.score); break;
    case "SHOW_COMPARISON":         showComparison(msg.result); break;
    case "UPDATE_COMPARISON_SCORE": applyComparisonScores(msg.score); break;
    case "SHOW_REGEN_LEFT": {
      showRegenLeft(msg.result);
      // Update left column originalResult so Save/Suggest edits stay consistent
      originalResult = { ...msg.result };
      lastOriginalScore = null;
      originalScoreStale = true;
      preferredSide = null; // reset — fresh comparison round
      break;
    }
    case "SHOW_EDITS":              showEdits(msg.revised); break;
  }
});

// ── Util ──────────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
