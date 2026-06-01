import type { ScoreResult, SentenceScore, SummaryResult } from "./types";

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

  const model = (openrouterModel as string | undefined) ?? "google/gemini-2.5-flash-lite";

  chrome.tabs.sendMessage(tab.id, { type: "STYLO_LOADING" });

  let summary: string;
  try {
    summary = await fetchSummary(text, model, openrouterKey as string);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    chrome.tabs.sendMessage(tab.id, { type: "STYLO_ERROR", message });
    return;
  }

  // Show summary immediately — don't wait for scoring
  const result: SummaryResult = { source: text, summary, model };
  chrome.tabs.sendMessage(tab.id, { type: "SHOW_SUMMARY", result });

  // Fetch score in background; send when ready (~10s)
  fetchScore(text, summary, scoringToken as string)
    .then((score) => {
      chrome.tabs.sendMessage(tab.id!, { type: "UPDATE_SCORE", score });
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : "Scoring failed";
      chrome.tabs.sendMessage(tab.id!, { type: "STYLO_ERROR", message });
    });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "COMPARE_REQUEST" && sender.tab?.id) {
    handleCompareRequest(msg.source as string, sender.tab.id);
  }
});

async function handleCompareRequest(source: string, tabId: number) {
  const { openrouterKey, scoringToken, compareModel } =
    await chrome.storage.local.get(["openrouterKey", "scoringToken", "compareModel"]);

  const model = (compareModel as string | undefined) ?? "openai/gpt-oss-20b";

  let summary: string;
  try {
    summary = await fetchSummary(source, model, openrouterKey as string);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Comparison failed";
    chrome.tabs.sendMessage(tabId, { type: "STYLO_ERROR", message });
    return;
  }

  const result: SummaryResult = { source, summary, model };
  chrome.tabs.sendMessage(tabId, { type: "SHOW_COMPARISON", result });

  fetchScore(source, summary, scoringToken as string)
    .then((score) => {
      chrome.tabs.sendMessage(tabId, { type: "UPDATE_COMPARISON_SCORE", score });
    })
    .catch(() => { /* scoring failure is non-fatal for comparison */ });
}

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

async function fetchScore(source: string, summary: string, token: string): Promise<ScoreResult> {
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
  const raw = await res.json();

  const sentence_results: SentenceScore[] = Array.isArray(raw?.sentence_results)
    ? (raw.sentence_results as SentenceScore[])
    : [];

  return { sentence_results, raw };
}
