// parse-utterance edge function: auth-guarded voice-transcript parsing.
// POST { transcript, context?, stt_source?, model? } → { voice_log_id, result, telemetry }
//
// Deploy:  supabase functions deploy parse-utterance
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...   (never in the client)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseContextSchema } from '../_shared/parse-types.ts';
import { parseUtterance } from '../_shared/pipeline/pipeline.ts';
import { OpenAiLlm } from '../_shared/pipeline/llm.ts';
import { PARSE_MODEL_DEFAULT, MODEL_PRICES, costUsd } from '../_shared/pipeline/prices.ts';
import { langfuseFromEnv, type Langfuse, type LangfuseTrace } from '../_shared/observability/langfuse.ts';
import { judgeFaithfulness } from '../_shared/observability/faithfulness.ts';
import type { ParseResult } from '../_shared/parse-types.ts';
import type {
  CatalogExercise,
  ExerciseCatalog,
  ScoredCandidate,
} from '../_shared/pipeline/resolution.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ExerciseCatalog backed by Postgres: exact alias/canonical lookup + the
// pg_trgm RPC from migration 0002. Runs as the calling user (RLS applies).
class DbCatalog implements ExerciseCatalog {
  constructor(private readonly db: SupabaseClient) {}

  async exactMatch(raw: string): Promise<CatalogExercise | null> {
    const needle = raw.trim().toLowerCase();

    const { data: alias } = await this.db
      .from('exercise_aliases')
      .select('exercise_id, exercises(canonical_name)')
      .ilike('alias', needle)
      .limit(1)
      .maybeSingle();
    if (alias) {
      const related = alias.exercises as unknown as { canonical_name: string } | null;
      return { id: alias.exercise_id, name: related?.canonical_name ?? raw };
    }

    const { data: exercise } = await this.db
      .from('exercises')
      .select('id, canonical_name')
      .ilike('canonical_name', needle)
      .limit(1)
      .maybeSingle();
    if (exercise) return { id: exercise.id, name: exercise.canonical_name };

    return null;
  }

  async candidates(raw: string, limit: number): Promise<ScoredCandidate[]> {
    const { data, error } = await this.db.rpc('search_exercise_candidates', {
      q: raw,
      max_results: limit,
    });
    if (error) throw new Error(`candidate search failed: ${error.message}`);
    return (data ?? []).map(
      (row: { exercise_id: string; name: string; score: number }) => ({
        id: row.exercise_id,
        name: row.name,
        score: row.score,
      })
    );
  }
}

// LLM-as-judge config. The faithfulness judge is an EXTRA LLM call per parse, so it
// is off by default and sampled: set FAITHFULNESS_JUDGE_SAMPLE_RATE to a fraction
// (e.g. 1.0 = every parse, 0.2 = 20%) to turn it on. Judge model defaults to the
// cheapest parse model; override with FAITHFULNESS_JUDGE_MODEL (must be priced).
function judgeSampleRate(): number {
  const raw = Number(Deno.env.get('FAITHFULNESS_JUDGE_SAMPLE_RATE') ?? '0');
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
}
function judgeModel(): string {
  const override = Deno.env.get('FAITHFULNESS_JUDGE_MODEL');
  return override && MODEL_PRICES[override] ? override : PARSE_MODEL_DEFAULT;
}

/**
 * Schedule the faithfulness judge on the request's background — never blocking the
 * user's response. Adds a `judge.faithfulness` generation (its own cost line) and a
 * `faithfulness` score to the already-flushed trace, then flushes that second batch.
 * No-op unless Langfuse is enabled AND this call falls inside the sample rate.
 */
