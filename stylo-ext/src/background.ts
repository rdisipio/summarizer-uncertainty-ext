import type { SummaryResult } from "./types";

const SCORING_URL = "https://rdisipio-sentence-uncertainty.hf.space/score";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "summarize",
    title: "Summarize with Stylo",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "summarize" || !tab?.id) return;

  const text = info.selectionText?.trim();
  if (!text) return;

  const { openrouterKey, scoringToken, openrouterModel } =
    await chrome.storage.local.get(["openrouterKey", "scoringToken", "openrouterModel"]);

  if (!openrouterKey || !scoringToken) {
    chrome.tabs.sendMessage(tab.id, {
      type: "STYLO_ERROR",
      message: "API keys not configured. Open Stylo settings to add them.",
    });
    return;
  }

  const model = (openrouterModel as string | undefined) ?? "openai/gpt-4o-mini";

  chrome.tabs.sendMessage(tab.id, { type: "STYLO_LOADING" });

  try {
    const summary = await fetchSummary(text, model, openrouterKey as string);
    const score = await fetchScore(text, summary, scoringToken as string);

    const result: SummaryResult = { source: text, summary, score, model };
    chrome.tabs.sendMessage(tab.id, { type: "SHOW_SUMMARY", result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    chrome.tabs.sendMessage(tab.id, { type: "STYLO_ERROR", message });
  }
});

async function fetchSummary(text: string, model: string, apiKey: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You are a concise summarizer. Return only the summary, no preamble.",
        },
        {
          role: "user",
          content: `Summarize the following text:\n\n${text}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

async function fetchScore(source: string, summary: string, token: string): Promise<unknown> {
  const res = await fetch(SCORING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Token": token,
    },
    body: JSON.stringify({
      source,
      summary,
      sample_count: 5,
      seed: 0,
      compute_consistency: false,
    }),
  });

  if (!res.ok) throw new Error(`Scoring error: ${res.status} ${res.statusText}`);
  return res.json();
}
