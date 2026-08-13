/**
 * The ASR provider contract. Every adapter implements this. Adapters are
 * SELF-CONTAINED: they read the audio file themselves and return a normalized
 * AsrResult. Caching, context-building, and scoring all live above this layer
 * (in the commands), so an adapter only has to know how to call one API.
 */
import type { AsrResult, AsrTranscribeInput } from '../types.ts';

export interface AsrProvider {
  /** Stable slug used in cache keys, CLI flags, and report columns. */
  id: string;
  /** Human label for the report. */
  label: string;
  /**
   * The resolved model id this adapter will call. MUST be part of the
   * transcription cache key — without it, changing a BAKEOFF_*_MODEL override
   * silently returns transcripts produced by the previous model.
   */
  model: string;
  /** Env var names that must be present for this provider to run. */
  keyEnv: string[];
  /**
   * Short note shown by `doctor` — where to get the key, what to verify.
   * Providers whose exact endpoint/model could not be verified against live
   * docs say so here so you confirm before trusting their numbers.
   */
  note?: string;
  /** True when every keyEnv var is set. */
  configured(): boolean;
  /**
   * Transcribe one file. MUST NOT throw for an expected failure (missing key,
   * provider error) — return an AsrResult with `skipped` or `error` set so the
   * bakeoff can note it and carry on with the other providers.
   */
  transcribe(input: AsrTranscribeInput): Promise<AsrResult>;
}

/** Convenience: are all these env vars non-empty? */
export function hasEnv(...names: string[]): boolean {
  return names.every((n) => !!process.env[n] && process.env[n]!.trim().length > 0);
}
