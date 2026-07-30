// Per-workout muscle split (Hevy-style %). Pure: derived entirely from the
// exercise metadata already loaded with a workout, so it needs no extra query.
//
// Each set adds full weight to every body region its exercise's PRIMARY muscles
// map to, and half weight to the regions its SECONDARY muscles map to (the
// PRIMARY/SECONDARY factors from muscles.ts). Regions are then normalized to a
// share of the whole. Matches Hevy's "Muscle Split" (e.g. Chest 57% · Arms 21%
// · Shoulders 21%): primary counts fully, assisting muscles count at ~0.5.
import {
  BODY_REGIONS,
  MUSCLE_TO_REGION,
  PRIMARY_WEIGHT,
  SECONDARY_WEIGHT,
  type BodyRegion,
} from './muscles';

export type RegionShare = {
  region: BodyRegion;
  /** Weighted set contribution (primary sets + half of secondary sets). */
  weight: number;
  /** Share of the weighted total across all regions, 0–1. */
  fraction: number;
};

/** One entry per exercise in the workout, with how many sets it logged. */
export type SplitInput = {
  primaryMuscles: string[];
  secondaryMuscles: string[];
  setCount: number;
};

/** Body-region shares for a workout, heaviest first, empty regions dropped. */
export function muscleSplit(items: SplitInput[]): RegionShare[] {
  const tally: Record<BodyRegion, number> = Object.fromEntries(
    BODY_REGIONS.map((r) => [r, 0])
  ) as Record<BodyRegion, number>;

  for (const it of items) {
    if (it.setCount <= 0) continue;
    add(tally, it.primaryMuscles, it.setCount * PRIMARY_WEIGHT);
    add(tally, it.secondaryMuscles, it.setCount * SECONDARY_WEIGHT);
  }

  const total = BODY_REGIONS.reduce((sum, r) => sum + tally[r], 0);
  return BODY_REGIONS.map((region) => ({
    region,
    weight: tally[region],
    fraction: total > 0 ? tally[region] / total : 0,
  }))
    .filter((r) => r.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

function add(tally: Record<BodyRegion, number>, muscles: string[], weight: number): void {
  for (const m of muscles) {
    const region = MUSCLE_TO_REGION[m];
    if (region) tally[region] += weight;
  }
}
