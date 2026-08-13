/**
 * Shared HTTP + audio helpers for the ASR adapters.
 *
 * STANDALONE harness code — runs only under `npx tsx` on a dev machine. NO
 * React Native / Expo imports. Node 22 built-ins only (global fetch/FormData/
 * Blob/Buffer, node:fs).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AsrResult } from '../types.ts';

/** Map a file extension to a best-guess audio content-type. */
function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
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

/**
 * Read an audio file off disk once and return everything the adapters need:
 * the raw bytes (for raw-body POSTs / base64), a Blob (for multipart), plus the
 * inferred content-type and a filename for the multipart part.
 */
export function readAudio(audioPath: string): {
  blob: Blob;
  bytes: Buffer;
  contentType: string;
  filename: string;
} {
  const bytes = readFileSync(audioPath);
  const contentType = contentTypeForExt(path.extname(audioPath));
  const filename = path.basename(audioPath);
  // Blob accepts a Uint8Array view; Buffer is a Uint8Array subclass.
  const blob = new Blob([bytes], { type: contentType });
  return { blob, bytes, contentType, filename };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * fetch() with a timeout (AbortController) and bounded exponential-backoff
 * retries. Retries ONLY on a network error or a retryable HTTP status
 * (429 / 5xx). A non-retryable HTTP response (e.g. 400/401/404) is returned as
 * a Response so the caller can read its body for a useful error message.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: { retries?: number; timeoutMs?: number },
): Promise<Response> {
  const retries = opts?.retries ?? 2;
  const timeoutMs = opts?.timeoutMs ?? 120_000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      // Retry transient server / rate-limit statuses; return everything else.
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Build a "skipped" result (provider not configured / unsupported). */
export function skipped(providerId: string, model: string, reason: string): AsrResult {
  return { providerId, model, transcript: '', latency_ms: 0, skipped: reason };
}

/** Build an "error" result, stamping the measured latency. */
export function errored(
  providerId: string,
  model: string,
  message: string,
  startedAt: number,
): AsrResult {
  return {
    providerId,
    model,
    transcript: '',
    latency_ms: Date.now() - startedAt,
    error: message,
  };
}

/** Build a success result, stamping the measured latency; merge any extras. */
export function ok(
  providerId: string,
  model: string,
  transcript: string,
  startedAt: number,
  extra?: Partial<AsrResult>,
): AsrResult {
  return {
    providerId,
    model,
    transcript,
    latency_ms: Date.now() - startedAt,
    ...extra,
  };
}

/** Reduce a BCP-47 tag ('en-IN', 'en-US') to its ISO-639-1 base ('en'). */
export function baseLanguage(tag: string): string {
  return (tag || '').split('-')[0] || 'en';
}

/** Read a Response body as text, swallowing any read error (for error messages). */
export async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
