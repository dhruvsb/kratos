/**
 * Groq audio transcription adapter (OpenAI-compatible API).
 *
 * ASSUMES (verify at console.groq.com/docs/speech-text):
 *   Endpoint : POST https://api.groq.com/openai/v1/audio/transcriptions (multipart)
 *   Model    : BAKEOFF_GROQ_MODEL ?? 'whisper-large-v3'
 *              (Groq also exposes 'whisper-large-v3-turbo' / distil variants)
 *   Auth     : Authorization: Bearer <GROQ_API_KEY>
 *   Shape    : identical multipart shape to OpenAI (file, model, language,
 *              prompt, response_format) since the endpoint is OpenAI-compatible.
 *   Language : ISO-639-1, so we strip the region ('en-IN' -> 'en').
 */
import type { AsrProvider } from './types.ts';
import { baseLanguage, errored, fetchWithRetry, ok, readAudio, safeText, skipped } from './http.ts';
import { hasEnv } from './types.ts';

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = process.env.BAKEOFF_GROQ_MODEL ?? 'whisper-large-v3';

export const groqProvider: AsrProvider = {
  id: 'groq',
  label: 'Groq',
  model: MODEL,
  keyEnv: ['GROQ_API_KEY'],
  note: `${MODEL} via OpenAI-compatible /audio/transcriptions — verify model id at console.groq.com`,

  configured() {
    return hasEnv('GROQ_API_KEY');
  },

  async transcribe(input) {
    if (!this.configured()) return skipped(this.id, MODEL, 'GROQ_API_KEY not set');

    const { blob, filename } = readAudio(input.audioPath);
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('model', MODEL);
    form.append('language', baseLanguage(input.context.language));
    form.append('response_format', 'json');
    if (input.context.keyterms.length) {
      form.append('prompt', input.context.keyterms.join(', '));
    }

    const startedAt = Date.now();
    try {
      const res = await fetchWithRetry(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
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
