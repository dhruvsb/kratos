// Per-token prices for cost telemetry.
// Prices are USD per 1M tokens. Update here (only here) when prices change;
// the eval report and the telemetry screen both compute cost from this table.
//
// ⚠️ PROVIDER: OpenAI (switched from Anthropic on 2026-07-19 — user has an
// OpenAI key, not an Anthropic one). See docs/PROJECT-SUMMARY-PHASE2.md §5.
//
// ⚠️ VERIFY BEFORE TRUSTING THE COST DASHBOARD: the two OpenAI model IDs and
// their prices below could not be confirmed live when this was written —
// check https://platform.openai.com/docs/pricing and https://platform.openai.com/docs/models
// and correct PARSE_MODEL_DEFAULT / PARSE_MODEL_MID and their MODEL_PRICES
// entries below if they've changed. Until you do, cost tracking may be wrong
// even though parsing itself works fine.

export const PARSE_MODEL_DEFAULT = 'gpt-4o-mini';
// Mid-tier model of the same provider, used by `npm run eval:compare`.
export const PARSE_MODEL_MID = 'gpt-4o';

export interface ModelPrice {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // ⚠️ Unverified as of 2026-07-19 — confirm at platform.openai.com/docs/pricing.
  'gpt-4o-mini': { inputUsdPerMTok: 0.15, outputUsdPerMTok: 0.6 },
  'gpt-4o': { inputUsdPerMTok: 2.5, outputUsdPerMTok: 10.0 },
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
