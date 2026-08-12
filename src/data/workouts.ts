import { supabase } from '@/lib/supabase';
import {
  exerciseSchema,
  lastSessionSetSchema,
  workoutSchema,
  workoutExerciseSchema,
  workoutSetSchema,
  type Exercise,
  type LastSessionSet,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
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
  /** Total volume for the session in kg: Σ weight_kg × reps across every set. */
  volume_kg: number;
};

/** Client-chosen ids for an optimistic start: the UI seeds its cache with these
 *  and navigates immediately; the insert below writes the same ids so every row
 *  the user is already touching exists once the background write lands. */
export type StartPreset = {
  workoutId: string;
  startedAt: string;
  exercises: { id: string; exerciseId: string }[];
};

/**
 * Start a workout. From a routine, its exercises are pre-loaded in order as
 * workout_exercises rows (so mid-workout state survives an app restart).
 * Exercises left with zero sets are deleted by finishWorkout — skipping leaves
 * no empty records.
 *
 * With a `preset` (built from the cached routine detail), rows are inserted
 * under the client's ids and the routine_exercises SELECT is skipped — one
 * fewer round-trip, and the caller never has to wait for this to navigate.
 */
export async function startWorkout(
  routineId?: string,
  preset?: StartPreset
): Promise<Workout> {
  const userId = await requireUserId();
  const { data: workout, error } = await supabase
    .from('workouts')
    .insert({
      ...(preset ? { id: preset.workoutId } : {}),
      user_id: userId,
      routine_id: routineId ?? null,
      started_at: preset?.startedAt ?? new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  if (preset) {
    if (preset.exercises.length > 0) {
      const { error: weError } = await supabase.from('workout_exercises').insert(
        preset.exercises.map((e, index) => ({
          id: e.id,
          workout_id: preset.workoutId,
          exercise_id: e.exerciseId,
          position: index,
        }))
      );
      if (weError) throw weError;
    }
  } else if (routineId) {
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
  return workoutSchema.parse(workout);
}

/** Ends the workout; removes exercises that never got a set (skips). */
/** Finish an in-progress workout. Zero-set exercises are dropped; a workout that
 *  logged *nothing at all* is discarded rather than finished (returns
 *  `{ discarded: true }`) — an empty finished workout is meaningless data and would
 *  show as "0 EXERCISES · 0 SETS" in History. Callers navigate to the summary only
 *  when it actually finished. This is the backstop guard: the workout screen also
 *  blocks a zero-set finish at the UI, but enforcing it here means no caller (offline
 *  replay, a future resume-from-Home action) can ever leave an empty shell. */
export async function finishWorkout(workoutId: string): Promise<{ discarded: boolean }> {
  const { data: exercises, error: weError } = await supabase
    .from('workout_exercises')
    .select('id, sets(count)')
    .eq('workout_id', workoutId);
  if (weError) throw weError;
  const setCount = (we: any) => we.sets?.[0]?.count ?? 0;
  const totalSets = (exercises ?? []).reduce((n: number, we: any) => n + setCount(we), 0);

  if (totalSets === 0) {
    const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
    if (error) throw error;
    return { discarded: true };
  }

  const emptyIds = (exercises ?? []).filter((we: any) => setCount(we) === 0).map((we: any) => we.id);
  if (emptyIds.length > 0) {
    const { error } = await supabase.from('workout_exercises').delete().in('id', emptyIds);
    if (error) throw error;
  }
  const { error } = await supabase
    .from('workouts')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', workoutId);
  if (error) throw error;
  return { discarded: false };
}

/** Discards an in-progress workout entirely (cascades to exercises/sets). */
export async function discardWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', workoutId);
  if (error) throw error;
}

/**
 * Permanently deletes every workout (and thus every logged set) for the signed-in
 * user, leaving routines, custom exercises and the profile intact — the "wipe my
 * test data, start clean" action. Server side is `public.clear_own_workouts()`
 * (migration 0008), a security-definer RPC scoped to `auth.uid()`, so this can
 * never touch another account. The FK cascade handles the children.
 */
export async function clearAllWorkouts(): Promise<void> {
  const { error } = await supabase.rpc('clear_own_workouts');
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
  return data ? workoutSchema.parse(data) : null;
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
      exercise: exerciseSchema.parse(we.exercise),
      // Parse the sets: weight_kg/rpe are numeric columns PostgREST may serialize
      // as strings, and these rows drive the live grid + volume math downstream.
      sets: workoutSetSchema
        .array()
        .parse(we.sets ?? [])
        .sort((a, b) => a.set_number - b.set_number),
    }));
  return { ...workoutSchema.parse(workout), routine_name: routine?.name ?? null, exercises };
}

