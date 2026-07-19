// Per-token prices for cost telemetry.
// Prices are USD per 1M tokens. Update here (only here) when prices change;
// the eval report and the telemetry screen both compute cost from this table.
//
// PROVIDER: OpenAI, GPT-5.6 family (GA 2026-07-09). Day-to-day parsing uses
// Luna (cheap, high-volume tier); the eval harness benchmarks it against Terra
// (mid tier) via `npm run eval:compare` to get a real accuracy-vs-cost number.
// Model IDs and prices below were verified against platform.openai.com /
// developers.openai.com pricing on 2026-07-19 — re-check there if they drift.

export const PARSE_MODEL_DEFAULT = 'gpt-5.6-luna';
// Mid-tier model of the same provider, used by `npm run eval:compare`.
export const PARSE_MODEL_MID = 'gpt-5.6-terra';

export interface ModelPrice {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // OpenAI GPT-5.6 family — verified 2026-07-19 (platform.openai.com/docs/pricing).
  'gpt-5.6-luna': { inputUsdPerMTok: 1.0, outputUsdPerMTok: 6.0 },
  'gpt-5.6-terra': { inputUsdPerMTok: 2.5, outputUsdPerMTok: 15.0 },
  // Kept in case you switch back to Anthropic later — see llm.ts (AnthropicLlm
  // is still there, unused, behind the same LlmClient interface).
  'claude-haiku-4-5': { inputUsdPerMTok: 1.0, outputUsdPerMTok: 5.0 },
  'claude-sonnet-5': { inputUsdPerMTok: 3.0, outputUsdPerMTok: 15.0 },
};

// Cost budget from the Phase 2 spec (₹2,000/month). Tracked telemetry is in
// USD (the LLM provider's billing currency), so this is an approximate
// conversion for the dashboard only — adjust USD_TO_INR if the actual rate
// drifts, or change MONTHLY_COST_BUDGET_INR if the target budget changes.
export const MONTHLY_COST_BUDGET_INR = 2000;
export const USD_TO_INR = 83;
export const MONTHLY_COST_BUDGET_USD = MONTHLY_COST_BUDGET_INR / USD_TO_INR;

export function costUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price = MODEL_PRICES[model];
  if (!price) return 0; // unknown model — log tokens, don't fake a cost
  return (
    (tokensIn * price.inputUsdPerMTok + tokensOut * price.outputUsdPerMTok) / 1_000_000
  );
}
