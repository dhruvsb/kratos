/**
 * `score` — turn cached transcripts into the two comparison tables:
 *   1. ASR quality   (WER + Numeric-Entity Error Rate + danger-pair confusions)
 *   2. End-to-end     (audio → ASR → the REAL parse pipeline → structured rows,
 *                      scored vs database-semantic ground truth: workout
 *                      exact-match, weight/rep/exercise/set-count accuracy)
 *
 *   npx tsx bakeoff/commands/score.ts            # scores the last transcribe run
 *   npx tsx bakeoff/commands/score.ts --no-e2e   # ASR-quality table only (fast/free)
 *
 * End-to-end scoring calls OpenAI once per (provider, recording) using the SAME
 * pipeline the app ships (supabase/functions/_shared/pipeline). The only thing
 * that varies across E2E columns is which ASR produced the transcript, so the
 * table isolates "which ASR makes the final rows correct" — the metric that
 * actually matters, not WER.
 */
import '../lib/env.ts';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import {
  DANGER_PAIRS,
  type KeytermPolicy,
} from '../config.ts';
import { loadGroundTruthFiles } from '../lib/paths.ts';
import { scoreEndToEnd, scoreRoutineCreation, scoreTranscript } from '../lib/scoring.ts';
import { mdTable, pct, fileTimestamp, writeReport } from '../lib/report.ts';
import { loadCatalog } from '../lib/catalog.ts';
import { extractRoutine } from '../lib/routine-extraction.ts';
import type {
  E2EScore,
  GroundTruth,
  NumericConfusion,
  RoutineScore,
  TranscriptScore,
} from '../types.ts';
import { parseContextSchema } from '../../supabase/functions/_shared/parse-types.ts';
import { parseUtterance } from '../../supabase/functions/_shared/pipeline/pipeline.ts';
import { resolveExercise } from '../../supabase/functions/_shared/pipeline/resolution.ts';
import { OpenAiLlm } from '../../supabase/functions/_shared/pipeline/llm.ts';
import { PARSE_MODEL_DEFAULT, costUsd } from '../../supabase/functions/_shared/pipeline/prices.ts';
import {
  parseCommonFlags,
  type CommonFlags,
} from './_util.ts';
import { loadLastTranscripts, type TranscribeOutput } from './transcribe.ts';

interface AsrAgg {
  providerId: string;
  model: string;
  files: number;
  errors: number;
  werSum: number;
  werN: number;
  neerSum: number;
  neerN: number;
  latencySum: number;
  latencyN: number;
  dangerSubs: number;
  confusions: Map<string, NumericConfusion>;
}

interface E2EAgg {
  providerId: string;
  model: string;
  files: number;
  emCount: number;
  intentCount: number;
  wTot: number;
  wOk: number;
  rTot: number;
  rOk: number;
  exTot: number;
  exOk: number;
  scTot: number;
  scOk: number;
  omissions: number;
  spurious: number;
  clarifications: number;
  extractionCostUsd: number;
  /** Files that threw during parse — MUST surface, else % hides a broken run. */
  failed: number;
  worst: Array<{ audio: string; diffs: string[] }>;
}

/** BAKEOFF-ONLY prototype scoring — see lib/routine-prompt.ts. */
interface RoutineAgg {
  providerId: string;
  model: string;
  files: number;
  failed: number;
  emCount: number;
  nameMatchCount: number;
  exTot: number;
  exOk: number;
  omissions: number;
  spurious: number;
  unresolved: number;
  costUsd: number;
  worst: Array<{ audio: string; diffs: string[] }>;
}

