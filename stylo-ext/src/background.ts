import type { ScoreResult, SentenceScore, SummaryResult } from "./types";

const LOCAL_SCORING_URL  = "http://localhost:7860/score";
const REMOTE_SCORING_URL = "https://rdisipio-sentence-uncertainty.hf.space/score";
const LOCAL_TIMEOUT_MS   = 2000;

// chrome.tabs.sendMessage rejects if the content script isn't loaded yet
// (e.g. tab was open before the extension was installed/reloaded). Safe to ignore.
function sendToTab(tabId: number, msg: unknown) {
  chrome.tabs.sendMessage(tabId, msg).catch((err: Error) => {
    if (!err.message.includes("Receiving end does not exist")) throw err;
  });
}

type SummaryStyle = "shorten" | "professional" | "informal";

const STYLE_PROMPTS: Record<SummaryStyle, string> = {
  shorten:      "Summarize this text as concisely as possible, keeping only the most essential information. Return only the summary.",
  professional: "Summarize this text in a clear, professional tone suitable for a business context. Return only the summary.",
  informal:     "Summarize this text in a casual, conversational tone. Return only the summary.",
};

const MENU_ITEMS: { id: SummaryStyle; title: string }[] = [
  { id: "shorten",      title: "Shorten" },
  { id: "professional", title: "Professional style" },
  { id: "informal",     title: "Informal style" },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "stylo-parent",
    title: "Summarize with Stylo",
    contexts: ["selection"],
  });
  for (const item of MENU_ITEMS) {
    chrome.contextMenus.create({
      id: item.id,
      parentId: "stylo-parent",
      title: item.title,
      contexts: ["selection"],
    });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const style = info.menuItemId as SummaryStyle;
  if (!STYLE_PROMPTS[style] || !tab?.id) return;

  const text = info.selectionText?.trim();
  if (!text) return;

  const { openrouterKey, scoringToken, openrouterModel } =
    await chrome.storage.local.get(["openrouterKey", "scoringToken", "openrouterModel"]);

  if (!openrouterKey || !scoringToken) {
    sendToTab(tab.id, {
      type: "STYLO_ERROR",
      message: "API keys not configured. Open Stylo settings to add them.",
    });
    return;
  }

  const model = (openrouterModel as string | undefined) ?? "google/gemini-2.5-flash-lite";

  sendToTab(tab.id, { type: "STYLO_LOADING" });

  let summary: string;
  try {
    summary = await fetchSummary(text, model, openrouterKey as string, STYLE_PROMPTS[style]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    sendToTab(tab.id, { type: "STYLO_ERROR", message });
    return;
  }

  const result: SummaryResult = { source: text, summary, model, style };
  sendToTab(tab.id, { type: "SHOW_SUMMARY", result });

  fetchScore(text, summary, scoringToken as string)
    .then((score) => {
      sendToTab(tab.id!, { type: "UPDATE_SCORE", score });
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : "Scoring failed";
      sendToTab(tab.id!, { type: "STYLO_ERROR", message });
    });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!sender.tab?.id) return;
  if (msg.type === "COMPARE_REQUEST") {
    handleCompareRequest(msg.source as string, sender.tab.id);
  }
  if (msg.type === "REGEN_LEFT_REQUEST") {
    handleRegenLeft(msg.source as string, msg.style as string | undefined, sender.tab.id);
  }
  if (msg.type === "RESCORE_REQUEST") {
    chrome.storage.local.get("scoringToken").then(({ scoringToken }) =>
      fetchScore(msg.source as string, msg.summary as string, scoringToken as string)
        .then((score) => sendToTab(sender.tab!.id!, { type: "UPDATE_SCORE", score }))
        .catch(() => { /* non-fatal */ })
    );
  }
  if (msg.type === "SUGGEST_EDITS_REQUEST") {
    handleSuggestEdits(
      msg.source as string,
      msg.summary as string,
      msg.model as string,
      msg.style as string | undefined,
      msg.highUncertaintySentences as string[],
      sender.tab.id,
    );
  }
});

