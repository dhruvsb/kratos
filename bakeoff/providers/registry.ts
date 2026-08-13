/**
 * Provider registry — the single place the commands reach for adapters.
 *
 * ALL_PROVIDERS is the canonical order used in reports / CLI defaults.
 */
import type { AsrProvider } from './types.ts';
import { openaiProvider } from './openai.ts';
import { groqProvider } from './groq.ts';
import { deepgramProvider } from './deepgram.ts';
import { elevenlabsProvider } from './elevenlabs.ts';
import { assemblyaiProvider } from './assemblyai.ts';
import { googleChirpProvider } from './google.ts';
import { sarvamProvider } from './sarvam.ts';

/** Every adapter, in canonical report order. */
export const ALL_PROVIDERS: AsrProvider[] = [
  openaiProvider,
  groqProvider,
  deepgramProvider,
  elevenlabsProvider,
  assemblyaiProvider,
  googleChirpProvider,
  sarvamProvider,
];

/**
 * Resolve provider ids to adapters. No ids -> all providers. Requested order is
 * preserved. An unknown id throws with the list of valid ids.
 */
export function getProviders(ids?: string[]): AsrProvider[] {
  if (!ids || ids.length === 0) return ALL_PROVIDERS;
  const byId = new Map(ALL_PROVIDERS.map((p) => [p.id, p]));
  return ids.map((id) => {
    const p = byId.get(id);
    if (!p) {
      const valid = ALL_PROVIDERS.map((x) => x.id).join(', ');
      throw new Error(`Unknown provider '${id}'. Valid ids: ${valid}`);
    }
    return p;
  });
}

/** Just the providers whose required env keys are present. */
export function configuredProviders(): AsrProvider[] {
  return ALL_PROVIDERS.filter((p) => p.configured());
}
