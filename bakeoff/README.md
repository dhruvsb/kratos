# Kratos voice-model bakeoff

A **standalone** harness to answer the one question no public benchmark can:
_which speech-to-text model actually understands **your** voice saying **workout
numbers** — and which pipeline gets the whole workout into the database with
zero edits?_

It is deliberately **outside the app**. Nothing under `src/app` imports it, so
Metro never bundles it and it adds **zero bytes** to the iOS build. It runs only
via `npx tsx`, exactly like `scripts/` and `eval/`.

It reuses the app's **real** parse pipeline
(`supabase/functions/_shared/pipeline`) for end-to-end scoring, so a good bakeoff
number means the shipping code path worked — not a toy re-implementation.

---

## What it measures

Two tables, because the research is emphatic that **WER is the wrong metric**:

1. **ASR quality** — WER (diagnostic only) plus **NEER** (Numeric-Entity Error
   Rate: how often a weight/rep/set number is heard wrong) and a **danger-pair**
   count for the 13/30, 15/50-class confusions. Needs a `reference_transcript`.
2. **End-to-end** — audio → each ASR → the real parse pipeline → structured
   rows, scored against **database-semantic ground truth**: Workout
   Exact-Match, weight/rep/exercise/set-count accuracy, omissions, and
   clarifications-per-workout. **This is the number that decides the product.**
   Applies to `intent: "log_workout"` ground truth.
3. **Routine creation 🧪** — a **bakeoff-only prototype**, not the shipped app.
   The real pipeline has no routine-creation path yet (`intentSchema` in
   `parse-types.ts` is only `log_sets` / `correct_last` / `unknown`). This table
   scores `lib/routine-prompt.ts` (a local extraction prompt) piped into the
   **real** `resolveExercise()` — same exact/fuzzy/LLM-pick-from-candidates
   resolver the app ships, never free-generates. So exercise-name-resolution
   accuracy here is trustworthy; the surrounding extraction step is a preview
   of how well this *would* work if built, not a production result. Applies to
   `intent: "create_routine"` ground truth.

Providers compared (each gated on its own key, skipped cleanly if absent):
OpenAI, Groq (Whisper), Deepgram Nova-3, ElevenLabs Scribe, AssemblyAI, Google
Chirp, Sarvam Saaras. Add or remove them in `providers/registry.ts`.

---

## Step-by-step

### 0. One-time: check readiness

```bash
npm run bake:doctor
```

