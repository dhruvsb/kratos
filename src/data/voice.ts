// Voice logging repository: calls the parse-utterance edge function, writes
// confirmed sets, and keeps voice_logs' outcome/corrections in sync so the
// eval harness can later harvest real corrections (see eval/README.md).
import { supabase } from '@/lib/supabase';
import { addVoiceSet } from './sets';
import { voiceLogSchema, type SetType, type VoiceLog } from '@/types/db';
import type { ParseContext, ParseResult, ParseTelemetry } from '@/types/parse';

export interface VoiceParseResponse {
  voice_log_id: string | null;
  result: ParseResult;
  telemetry: ParseTelemetry;
}

/** Calls the parse-utterance edge function. Throws on non-2xx or a network error. */
export async function parseVoiceUtterance(input: {
  transcript: string;
  context: ParseContext;
  sttSource: string;
  workoutId?: string | null;
  /** Shared with the transcribe call so both traces group as one Langfuse session. */
  sessionId?: string;
}): Promise<VoiceParseResponse> {
  const { data, error } = await supabase.functions.invoke('parse-utterance', {
    body: {
      transcript: input.transcript,
      context: input.context,
      stt_source: input.sttSource,
      workout_id: input.workoutId ?? null,
      session_id: input.sessionId,
    },
  });
  if (error) throw error;
  return data as VoiceParseResponse;
}

export type ConfirmedEntry = {
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  setsCount: number;
  setType: SetType;
};

export type VoiceOutcome = 'accepted' | 'edited' | 'answered_question';

/**
 * Writes every confirmed entry as `setsCount` individual set rows
 * (logged_via='voice'), reusing or creating the workout_exercise for each
 * entry's exercise, then marks the voice_logs row with the final outcome.
 * Returns the created set ids per entry, for the undo snackbar.
 */
export async function confirmVoiceEntries(input: {
  workoutId: string;
  voiceLogId: string | null;
  transcript: string;
  confidence: number;
  outcome: VoiceOutcome;
  corrections?: Record<string, { from: unknown; to: unknown }>;
  entries: ConfirmedEntry[];
}): Promise<{ createdSetIds: string[] }> {
  const createdSetIds: string[] = [];

  for (const entry of input.entries) {
    const workoutExerciseId = await findOrCreateWorkoutExercise(
      input.workoutId,
      entry.exerciseId
    );
    for (let i = 0; i < entry.setsCount; i++) {
      const set = await addVoiceSet(workoutExerciseId, {
        weight_kg: entry.weightKg,
        reps: entry.reps,
        set_type: entry.setType,
        raw_transcript: input.transcript,
        parse_confidence: input.confidence,
      });
      createdSetIds.push(set.id);
    }
  }

  if (input.voiceLogId) {
    const { error } = await supabase
      .from('voice_logs')
      .update({ outcome: input.outcome, corrections: input.corrections ?? null })
      .eq('id', input.voiceLogId);
    if (error) throw error;
  }

  return { createdSetIds };
}

/** User dismissed the card without logging anything. */
export async function discardVoiceLog(voiceLogId: string | null): Promise<void> {
  if (!voiceLogId) return;
  const { error } = await supabase
    .from('voice_logs')
    .update({ outcome: 'discarded' })
    .eq('id', voiceLogId);
  if (error) throw error;
}

/** 10-second undo: deletes the sets a confirm just created. */
export async function undoVoiceSets(setIds: string[]): Promise<void> {
  if (setIds.length === 0) return;
  const { error } = await supabase.from('sets').delete().in('id', setIds);
  if (error) throw error;
}

/**
 * Saves the accepted exercise mapping as a new alias (source='llm') so the
 * same spoken phrase resolves instantly next time — AC #5 of the voice spec.
 */
export async function createExerciseAliasFromVoice(
  rawPhrase: string,
  exerciseId: string
): Promise<void> {
  const alias = rawPhrase.trim().toLowerCase();
  if (!alias) return;
  const { error } = await supabase
    .from('exercise_aliases')
    .upsert(
      { exercise_id: exerciseId, alias, source: 'llm' },
      { onConflict: 'exercise_id,alias', ignoreDuplicates: true }
    );
  if (error) throw error;
}

/** Most recent voice_logs rows, newest first — backs the telemetry screen's list. */
export async function listRecentVoiceLogs(limit = 50): Promise<VoiceLog[]> {
  const { data, error } = await supabase
    .from('voice_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return voiceLogSchema.array().parse(data ?? []);
}

/** Every voice_logs row since `sinceIso` — backs the telemetry screen's aggregates. */
export async function listVoiceLogsSince(sinceIso: string): Promise<VoiceLog[]> {
  const { data, error } = await supabase
    .from('voice_logs')
    .select('*')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return voiceLogSchema.array().parse(data ?? []);
}

async function findOrCreateWorkoutExercise(
  workoutId: string,
  exerciseId: string
): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from('workout_exercises')
    .select('id')
    .eq('workout_id', workoutId)
    .eq('exercise_id', exerciseId)
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id as string;

  const { data: last } = await supabase
    .from('workout_exercises')
    .select('position')
    .eq('workout_id', workoutId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('workout_exercises')
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      position: (last?.position ?? -1) + 1,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}
