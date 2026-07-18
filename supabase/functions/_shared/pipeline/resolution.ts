// Exercise canonicalization: exact alias → trigram candidates → (only when
// needed) a second, tiny LLM call that must pick from the candidate list or
// return 'unmatched'. The LLM never free-generates exercise names — this is
// the constraint that kills hallucination.
import type { ParseContext, ParsedExercise } from '../parse-types.ts';
import { RESOLUTION_SYSTEM_PROMPT } from './prompts.ts';
import type { LlmClient, LlmUsage } from './llm.ts';

export const FUZZY_ACCEPT_THRESHOLD = 0.75;
export const CANDIDATE_LIMIT = 10;
// Below this trigram score a candidate isn't worth showing the LLM at all.
export const CANDIDATE_FLOOR = 0.15;

export interface CatalogExercise {
  id: string;
  name: string;
}

export interface ScoredCandidate extends CatalogExercise {
  score: number;
}

// Backed by Postgres (alias table + pg_trgm RPC) in production and by an
// in-memory fixture in the eval harness / CLI — same resolution logic on top.
export interface ExerciseCatalog {
  /** Exact lower(alias) or lower(canonical_name) hit. */
  exactMatch(raw: string): Promise<CatalogExercise | null>;
  /** Top-N trigram candidates over canonical_name + aliases, best first. */
  candidates(raw: string, limit: number): Promise<ScoredCandidate[]>;
}

export async function resolveExercise(
  raw: string,
  context: ParseContext,
  catalog: ExerciseCatalog,
  llm: LlmClient
): Promise<{ exercise: ParsedExercise; usage: LlmUsage | null }> {
  const exact = await catalog.exactMatch(raw);
  if (exact) {
    return {
      exercise: { raw, exercise_id: exact.id, name: exact.name, resolution: 'alias' },
      usage: null,
    };
  }

  const candidates = (await catalog.candidates(raw, CANDIDATE_LIMIT)).filter(
    (candidate) => candidate.score >= CANDIDATE_FLOOR
  );

  if (candidates.length === 0) {
    return {
      exercise: { raw, exercise_id: null, name: null, resolution: 'unmatched', candidates: [] },
      usage: null,
    };
  }

  if (candidates[0].score >= FUZZY_ACCEPT_THRESHOLD) {
    return {
      exercise: {
        raw,
        exercise_id: candidates[0].id,
        name: candidates[0].name,
        resolution: 'fuzzy',
        candidates,
      },
      usage: null,
    };
  }

  // LLM call #2 — forced choice from the candidate list via a dynamic enum.
  const pickSchema = {
    type: 'object',
    properties: {
      exercise_id: {
        type: 'string',
        enum: [...candidates.map((candidate) => candidate.id), 'unmatched'],
      },
    },
    required: ['exercise_id'],
    additionalProperties: false,
  };

  const { json, usage } = await llm.completeJson({
    system: RESOLUTION_SYSTEM_PROMPT,
    user: JSON.stringify({
      spoken: raw,
      candidates: candidates.map(({ id, name }) => ({ id, name })),
      context: {
        session_exercises: context.session_exercises,
        recent_exercises: context.recent_exercises,
      },
    }),
    schema: pickSchema,
    maxTokens: 128,
  });

  const picked = (json as { exercise_id: string }).exercise_id;
  const pickedCandidate = candidates.find((c) => c.id === picked);
  if (picked === 'unmatched' || !pickedCandidate) {
    return {
      exercise: { raw, exercise_id: null, name: null, resolution: 'unmatched', candidates },
      usage,
    };
  }
  return {
    exercise: {
      raw,
      exercise_id: picked,
      name: pickedCandidate.name,
      resolution: 'llm',
      candidates,
    },
    usage,
  };
}
