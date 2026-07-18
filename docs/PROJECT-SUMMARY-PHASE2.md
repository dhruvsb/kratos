# RepVoice — Project Summary (Phase 2: Voice Logging)

**Purpose of this file:** a standing knowledge base for both humans and future Claude
Code sessions. Read this first before exploring the codebase — it should answer "what
is this, what's built, what's decided, what's left" without needing to re-read every
file. Update it incrementally as work continues; keep it concise, not exhaustive.

See also: [`PROJECT-SUMMARY-PHASE1.md`](./PROJECT-SUMMARY-PHASE1.md) (manual tracker,
being built in a parallel session) and [`WORK-LOG.md`](./WORK-LOG.md) (dated, append-only
log of individual sessions — this file is the current-state snapshot, the work log is
the history).

---

## 1. What this is

Phase 2 adds voice logging on top of the Phase 1 manual tracker: tap a mic mid-workout,
say a set out loud ("incline dumbbell press twenty five kgs ten reps"), see a parsed
confirmation card, tap once to accept. Full spec: `~/Downloads/phase-2-voice-llm-pipeline.md`.
This doc is the living record of what was actually built from it — not a copy of the spec.

**In plain terms:** this phase is being built in two halves. Half one — the "parsing
brain" that turns a sentence into structured data — is what's described below and is
mostly done. Half two — the mic button, live transcript, and confirmation-card UI a
person actually taps — has not been started.

## 2. Current status

