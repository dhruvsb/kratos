/**
 * ElevenLabs Scribe speech-to-text adapter.
 *
 * ASSUMES (verify at elevenlabs.io/docs/api-reference/speech-to-text):
 *   Endpoint : POST https://api.elevenlabs.io/v1/speech-to-text (multipart)
 *   Model    : BAKEOFF_ELEVENLABS_MODEL ?? 'scribe_v1'
 *              (Scribe v2 may use a DIFFERENT model id — verify)
 *   Auth     : xi-api-key: <ELEVENLABS_API_KEY>
 *   Language : `language_code`, ISO-639; region stripped ('en-IN' -> 'en').
 *   Biasing  : best-effort. The exact field name for keyterm/vocabulary biasing
 *              is UNCERTAIN — we pass the terms under `keyterms` as JSON, but
 *              this may be ignored or renamed by the API. Verify.
 */
import type { AsrProvider } from './types.ts';
import { baseLanguage, errored, fetchWithRetry, ok, readAudio, safeText, skipped } from './http.ts';
import { hasEnv } from './types.ts';

const ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';
const MODEL = process.env.BAKEOFF_ELEVENLABS_MODEL ?? 'scribe_v1';

export const elevenlabsProvider: AsrProvider = {
  id: 'elevenlabs',
  label: 'ElevenLabs',
  model: MODEL,
  keyEnv: ['ELEVENLABS_API_KEY'],
  note: `${MODEL} via /v1/speech-to-text — Scribe v2 id + keyterm field name unverified; check elevenlabs.io`,

  configured() {
    return hasEnv('ELEVENLABS_API_KEY');
  },

  async transcribe(input) {
    if (!this.configured()) return skipped(this.id, MODEL, 'ELEVENLABS_API_KEY not set');

    const { blob, filename } = readAudio(input.audioPath);
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('model_id', MODEL);
    form.append('language_code', baseLanguage(input.context.language));
    if (input.context.keyterms.length) {
      // Best-effort biasing — field name UNVERIFIED (see note above).
      form.append('keyterms', JSON.stringify(input.context.keyterms));
    }

    const startedAt = Date.now();
    try {
      const res = await fetchWithRetry(ENDPOINT, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
        body: form,
      });
      if (!res.ok) {
        return errored(this.id, MODEL, `HTTP ${res.status}: ${await safeText(res)}`, startedAt);
      }
      const json = (await res.json()) as { text?: string };
      return ok(this.id, MODEL, json.text ?? '', startedAt, { raw: json });
    } catch (err) {
      return errored(this.id, MODEL, err instanceof Error ? err.message : String(err), startedAt);
    }
  },
};
