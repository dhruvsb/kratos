# Work Log

Append-only, dated log of individual sessions. This is the **history**; the
`PROJECT-SUMMARY-PHASE*.md` files are the **current-state snapshot**. When you finish a
session, add an entry here (newest at the top) and update the relevant summary file's
status table/decisions — don't let the two drift apart.

---

## 2026-07-19 — Voice-first redesign (IN PROGRESS, paused mid-session)

**Session scope:** Implement the Claude Design mockup "RepVoice Voice-First"
(`claude.ai/design/p/3490cf7c-7c24-47da-a2a7-dbc0f28ed54e`, project "RepVoice
Mobile App Mockup") — a dark LED-instrument redesign of the voice logging flow.
User approved: full behavioral rebuild (not just visuals) + gyro floor mode +
TTS/earcons, scoped to **voice-first screens only** (Home + active workout);
history/exercise-library/routine-editor/sign-in stay Phase-1 unstyled for now.

**Paused because:** approaching a usage-limit boundary. Everything committed
below typechecks clean (`npx tsc --noEmit`) but **nothing has been run on a
device or in Expo Go yet** — same "unverified" caveat as the rest of Phase 2's
voice UI.

### Done this session
- `npm install`ed: `@expo-google-fonts/space-grotesk`, `@expo-google-fonts/ibm-plex-mono`,
  `expo-speech`, `expo-haptics`, `expo-sensors`, `expo-linear-gradient`.
- **`src/theme/tokens.ts`** — filled in for real (was the empty Phase-1 placeholder):
  `color`/`radius`/`space`/`shadow`/`tracking`/`timing` + `font` family-name
  strings, all lifted 1:1 from the mockup's CSS custom properties. `timing.*`
  holds the commit state machine's config tokens (`commitHoldMs` 1200,
  `undoWindowMs` 6000, `confFloor` 0.9, `floorEnterMs` 2000, etc) — change
  behavior there, never inline a number.
