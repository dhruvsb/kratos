# RepVoice — Session Context (start here)

**This is the fast-start dashboard. Read this first in any new chat**, then open the
deeper docs only as needed. It holds the current state, what's pending, and the open
issue backlog — so a fresh session can get productive without re-reading the whole
codebase or a huge prior conversation.

> **Maintenance rule:** at the end of any session that changes what's built/decided,
> update the three live sections here (**Current state**, **Pending actions**, **Open
> issues**) *and* append a dated entry to [`WORK-LOG.md`](./WORK-LOG.md). This file is the
> snapshot; `WORK-LOG.md` is the full history. Keep this file short.

**Last updated:** 2026-07-30 (session 3 — **exercise directory rebuild**: replaced the 873
free-exercise-db rows with a curated 150-set carrying muscle arrays + body-region rollup +
mechanic/modality; applied migrations 0003 & 0004 live. See WORK-LOG). Static-verified + live-verified.

---

## What this is (10-second version)

RepVoice = a workout logger (Expo/React Native + Supabase), built as a **portfolio /
showcase piece** (judged on screenshots, demo recordings, and a stranger trying it cold).
Weight is always stored in kg. **Current focus: manual-first.** The whole manual loop
(routine → start → pick exercises → log weight×reps×sets → per-exercise weight history)
is now implemented on the dark "LED-instrument" theme per the `RepVoice Manual` design.
Voice logging (Phase 2) is built but **unwired from the manual screens** and returns
later on top of the same set grid. Three phases: **1** manual tracker, **2** voice
logging via an LLM pipeline, **3** TBD (PRs/charts).

