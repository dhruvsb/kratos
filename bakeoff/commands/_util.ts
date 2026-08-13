/**
 * Command-shared helpers: flag parsing, the ASR bias-context builder, and a
 * lazy loader for the full exercise-name list (only needed by the 'library'
 * keyterm policy).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { BakeoffContext, GroundTruth } from '../types.ts';
import {
  DEFAULT_KEYTERM_POLICY,
  DEFAULT_LANGUAGE,
  REPO_ROOT,
  type KeytermPolicy,
} from '../config.ts';

export interface CommonFlags {
  providers?: string[]; // --providers openai,deepgram
  fresh: boolean; // --fresh : ignore the response cache
  fixture: boolean; // --fixture : force the 25-item catalog for E2E
  language: string; // --lang en-US
  keyterms: KeytermPolicy; // --keyterms none|routine|library
  e2e: boolean; // default true; --no-e2e to skip the pipeline stage
}

export function parseCommonFlags(argv: string[]): CommonFlags {
  const flags: CommonFlags = {
    fresh: false,
    fixture: false,
    language: DEFAULT_LANGUAGE,
    keyterms: DEFAULT_KEYTERM_POLICY,
    e2e: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--providers') flags.providers = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--fresh') flags.fresh = true;
    else if (a === '--fixture') flags.fixture = true;
    else if (a === '--lang') flags.language = argv[++i];
    else if (a === '--keyterms') flags.keyterms = argv[++i] as KeytermPolicy;
    else if (a === '--no-e2e') flags.e2e = false;
    else if (a === '--e2e') flags.e2e = true;
  }
  return flags;
}

/**
 * Build the recognition-bias context for one recording. 'routine' is the
 * production-realistic policy (you know the routine's exercises); 'library'
 * floods every name (the research warns this can ADD substitutions — it's here
 * to be measured, not trusted); 'none' is the raw-ASR baseline.
 */
export function bakeoffContextFor(
  gt: GroundTruth,
  policy: KeytermPolicy,
  allNames: string[],
  language: string
): BakeoffContext {
  let keyterms: string[] = [];
  if (policy === 'routine') keyterms = gt.exercises.map((e) => e.name);
  else if (policy === 'library') keyterms = allNames;
  return { keyterms, language };
}

let cachedNames: string[] | null = null;

/**
 * Every canonical exercise name — for the 'library' keyterm policy only.
 * Prefers the live seeded library via the service-role key; falls back to the
 * eval fixture. Memoized.
 */
export async function loadAllExerciseNames(): Promise<string[]> {
  if (cachedNames) return cachedNames;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db.from('exercises').select('canonical_name');
    if (!error && data) {
      cachedNames = (data as { canonical_name: string }[]).map((r) => r.canonical_name);
      return cachedNames;
    }
  }
  const fixturePath = path.join(REPO_ROOT, 'eval/golden/fixtures/exercises.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<{ name?: string; canonical_name?: string }>;
  cachedNames = fixture.map((f) => f.canonical_name ?? f.name ?? '').filter(Boolean);
  return cachedNames;
}
