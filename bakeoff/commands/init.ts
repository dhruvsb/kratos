/**
 * `init` — scaffold a ground-truth JSON stub for every recording that doesn't
 * have one yet, so you only ever fill in the answers, never the structure.
 *
 *   npx tsx bakeoff/commands/init.ts            # empty stubs
 *   npx tsx bakeoff/commands/init.ts --draft    # also auto-transcribe a DRAFT
 *                                               # reference_transcript to correct
 *
 * A stub is authored at the database-semantic level: list the exercises and
 * their real sets (weight_kg / reps), because that — not the words — is what
 * the bakeoff scores. `weight_kg: null` means bodyweight.
 */
import '../lib/env.ts';
import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { PATHS } from '../config.ts';
import { ensureDirs, listRecordingFiles, loadGroundTruthFiles } from '../lib/paths.ts';
import { configuredProviders, getProviders } from '../providers/registry.ts';
import { DEFAULT_LANGUAGE } from '../config.ts';

function stubFor(audio: string, draftTranscript?: string) {
  return {
    audio,
    intent: 'log_workout',
    routine: null,
    ...(draftTranscript !== undefined ? { reference_transcript: draftTranscript } : { reference_transcript: '' }),
    exercises: [
      {
        name: 'REPLACE — canonical exercise name from your library',
        load_mode: 'external_load',
        sets: [
          { weight_kg: 0, reps: 0 },
        ],
      },
    ],
    meta: {
      environment: 'quiet_room',
      phone: 'close',
      speaker_state: 'rested',
      pace: 'natural',
      notes: '',
    },
  };
}

async function main() {
  ensureDirs();
  const draft = process.argv.includes('--draft');

  const haveGt = new Set(loadGroundTruthFiles().map((g) => g.gt.audio));
  const recordings = listRecordingFiles();
  const missing = recordings.filter((r) => !haveGt.has(path.basename(r)));

  if (!recordings.length) {
    console.log('No recordings yet. Drop audio files into bakeoff/recordings/ (wav/m4a/mp3), then re-run `init`.');
    return;
  }
  if (!missing.length) {
    console.log(`All ${recordings.length} recording(s) already have ground truth. Nothing to scaffold.`);
    return;
  }

  let drafter = draft ? (getProviders(['openai'])[0]?.configured() ? getProviders(['openai'])[0] : configuredProviders()[0]) : undefined;
  if (draft && !drafter) {
    console.warn('⚠ --draft requested but no ASR provider is configured; writing empty transcripts instead.');
    drafter = undefined;
  }

  for (const rec of missing) {
    const base = path.basename(rec);
    let draftText: string | undefined = draft ? '' : undefined;
    if (drafter) {
      process.stdout.write(`   drafting ${base} with ${drafter.id} … `);
      const r = await drafter.transcribe({ audioPath: rec, context: { keyterms: [], language: DEFAULT_LANGUAGE } });
      draftText = r.transcript || '';
      console.log(r.error ? `error (${r.error})` : r.skipped ? `skipped (${r.skipped})` : 'ok');
    }
    const outPath = path.join(PATHS.groundTruth, base.replace(/\.[^.]+$/, '') + '.json');
    if (existsSync(outPath)) continue;
    writeFileSync(outPath, JSON.stringify(stubFor(base, draftText), null, 2) + '\n');
    console.log(`   ✎ ${path.relative(process.cwd(), outPath)}`);
  }

  console.log(`\n✓ scaffolded ${missing.length} stub(s). Open them in bakeoff/ground-truth/ and fill in the real exercises/sets${draft ? ' and correct the draft transcript' : ''}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