function isDangerPair(a: number, b: number): boolean {
  return DANGER_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export async function runScore(flags: CommonFlags): Promise<void> {
  let transcripts: TranscribeOutput;
  try {
    transcripts = loadLastTranscripts();
  } catch {
    console.error('No transcripts found — run `transcribe` (or `run`) first.');
    process.exit(1);
    return;
  }

  const gtByAudio = new Map<string, GroundTruth>();
  for (const { gt } of loadGroundTruthFiles()) gtByAudio.set(gt.audio, gt);

  // ---- 1. ASR quality -----------------------------------------------------
  const asr = new Map<string, AsrAgg>();
  for (const pair of transcripts.pairs) {
    const gt = gtByAudio.get(pair.audio);
    for (const run of pair.runs) {
      if (run.skipped) continue;
      const agg =
        asr.get(run.providerId) ??
        ({
          providerId: run.providerId,
          model: run.model,
          files: 0,
          errors: 0,
          werSum: 0,
          werN: 0,
          neerSum: 0,
          neerN: 0,
          latencySum: 0,
          latencyN: 0,
          dangerSubs: 0,
          confusions: new Map(),
        } satisfies AsrAgg);
      agg.files++;
      if (run.error) {
        agg.errors++;
        asr.set(run.providerId, agg);
        continue;
      }
      agg.latencySum += run.latency_ms;
      agg.latencyN++;
      const ts: TranscriptScore = scoreTranscript(gt?.reference_transcript, run.transcript);
      if (ts.wer != null) {
        agg.werSum += ts.wer;
        agg.werN++;
      }
      if (ts.neer != null) {
        agg.neerSum += ts.neer;
        agg.neerN++;
      }
      for (const c of ts.confusions) {
        if (isDangerPair(c.ref, c.hyp)) agg.dangerSubs += c.count;
        const k = `${c.ref}->${c.hyp}`;
        const prev = agg.confusions.get(k);
        if (prev) prev.count += c.count;
        else agg.confusions.set(k, { ...c });
      }
      asr.set(run.providerId, agg);
    }
  }

  // ---- 2. End-to-end (log_workout) + 2b. Routine creation (create_routine) --
  const e2e = new Map<string, E2EAgg>();
  const routine = new Map<string, RoutineAgg>();
  let catalogSource = 'n/a';
  if (flags.e2e) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('⚠ OPENAI_API_KEY missing — skipping the end-to-end stage (ASR-quality table only).');
      flags.e2e = false;
    } else {
      const { catalog, source } = await loadCatalog({ fixture: flags.fixture });
      catalogSource = source;
      const llm = new OpenAiLlm(PARSE_MODEL_DEFAULT, apiKey);
      const ctx = parseContextSchema.parse({ default_unit: 'kg' });
      console.log(`\nRunning end-to-end parse (${PARSE_MODEL_DEFAULT}, catalog: ${source}) …`);
      for (const pair of transcripts.pairs) {
        const gt = gtByAudio.get(pair.audio);
        if (!gt) continue;
        for (const run of pair.runs) {
          if (run.skipped || run.error || !run.transcript.trim()) continue;

          if (gt.intent === 'create_routine') {
            const agg =
              routine.get(run.providerId) ??
              ({
                providerId: run.providerId,
                model: run.model,
                files: 0,
                emCount: 0,
                nameMatchCount: 0,
                failed: 0,
                exTot: 0,
                exOk: 0,
                omissions: 0,
                spurious: 0,
                unresolved: 0,
                costUsd: 0,
                worst: [],
              } satisfies RoutineAgg);
            try {
              const { extraction, usage } = await extractRoutine(llm, run.transcript);
              let cost = costUsd(llm.model, usage.inputTokens, usage.outputTokens);
              const resolvedNames: Array<string | null> = [];
              for (const mention of extraction.exercise_mentions) {
                const { exercise, usage: resUsage } = await resolveExercise(mention, ctx, catalog, llm);
                if (resUsage) cost += costUsd(llm.model, resUsage.inputTokens, resUsage.outputTokens);
                resolvedNames.push(exercise.name);
              }
              const s: RoutineScore = scoreRoutineCreation(gt, extraction.routine_name, resolvedNames);
              agg.files++;
              if (s.routineExactMatch) agg.emCount++;
              if (s.routineNameMatch) agg.nameMatchCount++;
              agg.exTot += s.exercisesTotal;
              agg.exOk += s.exercisesResolvedCorrect;
              agg.omissions += s.omissions;
              agg.spurious += s.spurious;
              agg.unresolved += s.unresolvedCount;
              agg.costUsd += cost;
              if (!s.routineExactMatch && agg.worst.length < 12)
                agg.worst.push({ audio: pair.audio, diffs: s.diffs });
            } catch (err) {
              agg.failed++;
              console.warn(`   ${run.providerId} / ${pair.audio}: routine-extraction error — ${(err as Error).message}`);
            }
            routine.set(run.providerId, agg);
            continue;
          }

          const agg =
            e2e.get(run.providerId) ??
            ({
              providerId: run.providerId,
              model: run.model,
              files: 0,
              emCount: 0,
              intentCount: 0,
              failed: 0,
              wTot: 0,
              wOk: 0,
              rTot: 0,
              rOk: 0,
              exTot: 0,
              exOk: 0,
              scTot: 0,
              scOk: 0,
              omissions: 0,
              spurious: 0,
              clarifications: 0,
              extractionCostUsd: 0,
              worst: [],
            } satisfies E2EAgg);
          try {
            const { result, telemetry } = await parseUtterance(run.transcript, ctx, { llm, catalog });
            const s: E2EScore = scoreEndToEnd(gt, result);
            agg.files++;
            if (s.workoutExactMatch) agg.emCount++;
            if (s.intentMatch) agg.intentCount++;
            agg.wTot += s.weightFieldsTotal;
            agg.wOk += s.weightFieldsCorrect;
            agg.rTot += s.repFieldsTotal;
            agg.rOk += s.repFieldsCorrect;
            agg.exTot += s.exercisesTotal;
            agg.exOk += s.exercisesResolvedCorrect;
            agg.scTot += s.setCountTotal;
            agg.scOk += s.setCountCorrect;
            agg.omissions += s.omissions;
            agg.spurious += s.spurious;
            agg.clarifications += s.clarifications;
            agg.extractionCostUsd += telemetry.cost_usd;
            if (!s.workoutExactMatch && agg.worst.length < 12)
              agg.worst.push({ audio: pair.audio, diffs: s.diffs });
          } catch (err) {
            agg.failed++;
            console.warn(`   ${run.providerId} / ${pair.audio}: parse error — ${(err as Error).message}`);
          }
          e2e.set(run.providerId, agg);
        }
      }
    }
  }

  // ---- Report -------------------------------------------------------------
  const md = renderReport(transcripts, asr, e2e, routine, flags, catalogSource);
  const stamp = fileTimestamp(new Date().toISOString());
  const { mdPath } = writeReport(
    `bakeoff-${stamp}`,
    md,
    {
      transcripts: transcripts.generatedAt,
      asr: [...asr.values()].map(serializeAsr),
      e2e: [...e2e.values()],
      routine: [...routine.values()],
    }
  );
  console.log('\n' + md);
  console.log(`\n✓ report written to ${path.relative(process.cwd(), mdPath)}`);
}

