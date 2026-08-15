-- 0011_weighted_bodyweight_modality.sql — add the 'weighted_bodyweight' modality.
--
-- Bodyweight-baseline movements that can OPTIONALLY carry added external load
-- (weighted pull-up/dip/back-extension, etc.) had no home: 'bodyweight_reps'
-- renders reps-only with no weight field, so the belt/vest/plate load couldn't
-- be logged. The new modality logs reps with an OPTIONAL weight_kg (null = pure
-- bodyweight set). No new columns — weight_kg already exists (0010); this only
-- widens the modality CHECK constraint. Idempotent: drop-if-exists then re-add.
alter table public.exercises
  drop constraint if exists exercises_modality_check;

alter table public.exercises
  add constraint exercises_modality_check
    check (modality in (
      'weight_reps',
      'bodyweight_reps',
      'weighted_bodyweight',
      'time',
      'distance_time'
    ));
