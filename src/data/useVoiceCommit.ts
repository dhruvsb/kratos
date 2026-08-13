// Commit hooks for the voice-logging flow (design "Voice Logging" 1a). These turn a
// reviewed `VoiceParseResult` into real rows through the existing repositories — the
// parse is mocked (see voiceParse.ts), but everything it commits is genuine.
//
//  • useCommitVoiceRoutine — creates a routine + its ordered exercises (03A).
//  • useCommitVoiceLog     — starts/resumes a live workout and writes every parsed
//                            set through the shared voice confirm path (03B → 04).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { keys } from './hooks';
import { newUuid } from '@/lib/ids';
import * as routinesRepo from './routines';
import * as workoutsRepo from './workouts';
import { confirmVoiceEntries, type ConfirmedEntry } from './voice';
import { setLastVoiceCommit } from './voiceDraft';
import type { VoiceParseResult } from './voiceParse';
import type { Routine, Workout } from '@/types/db';

type RoutineResult = Extract<VoiceParseResult, { kind: 'routine' }>;
type LogResult = Extract<VoiceParseResult, { kind: 'log' }>;

/** 03A · Save routine — create the routine and its ordered, resolved exercises. */
export function useCommitVoiceRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (result: RoutineResult): Promise<Routine> => {
      const routine = await routinesRepo.createRoutine(result.routine.name);
      const items = result.routine.exercises
        .filter((e) => e.exerciseId)
        .map((e) => ({ exercise_id: e.exerciseId! }));
      if (items.length > 0) await routinesRepo.setRoutineExercises(routine.id, items);
      return routine;
    },
    onSuccess: (routine) => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: keys.routine(routine.id) });
    },
  });
}

/**
 * 03B → 04 · Log N sets & open workout. Logs into the running workout if one is
 * live (never a second); otherwise starts a fresh one — linked to the target
 * routine (so it inherits the name) without pre-loading its exercise list, since
 * the voice sets bring their own. Each parsed set is written individually
 * (flattened to one-set entries) so a mis-heard value edited on a single set is
 * preserved — confirmVoiceEntries de-dups the workout_exercise per exercise and
 * addVoiceSet numbers the sets. Records what landed for the undo banner.
 */
export function useCommitVoiceLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (result: LogResult): Promise<{ workoutId: string; count: number }> => {
      const active = await workoutsRepo.getActiveWorkout();
      let workoutId: string;
      if (active) {
        workoutId = active.id;
      } else if (result.target.routineId) {
        // Link the routine for the header, but skip pre-loading its exercises (empty
        // preset) — the parsed sets supply the workout_exercises themselves.
        const workout: Workout = await workoutsRepo.startWorkout(result.target.routineId, {
          workoutId: newUuid(),
          startedAt: new Date().toISOString(),
          exercises: [],
        });
        workoutId = workout.id;
      } else {
        const workout = await workoutsRepo.startWorkout();
        workoutId = workout.id;
      }

      const entries: ConfirmedEntry[] = [];
      for (const ex of result.exercises) {
        if (!ex.exerciseId) continue; // defensive: never write a null FK
        for (const s of ex.sets) {
          entries.push({
            exerciseId: ex.exerciseId,
            weightKg: s.weightKg,
            reps: s.reps,
            setsCount: 1,
            setType: s.setType,
          });
        }
      }

      const { createdSetIds } = await confirmVoiceEntries({
        workoutId,
        voiceLogId: null,
        transcript: result.transcript,
        confidence: result.confidence,
        outcome: 'accepted',
        entries,
      });

      setLastVoiceCommit({ workoutId, setIds: createdSetIds, count: createdSetIds.length });
      return { workoutId, count: createdSetIds.length };
    },
    onSuccess: ({ workoutId }) => {
      qc.invalidateQueries({ queryKey: keys.workout(workoutId) });
      qc.invalidateQueries({ queryKey: keys.activeWorkout });
      qc.invalidateQueries({ queryKey: keys.workoutList });
      qc.invalidateQueries({ queryKey: ['lastSession'] });
      qc.invalidateQueries({ queryKey: ['exerciseHistory'] });
      qc.invalidateQueries({ queryKey: ['workoutDays'] });
    },
  });
}
