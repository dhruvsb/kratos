import { supabase } from '@/lib/supabase';
import { workoutSetSchema, type SetType, type WorkoutSet } from '@/types/db';

export type AddSetInput = {
  weight_kg: number | null;
  reps: number | null;
  // Modality metrics (migration 0010): duration for time/cardio, level for cardio.
  duration_seconds?: number | null;
  level?: number | null;
  set_type?: SetType;
  rpe?: number | null;
};

export async function addSet(
  workoutExerciseId: string,
  input: AddSetInput,
  // Client-computed set_number (max existing + 1) and a client-chosen row id.
  // Passing both makes the write a pure insert with no dependent SELECT, so it can
  // replay offline / after an app kill under React Query's paused-mutation queue —
  // and a later edit/delete of a not-yet-synced set targets this same id. Omit
  // them and the server read + a server-generated id are used (the voice path).
  setNumber?: number,
  id?: string
): Promise<WorkoutSet> {
  return insertSet(
    workoutExerciseId,
    {
      weight_kg: input.weight_kg,
      reps: input.reps,
      duration_seconds: input.duration_seconds ?? null,
      level: input.level ?? null,
      set_type: input.set_type ?? 'normal',
      rpe: input.rpe ?? null,
      logged_via: 'manual',
      raw_transcript: null,
      parse_confidence: null,
    },
    setNumber,
    id
  );
}

export type AddVoiceSetInput = {
  weight_kg: number | null;
  reps: number | null;
  set_type: SetType;
  raw_transcript: string;
  parse_confidence: number;
};

/** Same as addSet but tags the row as voice-logged (see Phase 2). */
export async function addVoiceSet(
  workoutExerciseId: string,
  input: AddVoiceSetInput
): Promise<WorkoutSet> {
  return insertSet(workoutExerciseId, {
    weight_kg: input.weight_kg,
    reps: input.reps,
    duration_seconds: null,
    level: null,
    set_type: input.set_type,
    rpe: null,
    logged_via: 'voice',
    raw_transcript: input.raw_transcript,
    parse_confidence: input.parse_confidence,
  });
}

/** Next free set_number for an exercise (max existing + 1). */
async function nextSetNumber(workoutExerciseId: string): Promise<number> {
  const { data: last, error } = await supabase
    .from('sets')
    .select('set_number')
    .eq('workout_exercise_id', workoutExerciseId)
    .order('set_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (last?.set_number ?? 0) + 1;
}

// How many times to re-pick a set_number when it collides with a concurrent insert
// before giving up (each attempt re-reads max+1). A handful is plenty for the only
// realistic contention here — a double-tapped ✓ or an offline queue draining.
const MAX_SET_NUMBER_RETRIES = 5;

async function insertSet(
  workoutExerciseId: string,
  row: {
    weight_kg: number | null;
    reps: number | null;
    duration_seconds: number | null;
    level: number | null;
    set_type: SetType;
    rpe: number | null;
    logged_via: WorkoutSet['logged_via'];
    raw_transcript: string | null;
    parse_confidence: number | null;
  },
  setNumber?: number,
  id?: string
): Promise<WorkoutSet> {
  // set_number = max existing + 1. A caller that already knows it from the cache
  // passes it in, which skips this read so the insert stays offline-replayable.
  let set_number = setNumber ?? (await nextSetNumber(workoutExerciseId));

  // UNIQUE(workout_exercise_id, set_number) (migration 0006) can now reject an
  // insert with a 23505. Two shapes, handled differently:
  //   * the primary key (id) collided → this exact row already committed (an offline
  //     replay re-running a write that actually landed). Idempotent: return the
  //     existing row rather than erroring.
  //   * (workout_exercise_id, set_number) collided → a concurrent insert took this
  //     number. Re-pick max+1 and retry, so the second set files after the first
  //     instead of failing the log.
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase
      .from('sets')
      .insert({
        ...(id ? { id } : {}),
        workout_exercise_id: workoutExerciseId,
        set_number,
        ...row,
      })
      .select()
      .single();
    if (!error) return workoutSetSchema.parse(data);
    if (error.code !== '23505') throw error;

    // Duplicate primary key → the row is already there (replay). Return it.
    if (id && /_pkey/.test(error.message ?? '')) {
      const { data: existing, error: fetchError } = await supabase
        .from('sets')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (existing) return workoutSetSchema.parse(existing);
      throw error;
    }

    // set_number collided; give up after a bounded number of re-picks.
    if (attempt >= MAX_SET_NUMBER_RETRIES) throw error;
    set_number = await nextSetNumber(workoutExerciseId);
  }
}

export async function updateSet(
  id: string,
  patch: Partial<
    Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_seconds' | 'level' | 'set_type' | 'rpe'>
  >
): Promise<void> {
  const { error } = await supabase.from('sets').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await supabase.from('sets').delete().eq('id', id);
  if (error) throw error;
}

export async function listSets(workoutExerciseId: string): Promise<WorkoutSet[]> {
  const { data, error } = await supabase
    .from('sets')
    .select('*')
    .eq('workout_exercise_id', workoutExerciseId)
    .order('set_number');
  if (error) throw error;
  return workoutSetSchema.array().parse(data ?? []);
}
