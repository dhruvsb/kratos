/**
 * Local test script for the voice-parsing pipeline — no deploy needed.
 *
 * Runs the SAME pipeline code the parse-utterance edge function runs
 * (supabase/functions/_shared/pipeline/pipeline.ts), calling OpenAI
 * directly and reading the exercise library straight from Postgres via the
 * service role key (bypasses RLS/auth — this only ever runs on your machine).
 * Falls back to the 25-item fixture catalog if Supabase isn't configured yet.
 *
 * Usage:
 *   npx tsx scripts/parse-cli.ts "incline dumbbell press twenty five kgs ten reps"
 *   npx tsx scripts/parse-cli.ts "same weight, two more reps" \
 *     --context '{"current_exercise_id":"...", "last_set":{"weight_kg":60,"reps":8,"set_type":"normal"}}'
 *   npx tsx scripts/parse-cli.ts "..." --model gpt-4o
 *   npx tsx scripts/parse-cli.ts "..." --fixture   # force the 25-item test fixture
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { parseContextSchema } from '../supabase/functions/_shared/parse-types';
import { parseUtterance } from '../supabase/functions/_shared/pipeline/pipeline';
import { OpenAiLlm } from '../supabase/functions/_shared/pipeline/llm';
import { PARSE_MODEL_DEFAULT } from '../supabase/functions/_shared/pipeline/prices';
import {
  InMemoryCatalog,
  type FixtureExercise,
} from '../supabase/functions/_shared/pipeline/fixture-catalog';
import type {
  CatalogExercise,
  ExerciseCatalog,
  ScoredCandidate,
} from '../supabase/functions/_shared/pipeline/resolution';

config();

// Mirrors DbCatalog in supabase/functions/parse-utterance/index.ts, but built
// with the service role key (no request-scoped JWT — this is a dev tool).
class ServiceRoleCatalog implements ExerciseCatalog {
  constructor(private readonly db: ReturnType<typeof createClient>) {}

  async exactMatch(raw: string): Promise<CatalogExercise | null> {
    const needle = raw.trim().toLowerCase();

    const { data: aliasData } = await this.db
      .from('exercise_aliases')
      .select('exercise_id, exercises(canonical_name)')
      .ilike('alias', needle)
      .limit(1)
      .maybeSingle();
    const alias = aliasData as { exercise_id: string; exercises: { canonical_name: string } | null } | null;
    if (alias) {
      return { id: alias.exercise_id, name: alias.exercises?.canonical_name ?? raw };
    }

    const { data: exerciseData } = await this.db
      .from('exercises')
      .select('id, canonical_name')
      .ilike('canonical_name', needle)
      .limit(1)
      .maybeSingle();
    const exercise = exerciseData as { id: string; canonical_name: string } | null;
    if (exercise) return { id: exercise.id, name: exercise.canonical_name };
    return null;
  }

  async candidates(raw: string, limit: number): Promise<ScoredCandidate[]> {
    const { data, error } = await (this.db.rpc as any)('search_exercise_candidates', {
      q: raw,
      max_results: limit,
    });
    if (error) throw new Error(`candidate search failed: ${error.message}`);
    return ((data ?? []) as { exercise_id: string; name: string; score: number }[]).map(
      (row) => ({ id: row.exercise_id, name: row.name, score: row.score })
    );
  }
}

function parseArgs(argv: string[]) {
  const args = { transcript: '', context: {}, model: PARSE_MODEL_DEFAULT, fixture: false };
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--context') args.context = JSON.parse(argv[++i]);
    else if (argv[i] === '--model') args.model = argv[++i];
    else if (argv[i] === '--fixture') args.fixture = true;
    else rest.push(argv[i]);
  }
  args.transcript = rest.join(' ');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.transcript) {
    console.error('Usage: npx tsx scripts/parse-cli.ts "<transcript>" [--context \'{...}\'] [--model id] [--fixture]');
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY in .env');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let catalog: ExerciseCatalog;
  if (!args.fixture && supabaseUrl && serviceKey) {
    catalog = new ServiceRoleCatalog(
      createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    );
    console.error('(using the real exercise library via service role)');
  } else {
    const fixturePath = path.resolve(__dirname, '../eval/golden/fixtures/exercises.json');
    const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureExercise[];
    catalog = new InMemoryCatalog(fixtures);
    console.error('(using the 25-item test fixture — pass --fixture to force this, or set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for the real library)');
  }

  const context = parseContextSchema.parse(args.context);
  const llm = new OpenAiLlm(args.model, apiKey);

  const { result, telemetry } = await parseUtterance(args.transcript, context, { llm, catalog });

  console.log(JSON.stringify({ result, telemetry }, null, 2));
}

main();
