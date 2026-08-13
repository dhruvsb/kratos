/**
 * AssemblyAI speech-to-text adapter (classic upload -> submit -> poll flow).
 *
 * ASSUMES (verify at assemblyai.com/docs):
 *   Upload   : POST https://api.assemblyai.com/v2/upload (RAW bytes) -> upload_url
 *   Submit   : POST https://api.assemblyai.com/v2/transcript (json) -> { id }
 *   Poll     : GET  https://api.assemblyai.com/v2/transcript/{id} until
 *              status 'completed' | 'error' (capped ~120s, every ~2s)
 *   Model    : BAKEOFF_ASSEMBLYAI_MODEL ?? 'best'  (also 'universal' / 'nano' —
 *              verify the current `speech_model` enum)
 *   Auth     : authorization: <ASSEMBLYAI_API_KEY>  (no 'Bearer' prefix)
 *   Biasing  : `word_boost` array from keyterms.
 *   Language : `language_code`, ISO-639; region stripped ('en-IN' -> 'en').
 */
import type { AsrProvider } from './types.ts';
import { baseLanguage, errored, fetchWithRetry, ok, readAudio, safeText, skipped } from './http.ts';
import { hasEnv } from './types.ts';

const UPLOAD_URL = 'https://api.assemblyai.com/v2/upload';
const TRANSCRIPT_URL = 'https://api.assemblyai.com/v2/transcript';
const MODEL = process.env.BAKEOFF_ASSEMBLYAI_MODEL ?? 'best';

const POLL_INTERVAL_MS = 2000;
const POLL_CAP_MS = 120_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const assemblyaiProvider: AsrProvider = {
  id: 'assemblyai',
  label: 'AssemblyAI',
  keyEnv: ['ASSEMBLYAI_API_KEY'],
  note: `${MODEL} via upload+poll — verify speech_model ('best'/'universal') at assemblyai.com`,

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
          speech_model: MODEL,
          word_boost: input.context.keyterms,
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