function scheduleFaithfulnessJudge(input: {
  lf: Langfuse;
  trace: LangfuseTrace;
  transcript: string;
  result: ParseResult;
  openAiKey: string;
}): void {
  if (!input.lf.enabled) return; // nothing to attach the score to
  if (Math.random() >= judgeSampleRate()) return;

  const model = judgeModel();
  const task = (async () => {
    try {
      const gen = input.trace.generation({
        name: 'judge.faithfulness',
        model,
        input: { transcript: input.transcript, parsed: input.result },
      });
      const judged = await judgeFaithfulness(
        new OpenAiLlm(model, input.openAiKey),
        input.transcript,
        input.result
      );
      const tokens = judged.usage.inputTokens + judged.usage.outputTokens;
      gen.end({
        output: {
          faithful: judged.faithful,
          score: judged.score,
          issues: judged.issues,
          reasoning: judged.reasoning,
        },
        usageDetails: {
          input: judged.usage.inputTokens,
          output: judged.usage.outputTokens,
          total: tokens,
        },
        costDetails: {
          total: costUsd(model, judged.usage.inputTokens, judged.usage.outputTokens),
        },
      });
      input.trace.score({
        name: 'faithfulness',
        value: judged.score,
        comment: judged.reasoning || (judged.issues.length ? judged.issues.join('; ') : undefined),
      });
      await input.lf.flush();
    } catch (err) {
      console.error('faithfulness judge failed:', err instanceof Error ? err.message : err);
    }
  })();

  // Keep the edge worker alive for the background task when the runtime supports it
  // (Supabase Edge exposes EdgeRuntime.waitUntil). Without it, run detached best-effort.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiKey) {
    return json(500, { error: 'OPENAI_API_KEY secret not configured' });
  }

  // Auth guard: the client's JWT rides in on the Authorization header; every
  // DB access below runs as that user, so RLS is in force throughout.
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
    transcript?: string;
    context?: unknown;
    stt_source?: string;
    workout_id?: string | null;
    model?: string;
    // Links this parse trace to the transcribe trace for the same utterance in
    // Langfuse (one voice interaction = one session). Optional.
    session_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }

  const transcript = (body.transcript ?? '').trim();
  if (!transcript) return json(400, { error: 'transcript is required' });

  const contextParsed = parseContextSchema.safeParse(body.context ?? {});
  if (!contextParsed.success) {
    return json(400, { error: 'invalid context', details: contextParsed.error.issues });
  }

  // Model is overridable per-request (used by the eval harness in remote
  // mode), but only to models we have prices for.
  const model =
    body.model && MODEL_PRICES[body.model] ? body.model : PARSE_MODEL_DEFAULT;

  // Langfuse trace for this parse. No-op when the LANGFUSE_* secrets are unset;
  // shares the utterance's session_id so it groups with the transcribe trace.
  const lf = langfuseFromEnv();
  const trace = lf.trace({
    name: 'voice.parse',
    userId: user.id,
    sessionId: body.session_id,
    input: { transcript, context: contextParsed.data, stt_source: body.stt_source ?? 'unknown' },
    tags: ['voice', 'parse'],
    metadata: { function: 'parse-utterance' },
  });
  const generation = trace.generation({
    name: 'parse.pipeline',
    model,
    input: { transcript, context: contextParsed.data },
  });

  try {
    const { result, telemetry } = await parseUtterance(
      transcript,
      contextParsed.data,
      { llm: new OpenAiLlm(model, openAiKey), catalog: new DbCatalog(db) }
    );

    // The pipeline makes 1–N internal LLM calls (extraction + per-exercise
    // resolution); telemetry is their aggregate, reported here as one generation.
    generation.end({
      output: result,
      usageDetails: {
        input: telemetry.tokens_in,
        output: telemetry.tokens_out,
        total: telemetry.tokens_in + telemetry.tokens_out,
      },
      costDetails: { total: telemetry.cost_usd },
      metadata: { llm_calls: telemetry.llm_calls, intent: result.intent },
    });
    trace.score({ name: 'parse_confidence', value: result.confidence });
    trace.end({ output: result, metadata: { intent: result.intent } });
    await lf.flush();

    const { data: log, error: logError } = await db
      .from('voice_logs')
      .insert({
        user_id: user.id,
        workout_id: body.workout_id ?? null,
        transcript,
        stt_source: body.stt_source ?? 'unknown',
        context: contextParsed.data,
        parsed: result,
        model: telemetry.model,
        tokens_in: telemetry.tokens_in,
        tokens_out: telemetry.tokens_out,
        latency_ms: telemetry.latency_ms,
        cost_usd: telemetry.cost_usd,
      })
      .select('id')
      .single();
    if (logError) console.error('voice_logs insert failed:', logError.message);

    // Grade parse faithfulness in the background (sampled; never blocks the reply).
    scheduleFaithfulnessJudge({ lf, trace, transcript, result, openAiKey });

    return json(200, { voice_log_id: log?.id ?? null, result, telemetry });
  } catch (err) {
    console.error('parse failed:', err);
    generation.end({
      level: 'ERROR',
      statusMessage: err instanceof Error ? err.message : String(err),
    });
    trace.update({ metadata: { error: true } });
    trace.end();
    await lf.flush();
    return json(502, {
      error: 'parse failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
