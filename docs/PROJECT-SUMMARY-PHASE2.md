# Kratos — Project Summary (Phase 2: Voice Logging)

**Purpose of this file:** a standing knowledge base for both humans and future Claude
Code sessions. Read this first before exploring the codebase — it should answer "what
is this, what's built, what's decided, what's left" without needing to re-read every
file. Update it incrementally as work continues; keep it concise, not exhaustive.

See also: [`PROJECT-SUMMARY-PHASE1.md`](./PROJECT-SUMMARY-PHASE1.md) (manual tracker) and
[`WORK-LOG.md`](./WORK-LOG.md) (dated, append-only log of individual sessions — this file
is the current-state snapshot, the work log is the history).

---

## 1. What this is

Phase 2 adds voice logging on top of the Phase 1 manual tracker: tap a mic mid-workout,
say a set out loud ("incline dumbbell press twenty five kgs ten reps"), see a parsed
confirmation card, tap once to accept. Full spec: `~/Downloads/phase-2-voice-llm-pipeline.md`.
This doc is the living record of what was actually built from it — not a copy of the spec.

## 2. Current status

**The original Phase 2 tap-to-log flow is written and its backend is deployed.** A native
iPhone development client is installed and launches, but authenticated manual/voice
workflows have not yet been completed end-to-end. The separate voice-first redesign is
still paused mid-implementation; see the top entries in `WORK-LOG.md`.

