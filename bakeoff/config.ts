/**
 * Bakeoff configuration — paths, tunables, and the default language/keyterm
 * policy. Provider endpoints/models live in each adapter under providers/.
 */
import path from 'node:path';

export const ROOT = path.resolve(__dirname);
export const REPO_ROOT = path.resolve(__dirname, '..');

export const PATHS = {
  recordings: path.join(ROOT, 'recordings'),
  groundTruth: path.join(ROOT, 'ground-truth'),
  cache: path.join(ROOT, 'cache'),
  reports: path.join(ROOT, 'reports'),
};

/**
 * Language hint sent to providers that accept one. The research is explicit
 * that en-IN is NOT universally better than en-US for Indian-accented English
 * (it helped Google, hurt Azure historically) — so this is A/B-able: run the
 * bakeoff once with each and compare. Default en-IN because you're the speaker.
 */
export const DEFAULT_LANGUAGE = process.env.BAKEOFF_LANG || 'en-IN';

/**
 * Keyterm policy. 'routine' injects only the ground-truth exercise names (+ a
 * few neighbors) — matches production, where the routine is known. 'none'
 * measures raw ASR. 'library' floods all names (the research warns this can
 * ADD substitutions — measure it, don't assume it helps).
 */
export type KeytermPolicy = 'routine' | 'none' | 'library';
export const DEFAULT_KEYTERM_POLICY: KeytermPolicy = 'routine';

/** Extra highly-confusable neighbors to add under the 'routine' policy. */
export const NEIGHBOR_KEYTERMS = 5;

/** Rounding tolerance (kg) when comparing a parsed weight to ground truth. */
export const WEIGHT_TOLERANCE_KG = 0.01;

/**
 * The numeric minimal-pairs the research calls out as the danger class. The
 * scorer highlights any confusion that falls in this set in the report so you
 * can see at a glance whether a provider is making the expensive mistakes.
 */
export const DANGER_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [13, 30],
  [14, 40],
  [15, 50],
  [16, 60],
  [17, 70],
  [18, 80],
  [19, 90],
];
