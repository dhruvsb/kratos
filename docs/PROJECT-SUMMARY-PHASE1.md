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
- **Supabase**: Postgres + Auth (configurable-length email OTP). Edge Functions are used
  by Phase 2; LLM calls must remain server-side and API keys must never be placed in the client.
- **@tanstack/react-query** for all server state, layered over hand-written repository functions.
  The query cache is **persisted to AsyncStorage** (`src/lib/queryClient.ts`, local-first) so cold
  start hydrates last-known data from disk before the network answers; `staleTime` is tiered per query.
- **zod** schemas as the single source of truth for row types (not auto-generated —
  written by hand so types exist even before a Supabase project is created).

## 3. Current status

| Build step | Status |
|---|---|
| App scaffold, env config, conventions doc | ✅ Done |
| Database schema + Row Level Security | ✅ Done and verified live |
| Data access layer (`src/data/`) | ✅ Done |
| Local-first cache (persisted React Query) | ✅ **Built 2026-07-31** — cache persisted to AsyncStorage; cold start paints from disk then revalidates; `staleTime` tiered; wiped on sign-out/account-switch. Warm-relaunch hydration proven live 2026-08-06 (instant paint from disk, even offline). |
| Instant interactions (navigate-first) | ✅ **Built 2026-07-31** — start/finish/discard/add-exercise optimistic: client-chosen row ids (`src/lib/ids.ts`) let START build the workout from the cached routine and navigate on the same tap; an FK-ordering await + snapshot rollback keep it safe; routine/last-session prefetch serves the 80%-repeat case; the 1s clock is isolated in `LiveClock`. Live-DB RLS harness green (10/10). |
| **Offline-first logging (write offline, sync on reconnect)** | ✅ **Built + QA'd 2026-08-06** — the active-logging path (start new/from-routine → pick → log/edit/delete sets → finish/discard) works fully disconnected, syncs on reconnect in FK-safe serial order, and survives an app kill (persisted mutation queue, `src/data/offlineSync.ts` + `src/lib/network.ts`; connectivity truth via a HEAD probe, not NetInfo alone). History/calendar/progress/voice deliberately online-only. Verified against the live DB incl. a workout born wholly offline; `npm run test:offline` 11/11. NetInfo is a native dep (dev-client rebuilt). See WORK-LOG 2026-08-06. |
| Exercise library seed script + alias map | ✅ Done and seeded live (**curated 150 exercises, 156 aliases** — rebuilt session 3 with rich metadata; see WORK-LOG) |
| Manual UI — 12 `RepVoice Manual` screens on the dark LED theme | ✅ Built (2026-07-30 s2; **Calendar** added s4). Incl. **manual set logging** (grid + keypad), which was previously **missing** (voice-only). Static-verified, not yet on device. |
| ↳ Core files | `src/app/{index,workout/[id],routine/[id],history/index,history/[id],exercise/[id],exercises,finish/[id],calendar}.tsx`, `src/components/{ui,ExercisePickerModal,workout/SetKeypad,workout/Caret}.tsx`, `src/data/calendar.ts`, `src/lib/units.ts` |
| Hevy import | ❌ **Descoped** — removed from the Phase 1 plan entirely |
| **In-app account deletion** (App Store Guideline 5.1.1(v)) | ✅ **Built + verified live 2026-08-08** — Settings → ACCOUNT → "Delete account" (two confirms) → `deleteAccount()` → RPC `public.delete_own_account()` (migration `0005`, security-definer, `auth.uid()`-only) → local sign-out wipes the persisted cache. Proven end-to-end against the live DB on a throwaway account: user, profile, routines, workouts, sets, voice_logs, custom exercises + aliases all gone; the seeded 150 untouched. |
| Native iPhone development client | ✅ Built, signed, installed, trusted, and launches to sign-in |
| Email OTP delivery | ✅ Temporary Gmail SMTP + `{{ .Token }}` template; 8-digit delivery verified |
| Typecheck / verify | ✅ `tsc --noEmit` clean; `expo export --platform web` bundles all routes; runs on the iOS simulator (manual loop + offline loop exercised live 2026-08-06). |

The Phase 1 backbone is built, its backend is verified, and the core logging loop (incl.
offline) has been exercised live on the simulator. What's left on-device: a from-scratch
OTP sign-in, the history/progress screens, and Hevy import/export end-to-end.

### Setup checklist — all verified done except the last item
- ✅ Supabase project created.
- ✅ `.env` filled in with real project URL + anon key + service role key.
- ✅ `0001_init.sql` and `0002_voice_logs.sql` applied — all 8 Phase 1 tables confirmed
  present and queryable.
- ✅ `npm run seed` run — **curated 150 exercises, 156 aliases** confirmed in the DB
  (rebuilt session 3; was 873); spot-checked search("RDL"/"OHP"/"incline db"/"deadlift")
  returns the right exercise as the top hit.
- ✅ `npm run test:rls` run for real — all 8 isolation checks passed (two throwaway
  accounts, one truly cannot read/write the other's data).
- ✅ Native development build installed on the user's iPhone 15; Expo Go is not used.
- ✅ Temporary custom Gmail SMTP configured and an 8-digit OTP delivered.
- ⬜ Complete the first OTP verification after the client was updated to accept
  Supabase's configurable 6–10 digit codes.
- ⬜ Log 4 consecutive real workouts on-device. That's the phase's real done-bar.

## 4. Key decisions & rationale

- **App name**: "RepVoice" — placeholder, trivial to rename (just `app.config.ts` + package name).
- **Weight stored in kg always** (`numeric(6,2)`). Unit conversion is display-only,
  driven by `profiles.default_unit`. Never store lb.
- **Phase 1 screens are deliberately minimal**: the original logging and history surfaces use
  plain React Native components so the workflow can be validated first. The later voice-first
  Home surface has its own tokenized visual treatment, but the broader redesign remains paused
  until on-device workflows are validated.
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
  SignInScreen.tsx        Email OTP sign-in (two-stage: email → configurable 6–10
                          digit numeric code)
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
src/theme/tokens.ts       Shared visual tokens used by the voice-first surfaces

supabase/migrations/0001_init.sql   Full schema: tables, indexes, RLS policies,
                                     profile-on-signup trigger, two SQL functions
                                     (search_exercises, last_session_sets)
scripts/
  seed-exercises.ts       Wipes + seeds the curated 150 from data/exercises-curated.json,
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
- The live Supabase project, migrations, seed, and RLS verification are complete. Do not
  recreate or reseed them blindly; inspect the current project and work log first.
- Run the installed native client with Node 22 via
  `PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo start --dev-client`.
- Temporary Gmail SMTP is for private testing only. Replace it with a dedicated provider
  and verified RepVoice-owned sending domain before external-user testing.
- Phase 2 voice logging exists and is deployed; see `PROJECT-SUMMARY-PHASE2.md`.
