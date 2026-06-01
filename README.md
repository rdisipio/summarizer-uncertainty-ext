# Stylo

Browser extension for uncertainty-aware text summarization. Highlights sentences by confidence level and collects pairwise model preferences as a byproduct of normal use.

---

## Build

```bash
cd stylo-ext
npm install
npm run build
```

Output goes to `stylo-ext/dist/`.

---

## Load in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `stylo-ext/dist/` folder
5. Stylo appears in your extension list — pin it to the toolbar if you like

To reload after a rebuild: click the **refresh icon** on the Stylo card in `chrome://extensions`.

---

## First-time setup

1. Click the Stylo icon in the toolbar (or go to `chrome://extensions` → Stylo → **Details** → **Extension options**)
2. Enter your **OpenRouter API key**
3. Enter your **Scoring server token** (HF Spaces)
4. Optionally change the default or comparison model
5. Click **Save**

---

## Usage

1. Highlight any paragraph on a web page
2. Right-click → **Summarize with Stylo**
3. A panel appears in the bottom-right corner with the summary
4. Sentence highlights arrive ~10 seconds later — yellow = medium uncertainty, orange = high, red = very high
5. Use the action buttons:
   - **Save** — stores the summary locally
   - **Compare models** — generates a second summary with the alternative model side by side; click *I prefer this* on the one you like
   - **Suggest edits** — asks the same model to revise the summary; accept with *Use this* or discard

---

## Architecture

See [project_architecture.md](project_architecture.md) for design decisions and [build.md](build.md) for the full step-by-step build guide.
