-- Per-workout PR ("records") counts for the Home history rows (feedback #35).
--
-- PR definition (product decision 2026-08-13): for a given exercise, a finished session
-- sets a PR when the heaviest weight among its sets with reps >= 6 is strictly greater
-- than the heaviest such weight from every *earlier* finished session of that exercise.
-- The first qualifying session for a lift counts (nothing to beat). Sets with reps < 6,
-- null reps, or null weight are ignored. A workout's count = how many of its exercises
-- set a PR that day.
--
-- Computed server-side because it must see ALL of the user's history — a client compute
-- over the paginated list would over-count the oldest loaded session.
--
-- SECURITY DEFINER + an explicit user_id = auth.uid() filter (same pattern as
-- 0005_delete_own_account): scoped to the caller's own data, never anyone else's.

create or replace function public.workout_pr_counts()
returns table (workout_id uuid, pr_count integer)
language sql
stable
security definer
set search_path = public
as $$
  with qualifying as (
    -- Heaviest qualifying (reps >= 6) weight per (exercise, finished workout).
    select
      we.exercise_id,
      w.id          as workout_id,
      w.started_at,
      max(s.weight_kg) as session_max
    from public.sets s
    join public.workout_exercises we on we.id = s.workout_exercise_id
    join public.workouts w         on w.id = we.workout_id
    where s.reps >= 6
      and s.weight_kg is not null
      and w.ended_at is not null
      and w.user_id = auth.uid()
    group by we.exercise_id, w.id, w.started_at
  ),
  ranked as (
    select
      workout_id,
      session_max,
      -- Heaviest qualifying weight across all strictly-earlier sessions of this exercise.
      max(session_max) over (
        partition by exercise_id
        order by started_at, workout_id
        rows between unbounded preceding and 1 preceding
      ) as prior_max
    from qualifying
  )
  select
    workout_id,
    count(*)::int as pr_count
  from ranked
  where session_max > coalesce(prior_max, -1) -- prior_max null => first session, always a PR
  group by workout_id;
$$;

grant execute on function public.workout_pr_counts() to authenticated;
