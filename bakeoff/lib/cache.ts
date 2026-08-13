/**
 * A tiny JSON response cache on disk under PATHS.cache — keyed by a short hash
 * of the inputs, so repeated bakeoff runs don't re-hit paid ASR/LLM APIs.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from '../config.ts';

/** Short (16 hex char) cache key from the joined parts. */
export function cacheKey(parts: Array<string | number>): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/** Read a cached value, or null when the entry is missing or unreadable. */
export function readCache<T>(key: string): T | null {
  const file = path.join(PATHS.cache, `${key}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Write a value as pretty JSON, creating the cache dir if needed. */
export function writeCache(key: string, value: unknown): void {
  mkdirSync(PATHS.cache, { recursive: true });
  const file = path.join(PATHS.cache, `${key}.json`);
  writeFileSync(file, JSON.stringify(value, null, 2));
}
