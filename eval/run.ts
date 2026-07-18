/**
 * Eval harness — runs the golden set through the SAME production pipeline
 * (supabase/functions/_shared/pipeline/pipeline.ts) and scores it.
 *
 * Usage:
 *   npm run eval            # score PARSE_MODEL_DEFAULT (Haiku 4.5)
 *   npm run eval:compare    # score PARSE_MODEL_DEFAULT and PARSE_MODEL_MID (Sonnet 5),
 *                           # report accuracy vs cost per 1,000 parses side by side
 *
 * Needs ANTHROPIC_API_KEY in .env. Exercise matching runs against the 25-item
 * fixture in eval/golden/fixtures/exercises.json, not the real seeded library —
 * see eval/README.md for why, and how to point this at real data later.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import {
  parseContextSchema,
  type Intent,
  type ParseContext,
  type SetType,
} from '../supabase/functions/_shared/parse-types';
import { parseUtterance } from '../supabase/functions/_shared/pipeline/pipeline';
import { AnthropicLlm } from '../supabase/functions/_shared/pipeline/llm';
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
  const llm = new AnthropicLlm(model, apiKey);

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

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Missing ANTHROPIC_API_KEY in .env');
    process.exit(1);
  }

  const compare = process.argv.includes('--compare');
  const models = compare ? [PARSE_MODEL_DEFAULT, PARSE_MODEL_MID] : [PARSE_MODEL_DEFAULT];
  const golden = loadGolden();

  const summaries: Summary[] = [];
  for (const model of models) {
    console.log(`\nRunning ${golden.length} cases against ${model}...`);
    const catalog = loadCatalog(); // fresh instance per model — no shared state
    const scores: CaseScore[] = [];
    for (const goldenCase of golden) {
      const score = await runCase(goldenCase, model, apiKey, catalog);
      scores.push(score);
      process.stdout.write(score.error ? 'E' : score.fieldChecks.every((c) => c.match) && score.intentMatch && score.mustAskMatch ? '.' : 'F');
    }
    console.log('');
    summaries.push(summarize(model, scores));
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
