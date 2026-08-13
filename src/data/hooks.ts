// React Query hooks over the repositories. Screens import from here (or the
// repositories) — never from src/lib/supabase.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import * as auth from './auth';
import * as exercises from './exercises';
import * as health from './healthImport';
import * as importer from './import';
import * as routines from './routines';
import type { RoutineDetail } from './routines';
import * as sets from './sets';
import * as voice from './voice';
import * as workouts from './workouts';
import type { WorkoutDetail, WorkoutExerciseDetail } from './workouts';
import type { Exercise, Workout, WorkoutSet } from '@/types/db';
import {
  mutationKeys,
  type AddExerciseVars,
  type AddSetVars,
} from './offlineSync';
import { newUuid } from '@/lib/ids';
import type { BodyRegion } from '@/lib/muscles';

export const keys = {
  profile: ['profile'] as const,
  routines: (includeArchived: boolean) => ['routines', includeArchived] as const,
  routine: (id: string) => ['routine', id] as const,
  exerciseSearch: (q: string, region?: string | null) =>
    ['exerciseSearch', q, region ?? null] as const,
  exerciseDirectory: ['exerciseDirectory'] as const,
  exercise: (id: string) => ['exercise', id] as const,
  activeWorkout: ['activeWorkout'] as const,
  workout: (id: string) => ['workout', id] as const,
  workoutList: ['workoutList'] as const,
  workoutPrCounts: ['workoutPrCounts'] as const,
  lastSession: (exerciseId: string, exclude?: string) =>
    ['lastSession', exerciseId, exclude ?? null] as const,
  exerciseHistory: (exerciseId: string) => ['exerciseHistory', exerciseId] as const,
};

const PAGE_SIZE = 20;

// staleTime tiers (paired with the on-disk persist cache in src/lib/queryClient).
// Every mutation below invalidates the keys it touches, and invalidation refetches
// regardless of staleTime — so a longer staleTime never hides our *own* writes. It
// only suppresses redundant passive refetch-on-mount, which is what lets a screen
// re-open instantly off the warm cache. This is a single-device app, so external
// (multi-device) staleness isn't a concern; freshness is tiered by how volatile
// each thing is.
const MINUTE = 60 * 1000;
const STALE = {
  profile: 30 * MINUTE, // only the unit toggle changes it, and that's optimistic
  routines: 5 * MINUTE, // edits invalidate
  exercise: 60 * MINUTE, // exercise metadata is effectively static
  exerciseSearch: 5 * MINUTE, // directory is near-static; new customs invalidate
  activeWorkout: 30 * 1000, // cheap pointer; keep it fairly fresh
  workout: MINUTE, // set writes invalidate; this just stops the remount refetch-flash
  workoutList: 5 * MINUTE, // finishing / deleting a workout invalidates
  workoutPrCounts: 5 * MINUTE, // recomputed on finish/discard/delete (same as the list)
  lastSession: 5 * MINUTE, // doesn't change mid-workout
  exerciseHistory: 5 * MINUTE, // finishing / deleting invalidates
} as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: auth.getProfile, staleTime: STALE.profile });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof auth.updateProfile>[0]) => auth.updateProfile(patch),
    // Optimistic so the whole app's weight display flips units on the same tap.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.profile });
      const prev = qc.getQueryData(keys.profile);
      qc.setQueryData(keys.profile, (p: Awaited<ReturnType<typeof auth.getProfile>>) =>
        p ? { ...p, ...patch } : p
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(keys.profile, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.profile }),
  });
}

export function useRoutines(includeArchived = false) {
  return useQuery({
    queryKey: keys.routines(includeArchived),
    queryFn: () => routines.listRoutines(includeArchived),
    staleTime: STALE.routines,
  });
}

export function useRoutine(id: string | undefined) {
  return useQuery({
    queryKey: keys.routine(id ?? ''),
    queryFn: () => routines.getRoutine(id!),
    enabled: !!id,
    staleTime: STALE.routines,
  });
}

/** The whole curated directory, cached + persisted so the picker can search it
 *  locally when offline. Near-static, so a long staleTime; new customs invalidate
 *  it. Prefetched from the workout screen so it's warm before a connection drops. */
export function useExerciseDirectory() {
  return useQuery({
    queryKey: keys.exerciseDirectory,
    queryFn: exercises.listAllExercises,
    staleTime: STALE.exercise,
  });
}

