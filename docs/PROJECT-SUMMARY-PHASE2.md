# RepVoice — Project Summary (Phase 2: Voice Logging)

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

**All of Phase 2's code is written.** What's left is entirely account/device setup — see
§3 below — plus the accuracy work an eval baseline unlocks (running it, then iterating).

| Build step | Status |
|---|---|
| `ParseResult` / `ParseContext` schemas (shared contract) | ✅ Done |
| Extraction prompt (LLM call #1: transcript → raw entities) | ✅ Done |
| Exercise resolution (alias → trigram → LLM pick-from-candidates) | ✅ Done |
| `parse-utterance` Edge Function (auth-guarded, calls the pipeline, logs telemetry) | ✅ Done — **not deployed yet** |
| `voice_logs` migration + `search_exercise_candidates` SQL function | ✅ Done — **not applied yet** |
| Cost-tracking constants (model IDs, per-token pricing, ₹2,000/mo budget) | ✅ Done |
| `parse-cli.ts` local test script (runs the real pipeline, no deploy needed) | ✅ Done |
| Eval golden set v1 (50 synthetic cases, all 7 spec categories) | ✅ Done — **synthetic, not real dictation** (see §4) |
| Eval runner (`eval/run.ts`) + model-comparison mode (`eval:compare`) | ✅ Done — **never run against the real API yet** (no `OPENAI_API_KEY` set) |
| `harvest-eval-cases.ts` (promotes real corrections into draft golden cases) | ✅ Done |
| Voice capture UI: mic button (workout-level + per-exercise), on-device STT, confirmation card, ambiguity chips, unmatched-exercise flow, undo snackbar | ✅ Done — **untested on a real device** (needs a native build, not Expo Go) |
| Telemetry dev screen (`/dev/telemetry`): acceptance rate, edit rate by field, ambiguity rate, p50/p95 latency, cost vs. budget | ✅ Done |

## 3. What only you can do from here

Everything below needs your accounts/device — none of it is something a future coding
session can do unattended.

1. **Get an OpenAI API key** (platform.openai.com) if you don't have one.
2. **Verify the model IDs and prices in `supabase/functions/_shared/pipeline/prices.ts`**
   against [platform.openai.com/docs/pricing](https://platform.openai.com/docs/pricing) —
   they were unverified when set (see §5). Update `PARSE_MODEL_DEFAULT`,
   `PARSE_MODEL_MID`, and their `MODEL_PRICES` entries if they've changed.
3. **Apply the Phase 2 migration**: run `supabase/migrations/0002_voice_logs.sql` against
   your Supabase project (same way you applied `0001_init.sql`).
4. **Deploy the edge function and set the secret** (needs the Supabase CLI, not installed
   in this environment):
   ```
   npm install -g supabase   # or: brew install supabase/tap/supabase
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase secrets set OPENAI_API_KEY=sk-...
   supabase functions deploy parse-utterance
   ```
5. **Add `OPENAI_API_KEY` to your local `.env` too** — `npm run eval` and
   `npm run parse-cli` call OpenAI directly (not through the deployed function), so
   they need the key locally for fast iteration without redeploying.
6. **Run the eval baseline**: `npm run eval` (then `npm run eval:compare` to see if
   the mid-tier model is worth its extra cost). This has never been run against the
   real API — the numbers in `eval/README.md`'s changelog are still empty.
7. **Build a native dev client and test on your phone.** The voice UI needs
   `expo-speech-recognition`, a native module — **it will not work in Expo Go.** Run:
   ```
   npx expo prebuild
   npx expo run:ios     # or: npx expo run:android
   ```
   Then do a real workout logging sets by voice, and note every friction moment (per the
   original spec, this feeds back into prompt/pipeline tuning).
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

- **Provider: OpenAI** (switched from Anthropic on 2026-07-19 — user has an OpenAI key,
  not an Anthropic one). Day-to-day parsing uses a cheap small model (`PARSE_MODEL_DEFAULT`
  in `prices.ts`, currently `gpt-4o-mini`); a mid-tier model (`PARSE_MODEL_MID`, currently
  `gpt-4o`) is what the eval harness benchmarks against, to get a real accuracy-vs-cost
  number rather than assuming the expensive model is needed. **The exact model IDs and
  prices are unverified** — they couldn't be confirmed live when this was written (two
  live lookups returned inconsistent model catalogs), so check
  [platform.openai.com/docs/pricing](https://platform.openai.com/docs/pricing) before
  trusting cost numbers or assuming those exact model names still exist. The provider is
  isolated behind one file (`llm.ts`'s `LlmClient` interface) — `AnthropicLlm` is still
  there, unused, if you ever want to switch back or run both side by side.
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
- **The OpenAI model IDs/prices in `prices.ts` are unverified.** Confirm them at
  platform.openai.com before trusting the cost dashboard or assuming they're current.
- **The voice UI has never run on a device.** It typechecks and the bundle builds, but
  `expo-speech-recognition` needs a native build (§3, item 6) — treat the mic/STT/card
  flow as unverified until someone actually taps through it on a phone.
- **`voice_logs` migration depends on Phase 1's schema** (`workouts`, `exercises`,
  `exercise_aliases` from `0001_init.sql`) — apply `0001` before `0002`.
- **If you swap STT providers** (on-device → cloud), the only file that should need to
  change is `src/lib/stt.ts` — its `useSpeechToText()` interface is the seam.