| Build step | Status |
|---|---|
| `ParseResult` / `ParseContext` schemas (shared contract) | ✅ Done |
| Extraction prompt (LLM call #1: transcript → raw entities) | ✅ Done |
| Exercise resolution (alias → trigram → LLM pick-from-candidates) | ✅ Done |
| `parse-utterance` Edge Function (auth-guarded, calls the pipeline, logs telemetry) | ✅ Deployed to `amonovkkjohvlkjlfsit`; unauthenticated probe correctly returns 401 |
| `voice_logs` migration + `search_exercise_candidates` SQL function | ✅ Applied and verified live |
| Cost-tracking constants (model IDs, per-token pricing, ₹2,000/mo budget) | ✅ Done |
| `parse-cli.ts` local test script (runs the real pipeline, no deploy needed) | ✅ Done |
| Eval golden set v1 (50 synthetic cases, all 7 spec categories) | ✅ Done — **synthetic, not real dictation** (see §4) |
| Eval runner (`eval/run.ts`) + model-comparison mode (`eval:compare`) | ✅ Done — **first real baseline still not run** |
| Model wired to `gpt-5.6-luna` (default) / `gpt-5.6-terra` (compare), prices verified | ✅ Done (2026-07-19) |
| `harvest-eval-cases.ts` (promotes real corrections into draft golden cases) | ✅ Done |
| Native Expo development client | ✅ Built, signed, installed, trusted, and launches on iPhone 15 |
| Voice capture UI: mic button, on-device STT, confirmation card, ambiguity chips, unmatched-exercise flow, undo snackbar | ✅ Built — **on-device voice workflow not yet exercised because first login is still pending** |
| Telemetry dev screen (`/dev/telemetry`): acceptance rate, edit rate by field, ambiguity rate, p50/p95 latency, cost vs. budget | ✅ Done |
| **Langfuse LLM observability** (both edge functions traced; session-linked; ASR cost + parse tokens/cost + confidence score) | ✅ **LIVE 2026-08-20** (see §11) — Cloud (US) project active, functions deployed, verified via eval bridge |
| **Offline eval → Langfuse experiments** (golden set as a dataset; runs logged with per-case scores) | ✅ Built 2026-08-20 (see §12) — `npm run eval:dataset` + `npm run eval -- --langfuse` |
| **LLM-as-judge faithfulness eval** (background, sampled; scores transcript→parse faithfulness onto the Langfuse trace) | ✅ Built 2026-08-17 (see §11) — enable with `FAITHFULNESS_JUDGE_SAMPLE_RATE` |
| Voice-first v2 redesign (Home, Voice console, Floor mode resting/PR, Correction drawer) | ✅ Built 2026-07-20, see §8 — History/Settings screens still Phase 1 unstyled |

## 3. Deployment completed and remaining validation

1. ✅ **OpenAI API key configured** in local `.env` and as the hosted Supabase Function
   secret. Never expose either value in documentation or client code.
2. ~~Verify the model IDs and prices~~ — **done 2026-07-19.** `PARSE_MODEL_DEFAULT` =
   `gpt-5.6-luna` ($1/$6 per 1M tok), `PARSE_MODEL_MID` = `gpt-5.6-terra` ($2.50/$15),
   both confirmed against platform.openai.com. Only revisit if OpenAI changes prices.
3. ✅ **Phase 2 migration applied**: `voice_logs` and
   `search_exercise_candidates` were queried successfully on the live project.
4. ✅ **Edge Function deployed** with Supabase CLI to project
   `amonovkkjohvlkjlfsit`; its auth guard was verified by a reachable HTTP 401 response
   without a user JWT.
5. ✅ **Local API configuration present** for `eval`/`parse-cli`.
6. **Run the eval baseline**: `npm run eval` (then `npm run eval:compare` to see if
   the mid-tier model is worth its extra cost). This has never been run against the
   real API — the numbers in `eval/README.md`'s changelog are still empty.
7. ✅ **Native dev client built and installed.** `expo-dev-client@~57.0.7` is installed,
   `com.dhruvshah.kratos` is the iOS bundle ID, and the app launches on the physical
   iPhone. **Still required:** complete OTP login, then do a real workout logging sets
   by voice and note every friction point. Run Metro with:
   ```bash
   PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo start --dev-client
   ```
8. **Optional but recommended**: replace/extend `eval/golden/v1.jsonl` with your own real
   dictation once you've done a few voice-logged workouts — the current set is entirely
   synthetic (see §4). `npx tsx scripts/harvest-eval-cases.ts` pulls real corrections out
   of `voice_logs` as a starting point.

## 4. How the parsing pipeline works (plain-language)

1. **You speak** → on-device speech-to-text (`expo-speech-recognition`, tap-to-toggle)
   produces a transcript.
2. **Transcript + session context** (current exercise, last set logged this session, unit
   preference) goes to the server.
3. **LLM call #1 — extraction.** A cheap model reads the transcript and pulls out
   entities: exercise name (as spoken, not canonicalized yet), weight, reps, set type,
   how many sets. If anything a human gym partner would have to ask about is missing
   or contradictory, it doesn't guess — it flags a short clarifying question instead.
4. **Exercise name matching**, in order, cheapest first:
   - Exact match against known names/nicknames → done, no extra cost.
   - Fuzzy text match (typo/mishearing tolerant) → if confident enough, done.
   - Still unsure → a second, tiny LLM call picks from a shortlist of candidates, or
     says "none of these." **The model is never allowed to invent an exercise name** —
     this is the main defense against hallucination.
5. **You confirm.** A card shows one mini-card per parsed entry — exercise name,
   weight, reps, set count, set type, all tap-to-edit — plus a question chip for
   anything ambiguous, and a "create custom exercise?" flow if nothing matched. Confirm
   writes real sets (tagged `logged_via='voice'`); a 10-second undo follows.
6. **Result + a full telemetry record** (transcript, what was parsed, which model, cost,
   latency, and eventually your outcome/corrections) gets saved. Every voice attempt is
   logged — including ones you edit or discard — so real usage becomes the raw material
   for improving accuracy later.

### Why two LLM calls instead of one
Keeping "understand the sentence" and "pick the exact exercise" as separate calls means
the second call only ever has to choose from a short, pre-vetted list — it structurally
cannot hallucinate an exercise that doesn't exist in the library. The second call is also
skipped entirely when the first two (cheaper) matching steps already found a confident
answer, which keeps typical cost near a single LLM call.

## 5. Key decisions & rationale

- **ASR (speech→text): OpenAI `gpt-transcribe`** — FINAL as of 2026-08-13 (released
  2026-07-28; OpenAI's current recommended transcription model, ~$0.0045/min). Decided from
  the `bakeoff/` harness on a 10-recording personal corpus (Indian-accented English, **with
  background gym noise**) vs Groq/Whisper, Deepgram Nova-3, AssemblyAI, and the older
  `gpt-4o-transcribe`. It is the `openai` provider in `bakeoff/providers/openai.ts`;
  `openai-4o` is kept as the comparison baseline.
  **Chosen on structural grounds, NOT on a measured accuracy win** — see the honesty note
  below. Reasons: newest + vendor-recommended; ~20% faster than gpt-4o-transcribe (2135ms vs
  2631ms); cheaper; **one vendor** (already the extraction provider, so ASR+parse share a key
  and Edge Function); and it is **not a Whisper model** — Groq/Whisper produced the one
  genuinely dangerous failure below. Low-regret: the `src/lib/stt.ts` seam + the
  `bakeoff/providers/` adapters make switching a config change.
- **LLM (extraction): OpenAI `gpt-5.6-luna`** — FINAL, unchanged. Re-confirmed 2026-08-13
  that GPT-5.6 is still the current generation (no successor family) and Luna is the cheapest
  tier that supports structured outputs, which is the hard requirement. ⚠ **Its price was cut
  ~80% on 2026-07-30** — `prices.ts` was updated (Luna $1.00/$6.00 → **$0.20/$1.20**), so cost
  telemetry before 2026-08-13 overstated spend ~5×.
- **Bakeoff results + the honesty caveat (read before trusting any number above).** On the
  final clean run (0 failures): `gpt-transcribe` and AssemblyAI hit 100% workout exact-match,
  `gpt-4o-transcribe`/Groq/Deepgram 80%. **But the same cached transcripts scored differently
  across two runs** (gpt-4o-transcribe moved 100% → 80%), because the extraction LLM is
  non-deterministic — at n=5 one flip is 20 points. **These five models are NOT
  distinguishable on this corpus.** Suspected cause: `llm.ts` never sets `temperature`, so it
  runs at the API default (1.0) for a task that should be deterministic — **fixing that to 0
  is the top open follow-up.** Findings that WERE stable across every run:
  1. **Groq silently dropped a whole exercise** (valid JSON, perfect numbers, one exercise
     gone) — the scariest failure class, and invisible to WER/NEER *and* to "I'll notice it
     in real use." ⇒ the real flow must keep a **glanceable commit-time confirmation** where a
     *missing exercise* is visible; never blind auto-commit.
  2. **Routine-name extraction is the weak spot for every provider** ("Leg Day" → "leg day
     routine", "Pull Day" → "full day"). ⇒ when routine-creation is built, resolve the name
     against the user's existing routines (a closed set), exactly like exercises.
  3. **The closed-vocabulary exercise resolver is excellent** — 98–100% everywhere, every run.
     The never-free-generate design works; don't weaken it.
  4. Self-corrections mid-utterance are genuinely hard (file 06 flipped intent to
     `correct_last`) — worth explicit prompt coverage.
  n=5 per intent chose a direction; it does not certify reliability. Keep harvesting
  (`voice_logs` + `scripts/harvest-eval-cases.ts`) and re-run `npm run bake`.
- **Provider: OpenAI, GPT-5.6 family** (switched from Anthropic on 2026-07-19 — user has an
  OpenAI key, not an Anthropic one). Day-to-day parsing uses `gpt-5.6-luna`
  (`PARSE_MODEL_DEFAULT` in `prices.ts` — the cheap $1/$6-per-1M high-volume tier); the
  mid tier `gpt-5.6-terra` (`PARSE_MODEL_MID`, $2.50/$15) is what the eval harness
  benchmarks against, to get a real accuracy-vs-cost number rather than assuming the
  pricier model is needed. **Model IDs and prices were verified live on 2026-07-19**
  against platform.openai.com / developers.openai.com (the GPT-5.6 family went GA
  2026-07-09) — re-check there only if OpenAI changes pricing. The provider is isolated
  behind one file (`llm.ts`'s `LlmClient` interface) — `AnthropicLlm` is still there,
  unused, if you ever want to switch back or run both side by side.
- **Never silently guess.** Any field a human would have to ask about becomes a short
  clarifying question in the response, not a best-effort value. This was an explicit
  product decision from the spec, not an engineering default.
- **Exercise names are never free-generated by the LLM** — it selects from
  candidates retrieved by exact/fuzzy search, or returns "unmatched." This single
  constraint is what makes the exercise-matching step trustworthy.
- **All LLM calls are server-side only** (Supabase Edge Function). The client never
  holds an OpenAI API key — same "no secrets in the client" rule as Phase 1.
- **Weight is always normalized to kg** before being stored (`unit_spoken` is kept
  separately so the original phrasing is never lost) — consistent with Phase 1's
  kg-always rule.
- **Every voice interaction is logged to `voice_logs`**, including the ones you edit or
  discard, so the app can mine its own usage for future test cases
  (`scripts/harvest-eval-cases.ts`) instead of relying only on hand-written examples.
- **The eval harness runs the same code path as production** (`pipeline.ts` is imported
  by both the Edge Function and the eval runner) — an eval passing does not mean "the
  eval prompt worked," it means "the actual production pipeline worked."
- **`parse-cli.ts` calls the LLM provider directly instead of the deployed function.** The
  original spec had the CLI hit the deployed edge function, but that function requires a
  logged-in user's JWT (email OTP), which is awkward to script. Since the CLI's job is
  fast local iteration on parsing logic, it runs the same `pipeline.ts` in-process
  instead — against the real exercise library via the service-role key when
  `SUPABASE_SERVICE_ROLE_KEY` is set, falling back to the 25-item fixture otherwise. The
  deployed function itself is unchanged and still auth-guarded; only the *dev tool*
  takes the shortcut.
- **Golden set v1 is synthetic, not real dictation.** The original plan called for ~40
  hand-labeled cases from a real chest-day recording; that recording didn't exist when
  this was built, so all 50 cases in `v1.jsonl` are synthetic, covering all 7 spec
  categories. Treat it as a baseline to catch regressions, not a substitute for real
  usage data — see §3, item 7.
- **A 25-exercise in-memory fixture** (`eval/golden/fixtures/exercises.json`) backs the
  eval harness and is `parse-cli.ts`'s fallback catalog. `parse-cli.ts` prefers the real
  seeded library when Supabase credentials are available; the eval harness still uses the
  fixture exclusively (the golden set's expected `exercise_id`s are fixture ids).
- **Trigram fuzzy-matching logic is duplicated in TypeScript** (`trigram.ts`, mirroring
  Postgres's `pg_trgm` algorithm) purely so the eval harness/CLI can score exercise
  matching without a live database connection when using the fixture catalog. The Edge
  Function itself always calls the real Postgres `pg_trgm` function — the TypeScript
  version must stay behaviorally identical to Postgres's, not diverge into its own logic.
- **`ParsedExercise` carries a resolved `name` field** (not just `raw`, the spoken
  phrase) — added while building the confirmation card, which needs to *display* the
  canonical exercise name, not what the user said. `raw` is kept only for the alias
  write-back when a match is confirmed/corrected.

## 6. Folder map (what lives where)

```
supabase/functions/parse-utterance/
  index.ts                 The Edge Function: auth guard → run the pipeline → log to
                            voice_logs → return { result, telemetry } to the client
  deno.json                npm-package import map (Deno needs this to resolve
                            zod / @supabase/supabase-js / @anthropic-ai/sdk / openai)

supabase/functions/_shared/
  parse-types.ts            THE contract: ParseResult, ParseContext, ParsedExercise, and
                            every sub-type as zod schemas. Single source of truth —
                            re-exported for app code via src/types/parse.ts.
  pipeline/
    llm.ts                  Thin wrapper around the LLM provider SDK — the ONLY file that
                            imports @anthropic-ai/sdk or openai directly. Holds both
                            OpenAiLlm (active) and AnthropicLlm (unused, kept for an
                            easy switch back) behind the same LlmClient interface.
    prompts.ts               The two system prompts (extraction, exercise resolution).
    extraction.ts            LLM call #1: transcript → raw entities.
    resolution.ts            Exercise matching: exact → fuzzy → LLM-pick-from-candidates.
                            Defines ExerciseCatalog — Postgres in prod, in-memory
                            fixture in eval/CLI.
    trigram.ts               Pure-TS fuzzy text similarity matching pg_trgm.
    fixture-catalog.ts        In-memory ExerciseCatalog for the eval harness / CLI.
    pipeline.ts               Orchestrates extraction → resolution → kg conversion →
                            telemetry. THE one production code path both the Edge
                            Function and the eval runner call.
    prices.ts                 Model IDs, per-token USD pricing, and the ₹2,000/mo budget
                            constant — update prices here only.

supabase/migrations/0002_voice_logs.sql
                            voice_logs table (transcript, context, parsed result,
                            model/tokens/cost/latency, outcome, corrections) +
                            search_exercise_candidates() SQL function. RLS mirrors
                            Phase 1's pattern.

src/types/parse.ts           Re-exports parse-types.ts for app code.
src/types/db.ts              Phase 1's row-type file — now also has voiceLogSchema
                            (the voice_logs row shape) alongside the Phase 1 tables.
src/lib/stt.ts                useSpeechToText() hook — the ONLY file that imports
                            expo-speech-recognition. Swapping on-device/cloud STT
                            means touching only this file.
src/lib/pricing.ts            Re-exports prices.ts for app code (telemetry screen).
src/data/voice.ts              Repository: parseVoiceUtterance (calls the edge
                            function), confirmVoiceEntries (writes sets + voice_logs
                            outcome), undoVoiceSets, createExerciseAliasFromVoice,
                            listRecentVoiceLogs / listVoiceLogsSince.
src/data/sets.ts               Now also exports addVoiceSet (same as addSet but tags
                            logged_via='voice' + raw_transcript + parse_confidence).
src/components/VoiceMicButton.tsx
                            Tap-to-toggle mic + STT + parse call + failure banners
                            (didn't-catch-that / timeout / parse error). Used both at
                            workout level and per-exercise (src/app/workout/[id].tsx).
src/components/VoiceConfirmationCard.tsx
                            One mini-card per parsed entry, every field tap-editable,
                            ambiguity question chips, unmatched → ExercisePickerModal,
                            10s undo snackbar.
src/app/dev/telemetry.tsx      Dev-only screen: last 50 voice_logs + aggregate stats
                            (acceptance rate, edit rate by field, ambiguity rate,
                            p50/p95 latency, cost vs. monthly budget). Linked from a
                            small button on the Home screen footer.

eval/golden/v1.jsonl           50 synthetic golden cases across all 7 spec categories.
eval/golden/fixtures/exercises.json
                            25-item fixture exercise library backing the eval harness.
eval/run.ts                    Scores the golden set against the real pipeline;
                            writes eval/reports/{date}-{model}.md.
eval/README.md                 How to run it, what's scored, changelog table.
scripts/parse-cli.ts            Local pipeline test — see the decisions note above.
scripts/harvest-eval-cases.ts    Pulls edited/discarded voice_logs into
                            eval/golden/drafts.jsonl for hand review.
```

## 7. What a future session should know before touching this

- **Read `CLAUDE.md` first** (hard rules apply to both phases) — then this file, then
  `PROJECT-SUMMARY-PHASE1.md` if the work touches shared schema/repositories.
- **`pipeline.ts` is the one production code path.** If you're changing parsing
  behavior, change it there — don't add a second copy of the logic in the eval runner,
  `parse-cli.ts`, or anywhere else.
- **Don't let the LLM free-generate exercise names.** Any change to `resolution.ts` or
  `prompts.ts` must preserve "pick from candidates, or say unmatched."
- **Ambiguity is a feature, not a bug.** If a change makes the pipeline "smarter" by
  guessing more and asking less, that's a regression against the spec's explicit
  must-ask policy — check the `ambiguous_must_ask` category in the eval report (target
  100%) before and after.
- **The eval harness has never been run against the real API.** Don't assume the golden
  set's numbers are known-good — run `npm run eval` first and read the report before
  trusting or changing anything based on "expected" accuracy.
- **The OpenAI model IDs/prices in `prices.ts` were verified 2026-07-19** (`gpt-5.6-luna`
  $1/$6, `gpt-5.6-terra` $2.50/$15). Re-confirm at platform.openai.com only if you suspect
  a pricing change.
- **The native app now runs on the device, but the voice workflow is still unverified.**
  First login is pending after fixing the client to accept Supabase's 8-digit OTP. Treat
  mic/STT/parse/confirm as unverified until the smoke test in `WORK-LOG.md` is completed.
- **`voice_logs` migration depends on Phase 1's schema** (`workouts`, `exercises`,
  `exercise_aliases` from `0001_init.sql`) — apply `0001` before `0002`.
- **If you swap STT providers** (on-device → cloud), the only file that should need to
  change is `src/lib/stt.ts` — its `useSpeechToText()` interface is the seam.

## 8. Voice-first v2 redesign (2026-07-20)

Implemented the 5-screen mockup `Kratos Voice-First.dc.html` (Claude Design project
`94a04f7d-7d08-41bc-a9c9-e0b31092bb93`), explicitly labeled "v2" — a cyan/quantum-black
palette. A prior session had already built `src/theme/tokens.ts` +
`components/voice/primitives.tsx`/`TabBar.tsx`/Home screen against an **earlier amber**
mockup iteration; the palette in `tokens.ts` was corrected to v2's cyan values (`acc:
#4FD8FF`, `bg: #020609`) rather than kept — confirmed with the user before doing so.

**Built:**
- **Home** (`src/app/index.tsx`): unchanged structure, added the 206px outer glow ring
  around the 190px TALK ring per v2's markup.
- **Voice console** (`src/app/workout/[id].tsx`): full restyle of the active-workout
  screen — elapsed timer + session totals header, exercise-chip selector row (replaces
  the old per-exercise accordion), a session-tape `InsetWell` (tap a row to edit),
  bottom transport bar (`LedDigits` + `LevelMeter` + FLOOR key).
- **Correction drawer** (`components/VoiceConfirmationCard.tsx`): restyled from a plain
  white `Modal` into the bottom-sheet drawer look (`KeyCap` weight/rep steppers, drag
  handle). Widened to serve two entry points: a mis-parsed HEARD result (`response`
  prop, original logic unchanged) and a tapped tape row (new `editSet` prop → calls
  the existing `useUpdateSet`/`useDeleteSet` hooks instead of the confirm-entries path).
  Also gained the auto-commit **HEARD panel**: when a parse is confident (no
  ambiguities, every exercise resolved) and `autoCommit` is set, it renders inline as
  a `DrainBar`-countdown card and confirms itself after `timing.commitHoldMs` unless
  tapped to cancel — falls back to the full sheet otherwise.
- **Floor mode** (`components/voice/FloorMode.tsx`, new): full-screen overlay with a
  Resting sub-state (rest countdown off `timing.restDefaultSec`, NEXT/LAST/SET summary)
  and a PR sub-state (thermal/heat styling, triggered when a newly-logged set beats the
  best weight/reps found in `useLastSession`'s history for that exercise, auto-returns
  to Resting after `timing.prMomentMs`). Entered via the console's FLOOR key or by
  laying the phone face-up and still (`expo-sensors` `Accelerometer`, already a
  dependency); exits on pickup (z-axis gravity drop) or a tap.

**Scope cuts (intentional, not silently dropped):**
- Auto-commit cancel is tap-only, not spoken ("say no to cancel" per the mockup) — the
  current `useSpeechToText()` hook doesn't support listening while `speak()`/earcons
  play concurrently; would need a bigger STT-hook change.
- The mockup's "PLATES ⊞" plate-calculator button in the correction drawer was not
  built — no spec exists yet for the actual plate math, so it was omitted rather than
  shipped as a dead control.
- History/Settings screens are untouched (still Phase 1's plain black-on-white UI) —
  they weren't part of this mockup; see the screen inventory from the session that
  requested this redesign.

**Not yet done:** manual on-device verification of the full Home → console → floor-mode
→ correction-drawer loop (blocked on the same pending first-login as the rest of Phase 2,
per §3). Verified so far: `tsc --noEmit` clean, `expo export --platform web` bundles all
10 routes with no errors.

## 9. QA fix cluster (2026-07-30)

A full-codebase QA pass fixed four high-impact defects; see `WORK-LOG.md` (2026-07-30) for
the complete finding list and rationale. Standing facts a future session must know:

- **Fonts are now actually loaded.** `_layout.tsx` calls `useAppFonts()` and holds the
  `expo-splash-screen` splash until fonts + the first session check resolve. Before this,
  `useAppFonts()` was dead and every `font.*` fell back to the system font. Don't unwire it.
- **Header theming is per-screen.** `index` and `workout/[id]` set `headerShown:false` +
  dark `contentStyle` + `statusBarStyle:'light'`; the Phase-1 screens keep the white header
  (`statusBarStyle:'dark'`). Both dark screens now use `useSafeAreaInsets()` for top padding
  (there's no header to provide it). If you restyle the remaining Phase-1 screens dark, flip
  their header/status-bar handling too.
- **Undo works via a `committed` flag** in `VoiceConfirmationCard` — the component stays
  mounted (sheet hidden) through the 10s window instead of unmounting on confirm. The undo
  snackbar's absolute position (anchored to the mic row) is functional but not yet polished
  to a true bottom-floating pill.
- **New migration `0003_alias_write_policy.sql` — NOT YET APPLIED.** It lets authenticated
  users write `source in ('user','llm')` aliases onto any exercise they can see (seeded
  included), unblocking the voice alias write-back (AC #5). Apply it (`supabase db push` /
  SQL editor) before relying on alias learning; until then `createExerciseAliasFromVoice`
  still throws for seeded exercises.

## 10. "Voice Logging" 1a UI + workflow (2026-08-13) — model NOT plugged in

Built the full 1a flow from the Claude Design "Voice logging feature design" project on the
user's instruction: **finish the UI/workflow, leave all model/STT/parsing decisions for the
in-progress model bake-off.** This is a *separate*, newer flow from the §8 voice-first v2
redesign — the FAB-mic → record → review-preview → commit path — and it's what the app now
surfaces from Home. The §8 components (`VoiceMicButton`, `VoiceConfirmationCard`, `FloorMode`)
are untouched and unwired; keep them (don't delete voice code).

**The seam — the single place a model plugs in later:** `src/data/voiceParse.ts`.
- `VoiceParseResult` = a discriminated union `{ kind: 'routine' | 'log', … }`. Deliberately a
  **new** contract, not `ParseResult` (§parse-types), because 1a infers a *routine-creation*
  intent from the same utterance and `ParseResult` only models set-logging. `ParseResult` and
  the whole `pipeline.ts`/edge-function path are unchanged.
- `parseVoiceIntent({ transcript, forceKind? })` is **mocked** (`MOCK_VOICE = true`): canned
  data whose exercise ids are resolved against the real seeded library (`listAllExercises`) so
  a commit writes valid FK rows. **To wire the eval's model:** implement `parseVoiceIntent`'s
  real body (call `parse-utterance`, adapt its `ParseResult` + a routine-intent extension onto
  `VoiceParseResult`), then flip `MOCK_VOICE`. Nothing else in the flow should need to change.
- STT is likewise mocked — the recorder never touches `src/lib/stt.ts`. When real STT returns,
  it feeds `parseVoiceIntent`'s `transcript`; the recorder's MOCK toggle (log vs routine
  example) exists only because the simulator has no mic.

**Files added:** `src/data/voiceParse.ts` (seam), `voiceDraft.ts` (record→preview store),
`useVoiceCommit.ts` (real repo writes), `src/app/voice/record.tsx`, `src/app/voice/preview.tsx`,
`components/voice/{MicGlyph,VoiceRoutinePreview,VoiceLogPreview}.tsx`,
`components/workout/VoiceUndoBanner.tsx`. **Touched:** `HomeQuickStart.tsx` (FAB→mic),
`workout/[id].tsx` (banner), `_layout.tsx` (route animations). `tsc` + web-export (18 routes)
green; **not yet run on simulator/device** (no new native deps → no dev-client rebuild needed).

## 11. Langfuse LLM observability (2026-08-17)

Full LLM monitoring for the voice pipeline — every ASR + parse call becomes a Langfuse trace
(latency, cost, tokens, input/output, errors, a confidence score). Answers "how is my LLM
performing" without a bespoke dashboard.

**Why Langfuse:** the free/open-source (MIT) leader — self-host free, or a 50k-events/mo cloud
free tier. Gives tracing + prompt/version views + LLM-as-judge evals in one place.

**Why a hand-rolled ingestion client** (`supabase/functions/_shared/observability/langfuse.ts`):
the official `langfuse` npm SDK is built on OpenTelemetry + a background flush loop + Node
built-ins, none of which fit Supabase Edge (Deno) — in edge you must flush *before* the
response returns. The module is a small, dependency-free client that speaks Langfuse's public
batch ingestion API directly (`POST /api/public/ingestion`, HTTP Basic auth). It is a **safe
no-op when the `LANGFUSE_*` secrets are unset** (functions behave exactly as before), and
`flush()` swallows its own network/HTTP errors — monitoring must never break the request path.

**What's traced:**
- `transcribe` → trace `voice.transcribe` + generation `asr.transcription`. Input
  (prompt/mime/audio-bytes/duration), output text, ASR cost via `asrCostUsd(duration_ms)` in
  `prices.ts` (ASR is billed per **audio-minute**, not per token; duration comes from the
  recorder, not from decoding the container). Errors → `level: ERROR` + statusMessage.
- `parse-utterance` → trace `voice.parse` + generation `parse.pipeline`. The pipeline makes
  1–N internal LLM calls; their aggregate telemetry (already computed) becomes one generation
  with token `usageDetails` + `costDetails`, plus a **`parse_confidence` score** on the trace.
- **Session linkage:** the recorder mints one `voice_session_id` per utterance
  (`record.tsx`) and threads it through `transcribe.ts` → `voice.ts`/`voiceParse.ts`, so the
  transcribe + parse traces group as **one Langfuse session** = one voice interaction.

**LLM-as-judge faithfulness eval** (`_shared/observability/faithfulness.ts`): the quality
signal telemetry can't give you — a parse can be fast/cheap and still *wrong* (invented a set,
misheard 80→18 kg, wrong intent). After each parse, `judgeFaithfulness` grades the
(transcript → parsed JSON) pair 0–1 and the result is attached to the trace as a
**`faithfulness` score** plus a `judge.faithfulness` generation (its own token/cost line). It:
- **reuses the pipeline's `LlmClient` seam** (same provider isolation as the parse — no second
  SDK; swap the judge model with one env var);
- runs **in the background** via `EdgeRuntime.waitUntil`, so it never adds latency to the
  user's parse response;
- is **sampled and off by default** — it's an extra LLM call per parse, gated by
  `FAITHFULNESS_JUDGE_SAMPLE_RATE` (0 = off, 1.0 = every parse, 0.2 = 20%), judge model via
  `FAITHFULNESS_JUDGE_MODEL` (defaults to the cheapest parse model).

To backfill quality scores on *historical* parses, a node/tsx script could read `voice_logs`
(it stores `transcript` + `parsed`) and post `faithfulness` scores to Langfuse the same way —
not built yet; the online judge covers all new calls.

**Files:** added `_shared/observability/langfuse.ts` + `_shared/observability/faithfulness.ts`;
touched `_shared/pipeline/prices.ts` (`ASR_USD_PER_MINUTE` + `asrCostUsd`), `transcribe/index.ts`,
`parse-utterance/index.ts`, `src/data/{transcribe,voice,voiceParse}.ts`, `src/app/voice/record.tsx`,
`.env.example`.

**Activate:** set the three secrets, then redeploy the two functions:
```bash
supabase secrets set LANGFUSE_PUBLIC_KEY=pk-lf-...   \
                     LANGFUSE_SECRET_KEY=sk-lf-...   \
                     LANGFUSE_BASE_URL=https://cloud.langfuse.com   # or self-host URL
supabase functions deploy transcribe parse-utterance
```
To also turn on the faithfulness judge, add:
```bash
supabase secrets set FAITHFULNESS_JUDGE_SAMPLE_RATE=1.0   # every parse; use 0.2 for 20% sampling
supabase functions deploy parse-utterance
```
Keys come from Langfuse → Settings → API Keys (free tier at cloud.langfuse.com).

**Status — LIVE (2026-08-20).** A Langfuse Cloud (US) project is active; all three `LANGFUSE_*`
secrets are set and both functions are deployed. Faithfulness judge is ON at sample rate `1.0`
(every parse). Verified end-to-end via the offline eval bridge — traces carry the raw transcript
as input and 6 scores/trace attach (see §12). Because the model ids are fictional, cost is supplied
directly via `costDetails` (no Langfuse model-price table needed). **Only remaining:** watch a real
on-device voice log land as a live `voice.transcribe`+`voice.parse` session (pending the device
walkthrough).

## 12. Offline eval → Langfuse experiments (2026-08-20)

The offline golden-set eval (`eval/`, unchanged scoring) now also logs to Langfuse so parse
quality is trackable over time and comparable across models/prompts in the UI — the offline
counterpart to the online faithfulness judge (§11).

- `eval/langfuse.ts` — Node-side Langfuse client (official `langfuse` SDK, **devDependency**, only
  ever loaded by these `tsx` scripts, never bundled into the Expo client) + the canonical dataset
  name `kratos-golden-v1` and stable per-item ids.
- `npm run eval:dataset` (`eval/push-dataset.ts`) — upserts `eval/golden/v1.jsonl` as a Langfuse
  Dataset (idempotent; re-run after editing the golden set).
- `npm run eval -- --langfuse [--run-name=…]` — per case, emits a trace (transcript in, parse out)
  linked to its dataset item under a run name, with per-case scores `pass` / `field_accuracy` /
  `intent_match` / `ambiguity_correct` / `cost_usd` / `latency_ms`. One run per model; `--compare`
  makes two comparable runs. Still writes the local `.md` report.
- First run: "first-verify", **98.9%** field accuracy (188/190), 4 real failures surfaced. See
  `eval/README.md` → "Langfuse experiment mode".
