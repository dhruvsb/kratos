// Per-token prices for cost telemetry.
// Prices are USD per 1M tokens. Update here (only here) when prices change;
// the eval report and the telemetry screen both compute cost from this table.
//
// PROVIDER: OpenAI, GPT-5.6 family (GA 2026-07-09) — re-confirmed 2026-08-13 as
// still the current generation (no successor family). Day-to-day parsing uses
// Luna (cheapest tier, and it supports structured outputs — the only hard
// requirement here); the eval harness benchmarks it against Terra (mid tier)
// via `npm run eval:compare` to get a real accuracy-vs-cost number.
//
// ⚠ PRICES WERE CUT ~80% ON 2026-07-30, after this file's original 2026-07-19
// verification. The old numbers ($1.00/$6.00 for Luna) overstated telemetry cost
// by 5x. Updated 2026-08-13 from public pricing aggregators; the 80% cut
// corroborates exactly ($1.00 → $0.20, $6.00 → $1.20). CONFIRM against your own
// platform.openai.com billing page before relying on these for budget maths.

export const PARSE_MODEL_DEFAULT = 'gpt-5.6-luna';
// Mid-tier model of the same provider, used by `npm run eval:compare`.
export const PARSE_MODEL_MID = 'gpt-5.6-terra';

// ASR (speech→text) model for the cloud transcription Edge Function — chosen by
// the 2026-08 bakeoff (see PROJECT-SUMMARY-PHASE2 §5). SET THE EXACT ID: the user
// specified the new "gpt-transcribe" model; adjust here if the platform id differs
// (e.g. 'gpt-4o-transcribe'). Transcription is billed per audio-minute, not per
// token, so it isn't in MODEL_PRICES / costUsd — cost tracking for ASR is the
// duration-based add-on below (asrCostUsd), tracked separately from parse telemetry
// and reported to Langfuse from the transcribe function.
export const ASR_MODEL = 'gpt-transcribe';

// ASR is billed per AUDIO-MINUTE, not per token. Placeholder rate — CONFIRM on
// platform.openai.com before trusting budget maths (gpt-4o-transcribe was
// ~$0.006/audio-minute at 2026-08; adjust when the gpt-transcribe rate is known).
export const ASR_USD_PER_MINUTE = 0.006;

// Cost of one transcription from the client-reported clip duration. Duration comes
// from the recorder (it owns the wall-clock timer), not from decoding the audio
// container server-side. Returns 0 when duration is unknown so telemetry still logs.
export function asrCostUsd(durationMs: number | null | undefined): number {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return (durationMs / 60_000) * ASR_USD_PER_MINUTE;
}

export interface ModelPrice {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // OpenAI GPT-5.6 family — updated 2026-08-13 after the 2026-07-30 price cut.
  'gpt-5.6-luna': { inputUsdPerMTok: 0.2, outputUsdPerMTok: 1.2 },
  'gpt-5.6-terra': { inputUsdPerMTok: 2.0, outputUsdPerMTok: 12.0 },
  'gpt-5.6-sol': { inputUsdPerMTok: 5.0, outputUsdPerMTok: 30.0 },
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
