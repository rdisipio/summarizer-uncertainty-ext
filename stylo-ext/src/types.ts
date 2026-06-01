export interface SummaryResult {
  source: string;
  summary: string;
  model: string;
}

export interface ScoreResult {
  scores: number[];       // per-sentence uncertainty scores
  raw: unknown;           // full response from scoring endpoint
}

export type ExtensionMessage =
  | { type: "STYLO_LOADING" }
  | { type: "STYLO_ERROR"; message: string }
  | { type: "SHOW_SUMMARY"; result: SummaryResult }
  | { type: "UPDATE_SCORE"; score: ScoreResult }
  | { type: "COMPARE_REQUEST"; source: string; model: string }
  | { type: "SHOW_COMPARISON"; result: SummaryResult }
  | { type: "UPDATE_COMPARISON_SCORE"; score: ScoreResult };
