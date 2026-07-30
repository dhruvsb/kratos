// Hevy CSV import — the DB half. Resolves Hevy exercise names to our directory
// (exact / alias / equipment-aware match), auto-creates a custom exercise for
// anything left over, then writes workouts + sets through the repo layer so RLS
// applies exactly as it does for manual logging.
//
// Import is idempotent: every workout carries a stable `external_id`, and
// re-running skips workouts already present (unique(user_id, external_id)).
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/types/db';
import { deriveBodyRegion } from '@/lib/muscles';
import { inferModality, parseHevyCsv, type HevyExercise, type HevyWorkout } from '@/lib/hevy';
import { requireUserId } from './auth';

// --- name matching -----------------------------------------------------------
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // hyphens, parens, punctuation → spaces
    .trim()
    .replace(/\s+/g, ' ');
}

/** Split "Incline Bench Press (Dumbbell)" → { base: "...", equipment: "Dumbbell" }. */
function splitEquipment(title: string): { base: string; equipment: string | null } {
  const m = title.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { base: m[1].trim(), equipment: m[2].trim() };
  return { base: title.trim(), equipment: null };
}

type NameIndex = Map<string, Exercise>;

/** Normalized canonical name + every alias → exercise (canonical wins ties). */
function buildIndex(exercises: Exercise[], aliases: { exercise_id: string; alias: string }[]): NameIndex {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const index: NameIndex = new Map();
  for (const e of exercises) {
    const key = normalize(e.canonical_name);
    if (!index.has(key)) index.set(key, e);
  }
  for (const a of aliases) {
    const e = byId.get(a.exercise_id);
    if (!e) continue;
    const key = normalize(a.alias);
    if (!index.has(key)) index.set(key, e);
  }
  return index;
}

// Equipment words we recognize in both Hevy suffixes and our canonical names.
// Used to reject a bare-base match that would map to the WRONG equipment variant
// (e.g. "Shrug (Dumbbell)" must not resolve to "Barbell Shrug").
const EQUIP_WORDS = [
  'barbell', 'dumbbell', 'machine', 'cable', 'smith', 'ez',
  'kettlebell', 'band', 'bodyweight', 'assisted', 'trap',
];
const equipTokens = (s: string) => EQUIP_WORDS.filter((w) => s.split(' ').includes(w));

function matchExercise(title: string, index: NameIndex): Exercise | null {
  const full = normalize(title);
  const direct = index.get(full);
  if (direct) return direct;

  const { base, equipment } = splitEquipment(title);
  if (!equipment) return null; // no "(...)" qualifier → exact name only
  const nb = normalize(base);
  const ne = normalize(equipment);

  // 1. Equipment-qualified recombinations first, so "Shrug (Dumbbell)" hits
  //    "Dumbbell Shrug" and "Pull Up (Assisted)" hits "Assisted Pull-Up" before
  //    any bare-base alias can grab the wrong variant.
  for (const key of [`${ne} ${nb}`, `${nb} ${ne}`]) {
    const hit = index.get(key);
    if (hit) return hit;
  }

  // 2. Bare base (catches "Lat Pulldown (Cable)" → "Lat Pulldown", where the
  //    equipment is inherent) — but only if the canonical doesn't name a
  //    conflicting equipment. Otherwise fall through to a safe custom.
  const baseHit = index.get(nb);
  if (baseHit) {
    const hevyEquip = equipTokens(ne);
    const canonEquip = equipTokens(normalize(baseHit.canonical_name));
    const conflict =
      canonEquip.length > 0 && hevyEquip.length > 0 && !hevyEquip.some((w) => canonEquip.includes(w));
    if (!conflict) return baseHit;
  }
  return null;
}

// --- plan --------------------------------------------------------------------
export type ExerciseResolution =
  | { kind: 'matched'; title: string; exercise: Exercise }
  | { kind: 'custom'; title: string; equipment: string | null; modality: ReturnType<typeof inferModality> };

export type ImportPlan = {
  workouts: HevyWorkout[];
  newWorkouts: HevyWorkout[];
  skippedWorkouts: number;
  resolutions: Map<string, ExerciseResolution>; // keyed on Hevy exercise title
  matchedCount: number;
  customCount: number;
  newSetCount: number;
  dateRange: { from: string; to: string } | null;
};

/**
 * Parse the CSV and work out exactly what an import would do — which workouts
 * are new vs already imported, and how each distinct exercise resolves — without
 * writing anything. Backs the import screen's preview.
 */
