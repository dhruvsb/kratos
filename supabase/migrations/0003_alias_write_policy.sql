-- 0003_alias_write_policy.sql
--
-- Fix: Phase 2 voice alias write-back (spec AC #5 — "the same spoken phrase
-- resolves instantly next time") was blocked for the common case.
--
-- 0001's "aliases write own custom" INSERT policy only allowed rows whose
-- exercise is is_custom = true AND created_by = auth.uid(). But a voice
-- correction almost always maps to a SEEDED library exercise (is_custom = false),
-- so createExerciseAliasFromVoice()'s insert was rejected by RLS and the alias
-- was never learned. exercise_aliases is a global, source-tagged table by design
-- (the `source in ('seed','user','llm')` column exists precisely so runtime
-- 'user'/'llm' aliases can join the seeded ones).
--
-- This migration lets any authenticated user add a 'user'/'llm' alias to any
-- exercise they can already SEE (seeded, or their own custom) — mirroring the
-- existing SELECT policy's visibility rule. 'seed' provenance stays reserved for
-- the seed script (service role, which bypasses RLS). SELECT/DELETE policies are
-- unchanged. Idempotent so it's safe to re-run.

drop policy if exists "aliases write own custom" on public.exercise_aliases;
drop policy if exists "aliases write visible" on public.exercise_aliases;

create policy "aliases write visible" on public.exercise_aliases
  for insert to authenticated
  with check (
    source in ('user', 'llm')
    and exists (
      select 1
      from public.exercises e
      where e.id = exercise_id
        and (e.is_custom = false or e.created_by = auth.uid())
    )
  );