/** Reverse-chronological completed workouts, paginated. */
export async function listWorkouts(page = 0, pageSize = 20): Promise<WorkoutListItem[]> {
  const from = page * pageSize;
  const { data, error } = await supabase
    .from('workouts')
    .select('*, routine:routines(name), workout_exercises(id, sets(weight_kg, reps))')
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  return (data ?? []).map((w: any) => {
    const { workout_exercises, routine, ...workout } = w;
    const wes = workout_exercises ?? [];
    let setCount = 0;
    let volume = 0;
    for (const we of wes) {
      for (const s of we.sets ?? []) {
        setCount += 1;
        // weight_kg is a numeric column PostgREST may return as a string; Number()
        // guards the volume sum against string concatenation / NaN (this select is
        // partial, so it can't go through workoutSetSchema).
        volume += Number(s.weight_kg ?? 0) * Number(s.reps ?? 0);
      }
    }
    return {
      ...workout,
      routine_name: routine?.name ?? null,
      exercise_count: wes.length,
      set_count: setCount,
      volume_kg: volume,
    };
  });
}

/** Per-workout PR ("records") counts, keyed by workout id (feedback #35). A workout not
 *  in the map has 0 PRs. Computed by the `workout_pr_counts` RPC (migration 0007) —
 *  heaviest weight among reps-≥-6 sets beating every earlier session of that exercise. */
export async function getWorkoutPrCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('workout_pr_counts');
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as { workout_id: string; pr_count: number }[]) {
    map[row.workout_id] = row.pr_count;
  }
  return map;
}

/** With a `preset` (id + position chosen from the cached workout detail) the
 *  position SELECT is skipped and the row lands under the client's id — same
 *  optimistic contract as startWorkout's preset. */
export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
  preset?: { id: string; position: number }
): Promise<WorkoutExercise> {
  // Dedupe: the same exercise is only ever in a workout once. A second add (double-
  // tap in the picker, or a re-add of one already present) returns the existing row
  // as a no-op — the optimistic cache's transient duplicate collapses on the next
  // refetch. Keeps the set grid from splitting one lift across two chips.
  const { data: existing, error: existingError } = await supabase
    .from('workout_exercises')
    .select('*')
    .eq('workout_id', workoutId)
    .eq('exercise_id', exerciseId)
    .order('position')
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return workoutExerciseSchema.parse(existing);

  let position = preset?.position;
  if (position == null) {
    const { data: last } = await supabase
      .from('workout_exercises')
      .select('position')
      .eq('workout_id', workoutId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    position = (last?.position ?? -1) + 1;
  }
  const { data, error } = await supabase
    .from('workout_exercises')
    .insert({
      ...(preset ? { id: preset.id } : {}),
      workout_id: workoutId,
      exercise_id: exerciseId,
      position,
    })
    .select()
    .single();
  if (error) throw error;
  return workoutExerciseSchema.parse(data);
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
  return lastSessionSetSchema.array().parse(data ?? []);
}

export type ExerciseBest = { exercise_id: string; weight_kg: number; reps: number | null };

/** All-time top set per exercise (heaviest weight, reps as tie-break) across
 *  *finished* workouts, excluding `excludeWorkoutId` — the baseline the finish
 *  summary compares against for its NEW BESTS callout. One tiny indexed query
 *  per exercise (a finished workout has ≤ a handful), fired in parallel; a
 *  `distinct on` RPC is the future optimization if this ever grows. */
export async function getExerciseBests(
  exerciseIds: string[],
  excludeWorkoutId?: string
): Promise<ExerciseBest[]> {
  const bests = await Promise.all(
    exerciseIds.map(async (exerciseId) => {
      let query = supabase
        .from('sets')
        .select(
          'weight_kg, reps, workout_exercise:workout_exercises!inner(exercise_id, workout:workouts!inner(id, ended_at))'
        )
        .eq('workout_exercise.exercise_id', exerciseId)
        .not('workout_exercise.workout.ended_at', 'is', null)
        .not('weight_kg', 'is', null)
        .order('weight_kg', { ascending: false })
        .order('reps', { ascending: false })
        .limit(1);
      if (excludeWorkoutId) {
        query = query.neq('workout_exercise.workout.id', excludeWorkoutId);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (!data || data.weight_kg == null) return null;
      // weight_kg numeric may arrive as a string; coerce so the NEW BESTS
      // comparison in finish/[id].tsx is a numeric compare, not string ordering.
      return { exercise_id: exerciseId, weight_kg: Number(data.weight_kg), reps: data.reps };
    })
  );
  return bests.filter((b): b is ExerciseBest => b != null);
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
    sets: workoutSetSchema
      .array()
      .parse((w.workout_exercises ?? []).flatMap((we: any) => we.sets ?? []))
      .sort((a, b) => a.set_number - b.set_number),
  }));
}