function serializeAsr(a: AsrAgg) {
  return {
    providerId: a.providerId,
    model: a.model,
    files: a.files,
    errors: a.errors,
    wer: a.werN ? a.werSum / a.werN : null,
    neer: a.neerN ? a.neerSum / a.neerN : null,
    dangerSubs: a.dangerSubs,
    confusions: [...a.confusions.values()].sort((x, y) => y.count - x.count),
  };
}

function renderReport(
  t: TranscribeOutput,
  asr: Map<string, AsrAgg>,
  e2e: Map<string, E2EAgg>,
  routine: Map<string, RoutineAgg>,
  flags: CommonFlags,
  catalogSource: string
): string {
  const lines: string[] = [];
  lines.push('# Voice-model bakeoff report', '');
  lines.push(
    `- transcripts generated: \`${t.generatedAt}\``,
    `- language: \`${t.language}\`  ·  keyterm policy: \`${t.keytermPolicy}\`  ·  E2E catalog: \`${catalogSource}\``,
    `- recordings scored: **${t.pairs.length}**`,
    ''
  );

  lines.push('## 1. ASR quality  (transcript vs reference)', '');
  lines.push(
    '_WER and NEER need a `reference_transcript` in ground truth; rows without one show n/a. NEER (Numeric-Entity Error Rate) is the number that matters here — a weight heard wrong is far worse than a dropped article. **Danger subs** counts 13/30, 15/50-class confusions._',
    ''
  );
  const asrRows = [...asr.values()]
    .sort((a, b) => (a.neerN ? a.neerSum / a.neerN : 1) - (b.neerN ? b.neerSum / b.neerN : 1))
    .map((a) => [
      a.providerId,
      a.model,
      a.files,
      a.errors || '',
      a.werN ? pct(a.werSum / a.werN, 1) : 'n/a',
      a.neerN ? pct(a.neerSum / a.neerN, 1) : 'n/a',
      a.dangerSubs || '',
      a.latencyN ? Math.round(a.latencySum / a.latencyN) + 'ms' : 'n/a',
    ]);
  lines.push(
    asrRows.length
      ? mdTable(['provider', 'model', 'files', 'errs', 'WER', 'NEER', 'danger subs', 'avg latency'], asrRows)
      : '_no successful transcriptions_',
    ''
  );

  // Confusion hotspots
  const hot: string[] = [];
  for (const a of asr.values()) {
    const top = [...a.confusions.values()].sort((x, y) => y.count - x.count).slice(0, 6);
    if (top.length) hot.push(`- **${a.providerId}**: ` + top.map((c) => `\`${c.ref}→${c.hyp}\`×${c.count}`).join('  '));
  }
  if (hot.length) lines.push('### Numeric confusion hotspots', '', ...hot, '');

  if (flags.e2e) {
    lines.push('## 2. End-to-end  (audio → ASR → pipeline → rows vs ground truth)', '');
    lines.push(
      '_This is the product metric. **Workout EM** = the whole workout landed correct with zero edits needed. Weight/rep/exercise/set-count are per-field accuracy. Clarif/wkout = questions the pipeline would ask._',
      ''
    );
    const e2eRows = [...e2e.values()]
      .sort((a, b) => b.emCount / (b.files || 1) - a.emCount / (a.files || 1))
      .map((a) => [
        a.providerId,
        a.files,
        a.failed || '',
        pct(a.emCount, a.files),
        pct(a.wOk, a.wTot),
        pct(a.rOk, a.rTot),
        pct(a.exOk, a.exTot),
        pct(a.scOk, a.scTot),
        a.files ? (a.clarifications / a.files).toFixed(1) : '0',
        a.omissions || '',
        '$' + a.extractionCostUsd.toFixed(4),
      ]);
    lines.push(
      e2eRows.length
        ? mdTable(
            ['provider', 'scored', 'FAILED', 'workout EM', 'weight acc', 'rep acc', 'exercise acc', 'setcount acc', 'clarif/wkout', 'omissions', 'LLM cost'],
            e2eRows
          )
        : '_end-to-end stage did not run_',
      ''
    );

    // Worst-case diffs
    const details: string[] = [];
    for (const a of e2e.values()) {
      if (!a.worst.length) continue;
      details.push(`### ${a.providerId} — failed workouts`, '');
      for (const w of a.worst) {
        details.push(`- **${w.audio}**`);
        for (const d of w.diffs.slice(0, 8)) details.push(`  - ${d}`);
      }
      details.push('');
    }
    if (details.length) lines.push('### End-to-end failure detail', '', ...details);
  }

  if (routine.size) {
    lines.push('## 3. Routine creation 🧪 (BAKEOFF-ONLY prototype — not shipped in the app)', '');
    lines.push(
      '_The app has no routine-creation pipeline yet (`intentSchema` is only `log_sets` / `correct_last` / `unknown`). This scores a bakeoff-local extraction prompt (`lib/routine-prompt.ts`) that reuses the REAL exercise resolver (`resolveExercise` — exact/fuzzy/LLM-pick-from-candidates, never free-generates), so exercise-name-resolution accuracy is trustworthy; the surrounding extraction step is a preview, not production behavior._',
      ''
    );
    const routineRows = [...routine.values()]
      .sort((a, b) => b.emCount / (b.files || 1) - a.emCount / (a.files || 1))
      .map((a) => [
        a.providerId,
        a.files,
        a.failed || '',
        pct(a.emCount, a.files),
        pct(a.exOk, a.exTot),
        pct(a.nameMatchCount, a.files),
        a.unresolved || '',
        a.omissions || '',
        a.spurious || '',
        '$' + a.costUsd.toFixed(4),
      ]);
    lines.push(
      mdTable(
        ['provider', 'scored', 'FAILED', 'routine EM', 'exercise resolve acc', 'routine-name match', 'unresolved', 'omissions', 'spurious', 'LLM cost'],
        routineRows
      ),
      ''
    );

    const routineDetails: string[] = [];
    for (const a of routine.values()) {
      if (!a.worst.length) continue;
      routineDetails.push(`### ${a.providerId} — failed routines`, '');
      for (const w of a.worst) {
        routineDetails.push(`- **${w.audio}**`);
        for (const d of w.diffs.slice(0, 8)) routineDetails.push(`  - ${d}`);
      }
      routineDetails.push('');
    }
    if (routineDetails.length) lines.push('### Routine-creation failure detail', '', ...routineDetails);
  }

  const totalFailed =
    [...e2e.values()].reduce((n, a) => n + a.failed, 0) +
    [...routine.values()].reduce((n, a) => n + a.failed, 0);
  if (totalFailed > 0) {
    lines.push(
      '',
      `> ⚠️ **${totalFailed} file(s) threw during scoring and are EXCLUDED from every percentage above.**`,
      '> The percentages are over the *scored* column, not the whole corpus — treat them as',
      '> provisional until `FAILED` is 0. Scroll up in the console for the per-file errors.',
      ''
    );
  }

  lines.push('---', '', '_Reminder: 20–30 recordings choose the architecture; they do not prove a sub-0.5% error rate. Keep accumulating real dictations. WER is diagnostic only — rank on NEER and Workout EM._');
  return lines.join('\n');
}

if (require.main === module) {
  runScore(parseCommonFlags(process.argv.slice(2))).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
