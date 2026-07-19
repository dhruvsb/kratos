// useVoiceSession — the commit state machine (mockup agent-notes 2h).
//
//   IDLE → PARSING (utterance heard, mic still open)
//        → COMMITTING (conf ≥ floor: 1.2s drain bar; "no"/tap cancels)
//        → COMMITTED (sets written + earcon + spoken echo; 6s undo window) → IDLE
//   conf < floor / ambiguity / unmatched → CLARIFY (TTS asks; screen may open
//        the correction drawer or exercise picker to finish).
//
// It owns the continuous mic (useSessionSpeech), routes control words locally
// for zero latency ("no"/"undo"/"mute"/"done"), and pushes everything else
// through the existing parse → confirm → undo repositories. Timeouts/thresholds
// are the `timing.*` config tokens, never inlined.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfirmVoiceEntries, useParseVoiceUtterance, useUndoVoiceSets } from '@/data/hooks';
import { STT_STRATEGY, useSessionSpeech } from '@/lib/stt';
import { earcon, speak, setMuted as setFeedbackMuted } from '@/lib/feedback';
import { timing } from '@/theme/tokens';
import {
  parseContextSchema,
  type AmbiguityField,
  type ParseResult,
  type SetType,
  type Unit,
} from '@/types/parse';
import type { ConfirmedEntry, VoiceParseResponse } from '@/data/voice';

export type CommitPhase =
  | 'idle'
  | 'parsing'
  | 'committing'
  | 'committed'
  | 'clarify'
  | 'error';

export type ChipState = 'lit' | 'dashed' | 'idle';
export interface HeardChip {
  key: string;
  label: string;
  state: ChipState;
}
export interface HeardPanel {
  transcript: string;
  confidence: number | null;
  chips: HeardChip[];
}
export interface CommittedEcho {
  exerciseName: string;
  weightKg: number | null;
  reps: number | null;
  setsCount: number;
  setNumber: number | null;
  setIds: string[];
  isPr: boolean;
}
export interface ClarifyState {
  question: string;
  field: AmbiguityField;
  entryIndex: number;
  /** True when the blocker is an unresolved exercise (screen opens the picker). */
  unmatched: boolean;
  response: VoiceParseResponse;
  transcript: string;
}

export interface SessionContextFields {
  currentExerciseId?: string | null;
  currentExerciseName?: string | null;
  lastSet?: { weight_kg: number; reps: number; set_type: SetType } | null;
  sessionExercises: string[];
  recentExercises?: string[];
  defaultUnit?: Unit;
  /** set_number the next committed set will land on (for the echo readout). */
  nextSetNumber?: number | null;
}

const CANCEL_WORDS = new Set(['no', 'nope', 'undo', 'cancel', 'scratch that', 'delete last']);
const FINISH_WORDS = new Set(['done', 'finish', 'finish workout', 'end workout']);

function chipsFromResult(result: ParseResult): HeardChip[] {
  const e = result.entries[0];
  if (!e) return [];
  const missing = new Set(result.ambiguities.filter((a) => a.entry_index === 0).map((a) => a.field));
  const exName = e.exercise.name ?? e.exercise.raw;
  return [
    {
      key: 'exercise',
      label: exName ? exName.toUpperCase() : '—',
      state: e.exercise.exercise_id ? 'lit' : 'dashed',
    },
    {
      key: 'weight',
      label: e.weight_kg != null ? `${e.weight_kg} KG` : '— KG',
      state: e.weight_kg != null ? 'lit' : missing.has('weight') ? 'dashed' : 'idle',
    },
    {
      key: 'reps',
      label: e.reps != null ? `× ${e.reps}` : '× —',
      state: e.reps != null ? 'lit' : missing.has('reps') ? 'dashed' : 'idle',
    },
  ];
}

function echoLine(e: ParseResult['entries'][number]): { full: string; numbers: string } {
  const w = e.weight_kg != null ? `${e.weight_kg}` : '';
  const r = e.reps != null ? `${e.reps}` : '';
  const nums = w && r ? `${w} for ${r}` : w || r || 'logged';
  return { full: `logged, ${nums}`, numbers: nums };
}

const REST_OVERRIDE_RE = /\brest (\d+)\b/;
const SKIP_REST_RE = /\bskip rest\b/;
const QUERY_RE = /^(what|how|plates)\b/;

