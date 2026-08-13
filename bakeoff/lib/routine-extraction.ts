/**
 * BAKEOFF-ONLY: transcript → { routine_name, exercise_mentions[] }. See
 * routine-prompt.ts for why this exists outside supabase/functions — the app
 * has no routine-creation pipeline yet. Structurally mirrors the real
 * extraction.ts (same LlmClient, same structured-outputs pattern) so it's an
 * honest preview, not a toy.
 */
import { z } from 'zod';
import type { LlmClient, LlmUsage } from '../../supabase/functions/_shared/pipeline/llm.ts';
import { ROUTINE_EXTRACTION_SYSTEM_PROMPT } from './routine-prompt.ts';

export const routineExtractionSchema = z.strictObject({
  routine_name: z.string().nullable(),
  exercise_mentions: z.array(z.string()),
});
export type RoutineExtraction = z.infer<typeof routineExtractionSchema>;

const ROUTINE_JSON_SCHEMA = z.toJSONSchema(routineExtractionSchema) as Record<string, unknown>;

export async function extractRoutine(
  llm: LlmClient,
  transcript: string
): Promise<{ extraction: RoutineExtraction; usage: LlmUsage }> {
  const { json, usage } = await llm.completeJson({
    system: ROUTINE_EXTRACTION_SYSTEM_PROMPT,
    user: JSON.stringify({ transcript }),
    schema: ROUTINE_JSON_SCHEMA,
    // A 12-exercise routine with evidence-ish mention strings can exceed 1024
    // (Groq's 01.m4a transcript hit the cap and threw "output truncated").
    maxTokens: 4096,
  });
  return { extraction: routineExtractionSchema.parse(json), usage };
}
