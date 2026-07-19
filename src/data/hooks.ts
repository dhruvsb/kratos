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
import * as routines from './routines';
import * as sets from './sets';
import * as voice from './voice';
import * as workouts from './workouts';

export const keys = {
  profile: ['profile'] as const,
  routines: (includeArchived: boolean) => ['routines', includeArchived] as const,
  routine: (id: string) => ['routine', id] as const,
  exerciseSearch: (q: string) => ['exerciseSearch', q] as const,
  exercise: (id: string) => ['exercise', id] as const,
  activeWorkout: ['activeWorkout'] as const,
  workout: (id: string) => ['workout', id] as const,
  workoutList: ['workoutList'] as const,
  lastSession: (exerciseId: string, exclude?: string) =>
    ['lastSession', exerciseId, exclude ?? null] as const,
  exerciseHistory: (exerciseId: string) => ['exerciseHistory', exerciseId] as const,
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useProfile() {
  return useQuery({ queryKey: keys.profile, queryFn: auth.getProfile });
}

export function useRoutines(includeArchived = false) {
  return useQuery({
    queryKey: keys.routines(includeArchived),
    queryFn: () => routines.listRoutines(includeArchived),
  });
}

export function useRoutine(id: string | undefined) {
  return useQuery({
    queryKey: keys.routine(id ?? ''),
    queryFn: () => routines.getRoutine(id!),
    enabled: !!id,
  });
}

export function useExerciseSearch(query: string) {
  return useQuery({
    queryKey: keys.exerciseSearch(query),
    queryFn: () => exercises.searchExercises(query),
    placeholderData: (prev) => prev, // keep old results while typing
  });
}

export function useExercise(id: string | undefined) {
  return useQuery({
    queryKey: keys.exercise(id ?? ''),
    queryFn: () => exercises.getExercise(id!),
    enabled: !!id,
  });
}

export function useActiveWorkout() {
  return useQuery({ queryKey: keys.activeWorkout, queryFn: workouts.getActiveWorkout });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: keys.workout(id ?? ''),
    queryFn: () => workouts.getWorkout(id!),
    enabled: !!id,
  });
}

export function useWorkoutList() {
  return useInfiniteQuery({
    queryKey: keys.workoutList,
    queryFn: ({ pageParam }) => workouts.listWorkouts(pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < PAGE_SIZE ? undefined : pages.length,
  });
}

/** Last-session panel data. Cached so re-opening an exercise renders instantly. */
export function useLastSession(exerciseId: string, excludeWorkoutId?: string) {
  return useQuery({
    queryKey: keys.lastSession(exerciseId, excludeWorkoutId),
    queryFn: () => workouts.getLastSession(exerciseId, excludeWorkoutId),
    staleTime: 5 * 60 * 1000, // doesn't change mid-workout
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

export function useAddSet(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { workoutExerciseId: string; set: sets.AddSetInput }) =>
      sets.addSet(input.workoutExerciseId, input.set),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });
}

export function useUpdateSet(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { setId: string; patch: Parameters<typeof sets.updateSet>[1] }) =>
      sets.updateSet(input.setId, input.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
  });
}

export function useDeleteSet(workoutId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => sets.deleteSet(setId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workout(workoutId) }),
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
