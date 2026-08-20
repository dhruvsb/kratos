/**
 * Eval harness — runs the golden set through the SAME production pipeline
 * (supabase/functions/_shared/pipeline/pipeline.ts) and scores it.
 *
 * Usage:
 *   npm run eval            # score PARSE_MODEL_DEFAULT (gpt-5.6-luna)
 *   npm run eval:compare    # score PARSE_MODEL_DEFAULT and PARSE_MODEL_MID (gpt-5.6-terra),
 *                           # report accuracy vs cost per 1,000 parses side by side
 *   npm run eval -- --langfuse            # ALSO log each run to Langfuse as an experiment
 *   npm run eval -- --langfuse --run-name=my-run   # ...under an explicit run name
 *
 * Needs OPENAI_API_KEY in .env. `--langfuse` additionally needs LANGFUSE_* in .env
 * and the golden set already pushed as a dataset (`npm run eval:dataset`). Exercise
 * matching runs against the 25-item fixture in eval/golden/fixtures/exercises.json,
 * not the real seeded library — see eval/README.md for why, and how to point this at
 * real data later.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import type { Langfuse } from 'langfuse';
import { GOLDEN_DATASET, datasetItemId, makeLangfuse, LANGFUSE_ENV_HINT } from './langfuse';
import {
  parseContextSchema,
  type Intent,
  type ParseContext,
  type SetType,
} from '../supabase/functions/_shared/parse-types';
import { parseUtterance } from '../supabase/functions/_shared/pipeline/pipeline';
import { OpenAiLlm } from '../supabase/functions/_shared/pipeline/llm';
import {
  InMemoryCatalog,
  type FixtureExercise,
} from '../supabase/functions/_shared/pipeline/fixture-catalog';
import {
  PARSE_MODEL_DEFAULT,
  PARSE_MODEL_MID,
  costUsd,
} from '../supabase/functions/_shared/pipeline/prices';

config();

const ROOT = path.resolve(__dirname, '..');
const GOLDEN_PATH = path.join(ROOT, 'eval/golden/v1.jsonl');
const FIXTURES_PATH = path.join(ROOT, 'eval/golden/fixtures/exercises.json');
const REPORTS_DIR = path.join(ROOT, 'eval/reports');

interface ExpectedEntry {
  exercise_id?: string | null;
  weight_kg?: number | null;
  reps?: number | null;
  sets_count?: number;
  set_type?: SetType;
}

interface GoldenCase {
  id: string;
  category: string;
  transcript: string;
  context?: Partial<ParseContext>;
  expected: {
    intent: Intent;
    must_ask: boolean;
    entries?: ExpectedEntry[];
  };
  note?: string;
}

const ENTRY_FIELDS = [
  'exercise_id',
  'weight_kg',
  'reps',
  'sets_count',
  'set_type',
] as const;
type EntryField = (typeof ENTRY_FIELDS)[number];

interface FieldCheck {
  field: EntryField;
  entryIndex: number;
  expected: unknown;
  actual: unknown;
  match: boolean;
}

interface CaseScore {
  id: string;
  category: string;
  transcript: string;
  intentMatch: boolean;
  mustAskMatch: boolean;
  entryCountMatch: boolean;
  fieldChecks: FieldCheck[];
  costUsd: number;
  latencyMs: number;
  error?: string;
  /** The raw pipeline output (for Langfuse trace output); undefined on error. */
  parseResult?: unknown;
}

function loadGolden(): GoldenCase[] {
  return readFileSync(GOLDEN_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GoldenCase);
}

function loadCatalog(): InMemoryCatalog {
  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as FixtureExercise[];
  return new InMemoryCatalog(fixtures);
}

function numbersClose(a: unknown, b: unknown): boolean {
  if (typeof a !== 'number' || typeof b !== 'number') return a === b;
  return Math.abs(a - b) < 0.05;
}

