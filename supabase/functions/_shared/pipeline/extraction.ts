// LLM call #1: extract raw entities from the transcript. The model never sees
// exercise ids here — exercise_raw is resolved against the library downstream.
import { z } from 'zod';
import {
  ambiguityFieldSchema,
  intentSchema,
  setTypeSchema,
  unitSchema,
  type ParseContext,
} from '../parse-types.ts';
import { EXTRACTION_SYSTEM_PROMPT } from './prompts.ts';
import type { LlmClient, LlmUsage } from './llm.ts';

// LLM-facing schema. Structured-outputs constraints: strict objects, every
// field required (nullable instead of optional), no numeric min/max.
export const llmEntrySchema = z.strictObject({
  exercise_raw: z.string().nullable(),
  weight: z.number().nullable(),
  unit: unitSchema.nullable(),
  reps: z.number().int().nullable(),
  sets_count: z.number().int(),
  set_type: setTypeSchema,
  inherits_from_context: z.array(
    z.enum(['exercise', 'weight', 'reps', 'set_type'])
  ),
});

export const llmExtractionSchema = z.strictObject({
  intent: intentSchema,
  entries: z.array(llmEntrySchema),
  ambiguities: z.array(
    z.strictObject({
      entry_index: z.number().int(),
      field: ambiguityFieldSchema,
      question: z.string(),
    })
  ),
  confidence: z.number(),
});

export type LlmExtraction = z.infer<typeof llmExtractionSchema>;

const EXTRACTION_JSON_SCHEMA = z.toJSONSchema(llmExtractionSchema) as Record<
  string,
  unknown
>;

export async function extractEntities(
  llm: LlmClient,
  transcript: string,
  context: ParseContext
): Promise<{ extraction: LlmExtraction; usage: LlmUsage }> {
  const { json, usage } = await llm.completeJson({
    system: EXTRACTION_SYSTEM_PROMPT,
    user: JSON.stringify({ transcript, context }),
    schema: EXTRACTION_JSON_SCHEMA,
    maxTokens: 2048,
  });
  return { extraction: llmExtractionSchema.parse(json), usage };
}
