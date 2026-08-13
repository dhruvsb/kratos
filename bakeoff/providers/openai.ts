/**
 * OpenAI audio transcription adapter.
 *
 *   Endpoint : POST https://api.openai.com/v1/audio/transcriptions (multipart)
 *   Auth     : Authorization: Bearer <OPENAI_API_KEY>
 *   Biasing  : these models bias via the free-text `prompt` field, so the
 *              keyterms are joined into the prompt.
 *   Language : this endpoint wants an ISO-639-1 code, so the region is stripped
 *              ('en-IN' -> 'en').
 *
 * TWO variants are registered so they can be compared head-to-head:
 *   - `openai`           gpt-4o-transcribe   (released 2025-03-20)
 *   - `openai-next`      gpt-transcribe      (released 2026-07-28; OpenAI's
 *                        currently RECOMMENDED transcription model, and cheaper
 *                        — ~$0.0045/min vs ~$0.006/min)
 * Override either with BAKEOFF_OPENAI_MODEL / BAKEOFF_OPENAI_NEXT_MODEL.
 */
import type { AsrProvider } from './types.ts';
import { baseLanguage, errored, fetchWithRetry, ok, readAudio, safeText, skipped } from './http.ts';
import { hasEnv } from './types.ts';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';

function makeOpenAiProvider(id: string, label: string, model: string): AsrProvider {
  return {
    id,
    label,
    model,
    keyEnv: ['OPENAI_API_KEY'],
    note: `${model} via /v1/audio/transcriptions`,

    configured() {
      return hasEnv('OPENAI_API_KEY');
    },

    async transcribe(input) {
      if (!this.configured()) return skipped(id, model, 'OPENAI_API_KEY not set');

      const { blob, filename } = readAudio(input.audioPath);
      const form = new FormData();
      form.append('file', blob, filename);
      form.append('model', model);
      form.append('language', baseLanguage(input.context.language));
      form.append('response_format', 'json');
      if (input.context.keyterms.length) {
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
          return errored(id, model, `HTTP ${res.status}: ${await safeText(res)}`, startedAt);
        }
        const json = (await res.json()) as { text?: string };
        return ok(id, model, json.text ?? '', startedAt, { raw: json });
      } catch (err) {
        return errored(id, model, err instanceof Error ? err.message : String(err), startedAt);
      }
    },
  };
}

export const openaiProvider = makeOpenAiProvider(
  'openai',
  'OpenAI',
  process.env.BAKEOFF_OPENAI_MODEL ?? 'gpt-4o-transcribe'
);

export const openaiNextProvider = makeOpenAiProvider(
  'openai-next',
  'OpenAI (GPT-Transcribe)',
  process.env.BAKEOFF_OPENAI_NEXT_MODEL ?? 'gpt-transcribe'
);