export function useVoiceSession(args: {
  workoutId: string;
  enabled: boolean;
  context: SessionContextFields;
  onFinishRequested?: () => void;
  /** "rest 90" — local override, doesn't touch the parse pipeline. */
  onRestOverride?: (seconds: number) => void;
  /** "skip rest" */
  onSkipRest?: () => void;
  /** Anything matching QUERY_RE ("what did I bench last time", "how many sets left").
   *  Answered locally against existing repo queries — there's no `query` intent
   *  in ParseResult yet, so these never hit the LLM pipeline. */
  onQuery?: (transcript: string) => void;
}) {
  const { workoutId, enabled, onFinishRequested } = args;

  const parse = useParseVoiceUtterance();
  const confirm = useConfirmVoiceEntries(workoutId);
  const undoSets = useUndoVoiceSets(workoutId);

  const [phase, setPhase] = useState<CommitPhase>('idle');
  const [heard, setHeard] = useState<HeardPanel | null>(null);
  const [clarify, setClarify] = useState<ClarifyState | null>(null);
  const [committed, setCommitted] = useState<CommittedEcho | null>(null);
  const [drain, setDrain] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);

  // Refs the mic callback / timers read to avoid stale closures.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const committedRef = useRef(committed);
  committedRef.current = committed;
  const ctxRef = useRef(args.context);
  ctxRef.current = args.context;
  const onFinishRef = useRef(onFinishRequested);
  onFinishRef.current = onFinishRequested;
  const onRestOverrideRef = useRef(args.onRestOverride);
  onRestOverrideRef.current = args.onRestOverride;
  const onSkipRestRef = useRef(args.onSkipRest);
  onSkipRestRef.current = args.onSkipRest;
  const onQueryRef = useRef(args.onQuery);
  onQueryRef.current = args.onQuery;

  const drainTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ transcript: string; response: VoiceParseResponse } | null>(null);
  // Populated after the mic hook exists (below), so the segment handler can mute
  // without a forward reference to `session`.
  const setMutedRef = useRef<(muted: boolean) => void>(() => {});

  const clearDrain = useCallback(() => {
    if (drainTimer.current) clearInterval(drainTimer.current);
    drainTimer.current = null;
  }, []);
  const clearUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
  }, []);

  const buildContext = useCallback(() => {
    const c = ctxRef.current;
    return parseContextSchema.parse({
      current_exercise_id: c.currentExerciseId ?? null,
      current_exercise_name: c.currentExerciseName ?? null,
      last_set: c.lastSet ?? null,
      session_exercises: c.sessionExercises,
      recent_exercises: c.recentExercises ?? [],
      default_unit: c.defaultUnit ?? 'kg',
    });
  }, []);

  // --- commit + undo --------------------------------------------------------
  const doCommit = useCallback(
    async (transcript: string, response: VoiceParseResponse) => {
      clearDrain();
      const { result } = response;
      const entries: ConfirmedEntry[] = result.entries.map((e) => ({
        exerciseId: e.exercise.exercise_id!,
        weightKg: e.weight_kg,
        reps: e.reps,
        setsCount: e.sets_count,
        setType: e.set_type,
      }));
      try {
        const { createdSetIds } = await confirm.mutateAsync({
          voiceLogId: response.voice_log_id,
          transcript,
          confidence: result.confidence,
          outcome: 'accepted',
          entries,
        });
        const first = result.entries[0];
        const line = echoLine(first);
        earcon('commit');
        speak(line.full, { numbersOnly: line.numbers });
        setCommitted({
          exerciseName: (first.exercise.name ?? first.exercise.raw ?? '').toUpperCase(),
          weightKg: first.weight_kg,
          reps: first.reps,
          setsCount: first.sets_count,
          setNumber: ctxRef.current.nextSetNumber ?? null,
          setIds: createdSetIds,
          isPr: false, // PR detection is Phase 3 — never fabricate one here.
        });
        setPhase('committed');
        clearUndo();
        undoTimer.current = setTimeout(() => {
          setCommitted(null);
          setHeard(null);
          setPhase('idle');
        }, timing.undoWindowMs);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    },
    [confirm, clearDrain, clearUndo]
  );

  const cancelCommit = useCallback(() => {
    clearDrain();
    pending.current = null;
    setDrain(0);
    setHeard(null);
    setPhase('idle');
  }, [clearDrain]);

  const undo = useCallback(() => {
    const c = committedRef.current;
    if (!c) return;
    clearUndo();
    earcon('undo');
    speak('removed');
    setCommitted(null);
    setHeard(null);
    setPhase('idle');
    if (c.setIds.length) void undoSets.mutateAsync(c.setIds).catch(() => {});
  }, [clearUndo, undoSets]);

  const startCommitDrain = useCallback(
    (transcript: string, response: VoiceParseResponse) => {
      pending.current = { transcript, response };
      setPhase('committing');
      setDrain(0);
      const startedAt = Date.now();
      clearDrain();
      drainTimer.current = setInterval(() => {
        const p = (Date.now() - startedAt) / timing.commitHoldMs;
        if (p >= 1) {
          clearDrain();
          setDrain(1);
          const still = pending.current;
          pending.current = null;
          if (still) void doCommit(still.transcript, still.response);
        } else {
          setDrain(p);
        }
      }, 40);
    },
    [clearDrain, doCommit]
  );

  // --- parse result routing -------------------------------------------------
  const handleParsed = useCallback(
    (transcript: string, response: VoiceParseResponse) => {
      const { result } = response;
      if (result.entries.length === 0) {
        // Nothing loggable (e.g. a query or noise) — surface briefly, no commit.
        setHeard({ transcript, confidence: result.confidence, chips: [] });
        setPhase('idle');
        return;
      }
      const chips = chipsFromResult(result);
      const unmatched = result.entries.some((e) => e.exercise.exercise_id == null);
      const hasAmbiguity = result.ambiguities.length > 0;
      const lowConf = result.confidence < timing.confFloor;

      setHeard({ transcript, confidence: result.confidence, chips });

      if (unmatched || hasAmbiguity || lowConf) {
        const amb = result.ambiguities[0];
        const question =
          amb?.question ??
          (unmatched
            ? `Which exercise — I heard "${result.entries[0].exercise.raw}"?`
            : 'Sorry — could you say that again?');
        earcon('clarify');
        speak(question);
        setClarify({
          question,
          field: amb?.field ?? (unmatched ? 'exercise' : 'intent'),
          entryIndex: amb?.entry_index ?? 0,
          unmatched,
          response,
          transcript,
        });
        setPhase('clarify');
        return;
      }
      startCommitDrain(transcript, response);
    },
    [startCommitDrain]
  );

  const runParse = useCallback(
    async (transcript: string) => {
      setParseError(null);
      setClarify(null);
      setHeard({ transcript, confidence: null, chips: [] });
      setPhase('parsing');
      try {
        const context = buildContext();
        const response = await parse.mutateAsync({
          transcript,
          context,
          sttSource: STT_STRATEGY,
          workoutId,
        });
        handleParsed(transcript, response);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    },
    [buildContext, parse, workoutId, handleParsed]
  );

  // --- mic segment handler --------------------------------------------------
  const onSegment = useCallback(
    (raw: string) => {
      const t = raw.toLowerCase().trim();
      // Control words route locally (zero latency), regardless of parse state.
      if (CANCEL_WORDS.has(t)) {
        if (phaseRef.current === 'committing') return cancelCommit();
        if (committedRef.current) return undo();
        return;
      }
      if (t === 'mute') return setMutedRef.current(true);
      if (t === 'unmute') return setMutedRef.current(false);
      if (FINISH_WORDS.has(t)) return onFinishRef.current?.();
      if (SKIP_REST_RE.test(t)) return onSkipRestRef.current?.();
      const restMatch = t.match(REST_OVERRIDE_RE);
      if (restMatch) return onRestOverrideRef.current?.(parseInt(restMatch[1], 10));
      if (QUERY_RE.test(t)) return onQueryRef.current?.(raw);
      // Busy parsing/committing → ignore stray speech (drain is only ~1.2s).
      if (phaseRef.current === 'parsing' || phaseRef.current === 'committing') return;
      void runParse(raw);
    },
    // `session` is defined just below; it's stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cancelCommit, undo, runParse]
  );

  const session = useSessionSpeech({ onSegment });
  setMutedRef.current = session.setMuted;

  // Mirror mute into the feedback layer (so TTS/haptics also go quiet).
  useEffect(() => {
    setFeedbackMuted(session.muted);
  }, [session.muted]);

  // Start/stop the mic with the workout's active window.
  useEffect(() => {
    if (enabled) void session.start();
    else session.stop();
    return () => session.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    return () => {
      clearDrain();
      clearUndo();
    };
  }, [clearDrain, clearUndo]);

  // Screen-driven resolution of a CLARIFY (exercise picked / fields corrected in
  // the drawer). Commits the corrected entries and closes the clarify state.
  const commitResolved = useCallback(
    async (entries: ConfirmedEntry[], opts?: { answered?: boolean }) => {
      const cl = clarify;
      if (!cl) return;
      setClarify(null);
      try {
        const { createdSetIds } = await confirm.mutateAsync({
          voiceLogId: cl.response.voice_log_id,
          transcript: cl.transcript,
          confidence: cl.response.result.confidence,
          outcome: opts?.answered ? 'answered_question' : 'edited',
          entries,
        });
        const first = entries[0];
        earcon('commit');
        speak(`logged, ${first.weightKg ?? ''} for ${first.reps ?? ''}`.trim());
        setCommitted({
          exerciseName: '',
          weightKg: first?.weightKg ?? null,
          reps: first?.reps ?? null,
          setsCount: first?.setsCount ?? 1,
          setNumber: ctxRef.current.nextSetNumber ?? null,
          setIds: createdSetIds,
          isPr: false,
        });
        setPhase('committed');
        clearUndo();
        undoTimer.current = setTimeout(() => {
          setCommitted(null);
          setHeard(null);
          setPhase('idle');
        }, timing.undoWindowMs);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    },
    [clarify, confirm, clearUndo]
  );

  const dismiss = useCallback(() => {
    clearDrain();
    setClarify(null);
    setHeard(null);
    setParseError(null);
    setPhase('idle');
  }, [clearDrain]);

  return {
    // mic
    listening: session.listening,
    muted: session.muted,
    interim: session.interim,
    level: session.level,
    micError: session.error,
    startMic: session.start,
    stopMic: session.stop,
    setMuted: session.setMuted,
    // machine
    phase,
    heard,
    clarify,
    committed,
    drainProgress: drain,
    parseError,
    // actions
    cancelCommit,
    undo,
    dismiss,
    commitResolved,
    isCommitting: confirm.isPending,
  };
}
