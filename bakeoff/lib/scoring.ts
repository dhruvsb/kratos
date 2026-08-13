/**
 * Scoring for the bakeoff.
 *
 * `scoreTranscript` measures ASR quality against an optional reference: standard
 * WER plus a Numeric Entity Error Rate (NEER) computed by aligning the numeric
 * ENTITY sequences of reference and hypothesis and counting sub/del/ins.
 *
 * `scoreEndToEnd` measures the whole audio→ASR→pipeline path against DATABASE-
 * semantic ground truth: it reconstructs predicted exercises + their sets from
 * the pipeline's ParseResult and aligns them in order to the ground truth.
 */
import type {
  GroundTruth,
  TranscriptScore,
  E2EScore,
  NumericConfusion,
  RoutineScore,
} from '../types.ts';
import type { ParseResult } from '../../supabase/functions/_shared/parse-types.ts';
import { WEIGHT_TOLERANCE_KG } from '../config.ts';
import { extractNumbers, normalizeWords } from './numbers.ts';
import { computeWer } from './wer.ts';

// ---------------------------------------------------------------------------
// Transcript scoring (ASR quality)
// ---------------------------------------------------------------------------

/**
 * Levenshtein alignment over two number arrays, returning edit counts and the
 * per-substitution (ref → hyp) pairs. Mirrors the WER DP but on numbers.
 */
function alignNumbers(
  ref: number[],
  hyp: number[]
): { sub: number; del: number; ins: number; subPairs: Array<[number, number]> } {
  const n = ref.length;
  const m = hyp.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j - 1] + cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }

  let sub = 0;
  let del = 0;
  let ins = 0;
  const subPairs: Array<[number, number]> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        if (cost === 1) {
          sub++;
          subPairs.push([ref[i - 1], hyp[j - 1]]);
        }
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      del++;
      i--;
      continue;
    }
    ins++;
    j--;
  }
  return { sub, del, ins, subPairs };
}

