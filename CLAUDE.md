@AGENTS.md
@docs/AGENT-PROTOCOL.md

# RepVoice — project conventions

Workout logging app. Phase 1 = manual tracker backbone. Phase 2 adds voice/LLM logging. Phase 3 TBD.

**Before doing anything else, read the knowledge base in `docs/`:**
- [`docs/AGENT-PROTOCOL.md`](docs/AGENT-PROTOCOL.md) — **the operating protocol** (auto-loaded via the `@import` above): how to work here when many chats run in parallel, and the update-docs-and-commit routine on every completion step. Follow it every session.
- [`docs/CONTEXT.md`](docs/CONTEXT.md) — **start here.** The fast-start dashboard: current state, pending actions, and the open-issue backlog, with pointers into the deeper docs. Update its three live sections at the end of any session that changes what's built.
- [`docs/FEEDBACK-LOG.md`](docs/FEEDBACK-LOG.md) — hands-on feedback items with per-item Done/Open status; update when a feedback-driven fix lands.
- [`docs/PRODUCT-PRINCIPLES.md`](docs/PRODUCT-PRINCIPLES.md) — **the standing priorities behind every decision** (showcase-first purpose, sleek + minimal-touch UI, instant speed). When a request would compromise a priority, flag it before implementing.
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
- **The design phase has happened — the UI is the dark "LED-instrument" theme.** (This
  supersedes the old "frontend is intentionally unstyled / black-white-grey only" rule.)
  `src/theme/tokens.ts` is fully populated and is the **single source of truth for every
  color, font, radius, spacing, and shadow** — never hardcode a value that has a token, and
  never introduce a color/font outside the token set. Fonts are Instrument Sans (UI) + Geist
  Mono (numbers) — the "type option 01" refresh (2026-07-31). The reference designs live in
  `docs/design/` (`RepVoice-Manual.dc.html` is what's implemented; the voice-first canvas is
  kept for Phase 2).
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

- **Manual-first.** The full manual loop — add/save routine → start → pick exercises →
  log weight×reps×sets (set grid + keypad) → finish summary → history → per-exercise weight
  history — is implemented across all 11 `RepVoice Manual` screens on the dark theme.
  Backbone (schema, RLS, repos, curated 150-exercise seed) is verified live.
- Voice logging (Phase 2) is built but **unwired from the manual screens**; it returns later
  on top of the same set grid. Don't delete voice code.
- NOT yet done: first on-device OTP login + a real manual-loop walkthrough (the build is
  `tsc`- and web-export-verified only, never run on a device).
- Read [`docs/CONTEXT.md`](docs/CONTEXT.md) for the live status / pending / open-issues detail.
