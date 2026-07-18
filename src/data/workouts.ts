import { supabase } from '@/lib/supabase';
import type {
  Exercise,
  LastSessionSet,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '@/types/db';
import { requireUserId } from './auth';

export type WorkoutExerciseDetail = WorkoutExercise & {
  exercise: Exercise;
  sets: WorkoutSet[];
};
export type WorkoutDetail = Workout & {
  routine_name: string | null;
  exercises: WorkoutExerciseDetail[];
};
export type WorkoutListItem = Workout & {
  routine_name: string | null;
  exercise_count: number;
  set_count: number;
};

/**
 * Start a workout. From a routine, its exercises are pre-loaded in order as
 * workout_exercises rows (so mid-workout state survives an app restart).
 * Exercises left with zero sets are deleted by finishWorkout — skipping leaves
 * no empty records.
 */
export async function startWorkout(routineId?: string): Promise<Workout> {
  const userId = await requireUserId();
  const { data: workout, error } = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      routine_id: routineId ?? null,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  if (routineId) {
    const { data: routineExercises, error: reError } = await supabase
      .from('routine_exercises')
      .select('exercise_id, position')
      .eq('routine_id', routineId)
      .order('position');
    if (reError) throw reError;
    if (routineExercises && routineExercises.length > 0) {
      const { error: weError } = await supabase.from('workout_exercises').insert(
        routineExercises.map((re, index) => ({
          workout_id: workout.id,
          exercise_id: re.exercise_id,
          position: index,
        }))
      );
      if (weError) throw weError;
    }
  }
  return workout as Workout;
}

/** Ends the workout; removes exercises that never got a set (skips). */
export async function finishWorkout(workoutId: string): Promise<void> {
  const { data: exercises, error: weError } = await supabase
    .from('workout_exercises')
    .select('id, sets(count)')
    .eq('workout_id', workoutId);
  if (weError) throw weError;
  const emptyIds = (exercises ?? [])
    .filter((we: any) => (we.sets?.[0]?.count ?? 0) === 0)
    .map((we: any) => we.id);
  if (emptyIds.length > 0) {
    const { error } = await supabase.from('workout_exercises').delete().in('id', emptyIds);
    if (error) throw error;
  }
  const { error } = await supabase
    .from('workouts')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', workoutId);
  if (error) throw error;
}

/** Discards an in-progress workout entirely (cascades to exercises/sets). */
export async function discardWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
  if (error) throw error;
}

/** The one unfinished workout, if any (single-device assumption). */
export async function getActiveWorkout(): Promise<Workout | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Workout | null;
}

export async function getWorkout(id: string): Promise<WorkoutDetail> {
  const { data, error } = await supabase
    .from('workouts')
    .select('*, routine:routines(name), workout_exercises(*, exercise:exercises(*), sets(*))')
    .eq('id', id)
    .single();
  if (error) throw error;
  const { workout_exercises, routine, ...workout } = data as any;
  const exercises: WorkoutExerciseDetail[] = [...(workout_exercises ?? [])]
    .sort((a: any, b: any) => a.position - b.position)
    .map((we: any) => ({
      ...we,
      sets: [...(we.sets ?? [])].sort(
        (a: WorkoutSet, b: WorkoutSet) => a.set_number - b.set_number
      ),
    }));
  return { ...workout, routine_name: routine?.name ?? null, exercises };
}

/** Reverse-chronological completed workouts, paginated. */
export async function listWorkouts(page = 0, pageSize = 20): Promise<WorkoutListItem[]> {
  const from = page * pageSize;
  const { data, error } = await supabase
    .from('workouts')
    .select('*, routine:routines(name), workout_exercises(id, sets(count))')
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return (data ?? []).map((w: any) => {
    const { workout_exercises, routine, ...workout } = w;
    return {
      ...workout,
      routine_name: routine?.name ?? null,
      exercise_count: (workout_exercises ?? []).length,
      set_count: (workout_exercises ?? []).reduce(
        (sum: number, we: any) => sum + (we.sets?.[0]?.count ?? 0),
        0
      ),
    };
  });
}

export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string
): Promise<WorkoutExercise> {
  const { data: last } = await supabase
    .from('workout_exercises')
    .select('position')
    .eq('workout_id', workoutId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('workout_exercises')
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      position: (last?.position ?? -1) + 1,
    })
    .select()
    .single();
  if (error) throw error;
  return data as WorkoutExercise;
}

export async function removeWorkoutExercise(workoutExerciseId: string): Promise<void> {
  const { error } = await supabase
    .from('workout_exercises')
    .delete()
    .eq('id', workoutExerciseId);
  if (error) throw error;
}

export async function moveWorkoutExercise(
  workoutId: string,
  workoutExerciseId: string,
  direction: 'up' | 'down'
): Promise<void> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .select('id, position')
    .eq('workout_id', workoutId)
    .order('position');
  if (error) throw error;
  const list = data ?? [];
  const index = list.findIndex((we) => we.id === workoutExerciseId);
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= list.length) return;
  // Swap positions of the two rows.
  const updates = [
    { id: list[index].id, position: list[swapWith].position },
    { id: list[swapWith].id, position: list[index].position },
  ];
  for (const u of updates) {
    const { error: upError } = await supabase
      .from('workout_exercises')
      .update({ position: u.position })
      .eq('id', u.id);
    if (upError) throw upError;
  }
}

/**
 * Last-session recall: sets from the most recent finished workout containing
 * this exercise (excluding the active workout). Backed by last_session_sets().
 */
export async function getLastSession(
  exerciseId: string,
  excludeWorkoutId?: string
): Promise<LastSessionSet[]> {
  const { data, error } = await supabase.rpc('last_session_sets', {
    p_exercise_id: exerciseId,
    p_exclude_workout_id: excludeWorkoutId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as LastSessionSet[];
}

export type ExerciseHistoryEntry = {
  workout_id: string;
  started_at: string;
  sets: WorkoutSet[];
};

/** Every past set of an exercise, grouped by workout, newest first. */
export async function getExerciseHistory(
  exerciseId: string,
  page = 0,
  pageSize = 20
): Promise<ExerciseHistoryEntry[]> {
  const from = page * pageSize;
  const { data, error } = await supabase
    .from('workouts')
    .select('id, started_at, workout_exercises!inner(id, exercise_id, sets(*))')
    .eq('workout_exercises.exercise_id', exerciseId)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return (data ?? []).map((w: any) => ({
    workout_id: w.id,
    started_at: w.started_at,
    sets: (w.workout_exercises ?? [])
      .flatMap((we: any) => we.sets ?? [])
      .sort((a: WorkoutSet, b: WorkoutSet) => a.set_number - b.set_number),
  }));
}
