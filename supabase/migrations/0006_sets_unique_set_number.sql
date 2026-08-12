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
-- NOTE: this will fail to apply if duplicate (workout_exercise_id, set_number) rows
-- already exist. On a live DB, dedupe first, e.g.:
--   with d as (
--     select id, row_number() over (
--       partition by workout_exercise_id, set_number order by created_at, id
--     ) as rn
--     from public.sets
--   )
--   update public.sets s set set_number = s.set_number + 1000 * (d.rn - 1)
--   from d where d.id = s.id and d.rn > 1;
-- then re-run the renumber loop as needed. Fresh/single-device data has no dups.

drop index if exists public.sets_workout_exercise_set_number_idx;

alter table public.sets
  add constraint sets_workout_exercise_id_set_number_key
  unique (workout_exercise_id, set_number);
