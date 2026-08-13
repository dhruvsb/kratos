/**
 * AssemblyAI speech-to-text adapter (classic upload -> submit -> poll flow).
 *
 * ASSUMES (verify at assemblyai.com/docs):
 *   Upload   : POST https://api.assemblyai.com/v2/upload (RAW bytes) -> upload_url
 *   Submit   : POST https://api.assemblyai.com/v2/transcript (json) -> { id }
 *   Poll     : GET  https://api.assemblyai.com/v2/transcript/{id} until
 *              status 'completed' | 'error' (capped ~120s, every ~2s)
 *   Model    : BAKEOFF_ASSEMBLYAI_MODEL ?? 'universal-3-5-pro'
 *   Auth     : authorization: <ASSEMBLYAI_API_KEY>  (no 'Bearer' prefix)
 *   Biasing  : `keyterms_prompt` array from keyterms.
 *   Language : `language_code`, ISO-639; region stripped ('en-IN' -> 'en').
 *
 * VERIFIED LIVE 2026-08-13 — two API drifts found and fixed by smoke test:
 *   1. Singular `speech_model` is REJECTED (HTTP 400: "deprecated. Use
 *      speech_models: [...]"). The API wants the plural `speech_models` ARRAY;
 *      sent as a single-element array so the report names exactly one model.
 *      Valid values per the API's own error: 'universal-3-5-pro','universal-2'.
 *   2. `word_boost` is REJECTED on universal-3-5-pro (HTTP 400: 'not
 *      compatible ... Use "prompt" or "keyterms_prompt"'). Biasing now goes
 *      through `keyterms_prompt`. If you pin BAKEOFF_ASSEMBLYAI_MODEL back to
 *      an older model, that older model may want `word_boost` instead.
 */
import type { AsrProvider } from './types.ts';
import { baseLanguage, errored, fetchWithRetry, ok, readAudio, safeText, skipped } from './http.ts';
import { hasEnv } from './types.ts';

const UPLOAD_URL = 'https://api.assemblyai.com/v2/upload';
const TRANSCRIPT_URL = 'https://api.assemblyai.com/v2/transcript';
const MODEL = process.env.BAKEOFF_ASSEMBLYAI_MODEL ?? 'universal-3-5-pro';

const POLL_INTERVAL_MS = 2000;
const POLL_CAP_MS = 120_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const assemblyaiProvider: AsrProvider = {
  id: 'assemblyai',
  label: 'AssemblyAI',
  model: MODEL,
  keyEnv: ['ASSEMBLYAI_API_KEY'],
  note: `${MODEL} via upload+poll — verified live 2026-08-13 (uses plural speech_models array)`,

  configured() {
    return hasEnv('ASSEMBLYAI_API_KEY');
  },

  async transcribe(input) {
    if (!this.configured()) return skipped(this.id, MODEL, 'ASSEMBLYAI_API_KEY not set');

    const key = process.env.ASSEMBLYAI_API_KEY!;
    const { bytes } = readAudio(input.audioPath);
    const startedAt = Date.now();

    try {
      // 1) Upload the raw audio bytes -> upload_url.
      const upRes = await fetchWithRetry(UPLOAD_URL, {
        method: 'POST',
        headers: { authorization: key, 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(bytes),
      });
      if (!upRes.ok) {
        return errored(this.id, MODEL, `upload HTTP ${upRes.status}: ${await safeText(upRes)}`, startedAt);
      }
      const { upload_url } = (await upRes.json()) as { upload_url?: string };
      if (!upload_url) return errored(this.id, MODEL, 'upload returned no upload_url', startedAt);

      // 2) Submit the transcription job.
      const subRes = await fetchWithRetry(TRANSCRIPT_URL, {
        method: 'POST',
        headers: { authorization: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: upload_url,
          speech_models: [MODEL],
          // Only send biasing when we actually have terms — an empty array is
          // a needless way to trip vendor validation.
          ...(input.context.keyterms.length
            ? { keyterms_prompt: input.context.keyterms }
            : {}),
          language_code: baseLanguage(input.context.language),
        }),
      });
      if (!subRes.ok) {
        return errored(this.id, MODEL, `submit HTTP ${subRes.status}: ${await safeText(subRes)}`, startedAt);
      }
      const { id } = (await subRes.json()) as { id?: string };
      if (!id) return errored(this.id, MODEL, 'submit returned no transcript id', startedAt);

      // 3) Poll until completed / error / cap.
      const pollUrl = `${TRANSCRIPT_URL}/${id}`;
      while (Date.now() - startedAt < POLL_CAP_MS) {
        await sleep(POLL_INTERVAL_MS);
        const pRes = await fetchWithRetry(pollUrl, {
          method: 'GET',
          headers: { authorization: key },
        });
        if (!pRes.ok) {
          return errored(this.id, MODEL, `poll HTTP ${pRes.status}: ${await safeText(pRes)}`, startedAt);
        }
        const json = (await pRes.json()) as { status?: string; text?: string; error?: string };
        if (json.status === 'completed') {
          return ok(this.id, MODEL, json.text ?? '', startedAt, { raw: json });
        }
        if (json.status === 'error') {
          return errored(this.id, MODEL, json.error ?? 'transcription error', startedAt);
        }
      }
      return errored(this.id, MODEL, `polling timed out after ${POLL_CAP_MS}ms`, startedAt);
    } catch (err) {
      return errored(this.id, MODEL, err instanceof Error ? err.message : String(err), startedAt);
    }
  },
};
