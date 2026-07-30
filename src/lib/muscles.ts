/**
 * Muscle taxonomy shared by the exercise directory and the "muscles worked"
 * charts. The 17 muscle terms match the free-exercise-db vocabulary the seed
 * uses, so imports and the curated set stay interoperable.
 */

export const BODY_REGIONS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

/** 17 source muscles → 6 body-region rollup used for grouping in charts. */
export const MUSCLE_TO_REGION: Record<string, BodyRegion> = {
  chest: 'Chest',
  lats: 'Back',
  'middle back': 'Back',
  'lower back': 'Back',
  traps: 'Back',
  shoulders: 'Shoulders',
  neck: 'Shoulders',
  biceps: 'Arms',
  triceps: 'Arms',
  forearms: 'Arms',
  quadriceps: 'Legs',
  hamstrings: 'Legs',
  glutes: 'Legs',
  calves: 'Legs',
  abductors: 'Legs',
  adductors: 'Legs',
  abdominals: 'Core',
};

/**
 * Weighting for volume/heatmap attribution: primary muscles get full credit,
 * secondary (assisting) muscles get partial credit so e.g. a deadlift counts
 * toward hamstrings without over-counting them.
 */
export const PRIMARY_WEIGHT = 1;
export const SECONDARY_WEIGHT = 0.5;

/** Body regions a set of primary muscles maps to, de-duped, order preserved. */
export function deriveBodyRegion(primaryMuscles: string[]): BodyRegion[] {
  const out: BodyRegion[] = [];
  for (const m of primaryMuscles) {
    const region = MUSCLE_TO_REGION[m];
    if (region && !out.includes(region)) out.push(region);
  }
  return out;
}