/** Aggregate equal (ref,hyp) substitution pairs into counted confusions, desc. */
function aggregateConfusions(pairs: Array<[number, number]>): NumericConfusion[] {
  const byKey = new Map<string, NumericConfusion>();
  for (const [ref, hyp] of pairs) {
    const key = `${ref}=>${hyp}`;
    const existing = byKey.get(key);
    if (existing) existing.count++;
    else byKey.set(key, { ref, hyp, count: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

export function scoreTranscript(
  reference: string | undefined,
  hypothesis: string
): TranscriptScore {
  if (reference === undefined || reference.trim() === '') {
    return {
      hasReference: false,
      wer: null,
      werSub: 0,
      werDel: 0,
      werIns: 0,
      refWords: 0,
      neer: null,
      numRefEntities: 0,
      numSub: 0,
      numDel: 0,
      numIns: 0,
      confusions: [],
    };
  }

  const { wer, sub, del, ins, refLen } = computeWer(
    normalizeWords(reference),
    normalizeWords(hypothesis)
  );

  const refNums = extractNumbers(reference);
  const hypNums = extractNumbers(hypothesis);
  const numAlign = alignNumbers(refNums, hypNums);
  const numRefEntities = refNums.length;
  const neer =
    numRefEntities === 0
      ? 0
      : (numAlign.sub + numAlign.del + numAlign.ins) / numRefEntities;

  return {
    hasReference: true,
    wer,
    werSub: sub,
    werDel: del,
    werIns: ins,
    refWords: refLen,
    neer,
    numRefEntities,
    numSub: numAlign.sub,
    numDel: numAlign.del,
    numIns: numAlign.ins,
    confusions: aggregateConfusions(numAlign.subPairs),
  };
}

// ---------------------------------------------------------------------------
// End-to-end scoring (structured output vs DB-semantic ground truth)
// ---------------------------------------------------------------------------

interface PredictedSet {
  weight_kg: number | null;
  reps: number | null;
}

interface PredictedExercise {
  name: string;
  norm: string;
  sets: PredictedSet[];
}

/** Case-insensitive, whitespace/hyphen-insensitive name key. */
export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[-\s]+/g, ' ');
}

/**
 * Expand ParseResult entries into predicted exercises: each entry yields
 * `sets_count` identical sets, and consecutive entries resolving to the same
 * exercise are merged into one exercise with a concatenated set list.
 */
function buildPredictedExercises(result: ParseResult): PredictedExercise[] {
  const out: PredictedExercise[] = [];
  for (const entry of result.entries) {
    const name = entry.exercise.name ?? entry.exercise.raw;
    const norm = normalizeName(name);
    const count = Math.max(1, entry.sets_count);
    const sets: PredictedSet[] = [];
    for (let k = 0; k < count; k++) {
      sets.push({ weight_kg: entry.weight_kg, reps: entry.reps });
    }
    const last = out[out.length - 1];
    if (last && last.norm === norm) {
      last.sets.push(...sets);
    } else {
      out.push({ name, norm, sets });
    }
  }
  return out;
}

/**
 * Order-preserving matching of ground-truth to predicted exercises by name.
 * LCS over the normalized-name sequences → maximal in-order aligned pairs.
 */
export function alignExercises(
  gtNorms: string[],
  predNorms: string[]
): Array<[number, number]> {
  const n = gtNorms.length;
  const m = predNorms.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        gtNorms[i - 1] === predNorms[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (gtNorms[i - 1] === predNorms[j - 1]) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return pairs.reverse();
}

function weightsMatch(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= WEIGHT_TOLERANCE_KG;
}

function fmtWeight(w: number | null): string {
  return w === null ? 'bodyweight' : String(w);
}

export function scoreEndToEnd(gt: GroundTruth, result: ParseResult): E2EScore {
  const predicted = buildPredictedExercises(result);
  const gtNorms = gt.exercises.map((e) => normalizeName(e.name));
  const predNorms = predicted.map((e) => e.norm);
  const pairs = alignExercises(gtNorms, predNorms);

  const matchedGt = new Set<number>(pairs.map(([g]) => g));
  const matchedPred = new Set<number>(pairs.map(([, p]) => p));

  const diffs: string[] = [];

  // Intent: map gt 'log_workout' → pipeline 'log_sets'.
  const mappedIntent = gt.intent === 'log_workout' ? 'log_sets' : gt.intent;
  const intentMatch = mappedIntent === result.intent;
  if (!intentMatch) {
    diffs.push(`intent: expected ${mappedIntent} got ${result.intent}`);
  }

  let weightFieldsTotal = 0;
  let weightFieldsCorrect = 0;
  let repFieldsTotal = 0;
  let repFieldsCorrect = 0;
  let setCountTotal = 0;
  let setCountCorrect = 0;
  const exercisesResolvedCorrect = pairs.length; // every aligned pair matched by name

  for (const [gi, pi] of pairs) {
    const gtEx = gt.exercises[gi];
    const predEx = predicted[pi];

    setCountTotal++;
    if (gtEx.sets.length === predEx.sets.length) {
      setCountCorrect++;
    } else {
      diffs.push(
        `set count: ${gtEx.name} expected ${gtEx.sets.length} got ${predEx.sets.length}`
      );
    }

    const commonLen = Math.min(gtEx.sets.length, predEx.sets.length);
    for (let k = 0; k < commonLen; k++) {
      const gtSet = gtEx.sets[k];
      const predSet = predEx.sets[k];

      weightFieldsTotal++;
      if (weightsMatch(gtSet.weight_kg, predSet.weight_kg)) {
        weightFieldsCorrect++;
      } else {
        diffs.push(
          `${gtEx.name} set ${k + 1}: weight ${fmtWeight(gtSet.weight_kg)} ≠ ${fmtWeight(predSet.weight_kg)}`
        );
      }

      repFieldsTotal++;
      if (gtSet.reps === predSet.reps) {
        repFieldsCorrect++;
      } else {
        diffs.push(
          `${gtEx.name} set ${k + 1}: reps ${gtSet.reps} ≠ ${predSet.reps ?? 'null'}`
        );
      }
    }
  }

  // Omissions (gt exercise unmatched) and spurious (predicted unmatched).
  let omissions = 0;
  for (let g = 0; g < gt.exercises.length; g++) {
    if (!matchedGt.has(g)) {
      omissions++;
      diffs.push(`OMISSION: ${gt.exercises[g].name}`);
    }
  }
  let spurious = 0;
  for (let p = 0; p < predicted.length; p++) {
    if (!matchedPred.has(p)) {
      spurious++;
      diffs.push(`SPURIOUS: ${predicted[p].name}`);
    }
  }

  const exercisesTotal = gt.exercises.length;
  const clarifications = result.ambiguities.length;

  const workoutExactMatch =
    intentMatch &&
    omissions === 0 &&
    spurious === 0 &&
    pairs.length === gt.exercises.length &&
    setCountTotal === setCountCorrect &&
    weightFieldsTotal === weightFieldsCorrect &&
    repFieldsTotal === repFieldsCorrect;

  return {
    workoutExactMatch,
    intentMatch,
    weightFieldsTotal,
    weightFieldsCorrect,
    repFieldsTotal,
    repFieldsCorrect,
    exercisesTotal,
    exercisesResolvedCorrect,
    setCountTotal,
    setCountCorrect,
    omissions,
    spurious,
    clarifications,
    diffs,
  };
}

// ---------------------------------------------------------------------------
// Routine-creation scoring (BAKEOFF-ONLY — see lib/routine-prompt.ts: the
// shipped app has no create_routine pipeline, so this scores a prototype).
// ---------------------------------------------------------------------------

/**
 * `resolvedNames[i]` is the real resolver's canonical name for
 * `mentions[i]`, or null when resolveExercise returned 'unmatched'.
 */
export function scoreRoutineCreation(
  gt: GroundTruth,
  routineName: string | null,
  resolvedNames: Array<string | null>
): RoutineScore {
  const diffs: string[] = [];

  const routineNameMatch =
    gt.routine == null || normalizeName(routineName ?? '') === normalizeName(gt.routine);
  if (!routineNameMatch) {
    diffs.push(`routine name: expected "${gt.routine}" got "${routineName ?? 'null'}"`);
  }

  const gtNorms = gt.routine_exercises.map((n) => normalizeName(n));
  // Unmatched mentions get a per-index sentinel so they never spuriously align.
  const predNorms = resolvedNames.map((n, i) => (n ? normalizeName(n) : `__unmatched_${i}__`));
  const pairs = alignExercises(gtNorms, predNorms);

  const matchedGt = new Set(pairs.map(([g]) => g));
  const matchedPred = new Set(pairs.map(([, p]) => p));

  let omissions = 0;
  for (let g = 0; g < gt.routine_exercises.length; g++) {
    if (!matchedGt.has(g)) {
      omissions++;
      diffs.push(`OMISSION: ${gt.routine_exercises[g]}`);
    }
  }
  let spurious = 0;
  for (let p = 0; p < resolvedNames.length; p++) {
    if (!matchedPred.has(p) && resolvedNames[p]) {
      spurious++;
      diffs.push(`SPURIOUS: ${resolvedNames[p]}`);
    }
  }
  const unresolvedCount = resolvedNames.filter((n) => n === null).length;
  if (unresolvedCount) diffs.push(`${unresolvedCount} mention(s) unmatched by the resolver`);

  const exercisesTotal = gt.routine_exercises.length;
  const exercisesResolvedCorrect = pairs.length;

  const routineExactMatch =
    routineNameMatch &&
    omissions === 0 &&
    spurious === 0 &&
    unresolvedCount === 0 &&
    pairs.length === exercisesTotal;

  return {
    routineNameMatch,
    exercisesTotal,
    exercisesResolvedCorrect,
    omissions,
    spurious,
    unresolvedCount,
    routineExactMatch,
    diffs,
  };
}
