// The ONLY module that touches Apple HealthKit — mirrors the "supabase.ts is the
// one place the client is created" rule. Everything above this reads workouts
// through src/data/healthImport.ts, never this file directly.
//
// iOS-ONLY. HealthKit exists on no other platform, and Kratos ships to the
// App Store and nowhere else — there is no Android/web target. Every entry point
// here short-circuits off iOS so callers never need a Platform check of their own.
import { Platform } from 'react-native';
import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
  WorkoutTypeIdentifier,
} from '@kingstinct/react-native-healthkit';

/** A strength session as it exists in Apple Health: only the envelope — a stable
 *  id and a start/end. HealthKit stores NO exercises/sets/reps/weights, which is
 *  exactly why the import creates a blank placeholder, not a detailed workout. */
export type HealthWorkout = {
  uuid: string;
  start: string; // ISO
  end: string; // ISO
};

// The two strength activity types we backfill. Walks, cardio, yoga etc. are
// deliberately ignored — Kratos only tracks lifting.
const STRENGTH_TYPES: ReadonlySet<WorkoutActivityType> = new Set([
  WorkoutActivityType.traditionalStrengthTraining,
  WorkoutActivityType.functionalStrengthTraining,
]);

/** True only on an iOS device that actually has a Health store. */
export function isHealthAvailable(): boolean {
  return Platform.OS === 'ios' && isHealthDataAvailable();
}

/** Prompt for read access to workouts. HealthKit read auth is opaque by design:
 *  this resolves once the sheet is answered but never reveals whether the user
 *  granted reads (Apple's privacy model). We treat a resolved call as "asked";
 *  if the user declined, the query below simply returns nothing. */
export async function requestStrengthPermission(): Promise<boolean> {
  if (!isHealthAvailable()) return false;
  return requestAuthorization({ toRead: [WorkoutTypeIdentifier] });
}

/** Whether iOS would still present the Health permission sheet for workouts.
 *  HealthKit never reveals whether *read* access was granted (Apple's privacy
 *  model), but it does say whether it has already asked — which is what decides
 *  between "the sheet is about to appear" and "answered on an earlier run, send
 *  the user to the Health app". */
export async function healthAuthorizationRequestStatus(): Promise<
  'should-request' | 'already-asked' | 'unknown'
> {
  if (!isHealthAvailable()) return 'unknown';
  try {
    const status = await getRequestStatusForAuthorization({ toRead: [WorkoutTypeIdentifier] });
    if (status === AuthorizationRequestStatus.shouldRequest) return 'should-request';
    if (status === AuthorizationRequestStatus.unnecessary) return 'already-asked';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Strength sessions from the Health store in the last `sinceDays` days. Filtered
 *  to the two strength activity types in JS (robust against predicate-combination
 *  quirks) — the date window is small, so this is cheap. */
export async function readStrengthWorkouts(sinceDays: number): Promise<HealthWorkout[]> {
  if (!isHealthAvailable()) return [];
  const startDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const samples = await queryWorkoutSamples({
    filter: { date: { startDate } },
    limit: 0, // 0/-1 → all samples in range
    ascending: false,
  });
  return samples
    .filter((s) => STRENGTH_TYPES.has(s.workoutActivityType))
    .map((s) => ({
      uuid: s.uuid,
      start: new Date(s.startDate).toISOString(),
      end: new Date(s.endDate).toISOString(),
    }));
}