async function handleRegenLeft(source: string, style: string | undefined, tabId: number) {
  const { openrouterKey, scoringToken, openrouterModel } =
    await chrome.storage.local.get(["openrouterKey", "scoringToken", "openrouterModel"]);

  const model = (openrouterModel as string | undefined) ?? "google/gemini-2.5-flash-lite";
  const stylePrompt = style ? STYLE_PROMPTS[style as SummaryStyle] : undefined;

  let summary: string;
  try {
    summary = await fetchSummary(source, model, openrouterKey as string, stylePrompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regeneration failed";
    sendToTab(tabId, { type: "STYLO_ERROR", message });
    return;
  }

  const result: SummaryResult = { source, summary, model, style };
  sendToTab(tabId, { type: "SHOW_REGEN_LEFT", result });

  fetchScore(source, summary, scoringToken as string)
    .then((score) => sendToTab(tabId, { type: "UPDATE_SCORE", score }))
    .catch(() => { /* non-fatal */ });
}

async function handleCompareRequest(source: string, tabId: number) {
  const { openrouterKey, scoringToken, compareModel } =
    await chrome.storage.local.get(["openrouterKey", "scoringToken", "compareModel"]);

  const model = (compareModel as string | undefined) ?? "openai/gpt-oss-20b";

  let summary: string;
  try {
    summary = await fetchSummary(source, model, openrouterKey as string);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Comparison failed";
    sendToTab(tabId, { type: "STYLO_ERROR", message });
    return;
  }

  const result: SummaryResult = { source, summary, model };
  sendToTab(tabId, { type: "SHOW_COMPARISON", result });

  fetchScore(source, summary, scoringToken as string)
    .then((score) => {
      sendToTab(tabId, { type: "UPDATE_COMPARISON_SCORE", score });
    })
    .catch(() => { /* scoring failure is non-fatal for comparison */ });
}

async function handleSuggestEdits(
  source: string,
  summary: string,
  model: string,
  style: string | undefined,
  highUncertaintySentences: string[],
  tabId: number,
) {
  const { openrouterKey } = await chrome.storage.local.get("openrouterKey");

  let revised: string;
  try {
    revised = await fetchEdits(source, summary, model, style, highUncertaintySentences, openrouterKey as string);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edits failed";
    sendToTab(tabId, { type: "STYLO_ERROR", message });
    return;
  }

  sendToTab(tabId, { type: "SHOW_EDITS", revised });
}

async function fetchEdits(
  source: string,
  summary: string,
  model: string,
  style: string | undefined,
  highUncertaintySentences: string[],
  apiKey: string,
): Promise<string> {
  const styleClause = style
    ? `The summary was written in a "${style}" style. You must preserve this style exactly — do not make it more formal, more casual, or change its tone in any way.`
    : "Preserve the tone and style of the original summary exactly.";

  const targetClause = highUncertaintySentences.length > 0
    ? `Revise only the following sentences, which were flagged as high uncertainty:\n${highUncertaintySentences.map((s) => `- ${s}`).join("\n")}\n\nAll other sentences must remain word-for-word identical.`
    : "Revise any sentences that seem factually uncertain or imprecise.";

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
          content: `You are a precise editor. ${styleClause} Return the complete revised summary only — no explanation, no preamble, no formatting.`,
        },
        {
          role: "user",
          content: `Source text:\n${source}\n\nSummary:\n${summary}\n\n${targetClause}`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

async function fetchSummary(text: string, model: string, apiKey: string, stylePrompt?: string): Promise<string> {
  const systemPrompt = stylePrompt ?? "Summarize this text concisely. Return only the summary, no preamble.";
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: text },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

async function fetchScore(source: string, summary: string, token: string): Promise<ScoreResult> {
  const body = JSON.stringify({
    source,
    summary,
    sample_count: 10,
    seed: 0,
    compute_consistency: false,
  });

  // Try local Docker server first; fall back to remote on any failure or timeout
  const res = await fetchScoreFrom(LOCAL_SCORING_URL, token, body, LOCAL_TIMEOUT_MS)
    .catch(() => fetchScoreFrom(REMOTE_SCORING_URL, token, body));

  if (!res.ok) throw new Error(`Scoring error: ${res.status} ${res.statusText}`);
  const raw = await res.json();

  const sentence_results: SentenceScore[] = Array.isArray(raw?.sentence_results)
    ? (raw.sentence_results as SentenceScore[])
    : [];

  return { sentence_results, raw };
}

async function fetchScoreFrom(url: string, token: string, body: string, timeoutMs?: number): Promise<Response> {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = timeoutMs && controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Token": token },
      body,
      signal: controller?.signal,
    });
    return res;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
