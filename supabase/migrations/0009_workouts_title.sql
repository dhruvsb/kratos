-- 0009: give workouts their own title.
--
-- Until now a workout's display name came *only* from a linked routine
-- (workouts.routine_id -> routines.name). That works for routine-started and
-- manual "empty" sessions, but a Hevy import is a one-off session that carries
-- its own title ("Chest & Triceps", "Legs (hamstring focused)") and no routine —
-- so every imported workout rendered as "Empty workout". The import even had the
-- title in hand and could only smuggle it into `notes`.
--
-- Add a first-class, nullable `title` on workouts. NULL keeps today's behaviour
-- (fall back to the routine name, then "Empty workout"); a non-NULL title is the
-- session's own name and wins in the display fallback.

alter table public.workouts add column if not exists title text;

-- Backfill already-imported Hevy workouts. The old importer wrote
-- notes = 'Imported from Hevy · <title>' whenever the Hevy description was empty
-- (which it is for a standard export), so the title is recoverable. Lift it into
-- the new column and clear the now-redundant synthetic note.
update public.workouts
set title = substring(notes from '^Imported from Hevy · (.*)$'),
    notes = null
where title is null
  and notes ~ '^Imported from Hevy · ';
