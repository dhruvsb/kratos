// ─────────────────────────────────────────────────────────────────────────────
// THE VOICE-PARSE SEAM (Phase 2, design "Voice Logging" 1a).
//
// This is the ONE place the voice model plugs in. The UI (recorder → preview →
// commit) is built entirely against `VoiceParseResult` and `parseVoiceIntent()`;
// nothing downstream knows how the transcript was understood. While the model
// bake-off runs, `parseVoiceIntent` is a **mock** (MOCK_VOICE = true) that returns
// canned, structurally-real data — exercise ids are resolved against the actual
// seeded library so a commit writes valid rows.
//
// When the eval picks a model, replace the body of parseVoiceIntent() (call the
// `parse-utterance` edge function, map its ParseResult onto this shape) and flip
// MOCK_VOICE to false. Everything else stays.
//
// Why a new shape instead of ParseResult (src/types/parse.ts)? That contract only
// models set-logging (`intent: log_sets | correct_last`). The 1a design infers a
// *second* intent — "create a routine" — from the same utterance, so the UI needs
// a discriminated union over both. ParseResult is untouched; the eventual real
// implementation adapts ParseResult → VoiceParseResult here.
// ─────────────────────────────────────────────────────────────────────────────
import type { SetType } from '@/types/db';
import type { ParseContext, ParseResult } from '@/types/parse';
import { listAllExercises } from './exercises';
import { parseVoiceUtterance } from './voice';

// Flip to false to use the real model pipeline (parse-utterance edge function).
// Cutover prerequisites, in order:
//   1. deploy the edge functions: `supabase functions deploy parse-utterance transcribe`
//   2. rebuild the dev client (expo-audio is a new native module): `expo run:ios`
//   3. confirm the model ids: PARSE_MODEL_DEFAULT + ASR_MODEL in prices.ts
// CUT OVER 2026-08-13: edge functions deployed (parse-utterance + transcribe),
// model ids confirmed (parse gpt-5.6-luna, ASR gpt-transcribe). Set back to true
// to demo the flow without a mic (canned data + the recorder's WORKOUT/ROUTINE toggle).
export const MOCK_VOICE = false;

// ── The contract the UI renders ──────────────────────────────────────────────

/** One exercise inside a "new routine" parse (03A). */
export type ParsedRoutineExercise = {
  /** Stable local key for list reorders/removals in the preview. */
  key: string;
  /** Resolved library id, or null when nothing matched (→ CHANGE / picker). */
  exerciseId: string | null;
  /** Canonical display name (falls back to the spoken phrase when unmatched). */
  name: string;
  /** The spoken phrase, kept for the alias write-back on confirm. */
  raw: string;
  /** e.g. "Chest" — from the resolved exercise's metadata. */
  muscle: string | null;
  /** e.g. "Barbell". */
  equipment: string | null;
  /** Present only when the spoken phrase differed from the canonical name — the
   *  design's "heard 'chest fly cable' → matched" note. */
  matchNote?: string | null;
};

/** One parsed set inside a logged workout (03B). */
export type ParsedSet = {
  key: string;
  weightKg: number | null;
  reps: number | null;
  setType: SetType;
  /** PREV label kept beside every value so a mis-heard number is obvious. */
  prev?: string | null;
};

/** One exercise's worth of parsed sets inside a logged workout (03B). */
export type ParsedLogExercise = {
  key: string;
  exerciseId: string;
  name: string;
  raw: string;
  muscle: string | null;
  equipment: string | null;
  sets: ParsedSet[];
  /** true ⇒ the model wasn't told how many sets; the UI asks (warn border + chips)
   *  instead of guessing (the spec's must-ask rule). */
  missingSets?: boolean;
  /** Suggested set counts for the "how many sets?" chips. */
  setCountChoices?: number[];
};

export type VoiceParseResult =
  | {
      kind: 'routine';
      transcript: string;
      confidence: number; // 0–1
      routine: { name: string; exercises: ParsedRoutineExercise[] };
    }
  | {
      kind: 'log';
      transcript: string;
      confidence: number; // 0–1
      /** Where the sets land. null ⇒ a standalone ad-hoc workout. */
      target: { routineId: string | null; routineName: string | null };
      exercises: ParsedLogExercise[];
    };

// ── Canned demo transcripts (surfaced by the recorder's mock toggle) ──────────

