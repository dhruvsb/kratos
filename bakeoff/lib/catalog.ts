/**
 * Exercise catalog loader for the bakeoff. Prefers the real Postgres library
 * (via the service-role key, bypassing RLS — dev-only) and falls back to the
 * in-memory fixture catalog when Supabase isn't configured or `fixture` is set.
 *
 * The ServiceRoleCatalog is the same shape parse-cli uses: exact alias/canonical
 * hit, then trigram candidates via the search_exercise_candidates RPC.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { REPO_ROOT } from '../config.ts';
import {
  InMemoryCatalog,
  type FixtureExercise,
} from '../../supabase/functions/_shared/pipeline/fixture-catalog.ts';
import type {
  CatalogExercise,
  ExerciseCatalog,
  ScoredCandidate,
} from '../../supabase/functions/_shared/pipeline/resolution.ts';

// Re-export so command modules can type against the catalog without reaching
// into the shared pipeline directory themselves.
export type { ExerciseCatalog } from '../../supabase/functions/_shared/pipeline/resolution.ts';

class ServiceRoleCatalog implements ExerciseCatalog {
  constructor(private readonly db: SupabaseClient) {}

  async exactMatch(raw: string): Promise<CatalogExercise | null> {
    const needle = raw.trim().toLowerCase();

    const { data: aliasData } = await this.db
      .from('exercise_aliases')
      .select('exercise_id, exercises(canonical_name)')
      .ilike('alias', needle)
      .limit(1)
      .maybeSingle();
    const alias = aliasData as
      | { exercise_id: string; exercises: { canonical_name: string } | null }
      | null;
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
    // NOTE: the cast must be applied to the CLIENT, not lifted into a bare
    // function reference. `const rpc = this.db.rpc` detaches the method from
    // its receiver, so supabase-js sees `this === undefined` and dies with
    // "Cannot read properties of undefined (reading 'rest')". Keeping it a
    // method call on `db` preserves the binding (and the types).
    const db = this.db as unknown as {
      rpc: (
        fn: string,
        params: Record<string, unknown>
      ) => Promise<{
        data: { exercise_id: string; name: string; score: number }[] | null;
        error: { message: string } | null;
      }>;
    };
    const { data, error } = await db.rpc('search_exercise_candidates', {
      q: raw,
      max_results: limit,
    });
    if (error) throw new Error(`candidate search failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.exercise_id,
      name: row.name,
      score: row.score,
    }));
  }
}

/**
 * Build the exercise catalog. Uses Supabase when `SUPABASE_URL` and
 * `SUPABASE_SERVICE_ROLE_KEY` are set (and `fixture` isn't forced), else the
 * 25-item test fixture under eval/golden/fixtures/.
 */
export async function loadCatalog(
  opts?: { fixture?: boolean }
): Promise<{ catalog: ExerciseCatalog; source: 'supabase' | 'fixture' }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!opts?.fixture && supabaseUrl && serviceKey) {
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    return { catalog: new ServiceRoleCatalog(db), source: 'supabase' };
  }

  const fixturePath = path.join(REPO_ROOT, 'eval/golden/fixtures/exercises.json');
  const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureExercise[];
  return { catalog: new InMemoryCatalog(fixtures), source: 'fixture' };
}
