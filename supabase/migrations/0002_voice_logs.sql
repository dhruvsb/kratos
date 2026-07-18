-- Phase 2: voice logging telemetry + fuzzy exercise-candidate search.
-- Depends on 0001_init.sql (exercises, exercise_aliases, workouts, pg_trgm).

-- Every voice interaction is logged here, INCLUDING corrections — the app is
-- its own eval-data factory (scripts/harvest-eval-cases.ts reads this table).
create table public.voice_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  workout_id  uuid references public.workouts (id) on delete set null,
  transcript  text not null,
  stt_source  text,
  context     jsonb,
  parsed      jsonb,
  model       text,
  tokens_in   int,
  tokens_out  int,
  latency_ms  int,
  cost_usd    numeric(8,5),
  -- null until the user acts on the confirmation card
  outcome     text check (outcome in ('accepted', 'edited', 'answered_question', 'discarded')),
  corrections jsonb, -- {field: {from, to}} when edited
  created_at  timestamptz not null default now()
);

create index voice_logs_user_created_idx on public.voice_logs (user_id, created_at desc);
create index voice_logs_outcome_idx on public.voice_logs (outcome) where outcome is not null;

alter table public.voice_logs enable row level security;

create policy voice_logs_select_own on public.voice_logs
  for select using (user_id = auth.uid());
create policy voice_logs_insert_own on public.voice_logs
  for insert with check (user_id = auth.uid());
create policy voice_logs_update_own on public.voice_logs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Trigram candidate search over canonical names + aliases, used by the
-- parse-utterance edge function (step 2 of exercise resolution).
-- SECURITY INVOKER: runs under the caller's RLS, so users only ever match
-- seeded exercises plus their own custom ones.
create or replace function public.search_exercise_candidates(q text, max_results int default 10)
returns table (exercise_id uuid, name text, score real)
language plpgsql
stable
security invoker
as $$
begin
  return query
  select
    e.id as exercise_id,
    e.canonical_name as name,
    greatest(similarity(e.canonical_name, q), coalesce(a.best_alias_sim, 0))::real as score
  from public.exercises e
  left join lateral (
    select max(similarity(al.alias, q)) as best_alias_sim
    from public.exercise_aliases al
    where al.exercise_id = e.id
  ) a on true
  where similarity(e.canonical_name, q) > 0.15
     or coalesce(a.best_alias_sim, 0) > 0.15
  order by score desc
  limit max_results;
end;
$$;
