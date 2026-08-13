/**
 * Sarvam AI speech-to-text adapter (India-focused; strong on Indian English).
 *
 * HEAVILY CAVEATED — endpoint / model / auth header could NOT be verified
 * against live docs. Everything here is config-driven so you can correct it
 * without touching code.
 *
 * ASSUMES (CONFIRM at docs.sarvam.ai BEFORE trusting any numbers):
 *   Endpoint : BAKEOFF_SARVAM_URL   ?? 'https://api.sarvam.ai/speech-to-text' (multipart)
 *   Model    : BAKEOFF_SARVAM_MODEL ?? 'saaras:v3'
 *   Auth     : api-subscription-key: <SARVAM_API_KEY>
 *   Language : language_code 'en-IN'
 *   Transcript field : json.transcript ?? json.text
 */
import type { AsrProvider } from './types.ts';
import { errored, fetchWithRetry, ok, readAudio, safeText, skipped } from './http.ts';
import { hasEnv } from './types.ts';

const ENDPOINT = process.env.BAKEOFF_SARVAM_URL ?? 'https://api.sarvam.ai/speech-to-text';
const MODEL = process.env.BAKEOFF_SARVAM_MODEL ?? 'saaras:v3';

export const sarvamProvider: AsrProvider = {
  id: 'sarvam',
  label: 'Sarvam',
  keyEnv: ['SARVAM_API_KEY'],
  note: 'Sarvam endpoint/model/auth header UNVERIFIED — confirm at docs.sarvam.ai before trusting',

  configured() {
    return hasEnv('SARVAM_API_KEY');
  },

  async transcribe(input) {
    if (!this.configured()) return skipped(this.id, MODEL, 'SARVAM_API_KEY not set');

    const { blob, filename } = readAudio(input.audioPath);
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('model', MODEL);
    // Sarvam targets Indian languages; keep the region (en-IN) rather than strip.
    form.append('language_code', input.context.language || 'en-IN');

    const startedAt = Date.now();
    try {
      const res = await fetchWithRetry(ENDPOINT, {
        method: 'POST',
        headers: { 'api-subscription-key': process.env.SARVAM_API_KEY! },
        body: form,
      });
      if (!res.ok) {
        return errored(this.id, MODEL, `HTTP ${res.status}: ${await safeText(res)}`, startedAt);
      }
      const json = (await res.json()) as { transcript?: string; text?: string };
      return ok(this.id, MODEL, json.transcript ?? json.text ?? '', startedAt, { raw: json });
    } catch (err) {
      return errored(this.id, MODEL, err instanceof Error ? err.message : String(err), startedAt);
    }
  },
};
