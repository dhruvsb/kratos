import { supabase } from '@/lib/supabase';
import type { SetType, WorkoutSet } from '@/types/db';

export type AddSetInput = {
  weight_kg: number | null;
  reps: number | null;
  set_type?: SetType;
  rpe?: number | null;
};

export async function addSet(
  workoutExerciseId: string,
  input: AddSetInput
): Promise<WorkoutSet> {
  return insertSet(workoutExerciseId, {
    weight_kg: input.weight_kg,
    reps: input.reps,
    set_type: input.set_type ?? 'normal',
    rpe: input.rpe ?? null,
    logged_via: 'manual',
    raw_transcript: null,
    parse_confidence: null,
  });
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
    set_type: input.set_type,
    rpe: null,
    logged_via: 'voice',
    raw_transcript: input.raw_transcript,
    parse_confidence: input.parse_confidence,
  });
}

async function insertSet(
  workoutExerciseId: string,
  row: {
    weight_kg: number | null;
    reps: number | null;
    set_type: SetType;
    rpe: number | null;
    logged_via: WorkoutSet['logged_via'];
    raw_transcript: string | null;
    parse_confidence: number | null;
  }
): Promise<WorkoutSet> {
  // set_number = max existing + 1 (single-device assumption; no race handling).
  const { data: last, error: lastError } = await supabase
    .from('sets')
    .select('set_number')
    .eq('workout_exercise_id', workoutExerciseId)
    .order('set_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const { data, error } = await supabase
    .from('sets')
    .insert({ workout_exercise_id: workoutExerciseId, set_number: (last?.set_number ?? 0) + 1, ...row })
    .select()
    .single();
  if (error) throw error;
  return data as WorkoutSet;
}

export async function updateSet(
  id: string,
  patch: Partial<Pick<WorkoutSet, 'weight_kg' | 'reps' | 'set_type' | 'rpe'>>
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
  return (data ?? []) as WorkoutSet[];
}
