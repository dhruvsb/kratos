/**
 * NON-DESTRUCTIVE metadata sync for the curated exercise directory.
 *
 * Unlike `seed-exercises.ts` (which WIPES routine_exercises / workout_exercises and
 * re-inserts every exercise with fresh UUIDs — safe only for a first seed), this
 * script updates a directory that already has real user data hanging off it:
 *   - existing seeded rows are matched by canonical_name and UPDATED in place, so
 *     their id is preserved and every routine_exercise / workout set keeps pointing
 *     at the same exercise;
 *   - curated names with no existing row are INSERTED (the coverage additions);
 *   - aliases are inserted if missing (idempotent, onConflict ignore).
 * It NEVER deletes routines, workouts, sets, or exercises.
 *
 * Use this to roll out the 2026-08-15 audit (weighted_bodyweight modality retags,
 * muscle/region corrections, +6 new exercises) onto a live DB.
 * Prereq: migration 0011 (widens the modality CHECK constraint) must be applied first.
 *
 * Run:  npx tsx scripts/update-exercise-metadata.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (service role; local only).
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

  // Existing seeded directory, keyed by lowercased canonical name → id.
  const { data: existing, error: listErr } = await supabase
    .from('exercises')
    .select('id, canonical_name')
    .eq('is_custom', false)
    .limit(5000);
  if (listErr) throw listErr;
  const idByName = new Map(existing!.map((e) => [e.canonical_name.toLowerCase(), e.id]));
  console.log(`Existing seeded rows: ${idByName.size}`);

  // --- Update in place (by id) or insert new -------------------------------
  let updated = 0;
  let insertedNew = 0;
  for (const e of curated) {
    const meta = {
      primary_muscles: e.primary_muscles,
      secondary_muscles: e.secondary_muscles,
      body_region: e.body_region,
      equipment: e.equipment ?? null,
      mechanic: e.mechanic,
      modality: e.modality,
    };
    const id = idByName.get(e.canonical_name.toLowerCase());
    if (id) {
      const { error } = await supabase.from('exercises').update(meta).eq('id', id);
      if (error) throw new Error(`Update ${e.canonical_name}: ${error.message}`);
      updated++;
    } else {
      const { data, error } = await supabase
        .from('exercises')
        .insert({ canonical_name: e.canonical_name, is_custom: false, ...meta })
        .select('id, canonical_name')
        .single();
      if (error) throw new Error(`Insert ${e.canonical_name}: ${error.message}`);
      idByName.set(data.canonical_name.toLowerCase(), data.id);
      insertedNew++;
      console.log(`  + inserted new: ${e.canonical_name}`);
    }
  }
  console.log(`Updated in place: ${updated} · Inserted new: ${insertedNew}`);

  // --- Aliases: add any missing (idempotent) -------------------------------
  const aliasesByCanonical = new Map<string, Set<string>>();
  const add = (canonical: string, alias: string) => {
    const key = canonical.toLowerCase();
    const a = alias.trim();
    if (!a) return;
    if (!aliasesByCanonical.has(key)) aliasesByCanonical.set(key, new Set());
    aliasesByCanonical.get(key)!.add(a);
  };
  for (const e of curated) for (const a of e.aliases) add(e.canonical_name, a);
  // SEED_ALIASES keys are free-exercise-db names; only the few that coincide with a
  // curated canonical name resolve — the rest are skipped (see the alias-seed note).
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
  console.log(`Aliases upserted (idempotent): ${aliasCount}`);
  console.log('Done — no routines, workouts, or sets were touched.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
