import { supabase } from '@/lib/supabase';
import type { Exercise, ExerciseModality } from '@/types/db';
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
  const results = (data ?? []) as Exercise[];
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
  return (data ?? []) as Exercise[];
}

export async function listExercises(limit = 50, offset = 0): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('canonical_name')
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as Exercise[];
}

export async function getExercise(id: string): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Exercise;
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
  return data as Exercise;
}
