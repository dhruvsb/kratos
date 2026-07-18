-- RepVoice Phase 1 schema. This migration is the contract for Phases 1–3.
-- Apply on a fresh project with `supabase db push`, or paste into the SQL editor.

-- pg_trgm: Phase 2 fuzzy exercise-name matching depends on it (enabled NOW on purpose).
-- pgcrypto: gen_random_uuid().
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  default_unit text not null default 'kg' check (default_unit in ('kg', 'lb')),
  created_at   timestamptz not null default now()
);

create table public.exercises (
  id             uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  category       text,
  equipment      text,
  primary_muscle text,
  is_custom      boolean not null default false,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Separate table (not an array column): Phase 2 canonicalization does indexed
-- lookups on aliases, and aliases carry provenance (seed/user/llm).
create table public.exercise_aliases (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  alias       text not null,
  source      text not null default 'seed' check (source in ('seed', 'user', 'llm')),
  created_at  timestamptz not null default now(),
  unique (exercise_id, alias)
);

create table public.routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  notes      text,
  position   integer not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.routine_exercises (
  id               uuid primary key default gen_random_uuid(),
  routine_id       uuid not null references public.routines (id) on delete cascade,
  exercise_id      uuid not null references public.exercises (id),
  position         integer not null default 0,
  target_sets      integer,
  target_reps_low  integer,
  target_reps_high integer,
  created_at       timestamptz not null default now()
);

create table public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  routine_id  uuid references public.routines (id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  notes       text,
  -- Dedicated column (not stuffed into notes): imports need a queryable,
  -- uniquely-constrained idempotency key; notes stays free-form for the user.
  external_id text,
  created_at  timestamptz not null default now(),
  unique (user_id, external_id)
);

create table public.workout_exercises (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.sets (
  id                  uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_number          integer not null,
  weight_kg           numeric(6, 2),
  reps                integer,
  rpe                 numeric(3, 1),
  set_type            text not null default 'normal'
                        check (set_type in ('warmup', 'normal', 'drop', 'failure')),
  -- Phase 2 columns exist NOW so we never migrate this hot table later.
  logged_via          text not null default 'manual'
                        check (logged_via in ('manual', 'voice', 'quick_repeat')),
  raw_transcript      text,
  parse_confidence    numeric,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index exercise_aliases_lower_alias_idx on public.exercise_aliases (lower(alias));
create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create index sets_workout_exercise_set_number_idx on public.sets (workout_exercise_id, set_number);
create index exercises_canonical_name_trgm_idx on public.exercises
  using gin (canonical_name gin_trgm_ops);
-- FK-side indexes for the joins the app does constantly.
create index routine_exercises_routine_idx on public.routine_exercises (routine_id, position);
create index workout_exercises_workout_idx on public.workout_exercises (workout_id, position);
create index workout_exercises_exercise_idx on public.workout_exercises (exercise_id);
create index routines_user_idx on public.routines (user_id, archived, position);

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_aliases enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;

-- profiles: owner only (insert happens via the security-definer trigger).
create policy "profiles select own" on public.profiles
  for select using (user_id = auth.uid());
create policy "profiles update own" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- exercises: everyone (authed) reads seeded rows; users own their custom rows.
create policy "exercises select seeded or own" on public.exercises
  for select using (is_custom = false or created_by = auth.uid());
create policy "exercises insert own custom" on public.exercises
  for insert with check (is_custom = true and created_by = auth.uid());
create policy "exercises update own custom" on public.exercises
  for update using (is_custom = true and created_by = auth.uid())
  with check (is_custom = true and created_by = auth.uid());
create policy "exercises delete own custom" on public.exercises
  for delete using (is_custom = true and created_by = auth.uid());

-- exercise_aliases: readable/writable when the parent exercise is.
create policy "aliases select via exercise" on public.exercise_aliases
  for select using (exists (
    select 1 from public.exercises e
    where e.id = exercise_id and (e.is_custom = false or e.created_by = auth.uid())
  ));
create policy "aliases write own custom" on public.exercise_aliases
  for insert with check (exists (
    select 1 from public.exercises e
    where e.id = exercise_id and e.is_custom = true and e.created_by = auth.uid()
  ));
create policy "aliases delete own custom" on public.exercise_aliases
  for delete using (exists (
    select 1 from public.exercises e
    where e.id = exercise_id and e.is_custom = true and e.created_by = auth.uid()
  ));

-- routines: owner only, all operations.
create policy "routines all own" on public.routines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- routine_exercises: via parent routine.
create policy "routine_exercises all via routine" on public.routine_exercises
  for all using (exists (
    select 1 from public.routines r
    where r.id = routine_id and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.routines r
    where r.id = routine_id and r.user_id = auth.uid()
  ));

-- workouts: owner only.
create policy "workouts all own" on public.workouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- workout_exercises: via parent workout.
create policy "workout_exercises all via workout" on public.workout_exercises
  for all using (exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.user_id = auth.uid()
  ));

-- sets: via workout_exercise -> workout.
create policy "sets all via workout" on public.sets
  for all using (exists (
    select 1
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Query functions (security invoker: RLS still applies inside)
-- ---------------------------------------------------------------------------

-- Exercise search: exact/prefix name matches first, then alias matches, then
-- trigram similarity. One round-trip for the picker's search box.
create or replace function public.search_exercises(q text, max_results int default 30)
returns setof public.exercises
language sql
stable
as $$
  with ranked as (
    select e.*,
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
  select id, canonical_name, category, equipment, primary_muscle,
         is_custom, created_by, created_at
  from ranked
  where score > 0.25
  order by score desc, canonical_name
  limit max_results;
$$;

-- Last-session recall: the sets of the most recent FINISHED workout (other than
-- the one passed in) that contains this exercise, ordered by set_number.
create or replace function public.last_session_sets(
  p_exercise_id uuid,
  p_exclude_workout_id uuid default null
)
returns table (
  workout_id uuid,
  started_at timestamptz,
  set_number integer,
  weight_kg numeric(6, 2),
  reps integer,
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
  select lw.id, lw.started_at, s.set_number, s.weight_kg, s.reps, s.rpe, s.set_type
  from last_workout lw
  join public.workout_exercises we on we.workout_id = lw.id
                                  and we.exercise_id = p_exercise_id
  join public.sets s on s.workout_exercise_id = we.id
  order by we.position, s.set_number;
$$;
