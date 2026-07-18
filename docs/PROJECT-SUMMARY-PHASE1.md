# RepVoice — Project Summary (Phase 1)

**Purpose of this file:** a standing knowledge base for both humans and future Claude
Code sessions. Read this first before exploring the codebase — it should answer "what
is this, what's built, what's decided, what's left" without needing to re-read every
file. Update it incrementally as work continues; keep it concise, not exhaustive.

---

## 1. What this is

RepVoice is a personal workout-logging app, replacing Hevy. Three planned phases:

- **Phase 1 (this doc's scope)**: manual tracker backbone — no AI. Unlimited routines,
  fast set logging, last-session recall, history, exercise library.
- **Phase 2**: voice logging via an LLM (say a set out loud, it gets parsed and logged).
- **Phase 3**: TBD (likely PR detection, charts, suggestions).

The full Phase 1 spec lives in the original build doc the user supplied
(`~/Downloads/phase-1-foundation-and-backbone.md`) — this summary is the living,
updatable record of what was actually built from it, not a copy of the spec.

## 2. Stack

- **Expo SDK 57** (React Native), TypeScript, Expo Router — file-based routes under `src/app/`.
- **Supabase**: Postgres + Auth (email OTP). Edge Functions reserved for Phase 2 (LLM calls
  must be server-side — no API keys in the client, ever).
- **@tanstack/react-query** for all server state, layered over hand-written repository functions.
- **zod** schemas as the single source of truth for row types (not auto-generated —
  written by hand so types exist even before a Supabase project is created).

## 3. Current status

| Build step | Status |
|---|---|
| App scaffold, env config, conventions doc | ✅ Done |
| Database schema + Row Level Security | ✅ Done (migration written, **not yet applied**) |
| Data access layer (`src/data/`) | ✅ Done |
| Exercise library seed script + alias map | ✅ Done (script written, **not yet run**) |
| All 6 Phase 1 screens | ✅ Done |
| Hevy import | ❌ **Descoped** — removed from the Phase 1 plan entirely, not just deferred |
| Typecheck / verify / first commit | ✅ Done (`tsc --noEmit` clean, `expo export` bundles all 9 routes) |

All Phase 1 code is committed. What's left is entirely account/credential setup and
actually using the app — nothing further to build until that's done.

### Things only the user can do (require real credentials/accounts)
- Create a free Supabase project.
- Fill in `.env` (copy from `.env.example`) with the project URL + anon key + service role key.
- Apply `supabase/migrations/0001_init.sql` (and `0002_voice_logs.sql`, harmless if Phase 2
  hasn't started — it only adds a new table) to that project via the SQL Editor.
- Run `npm run seed` to populate the exercise library.
- Run `npm run test:rls` to verify the two-account security isolation for real.
- Actually log workouts in the app (the phase's real done-bar: 4 consecutive real workouts).

## 4. Key decisions & rationale

- **App name**: "RepVoice" — placeholder, trivial to rename (just `app.config.ts` + package name).
- **Weight stored in kg always** (`numeric(6,2)`). Unit conversion is display-only,
  driven by `profiles.default_unit`. Never store lb.
- **Frontend is deliberately unstyled**: default fonts, black/white/grey, no component
  library. `src/theme/tokens.ts` is an empty placeholder for a future design pass —
  don't add colors or styling without being explicitly asked.
- **All DB access goes through `src/data/` repositories** — screens never import the
  Supabase client directly. This is a hard rule (see `CLAUDE.md`), meant to keep an AI
  agent from spaghetti-coding data access directly into screens later.
- **Security model is Postgres Row Level Security**, not client-side filtering. Every
  user-owned table has `user_id = auth.uid()` policies (child tables via join to parent).
- **Phase-2-readiness columns exist now, unused**: `sets.logged_via` / `raw_transcript`
  / `parse_confidence` are in the schema today (Phase 1 only ever writes `logged_via='manual'`)
  specifically to avoid a migration on a hot table later. Don't "clean these up."
- **`exercise_aliases` is a separate table**, not an array column, because Phase 2's
  voice-parsing does indexed alias lookups. `pg_trgm` (fuzzy text search) is enabled
  in the very first migration for the same reason.
- **Hevy import removed from scope.** The build plan originally included a CSV import
  script; the user cut it. The schema still has `workouts.external_id` (a
  general-purpose idempotency key for any future import), but no import script exists
  and none is planned unless asked for again.
- **React Query chosen for server state** over plain hooks — standard, swappable choice,
  documented in `CLAUDE.md`.

## 5. Folder map (what lives where)

```
src/app/                 Expo Router screens (file path = route)
  _layout.tsx            Root layout: auth gate (signed out → SignInScreen),
                          React Query provider, Stack navigator for signed-in routes
  index.tsx               Home: routines list, start workout, resume-in-progress banner
  routine/[id].tsx        Routine editor (id="new" for create); ordered exercise list,
                          optional target sets/reps, archive toggle
  workout/[id].tsx        Active workout: per-exercise expand/collapse, last-session
                          panel, add-set row (defaults to previous set this session),
                          finish/discard
  history/index.tsx       Reverse-chronological workout list, paginated
  history/[id].tsx        Read-only workout detail (all exercises/sets)
  exercises.tsx           Exercise library browser/search
  exercise/[id].tsx       Full history of one exercise, grouped by workout, paginated

src/components/
  SignInScreen.tsx        Email OTP sign-in (two-stage: email → 6-digit code)
  ExercisePickerModal.tsx Searchable picker used by routine editor + active workout;
                          includes inline "create custom exercise" form
  ui.tsx                  Tiny unstyled primitives: Btn, Loading, Empty, ErrorText

src/data/                 THE repository layer — only place that talks to Supabase
  auth.ts                 Session, OTP send/verify, sign out, profile read/update
  exercises.ts            Search (via SQL function), list, get, create custom
  routines.ts              CRUD + replace-exercise-list-wholesale
  workouts.ts              Start/finish/discard, active-workout lookup, workout detail,
                            history list, last-session query, exercise-history query
  sets.ts                 Add/update/delete a set (auto-increments set_number)
  hooks.ts                React Query wrappers over the above — screens use these,
                          not the repositories directly, and never the raw client

src/lib/supabase.ts       The one place the Supabase client is constructed
src/types/db.ts           zod schemas + inferred TS types for every table — import
                          row types from here everywhere, never redefine them
src/theme/tokens.ts       Empty placeholder for future design phase

supabase/migrations/0001_init.sql   Full schema: tables, indexes, RLS policies,
                                     profile-on-signup trigger, two SQL functions
                                     (search_exercises, last_session_sets)
scripts/
  seed-exercises.ts       Downloads free-exercise-db (~870 exercises), upserts,
                          idempotent
  exercise-aliases.ts     Reviewable alias map (~70 lifts → shorthand like "RDL",
                          "OHP") — every key verified against the real dataset
  test-rls.ts             Creates 2 throwaway accounts, proves account B cannot
                          read/write account A's data, then cleans up
```

## 6. Database schema (summary)

Tables: `profiles`, `exercises`, `exercise_aliases`, `routines`, `routine_exercises`,
`workouts`, `workout_exercises`, `sets`. Full column-level detail is in
`supabase/migrations/0001_init.sql` — read that file directly rather than duplicating
it here if you need exact types/constraints.

Two SQL functions do the heavy lifting server-side (avoids N+1 queries from the client):
- `search_exercises(q, max_results)` — ranks canonical-name matches, alias matches, and
  trigram similarity in one query.
- `last_session_sets(exercise_id, exclude_workout_id)` — returns the previous finished
  workout's sets for an exercise, in order. Backs the "last session" recall panel.

## 7. What a future session should know before touching this

- Don't re-derive conventions from scratch — they're in `CLAUDE.md` (hard rules) and
  section 4 above (rationale). Read both before proposing a different pattern.
- If extending the schema, add to a **new** migration file, don't edit `0001_init.sql`.
- If the Supabase project doesn't exist yet when you pick this up, data-dependent work
  (seeding, RLS test, actually running the app against real data) is still blocked —
  check `.env` for real (non-placeholder) values first.
- Voice/LLM logging (Phase 2) is intentionally not started. The schema and repository
  layer were shaped to make that addition non-disruptive — see section 4.