export const MOCK_TRANSCRIPTS = {
  log: '“Bench press 80 kilos 8 reps three sets, incline dumbbell 30 kilos 10 reps three sets, cable fly 15 kilos twelve reps…”',
  routine:
    '“Create a new workout routine called Chest Variation 2 and add bench press, flat incline dumbbell press, chest fly cable”',
} as const;

export type MockIntent = keyof typeof MOCK_TRANSCRIPTS;

// ── The seam ─────────────────────────────────────────────────────────────────

/**
 * Understand an utterance. Real path calls the `parse-utterance` edge function and
 * maps its `ParseResult` onto `VoiceParseResult`; mock path returns canned data.
 * This is the ONLY place the app knows a model exists.
 *
 * @param transcript  raw STT text (from the transcribe edge function on the real path).
 * @param context     session/unit context for the pipeline (default unit at minimum).
 * @param forceKind   demo-only: force the routine vs log example (mock path, no mic).
 */
export async function parseVoiceIntent(input: {
  transcript: string;
  context?: ParseContext;
  workoutId?: string | null;
  sttSource?: string;
  forceKind?: MockIntent;
}): Promise<VoiceParseResult> {
  if (MOCK_VOICE) return mockParse(input);

  const context: ParseContext =
    input.context ?? { session_exercises: [], recent_exercises: [], default_unit: 'kg' };
  const { result } = await parseVoiceUtterance({
    transcript: input.transcript,
    context,
    sttSource: input.sttSource ?? ASR_SOURCE,
    workoutId: input.workoutId ?? null,
  });
  return adaptResult(result, input.transcript);
}

/** stt_source tag stored on voice_logs for the cloud-ASR path. */
const ASR_SOURCE = 'gpt-transcribe';

/** Map the pipeline's ParseResult onto the UI's VoiceParseResult, enriching each
 *  resolved exercise with muscle/equipment from the library for the metadata line. */
async function adaptResult(result: ParseResult, transcript: string): Promise<VoiceParseResult> {
  const directory = await listAllExercises();
  const meta = new Map(directory.map((e) => [e.id, e]));
  const metaOfId = (id: string | null) => {
    const e = id ? meta.get(id) : undefined;
    return {
      muscle: e?.primary_muscles?.[0] ? cap(e.primary_muscles[0]) : null,
      equipment: e?.equipment ? cap(e.equipment) : null,
    };
  };
  const confidence = result.confidence;

  if (result.intent === 'create_routine' && result.routine) {
    return {
      kind: 'routine',
      transcript,
      confidence,
      routine: {
        name: result.routine.name ?? 'New routine',
        exercises: result.routine.exercises.map((ex, i) => {
          const m = metaOfId(ex.exercise_id);
          const differs =
            ex.name != null && ex.raw.trim().toLowerCase() !== ex.name.toLowerCase();
          return {
            key: `r${i}`,
            exerciseId: ex.exercise_id,
            name: ex.name ?? titleCase(ex.raw),
            raw: ex.raw,
            muscle: m.muscle,
            equipment: m.equipment,
            // Show the fuzzy-match note only where a non-exact match renamed the phrase.
            matchNote:
              ex.exercise_id && differs && ex.resolution !== 'alias'
                ? `heard “${ex.raw}” → matched`
                : null,
          };
        }),
      },
    };
  }

  // Set-logging (or correct_last): one card per entry, sets_count copies per entry.
  // An ambiguity on 'sets_count' ⇒ the model didn't know how many → the UI asks.
  const missingByIndex = new Set(
    result.ambiguities.filter((a) => a.field === 'sets_count').map((a) => a.entry_index)
  );
  return {
    kind: 'log',
    transcript,
    confidence,
    target: { routineId: null, routineName: null },
    exercises: result.entries.map((entry, i) => {
      const ex = entry.exercise;
      const m = metaOfId(ex.exercise_id);
      const count = Math.max(1, entry.sets_count);
      const sets: ParsedSet[] = Array.from({ length: count }, (_, s) => ({
        key: `s${i}-${s}`,
        weightKg: entry.weight_kg,
        reps: entry.reps,
        setType: entry.set_type,
        prev: null, // PREV enrichment (last-session lookup) is a later polish
      }));
      return {
        key: `l${i}`,
        exerciseId: ex.exercise_id ?? '',
        name: ex.name ?? titleCase(ex.raw || 'Exercise'),
        raw: ex.raw,
        muscle: m.muscle,
        equipment: m.equipment,
        sets,
        missingSets: missingByIndex.has(i),
        setCountChoices: [2, 3, 4],
      };
    }),
  };
}

