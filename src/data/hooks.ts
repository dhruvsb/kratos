// React Query hooks over the repositories. Screens import from here (or the
// repositories) — never from src/lib/supabase.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as auth from './auth';
import * as exercises from './exercises';
import * as importer from './import';
import * as routines from './routines';
import * as sets from './sets';
import * as voice from './voice';
import * as workouts from './workouts';
import type { WorkoutDetail } from './workouts';
import type { WorkoutSet } from '@/types/db';
import type { BodyRegion } from '@/lib/muscles';

export const keys = {
  profile: ['profile'] as const,
  routines: (includeArchived: boolean) => ['routines', includeArchived] as const,
  routine: (id: string) => ['routine', id] as const,
  exerciseSearch: (q: string, region?: string | null) =>
    ['exerciseSearch', q, region ?? null] as const,
  exercise: (id: string) => ['exercise', id] as const,
  activeWorkout: ['activeWorkout'] as const,
  workout: (id: string) => ['workout', id] as const,
  workoutList: ['workoutList'] as const,
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

/** Last-session panel data. Cached so re-opening an exercise renders instantly. */
export function useLastSession(exerciseId: string, excludeWorkoutId?: string) {
  return useQuery({
    queryKey: keys.lastSession(exerciseId, excludeWorkoutId),
    queryFn: () => workouts.getLastSession(exerciseId, excludeWorkoutId),
    staleTime: STALE.lastSession,
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

export function useStartWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId?: string) => workouts.startWorkout(routineId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.activeWorkout }),
  });
}

export function useFinishWorkout(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => workouts.finishWorkout(workoutId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.activeWorkout });
      qc.invalidateQueries({ queryKey: keys.workoutList });
      qc.invalidateQueries({ queryKey: keys.workout(workoutId) });
      // Finished workout becomes someone's "last session".
      qc.invalidateQueries({ queryKey: ['lastSession'] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory'] });
    },
  });
}

export function useDiscardWorkout(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => workouts.discardWorkout(workoutId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.activeWorkout });
      qc.invalidateQueries({ queryKey: keys.workoutList });
    },
  });
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
      qc.invalidateQueries({ queryKey: keys.activeWorkout });
      qc.removeQueries({ queryKey: keys.workout(workoutId) });
      qc.invalidateQueries({ queryKey: ['lastSession'] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory'] });
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

export function useAddExerciseToWorkout(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (exerciseId: string) =>
      workouts.addExerciseToWorkout(workoutId, exerciseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });
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

function tempId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useAddSet(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workoutExerciseId: string; set: sets.AddSetInput }) =>
      sets.addSet(input.workoutExerciseId, input.set),
    onMutate: async ({ workoutExerciseId, set }): Promise<WorkoutCtx> => {
      await qc.cancelQueries({ queryKey: keys.workout(workoutId) });
      const prev = patchWorkoutSets(qc, workoutId, (s) => s, {
        workoutExerciseId,
        make: (existing) => ({
          id: tempId(),
          workout_exercise_id: workoutExerciseId,
          set_number: existing.reduce((m, s) => Math.max(m, s.set_number), 0) + 1,
          weight_kg: set.weight_kg,
          reps: set.reps,
          rpe: set.rpe ?? null,
          set_type: set.set_type ?? 'normal',
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
}

export function useUpdateSet(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exerciseSearch'] }),
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