/** Warm the directory into the cache (so the picker can search it offline) without
 *  holding its data in the calling screen. Mounted on the workout screen — a lift
 *  usually starts online, so this lands the list on disk before a connection drops. */
export function usePrefetchExerciseDirectory() {
  const qc = useQueryClient();
  useEffect(() => {
    void qc.prefetchQuery({
      queryKey: keys.exerciseDirectory,
      queryFn: exercises.listAllExercises,
      staleTime: STALE.exercise,
    });
  }, [qc]);
}

export function useExerciseSearch(query: string, region?: BodyRegion | null) {
  return useQuery({
    queryKey: keys.exerciseSearch(query, region),
    queryFn: () => exercises.searchExercises(query, region),
    placeholderData: (prev) => prev, // keep old results while typing / switching region
    staleTime: STALE.exerciseSearch,
  });
}

export function useExercise(id: string | undefined) {
  return useQuery({
    queryKey: keys.exercise(id ?? ''),
    queryFn: () => exercises.getExercise(id!),
    enabled: !!id,
    staleTime: STALE.exercise,
  });
}

export function useActiveWorkout() {
  return useQuery({
    queryKey: keys.activeWorkout,
    queryFn: workouts.getActiveWorkout,
    staleTime: STALE.activeWorkout,
  });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: keys.workout(id ?? ''),
    queryFn: () => workouts.getWorkout(id!),
    enabled: !!id,
    staleTime: STALE.workout,
  });
}

export function useWorkoutList() {
  return useInfiniteQuery({
    queryKey: keys.workoutList,
    queryFn: ({ pageParam }) => workouts.listWorkouts(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PAGE_SIZE ? undefined : pages.length,
    staleTime: STALE.workoutList,
  });
}

/** Per-workout PR counts (feedback #35), keyed by workout id. Recomputed whenever a
 *  workout finishes/discards/deletes (those invalidate this key alongside the list). */
export function useWorkoutPrCounts() {
  return useQuery({
    queryKey: keys.workoutPrCounts,
    queryFn: workouts.getWorkoutPrCounts,
    staleTime: STALE.workoutPrCounts,
  });
}

/** Last-session panel data. Cached so re-opening an exercise renders instantly. */
export function useLastSession(exerciseId: string, excludeWorkoutId?: string) {
  return useQuery({
    queryKey: keys.lastSession(exerciseId, excludeWorkoutId),
    queryFn: () => workouts.getLastSession(exerciseId, excludeWorkoutId),
    staleTime: STALE.lastSession,
  });
}

/** Warm each routine's full detail from Home so START can build the whole workout
 *  locally (buildStartPlan reads this cache) and navigate without a network wait.
 *  prefetchQuery no-ops while the cached copy is still fresh, so re-renders are free. */
export function usePrefetchRoutineDetails(routineIds: string[] | undefined) {
  const qc = useQueryClient();
  const idsKey = routineIds?.join(',') ?? '';
  useEffect(() => {
    if (!idsKey) return;
    for (const id of idsKey.split(',')) {
      void qc.prefetchQuery({
        queryKey: keys.routine(id),
        queryFn: () => routines.getRoutine(id),
        staleTime: STALE.routines,
      });
    }
  }, [qc, idsKey]);
}

/** Warm the last-session panel for every exercise in the workout at once (the 80%
 *  case: this session repeats last session's exercises), so switching exercises
 *  mid-workout shows PREV + prefill instantly from cache instead of fetching. */
export function usePrefetchLastSessions(
  workoutId: string | undefined,
  exerciseIds: string[] | undefined
) {
  const qc = useQueryClient();
  const idsKey = exerciseIds?.join(',') ?? '';
  useEffect(() => {
    if (!workoutId || !idsKey) return;
    for (const exerciseId of idsKey.split(',')) {
      void qc.prefetchQuery({
        queryKey: keys.lastSession(exerciseId, workoutId),
        queryFn: () => workouts.getLastSession(exerciseId, workoutId),
        staleTime: STALE.lastSession,
      });
    }
  }, [qc, workoutId, idsKey]);
}

/** Pre-workout all-time bests for the finish summary's NEW BESTS callout.
 *  Excludes the finished workout itself, so the result stays valid while that
 *  workout's own rows are still syncing (offline queue) — no invalidation
 *  coupling. Offline, this simply never resolves and the section is omitted. */
export function useExerciseBests(workoutId: string | undefined, exerciseIds: string[]) {
  return useQuery({
    queryKey: ['exerciseBests', workoutId ?? '', ...exerciseIds],
    queryFn: () => workouts.getExerciseBests(exerciseIds, workoutId),
    enabled: !!workoutId && exerciseIds.length > 0,
    staleTime: 30 * MINUTE, // the pre-workout baseline never changes for this id
  });
}

export function useExerciseHistory(exerciseId: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.exerciseHistory(exerciseId ?? ''),
    queryFn: ({ pageParam }) =>
      workouts.getExerciseHistory(exerciseId!, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PAGE_SIZE ? undefined : pages.length,
    enabled: !!exerciseId,
    staleTime: STALE.exerciseHistory,
  });
}

