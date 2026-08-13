/**
 * `transcribe` — run every configured ASR provider over every recording and
 * cache the results. Idempotent: a given (audio, provider, language, keyterms)
 * combination is transcribed once and re-read from cache on later runs (use
 * --fresh to force re-transcription).
 *
 *   npx tsx bakeoff/commands/transcribe.ts
 *   npx tsx bakeoff/commands/transcribe.ts --providers openai,deepgram --fresh
 */
import '../lib/env.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from '../config.ts';
import { ensureDirs, pairAll } from '../lib/paths.ts';
import { sha256File } from '../lib/audio.ts';
import { cacheKey, readCache, writeCache } from '../lib/cache.ts';
import { getProviders } from '../providers/registry.ts';
import type { AsrResult } from '../types.ts';
import {
  bakeoffContextFor,
  loadAllExerciseNames,
  parseCommonFlags,
  type CommonFlags,
} from './_util.ts';

export interface ProviderRun {
  providerId: string;
  model: string;
  transcript: string;
  alternatives?: string[];
  confidence?: number | null;
  latency_ms: number;
  skipped?: string;
  error?: string;
  cached: boolean;
}

export interface PairTranscripts {
  audio: string;
  gtPath: string;
  runs: ProviderRun[];
}

export interface TranscribeOutput {
  generatedAt: string;
  language: string;
  keytermPolicy: string;
  pairs: PairTranscripts[];
}

const TRANSCRIPTS_JSON = path.join(PATHS.reports, '_transcripts.json');

export async function runTranscribe(flags: CommonFlags): Promise<TranscribeOutput> {
  ensureDirs();
  const { pairs, orphanAudio, orphanGt } = pairAll();

  if (orphanAudio.length)
    console.warn(`⚠ ${orphanAudio.length} recording(s) with no ground truth (skipped): ${orphanAudio.map((p) => path.basename(p)).join(', ')}`);
  if (orphanGt.length)
    console.warn(`⚠ ${orphanGt.length} ground-truth file(s) with a missing audio file: ${orphanGt.join(', ')}`);
  if (!pairs.length) {
    console.error('No paired recordings found. Add audio to bakeoff/recordings/ and a matching JSON to bakeoff/ground-truth/ (see README).');
    return { generatedAt: new Date().toISOString(), language: flags.language, keytermPolicy: flags.keyterms, pairs: [] };
  }

  const providers = getProviders(flags.providers);
  const configured = providers.filter((p) => p.configured());
  const notConfigured = providers.filter((p) => !p.configured());
  if (notConfigured.length)
    console.warn(`⚠ not configured (skipped): ${notConfigured.map((p) => p.id).join(', ')} — run \`doctor\` to see which keys are missing.`);
  if (!configured.length) {
    console.error('No configured ASR providers. Add at least one vendor key (see README / doctor).');
    return { generatedAt: new Date().toISOString(), language: flags.language, keytermPolicy: flags.keyterms, pairs: [] };
  }

  const allNames = flags.keyterms === 'library' ? await loadAllExerciseNames() : [];

  const out: PairTranscripts[] = [];
  for (const pair of pairs) {
    const audioSha = sha256File(pair.audioPath);
    const ctx = bakeoffContextFor(pair.gt, flags.keyterms, allNames, flags.language);
    const keytermSig = ctx.keyterms.slice().sort().join(',');
    console.log(`\n▶ ${pair.audio}`);
    const runs: ProviderRun[] = [];
    for (const provider of configured) {
      // provider.model MUST be in the key — otherwise switching a
      // BAKEOFF_*_MODEL override silently replays the old model's transcripts.
      const key = cacheKey([
        provider.id,
        provider.model,
        audioSha,
        flags.language,
        flags.keyterms,
        keytermSig,
      ]);
      let result: AsrResult | null = flags.fresh ? null : readCache<AsrResult>(key);
      const cached = !!result;
      if (!result) {
        process.stdout.write(`   ${provider.id} … `);
        result = await provider.transcribe({ audioPath: pair.audioPath, context: ctx });
        writeCache(key, result);
        if (result.skipped) console.log(`skipped (${result.skipped})`);
        else if (result.error) console.log(`error (${result.error})`);
        else console.log(`${result.latency_ms}ms`);
      } else {
        console.log(`   ${provider.id} … cached`);
      }
      runs.push({
        providerId: result.providerId,
        model: result.model,
        transcript: result.transcript,
        alternatives: result.alternatives,
        confidence: result.confidence,
        latency_ms: result.latency_ms,
        skipped: result.skipped,
        error: result.error,
        cached,
      });
    }
    out.push({ audio: pair.audio, gtPath: pair.gtPath, runs });
  }

  const output: TranscribeOutput = {
    generatedAt: new Date().toISOString(),
    language: flags.language,
    keytermPolicy: flags.keyterms,
    pairs: out,
  };
  writeFileSync(TRANSCRIPTS_JSON, JSON.stringify(output, null, 2));
  console.log(`\n✓ transcripts written to ${path.relative(process.cwd(), TRANSCRIPTS_JSON)}`);
  return output;
}

export function loadLastTranscripts(): TranscribeOutput {
  return JSON.parse(readFileSync(TRANSCRIPTS_JSON, 'utf8')) as TranscribeOutput;
}

if (require.main === module) {
  runTranscribe(parseCommonFlags(process.argv.slice(2))).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
