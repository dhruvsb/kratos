// History export — the DB half. Fetches every finished workout with its exercises
// and sets and serializes them to a Hevy-compatible CSV (see src/lib/hevy.ts),
// so an export round-trips back through the importer and is portable into Hevy.
//
// RLS scopes the read to the signed-in user, like every other repo read. The
// file-write + share sheet live in the screen (src/app/export.tsx) — this stays
// DB-only.
import { supabase } from '@/lib/supabase';
import { serializeHevyCsv, type ExportWorkout } from '@/lib/hevy';
import type { SetType, WorkoutSet } from '@/types/db';

export type HevyExport = {
  csv: string;
  workoutCount: number;
  setCount: number;
  dateRange: { from: string; to: string } | null;
};

/**
 * Build a Hevy-format CSV of all finished workouts, newest-logged data last
 * (chronological) so the file reads like a training diary. Empty history yields a
 * header-only CSV and zeroed counts — the screen surfaces "nothing to export".
 */
export async function buildHevyExport(): Promise<HevyExport> {
  const { data, error } = await supabase
    .from('workouts')
    .select(
      'started_at, ended_at, notes, routine:routines(name), ' +
        'workout_exercises(position, exercise:exercises(canonical_name), sets(*))'
    )
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const workouts: ExportWorkout[] = rows.map((w) => ({
    title: w.routine?.name ?? 'Workout',
    description: w.notes ?? '',
    startedAt: w.started_at,
    endedAt: w.ended_at,
    exercises: [...(w.workout_exercises ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((we) => ({
        title: we.exercise?.canonical_name ?? 'Exercise',
        sets: [...(we.sets ?? [])]
          .sort((a: WorkoutSet, b: WorkoutSet) => a.set_number - b.set_number)
          .map((s: WorkoutSet) => ({
            setType: s.set_type as SetType,
            weightKg: s.weight_kg,
            reps: s.reps,
            distanceKm: null, // not modelled in our schema
            durationSeconds: null,
            rpe: s.rpe,
          })),
      })),
  }));

  const setCount = workouts.reduce(
    (sum, w) => sum + w.exercises.reduce((s, e) => s + e.sets.length, 0),
    0
  );
  const starts = workouts.map((w) => w.startedAt).sort();
  const dateRange = starts.length ? { from: starts[0], to: starts[starts.length - 1] } : null;

  return {
    csv: serializeHevyCsv(workouts),
    workoutCount: workouts.length,
    setCount,
    dateRange,
  };
}
