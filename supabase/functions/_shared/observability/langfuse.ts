// Langfuse observability for the Phase 2 voice pipeline.
//
// WHY hand-rolled instead of the `langfuse` npm SDK: that SDK is built around
// OpenTelemetry + a background flush loop and Node built-ins, none of which fit
// the Supabase Edge (Deno) request/response lifecycle — in edge you must flush
// *before* the response returns, there is no long-lived process to drain a queue.
// So this is a small, dependency-free client that speaks Langfuse's public batch
// ingestion API directly (`POST /api/public/ingestion`, HTTP Basic auth with the
// public+secret key pair). Stable, no dependency risk, full control.
//
// SAFE BY DEFAULT: if the LANGFUSE_* secrets are absent the client is a no-op —
// every method still works, `flush()` sends nothing, and the Edge Function behaves
// exactly as it did before. Instrumentation must never break the request path, so
// `flush()` also swallows its own network/HTTP errors (logged, never thrown).
//
// Secrets (set once, shared by both voice functions):
//   supabase secrets set LANGFUSE_PUBLIC_KEY=pk-lf-...
//   supabase secrets set LANGFUSE_SECRET_KEY=sk-lf-...
//   supabase secrets set LANGFUSE_BASE_URL=https://cloud.langfuse.com   # or your self-host URL

const DEFAULT_BASE_URL = 'https://cloud.langfuse.com';

export type LangfuseLevel = 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

interface IngestionEvent {
  id: string;
  type: string;
  timestamp: string;
  body: Record<string, unknown>;
}

export interface TraceInit {
  name: string;
  userId?: string;
  sessionId?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  tags?: string[];
  /** Deployment marker (e.g. git sha) — read from LANGFUSE_RELEASE when set. */
  release?: string;
}

export interface GenerationInit {
  name: string;
  model?: string;
  modelParameters?: Record<string, unknown>;
  input?: unknown;
  metadata?: Record<string, unknown>;
  /** ISO string; defaults to now(). */
  startTime?: string;
}

export interface GenerationEnd {
  output?: unknown;
  /** Token/second counts, e.g. { input, output, total } or { seconds }. */
  usageDetails?: Record<string, number>;
  /** USD costs, e.g. { input, output, total }. */
  costDetails?: Record<string, number>;
  level?: LangfuseLevel;
  statusMessage?: string;
  metadata?: Record<string, unknown>;
  /** ISO string; defaults to now(). */
  endTime?: string;
}