// ---------------------------------------------------------------------------
// Mutations (each invalidates the queries it can affect)
// ---------------------------------------------------------------------------

export function useCreateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => routines.createRoutine(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  });
}

export function useUpdateRoutine(routineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof routines.updateRoutine>[1]) =>
      routines.updateRoutine(routineId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: keys.routine(routineId) });
    },
  });
}

// Routine-list actions (long-press menu on the Routines tab). These take the id in
// the mutation variables — unlike useUpdateRoutine above, which is bound to the one
// routine an editor screen owns — because the list acts on whichever row was held.
// `['routines']` is a prefix invalidation: keys.routines() is parameterized by
// includeArchived, so both variants refresh.

export function useDuplicateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) => routines.duplicateRoutine(routineId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines'] }),
  });
}

export function useRenameRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      routines.updateRoutine(id, { name }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: keys.routine(id) });
    },
  });
}

export function useArchiveRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      routines.setRoutineArchived(id, archived),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: keys.routine(id) });
    },
  });
}

export function useSetRoutineExercises(routineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: routines.RoutineExerciseInput[]) =>
      routines.setRoutineExercises(routineId, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: keys.routine(routineId) });
    },
  });
}

// --- Optimistic start ------------------------------------------------------
// START navigates to the grid on the same tap: the client picks every row id
// (workout + workout_exercises), seeds the cache, and the insert runs in the
// background under those same ids. Child writes (log a set, add an exercise,
// finish, discard) first await any in-flight insert for their workout so a
// write can never reach the DB before its FK target exists.

const pendingWorkoutInserts = new Map<string, Promise<unknown>>();

function trackWorkoutInsert(workoutId: string, insert: Promise<unknown>) {
  pendingWorkoutInserts.set(workoutId, insert);
  // Detach a handled branch so a failed background insert never surfaces as an
  // unhandled rejection; awaiters of the original promise still see the error.
  insert.catch(() => {}).then(() => pendingWorkoutInserts.delete(workoutId));
}

/** Resolves once the workout's row exists server-side (no-op when it already
 *  does). Rejects if the start insert failed — the child mutation then fails
 *  too and rolls back its own optimistic patch. */
async function awaitWorkoutCommitted(workoutId: string) {
  const pending = pendingWorkoutInserts.get(workoutId);
  if (pending) await pending;
}

export type StartPlan = {
  /** Optimistic WorkoutDetail seeded into `keys.workout(id)` before navigating. */
  detail: WorkoutDetail;
  /** The same ids, in the shape the repository inserts them. */
  preset: workouts.StartPreset;
};

/** Build a complete local workout from the cached routine detail. Returns null
 *  when the routine's detail isn't cached yet (cold cache) — the caller then
 *  falls back to the classic await-the-server path. */
export function buildStartPlan(qc: QueryClient, routineId?: string): StartPlan | null {
  const startedAt = new Date().toISOString();
  const workoutId = newUuid();
  let routineName: string | null = null;
  let exercisesDetail: WorkoutExerciseDetail[] = [];

  if (routineId) {
    const routine = qc.getQueryData<RoutineDetail>(keys.routine(routineId));
    if (!routine) return null;
    routineName = routine.name;
    exercisesDetail = routine.exercises.map((re, index) => ({
      id: newUuid(),
      workout_id: workoutId,
      exercise_id: re.exercise_id,
      position: index,
      created_at: startedAt,
      exercise: re.exercise,
      sets: [],
    }));
  }

  return {
    detail: {
      id: workoutId,
      // Not rendered anywhere; the background refetch fills in the real value.
      user_id: '',
      routine_id: routineId ?? null,
      title: null,
      started_at: startedAt,
      ended_at: null,
      notes: null,
      external_id: null,
      created_at: startedAt,
      routine_name: routineName,
      exercises: exercisesDetail,
    },
    preset: {
      workoutId,
      startedAt,
      exercises: exercisesDetail.map((we) => ({ id: we.id, exerciseId: we.exercise_id })),
    },
  };
}

