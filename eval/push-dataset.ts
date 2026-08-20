/**
 * Push the golden eval set (eval/golden/v1.jsonl) to Langfuse as a Dataset.
 *
 *   npm run eval:dataset
 *
 * Idempotent: dataset + items are upserted (items keyed by a stable id), so
 * re-running after editing v1.jsonl updates the dataset in place. Once pushed,
 * `npm run eval -- --langfuse` records each run against this dataset so you get
 * accuracy-over-time and model comparison in the Langfuse UI.
 *
 * Needs LANGFUSE_* in .env (see eval/langfuse.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { GOLDEN_DATASET, datasetItemId, makeLangfuse, LANGFUSE_ENV_HINT } from './langfuse';

config();

const ROOT = path.resolve(__dirname, '..');
const GOLDEN_PATH = path.join(ROOT, 'eval/golden/v1.jsonl');

interface GoldenCase {
  id: string;
  category: string;
  transcript: string;
  context?: unknown;
  expected: unknown;
  note?: string;
}

function loadGolden(): GoldenCase[] {
  return readFileSync(GOLDEN_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as GoldenCase);
}

async function main() {
  const langfuse = makeLangfuse();
  if (!langfuse) {
    console.error(`Cannot push dataset — Langfuse is not configured.\n${LANGFUSE_ENV_HINT}`);
    process.exit(1);
  }

  const cases = loadGolden();
  console.log(`Pushing ${cases.length} golden cases to Langfuse dataset "${GOLDEN_DATASET}"...`);

  await langfuse.createDataset({
    name: GOLDEN_DATASET,
    description:
      'Kratos voice-parse golden set v1 (synthetic). Each item is a transcript + ' +
      'expected structured parse; used by `npm run eval -- --langfuse` as an experiment dataset.',
    metadata: { source: 'eval/golden/v1.jsonl', version: 'v1' },
  });

  for (const c of cases) {
    await langfuse.createDatasetItem({
      id: datasetItemId(c.id),
      datasetName: GOLDEN_DATASET,
      input: { transcript: c.transcript, context: c.context ?? {} },
      expectedOutput: c.expected,
      metadata: { case_id: c.id, category: c.category, ...(c.note ? { note: c.note } : {}) },
    });
    process.stdout.write('.');
  }
  console.log('');

  await langfuse.flushAsync();
  const base = (process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com').replace(/\/+$/, '');
  console.log(`Done. View it at ${base} → Datasets → ${GOLDEN_DATASET}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
