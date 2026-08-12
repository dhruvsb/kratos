-- 0008: in-app "clear all history" — wipe workouts, keep everything else.
--
-- Lets a user permanently delete every workout (and thus every logged set) on
-- their account while leaving routines, routine_exercises, custom exercises and
-- their profile untouched — the "wipe my test data, then re-import fresh from
-- Hevy and start clean" flow. Like delete_own_account (0005) this is a
-- security-definer RPC that acts strictly on auth.uid(): there is no argument to
-- point it at anyone else, so a caller can only ever clear its own history.
--
-- A single `delete from public.workouts where user_id = auth.uid()` is enough —
-- the existing FK graph (see 0001_init.sql / 0002_voice_logs.sql) does the rest:
--   * workout_exercises.workout_id  -> workouts (id)  ON DELETE CASCADE
--   * sets.workout_exercise_id      -> workout_exercises (id)  ON DELETE CASCADE
--     so sets go via their workout_exercises.
--   * voice_logs.workout_id         -> workouts (id)  ON DELETE SET NULL
--     (voice_logs rows survive, just unlinked — Phase 2 data, not history rows).
-- Deliberately NOT touched: routines, routine_exercises, exercises (incl. the
-- user's custom ones), profiles. workouts.routine_id is the child of that FK, so
-- deleting workouts can never reach a routine.

create or replace function public.clear_own_workouts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Cascades workout_exercises -> sets; nulls voice_logs.workout_id en route.
  -- Routines / exercises / profiles are never referenced, so they are untouched.
  delete from public.workouts where user_id = uid;
end;
$$;

revoke all on function public.clear_own_workouts() from public, anon;
grant execute on function public.clear_own_workouts() to authenticated;
