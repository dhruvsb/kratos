// LLM-as-judge: does the structured parse faithfully represent the transcript?
//
// This is the quality signal that raw telemetry (latency/cost/tokens) can't give
// you — a parse can be fast and cheap and still be WRONG (invented a set, misheard
// 80→18kg, logged sets when the user was creating a routine). The judge grades the
// (transcript → parsed JSON) pair on a 0–1 faithfulness scale, which the caller
// attaches to the Langfuse trace as a `faithfulness` score so you can watch parse
// quality over time and drill into the low-scoring traces.
//
// It reuses the pipeline's own LlmClient seam (same provider isolation as the parse
// itself), so there is no second SDK and swapping the judge model is one env var.
// Runs OFF the request's hot path — the parse-utterance function schedules it as a
// background task so it never adds latency to the user's response.
import type { LlmClient } from '../pipeline/llm.ts';
import type { ParseResult } from '../parse-types.ts';

export interface FaithfulnessJudgement {
  /** Blunt pass/fail for alerting; `score` is the graded version. */
  faithful: boolean;
  /** 0–1, clamped. 1 = every logged value is supported by the transcript. */
  score: number;
  /** Concrete, short defects ("logged 3 sets, transcript said 2"). */
  issues: string[];
  /** One-line justification, surfaced as the Langfuse score comment. */
  reasoning: string;
  /** Judge-call token usage, for its own cost line in Langfuse. */
  usage: { inputTokens: number; outputTokens: number };
}

// Strict structured-output contract for the judge (same mechanism the parse uses).
const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    faithful: { type: 'boolean' },
    score: { type: 'number' },
    issues: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['faithful', 'score', 'issues', 'reasoning'],
} as const;

const JUDGE_SYSTEM = `You grade a workout-logging voice parser. You are given the raw spoken
TRANSCRIPT and the PARSED structured result the parser produced from it. Judge only
FAITHFULNESS: is every value in the parse actually supported by the transcript?

Score 0.0–1.0 (1.0 = perfectly faithful, 0.0 = fabricated or wrong):
- Every logged exercise, weight, reps, and set count must be present in / entailed by
  the transcript. Penalise invented sets, invented exercises, and mis-heard numbers.
- The intent must match: "log_sets"/"correct_last" for logging sets vs "create_routine"
  for building a routine. Wrong intent is a major faithfulness failure.
- Weight-unit handling is fine as long as the spoken number is preserved (kg is the
  stored unit; a spoken "lb" converted to kg is correct, not a defect).
- Do NOT penalise: unresolved exercise matches (exercise_id null), ambiguities the
  parser correctly raised, or values legitimately inherited from prior context.
- An empty/garbled transcript that yields an empty or "unknown" parse is FAITHFUL.

Return: faithful (true iff score >= 0.75), score, a short list of concrete issues
(empty when faithful), and one line of reasoning. Be strict but fair.`;

/** Run the faithfulness judge over one (transcript, parse) pair. */
export async function judgeFaithfulness(
  llm: LlmClient,
  transcript: string,
  result: ParseResult
): Promise<FaithfulnessJudgement> {
  const { json, usage } = await llm.completeJson({
    system: JUDGE_SYSTEM,
    user: JSON.stringify({ transcript, parsed: result }),
    schema: JUDGE_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 512,
  });

  const j = (json ?? {}) as Partial<{
    faithful: boolean;
    score: number;
    issues: unknown;
    reasoning: unknown;
  }>;
  const rawScore = typeof j.score === 'number' ? j.score : 0;
  return {
    faithful: j.faithful === true,
    score: Math.max(0, Math.min(1, rawScore)),
    issues: Array.isArray(j.issues) ? j.issues.map(String) : [],
    reasoning: typeof j.reasoning === 'string' ? j.reasoning : '',
    usage,
  };
}
