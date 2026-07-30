// Calendar data (mockup 12 — "five a week"). Just the start timestamps of every
// finished workout — enough to derive the week card, month grid, streak stats, and
// the 12-week bars entirely client-side, the same way Home derives its week strip.
//
// The query hook lives here (not in data/hooks.ts) on purpose: the calendar screen
// was built in isolation, so everything it needs is in these two new files and no
// shared module is touched. Move `useWorkoutDays` into data/hooks.ts if/when the
// calendar tab is wired into the rest of the app.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type WorkoutDay = { started_at: string };

/** Reverse-chronological start timestamps of finished workouts. RLS scopes this to
 *  the signed-in user, like every other read in the repo layer. */
export async function listWorkoutDays(): Promise<WorkoutDay[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('started_at')
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as WorkoutDay[];
}

export function useWorkoutDays() {
  return useQuery({ queryKey: ['workoutDays'], queryFn: listWorkoutDays });
}