> **Where the designs live:** [`docs/design/`](./design/) holds the imported Claude Design
> canvases — `RepVoice-Manual.dc.html` (what's implemented) and
> `RepVoice-VoiceFirst-v3.dc.html` (kept for the later voice phase), plus `support.js` so
> both render standalone.

## Read order (deeper docs)

1. [`PRODUCT-PRINCIPLES.md`](./PRODUCT-PRINCIPLES.md) — the *why* / standing priorities. Flag conflicts before implementing.
2. `../CLAUDE.md` + `../AGENTS.md` — hard rules (kg-only, no client API keys, repo-layer-only DB access, RLS) and stack.
3. [`PROJECT-SUMMARY-PHASE1.md`](./PROJECT-SUMMARY-PHASE1.md) — manual tracker: built/decided/left.
4. [`PROJECT-SUMMARY-PHASE2.md`](./PROJECT-SUMMARY-PHASE2.md) — voice/LLM pipeline: same. (§9 = latest QA fixes.)
5. [`WORK-LOG.md`](./WORK-LOG.md) — full dated change history (newest at top).

---

## Current state

| Area | Status |
|---|---|
| Phase 1 backbone (schema, RLS, repos) | ✅ Built; backend verified live (**150 curated exercises** / 156 aliases seeded; RLS test passed) |
| **Exercise directory — curated + rich metadata** | ✅ **Rebuilt this session**: replaced the 873 free-exercise-db import with a curated 150-set carrying `primary_muscles[]`, `secondary_muscles[]`, `body_region[]` rollup, `mechanic`, `modality`. Source of truth: `scripts/data/exercises-curated.json` (regen via `scripts/build-curated-exercises.py`). Muscle taxonomy in `src/lib/muscles.ts`. |
| **Manual-first UI — all 11 `RepVoice Manual` screens** | ✅ **Built this session** (dark LED theme); **not yet run on device** |
| ↳ Manual set logging (grid + keypad) — *the core, previously missing* | ✅ Built (`workout/[id]`, `components/workout/SetKeypad`, `lib/units`) |
| ↳ Home / routine editor / picker / history / past workout / exercise progress / library / finish | ✅ Built / restyled dark |
| Two-theme white/dark patchwork | ✅ **Resolved** — every screen is now dark; `_layout` header config dropped |
| Phase 2 voice pipeline (extraction → resolution → kg) | ✅ Built; edge fn deployed + auth-guarded; **unwired from manual UI** (returns later) |
| Native iOS dev client on physical iPhone 15 | ✅ Installed, launches to sign-in |
| First OTP login + on-device smoke test of the manual loop | ❌ **Never completed** — the manual UI is unverified on device until this happens |
| Eval baseline (`npm run eval`) | ❌ Never run against the real API (Phase 2 concern) |
| Migration `0003_alias_write_policy.sql` | ✅ **Applied this session** (was committed-but-unapplied; Phase 2 alias write-back policy now live) |
| Migration `0004_exercise_metadata.sql` | ✅ Applied — exercises table restructured (muscle arrays + body_region + mechanic + modality; dropped `primary_muscle`/`category`) |

Static checks currently green: `tsc --noEmit` clean; `expo export --platform web` bundles all 11 routes.

## Pending actions (owner: user / next session)

- [ ] **Complete first OTP login on device**, then walk the manual loop: Home → start a
      routine → add exercise → log a set via ✓ and via the keypad → edit a set → finish →
      see it in History → open an exercise's progress (weight history). This is the real
      verification of the manual-first build (fonts, dark theme, keypad, grid all unproven
      on device).
- [ ] **Create + save a routine** on device (name, add exercises, targets, save) and confirm
      it appears on Home and starts.
- [ ] Log ~4 real workouts on-device (the real "done" bar for the manual tracker).
- [ ] *(Phase 2, when voice resumes)* Apply migration `0003` to the live DB; run `npm run eval`.
- [ ] Replace temporary Gmail SMTP with a dedicated provider before any external-user testing.

## Open issues / backlog (from the 2026-07-30 QA pass)

**Fixed in `6f96bf3`:** ✅ fonts load · ✅ white headers off dark screens · ✅ 10s undo reachable · ✅ alias-write RLS policy (migration 0003).

**Resolved in session 2 (manual-first):** ✅ two-theme patchwork gone (every screen dark) ·
✅ dev telemetry no longer reachable from the UI (removed from Home settings sheet) ·
✅ manual set-logging UI now exists (was entirely missing) · ✅ **manual writes are now
optimistic** (instant ✓, rollback on error) · ✅ **kg/lb unit toggle** in Settings (Home).

**Still open** (ranked):

| Sev | Issue | Where |
|---|---|---|
| **Med** | `sets.set_number` has no `UNIQUE(workout_exercise_id, set_number)`; computed client-side (max+1) → race-prone dupes. **More relevant now** that manual logging is the primary write path. | `0001_init.sql`, `src/data/sets.ts` |
| Med | No way to **remove an exercise** added by mistake mid-workout — `useRemoveWorkoutExercise` exists but isn't wired into the set-grid screen (potential dead-end: add wrong exercise, can't undo) | `src/app/workout/[id].tsx` |
| Med | `db.ts` `z.coerce` numeric guards are dead — repos `return data as X`, never `.parse()`; a numeric-as-string would make `weight_kg` a string | `src/data/*`, `src/types/db.ts` |
| Low | Picker RECENT/muscle **filter tabs** deferred (need usage data) — picker is search + create-custom only | `src/components/ExercisePickerModal.tsx` |
| Low | Finish summary omits the "NEW BESTS" callout (needs per-exercise all-time baseline; omitted, not faked) | `src/app/finish/[id].tsx` |
| Low | Routine editor uses ↑/↓ reorder, not drag | `src/app/routine/[id].tsx` |
| Low | Fresh account = empty Home/History/Progress; a `scripts/seed-demo-workouts.ts` would make screenshots (esp. the progress chart + week strip) look alive | `scripts/` |
| Low | App icon + splash are still default Expo placeholder art (white splash) | `app.config.ts`, `assets/` |
| Low | `addExerciseToWorkout` doesn't dedupe `(workout_id, exercise_id)` | `src/data/workouts.ts` |
| — | *(Phase 2 / voice — parked until voice resumes)* model IDs `gpt-5.6-luna/terra` unverified + eval never run; floor-mode auto-exit & PR-celebration wiring; voice dead code (`useVoiceSession.ts`, `useSessionSpeech`, `floorSensor.ts`); telemetry queries never invalidated; duplicated zod enums; `eval/README.md` stale `gpt-4o` refs | Phase 2 files |

---

## Environment & commands

Use Node 22 for anything Expo (the shell may default to Node 23, which is out of RN 0.86's engine range):

```bash
# Dev (JS iteration) — after the native client is installed
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo start --dev-client

# Rebuild native (only after native dep / config-plugin / app.config changes)
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo run:ios --device

# Static checks
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx tsc --noEmit
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo export --platform web

# Data / pipeline tooling
npm run seed        # seed exercise library (idempotent)
npm run test:rls    # two-account RLS isolation test
npm run eval        # score the golden set against the real pipeline
```

- Live Supabase project ref: `amonovkkjohvlkjlfsit` (region `ap-southeast-1`).
- Secrets live in `.env` (gitignored): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`. Only URL + anon key reach the client (via `app.config.ts` → `extra`).
