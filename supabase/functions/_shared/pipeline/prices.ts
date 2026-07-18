// Per-token prices for cost telemetry.
// Source: https://platform.claude.com/docs/en/pricing.md (checked 2026-07-18).
// Prices are USD per 1M tokens. Update here (only here) when prices change;
// the eval report and the telemetry screen both compute cost from this table.

export const PARSE_MODEL_DEFAULT = 'claude-haiku-4-5';
// Mid-tier model of the same provider, used by `npm run eval:compare`.
export const PARSE_MODEL_MID = 'claude-sonnet-5';

export interface ModelPrice {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-haiku-4-5': { inputUsdPerMTok: 1.0, outputUsdPerMTok: 5.0 },
  // Sonnet 5 sticker price $3/$15; introductory $2/$10 through 2026-08-31.
  // We track at sticker price so budgets don't break when the intro ends.
  'claude-sonnet-5': { inputUsdPerMTok: 3.0, outputUsdPerMTok: 15.0 },
};

export function costUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price = MODEL_PRICES[model];
  if (!price) return 0; // unknown model — log tokens, don't fake a cost
  return (
    (tokensIn * price.inputUsdPerMTok + tokensOut * price.outputUsdPerMTok) / 1_000_000
  );
}
