declare const __OPENROUTER_API_KEY__: string;
declare const __HF_UNCERTAINTY_API_TOKEN__: string;

const DEFAULT_MODEL        = "google/gemini-2.5-flash-lite";
const DEFAULT_COMPARE_MODEL = "openai/gpt-oss-20b";
const DEFAULT_SCORING_URL  = "https://rdisipio-sentence-uncertainty.hf.space/score";
const DEFAULT_SAMPLE_COUNT = 10;

async function init() {
  const saved = await chrome.storage.local.get([
    "openrouterKey", "scoringToken", "openrouterModel", "compareModel",
    "scoringUrl", "sampleCount",
  ]);

  const keyInput     = document.getElementById("openrouter-key") as HTMLInputElement;
  const tokenInput   = document.getElementById("scoring-token") as HTMLInputElement;
  const modelInput   = document.getElementById("openrouter-model") as HTMLInputElement;
  const compareInput = document.getElementById("compare-model") as HTMLInputElement;
  const urlInput     = document.getElementById("scoring-url") as HTMLInputElement;
  const countInput   = document.getElementById("sample-count") as HTMLInputElement;

  keyInput.value     = (saved.openrouterKey as string | undefined) ?? __OPENROUTER_API_KEY__ ?? "";
  tokenInput.value   = (saved.scoringToken as string | undefined) ?? __HF_UNCERTAINTY_API_TOKEN__ ?? "";
  modelInput.value   = (saved.openrouterModel as string | undefined) ?? DEFAULT_MODEL;
  compareInput.value = (saved.compareModel as string | undefined) ?? DEFAULT_COMPARE_MODEL;
  urlInput.value     = (saved.scoringUrl as string | undefined) ?? DEFAULT_SCORING_URL;
  countInput.value   = String((saved.sampleCount as number | undefined) ?? DEFAULT_SAMPLE_COUNT);

  const form   = document.getElementById("settings-form") as HTMLFormElement;
  const status = document.getElementById("status") as HTMLDivElement;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await chrome.storage.local.set({
      openrouterKey:   keyInput.value.trim(),
      scoringToken:    tokenInput.value.trim(),
      openrouterModel: modelInput.value.trim() || DEFAULT_MODEL,
      compareModel:    compareInput.value.trim() || DEFAULT_COMPARE_MODEL,
      scoringUrl:      urlInput.value.trim() || DEFAULT_SCORING_URL,
      sampleCount:     parseInt(countInput.value, 10) || DEFAULT_SAMPLE_COUNT,
    });
    status.style.display = "block";
    setTimeout(() => (status.style.display = "none"), 2000);
  });
}

init();
