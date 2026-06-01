declare const __OPENROUTER_API_KEY__: string;
declare const __HF_UNCERTAINTY_API_TOKEN__: string;

const DEFAULT_MODEL = "openai/gpt-4o-mini";

async function init() {
  const saved = await chrome.storage.local.get(["openrouterKey", "scoringToken", "openrouterModel"]);

  const keyInput = document.getElementById("openrouter-key") as HTMLInputElement;
  const tokenInput = document.getElementById("scoring-token") as HTMLInputElement;
  const modelInput = document.getElementById("openrouter-model") as HTMLInputElement;

  // Use saved value, then env-injected default, then empty
  keyInput.value = (saved.openrouterKey as string | undefined) ?? __OPENROUTER_API_KEY__ ?? "";
  tokenInput.value = (saved.scoringToken as string | undefined) ?? __HF_UNCERTAINTY_API_TOKEN__ ?? "";
  modelInput.value = (saved.openrouterModel as string | undefined) ?? DEFAULT_MODEL;

  const form = document.getElementById("settings-form") as HTMLFormElement;
  const status = document.getElementById("status") as HTMLDivElement;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    await chrome.storage.local.set({
      openrouterKey: keyInput.value.trim(),
      scoringToken: tokenInput.value.trim(),
      openrouterModel: modelInput.value.trim() || DEFAULT_MODEL,
    });
    status.style.display = "block";
    setTimeout(() => (status.style.display = "none"), 2000);
  });
}

init();