export interface ScoreInit {
  name: string;
  value: number;
  comment?: string;
  observationId?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Read config from Edge secrets. Returns null (→ disabled no-op) when unset. */
function configFromEnv(): LangfuseConfig | null {
  const publicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY');
  const secretKey = Deno.env.get('LANGFUSE_SECRET_KEY');
  if (!publicKey || !secretKey) return null;
  const baseUrl = (Deno.env.get('LANGFUSE_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  return { publicKey, secretKey, baseUrl };
}

/**
 * Create a Langfuse client from the environment. Always returns a usable object;
 * when the secrets are missing it is a fully-functional no-op (`enabled === false`)
 * so call sites never need a null check.
 */
export function langfuseFromEnv(): Langfuse {
  return new Langfuse(configFromEnv());
}

export class Langfuse {
  readonly enabled: boolean;
  private readonly events: IngestionEvent[] = [];
  private readonly release?: string;

  constructor(private readonly config: LangfuseConfig | null) {
    this.enabled = config !== null;
    this.release = Deno.env.get('LANGFUSE_RELEASE') ?? undefined;
  }

  /** Open a trace (one voice utterance). Enqueues nothing until `.end()`. */
  trace(init: TraceInit): LangfuseTrace {
    return new LangfuseTrace(this, crypto.randomUUID(), {
      release: this.release,
      ...init,
    });
  }

  /** Internal: buffer an event (dropped entirely when disabled). */
  push(event: IngestionEvent): void {
    if (this.enabled) this.events.push(event);
  }

  /**
   * Send every buffered event as a single ingestion batch. MUST be awaited before
   * the Edge Function returns. Never throws — a monitoring outage must not turn a
   * successful transcription into a 5xx.
   */
  async flush(): Promise<void> {
    if (!this.enabled || !this.config || this.events.length === 0) return;
    const batch = this.events.splice(0, this.events.length);
    const auth = btoa(`${this.config.publicKey}:${this.config.secretKey}`);
    try {
      const res = await fetch(`${this.config.baseUrl}/api/public/ingestion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({ batch }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error(`langfuse ingestion failed: ${res.status} ${detail}`.trim());
      }
    } catch (err) {
      console.error('langfuse flush error:', err instanceof Error ? err.message : err);
    }
  }
}

export class LangfuseTrace {
  private output?: unknown;
  private extraMetadata?: Record<string, unknown>;

  constructor(
    private readonly client: Langfuse,
    readonly id: string,
    private readonly init: TraceInit & { release?: string }
  ) {}

  /** Start a generation (LLM call) under this trace. Enqueues on `.end()`. */
  generation(init: GenerationInit): LangfuseGeneration {
    return new LangfuseGeneration(this.client, this.id, crypto.randomUUID(), init);
  }

  /** Attach a numeric score to the whole trace (e.g. parse confidence 0–1). */
  score(init: ScoreInit): void {
    this.client.push({
      id: crypto.randomUUID(),
      type: 'score-create',
      timestamp: nowIso(),
      body: {
        id: crypto.randomUUID(),
        traceId: this.id,
        name: init.name,
        value: init.value,
        ...(init.comment ? { comment: init.comment } : {}),
        ...(init.observationId ? { observationId: init.observationId } : {}),
      },
    });
  }

  /** Set the trace-level output/metadata (folded in when `.end()` fires). */
  update(fields: { output?: unknown; metadata?: Record<string, unknown> }): void {
    if (fields.output !== undefined) this.output = fields.output;
    if (fields.metadata) this.extraMetadata = { ...this.extraMetadata, ...fields.metadata };
  }

  /** Finalize the trace event. Call once, before `flush()`. */
  end(fields?: { output?: unknown; metadata?: Record<string, unknown> }): void {
    if (fields) this.update(fields);
    const metadata = { ...(this.init.metadata ?? {}), ...(this.extraMetadata ?? {}) };
    this.client.push({
      id: crypto.randomUUID(),
      type: 'trace-create',
      timestamp: nowIso(),
      body: {
        id: this.id,
        name: this.init.name,
        ...(this.init.userId ? { userId: this.init.userId } : {}),
        ...(this.init.sessionId ? { sessionId: this.init.sessionId } : {}),
        ...(this.init.input !== undefined ? { input: this.init.input } : {}),
        ...(this.output !== undefined ? { output: this.output } : {}),
        ...(this.init.tags ? { tags: this.init.tags } : {}),
        ...(this.init.release ? { release: this.init.release } : {}),
        ...(Object.keys(metadata).length ? { metadata } : {}),
      },
    });
  }
}

export class LangfuseGeneration {
  private readonly startTime: string;

  constructor(
    private readonly client: Langfuse,
    private readonly traceId: string,
    readonly id: string,
    private readonly init: GenerationInit
  ) {
    this.startTime = init.startTime ?? nowIso();
  }

  /** Finalize this LLM call (output, usage, cost, level). Call once. */
  end(fields: GenerationEnd = {}): void {
    const metadata = { ...(this.init.metadata ?? {}), ...(fields.metadata ?? {}) };
    this.client.push({
      id: crypto.randomUUID(),
      type: 'generation-create',
      timestamp: nowIso(),
      body: {
        id: this.id,
        traceId: this.traceId,
        name: this.init.name,
        startTime: this.startTime,
        endTime: fields.endTime ?? nowIso(),
        ...(this.init.model ? { model: this.init.model } : {}),
        ...(this.init.modelParameters ? { modelParameters: this.init.modelParameters } : {}),
        ...(this.init.input !== undefined ? { input: this.init.input } : {}),
        ...(fields.output !== undefined ? { output: fields.output } : {}),
        ...(fields.usageDetails ? { usageDetails: fields.usageDetails } : {}),
        ...(fields.costDetails ? { costDetails: fields.costDetails } : {}),
        ...(fields.level ? { level: fields.level } : {}),
        ...(fields.statusMessage ? { statusMessage: fields.statusMessage } : {}),
        ...(Object.keys(metadata).length ? { metadata } : {}),
      },
    });
  }
}
