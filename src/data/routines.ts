import { supabase } from '@/lib/supabase';
import type { Exercise, Routine, RoutineExercise } from '@/types/db';
import { requireUserId } from './auth';

export type RoutineWithCount = Routine & { exercise_count: number };
export type RoutineExerciseWithExercise = RoutineExercise & { exercise: Exercise };
export type RoutineDetail = Routine & { exercises: RoutineExerciseWithExercise[] };

export async function listRoutines(includeArchived = false): Promise<RoutineWithCount[]> {
  let query = supabase
    .from('routines')
    .select('*, routine_exercises(count)')
    .order('position')
    .order('created_at');
  if (!includeArchived) query = query.eq('archived', false);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    exercise_count: r.routine_exercises?.[0]?.count ?? 0,
    routine_exercises: undefined,
  }));
}

export async function getRoutine(id: string): Promise<RoutineDetail> {
  const { data, error } = await supabase
    .from('routines')
    .select('*, routine_exercises(*, exercise:exercises(*))')
    .eq('id', id)
    .single();
  if (error) throw error;
  const { routine_exercises, ...routine } = data as any;
  const exercises = [...(routine_exercises ?? [])].sort(
    (a: RoutineExercise, b: RoutineExercise) => a.position - b.position
  );
  return { ...routine, exercises };
}

export async function createRoutine(name: string): Promise<Routine> {
  const userId = await requireUserId();
  // New routines go to the end of the list.
  const { data: last } = await supabase
    .from('routines')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('routines')
    .insert({ user_id: userId, name: name.trim(), position: (last?.position ?? -1) + 1 })
    .select()
    .single();
  if (error) throw error;
  return data as Routine;
}

export async function updateRoutine(
  id: string,
  patch: { name?: string; notes?: string | null; position?: number; archived?: boolean }
): Promise<void> {
  const { error } = await supabase.from('routines').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setRoutineArchived(id: string, archived: boolean): Promise<void> {
  await updateRoutine(id, { archived });
}

export type RoutineExerciseInput = {
  exercise_id: string;
  target_sets?: number | null;
  target_reps_low?: number | null;
  target_reps_high?: number | null;
};

/**
 * Replace the routine's exercise list wholesale (delete + insert in order).
 * Simple and safe at Phase 1 scale; positions are the array indexes.
 */
export async function setRoutineExercises(
  routineId: string,
  items: RoutineExerciseInput[]
): Promise<void> {
  const { error: delError } = await supabase
    .from('routine_exercises')
    .delete()
    .eq('routine_id', routineId);
  if (delError) throw delError;
  if (items.length === 0) return;
  const { error } = await supabase.from('routine_exercises').insert(
    items.map((item, index) => ({
      routine_id: routineId,
      exercise_id: item.exercise_id,
      position: index,
      target_sets: item.target_sets ?? null,
      target_reps_low: item.target_reps_low ?? null,
      target_reps_high: item.target_reps_high ?? null,
    }))
  );
  if (error) throw error;
}
