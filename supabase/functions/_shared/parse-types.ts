// ParseResult / ParseContext — the single source of truth for the Phase 2 voice
// pipeline, shared by the app, the parse-utterance edge function, and the eval
// harness (eval runs the SAME code path as production, so these live where Deno
// can bundle them; `src/types/parse.ts` re-exports for app code).
//
// This file must stay runtime-agnostic: zod only, no fs/Deno/RN imports.
import { z } from 'zod';

export const unitSchema = z.enum(['kg', 'lb']);
export type Unit = z.infer<typeof unitSchema>;

export const setTypeSchema = z.enum(['warmup', 'normal', 'drop', 'failure']);
export type SetType = z.infer<typeof setTypeSchema>;

export const intentSchema = z.enum(['log_sets', 'correct_last', 'unknown']);
export type Intent = z.infer<typeof intentSchema>;

// How the exercise name was resolved to an exercise_id.
// 'alias'  — exact alias/canonical-name hit (also used for context-inherited
//            exercises, where the id came straight from ParseContext)
// 'fuzzy'  — top trigram candidate scored >= FUZZY_ACCEPT_THRESHOLD
// 'llm'    — second LLM call picked from the candidate list
// 'unmatched' — nothing confident; UI offers "create custom exercise?"
export const resolutionSchema = z.enum(['alias', 'fuzzy', 'llm', 'unmatched']);
export type Resolution = z.infer<typeof resolutionSchema>;

export const candidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number(),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const parsedExerciseSchema = z.object({
  raw: z.string(),
  exercise_id: z.string().nullable(),
  // Canonical display name, when exercise_id is known (null when unmatched).
  // The UI shows this, not `raw` — `raw` is kept only for the alias write-back.
  name: z.string().nullable(),
  resolution: resolutionSchema,
  candidates: z.array(candidateSchema).optional(),
});
export type ParsedExercise = z.infer<typeof parsedExerciseSchema>;

export const parseEntrySchema = z.object({
  exercise: parsedExerciseSchema,
  weight_kg: z.number().nullable(),
  unit_spoken: unitSchema.nullable(),
  reps: z.number().int().nullable(),
  sets_count: z.number().int(), // "2 sets of..." → 2
  set_type: setTypeSchema,
  // e.g. ['exercise','weight'] when the utterance said "same weight ..."
  inherits_from_context: z.array(z.string()),
});
export type ParseEntry = z.infer<typeof parseEntrySchema>;

export const ambiguityFieldSchema = z.enum([
  'exercise',
  'weight',
  'reps',
  'sets_count',
  'set_type',
  'intent',
]);
export type AmbiguityField = z.infer<typeof ambiguityFieldSchema>;

export const ambiguitySchema = z.object({
  entry_index: z.number().int(),
  field: ambiguityFieldSchema,
  question: z.string(), // SHORT, targeted — rendered as a question chip
});
export type Ambiguity = z.infer<typeof ambiguitySchema>;

export const parseResultSchema = z.object({
  intent: intentSchema,
  entries: z.array(parseEntrySchema),
  // non-empty ⇒ the UI MUST ask; asking is a success state, never a fallback
  ambiguities: z.array(ambiguitySchema),
  confidence: z.number(), // 0–1; rubric documented in the extraction prompt
});
export type ParseResult = z.infer<typeof parseResultSchema>;

export const lastSetSchema = z.object({
  weight_kg: z.number(),
  reps: z.number().int(),
  set_type: setTypeSchema,
});

export const parseContextSchema = z.object({
  current_exercise_id: z.string().nullable().optional(),
  current_exercise_name: z.string().nullable().optional(),
  last_set: lastSetSchema.nullable().optional(),
  session_exercises: z.array(z.string()).default([]),
  recent_exercises: z.array(z.string()).default([]), // top ~30 by frequency
  default_unit: unitSchema.default('kg'),
});
export type ParseContext = z.infer<typeof parseContextSchema>;

// Per-call telemetry, persisted to voice_logs and reported by the eval harness.
export interface ParseTelemetry {
  model: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_usd: number;
  llm_calls: number;
}
