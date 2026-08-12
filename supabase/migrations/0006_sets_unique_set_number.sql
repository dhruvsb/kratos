-- 0006: one set_number per exercise per workout (integrity for the hot write path).
--
-- set_number is computed client-side as max(existing)+1 (src/data/sets.ts). Two
-- writes that read the same max — a double-tapped ✓, or an offline queue replaying
-- after an app kill — can both pick the same number, producing two rows that share a
-- set_number under one workout_exercise. Nothing downstream expects that: the grid,
-- last-session recall and history all order by set_number and would render/duplicate
-- ambiguously. A UNIQUE(workout_exercise_id, set_number) turns that race into a
-- catchable 23505 the client retries with a fresh number (see insertSet).
--
-- The old non-unique index sets_workout_exercise_set_number_idx (0001) covered the
-- exact same (workout_exercise_id, set_number) tuple in the same order; the unique
-- constraint's backing index makes it fully redundant, so drop it.
--
-- Dedupe first (races before this constraint existed can have produced duplicate
-- set_numbers): renumber every workout_exercise's sets to a contiguous 1..N in their
-- current order. This relabels set_number ONLY — weight/reps/rpe and the display order
-- are unchanged; it just makes the numbers distinct so the unique constraint can be
-- added. Idempotent: already-contiguous sets don't move (the WHERE skips no-op rows).
-- Runs in the same transaction as the constraint, so it can't leave a half-applied state.
with ordered as (
  select
    id,
    row_number() over (
      partition by workout_exercise_id
      order by set_number, created_at, id
    ) as new_num
  from public.sets
)
update public.sets s
set set_number = o.new_num
from ordered o
where o.id = s.id
  and s.set_number <> o.new_num;

drop index if exists public.sets_workout_exercise_set_number_idx;

alter table public.sets
  add constraint sets_workout_exercise_id_set_number_key
  unique (workout_exercise_id, set_number);