| Build step | Status |
|---|---|
| `ParseResult` / `ParseContext` schemas (shared contract) | ✅ Done |
| Extraction prompt (LLM call #1: transcript → raw entities) | ✅ Done |
| Exercise resolution (alias → trigram → LLM pick-from-candidates) | ✅ Done |
| `parse-utterance` Edge Function (auth-guarded, calls the pipeline, logs telemetry) | ✅ Done |
| `voice_logs` migration + `search_exercise_candidates` SQL function | ✅ Done (**not yet applied** — depends on Phase 1's Supabase project existing) |
| Cost-tracking constants (current model IDs + per-token pricing) | ✅ Done |
| In-memory exercise fixture (25 common lifts) for pipeline testing pre-seed | ✅ Done |
| `parse-cli.ts` local test script | ⬜ Not started |
| Eval golden set (v1, ~70–90 hand + synthetic cases) | ⬜ Not started |
| Eval runner (`eval/run.ts`, per-field + per-category scoring) | ⬜ Not started |
| Model-comparison mode (cheap vs. mid-tier accuracy/cost) | ⬜ Not started |
| Voice capture UI (mic button, STT, confirmation card) | ⬜ Not started |
| Telemetry dashboard + iteration loop | ⬜ Not started |

**Nothing in this phase has been committed to git yet**, and the migration hasn't been
applied to a live Supabase project (Phase 1 hasn't created one yet either).

### Things blocked on Phase 1 / the user

- A live Supabase project + applied `0001_init.sql` (Phase 1 dependency) before
  `0002_voice_logs.sql` can be applied for real.
- `ANTHROPIC_API_KEY` set as a Supabase Edge Function secret (`supabase secrets set`) —
  never in client code, never in `.env` read by the app.
- The real ~800-exercise library seeded (Phase 1's job) — Phase 2's exercise-matching
  logic currently runs against a 25-exercise placeholder fixture for testing purposes.

## 3. How the parsing pipeline works (plain-language)

1. **You speak** → on-device speech-to-text produces a transcript (not yet built).
2. **Transcript + session context** (current exercise, last set logged, unit
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
5. **Result + a full telemetry record** (transcript, what was parsed, which model, cost,
   latency) gets saved. Every voice attempt is logged — including ones you'd correct or
   discard — so real usage becomes the raw material for improving accuracy later.

### Why two LLM calls instead of one
Keeping "understand the sentence" and "pick the exact exercise" as separate calls means
the second call only ever has to choose from a short, pre-vetted list — it structurally
cannot hallucinate a exercise that doesn't exist in the library. The second call is also
skipped entirely when the first two (cheaper) matching steps already found a confident
answer, which keeps typical cost near a single LLM call.

## 4. Key decisions & rationale

- **Provider: Anthropic.** Day-to-day parsing uses **Claude Haiku 4.5** (cheap, fast);
  **Claude Sonnet 5** is the mid-tier model the eval harness will benchmark against, to
  get a real accuracy-vs-cost number rather than assuming the expensive model is needed.
- **Never silently guess.** Any field a human would have to ask about becomes a short
  clarifying question in the response, not a best-effort value. This was an explicit
  product decision from the spec, not an engineering default.
- **Exercise names are never free-generated by the LLM** — it selects from
  candidates retrieved by exact/fuzzy search, or returns "unmatched." This single
  constraint is what makes the exercise-matching step trustworthy.
- **All LLM calls are server-side only** (Supabase Edge Function). The client never
  holds an Anthropic API key — same "no secrets in the client" rule as Phase 1.
- **Weight is always normalized to kg** before being stored (`unit_spoken` is kept
  separately so the original phrasing is never lost) — consistent with Phase 1's
  kg-always rule.
- **Every voice interaction is logged to `voice_logs`**, including the ones you edit or
  discard, specifically so the app can mine its own usage for future test cases
  (`scripts/harvest-eval-cases.ts`, not yet written) instead of relying only on
  hand-written examples.
- **The eval harness runs the same code path as production** (`pipeline.ts` is imported
  by both the Edge Function and the eval runner) — an eval passing does not mean "the
  eval prompt worked," it means "the actual production pipeline worked."
- **A 25-exercise in-memory fixture stands in for the real exercise library** so Phase 2's
  matching logic could be built and testable independently of Phase 1's seeding step.
  This is a temporary shim — once Phase 1 seeds real exercises, the eval harness and
  local test script should point at the real database instead.
- **Trigram fuzzy-matching logic is duplicated in TypeScript** (mirroring Postgres's
  `pg_trgm` algorithm) purely so the eval harness can score exercise-matching accuracy
  without needing a live database connection. The Edge Function itself calls the real
  Postgres `pg_trgm` function — the TypeScript version is a test-only stand-in and must
  stay behaviorally identical to Postgres's, not diverge into its own logic.

## 5. Folder map (what lives where)

```
supabase/functions/parse-utterance/
  index.ts                The Edge Function: auth guard → run the pipeline → log to
                           voice_logs → return { result, telemetry } to the client
  deno.json               npm-package import map (Deno needs this to resolve
                           zod / @supabase/supabase-js / @anthropic-ai/sdk)

supabase/functions/_shared/
  parse-types.ts           THE contract: ParseResult, ParseContext, and every sub-type
                           (Intent, Resolution, SetType, etc.) as zod schemas. Single
                           source of truth — re-exported for app code via
                           src/types/parse.ts, don't redefine these elsewhere.
  pipeline/
    llm.ts                 Thin wrapper around the Anthropic SDK — the ONLY file that
                           imports @anthropic-ai/sdk directly. Swapping providers or
                           mocking for tests means touching only this file.
    prompts.ts              The two system prompts (extraction, exercise resolution) —
                           read these to understand exactly what the model is told to do
                           and not do.
    extraction.ts           LLM call #1: transcript → raw entities (exercise as spoken,
                           weight/reps/set-type, ambiguities, confidence).
    resolution.ts           Exercise matching: exact → fuzzy → LLM-pick-from-candidates.
                           Defines the ExerciseCatalog interface — anything that can
                           answer "exact match?" and "top N fuzzy candidates?" can be
                           plugged in (Postgres in prod, in-memory fixture in eval/CLI).
    trigram.ts              Pure-TS fuzzy text similarity, written to match Postgres's
                           pg_trgm scoring exactly — lets the eval harness score
                           exercise-matching without a live database.
    fixture-catalog.ts       In-memory ExerciseCatalog implementation for the eval
                           harness / local CLI testing (see eval/golden/fixtures/).
    pipeline.ts              Orchestrates the whole thing: extraction → per-entry
                           exercise resolution → unit conversion to kg → telemetry.
                           THIS is the "one production code path" both the Edge
                           Function and the eval harness call.
    prices.ts                Model IDs + per-token USD pricing (Haiku 4.5, Sonnet 5) —
                           update prices here only, nowhere else computes cost.

supabase/migrations/0002_voice_logs.sql
                           New table: voice_logs (transcript, context, parsed result,
                           model/tokens/cost/latency, outcome, corrections). Plus
                           search_exercise_candidates(), a pg_trgm-backed SQL function
                           the Edge Function calls for fuzzy exercise search. RLS
                           mirrors Phase 1's pattern (user_id = auth.uid()).

src/types/parse.ts          Re-exports supabase/functions/_shared/parse-types.ts so app
                           code imports from the conventional src/types/ path.

eval/golden/fixtures/exercises.json
                           25 common lifts + nicknames, used as a stand-in exercise
                           library until Phase 1's real ~800-exercise seed exists.
```

## 6. What a future session should know before touching this

- **Read `CLAUDE.md` first** (hard rules apply to both phases) — then this file, then
  `PROJECT-SUMMARY-PHASE1.md` if the work touches shared schema/repositories.
- **`pipeline.ts` is the one production code path.** If you're changing parsing
  behavior, change it there — don't add a second copy of the logic in the eval runner
  or anywhere else; the whole point of the eval harness's credibility is that it
  exercises the exact same code the Edge Function runs.
- **Don't let the LLM free-generate exercise names.** Any change to `resolution.ts` or
  `prompts.ts` must preserve "pick from candidates, or say unmatched" — this is a
  product-level guarantee, not an implementation detail.
- **The 25-exercise fixture is temporary.** Once Phase 1's real exercise library is
  seeded, the eval harness and `parse-cli.ts` should be pointed at it (or a larger,
  representative fixture) — don't treat the current fixture as final test coverage.
- **`voice_logs` migration depends on Phase 1's schema** (`workouts`, `exercises`,
  `exercise_aliases` from `0001_init.sql`) — apply `0001` before `0002`.
- **Ambiguity is a feature, not a bug.** If a change makes the pipeline "smarter" by
  guessing more and asking less, that's a regression against the spec's explicit
  must-ask policy — verify against golden-set `ambiguous_must_ask` cases once they exist.