type StartCtx = { planId?: string; prevActive?: Workout | null };

export function useStartWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.startWorkout,
    mutationFn: ({ routineId, plan }: { routineId?: string; plan?: StartPlan | null }) => {
      if (!plan) return workouts.startWorkout(routineId);
      const insert = workouts.startWorkout(routineId, plan.preset);
      trackWorkoutInsert(plan.preset.workoutId, insert);
      return insert;
    },
    onMutate: async ({ plan }): Promise<StartCtx> => {
      if (!plan) return {};
      await qc.cancelQueries({ queryKey: keys.activeWorkout });
      const prevActive = qc.getQueryData<Workout | null>(keys.activeWorkout);
      const { routine_name: _n, exercises: _e, ...workoutRow } = plan.detail;
      qc.setQueryData<WorkoutDetail>(keys.workout(plan.detail.id), plan.detail);
      qc.setQueryData<Workout | null>(keys.activeWorkout, workoutRow);
      return { planId: plan.detail.id, prevActive };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx?.planId) return;
      qc.removeQueries({ queryKey: keys.workout(ctx.planId) });
      if (ctx.prevActive !== undefined) qc.setQueryData(keys.activeWorkout, ctx.prevActive);
      else qc.removeQueries({ queryKey: keys.activeWorkout });
    },
    onSettled: (_d, _e, { plan }) => {
      void qc.invalidateQueries({ queryKey: keys.activeWorkout });
      if (plan) void qc.invalidateQueries({ queryKey: keys.workout(plan.detail.id) });
    },
  });
}

// Optimistic finish: callers navigate to the summary immediately after mutate(),
// so the cache must already look finished when that screen mounts. Mirrors the
// server's behaviour (ended_at set, zero-set exercises dropped); rolls back and
// the caller returns the user to the grid if the write fails.
type FinishCtx = { prevDetail?: WorkoutDetail; prevActive?: Workout | null };

export function useFinishWorkout(workoutId: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationKey: mutationKeys.finishWorkout,
    // workoutId travels in the variables (not just the closure) so a finish
    // logged offline can replay from its persisted variables after an app kill.
    mutationFn: async (v: { workoutId: string }) => {
      await awaitWorkoutCommitted(v.workoutId);
      return workouts.finishWorkout(v.workoutId);
    },
    onMutate: async (): Promise<FinishCtx> => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) });
      await qc.cancelQueries({ queryKey: keys.activeWorkout });
      const prevDetail = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId));
      const prevActive = qc.getQueryData<Workout | null>(keys.activeWorkout);
      if (prevDetail) {
        qc.setQueryData<WorkoutDetail>(keys.workout(workoutId), {
          ...prevDetail,
          ended_at: new Date().toISOString(),
          exercises: prevDetail.exercises.filter((we) => we.sets.length > 0),
        });
      }
      if (prevActive?.id === workoutId) qc.setQueryData(keys.activeWorkout, null);
      return { prevDetail, prevActive };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevDetail) qc.setQueryData(keys.workout(workoutId), ctx.prevDetail);
      if (ctx?.prevActive !== undefined) qc.setQueryData(keys.activeWorkout, ctx.prevActive);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.activeWorkout });
      void qc.invalidateQueries({ queryKey: keys.workoutList });
      void qc.invalidateQueries({ queryKey: keys.workoutPrCounts }); // this session may set PRs
      void qc.invalidateQueries({ queryKey: keys.workout(workoutId) });
      // Finishing adds today to the worked days, so Home's streak + heatmap are
      // now stale (`useWorkoutDays` in data/calendar.ts). Without this the hero
      // streak keeps showing today as un-worked until the next cold start.
      void qc.invalidateQueries({ queryKey: ['workoutDays'] });
      // Finished workout becomes someone's "last session".
      void qc.invalidateQueries({ queryKey: ['lastSession'] });
      void qc.invalidateQueries({ queryKey: ['exerciseHistory'] });
    },
  });

  // Inject workoutId so callers keep the argless `mutate(options)` call shape.
  const mutate = (options?: Parameters<typeof mutation.mutate>[1]) =>
    mutation.mutate({ workoutId }, options);
  return { ...mutation, mutate };
}