Shows which providers are configured, whether ffmpeg is present, whether the
end-to-end stage can run (needs `OPENAI_API_KEY`; uses the live exercise library
if `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, else a 25-item
fixture), and how many recordings are paired with ground truth.

### 1. Add ASR vendor keys

The app's `.env` already has `OPENAI_API_KEY` and the Supabase keys — those are
reused automatically. Put the **extra** ASR-vendor keys in
**`bakeoff/.env.local`** (gitignored) so you never touch the app's `.env`:

```bash
# bakeoff/.env.local   — add only the ones you want to test
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...
ASSEMBLYAI_API_KEY=...
GROQ_API_KEY=...
SARVAM_API_KEY=...
GOOGLE_STT_ACCESS_TOKEN=$(gcloud auth print-access-token)   # expires ~1h
GOOGLE_CLOUD_PROJECT=your-gcp-project

# optional model/endpoint overrides — see providers/*.ts for defaults
# BAKEOFF_OPENAI_MODEL=gpt-4o-transcribe
# BAKEOFF_DEEPGRAM_MODEL=nova-3
```

You can start with **just OpenAI** (already configured) and add vendors later —
the harness runs whatever is present and marks the rest "skipped."

> ⚠ **Verify endpoints/models before trusting a vendor's numbers.** The adapters
> were written offline; each file has a `note` and inline comments flagging what
> to confirm against current vendor docs (e.g. Deepgram's `keyterm` is
> unweighted on Nova-3; Sarvam's endpoint is unverified). `doctor` prints these
> notes.

### 2. Record ~20 dictations

Drop audio into `bakeoff/recordings/` (`.m4a`/`.wav`/`.mp3`). See
[`recordings/README.md`](./recordings/README.md) for mic/environment tips and
which axes to vary. The single highest-value first experiment is exactly this —
recording real audio — not writing more code.

### 3. Scaffold ground truth

```bash
npm run bake:init          # empty stub per recording
npm run bake:init -- --draft   # also auto-transcribe a DRAFT to correct
```

This writes one JSON per recording into `bakeoff/ground-truth/`. Open each and
fill in the **truth at the database level** — the exercises and their real sets
(`weight_kg`, `reps`; `weight_kg: null` = bodyweight). That structure, not the
words, is what gets scored. A `reference_transcript` is optional and only powers
the WER/NEER table. See [`ground-truth/_template.json`](./ground-truth/_template.json)
and the worked [`_example-chest.json`](./ground-truth/_example-chest.json).

### 4. Run the bakeoff

```bash
npm run bake                      # transcribe (cached) + score, write a report
npm run bake -- --providers openai,deepgram
npm run bake -- --no-e2e          # ASR-quality table only (fast, free)
npm run bake -- --lang en-US      # A/B the locale vs the default en-IN
npm run bake -- --keyterms none   # raw ASR, no exercise-name biasing
```

The report (markdown + JSON) lands in `bakeoff/reports/`. Transcriptions are
**cached** by (audio, provider, language, keyterms) — re-scoring is instant;
`--fresh` forces re-transcription.

Separate steps if you prefer:

```bash
npm run bake:transcribe    # just call the ASRs, fill the cache
npm run bake:score         # score the last transcribe run into a report
```

---

## How to read the result & when to stop

- **Rank on NEER, then Workout EM.** Ignore WER except as a sanity check.
- Watch the **danger-pair** column and the **numeric confusion hotspots** — a
  provider that says `15→50` even occasionally is disqualifying for weights.
- Prefer the pipeline that gets **near-zero silent wrong weights** while asking
  about **few** fields — not necessarily the highest raw exact-match.
- **20–30 recordings choose the architecture; they don't prove a <0.5% error
  rate.** Zero errors in 100 fields still allows ~3% true error (rule of three).
  Keep accumulating real dictations; `scripts/harvest-eval-cases.ts` already
  mines production corrections into new cases.

---

## Design notes

- **Language default `en-IN`** — but the research shows locale is vendor-specific
  (helped Google, hurt Azure historically). A/B it: `--lang en-US` vs the
  default, same recordings.
- **Keyterm policy default `routine`** — inject only the routine's exercise
  names (production-realistic). `library` floods all ~150 names; the research
  warns that can *add* substitutions, so it's here to measure, not to trust.
- **E2E uses `PARSE_MODEL_DEFAULT`** (the app's default extraction model). To
  compare extraction models, use the existing `npm run eval:compare` — that axis
  already has a home; this harness varies the **ASR**.
- **Load semantics** (`dumbbell_each`, `assistance`, `bodyweight_plus`, …) are
  captured in ground truth even though the app's DB stores a single kg value —
  so you can measure that failure class before the schema grows a `load_mode`
  column.

## File map

```
bakeoff/
  config.ts            paths, language/keyterm defaults, danger-pairs, tolerances
  types.ts             ground-truth + result schemas (zod) — the contract
  recordings/          your audio (gitignored) + tips
  ground-truth/        one JSON per recording (tracked) + template + example
  lib/
    numbers.ts         word→number + numeric-entity extraction
    wer.ts             word-level edit distance
    scoring.ts         NEER + confusions; end-to-end DB-semantic scoring
    audio.ts           hashing, WAV duration, optional ffmpeg 16k-mono convert
    cache.ts           JSON response cache
    catalog.ts         real (service-role) or fixture exercise catalog for E2E
    paths.ts           recording↔ground-truth pairing
    report.ts          markdown/json writers
    env.ts             loads ../.env then bakeoff/.env.local
  providers/           one AsrProvider adapter per vendor + registry
  commands/
    doctor.ts  init.ts  transcribe.ts  score.ts  run.ts
  cache/  reports/      generated (gitignored)
```
