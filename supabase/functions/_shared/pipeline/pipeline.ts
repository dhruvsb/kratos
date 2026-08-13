// The full parse pipeline: extraction (LLM #1) → exercise resolution
// (alias / trigram / LLM #2) → ParseResult + telemetry. This module is the
// single production code path — the edge function and the eval harness both
// call parseUtterance with different ExerciseCatalog/LlmClient injections.
import type {
  ParseContext,
  ParseEntry,
  ParsedExercise,
  ParsedRoutine,
  ParseResult,
  ParseTelemetry,
} from '../parse-types.ts';
import { extractEntities, type LlmExtraction } from './extraction.ts';
import { resolveExercise, type ExerciseCatalog } from './resolution.ts';
import { costUsd } from './prices.ts';
import type { LlmClient, LlmUsage } from './llm.ts';

export interface ParseDeps {
  llm: LlmClient;
  catalog: ExerciseCatalog;
}

const LB_TO_KG = 0.45359237;

function toKg(
  weight: number | null,
  unitSpoken: 'kg' | 'lb' | null,
  defaultUnit: 'kg' | 'lb'
): number | null {
  if (weight == null) return null;
  const unit = unitSpoken ?? defaultUnit;
  const kg = unit === 'lb' ? weight * LB_TO_KG : weight;
  return Math.round(kg * 100) / 100; // numeric(6,2) in the DB
}

export async function parseUtterance(
  transcript: string,
  context: ParseContext,
  deps: ParseDeps
): Promise<{ result: ParseResult; telemetry: ParseTelemetry }> {
  const startedAt = Date.now();
  const usages: LlmUsage[] = [];
  let llmCalls = 0;

  const { extraction, usage: extractionUsage } = await extractEntities(
    deps.llm,
    transcript,
    context
  );
  usages.push(extractionUsage);
  llmCalls++;

  const onUsage = (usage: LlmUsage) => {
    usages.push(usage);
    llmCalls++;
  };

  // Routine-creation intent (design "Voice Logging" 1a): no sets to build — resolve
  // each spoken exercise name to the library the same way logged sets are, and
  // return the routine payload instead of entries.
  let entries: ParseEntry[] = [];
  let routine: ParsedRoutine | null = null;
  if (extraction.intent === 'create_routine') {
    const exercises: ParsedExercise[] = [];
    for (const spoken of extraction.routine.exercise_names) {
      const resolved = await resolveExercise(spoken, context, deps.catalog, deps.llm);
      if (resolved.usage) onUsage(resolved.usage);
      exercises.push(resolved.exercise);
    }
    routine = { name: extraction.routine.name, exercises };
  } else {
    for (const raw of extraction.entries) {
      entries.push(await buildEntry(raw, extraction, context, deps, onUsage));
    }
  }

  const result: ParseResult = {
    intent: extraction.intent,
    entries,
    routine,
    ambiguities: extraction.ambiguities.filter(
      (ambiguity) =>
        ambiguity.entry_index >= 0 &&
        (ambiguity.entry_index < entries.length || entries.length === 0)
    ),
    confidence: Math.max(0, Math.min(1, extraction.confidence)),
  };

  const tokensIn = usages.reduce((sum, usage) => sum + usage.inputTokens, 0);
  const tokensOut = usages.reduce((sum, usage) => sum + usage.outputTokens, 0);

  return {
    result,
    telemetry: {
      model: deps.llm.model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      latency_ms: Date.now() - startedAt,
      cost_usd: costUsd(deps.llm.model, tokensIn, tokensOut),
      llm_calls: llmCalls,
    },
  };
}

async function buildEntry(
  raw: LlmExtraction['entries'][number],
  extraction: LlmExtraction,
  context: ParseContext,
  deps: ParseDeps,
  onUsage: (usage: LlmUsage) => void
): Promise<ParseEntry> {
  const inheritsExercise =
    raw.inherits_from_context.includes('exercise') || raw.exercise_raw == null;

  let exercise: ParseEntry['exercise'];
  if (inheritsExercise && context.current_exercise_id) {
    // Came straight from session context — a confident hit, no lookup needed.
    exercise = {
      raw: raw.exercise_raw ?? context.current_exercise_name ?? '',
      exercise_id: context.current_exercise_id,
      name: context.current_exercise_name ?? null,
      resolution: 'alias',
    };
  } else if (raw.exercise_raw) {
    const resolved = await resolveExercise(
      raw.exercise_raw,
      context,
      deps.catalog,
      deps.llm
    );
    if (resolved.usage) onUsage(resolved.usage);
    exercise = resolved.exercise;
  } else {
    // No name spoken and no context to inherit from — the extraction prompt
    // should already have raised an 'exercise' ambiguity for this entry.
    exercise = { raw: '', exercise_id: null, name: null, resolution: 'unmatched', candidates: [] };
  }

  return {
    exercise,
    weight_kg: toKg(raw.weight, raw.unit, context.default_unit),
    unit_spoken: raw.unit,
    reps: raw.reps,
    sets_count: raw.sets_count >= 1 ? raw.sets_count : 1,
    set_type: raw.set_type,
    inherits_from_context: raw.inherits_from_context,
  };
}