// Optimistic discard: the resume card / grid clear on the same tap; rollback
// restores the active-workout pointer if the delete fails.
export function useDiscardWorkout(workoutId: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationKey: mutationKeys.discardWorkout,
    mutationFn: async (v: { workoutId: string }) => {
      await awaitWorkoutCommitted(v.workoutId);
      return workouts.discardWorkout(v.workoutId);
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: keys.activeWorkout });
      const prevActive = qc.getQueryData<Workout | null>(keys.activeWorkout);
      if (prevActive?.id === workoutId) qc.setQueryData(keys.activeWorkout, null);
      return { prevActive };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevActive !== undefined) qc.setQueryData(keys.activeWorkout, ctx.prevActive);
    },
    onSuccess: () => {
      // The row is gone — drop its detail so nothing can refetch a 404.
      qc.removeQueries({ queryKey: keys.workout(workoutId) });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.activeWorkout });
      void qc.invalidateQueries({ queryKey: keys.workoutList });
      // Removing a workout can change whether *later* sessions were PRs.
      void qc.invalidateQueries({ queryKey: keys.workoutPrCounts });
    },
  });

  const mutate = (options?: Parameters<typeof mutation.mutate>[1]) =>
    mutation.mutate({ workoutId }, options);
  return { ...mutation, mutate };
}

/** Delete a *finished* workout from history (mockup 17 — "wrong day entirely").
 *  Same underlying delete as discard, but reconciles the history + progress caches
 *  a finished session feeds instead of the active-workout slot. */
export function useDeleteWorkout(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => workouts.discardWorkout(workoutId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.workoutList });
      qc.invalidateQueries({ queryKey: keys.workoutPrCounts });
      qc.invalidateQueries({ queryKey: keys.activeWorkout });
      qc.removeQueries({ queryKey: keys.workout(workoutId) });
      // Deleting a *finished* workout removes one of the worked days, so Home's
      // streak + heatmap must refetch (same reason as useFinishWorkout).
      qc.invalidateQueries({ queryKey: ['workoutDays'] });
      qc.invalidateQueries({ queryKey: ['lastSession'] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory'] });
    },
  });
}

/** Wipe *all* finished-workout history for the signed-in user (Settings → DATA →
 *  "Clear all history"), keeping routines / custom exercises / profile. Backed by
 *  the `clear_own_workouts` RPC (migration 0008, auth.uid()-scoped).
 *
 *  This is a local-first app with a persisted React Query cache, so the DB delete
 *  alone would leave stale rows on screen — every workout-facing query is
 *  invalidated (and the now-dangling per-workout detail / bests caches removed) so
 *  History, Home, the PR badges and the Calendar all empty immediately. The caller
 *  is expected to block this while a workout is active (see settings.tsx), so the
 *  active-workout slot is invalidated defensively rather than optimistically cleared. */
export function useClearAllWorkouts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => workouts.clearAllWorkouts(),
    onSuccess: () => {
      // History / Home feed + per-session PR badges.
      qc.invalidateQueries({ queryKey: keys.workoutList });
      qc.invalidateQueries({ queryKey: keys.workoutPrCounts });
      // Calendar heatmap (its hook lives in data/calendar.ts under ['workoutDays']).
      qc.invalidateQueries({ queryKey: ['workoutDays'] });
      // Active-workout pointer (defensive — clear is blocked while one is running).
      qc.invalidateQueries({ queryKey: keys.activeWorkout });
      // Per-exercise recall + progress views.
      qc.invalidateQueries({ queryKey: ['lastSession'] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory'] });
      // Every workout row is gone — drop the now-dangling per-workout detail and
      // finish-summary bests caches so nothing refetches a 404.
      qc.removeQueries({ queryKey: ['workout'] });
      qc.removeQueries({ queryKey: ['exerciseBests'] });
    },
  });
}

/** Commit a Hevy import plan. Touches history, calendar, progress and the
 *  exercise directory (customs), so it invalidates the cache wholesale. */
