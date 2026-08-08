-- 0005: in-app account deletion (App Store Review Guideline 5.1.1(v)).
--
-- Apple requires any app that creates accounts to let the user delete the account
-- *and its data* from inside the app; deactivation is not enough. Deleting an
-- auth.users row needs privileges the client must never hold, so this is a
-- security-definer RPC that acts strictly on auth.uid() — a caller can only ever
-- delete itself, and there is no argument to point it at anyone else.
--
-- Most of the tree already goes away via `on delete cascade` off auth.users
-- (profiles, routines→routine_exercises, workouts→workout_exercises→sets,
-- voice_logs). Two things don't, which is why this function has a body at all:
--   * exercises.created_by is `on delete set null`, so a user's custom exercises
--     survive the cascade as orphans (is_custom = true, created_by = null — RLS
--     then hides them from everyone). They are user-authored data, so delete them.
--   * that delete has to run BEFORE auth.users (afterwards created_by is null and
--     the rows are unfindable) and AFTER routines/workouts, whose FKs to exercises
--     are NO ACTION and would otherwise block it.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Children cascade: routine_exercises; workout_exercises → sets.
  -- (This also nulls workouts.routine_id and voice_logs.workout_id en route.)
  delete from public.routines where user_id = uid;
  delete from public.workouts where user_id = uid;

  -- Now unreferenced, so this succeeds. exercise_aliases cascade off it.
  delete from public.exercises where created_by = uid and is_custom = true;

  -- Cascades profiles, voice_logs, and the auth sessions/identities/refresh tokens.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
