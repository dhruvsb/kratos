/**
 * Seed the exercise directory from the curated ~150-exercise set with rich,
 * chart-ready metadata (scripts/data/exercises-curated.json).
 *
 * This REPLACES the old free-exercise-db import: it wipes the seeded directory
 * and inserts the curated rows (primary/secondary muscles, body-region rollup,
 * mechanic, modality). Custom exercises (is_custom = true) are left untouched.
 *
 * Run:  npx tsx scripts/seed-exercises.ts   (or: npm run seed)
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (service role bypasses
 * RLS — this script runs on your machine only, never in the app).
 *
 * Regenerate the JSON with:  python3 scripts/build-curated-exercises.py
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { SEED_ALIASES } from './exercise-aliases';

config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const NIL = '00000000-0000-0000-0000-000000000000';

type CuratedExercise = {
  canonical_name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  body_region: string[];
  equipment: string | null;
  mechanic: 'compound' | 'isolation';
  modality: 'weight_reps' | 'bodyweight_reps' | 'weighted_bodyweight' | 'time' | 'distance_time';
  aliases: string[];
};

async function main() {
  const path = join(__dirname, 'data', 'exercises-curated.json');
  const curated: CuratedExercise[] = JSON.parse(readFileSync(path, 'utf8'));
  console.log(`Loaded ${curated.length} curated exercises from ${path}`);

  // --- Wipe the old seeded directory --------------------------------------
  // routine_exercises / workout_exercises reference exercises WITHOUT cascade,
  // so clear them first. exercise_aliases DO cascade on exercise delete.
  // Only seeded rows (is_custom = false) are removed; user customs survive.
  for (const table of ['routine_exercises', 'workout_exercises'] as const) {
    const { error } = await supabase.from(table).delete().neq('id', NIL);
    if (error) throw new Error(`Clearing ${table}: ${error.message}`);
  }
  const { error: delErr, count: deleted } = await supabase
    .from('exercises')
    .delete({ count: 'exact' })
    .eq('is_custom', false);
  if (delErr) throw new Error(`Clearing exercises: ${delErr.message}`);
  console.log(`Removed ${deleted ?? '?'} old seeded exercises (aliases cascaded).`);

  // --- Insert the curated exercises ---------------------------------------
  const rows = curated.map((e) => ({
    canonical_name: e.canonical_name,
    primary_muscles: e.primary_muscles,
    secondary_muscles: e.secondary_muscles,
    body_region: e.body_region,
    equipment: e.equipment ?? null,
    mechanic: e.mechanic,
    modality: e.modality,
    is_custom: false,
  }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error, count } = await supabase
      .from('exercises')
      .insert(chunk, { count: 'exact' });
    if (error) throw new Error(`Insert exercises chunk ${i}: ${error.message}`);
    inserted += count ?? chunk.length;
  }
  console.log(`Exercises inserted: ${inserted}`);

  // --- Aliases: from the curated JSON, merged with the hand-curated map -----
  const { data: seeded, error: listError } = await supabase
    .from('exercises')
    .select('id, canonical_name')
    .eq('is_custom', false)
    .limit(5000);
  if (listError) throw listError;
  const idByName = new Map(seeded!.map((e) => [e.canonical_name.toLowerCase(), e.id]));

  // canonical (lowercased) -> set of aliases, from both sources.
  const aliasesByCanonical = new Map<string, Set<string>>();
  const add = (canonical: string, alias: string) => {
    const key = canonical.toLowerCase();
    const a = alias.trim();
    if (!a || a.toLowerCase() === key) return;
    if (!aliasesByCanonical.has(key)) aliasesByCanonical.set(key, new Set());
    aliasesByCanonical.get(key)!.add(a);
  };
  for (const e of curated) for (const a of e.aliases) add(e.canonical_name, a);
  for (const [canonical, aliases] of Object.entries(SEED_ALIASES)) {
    if (idByName.has(canonical.toLowerCase())) for (const a of aliases) add(canonical, a);
  }

  const aliasRows: { exercise_id: string; alias: string; source: 'seed' }[] = [];
  for (const [canonical, aliases] of aliasesByCanonical) {
    const id = idByName.get(canonical);
    if (!id) continue;
    for (const alias of aliases) aliasRows.push({ exercise_id: id, alias, source: 'seed' });
  }

  let aliasCount = 0;
  for (let i = 0; i < aliasRows.length; i += 200) {
    const chunk = aliasRows.slice(i, i + 200);
    const { error } = await supabase
      .from('exercise_aliases')
      .upsert(chunk, { onConflict: 'exercise_id,alias', ignoreDuplicates: true });
    if (error) throw new Error(`Upsert aliases chunk ${i}: ${error.message}`);
    aliasCount += chunk.length;
  }
  console.log(`Aliases inserted: ${aliasCount}`);

  // Sanity checks: search should resolve common abbreviations.
  for (const probe of ['RDL', 'OHP', 'incline db', 'deadlift']) {
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
