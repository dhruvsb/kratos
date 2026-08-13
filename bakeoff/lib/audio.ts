/**
 * Audio helpers — hashing, content-type mapping, WAV duration, and an optional
 * 16 kHz-mono conversion via ffmpeg (best-effort; a no-op if ffmpeg is absent).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PATHS } from '../config.ts';

/** Sync SHA-256 hex digest of a file's bytes. */
export function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** MIME type for an audio file, by extension. */
export function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.mp3':
      return 'audio/mpeg';
    case '.flac':
      return 'audio/flac';
    case '.ogg':
      return 'audio/ogg';
    case '.webm':
      return 'audio/webm';
    default:
      return 'application/octet-stream';
  }
}

let ffmpegMemo: boolean | null = null;
/** Whether `ffmpeg` is on PATH (memoized). */
export function hasFfmpeg(): boolean {
  if (ffmpegMemo === null) {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    ffmpegMemo = res.status === 0;
  }
  return ffmpegMemo;
}

/**
 * Best-effort PCM WAV duration in seconds from the RIFF header. Returns null
 * for non-WAV input or on any parse failure.
 */
export function wavDurationSec(filePath: string): number | null {
  try {
    const buf = readFileSync(filePath);
    if (buf.length < 12) return null;
    if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
    if (buf.toString('ascii', 8, 12) !== 'WAVE') return null;

    let byteRate = 0;
    let dataSize = 0;
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const chunkId = buf.toString('ascii', offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      const body = offset + 8;
      if (chunkId === 'fmt ' && body + 16 <= buf.length) {
        const numChannels = buf.readUInt16LE(body + 2);
        const sampleRate = buf.readUInt32LE(body + 4);
        byteRate = buf.readUInt32LE(body + 8);
        if (byteRate === 0) {
          const bitsPerSample = buf.readUInt16LE(body + 14);
          byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        }
      } else if (chunkId === 'data') {
        dataSize = chunkSize;
      }
      // Chunks are word-aligned (pad byte when odd).
      offset = body + chunkSize + (chunkSize % 2);
    }
    if (byteRate <= 0 || dataSize <= 0) return null;
    return dataSize / byteRate;
  } catch {
    return null;
  }
}

/**
 * Convert to 16 kHz mono WAV in the cache dir (idempotent, keyed by content
 * hash). If ffmpeg is unavailable, returns the original path unconverted.
 */
export async function ensureWav16kMono(
  filePath: string
): Promise<{ path: string; converted: boolean }> {
  if (!hasFfmpeg()) return { path: filePath, converted: false };

  mkdirSync(PATHS.cache, { recursive: true });
  const outPath = path.join(PATHS.cache, `${sha256File(filePath)}.16k.wav`);
  if (existsSync(outPath)) return { path: outPath, converted: true };

  const res = spawnSync(
    'ffmpeg',
    ['-i', filePath, '-ar', '16000', '-ac', '1', '-y', outPath],
    { stdio: 'ignore' }
  );
  if (res.status !== 0 || !existsSync(outPath)) {
    return { path: filePath, converted: false };
  }
  return { path: outPath, converted: true };
}