export function useCommitImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: importer.ImportPlan) => importer.commitImportPlan(plan),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Apple Health gap-fill (iOS-only). Adds blank placeholders for forgotten
 *  strength days, so it lands new rows in history and the calendar heatmap. */
export function useSyncHealthWorkouts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => health.syncHealthWorkouts(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.workoutList });
      void qc.invalidateQueries({ queryKey: keys.workoutPrCounts });
      void qc.invalidateQueries({ queryKey: ['workoutDays'] });
    },
  });
}

// Optimistic add-exercise: the caller passes the picked Exercise; the hook fills
// in a client id + position from the cache, the grid switches to the new exercise
// on the same tap, and the insert lands under that id in the background.

/** Next position slot (max existing + 1). */
function nextExercisePosition(detail: WorkoutDetail | undefined): number {
  const list = detail?.exercises ?? [];
  return list.length > 0 ? Math.max(...list.map((we) => we.position)) + 1 : 0;
}

// Caller-facing input; the hook resolves id + position (and carries workoutId)
// into the full AddExerciseVars (see ./offlineSync) before queuing, so a paused /
// persisted add replays with no server read and correct FK ordering even when
// several exercises were added offline in a row.
type AddExerciseArgs = { exercise: Exercise; presetId?: string };

export function useAddExerciseToWorkout(workoutId: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationKey: mutationKeys.addExerciseToWorkout,
    mutationFn: async (v: AddExerciseVars) => {
      await awaitWorkoutCommitted(workoutId);
      return workouts.addExerciseToWorkout(v.workoutId, v.exercise.id, {
        id: v.id,
        position: v.position,
      });
    },
    onMutate: async (v: AddExerciseVars) => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) });
      const prev = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId));
      if (!prev) return {};
      qc.setQueryData<WorkoutDetail>(keys.workout(workoutId), {
        ...prev,
        exercises: [
          ...prev.exercises,
          {
            id: v.id,
            workout_id: workoutId,
            exercise_id: v.exercise.id,
            position: v.position,
            created_at: new Date().toISOString(),
            exercise: v.exercise,
            sets: [],
          },
        ],
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.workout(workoutId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });

  const mutate = (args: AddExerciseArgs, options?: Parameters<typeof mutation.mutate>[1]) => {
    const detail = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId));
    return mutation.mutate(
      {
        workoutId,
        exercise: args.exercise,
        id: args.presetId ?? newUuid(),
        position: nextExercisePosition(detail),
      },
      options
    );
  };

  return { ...mutation, mutate };
}

export function useRemoveWorkoutExercise(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workoutExerciseId: string) =>
      workouts.removeWorkoutExercise(workoutExerciseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });
}

export function useMoveWorkoutExercise(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workoutExerciseId: string; direction: 'up' | 'down' }) =>
      workouts.moveWorkoutExercise(workoutId, input.workoutExerciseId, input.direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });
}

// Manual set writes are optimistic: the workout cache is patched synchronously in
// onMutate so the grid updates on the same frame as the tap (Priority B — logging
// must feel instant), with a snapshot rollback on error and a reconciling refetch
// on settle. `keys.workout(id)` holds the nested WorkoutDetail tree.
type WorkoutCtx = { prev?: WorkoutDetail };

function patchWorkoutSets(
  qc: ReturnType<typeof useQueryClient>,
  workoutId: string,
  map: (set: WorkoutSet, workoutExerciseId: string) => WorkoutSet | null,
  insertInto?: { workoutExerciseId: string; make: (existing: WorkoutSet[]) => WorkoutSet }
): WorkoutDetail | undefined {
  const key = keys.workout(workoutId);
  const prev = qc.getQueryData<WorkoutDetail>(key);
  if (!prev) return undefined;
  qc.setQueryData<WorkoutDetail>(key, {
    ...prev,
    exercises: prev.exercises.map((we) => {
      let nextSets = we.sets
        .map((s) => map(s, we.id))
        .filter((s): s is WorkoutSet => s != null);
      if (insertInto && insertInto.workoutExerciseId === we.id) {
        nextSets = [...nextSets, insertInto.make(we.sets)];
      }
      return { ...we, sets: nextSets };
    }),
  });
  return prev;
}

// The caller-facing input; the hook fills in the client id + set_number to form
// the full AddSetVars (see ./offlineSync) that gets stored/persisted — kept
// complete so a paused/post-kill mutation replays with no server read.
type AddSetArgs = { workoutExerciseId: string; set: sets.AddSetInput };

