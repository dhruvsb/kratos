// The one place the "start a workout" flow lives, shared by every entry point that
// begins one (the ROUTINES screen, Home's quick-start sheet). Lifted verbatim from
// the old Home so the optimistic behaviour is identical everywhere:
//   • If a workout is already running, route to it (never a second live workout).
//   • Fast path: build the whole workout from the cached routine detail and navigate
//     NOW — the insert runs in the background under the same client-chosen ids.
//   • Cold path (routine never opened on this device): needs the server, so offline it
//     would silently dead-end — say so honestly instead.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { buildStartPlan, useActiveWorkout, useStartWorkout } from '@/data/hooks';
import { useIsOnline } from '@/lib/network';

export function useStartWorkoutFlow() {
  const qc = useQueryClient();
  const activeWorkout = useActiveWorkout();
  const startWorkout = useStartWorkout();
  const online = useIsOnline();

  const activeId = activeWorkout.data?.id;
  const hasActive = !!activeId;
  const busy = hasActive || startWorkout.isPending;

  function start(routineId?: string) {
    if (activeId) {
      router.push(`/workout/${activeId}`);
      return;
    }
    const plan = buildStartPlan(qc, routineId);
    if (plan) {
      startWorkout.mutate(
        { routineId, plan },
        {
          onError: (e) => {
            Alert.alert("Couldn't start workout", e.message);
            router.dismissTo('/');
          },
        }
      );
      router.push(`/workout/${plan.detail.id}`);
      return;
    }
    if (!online) {
      Alert.alert(
        'Routine not available offline',
        'This routine has never been loaded on this device. Reconnect once and it will work offline from then on.'
      );
      return;
    }
    startWorkout.mutate(
      { routineId },
      {
        onSuccess: (workout) => router.push(`/workout/${workout.id}`),
        onError: (e) => Alert.alert("Couldn't start workout", e.message),
      }
    );
  }

  return { start, busy, hasActive, activeId };
}