- **`src/theme/fonts.ts`** — `useAppFonts()` (wraps `expo-font`'s `useFonts`).
  **Not yet wired into `_layout.tsx`** — that's the first thing left to do
  (see below): root layout must gate first paint on `loaded` or text renders
  in the system font until fonts resolve.
- **`src/components/voice/primitives.tsx`** — `LedDigits` (ghost-segment
  digits), `LevelMeter`, `DrainBar`, `KeyCap` (physical keycap via
  `expo-linear-gradient`), `StatusPip`, `TickRule`, `ParseChip`, `InsetWell`.
- **`src/components/voice/TabBar.tsx`** — HOME/HISTORY/SETTINGS bottom nav.
- **`src/lib/feedback.ts`** — `speak()` (TTS via `expo-speech`, gated by an
  echo-verbosity setting: full/numbers/earcon/silent) + `earcon()` (haptic
  patterns via `expo-haptics` standing in for the mockup's relay-click sound
  spec — **there are no bundled audio assets**, this is the one honest gap;
  see the file's top comment for how to wire real `.wav`s later without
  touching call sites).
- **`src/lib/floorSensor.ts`** — `useFloorModeSensor()`, gyro-based floor-mode
  auto-enter/exit via `expo-sensors` DeviceMotion (face-up + stationary
  `timing.floorEnterMs`). Additive only — the FLOOR MODE key is still the
  manual override.
- **`src/lib/stt.ts`** — added `useSessionSpeech()` alongside the existing
  tap-to-toggle `useSpeechToText()` (untouched, still used by Home's
  session-start voice command). New hook is the continuous "mic stays open
  all workout" model: `continuous:true` + `volumeChangeEventOptions`, restarts
  itself on the recognizer's natural `end` events, exposes `interim`/`level`
  for the console's live readout and meter, and a `setMuted()` that actually
  stops/restarts the native recognizer (not just a UI flag).
- **`src/hooks/useVoiceSession.ts`** — the commit state machine from the
  mockup's agent notes (2h): `idle → parsing → committing (drain bar,
  cancelable) → committed (echo + undo window) → idle`, with a `clarify`
  branch for low-confidence/ambiguous/unmatched results. Routes control words
  locally with zero LLM round-trip: "no"/"undo"/"cancel" (cancel the drain or
  undo a just-committed set), "mute"/"unmute", "done"/"finish" (calls
  `onFinishRequested`), `"rest <N>"` / `"skip rest"` (calls
  `onRestOverride`/`onSkipRest` — **caller must supply these**, the hook
  itself has no rest-timer state), and anything matching `/^(what|how|plates)/`
  routes to `onQuery(transcript)` **unanswered** — the hook just detects it's
  a query and hands the raw transcript back; **the screen still needs to
  implement the actual answer** (see Not Done below). Everything else goes
  through the real `parse-utterance` pipeline via the existing
  `useParseVoiceUtterance`/`useConfirmVoiceEntries`/`useUndoVoiceSets` hooks —
  no parsing logic was duplicated.
- **`src/data/sets.ts` / `src/data/hooks.ts`** — added `useUpdateSet()` (the
  repo's `updateSet()` existed but had no hook; the correction drawer needs it).
- **`src/app/index.tsx`** — Home screen fully rebuilt to the mockup (2e):
  REPVOICE wordmark, TALK ring (LevelMeter + LED underline, tap-to-toggle via
  the *existing* `useSpeechToText`, not the new session hook — Home doesn't
  need a continuous mic), routine cards under "OR PRESS" (real data —
  `exercise_count`, not the mockup's fabricated "3 days ago"), bottom TabBar.
  **Voice command matching is local, not LLM**: "start empty" / routine-name
  word-overlap against `useRoutines()` — documented in-file *why*:
  `ParseResult`'s `intent` enum is only `log_sets | correct_last | unknown`,
  there is no session-control intent in the backend yet, so inventing one
  client-side (rather than pretending the LLM understands it) is the honest
  choice. Settings tab opens an action sheet (Exercise library / Voice
  telemetry / Sign out) — folds in the three Phase-1 home-screen affordances
  the mockup's tab bar doesn't have room for, so nothing was lost.

### Not done yet — pick up here
1. **`src/app/_layout.tsx`**: wire `useAppFonts()` in in, dark-theme the
   `Stack` (`screenOptions`), gate first paint on fonts loaded (show
   `<Loading/>` until then, same pattern as the existing auth-session gate).
2. **`src/components/voice/CorrectionDrawer.tsx`** (not started): bottom
   sheet, mockup 2d. Needs `mode: 'edit' | 'create'`. Edit: header
   `{Exercise} · set {n}` + `LOGGED {time}` + DELETE (warn-tone `KeyCap`,
   confirm via `Alert`, calls `deleteSet`); weight/reps steppers (±2.5kg /
   ±1 rep) using `KeyCap`; SAVE calls the new `useUpdateSet()`. A `PLATES ⊞`
   key renders **decorative/disabled** (`tone:'ghost'`, no `onPress`) — no
   plate-math feature exists, don't fake one. Create mode: same stepper UI
   for logging a first manual set on an exercise not yet in the tape (opens
   `ExercisePickerModal` first if no exerciseId given, then calls `addSet`).
3. **`src/components/voice/VoiceConsole.tsx`** (not started): mockup 2b.
   Header (StatusPip LISTENING/MUTED, routine name, elapsed timer, "SET N ·
   TOTAL KG"), session tape (`InsetWell` + tape rows built from
   `workout.exercises.flatMap(sets)` sorted by `created_at`, tapping a row
   opens `CorrectionDrawer` in edit mode), HEARD panel driven entirely by
   `useVoiceSession`'s `phase`/`heard`/`clarify`/`committed`/`drainProgress` (a
   `switch` on `phase` — parsing/committing/clarify/committed/error all need
   their own small render, all four already have the data shaped for them),
   bottom bar (rest-timer `LedDigits`, `LevelMeter` bound to `session.level`,
   MUTE `KeyCap` → `session.setMuted`, FLOOR MODE `KeyCap` → floor-mode
   toggle state owned by the parent screen).
4. **`src/components/voice/FloorMode.tsx`** (not started): mockup 2c, two
   states (`rest` / `echo`) as described in the mockup HTML pulled earlier in
   this conversation (still in this session's context if resumed same-session;
   otherwise re-fetch via `DesignSync get_file` on `RepVoice Voice-First.dc.html`
   in project `3490cf7c-7c24-47da-a2a7-dbc0f28ed54e` — the full HTML/JS is
   there, sections `2c` for floor mode, `2h` for the state-machine spec).
5. **Rest timer**: no rest-timer state exists anywhere yet. Owned by
   `workout/[id].tsx` itself (not `useVoiceSession`): a `useState<number|null>`
   counting down every 1s, started whenever `session.committed` changes
   identity (new commit ⇒ start `timing.restDefaultSec`), adjusted by the
   session hook's `onRestOverride`/`onSkipRest` callbacks, firing
   `earcon('restEnd')` + `speak(...)` at zero.
6. **Query answering**: `useVoiceSession`'s `onQuery` only detects "this looks
   like a question" — implement **exactly one** answer to stay honest about
   backend capability: "what did I \<exercise\> last time" → resolve the
   exercise name against `sessionExercises`/current exercise, call
   `workouts.getLastSession`, `speak()` the result. Do **not** implement PR
   queries or plate math — no PR detection exists (Phase 3) and there's no
   plate-math logic anywhere; answering those would be fabricating a
   capability. If a query doesn't match the one implemented pattern, speak a
   plain "I can't answer that yet."
7. **`src/app/workout/[id].tsx`**: the big rewire. Replace the current
   `ExerciseBlock`-per-exercise UI with `VoiceConsole` as the primary view
   (mockup's "no exercise cards, no expand/collapse — the workout IS the
   log"), `FloorMode` as a full-screen overlay (entered via
   `useFloorModeSensor` or the FLOOR MODE key, exited by tap or gyro pick-up),
   `CorrectionDrawer` as the tap-a-tape-row / add-exercise-manually path.
   Keep Finish/Discard (dark-themed `KeyCap`s). Wire `useVoiceSession` with
   `enabled: !isFinished`, `context` built from `profile.data?.default_unit`,
   `lastSession`/`sessionExercises` same as today's `VoiceMicButton` props.
8. Run `npx tsc --noEmit` (must remain clean — it is right now) and
   `npx expo export --platform web` after the rewire.
9. Actually run it: `npx expo prebuild && npx expo run:ios` (or Android) —
   none of steps 1–8 have been tried on a simulator/device. Fonts, haptics,
   speech, and the gyro sensor are all native-module-dependent; Expo Go will
   not work for the same reason Phase 2's original voice UI needed a native
   build (`expo-speech-recognition`).
10. Update `PROJECT-SUMMARY-PHASE2.md` (or split a `PHASE2-DESIGN.md`) once
    the above is verified working, not before — don't mark this "done" in the
    summary file while it's still unverified on-device.

### Decisions made this session (carry forward)
- Voice-first screens only for this pass — Phase 1 screens (history, exercise
  library, routine editor, sign-in) intentionally left unstyled; don't
  restyle them as a side effect of touching shared components.
- Client-side command matching (Home's routine-start, the session hook's
  control words / rest override / query detection) is **deliberately not**
  routed through the LLM pipeline — `ParseResult`'s intent enum doesn't cover
  session control or queries yet. If Phase 2's backend ever adds those
  intents, these client-side matchers should be replaced, not layered under.
- Earcons are haptics, not audio, until real sound assets exist — see
  `src/lib/feedback.ts`'s top comment.
- `PLATES ⊞` key (correction drawer) should render but stay non-functional —
  don't build a plate calculator that wasn't asked for.

## 2026-07-19 — Pin model to gpt-5.6-luna + full functional audit

**Session scope:** Verify everything required for the app to function is built (frontend/
design/UI and QA excluded — user's domain), and finish wiring the specific OpenAI model.

**Audit result:** All Phase 1 + Phase 2 code is complete and `tsc --noEmit` is clean. No
stubs or TODOs anywhere except `src/theme/tokens.ts` (intentionally deferred to the design
phase). The only remaining work is account/device setup that requires the user's own
credentials/CLI (apply `0002_voice_logs.sql`, deploy the edge function + set the
`OPENAI_API_KEY` secret, run the eval baseline, native dev-client build) — none of it
doable unattended here; `supabase`/`deno` CLIs are not installed in this env.

**Changed:**
- Pinned `PARSE_MODEL_DEFAULT` = `gpt-5.6-luna`, `PARSE_MODEL_MID` = `gpt-5.6-terra` in
  `prices.ts` (were the old placeholder `gpt-4o-mini`/`gpt-4o`). **Verified live** against
  platform.openai.com / developers.openai.com: GPT-5.6 family GA 2026-07-09, Luna $1/$6
  per 1M in/out, Terra $2.50/$15. Updated `MODEL_PRICES` accordingly and dropped the
  "unverified" warnings the file/docs carried.
- Confirmed the code's API surface matches GPT-5.6: Chat Completions with
  `response_format:{type:'json_schema',strict:true}` + `max_completion_tokens` — no code
  change needed in `llm.ts`.
- Refreshed stale `gpt-4o*` references in `eval/run.ts` and `scripts/parse-cli.ts` usage
  comments; updated `PROJECT-SUMMARY-PHASE2.md` §2/§3/§5/§7.

**Not done / next up:** unchanged from below — the user sets `OPENAI_API_KEY` (local `.env`
+ Supabase secret) and does the deploy/migrate/eval/native-build steps. See
`PROJECT-SUMMARY-PHASE2.md` §3.

## 2026-07-19 — Phase 2: switched LLM provider from Anthropic to OpenAI

**Session scope:** Phase 2 only. User doesn't want to get an Anthropic key right now and
has an OpenAI key instead.

**Changed:**
- Added `OpenAiLlm` to `llm.ts` (Chat Completions API, `response_format:
  {type:'json_schema', strict:true}`), implementing the same `LlmClient` interface.
  `AnthropicLlm` is untouched and still there, just unused — switching back later is a
  call-site change, not a rewrite.
- Repointed `PARSE_MODEL_DEFAULT`/`PARSE_MODEL_MID` and `MODEL_PRICES` in `prices.ts` to
  OpenAI models. **Could not verify these live** — two WebFetch lookups against OpenAI's
  pricing/model pages returned inconsistent catalogs, so the model IDs (`gpt-4o-mini`,
  `gpt-4o`) and prices are carried over from pre-cutoff training knowledge, flagged
  clearly in-file as needing confirmation at platform.openai.com before trusting cost
  numbers.
- Updated the edge function, `parse-cli.ts`, `eval/run.ts`, `.env.example`, and
  `eval/README.md` to read `OPENAI_API_KEY` instead of `ANTHROPIC_API_KEY`.
- `npm install openai` (added as a dependency; `@anthropic-ai/sdk` also left in place).

**Not done / next up:** user needs to get their key, confirm the model IDs/pricing are
still current, and run `npm run eval` for the first time — same outstanding list as
before, now against OpenAI. See `PROJECT-SUMMARY-PHASE2.md` §3.

## 2026-07-18 — Phase 2 complete: voice UI, eval harness, telemetry

**Session scope:** Phase 2 only. Finished everything remaining from the previous Phase 2
session's status table.

**Built:**
- Eval harness: 50-case synthetic golden set v1 (all 7 spec categories), `eval/run.ts`
  (per-field + ambiguity-behavior + intent scoring, markdown report), `eval:compare` mode,
  `eval/README.md`.
- `scripts/parse-cli.ts` — local pipeline test tool. Deviates from the original spec
  (which had it hit the deployed edge function): calls Anthropic directly instead, since
  the deployed function requires a user JWT that's awkward to script. See
  `PROJECT-SUMMARY-PHASE2.md` §5 for the reasoning.
- Voice UI: `src/lib/stt.ts` (on-device STT via expo-speech-recognition, tap-to-toggle),
  `src/data/voice.ts` (parse/confirm/undo/alias-write repository), `VoiceMicButton` +
  `VoiceConfirmationCard` components, wired into the active-workout screen at both
  workout and per-exercise level. Failure modes handled: empty STT result, client-side
  parse timeout, parse error — transcript is never silently lost.
- `scripts/harvest-eval-cases.ts` — promotes edited/discarded `voice_logs` into draft
  golden cases.
- Dev-only telemetry screen (`/dev/telemetry`): acceptance rate, edit rate by field,
  ambiguity-question rate, p50/p95 latency, cost vs. the ₹2,000/month budget.
- Schema addition: `ParsedExercise.name` (resolved canonical name), needed by the
  confirmation card to display something other than the raw spoken phrase.
- `tsc --noEmit` and `expo export --platform web` both clean.

**Not done / next up:** everything remaining is account/device setup, not code — deploy
the edge function, apply `0002_voice_logs.sql`, set the `ANTHROPIC_API_KEY` secret (and
in local `.env`), run the eval baseline for the first time, build a native dev client and
test the voice flow on a real phone. Full list in `PROJECT-SUMMARY-PHASE2.md` §3.

## 2026-07-18 — Phase 1 setup verified against real Supabase project

**Session scope:** Phase 1 only. User created their Supabase project and filled `.env`.

**Verified (against the live project, not just files on disk):**
- Migrations applied: all 8 Phase 1 tables present and queryable.
- Seed ran: 873 exercises, 217 aliases in the DB; `search_exercises` spot-checked
  with "RDL", "OHP", "incline db" — all resolve correctly.
- `npm run test:rls` executed for real: all 8 two-account isolation checks passed.

**Not done / next up:** only the human step remains — log 4 consecutive real
workouts in the app. Nothing left to build for Phase 1.

## 2026-07-18 — Phase 1 finalization

**Session scope:** Phase 1 only. Closing out everything that doesn't require the
user's real Supabase credentials.

**Built:**
- Verification pass: `tsc --noEmit` clean; `npx expo export --platform web` bundles
  all 9 routes with no errors.
- Added `npm run seed` and `npm run test:rls` convenience scripts (were long `npx tsx`
  commands before).
- Confirmed `0002_voice_logs.sql` (Phase 2, added by the parallel session) is purely
  additive and doesn't conflict with anything Phase 1 depends on.

**Not done / next up:** everything remaining is account setup + real usage — create
the Supabase project, fill `.env`, apply the migrations, run seed + RLS test, log 4
real workouts. See `PROJECT-SUMMARY-PHASE1.md` § 3.

## 2026-07-18 — Phase 2 backend: parsing pipeline

**Session scope:** Phase 2 only (Phase 1 is being built in a parallel session).

**Built:**
- Shared `ParseResult` / `ParseContext` zod schemas (`supabase/functions/_shared/parse-types.ts`)
- Extraction + exercise-resolution prompts and LLM call logic
- Exercise matching: exact → trigram fuzzy → LLM-pick-from-candidates, never free-generated
- `parse-utterance` Supabase Edge Function (auth-guarded, logs telemetry to `voice_logs`)
- `0002_voice_logs.sql` migration: `voice_logs` table + `search_exercise_candidates()` SQL function
- Cost-tracking constants for Claude Haiku 4.5 (default parsing model) and Claude Sonnet 5
  (mid-tier comparison model)
- 25-exercise in-memory fixture, standing in for the real library until Phase 1 seeds it

**Not done / next up:** `parse-cli.ts` local test script, the eval golden set + runner,
model-comparison mode, the voice capture UI, the telemetry dashboard. See
`PROJECT-SUMMARY-PHASE2.md` § 2 for the full status table.

**Decisions made this session:** see `PROJECT-SUMMARY-PHASE2.md` § 4 (not duplicated
here — that file is the source of truth for current decisions).
