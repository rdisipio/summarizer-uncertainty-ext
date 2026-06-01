---
name: project-architecture
description: Core architectural decisions for Stylo browser extension + local server
metadata: 
  node_type: memory
  type: project
  originSessionId: a3c3c134-2b1c-44b3-9ac5-7ec4c8dc86f0
---

Stylo is a browser extension for uncertainty-aware text summarization, designed to generate an open human preference dataset as a byproduct of normal use.

**Target browser:** Chrome (Manifest V3)

**Stack:**
- Browser extension: TypeScript bundled with Vite (not Node.js — runs as browser JS, no Node built-ins)
- Local inference server: this repo (LoRA-Laplace uncertainty scoring, PyTorch/MPS)
- Text generation: OpenRouter API called from the background service worker
- Companion: website (initially), companion app later
- Data storage: `chrome.storage.local` for keys/preferences; local SQLite for saved items; opt-in sync for preference dataset

**Extension components:**
- **Background service worker:** registers context menu, calls OpenRouter and the scoring endpoint, sends results to content script
- **Content script:** injected into every page; renders a floating overlay (Shadow DOM to avoid style leakage) with the summary and action buttons
- **Settings page:** user enters their OpenRouter API key and scoring server token once; stored in `chrome.storage.local`

**UX flow:**
1. User highlights a paragraph, right-clicks → selects "Summarize"
2. Background worker calls OpenRouter (summary) + scoring endpoint (uncertainty)
3. Content script renders an overlay near the selection showing the summary
4. Overlay buttons: **Save**, **Compare models** (reruns with a second model, side-by-side → preference signal), **Suggest edits** (annotate or send back to LLM)

**API key handling:**
Both the OpenRouter key and the scoring server token are stored in `chrome.storage.local`. For personal/development builds, they are injected at build time from `.env` via Vite `define` (only the two specific keys — `OPENROUTER_API_KEY` and `HF_UNCERTAINTY_API_TOKEN` — are injected; other vars in `.env` are not touched). The keys end up in plaintext inside `dist/src/settings.js`.

> **Caveat:** this is acceptable for a personal extension loaded unpacked and never published. Before any public distribution (Chrome Web Store), remove the `define` injection from `vite.config.ts` and require users to enter their own keys manually in the settings form.

**Distribution:**
- Development: load unpacked via `chrome://extensions` (Developer mode), no account needed
- Production: publish to Chrome Web Store ($5 one-time developer fee, 1–3 day review)
- Beta testing: share unpacked folder directly; testers load it themselves in Developer mode

**Hosted fallback architecture (agreed):**
Extension tries `localhost` first. If no local server detected, falls back to a hosted API deployed on HuggingFace Spaces. Local server is an opt-in upgrade for privacy-conscious users, not a prerequisite.

The remote scoring server is deployed at `https://rdisipio-sentence-uncertainty.hf.space` (source: [rdisipio/summarizer-uncertainty-ml](https://github.com/rdisipio/summarizer-uncertainty-ml)). Example invocation:

```bash
curl -s -X POST "https://rdisipio-sentence-uncertainty.hf.space/score" \
  -H "Content-Type: application/json" \
  -H "X-Api-Token: <token>" \
  -d '{"source": "...", "summary": "...", "sample_count": 5, "seed": 0, "compute_consistency": false}'
```

**Why local server is architecturally necessary:**
The Laplace uncertainty scoring runs 20 posterior samples, each requiring weight perturbation + full teacher-forced forward pass through a seq2seq model (facebook/bart-base, planned upgrade to bart-large-xsum). This is PyTorch-native weight mutation — not exportable to ONNX or runnable in browser WASM.

**Data collection:**
- Low uncertainty → single summary, user accepts or edits spans → calibration/correction signal
- High uncertainty OR user requests → two alternative summaries shown side by side → pairwise preference signal ("I like this")
- Sensitivity threshold is user-tunable (bucketed, in Advanced options)
- Preference data is opt-in only; prompts are editable before sharing

**Why:** Original brief (Human Feedback Foundation) called for an Arena.ai-style platform, but engagement problem makes that unviable. Flipped to utility-first (summarize while browsing) with preference data as byproduct. Dieter Rams unobtrusiveness principle guides UX decisions.
