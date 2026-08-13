/**
 * Google Cloud Speech-to-Text v2 (Chirp) adapter.
 *
 * AUTH DESIGN: to avoid pulling the google-auth-library dependency into this
 * standalone harness, we take a short-lived OAuth access token straight from
 * the env — generate one with:  `gcloud auth print-access-token`  and export it
 * as GOOGLE_STT_ACCESS_TOKEN. (Tokens expire ~1h, so refresh before a run.)
 *
 * ASSUMES (verify at cloud.google.com/speech-to-text/v2/docs):
 *   Endpoint : POST https://speech.googleapis.com/v2/projects/{project}/
 *              locations/global/recognizers/_:recognize
 *              (uses the inline `_` recognizer; override the recognizer resource
 *               with BAKEOFF_GOOGLE_RECOGNIZER if you created a named one)
 *   Model    : BAKEOFF_GOOGLE_MODEL ?? 'chirp_3'
 *   Project  : GOOGLE_CLOUD_PROJECT
 *   Auth     : Authorization: Bearer <GOOGLE_STT_ACCESS_TOKEN>
 *   Audio    : sent inline as base64 `content` with autoDecodingConfig.
 *   Language : languageCodes:[language] (Chirp accepts 'en-IN' / 'en-US').
 */
import type { AsrProvider } from './types.ts';
import { errored, fetchWithRetry, ok, readAudio, safeText, skipped } from './http.ts';
import { hasEnv } from './types.ts';

const MODEL = process.env.BAKEOFF_GOOGLE_MODEL ?? 'chirp_3';

interface GoogleAlt {
  transcript?: string;
  confidence?: number;
}
interface GoogleResponse {
  results?: Array<{ alternatives?: GoogleAlt[] }>;
}

export const googleChirpProvider: AsrProvider = {
  id: 'google',
  label: 'Google Chirp (v2)',
  model: MODEL,
  keyEnv: ['GOOGLE_STT_ACCESS_TOKEN'],
  note: `${MODEL} via Speech v2 — needs a gcloud access token + GOOGLE_CLOUD_PROJECT; verify recognizer path`,

  configured() {
    // A project is also required, but keyEnv (per contract) tracks the token.
    return hasEnv('GOOGLE_STT_ACCESS_TOKEN');
  },

  async transcribe(input) {
    if (!this.configured()) return skipped(this.id, MODEL, 'GOOGLE_STT_ACCESS_TOKEN not set');

    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) return skipped(this.id, MODEL, 'GOOGLE_CLOUD_PROJECT not set');

    const recognizer =
      process.env.BAKEOFF_GOOGLE_RECOGNIZER ??
      `projects/${project}/locations/global/recognizers/_`;
    const endpoint = `https://speech.googleapis.com/v2/${recognizer}:recognize`;

    const { bytes } = readAudio(input.audioPath);
    const body = {
      config: {
        model: MODEL,
        languageCodes: [input.context.language],
        features: { maxAlternatives: 5 },
        autoDecodingConfig: {},
      },
      content: bytes.toString('base64'),
    };

    const startedAt = Date.now();
    try {
      const res = await fetchWithRetry(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GOOGLE_STT_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return errored(this.id, MODEL, `HTTP ${res.status}: ${await safeText(res)}`, startedAt);
      }
      const json = (await res.json()) as GoogleResponse;
      const results = json.results ?? [];
      // Concatenate the top alternative of each result segment.
      const transcript = results
        .map((r) => r.alternatives?.[0]?.transcript ?? '')
        .join(' ')
        .trim();
      const firstAlts = results[0]?.alternatives ?? [];
      return ok(this.id, MODEL, transcript, startedAt, {
        confidence: firstAlts[0]?.confidence ?? null,
        alternatives: firstAlts.map((a) => a.transcript ?? ''),
        raw: json,
      });
    } catch (err) {
      return errored(this.id, MODEL, err instanceof Error ? err.message : String(err), startedAt);
    }
  },
};
