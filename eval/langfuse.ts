/**
 * Langfuse client for the Node eval scripts (push-dataset.ts, run.ts --langfuse).
 *
 * These run under `tsx` in a normal Node process — unlike the Edge Functions, which
 * use the hand-rolled Deno client in `supabase/functions/_shared/observability/` —
 * so here we use the official `langfuse` SDK, which has first-class Dataset +
 * dataset-run support (getDataset / createDatasetItem / item.link) that would be
 * fragile to hand-roll. It's a devDependency, only ever loaded by these Node scripts,
 * never bundled into the Expo client (so the "no keys in client code" rule holds).
 *
 * Reads the SAME three env vars as the Edge Functions, from `.env`:
 *   LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL
 */
import { Langfuse } from 'langfuse';

/** Canonical name of the golden eval dataset inside Langfuse. */
export const GOLDEN_DATASET = 'kratos-golden-v1';

/**
 * Stable, project-unique id for a golden case's dataset item. Langfuse upserts
 * dataset items on their id, so reusing this makes `push-dataset` idempotent —
 * re-running it updates items in place instead of duplicating them.
 */
export function datasetItemId(caseId: string): string {
  return `${GOLDEN_DATASET}:${caseId}`;
}

/**
 * Build a Langfuse client from `.env`, or return null when the LANGFUSE_* secrets
 * are absent — callers decide whether that's a hard error (the dataset/experiment
 * scripts) or a silent skip.
 */
export function makeLangfuse(): Langfuse | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return null;
  const baseUrl = (process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com').replace(/\/+$/, '');
  return new Langfuse({ publicKey, secretKey, baseUrl });
}

/** Human-readable hint for the "keys not set" failure, shared by the scripts. */
export const LANGFUSE_ENV_HINT =
  'Set LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY (and optionally LANGFUSE_BASE_URL) in .env — ' +
  'the same key pair you set as Supabase secrets. Get them from Langfuse → Settings → API Keys.';
