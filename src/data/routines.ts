import { supabase } from '@/lib/supabase';
import {
  exerciseSchema,
  routineExerciseSchema,
  routineSchema,
  type Exercise,
  type Routine,
  type RoutineExercise,
} from '@/types/db';
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
  // The base row goes through the schema (a numeric-as-string `position` from
  // PostgREST would otherwise slip through typed as a number); the aggregate
  // `routine_exercises(count)` join is derived here and dropped from the result.
  return (data ?? []).map((r: any) => {
    const { routine_exercises, ...routine } = r;
    return {
      ...routineSchema.parse(routine),
      exercise_count: routine_exercises?.[0]?.count ?? 0,
    };
  });
}

export async function getRoutine(id: string): Promise<RoutineDetail> {
  const { data, error } = await supabase
    .from('routines')
    .select('*, routine_exercises(*, exercise:exercises(*))')
    .eq('id', id)
    .single();
  if (error) throw error;
  const { routine_exercises, ...routine } = data as any;
  // Parse every level of the join — routine row, each routine_exercise, and its
  // joined exercise — instead of casting the whole tree (same shape as
  // workouts.getWorkout). `.parse` strips the nested `exercise` key off the
  // routine_exercise, so it's re-attached from its own schema.
  const exercises: RoutineExerciseWithExercise[] = [...(routine_exercises ?? [])]
    .sort((a: any, b: any) => a.position - b.position)
    .map((re: any) => ({
      ...routineExerciseSchema.parse(re),
      exercise: exerciseSchema.parse(re.exercise),
    }));
  return { ...routineSchema.parse(routine), exercises };
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
  return routineSchema.parse(data);
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

/**
 * Permanently delete a routine (hard delete — distinct from archive, which only
 * flips `archived=true`). RLS ("routines all own", user_id = auth.uid()) scopes
 * the delete to the owner, so no client-side ownership filter is needed. The
 * routine's `routine_exercises` are removed automatically by the FK
 * `on delete cascade` (0001_init.sql). Logged *workouts* are independent rows
 * whose `routine_id` FK is `on delete set null`, so training history is untouched
 * — the sessions stay, they just lose the pointer back to the deleted routine.
 */
export async function deleteRoutine(id: string): Promise<void> {
  const { error } = await supabase.from('routines').delete().eq('id', id);
  if (error) throw error;
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

/**
 * Copy a routine — name + its ordered exercise list — as a brand-new routine
 * ("Push A" → "Push A (copy)"). The real gym flow is "start from a similar day
 * and tweak it", so this is pure reuse: no re-picking 8 exercises by hand.
 * `archived` is never copied; the copy lands at the end of the list via
 * createRoutine, and order is preserved because setRoutineExercises re-derives
 * positions from the array index.
 */
export async function duplicateRoutine(routineId: string): Promise<Routine> {
  const source = await getRoutine(routineId);
  const copy = await createRoutine(`${source.name} (copy)`);
  if (source.exercises.length > 0) {
    await setRoutineExercises(
      copy.id,
      source.exercises.map((re) => ({
        exercise_id: re.exercise_id,
        target_sets: re.target_sets,
        target_reps_low: re.target_reps_low,
        target_reps_high: re.target_reps_high,
      }))
    );
  }
  return copy;
}
