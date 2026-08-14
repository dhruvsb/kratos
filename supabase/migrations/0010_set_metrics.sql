-- 0010_set_metrics.sql — modality-aware set metrics.
--
-- Phase 1 stored only weight_kg + reps, which fits weight_reps and bodyweight_reps
-- exercises. Time-based (planks, holds) and cardio (elliptical, bike, …) exercises had
-- nowhere to record their real measurement, so the set grid showed a meaningless weight
-- field. These two additive, nullable columns give every modality a home:
--
--   modality        weight_kg  reps  duration_seconds  level
--   weight_reps        ✓        ✓          –             –
--   bodyweight_reps    –        ✓          –             –
--   time              –        –          ✓             –
--   distance_time     –        –          ✓            ✓   (duration + machine level)
--
-- (distance_time keeps its enum name for compatibility but now means duration + level;
--  distance was intentionally dropped — see the modality UI work.)
--
-- Purely additive + nullable: old rows read back as NULL, existing RLS on `sets`
-- (user_id via the workout join) covers the new columns unchanged.

alter table public.sets
  add column if not exists duration_seconds integer,
  add column if not exists level numeric(4, 1);

-- last_session_sets() feeds the PREV column. Widen its return so time/cardio sets
-- carry their real metric back (not just weight/reps). Changing a function's return
-- columns needs a drop first — create-or-replace can't alter the return type.
drop function if exists public.last_session_sets(uuid, uuid);

create function public.last_session_sets(
  p_exercise_id uuid,
  p_exclude_workout_id uuid default null
)
returns table (
  workout_id uuid,
  started_at timestamptz,
  set_number integer,
  weight_kg numeric(6, 2),
  reps integer,
  duration_seconds integer,
  level numeric(4, 1),
  rpe numeric(3, 1),
  set_type text
)
language sql
stable
as $$
  with last_workout as (
    select w.id, w.started_at
    from public.workouts w
    join public.workout_exercises we on we.workout_id = w.id
    where we.exercise_id = p_exercise_id
      and w.ended_at is not null
      and (p_exclude_workout_id is null or w.id <> p_exclude_workout_id)
    order by w.started_at desc
    limit 1
  )
  select lw.id, lw.started_at, s.set_number, s.weight_kg, s.reps,
         s.duration_seconds, s.level, s.rpe, s.set_type
  from last_workout lw
  join public.workout_exercises we on we.workout_id = lw.id
                                  and we.exercise_id = p_exercise_id
  join public.sets s on s.workout_exercise_id = we.id
  order by we.position, s.set_number;
$$;
