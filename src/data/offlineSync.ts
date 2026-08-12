// Offline write queue — the Phase B half of local-first logging.
//
// React Query pauses a mutation while offline and persists it (see the persister
// in src/lib/queryClient). But a persisted mutation is just its *variables* + a
// mutationKey — the mutationFn and the hook's callbacks are gone after an app
// kill. So for every offline-capable mutation we register a **default** keyed by
// its mutationKey: a standalone, self-contained replay function that needs
// nothing but the (serializable) variables. On relaunch, resumePausedMutations()
// pairs each restored mutation back to the fn here and flushes the queue in the
// order it was logged — which, because ids/positions/set_numbers were all chosen
// client-side at log time, replays FK-safe (workout → exercise → set).
//
// The hooks in ./hooks keep their own richer mutationFn (optimistic patches, the
// in-session FK guard) for the online path; these defaults are the resume path.
// Both share these variable shapes, so a mutation created online replays offline.
import type { QueryClient } from '@tanstack/react-query';
import * as sets from './sets';
import * as workouts from './workouts';
import type { Exercise } from '@/types/db';

// Stable keys for the mutations that must survive offline. Only the active-logging
// path is offline-capable; everything else (history, calendar, voice, imports)
// stays online-only and simply waits for a connection.
export const mutationKeys = {
  startWorkout: ['startWorkout'] as const,
  finishWorkout: ['finishWorkout'] as const,
  discardWorkout: ['discardWorkout'] as const,
  addExerciseToWorkout: ['addExerciseToWorkout'] as const,
  addSet: ['addSet'] as const,
  updateSet: ['updateSet'] as const,
  deleteSet: ['deleteSet'] as const,
};

// Variable shapes — each fully self-contained + serializable (no closures), so a
// persisted mutation can replay from its variables alone.
export type StartVars = { routineId?: string; plan?: { preset: workouts.StartPreset } | null };
export type AddExerciseVars = { workoutId: string; exercise: Exercise; id: string; position: number };
export type AddSetVars = {
  workoutExerciseId: string;
  set: sets.AddSetInput;
  id: string;
  setNumber: number;
};
export type UpdateSetVars = { setId: string; patch: Parameters<typeof sets.updateSet>[1] };
export type DeleteSetVars = string;
export type FinishVars = { workoutId: string };
export type DiscardVars = { workoutId: string };

// First-segment strings of every offline-capable mutation key, for a cheap
// membership test when deciding which mutations may be persisted / re-driven.
const offlineMutationKeySet = new Set<string>(Object.values(mutationKeys).map((k) => k[0]));

/** True if a mutationKey belongs to the offline-capable logging path — i.e. it has a
 *  registered replay default and is safe to re-drive from its (serializable) variables
 *  after an app kill. Used to persist *running* logging writes (not just paused ones)
 *  so an online set-log interrupted mid-request survives to be re-driven on relaunch. */
export function isOfflineMutationKey(key: unknown): boolean {
  return Array.isArray(key) && typeof key[0] === 'string' && offlineMutationKeySet.has(key[0]);
}

// The replay functions. Each is a pure insert/update/delete built entirely from
// variables — no server read, no in-memory state — so it is safe to run cold.
export const offlineMutationFns = {
  startWorkout: (v: StartVars) => workouts.startWorkout(v.routineId, v.plan?.preset ?? undefined),
  addExerciseToWorkout: (v: AddExerciseVars) =>
    workouts.addExerciseToWorkout(v.workoutId, v.exercise.id, { id: v.id, position: v.position }),
  addSet: (v: AddSetVars) => sets.addSet(v.workoutExerciseId, v.set, v.setNumber, v.id),
  updateSet: (v: UpdateSetVars) => sets.updateSet(v.setId, v.patch),
  deleteSet: (setId: DeleteSetVars) => sets.deleteSet(setId),
  finishWorkout: (v: FinishVars) => workouts.finishWorkout(v.workoutId),
  discardWorkout: (v: DiscardVars) => workouts.discardWorkout(v.workoutId),
};

// After a resumed write lands, the hook's own onSettled won't run (the screen
// that fired it is long gone), so the default reconciles the caches a logged set
// touches. Broad-but-cheap: these keys only matter after a rare offline flush.
function reconcileAfterSync(qc: QueryClient) {
  return () => {
    for (const key of [
      ['workout'],
      ['activeWorkout'],
      ['workoutList'],
      ['lastSession'],
      ['exerciseHistory'],
    ]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

let registered = false;

/** Register the replay fns as mutation defaults. Must run before the persisted
 *  cache hydrates so resumed mutations find their fn. Idempotent. */
export function registerOfflineMutationDefaults(qc: QueryClient): void {
  if (registered) return;
  registered = true;
  const onSettled = reconcileAfterSync(qc);
  // networkMode 'online' = pause (don't fail) while disconnected; retry rides out
  // a transient error on reconnect before giving up.
  const common = { networkMode: 'online' as const, retry: 3, onSettled };
  qc.setMutationDefaults(mutationKeys.startWorkout, {
    mutationFn: offlineMutationFns.startWorkout as (v: unknown) => Promise<unknown>,
    ...common,
  });
  qc.setMutationDefaults(mutationKeys.addExerciseToWorkout, {
    mutationFn: offlineMutationFns.addExerciseToWorkout as (v: unknown) => Promise<unknown>,
    ...common,
  });
  qc.setMutationDefaults(mutationKeys.addSet, {
    mutationFn: offlineMutationFns.addSet as (v: unknown) => Promise<unknown>,
    ...common,
  });
  qc.setMutationDefaults(mutationKeys.updateSet, {
    mutationFn: offlineMutationFns.updateSet as (v: unknown) => Promise<unknown>,
    ...common,
  });
  qc.setMutationDefaults(mutationKeys.deleteSet, {
    mutationFn: offlineMutationFns.deleteSet as (v: unknown) => Promise<unknown>,
    ...common,
  });
  qc.setMutationDefaults(mutationKeys.finishWorkout, {
    mutationFn: offlineMutationFns.finishWorkout as (v: unknown) => Promise<unknown>,
    ...common,
  });
  qc.setMutationDefaults(mutationKeys.discardWorkout, {
    mutationFn: offlineMutationFns.discardWorkout as (v: unknown) => Promise<unknown>,
    ...common,
  });
}
