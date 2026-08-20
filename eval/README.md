# Eval harness

Scores the voice-parsing pipeline against a golden set of transcripts with known-correct
expected output. Runs the **exact same production code path** as the `parse-utterance`
edge function (`supabase/functions/_shared/pipeline/pipeline.ts`) — a passing eval means
the real pipeline works, not just that a prompt works in isolation.

## Running it

```
npm run eval            # score the default model (gpt-4o-mini) against eval/golden/v1.jsonl
npm run eval:compare     # also run the mid-tier model (gpt-4o); side-by-side accuracy/cost table
```

Needs `OPENAI_API_KEY` in `.env` (same key used everywhere else). Reports are written
to `eval/reports/{date}-{model}.md` and also printed to stdout.

⚠️ The exact model IDs and prices in `supabase/functions/_shared/pipeline/prices.ts`
were unverified when they were set — check them against
[platform.openai.com/docs/pricing](https://platform.openai.com/docs/pricing) before
trusting cost numbers from a run.

## What's scored

- **Field accuracy** — for each golden case, per-entry exact match on `exercise_id`,
  `weight_kg`, `reps`, `sets_count`, `set_type`. Only fields explicitly present in the
  case's `expected.entries[]` are checked — an ambiguous case can omit a field entirely to
  mean "don't check this," since the whole point of that case is that the pipeline
  shouldn't have produced a confident value for it.
- **Ambiguity behavior** — did the pipeline ask a clarifying question exactly when the
  case says it should (`expected.must_ask`)? **Asking is a success state, not a failure
  state.** The `ambiguous_must_ask` category is reported separately and should be at 100%.
- **Intent accuracy** — `log_sets` / `correct_last` / `unknown`.
- **Cost & latency** — per-case and aggregate, using the pricing in
  `supabase/functions/_shared/pipeline/prices.ts`.

## Golden set v1 — status

`eval/golden/v1.jsonl` is **synthetic**, not the user's real dictation — the original
Phase 2 plan called for ~40 hand-labeled cases from a real chest-day recording plus 15
synthetic ones for review. That real recording didn't exist when this v1 set was built, so
all 50 cases here are synthetic, covering the 7 categories from the spec:

| Category | Cases | What it tests |
|---|---|---|
| `simple` | 8 | single set, full info |
| `multi_set` | 6 | "N sets of ..." |
| `context_inherit` | 8 | "same weight", "two more", bare "drop set ..." |
| `ambiguous_must_ask` | 8 | missing fields, transposed numbers, plate math, implausible values — must ask |
| `exercise_resolution` | 8 | aliases (RDL/OHP), DB vs. barbell variants, one deliberately-unmatched exercise |
| `hinglish_and_accent` | 6 | Hindi number words, "mein"/"aur"/"wahi" — marked expected-STT-risk |
| `noise_artifacts` | 6 | typical STT mishears ("wait"→"weight", "ate"→"eight") |

**Next step for the user:** once you've done a few real voice-logged workouts, either
hand-label a real dictation session the way the original plan intended, or run
`scripts/harvest-eval-cases.ts` (below) to pull real corrections out of `voice_logs` and
promote the good ones into `v1.jsonl` (or a `v2.jsonl`). Real usage will surface failure
modes this synthetic set can't anticipate.

## Adding cases from production (`voice_logs`)

`scripts/harvest-eval-cases.ts` pulls `voice_logs` rows where `outcome` is `'edited'` or
`'discarded'` (i.e. the pipeline got something wrong) and appends them as **draft** golden
cases — with `expected` set to the *corrected* values — to `eval/golden/drafts.jsonl`.
These are drafts on purpose: review each one before promoting it into `v1.jsonl`, since a
correction in the app doesn't always mean the original parse was wrong (the user might
have just changed their mind).

```
npx tsx scripts/harvest-eval-cases.ts
```

## Langfuse experiment mode (accuracy over time, in the UI)

The local markdown report is a point-in-time snapshot. To track parse quality **over
time** and compare models/prompts in one place, push the golden set to Langfuse as a
**Dataset** and log each eval run against it as an **experiment run**:

```
npm run eval:dataset              # one-time (and after editing v1.jsonl): upsert the
                                  # golden set as Langfuse dataset "kratos-golden-v1"
npm run eval -- --langfuse        # run + log each case as a trace linked to the dataset,
                                  # with per-case scores; one run per model
npm run eval -- --langfuse --compare              # both models = two comparable runs
npm run eval -- --langfuse --run-name=prompt-v2   # name the run (e.g. before/after a change)
```

Needs `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` (+ optional `LANGFUSE_BASE_URL`) in
`.env` — the same key pair set as Supabase secrets for the live edge functions. Each run
appears under **Datasets → kratos-golden-v1 → Runs** with these per-case scores:
`pass`, `field_accuracy`, `intent_match`, `ambiguity_correct`, `cost_usd`, `latency_ms`.
Langfuse aggregates them per run, so two runs sit side by side and a regression is visible
at a glance. The run still writes the local `.md` report too — nothing is lost.

This is the **offline** eval (golden set, no user data). It's complementary to the
**online** `faithfulness` judge that scores real production parses on their own Langfuse
traces (see `supabase/functions/_shared/observability/faithfulness.ts`).

## Model comparison

`npm run eval:compare` runs the full golden set against both `PARSE_MODEL_DEFAULT`
(gpt-4o-mini) and `PARSE_MODEL_MID` (gpt-4o) — see `prices.ts` — and adds a comparison
table at the top of the report: field accuracy, ambiguity behavior, intent accuracy,
average cost per parse, and **cost per 1,000 parses** side by side. Use this to decide
whether the mid-tier model's accuracy gain (if any) is worth its ~3x cost.

## Changelog

Track iteration here as prompt/pipeline changes are made in response to eval failures —
one entry per change, with the before/after numbers. Do not accept a change that improves
one category by regressing `ambiguous_must_ask` behavior.

| Date | Change | Before | After |
|---|---|---|---|
| _(none yet — this is the v1 baseline)_ | | | |
