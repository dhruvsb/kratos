# Work Log

Append-only, dated log of individual sessions. This is the **history**; the
`PROJECT-SUMMARY-PHASE*.md` files are the **current-state snapshot**. When you finish a
session, add an entry here (newest at the top) and update the relevant summary file's
status table/decisions — don't let the two drift apart.

---

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
