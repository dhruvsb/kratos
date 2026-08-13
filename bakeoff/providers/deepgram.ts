/**
 * Deepgram pre-recorded transcription adapter.
 *
 * ASSUMES (verify at developers.deepgram.com/docs):
 *   Endpoint : POST https://api.deepgram.com/v1/listen (RAW audio bytes as body)
 *   Model    : BAKEOFF_DEEPGRAM_MODEL ?? 'nova-3'
 *   Auth     : Authorization: Token <DEEPGRAM_API_KEY>
 *   Params   : smart_format=true, model, language, and one `keyterm` query param
 *              per term. NOTE: Nova-3 `keyterm` is UNWEIGHTED (plain terms) —
 *              this is different from the old Nova-2 `keywords:intensifier`
 *              weighted syntax. Verify before trusting.
 *   Language : Deepgram wants 'en' / 'en-US' etc.; there is no 'en-IN', so we
 *              map the region away to the base code ('en-IN' -> 'en').
 */
import type { AsrProvider } from './types.ts';
import { baseLanguage, errored, fetchWithRetry, ok, readAudio, safeText, skipped } from './http.ts';
import { hasEnv } from './types.ts';

const BASE = 'https://api.deepgram.com/v1/listen';
const MODEL = process.env.BAKEOFF_DEEPGRAM_MODEL ?? 'nova-3';

interface DeepgramAlt {
  transcript?: string;
  confidence?: number;
}
interface DeepgramResponse {
  results?: { channels?: Array<{ alternatives?: DeepgramAlt[] }> };
}

export const deepgramProvider: AsrProvider = {
  id: 'deepgram',
  label: 'Deepgram',
  keyEnv: ['DEEPGRAM_API_KEY'],
  note: `${MODEL} via /v1/listen — Nova-3 keyterm is unweighted; verify at developers.deepgram.com`,

  configured() {
    return hasEnv('DEEPGRAM_API_KEY');
  },

  async transcribe(input) {
    if (!this.configured()) return skipped(this.id, MODEL, 'DEEPGRAM_API_KEY not set');

    const { bytes, contentType } = readAudio(input.audioPath);

    const params = new URLSearchParams();
    params.set('model', MODEL);
    params.set('smart_format', 'true');
    params.set('language', baseLanguage(input.context.language));
    // Nova-3: one plain `keyterm` per domain term (URLSearchParams URL-encodes).
    for (const term of input.context.keyterms) params.append('keyterm', term);

    const url = `${BASE}?${params.toString()}`;
    const startedAt = Date.now();
    try {
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': contentType,
        },
        body: new Uint8Array(bytes),
      });
      if (!res.ok) {
        return errored(this.id, MODEL, `HTTP ${res.status}: ${await safeText(res)}`, startedAt);
      }
      const json = (await res.json()) as DeepgramResponse;
      const alts = json.results?.channels?.[0]?.alternatives ?? [];
      const transcript = alts[0]?.transcript ?? '';
      const alternatives = alts.map((a) => a.transcript ?? '');
      return ok(this.id, MODEL, transcript, startedAt, {
        confidence: alts[0]?.confidence ?? null,
        alternatives,
        raw: json,
      });
    } catch (err) {
      return errored(this.id, MODEL, err instanceof Error ? err.message : String(err), startedAt);
    }
  },
};