export async function buildImportPlan(csvText: string): Promise<ImportPlan> {
  const { workouts } = parseHevyCsv(csvText);

  // One fetch each: the full seeded directory + its aliases (both RLS-readable).
  const [{ data: exData, error: exErr }, { data: alData, error: alErr }] = await Promise.all([
    supabase.from('exercises').select('*').limit(5000),
    supabase.from('exercise_aliases').select('exercise_id, alias').limit(20000),
  ]);
  if (exErr) throw exErr;
  if (alErr) throw alErr;
  const index = buildIndex((exData ?? []) as Exercise[], alData ?? []);

  // Resolve each distinct Hevy exercise title once. Collect its sets across all
  // workouts so a custom exercise's modality is inferred from every logged set.
  const setsByTitle = new Map<string, HevyExercise['sets']>();
  for (const w of workouts) {
    for (const e of w.exercises) {
      const acc = setsByTitle.get(e.title) ?? [];
      acc.push(...e.sets);
      setsByTitle.set(e.title, acc);
    }
  }
  const resolutions = new Map<string, ExerciseResolution>();
  let matchedCount = 0;
  let customCount = 0;
  for (const [title, sets] of setsByTitle) {
    const hit = matchExercise(title, index);
    if (hit) {
      resolutions.set(title, { kind: 'matched', title, exercise: hit });
      matchedCount++;
    } else {
      resolutions.set(title, {
        kind: 'custom',
        title,
        equipment: splitEquipment(title).equipment,
        modality: inferModality(sets),
      });
      customCount++;
    }
  }

  // Which workouts already exist (idempotency by external_id)?
  const userId = await requireUserId();
  const externalIds = workouts.map((w) => w.externalId);
  const existing = new Set<string>();
  for (let i = 0; i < externalIds.length; i += 200) {
    const chunk = externalIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('workouts')
      .select('external_id')
      .eq('user_id', userId)
      .in('external_id', chunk);
    if (error) throw error;
    for (const row of data ?? []) if (row.external_id) existing.add(row.external_id);
  }
  const newWorkouts = workouts.filter((w) => !existing.has(w.externalId));

  const newSetCount = newWorkouts.reduce(
    (sum, w) => sum + w.exercises.reduce((s, e) => s + e.sets.length, 0),
    0
  );
  const starts = newWorkouts.map((w) => w.startedAt).sort();
  const dateRange = starts.length ? { from: starts[0], to: starts[starts.length - 1] } : null;

  return {
    workouts,
    newWorkouts,
    skippedWorkouts: workouts.length - newWorkouts.length,
    resolutions,
    matchedCount,
    customCount,
    newSetCount,
    dateRange,
  };
}

export type ImportResult = {
  importedWorkouts: number;
  skippedWorkouts: number;
  createdExercises: number;
  importedSets: number;
};

/** Execute a plan: create the custom exercises, then write every new workout. */
export async function commitImportPlan(plan: ImportPlan): Promise<ImportResult> {
  const userId = await requireUserId();

  // 1. Create the custom exercises up front → title → exercise_id for everything.
  const idByTitle = new Map<string, string>();
  let createdExercises = 0;
  for (const res of plan.resolutions.values()) {
    if (res.kind === 'matched') {
      idByTitle.set(res.title, res.exercise.id);
      continue;
    }
    const { data, error } = await supabase
      .from('exercises')
      .insert({
        canonical_name: res.title,
        primary_muscles: [],
        secondary_muscles: [],
        body_region: deriveBodyRegion([]),
        equipment: res.equipment,
        mechanic: null,
        modality: res.modality,
        is_custom: true,
        created_by: userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    idByTitle.set(res.title, data.id);
    createdExercises++;
  }

  // 2. Write each new workout: workout → workout_exercises → sets.
  let importedSets = 0;
  for (const w of plan.newWorkouts) {
    const { data: workout, error: wErr } = await supabase
      .from('workouts')
      .insert({
        user_id: userId,
        routine_id: null,
        started_at: w.startedAt,
        ended_at: w.endedAt ?? w.startedAt, // must be non-null to show in history
        notes: w.description || `Imported from Hevy · ${w.title}`,
        external_id: w.externalId,
      })
      .select('id')
      .single();
    if (wErr) throw wErr;

    const { data: weRows, error: weErr } = await supabase
      .from('workout_exercises')
      .insert(
        w.exercises.map((e, i) => ({
          workout_id: workout.id,
          exercise_id: idByTitle.get(e.title)!,
          position: i,
        }))
      )
      .select('id, position');
    if (weErr) throw weErr;
    const weIdByPosition = new Map((weRows ?? []).map((r) => [r.position, r.id]));

    // All sets for the workout in one batch. logged_via is 'manual' — the schema
    // enum has no 'import' value, and external_id already flags imported workouts.
    const setRows = w.exercises.flatMap((e, i) => {
      const weId = weIdByPosition.get(i)!;
      return e.sets.map((s, j) => ({
        workout_exercise_id: weId,
        set_number: j + 1,
        weight_kg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        set_type: s.setType,
        logged_via: 'manual' as const,
        raw_transcript: null,
        parse_confidence: null,
      }));
    });
    for (let i = 0; i < setRows.length; i += 500) {
      const chunk = setRows.slice(i, i + 500);
      const { error: sErr } = await supabase.from('sets').insert(chunk);
      if (sErr) throw sErr;
      importedSets += chunk.length;
    }
  }

  return {
    importedWorkouts: plan.newWorkouts.length,
    skippedWorkouts: plan.skippedWorkouts,
    createdExercises,
    importedSets,
  };
}
