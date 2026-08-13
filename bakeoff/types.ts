/**
 * Bakeoff — shared contract types.
 *
 * This directory is a STANDALONE evaluation harness. It is never imported by
 * the mobile app (nothing under src/app reaches it), so Metro never bundles it
 * — it runs only via `npx tsx` on your machine, exactly like scripts/ and eval/.
 *
 * Ground truth is authored at the DATABASE-SEMANTIC level (what rows should land
 * in Postgres), not as a reference transcript. A reference transcript is
 * optional and used only for the diagnostic WER / numeric-entity ASR scoring.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Ground truth (one JSON file per recording, in bakeoff/ground-truth/)
// ---------------------------------------------------------------------------

/**
 * How the load number should be interpreted. The current DB stores a single
 * numeric(6,2) kg value, but capturing the mode in ground truth lets the
 * bakeoff measure the load-semantics failure class the research flagged
 * (dumbbell-per-hand, assistance, bodyweight-plus, etc.) even before the app
 * schema grows a load_mode column.
 */
export const loadModeSchema = z.enum([
  'bodyweight', // no external load; weight_kg must be null
  'external_load', // plain added weight, generic
  'barbell_total', // spoken value is the whole bar
  'dumbbell_each', // spoken value is per-dumbbell
  'machine_stack', // selectorized machine pin
  'assistance', // machine assistance; larger number = easier
  'bodyweight_plus', // bodyweight + the spoken external load
]);
export type LoadMode = z.infer<typeof loadModeSchema>;

/** One physical set: the weight (kg, null = bodyweight) and rep count. */
export const gtSetSchema = z.object({
  weight_kg: z.number().nullable(),
  reps: z.number().int(),
});
export type GtSet = z.infer<typeof gtSetSchema>;

export const gtExerciseSchema = z.object({
  /** Canonical library name — used to score exercise resolution accuracy. */
  name: z.string(),
  load_mode: loadModeSchema.default('external_load'),
  sets: z.array(gtSetSchema).min(1),
});
export type GtExercise = z.infer<typeof gtExerciseSchema>;

/**
 * Free-form slicing axes (report §G). Every field optional — fill what you
 * varied so `score` can break results down by environment, phone distance, etc.
 */
export const gtMetaSchema = z
  .object({
    environment: z.string(), // quiet_room | quiet_gym | music | music_clang
    phone: z.string(), // close | arms_length | bench
    speaker_state: z.string(), // rested | out_of_breath
    pace: z.string(), // deliberate | natural | fast
    notes: z.string(),
  })
  .partial()
  .default({});
export type GtMeta = z.infer<typeof gtMetaSchema>;

export const groundTruthSchema = z.object({
  /** Audio filename in bakeoff/recordings/ (e.g. "2026-08-13-chest.m4a"). */
  audio: z.string(),
  /**
   * Superset of the app's intent enum. For end-to-end scoring the scorer maps
   * 'log_workout' → the pipeline's 'log_sets'. 'create_routine' is future.
   */
  intent: z
    .enum(['log_workout', 'create_routine', 'log_sets', 'correct_last', 'unknown'])
    .default('log_workout'),
  routine: z.string().nullable().default(null),
  /** Optional verbatim transcript — enables WER + numeric-entity ASR scoring. */
  reference_transcript: z.string().optional(),
  exercises: z.array(gtExerciseSchema).default([]),
  meta: gtMetaSchema,
});
export type GroundTruth = z.infer<typeof groundTruthSchema>;

// ---------------------------------------------------------------------------
// ASR provider I/O
// ---------------------------------------------------------------------------

/**
 * Context the harness can inject to bias recognition toward the closed
 * vocabulary. Providers use whatever subset they support (keyterms, prompt,
 * language) and ignore the rest.
 */
export interface BakeoffContext {
  /** Domain terms to bias toward — routine exercises + a few neighbors. */
  keyterms: string[];
  /** BCP-47 language hint, e.g. 'en-IN' or 'en-US'. */
  language: string;
}

export interface AsrTranscribeInput {
  audioPath: string;
  context: BakeoffContext;
}

/** A single ASR run's normalized output, cached to disk keyed by audio+provider. */
export interface AsrResult {
  providerId: string;
  model: string;
  transcript: string;
  /** n-best alternatives when the provider exposes them (Google, etc.). */
  alternatives?: string[];
  /** Provider-reported overall/mean confidence when available (uncalibrated). */
  confidence?: number | null;
  latency_ms: number;
  /** The raw provider JSON, retained for later re-analysis. */
  raw?: unknown;
  /** Set when the provider was skipped (missing key / unsupported), with why. */
  skipped?: string;
  /** Set when the call errored (network, 4xx/5xx), with the message. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Scoring result types
// ---------------------------------------------------------------------------

/** One substituted numeric entity: reference value vs what ASR heard. */
export interface NumericConfusion {
  ref: number;
  hyp: number;
  count: number;
}

/** ASR-quality scoring of a hypothesis transcript against the reference. */
export interface TranscriptScore {
  hasReference: boolean;
  wer: number | null;
  werSub: number;
  werDel: number;
  werIns: number;
  refWords: number;
  /** Numeric Entity Error Rate = (sub+del+ins) / reference numeric entities. */
  neer: number | null;
  numRefEntities: number;
  numSub: number;
  numDel: number;
  numIns: number;
  confusions: NumericConfusion[];
}

/** End-to-end scoring: audio → ASR → real pipeline → structured, vs ground truth. */
export interface E2EScore {
  /** Every field of every set + order + names + intent correct. */
  workoutExactMatch: boolean;
  intentMatch: boolean;
  weightFieldsTotal: number;
  weightFieldsCorrect: number;
  repFieldsTotal: number;
  repFieldsCorrect: number;
  exercisesTotal: number;
  exercisesResolvedCorrect: number;
  setCountTotal: number;
  setCountCorrect: number;
  /** Whole exercises in ground truth with no match in the parse (omissions). */
  omissions: number;
  /** Parsed exercises with no ground-truth match (hallucinated/duplicated). */
  spurious: number;
  /** Non-empty ambiguities from the pipeline = clarifications this workout. */
  clarifications: number;
  /** Human-readable per-field diff lines for the report. */
  diffs: string[];
}
