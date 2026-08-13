/**
 * OpenAI audio transcription adapter.
 *
 * ASSUMES (verify at platform.openai.com/docs/api-reference/audio):
 *   Endpoint : POST https://api.openai.com/v1/audio/transcriptions (multipart)
 *   Model    : BAKEOFF_OPENAI_MODEL ?? 'gpt-4o-transcribe'
 *              (fallback to the classic 'whisper-1' if the 4o model id is wrong)
 *   Auth     : Authorization: Bearer <OPENAI_API_KEY>
 *   Biasing  : Whisper-family models bias via the free-text `prompt` field, so
 *              we join the keyterms into the prompt.
 *   Language : this endpoint wants an ISO-639-1 code, so we strip the region
 *              ('en-IN' -> 'en').
 */
import type { AsrProvider } from './types.ts';
import { baseLanguage, errored, fetchWithRetry, ok, readAudio, safeText, skipped } from './http.ts';
import { hasEnv } from './types.ts';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = process.env.BAKEOFF_OPENAI_MODEL ?? 'gpt-4o-transcribe';

export const openaiProvider: AsrProvider = {
  id: 'openai',
  label: 'OpenAI',
  keyEnv: ['OPENAI_API_KEY'],
  note: `${MODEL} via /v1/audio/transcriptions — verify model id at platform.openai.com`,

  configured() {
    return hasEnv('OPENAI_API_KEY');
  },

  async transcribe(input) {
    if (!this.configured()) return skipped(this.id, MODEL, 'OPENAI_API_KEY not set');

    const { blob, filename } = readAudio(input.audioPath);
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('model', MODEL);
    form.append('language', baseLanguage(input.context.language));
    form.append('response_format', 'json');
    if (input.context.keyterms.length) {
      // Whisper-family models accept a soft `prompt` to bias vocabulary.
      form.append('prompt', input.context.keyterms.join(', '));
    }

    const startedAt = Date.now();
    try {
      const res = await fetchWithRetry(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
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
