// "Key lifts" progression (Progress screen). A curated set of headline exercises,
// grouped by muscle group, each surfaced with its all-time best top set, its most
// recent session, and a suggested next target — so before a chest day you can glance
// at where Incline Bench sits and what to aim for. This is Phase-3 scaffolding: the
// data is real (it reuses the same finished-workout sets everything else reads), the
// visual design is deliberately basic and meant to be finalized later.
import { supabase } from '@/lib/supabase';
import type { Exercise, ExerciseModality } from '@/types/db';

// ---------------------------------------------------------------------------
// The curated groups. Three headline lifts per muscle group, referenced by
// canonical_name (resolved against the live directory so ids stay DB-owned).
// Names must match src/data/exercises-curated.json exactly.
// ---------------------------------------------------------------------------
export type KeyLiftGroup = { key: string; label: string; exerciseNames: string[] };

export const KEY_LIFT_GROUPS: KeyLiftGroup[] = [
  { key: 'chest', label: 'Chest', exerciseNames: ['Barbell Bench Press', 'Incline Barbell Bench Press', 'Dumbbell Bench Press'] },
  { key: 'back', label: 'Back', exerciseNames: ['Deadlift', 'Pull-Up', 'Bent-Over Barbell Row'] },
  { key: 'quads', label: 'Quads', exerciseNames: ['Barbell Back Squat', 'Leg Press', 'Leg Extension'] },
  { key: 'hamstring', label: 'Hamstring', exerciseNames: ['Romanian Deadlift', 'Lying Leg Curl', 'Seated Leg Curl'] },
];

/** Every canonical name referenced above (flat), for resolving the directory once. */
export const ALL_KEY_LIFT_NAMES: string[] = KEY_LIFT_GROUPS.flatMap((g) => g.exerciseNames);

// ---------------------------------------------------------------------------
// Per-lift summary shape. A "top set" here is just the pieces the Progress card
// renders — not a full WorkoutSet (this is a partial select).
// ---------------------------------------------------------------------------
export type TopSet = {
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  level: number | null;
};

export type LiftProgress = {
  exerciseId: string;
  sessionCount: number;
  /** All-time best set by the exercise's own metric. */
  best: TopSet | null;
  /** Top set of the most recent finished session, plus when it was. */
  lastDate: string | null;
  lastTop: TopSet | null;
};

/** The single number that ranks a set for this modality (mirrors exercise/[id].tsx). */
export function metricOf(modality: ExerciseModality): (s: TopSet) => number {
  switch (modality) {
    case 'bodyweight_reps':
      return (s) => s.reps ?? 0;
    case 'time':
    case 'distance_time':
      return (s) => s.duration_seconds ?? 0;
    case 'weight_reps':
    case 'weighted_bodyweight':
    default:
      return (s) => s.weight_kg ?? 0;
  }
}

function tiebreakOf(modality: ExerciseModality): (s: TopSet) => number {
  switch (modality) {
    case 'distance_time':
      return (s) => s.level ?? 0;
    case 'weight_reps':
    case 'weighted_bodyweight':
      return (s) => s.reps ?? 0;
    default:
      return () => 0;
  }
}

function pickTop(sets: TopSet[], modality: ExerciseModality): TopSet | null {
  const metric = metricOf(modality);
  const tie = tiebreakOf(modality);
  return sets.reduce<TopSet | null>(
    (best, s) =>
      best == null ||
      metric(s) > metric(best) ||
      (metric(s) === metric(best) && tie(s) > tie(best))
        ? s
        : best,
    null
  );
}

/**
 * Batched progression summary for a set of exercises. One round-trip pulls every
 * finished-workout set for these exercises, then per-exercise bests / last-session
 * tops / session counts are computed in JS. Bounded by the user's own history for a
 * dozen headline lifts, so a single query is fine (a `distinct on` RPC is the future
 * optimization if the key-lift list ever grows large).
 */
export async function getKeyLiftProgress(
  exercises: Pick<Exercise, 'id' | 'modality'>[]
): Promise<Record<string, LiftProgress>> {
  const ids = exercises.map((e) => e.id);
  const modalityById = new Map(exercises.map((e) => [e.id, e.modality] as const));
  const out: Record<string, LiftProgress> = {};
  for (const id of ids) out[id] = { exerciseId: id, sessionCount: 0, best: null, lastDate: null, lastTop: null };
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from('sets')
    .select(
      'weight_kg, reps, duration_seconds, level, workout_exercise:workout_exercises!inner(exercise_id, workout:workouts!inner(id, started_at, ended_at))'
    )
    .in('workout_exercise.exercise_id', ids)
    .not('workout_exercise.workout.ended_at', 'is', null);
  if (error) throw error;

  // Group rows → exerciseId → workoutId → sets, tracking each workout's started_at.
  type Row = { exerciseId: string; workoutId: string; startedAt: string; set: TopSet };
  const rows: Row[] = (data ?? []).map((r: any) => ({
    exerciseId: r.workout_exercise.exercise_id,
    workoutId: r.workout_exercise.workout.id,
    startedAt: r.workout_exercise.workout.started_at,
    // numeric columns can arrive as strings from PostgREST — coerce for real compares.
    set: {
      weight_kg: r.weight_kg == null ? null : Number(r.weight_kg),
      reps: r.reps,
      duration_seconds: r.duration_seconds,
      level: r.level,
    },
  }));

  for (const id of ids) {
    const modality = modalityById.get(id) ?? 'weight_reps';
    const mine = rows.filter((r) => r.exerciseId === id);
    if (mine.length === 0) continue;

    // Session buckets (workoutId → {startedAt, sets}).
    const sessions = new Map<string, { startedAt: string; sets: TopSet[] }>();
    for (const r of mine) {
      const b = sessions.get(r.workoutId);
      if (b) b.sets.push(r.set);
      else sessions.set(r.workoutId, { startedAt: r.startedAt, sets: [r.set] });
    }
    const ordered = [...sessions.values()].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    const best = pickTop(mine.map((r) => r.set), modality);
    const last = ordered[0];
    out[id] = {
      exerciseId: id,
      sessionCount: sessions.size,
      best,
      lastDate: last?.startedAt ?? null,
      lastTop: last ? pickTop(last.sets, modality) : null,
    };
  }

  return out;
}

/**
 * A simple progressive-overload suggestion for the "next target" line. Deliberately
 * naive scaffolding — refine later (e.g. rep-progression schemes, deload logic):
 *   - weighted lifts: same reps, +2.5 kg (one small-plate pair)
 *   - bodyweight reps: +1 rep
 *   - time holds: +10 s
 * Returns kg / reps / seconds in storage units; the screen formats to display units.
 */
export function suggestNextTarget(best: TopSet | null, modality: ExerciseModality): TopSet | null {
  if (!best) return null;
  switch (modality) {
    case 'bodyweight_reps':
      return { ...best, reps: (best.reps ?? 0) + 1 };
    case 'time':
    case 'distance_time':
      return { ...best, duration_seconds: (best.duration_seconds ?? 0) + 10 };
    case 'weight_reps':
    case 'weighted_bodyweight':
    default:
      return { ...best, weight_kg: (best.weight_kg ?? 0) + 2.5 };
  }
}