// ── Mock implementation ──────────────────────────────────────────────────────

const ROUTINE_CUES = /\b(routine|create|called|new workout routine|add)\b/i;

async function mockParse(input: {
  transcript: string;
  forceKind?: MockIntent;
}): Promise<VoiceParseResult> {
  const kind: MockIntent =
    input.forceKind ?? (ROUTINE_CUES.test(input.transcript) ? 'routine' : 'log');
  // Resolve canned names against the *real* library so commits write valid FKs.
  const directory = await listAllExercises();
  const find = makeResolver(directory);

  if (kind === 'routine') {
    const bench = find('bench press');
    const incline = find('incline dumbbell press', 'incline dumbbell');
    const fly = find('cable fly', 'cable chest fly', 'chest fly', 'cable crossover');
    return {
      kind: 'routine',
      transcript: MOCK_TRANSCRIPTS.routine,
      confidence: 0.96,
      routine: {
        name: 'Chest Variation 2',
        exercises: [
          routineEx('r1', bench, 'bench press'),
          routineEx('r2', incline, 'flat incline dumbbell press'),
          // The one row where the spoken phrase differed from canonical → note.
          routineEx('r3', fly, 'chest fly cable', true),
        ],
      },
    };
  }

  const bench = find('bench press');
  const incline = find('incline dumbbell press', 'incline dumbbell');
  const fly = find('cable fly', 'cable chest fly', 'chest fly', 'cable crossover');
  return {
    kind: 'log',
    transcript: MOCK_TRANSCRIPTS.log,
    confidence: 0.91,
    target: { routineId: null, routineName: 'Chest Variation 2' },
    exercises: [
      logEx('l1', bench, 'bench press', [
        set('s1', 80, 8, '77.5×8'),
        set('s2', 80, 8, '77.5×8'),
        set('s3', 80, 6, '75×8'),
      ]),
      logEx('l2', incline, 'incline dumbbell', [
        set('s1', 30, 10, '27.5×10'),
        set('s2', 30, 10, '27.5×10'),
        set('s3', 30, 10, '27.5×10'),
      ]),
      // Missing sets → the UI must ask (one question, not a form).
      {
        ...logEx('l3', fly, 'cable fly', [set('s1', 15, 12, null)]),
        missingSets: true,
        setCountChoices: [2, 3, 4],
      },
    ],
  };
}

type DirEx = Awaited<ReturnType<typeof listAllExercises>>[number];

function makeResolver(directory: DirEx[]) {
  const lower = directory.map((e) => ({ e, name: e.canonical_name.toLowerCase() }));
  return (...aliases: string[]): DirEx | null => {
    for (const a of aliases) {
      const needle = a.toLowerCase();
      const exact = lower.find((x) => x.name === needle);
      if (exact) return exact.e;
      const partial = lower.find((x) => x.name.includes(needle) || needle.includes(x.name));
      if (partial) return partial.e;
    }
    return null;
  };
}

function metaOf(ex: DirEx | null): { muscle: string | null; equipment: string | null } {
  return {
    muscle: ex?.primary_muscles?.[0] ? cap(ex.primary_muscles[0]) : null,
    equipment: ex?.equipment ? cap(ex.equipment) : null,
  };
}

function routineEx(
  key: string,
  ex: DirEx | null,
  raw: string,
  note = false
): ParsedRoutineExercise {
  const { muscle, equipment } = metaOf(ex);
  return {
    key,
    exerciseId: ex?.id ?? null,
    name: ex?.canonical_name ?? titleCase(raw),
    raw,
    muscle,
    equipment,
    matchNote: note && ex ? `heard “${raw}” → matched` : null,
  };
}

function logEx(
  key: string,
  ex: DirEx | null,
  raw: string,
  sets: ParsedSet[]
): ParsedLogExercise {
  const { muscle, equipment } = metaOf(ex);
  return {
    key,
    // The mock guarantees resolution for the log example; fall back to '' so the
    // type stays `string` (commit filters out any unresolved entry defensively).
    exerciseId: ex?.id ?? '',
    name: ex?.canonical_name ?? titleCase(raw),
    raw,
    muscle,
    equipment,
    sets,
  };
}

function set(
  key: string,
  weightKg: number | null,
  reps: number | null,
  prev: string | null
): ParsedSet {
  return { key, weightKg, reps, setType: 'normal', prev };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
