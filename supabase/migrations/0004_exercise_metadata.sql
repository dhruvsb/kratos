-- Restructure the exercises directory for rich, chart-ready metadata.
--
-- The Phase-1 seed pulled 873 rows from free-exercise-db but kept only a single
-- primary_muscle string. We replace that with a curated ~150-exercise directory
-- that carries the muscle arrays needed to answer "what did I train today".
--
--   primary_muscle (text)  ->  primary_muscles   text[]   (muscles mainly trained)
--                              secondary_muscles text[]   (assisting muscles)
--                              body_region       text[]   (Chest/Back/.../Core rollup)
--   category (text)        ->  mechanic          text     (compound | isolation)
--                              modality          text     (how a set is measured)
--
-- body_region is derived from primary_muscles at seed time (see seed-exercises.ts).
-- Muscle values stay in the 17-term free-exercise-db vocabulary so future imports
-- can still cross-reference.

alter table public.exercises
  add column if not exists primary_muscles   text[] not null default '{}',
  add column if not exists secondary_muscles text[] not null default '{}',
  add column if not exists body_region       text[] not null default '{}',
  add column if not exists mechanic          text,
  add column if not exists modality          text not null default 'weight_reps';

alter table public.exercises
  add constraint exercises_mechanic_check
    check (mechanic is null or mechanic in ('compound', 'isolation')),
  add constraint exercises_modality_check
    check (modality in ('weight_reps', 'bodyweight_reps', 'time', 'distance_time'));

-- Drop the superseded single-value columns. Nothing logged references them
-- (workout_exercises / sets are empty); the seed re-populates everything.
alter table public.exercises drop column if exists primary_muscle;
alter table public.exercises drop column if exists category;

-- Filter/aggregate helpers for the muscle-worked charts and "exercises for muscle X".
create index if not exists exercises_primary_muscles_idx
  on public.exercises using gin (primary_muscles);
create index if not exists exercises_body_region_idx
  on public.exercises using gin (body_region);

-- search_exercises returns `setof public.exercises`, so its projection must match
-- the (now changed) table shape exactly. Rewrite it to select whole exercise rows
-- by id, making it agnostic to the column set going forward.
create or replace function public.search_exercises(q text, max_results int default 30)
returns setof public.exercises
language sql
stable
as $$
  with ranked as (
    select
      e.id,
      greatest(
        case when lower(e.canonical_name) like lower(q) || '%' then 1.0
             when lower(e.canonical_name) like '%' || lower(q) || '%' then 0.8
             else 0 end,
        coalesce((
          select max(case when lower(a.alias) = lower(q) then 1.0
                          when lower(a.alias) like lower(q) || '%' then 0.9
                          else 0 end)
          from public.exercise_aliases a
          where a.exercise_id = e.id
        ), 0),
        similarity(e.canonical_name, q)
      ) as score
    from public.exercises e
  )
  select e.*
  from ranked r
  join public.exercises e on e.id = r.id
  where r.score > 0.25
  order by r.score desc, e.canonical_name
  limit max_results;
$$;
