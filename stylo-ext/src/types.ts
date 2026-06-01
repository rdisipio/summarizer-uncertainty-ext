export interface SummaryResult {
  source: string;
  summary: string;
  model: string;
  style?: string;
}

export interface SentenceScore {
  sentence_index: number;
  sentence_text: string;
  uncertainty_score: number;
  uncertainty_band: "low" | "medium" | "high" | "very_high" | string;
  ambiguity_score: number;
  ambiguity_band: "low" | "medium" | "high" | "very_high" | string;
}

export interface ScoreResult {
  sentence_results: SentenceScore[];
  raw: unknown;
}

export type ExtensionMessage =
  | { type: "STYLO_LOADING" }
  | { type: "STYLO_ERROR"; message: string }
  | { type: "SHOW_SUMMARY"; result: SummaryResult }
  | { type: "UPDATE_SCORE"; score: ScoreResult }
  | { type: "COMPARE_REQUEST"; source: string; model: string }
  | { type: "SHOW_COMPARISON"; result: SummaryResult }
  | { type: "UPDATE_COMPARISON_SCORE"; score: ScoreResult }
  | { type: "SUGGEST_EDITS_REQUEST"; source: string; summary: string; model: string; style?: string; highUncertaintySentences: string[] }
  | { type: "SHOW_EDITS"; revised: string };
