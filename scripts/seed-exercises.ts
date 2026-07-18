/**
 * Seed the exercise library from free-exercise-db (~870 exercises, public domain).
 * https://github.com/yuhonas/free-exercise-db
 *
 * Idempotent: exercises upsert on canonical_name; aliases insert-if-missing.
 * Run:  npx tsx scripts/seed-exercises.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (service role bypasses
 * RLS — this script runs on your machine only, never in the app).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { SEED_ALIASES } from './exercise-aliases';

config();

const DATASET_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

type FreeExercise = {
  name: string;
  category: string | null;
  equipment: string | null;
  primaryMuscles: string[];
};

async function main() {
  console.log(`Downloading ${DATASET_URL} ...`);
  const res = await fetch(DATASET_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const raw: FreeExercise[] = await res.json();

  // Dedupe by name (dataset is clean, but belt-and-braces).
  const byName = new Map<string, FreeExercise>();
  for (const e of raw) {
    const name = e.name?.trim();
    if (name && !byName.has(name)) byName.set(name, e);
  }
  const rows = [...byName.values()].map((e) => ({
    canonical_name: e.name.trim(),
    category: e.category ?? null,
    equipment: e.equipment ?? null,
    primary_muscle: e.primaryMuscles?.[0] ?? null,
    is_custom: false,
  }));
  console.log(`Dataset: ${raw.length} rows, ${rows.length} after dedupe.`);

  // Upsert in chunks (PostgREST payload limits).
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error, count } = await supabase
      .from('exercises')
      .upsert(chunk, { onConflict: 'canonical_name', ignoreDuplicates: false, count: 'exact' });
    if (error) throw new Error(`Upsert exercises chunk ${i}: ${error.message}`);
    inserted += count ?? chunk.length;
  }
  console.log(`Exercises upserted: ${inserted}`);

  // Resolve alias-map keys to exercise ids.
  const { data: seeded, error: listError } = await supabase
    .from('exercises')
    .select('id, canonical_name')
    .eq('is_custom', false)
    .limit(5000);
  if (listError) throw listError;
  const idByName = new Map(seeded!.map((e) => [e.canonical_name.toLowerCase(), e.id]));

  const aliasRows: { exercise_id: string; alias: string; source: 'seed' }[] = [];
  const unresolved: string[] = [];
  for (const [canonical, aliases] of Object.entries(SEED_ALIASES)) {
    const id = idByName.get(canonical.toLowerCase());
    if (!id) {
      unresolved.push(canonical);
      continue;
    }
    for (const alias of aliases) {
      aliasRows.push({ exercise_id: id, alias, source: 'seed' });
    }
  }
  if (unresolved.length > 0) {
    console.warn(
      `WARNING: ${unresolved.length} alias-map keys not found in dataset (skipped):\n  ` +
        unresolved.join('\n  ')
    );
  }

  let aliasCount = 0;
  for (let i = 0; i < aliasRows.length; i += 200) {
    const chunk = aliasRows.slice(i, i + 200);
    // ignoreDuplicates → idempotent re-runs (unique on exercise_id + alias).
    const { error } = await supabase
      .from('exercise_aliases')
      .upsert(chunk, { onConflict: 'exercise_id,alias', ignoreDuplicates: true });
    if (error) throw new Error(`Upsert aliases chunk ${i}: ${error.message}`);
    aliasCount += chunk.length;
  }
  console.log(`Aliases processed: ${aliasCount} (existing ones skipped)`);

  // Quick sanity checks the PRD asks for.
  for (const probe of ['RDL', 'OHP', 'incline db']) {
    const { data } = await supabase.rpc('search_exercises', { q: probe, max_results: 3 });
    console.log(
      `search "${probe}" → ${(data ?? []).map((e: any) => e.canonical_name).join(' | ') || 'NO MATCH'}`
    );
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