async function runCase(
  golden: GoldenCase,
  model: string,
  apiKey: string,
  catalog: InMemoryCatalog
): Promise<CaseScore> {
  const context = parseContextSchema.parse(golden.context ?? {});
  const llm = new OpenAiLlm(model, apiKey);

  try {
    const { result, telemetry } = await parseUtterance(golden.transcript, context, {
      llm,
      catalog,
    });

    const intentMatch = result.intent === golden.expected.intent;
    const mustAskMatch = (result.ambiguities.length > 0) === golden.expected.must_ask;

    const expectedEntries = golden.expected.entries ?? [];
    const entryCountMatch =
      expectedEntries.length === 0 || result.entries.length === expectedEntries.length;

    const fieldChecks: FieldCheck[] = [];
    if (entryCountMatch) {
      expectedEntries.forEach((expectedEntry, entryIndex) => {
        const actualEntry = result.entries[entryIndex];
        for (const field of ENTRY_FIELDS) {
          if (!(field in expectedEntry)) continue; // field not asserted for this case
          const expectedValue = expectedEntry[field];
          const actualValue =
            field === 'exercise_id'
              ? (actualEntry?.exercise.exercise_id ?? null)
              : (actualEntry?.[field] ?? null);
          const match =
            field === 'weight_kg'
              ? numbersClose(expectedValue, actualValue)
              : expectedValue === actualValue;
          fieldChecks.push({ field, entryIndex, expected: expectedValue, actual: actualValue, match });
        }
      });
    }

    return {
      id: golden.id,
      category: golden.category,
      transcript: golden.transcript,
      intentMatch,
      mustAskMatch,
      entryCountMatch,
      fieldChecks,
      costUsd: telemetry.cost_usd,
      latencyMs: telemetry.latency_ms,
      parseResult: result,
    };
  } catch (err) {
    return {
      id: golden.id,
      category: golden.category,
      transcript: golden.transcript,
      intentMatch: false,
      mustAskMatch: false,
      entryCountMatch: false,
      fieldChecks: [],
      costUsd: 0,
      latencyMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function pct(n: number, d: number): string {
  return d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`;
}

interface Summary {
  model: string;
  overallCases: number;
  intentCorrect: number;
  mustAskCorrect: number;
  fieldTotal: number;
  fieldCorrect: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  byCategory: Map<
    string,
    { cases: number; intentCorrect: number; mustAskCorrect: number; fieldTotal: number; fieldCorrect: number }
  >;
  ambiguousMustAskAccuracy: string;
  failures: CaseScore[];
}

function summarize(model: string, scores: CaseScore[]): Summary {
  const byCategory = new Map<
    string,
    { cases: number; intentCorrect: number; mustAskCorrect: number; fieldTotal: number; fieldCorrect: number }
  >();
  let intentCorrect = 0;
  let mustAskCorrect = 0;
  let fieldTotal = 0;
  let fieldCorrect = 0;
  let totalCostUsd = 0;
  let totalLatencyMs = 0;
  const failures: CaseScore[] = [];

  for (const score of scores) {
    const bucket = byCategory.get(score.category) ?? {
      cases: 0,
      intentCorrect: 0,
      mustAskCorrect: 0,
      fieldTotal: 0,
      fieldCorrect: 0,
    };
    bucket.cases++;
    if (score.intentMatch) intentCorrect++, bucket.intentCorrect++;
    if (score.mustAskMatch) mustAskCorrect++, bucket.mustAskCorrect++;
    for (const check of score.fieldChecks) {
      fieldTotal++;
      bucket.fieldTotal++;
      if (check.match) fieldCorrect++, bucket.fieldCorrect++;
    }
    byCategory.set(score.category, bucket);
    totalCostUsd += score.costUsd;
    totalLatencyMs += score.latencyMs;

    const isFailure =
      score.error ||
      !score.intentMatch ||
      !score.mustAskMatch ||
      !score.entryCountMatch ||
      score.fieldChecks.some((c) => !c.match);
    if (isFailure) failures.push(score);
  }

  const ambiguousScores = scores.filter((s) => s.category === 'ambiguous_must_ask');
  const ambiguousCorrect = ambiguousScores.filter((s) => s.mustAskMatch).length;

  return {
    model,
    overallCases: scores.length,
    intentCorrect,
    mustAskCorrect,
    fieldTotal,
    fieldCorrect,
    totalCostUsd,
    totalLatencyMs,
    byCategory,
    ambiguousMustAskAccuracy: pct(ambiguousCorrect, ambiguousScores.length),
    failures,
  };
}

function renderReport(summaries: Summary[]): string {
  const lines: string[] = [];
  const date = new Date().toISOString().slice(0, 10);
  lines.push(`# Eval report — ${date}`, '');

  if (summaries.length > 1) {
    lines.push('## Model comparison', '');
    lines.push('| Model | Field accuracy | Ambiguity behavior | Intent accuracy | Avg cost/parse | Cost per 1,000 parses | Avg latency |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const s of summaries) {
      const avgCost = s.overallCases ? s.totalCostUsd / s.overallCases : 0;
      lines.push(
        `| ${s.model} | ${pct(s.fieldCorrect, s.fieldTotal)} | ${pct(s.mustAskCorrect, s.overallCases)} | ${pct(s.intentCorrect, s.overallCases)} | $${avgCost.toFixed(5)} | $${(avgCost * 1000).toFixed(2)} | ${s.overallCases ? Math.round(s.totalLatencyMs / s.overallCases) : 0}ms |`
      );
    }
    lines.push('');
  }

  for (const s of summaries) {
    lines.push(`## ${s.model}`, '');
    lines.push(`Overall field accuracy: **${pct(s.fieldCorrect, s.fieldTotal)}** (${s.fieldCorrect}/${s.fieldTotal})`);
    lines.push(`Ambiguity behavior (asked when it should, didn't when it shouldn't): **${pct(s.mustAskCorrect, s.overallCases)}**`);
    lines.push(`\`ambiguous_must_ask\` category accuracy: **${s.ambiguousMustAskAccuracy}** (target: 100%)`);
    lines.push(`Intent accuracy: **${pct(s.intentCorrect, s.overallCases)}**`);
    lines.push(
      `Total cost: $${s.totalCostUsd.toFixed(4)} over ${s.overallCases} cases (avg $${(s.overallCases ? s.totalCostUsd / s.overallCases : 0).toFixed(5)}/parse)`
    );
    lines.push('');

    lines.push('| Category | Cases | Field accuracy | Ambiguity behavior |', '|---|---|---|---|');
    for (const [category, bucket] of s.byCategory) {
      lines.push(
        `| ${category} | ${bucket.cases} | ${pct(bucket.fieldCorrect, bucket.fieldTotal)} | ${pct(bucket.mustAskCorrect, bucket.cases)} |`
      );
    }
    lines.push('');

    if (s.failures.length > 0) {
      lines.push(`### Failures (${s.failures.length})`, '');
      for (const f of s.failures) {
        lines.push(`- **${f.id}** (\`${f.category}\`) — "${f.transcript}"`);
        if (f.error) {
          lines.push(`  - error: ${f.error}`);
          continue;
        }
        if (!f.intentMatch) lines.push(`  - intent mismatch`);
        if (!f.mustAskMatch) lines.push(`  - ambiguity behavior wrong (expected must_ask to differ)`);
        if (!f.entryCountMatch) lines.push(`  - entry count mismatch`);
        for (const c of f.fieldChecks) {
          if (!c.match) {
            lines.push(
              `  - entry[${c.entryIndex}].${c.field}: expected \`${JSON.stringify(c.expected)}\`, got \`${JSON.stringify(c.actual)}\``
            );
          }
        }
      }
      lines.push('');
    } else {
      lines.push('No failures. 🎉', '');
    }
  }

  return lines.join('\n');
}

// Per-case field accuracy (0–1). Cases that assert no fields (e.g. ambiguous ones
// that should only ask) count as 1 — their signal is intent/ambiguity, not fields.
function caseFieldAccuracy(score: CaseScore): number {
  if (score.fieldChecks.length === 0) return 1;
  return score.fieldChecks.filter((c) => c.match).length / score.fieldChecks.length;
}

function caseIsPass(score: CaseScore): boolean {
  return (
    !score.error &&
    score.intentMatch &&
    score.mustAskMatch &&
    score.entryCountMatch &&
    score.fieldChecks.every((c) => c.match)
  );
}

// A dataset item, narrowed to the one method we use (link a trace into a run).
interface LinkableItem {
  id: string;
  link: (obj: object, runName: string, args?: { metadata?: unknown }) => Promise<unknown>;
}

// Handle to a Langfuse experiment run: the client, the dataset items (for linking),
// and the run name that groups this invocation's cases in the UI.
interface LangfuseRun {
  langfuse: Langfuse;
  runName: string;
  itemByCaseId: Map<string, LinkableItem>;
}

// Emit one Langfuse trace for a scored case and link it into the dataset run, with
// per-case scores (pass / field_accuracy / intent / ambiguity / cost / latency).
async function emitLangfuseCase(run: LangfuseRun, golden: GoldenCase, score: CaseScore): Promise<void> {
  const { langfuse, runName } = run;
  const trace = langfuse.trace({
    name: 'eval.parse',
    input: { transcript: golden.transcript, context: golden.context ?? {} },
    output: score.parseResult ?? { error: score.error ?? 'unknown' },
    metadata: { case_id: golden.id, category: golden.category, run: runName },
    tags: ['eval', golden.category],
  });

  const pass = caseIsPass(score);
  trace.score({ name: 'pass', value: pass ? 1 : 0 });
  trace.score({ name: 'field_accuracy', value: caseFieldAccuracy(score) });
  trace.score({ name: 'intent_match', value: score.intentMatch ? 1 : 0 });
  trace.score({ name: 'ambiguity_correct', value: score.mustAskMatch ? 1 : 0 });
  trace.score({ name: 'cost_usd', value: score.costUsd });
  trace.score({ name: 'latency_ms', value: score.latencyMs });
  if (score.error) {
    trace.score({ name: 'pipeline_error', value: 1, comment: score.error });
  }

  // Link the trace to its golden dataset item so it shows up under this run in the
  // dataset's "Runs" view. Skipped (with a warning) if the item isn't in the dataset.
  const item = run.itemByCaseId.get(golden.id);
  if (item) {
    await item.link(trace, runName, { metadata: { pass } });
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY in .env');
    process.exit(1);
  }

  const compare = process.argv.includes('--compare');
  const useLangfuse = process.argv.includes('--langfuse');
  const runNameArg = process.argv.find((a) => a.startsWith('--run-name='))?.split('=')[1];
  const models = compare ? [PARSE_MODEL_DEFAULT, PARSE_MODEL_MID] : [PARSE_MODEL_DEFAULT];
  const golden = loadGolden();

  // Set up the Langfuse experiment once (shared across models). Each model becomes
  // its own run name so the dataset's Runs view compares them side by side.
  let langfuse: Langfuse | null = null;
  const itemByCaseId = new Map<string, LinkableItem>();
  if (useLangfuse) {
    langfuse = makeLangfuse();
    if (!langfuse) {
      console.error(`--langfuse given but Langfuse is not configured.\n${LANGFUSE_ENV_HINT}`);
      process.exit(1);
    }
    try {
      const dataset = await langfuse.getDataset(GOLDEN_DATASET);
      for (const it of dataset.items) {
        // Recover the case id from the item's stable id (datasetItemId(caseId)).
        const caseId = golden.find((g) => datasetItemId(g.id) === it.id)?.id;
        if (caseId) itemByCaseId.set(caseId, it as unknown as LinkableItem);
      }
      console.log(`Langfuse: dataset "${GOLDEN_DATASET}" has ${itemByCaseId.size}/${golden.length} matching items.`);
      if (itemByCaseId.size === 0) {
        console.warn('  No items matched — did you run `npm run eval:dataset` first? Traces will still be logged, just not linked to the dataset.');
      }
    } catch (err) {
      console.warn(`Langfuse: could not load dataset "${GOLDEN_DATASET}" (${err instanceof Error ? err.message : err}). Traces will be logged unlinked.`);
    }
  }

  const runStamp = new Date().toISOString().slice(0, 16).replace(':', '');

  const summaries: Summary[] = [];
  for (const model of models) {
    console.log(`\nRunning ${golden.length} cases against ${model}...`);
    const catalog = loadCatalog(); // fresh instance per model — no shared state
    const scores: CaseScore[] = [];
    const lfRun: LangfuseRun | null = langfuse
      ? { langfuse, runName: runNameArg ? (compare ? `${runNameArg}-${model}` : runNameArg) : `${model}@${runStamp}`, itemByCaseId }
      : null;
    for (const goldenCase of golden) {
      const score = await runCase(goldenCase, model, apiKey, catalog);
      scores.push(score);
      if (lfRun) await emitLangfuseCase(lfRun, goldenCase, score);
      process.stdout.write(score.error ? 'E' : score.fieldChecks.every((c) => c.match) && score.intentMatch && score.mustAskMatch ? '.' : 'F');
    }
    console.log('');
    if (lfRun) console.log(`Langfuse run logged: "${lfRun.runName}"`);
    summaries.push(summarize(model, scores));
  }

  if (langfuse) {
    await langfuse.flushAsync();
    const base = (process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com').replace(/\/+$/, '');
    console.log(`\nLangfuse experiment: ${base} → Datasets → ${GOLDEN_DATASET} → Runs`);
  }

  const report = renderReport(summaries);
  mkdirSync(REPORTS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const modelSlug = models.join('-vs-');
  const reportPath = path.join(REPORTS_DIR, `${date}-${modelSlug}.md`);
  writeFileSync(reportPath, report);
  console.log(`\nReport written to ${path.relative(ROOT, reportPath)}`);
  console.log(report);
}

main();