export function useAddSet(workoutId: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationKey: mutationKeys.addSet,
    mutationFn: async (v: AddSetVars) => {
      // A ✓ tapped the instant the grid appears must not race the workout's own
      // background insert (FK: sets → workout_exercises → workouts).
      await awaitWorkoutCommitted(workoutId);
      return sets.addSet(v.workoutExerciseId, v.set, v.setNumber, v.id);
    },
    onMutate: async (v: AddSetVars): Promise<WorkoutCtx> => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) });
      const prev = patchWorkoutSets(qc, workoutId, (s) => s, {
        workoutExerciseId: v.workoutExerciseId,
        make: () => ({
          id: v.id,
          workout_exercise_id: v.workoutExerciseId,
          set_number: v.setNumber,
          weight_kg: v.set.weight_kg,
          reps: v.set.reps,
          rpe: v.set.rpe ?? null,
          set_type: v.set.set_type ?? 'normal',
          logged_via: 'manual',
          raw_transcript: null,
          parse_confidence: null,
          created_at: new Date().toISOString(),
        }),
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.workout(workoutId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });

  // Complete the variables from the cache before the mutation is queued, so the
  // stored variables already hold this set's id + number (see AddSetVars).
  const mutate = (args: AddSetArgs, options?: Parameters<typeof mutation.mutate>[1]) => {
    const detail = qc.getQueryData<WorkoutDetail>(keys.workout(workoutId));
    const we = detail?.exercises.find((e) => e.id === args.workoutExerciseId);
    const setNumber = (we?.sets ?? []).reduce((m, s) => Math.max(m, s.set_number), 0) + 1;
    return mutation.mutate({ ...args, id: newUuid(), setNumber }, options);
  };

  return { ...mutation, mutate };
}

export function useUpdateSet(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.updateSet,
    mutationFn: (input: { setId: string; patch: Parameters<typeof sets.updateSet>[1] }) =>
      sets.updateSet(input.setId, input.patch),
    onMutate: async ({ setId, patch }): Promise<WorkoutCtx> => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) });
      const prev = patchWorkoutSets(qc, workoutId, (s) =>
        s.id === setId ? { ...s, ...patch } : s
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.workout(workoutId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });
}

export function useDeleteSet(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.deleteSet,
    mutationFn: (setId: string) => sets.deleteSet(setId),
    onMutate: async (setId): Promise<WorkoutCtx> => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) });
      const prev = patchWorkoutSets(qc, workoutId, (s) => (s.id === setId ? null : s));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.workout(workoutId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });
}

export function useCreateCustomExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof exercises.createCustomExercise>[0]) =>
      exercises.createCustomExercise(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exerciseSearch'] });
      qc.invalidateQueries({ queryKey: keys.exerciseDirectory });
    },
  });
}

// ---------------------------------------------------------------------------
// Voice logging (Phase 2)
// ---------------------------------------------------------------------------

export function useParseVoiceUtterance() {
  return useMutation({ mutationFn: voice.parseVoiceUtterance });
}

export function useRecentVoiceLogs(limit = 50) {
  return useQuery({
    queryKey: ['voiceLogs', 'recent', limit],
    queryFn: () => voice.listRecentVoiceLogs(limit),
  });
}

export function useVoiceLogsSince(sinceIso: string) {
  return useQuery({
    queryKey: ['voiceLogs', 'since', sinceIso],
    queryFn: () => voice.listVoiceLogsSince(sinceIso),
  });
}

export function useConfirmVoiceEntries(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof voice.confirmVoiceEntries>[0], 'workoutId'>) =>
      voice.confirmVoiceEntries({ ...input, workoutId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.workout(workoutId) });
      qc.invalidateQueries({ queryKey: ['lastSession'] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory'] });
    },
  });
}

export function useDiscardVoiceLog() {
  return useMutation({ mutationFn: voice.discardVoiceLog });
}

export function useUndoVoiceSets(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: voice.undoVoiceSets,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });
}

export function useCreateExerciseAliasFromVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rawPhrase, exerciseId }: { rawPhrase: string; exerciseId: string }) =>
      voice.createExerciseAliasFromVoice(rawPhrase, exerciseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exerciseSearch'] }),
  });
}
