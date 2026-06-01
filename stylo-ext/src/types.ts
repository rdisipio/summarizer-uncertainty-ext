export interface SummaryResult {
  source: string;
  summary: string;
  score: unknown;
  model: string;
}

export type ExtensionMessage =
  | { type: "STYLO_LOADING" }
  | { type: "STYLO_ERROR"; message: string }
  | { type: "SHOW_SUMMARY"; result: SummaryResult }
  | { type: "COMPARE_REQUEST"; source: string; model: string }
  | { type: "SHOW_COMPARISON"; result: SummaryResult };
