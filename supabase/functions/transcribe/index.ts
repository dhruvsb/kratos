// transcribe edge function: auth-guarded cloud speech→text for voice logging
// (design "Voice Logging" 1a). The client records an audio clip and posts it here;
// we hand it to OpenAI's ASR model and return the transcript. The OpenAI key stays
// server-side (same hard rule as parse-utterance) — the client never holds it.
//
// POST { audio_base64: string, mime_type?: string, filename?: string }
//   → { text: string }
//
// Deploy:  supabase functions deploy transcribe
// Secrets: OPENAI_API_KEY (already set for parse-utterance — shared).
import { createClient } from '@supabase/supabase-js';
import OpenAI, { toFile } from 'openai';
import { ASR_MODEL, asrCostUsd } from '../_shared/pipeline/prices.ts';
import { langfuseFromEnv } from '../_shared/observability/langfuse.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Static gym-domain prime for the ASR `prompt` field — biases toward exercise
// names and the "weight × reps × sets" number pattern when no live keyterms are
// passed. (Under the bakeoff's 'routine' policy the caller passes the known
// routine's exercise names instead, which scores best.)
const GYM_ASR_PROMPT =
  'Gym workout log. Exercises: bench press, incline dumbbell press, squat, deadlift, ' +
  'overhead press, lat pulldown, barbell row, bicep curl, cable fly, leg press. ' +
  'Weights in kilograms; reps and sets spoken as numbers.';

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiKey) return json(500, { error: 'OPENAI_API_KEY secret not configured' });

  // Auth guard: same as parse-utterance — a valid user JWT is required so the
  // transcription endpoint can't be used anonymously.
  const authHeader = req.headers.get('Authorization') ?? '';
  const db = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError || !user) return json(401, { error: 'not authenticated' });

  let body: {
    audio_base64?: string;
    mime_type?: string;
    filename?: string;
    prompt?: string;
    // Observability: clip length from the recorder (drives per-minute ASR cost)
    // and the voice-session id that links this trace to the parse-utterance trace
    // for the same utterance in Langfuse. Both optional — absent on older clients.
    duration_ms?: number;
    session_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }
  if (!body.audio_base64) return json(400, { error: 'audio_base64 is required' });

  const mimeType = body.mime_type ?? 'audio/m4a';
  const prompt = body.prompt ?? GYM_ASR_PROMPT;
  const durationMs = body.duration_ms ?? null;

  // Langfuse trace for this transcription. No-op when the LANGFUSE_* secrets are
  // unset; flushed once at the end of both the success and error paths.
  const lf = langfuseFromEnv();
  const bytes = decodeBase64(body.audio_base64);
  const trace = lf.trace({
    name: 'voice.transcribe',
    userId: user.id,
    sessionId: body.session_id,
    input: { prompt, mime_type: mimeType, audio_bytes: bytes.byteLength, duration_ms: durationMs },
    tags: ['voice', 'asr'],
    metadata: { function: 'transcribe' },
  });
  const generation = trace.generation({
    name: 'asr.transcription',
    model: ASR_MODEL,
    modelParameters: { language: 'en' },
    input: { prompt, mime_type: mimeType, audio_bytes: bytes.byteLength, duration_ms: durationMs },
  });

  try {
    const file = await toFile(bytes, body.filename ?? 'audio.m4a', { type: mimeType });
    const transcription = await new OpenAI({ apiKey: openAiKey }).audio.transcriptions.create({
      file,
      model: ASR_MODEL,
      // The bakeoff biased these models via the free-text `prompt` (keyterms) and
      // a base language code — same knobs here. A caller can pass live keyterms
      // (the current routine's exercise names); otherwise a static gym-domain
      // prime nudges number/exercise recognition. Region stripped to ISO-639-1.
      language: 'en',
      prompt,
    });
    const text = transcription.text ?? '';

    const cost = asrCostUsd(durationMs);
    generation.end({
      output: text,
      usageDetails: durationMs != null ? { seconds: durationMs / 1000 } : undefined,
      costDetails: cost > 0 ? { input: cost, total: cost } : undefined,
    });
    trace.end({ output: { text } });
    await lf.flush();

    return json(200, { text });
  } catch (err) {
    console.error('transcribe failed:', err);
    generation.end({
      level: 'ERROR',
      statusMessage: err instanceof Error ? err.message : String(err),
    });
    trace.update({ metadata: { error: true } });
    trace.end();
    await lf.flush();
    return json(502, {
      error: 'transcribe failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
