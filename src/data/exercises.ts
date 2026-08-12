import { supabase } from '@/lib/supabase';
import { exerciseSchema, type Exercise, type ExerciseModality } from '@/types/db';
import { deriveBodyRegion, type BodyRegion } from '@/lib/muscles';
import { requireUserId } from './auth';

/**
 * Search by canonical name + aliases + trigram similarity, ranked.
 * Backed by the search_exercises() SQL function (one round-trip).
 *
 * An optional `region` (a 6-way body-region rollup) narrows results: with no
 * query it lists that region's exercises; with a query it filters the ranked
 * matches down to the region (trigram search doesn't take a region argument).
 */
export async function searchExercises(
  query: string,
  region?: BodyRegion | null,
  limit = 30
): Promise<Exercise[]> {
  const q = query.trim();
  if (!q) return region ? listExercisesByRegion(region, limit) : listExercises(limit);
  const { data, error } = await supabase.rpc('search_exercises', {
    q,
    max_results: limit,
  });
  if (error) throw error;
  const results = exerciseSchema.array().parse(data ?? []);
  return region ? results.filter((e) => e.body_region?.includes(region)) : results;
}

/** Exercises whose body-region rollup contains `region`, name-sorted. */
export async function listExercisesByRegion(region: BodyRegion, limit = 60): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .contains('body_region', [region])
    .order('canonical_name')
    .limit(limit);
  if (error) throw error;
  return exerciseSchema.array().parse(data ?? []);
}

export async function listExercises(limit = 50, offset = 0): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('canonical_name')
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return exerciseSchema.array().parse(data ?? []);
}

/**
 * The whole curated directory (~150 rows), name-sorted. Cached + persisted so the
 * exercise picker works offline: server search (trigram + aliases) needs a
 * connection, so offline we filter this list locally instead (see filterExercisesLocally).
 * The cap is generous headroom over the curated set — one round-trip, then it lives in cache.
 */
export async function listAllExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('canonical_name')
    .limit(500);
  if (error) throw error;
  return exerciseSchema.array().parse(data ?? []);
}

/**
 * Local, connection-free search over a cached directory — the offline counterpart
 * to searchExercises. Canonical-name substring + the same body-region narrowing;
 * aliases/trigram aren't available offline (they're a server concern), which is an
 * accepted fidelity trade for working with no connection.
 */
export function filterExercisesLocally(
  all: Exercise[],
  query: string,
  region?: BodyRegion | null,
  limit = 30
): Exercise[] {
  const q = query.trim().toLowerCase();
  let list = all;
  if (region) list = list.filter((e) => e.body_region?.includes(region));
  if (q) list = list.filter((e) => e.canonical_name.toLowerCase().includes(q));
  return list.slice(0, limit);
}

export async function getExercise(id: string): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return exerciseSchema.parse(data);
}

/** Custom exercises behave identically to seeded ones everywhere downstream. */
export async function createCustomExercise(input: {
  name: string;
  /** Free-text primary muscle(s); a single value maps to the body-region rollup. */
  primary_muscle?: string;
  equipment?: string;
  modality?: ExerciseModality;
}): Promise<Exercise> {
  const userId = await requireUserId();
  const primary = input.primary_muscle?.trim().toLowerCase();
  const primary_muscles = primary ? [primary] : [];
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      canonical_name: input.name.trim(),
      primary_muscles,
      secondary_muscles: [],
      body_region: deriveBodyRegion(primary_muscles),
      equipment: input.equipment?.trim() || null,
      mechanic: null,
      modality: input.modality ?? 'weight_reps',
      is_custom: true,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return exerciseSchema.parse(data);
}
