/**
 * Recording ↔ ground-truth pairing for the bakeoff corpus.
 * Audio lives in PATHS.recordings; one ground-truth JSON per recording in
 * PATHS.groundTruth references its audio file by name.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from '../config.ts';
import { groundTruthSchema, type GroundTruth } from '../types.ts';

export interface RecordingPair {
  audio: string; // audio filename (basename)
  audioPath: string; // absolute path to the audio file
  gt: GroundTruth;
  gtPath: string; // absolute path to the ground-truth JSON
}

const AUDIO_EXTS = new Set(['.wav', '.m4a', '.mp3', '.flac', '.ogg', '.webm']);

/** Create every bakeoff directory if missing. */
export function ensureDirs(): void {
  for (const dir of Object.values(PATHS)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** Absolute paths of the audio files in PATHS.recordings (ignoring 16k derivatives). */
export function listRecordingFiles(): string[] {
  if (!existsSync(PATHS.recordings)) return [];
  return readdirSync(PATHS.recordings)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => !name.endsWith('.16k.wav'))
    .filter((name) => AUDIO_EXTS.has(path.extname(name).toLowerCase()))
    .map((name) => path.join(PATHS.recordings, name))
    .sort();
}

/** Load and validate every ground-truth JSON (files starting with `_` skipped). */
export function loadGroundTruthFiles(): Array<{ path: string; gt: GroundTruth }> {
  if (!existsSync(PATHS.groundTruth)) return [];
  const out: Array<{ path: string; gt: GroundTruth }> = [];
  for (const name of readdirSync(PATHS.groundTruth).sort()) {
    if (name.startsWith('_') || !name.endsWith('.json')) continue;
    const filePath = path.join(PATHS.groundTruth, name);
    const parsed = groundTruthSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
    if (!parsed.success) {
      throw new Error(`Invalid ground truth ${filePath}: ${parsed.error.message}`);
    }
    out.push({ path: filePath, gt: parsed.data });
  }
  return out;
}

/** Join ground truth to recordings by the GT's `audio` field. */
export function pairAll(): {
  pairs: RecordingPair[];
  orphanAudio: string[];
  orphanGt: string[];
} {
  const recordings = listRecordingFiles();
  const byBasename = new Map<string, string>();
  for (const p of recordings) byBasename.set(path.basename(p), p);

  const gts = loadGroundTruthFiles();
  const pairs: RecordingPair[] = [];
  const orphanGt: string[] = [];
  const usedAudio = new Set<string>();

  for (const { path: gtPath, gt } of gts) {
    const audioPath = byBasename.get(gt.audio);
    if (audioPath) {
      usedAudio.add(audioPath);
      pairs.push({ audio: gt.audio, audioPath, gt, gtPath });
    } else {
      orphanGt.push(gtPath);
    }
  }

  const orphanAudio = recordings.filter((p) => !usedAudio.has(p));
  return { pairs, orphanAudio, orphanGt };
}
