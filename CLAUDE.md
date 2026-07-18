@AGENTS.md

# RepVoice — project conventions

Workout logging app. Phase 1 = manual tracker backbone. Phase 2 adds voice/LLM logging. Phase 3 TBD.

**Before doing anything else, read the knowledge base in `docs/`:**
- [`docs/PROJECT-SUMMARY-PHASE1.md`](docs/PROJECT-SUMMARY-PHASE1.md) — manual tracker: what's built, decided, left
- [`docs/PROJECT-SUMMARY-PHASE2.md`](docs/PROJECT-SUMMARY-PHASE2.md) — voice/LLM pipeline: same, for Phase 2
- [`docs/WORK-LOG.md`](docs/WORK-LOG.md) — dated history of what happened each session

Those files answer "what already exists and why" without re-reading the whole codebase.
Update the relevant summary + append a work-log entry at the end of any session that
changes what's built or decided — don't let the docs drift from reality.

## Hard rules

- **Weight is stored in kg** as `numeric(6,2)`, always. Unit conversion (kg ↔ lb) is a
  display concern only. Default display unit: **kg** (`profiles.default_unit`).
- **No API keys in client code.** All future AI/LLM calls go through Supabase Edge
  Functions. The client holds only the anon key (via `.env` → `app.config.ts` extra).
- **Frontend is intentionally unstyled** until a dedicated design phase: default fonts,
  black/white/grey only, minimal spacing. Never add colors, custom fonts, or a component
  library without being asked. `src/theme/tokens.ts` is the (empty) placeholder for the
  future design pass.
- **All DB access goes through `src/data/` repository modules.** Screens and components
  never import `src/lib/supabase.ts` directly — auth is also wrapped, in `src/data/auth.ts`.
- Security model is **Postgres RLS** (`user_id = auth.uid()`, child tables via join).
  Never rely on client-side filtering for data isolation.

## Stack & choices

- Expo SDK 57, TypeScript, Expo Router (routes live in `src/app/`).
- Supabase: Postgres + Auth (email OTP) + (Phase 2) Edge Functions.
- Server state via **@tanstack/react-query** over the repositories. Query keys live with
  the hooks in `src/data/hooks.ts`. Mutations invalidate the relevant keys.
- Validation/types: hand-written zod schemas in `src/types/db.ts` are the single source
  of truth for row types — import row types from there everywhere.
- Node scripts in `scripts/` run with `npx tsx` and use the **service role key** from
  `.env` (never shipped to the client).

## Layout

- `src/app/` — Expo Router screens
- `src/components/` — shared UI (small, dumb components)
- `src/data/` — repositories: `exercises.ts`, `routines.ts`, `workouts.ts`, `sets.ts`,
  `auth.ts`, plus `hooks.ts` (React Query wrappers)
- `src/lib/supabase.ts` — the only place the client is created
- `src/types/db.ts` — zod schemas + row types
- `supabase/migrations/` — SQL migrations (apply with `supabase db push` or the SQL editor)
- `scripts/` — seed-exercises, import-hevy, test-rls

## Schema notes (do not "fix" these)

- `sets.logged_via` / `raw_transcript` / `parse_confidence` exist now even though Phase 1
  only writes `manual` — avoids a Phase 2 migration on a hot table.
- `exercise_aliases` is a separate table (not an array column) because Phase 2
  canonicalization does indexed lookups on it. `pg_trgm` is enabled for fuzzy matching.
- `workouts.external_id` exists for idempotent imports (Hevy); unique per user.

## Current state

- Phase 1 scaffold + schema + repositories + screens + seed & import scripts written.
- NOT yet done: Supabase project creation (user), applying migration, running seed,
  Hevy import run, RLS two-account test run, 4 real workouts logged.
- No AI anywhere yet (by design — Phase 2).
