// Hand-written zod schemas mirroring supabase/migrations/0001_init.sql.
// Single source of truth for row types — import from here everywhere.
// (Chosen over `supabase gen types` so types exist before a project is provisioned;
// if the schema changes, update the migration AND this file together.)
import { z } from 'zod';

export const unitSchema = z.enum(['kg', 'lb']);
export type Unit = z.infer<typeof unitSchema>;

export const setTypeSchema = z.enum(['warmup', 'normal', 'drop', 'failure']);
export type SetType = z.infer<typeof setTypeSchema>;

export const loggedViaSchema = z.enum(['manual', 'voice', 'quick_repeat']);
export type LoggedVia = z.infer<typeof loggedViaSchema>;

export const profileSchema = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().nullable(),
  default_unit: unitSchema,
  created_at: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

export const exerciseModalitySchema = z.enum([
  'weight_reps',
  'bodyweight_reps',
  // Bodyweight-baseline movement that can OPTIONALLY carry added external load
  // (belt+plate, vest, dumbbell) — Pull-Up, Dip, Back Extension, etc. Logs reps
  // with an optional +weight; a null weight is a pure-bodyweight set.
  'weighted_bodyweight',
  'time',
  'distance_time',
]);
export type ExerciseModality = z.infer<typeof exerciseModalitySchema>;

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  canonical_name: z.string(),
  equipment: z.string().nullable(),
  primary_muscles: z.array(z.string()),
  secondary_muscles: z.array(z.string()),
  body_region: z.array(z.string()),
  mechanic: z.enum(['compound', 'isolation']).nullable(),
  modality: exerciseModalitySchema,
  is_custom: z.boolean(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string(),
});
export type Exercise = z.infer<typeof exerciseSchema>;

export const exerciseAliasSchema = z.object({
  id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  alias: z.string(),
  source: z.enum(['seed', 'user', 'llm']),
  created_at: z.string(),
});
export type ExerciseAlias = z.infer<typeof exerciseAliasSchema>;

export const routineSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  notes: z.string().nullable(),
  position: z.number().int(),
  archived: z.boolean(),
  created_at: z.string(),
});
export type Routine = z.infer<typeof routineSchema>;

export const routineExerciseSchema = z.object({
  id: z.string().uuid(),
  routine_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  position: z.number().int(),
  target_sets: z.number().int().nullable(),
  target_reps_low: z.number().int().nullable(),
  target_reps_high: z.number().int().nullable(),
  created_at: z.string(),
});
export type RoutineExercise = z.infer<typeof routineExerciseSchema>;

export const workoutSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  routine_id: z.string().uuid().nullable(),
  title: z.string().nullable(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  notes: z.string().nullable(),
  external_id: z.string().nullable(),
  created_at: z.string(),
});
export type Workout = z.infer<typeof workoutSchema>;

export const workoutExerciseSchema = z.object({
  id: z.string().uuid(),
  workout_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  position: z.number().int(),
  created_at: z.string(),
});
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

export const workoutSetSchema = z.object({
  id: z.string().uuid(),
  workout_exercise_id: z.string().uuid(),
  set_number: z.number().int(),
  // z.coerce on numeric columns: PostgREST may serialize numeric as string.
  weight_kg: z.coerce.number().nullable(),
  reps: z.number().int().nullable(),
  // Modality metrics (migration 0010): duration for time/cardio, level for cardio.
  duration_seconds: z.number().int().nullable(),
  level: z.coerce.number().nullable(),
  rpe: z.coerce.number().nullable(),
  set_type: setTypeSchema,
  logged_via: loggedViaSchema,
  raw_transcript: z.string().nullable(),
  parse_confidence: z.coerce.number().nullable(),
  created_at: z.string(),
});
export type WorkoutSet = z.infer<typeof workoutSetSchema>;

// Phase 2 (voice logging) — mirrors supabase/migrations/0002_voice_logs.sql.
export const voiceLogOutcomeSchema = z.enum([
  'accepted',
  'edited',
  'answered_question',
  'discarded',
]);
export type VoiceLogOutcome = z.infer<typeof voiceLogOutcomeSchema>;

export const voiceLogSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  workout_id: z.string().uuid().nullable(),
  transcript: z.string(),
  stt_source: z.string().nullable(),
  context: z.unknown().nullable(),
  parsed: z.unknown().nullable(), // a ParseResult (src/types/parse.ts) — loosely typed here
  model: z.string().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  latency_ms: z.number().int().nullable(),
  cost_usd: z.coerce.number().nullable(),
  outcome: voiceLogOutcomeSchema.nullable(),
  corrections: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })).nullable(),
  created_at: z.string(),
});
export type VoiceLog = z.infer<typeof voiceLogSchema>;

// Result row of the last_session_sets() SQL function.
export const lastSessionSetSchema = z.object({
  workout_id: z.string().uuid(),
  started_at: z.string(),
  set_number: z.number().int(),
  weight_kg: z.coerce.number().nullable(),
  reps: z.number().int().nullable(),
  duration_seconds: z.number().int().nullable(),
  level: z.coerce.number().nullable(),
  rpe: z.coerce.number().nullable(),
  set_type: setTypeSchema,
});
export type LastSessionSet = z.infer<typeof lastSessionSetSchema>;
