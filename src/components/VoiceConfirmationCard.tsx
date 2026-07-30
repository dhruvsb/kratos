import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  useConfirmVoiceEntries,
  useCreateExerciseAliasFromVoice,
  useDeleteSet,
  useDiscardVoiceLog,
  useUndoVoiceSets,
  useUpdateSet,
} from '@/data/hooks';
import type { SetType } from '@/types/db';
import type { ParseResult } from '@/types/parse';
import type { VoiceParseResponse } from '@/data/voice';
import { ExercisePickerModal } from './ExercisePickerModal';
import { DrainBar, KeyCap, ParseChip } from './voice/primitives';
import { color, font, radius, shadow, space, timing, tracking } from '@/theme/tokens';

const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: 'NORMAL',
  warmup: 'WARMUP',
  drop: 'DROP',
  failure: 'FAILURE',
};

const UNDO_WINDOW_MS = 10_000;

type EditableEntry = {
  raw: string;
  exerciseId: string | null;
  exerciseName: string | null;
  weightKg: number | null;
  reps: number | null;
  setsCount: number;
  setType: SetType;
};

/** A previously-logged tape row, opened for a manual fix. */
export type EditableSet = {
  id: string;
  exerciseName: string;
  weightKg: number | null;
  reps: number | null;
  setType: SetType;
  setNumber: number;
};

function toEditable(result: ParseResult): EditableEntry[] {
  return result.entries.map((e: ParseResult['entries'][number]) => ({
    raw: e.exercise.raw,
    exerciseId: e.exercise.exercise_id,
    exerciseName: e.exercise.name,
    weightKg: e.weight_kg,
    reps: e.reps,
    setsCount: e.sets_count,
    setType: e.set_type,
  }));
}

/**
 * The Correction drawer — the mockup's "5% path": a bottom sheet over a dimmed
 * session tape where all the touch machinery for fixing a set lives, so the happy
 * (voice, auto-commit) path never sees it. Two entry points share this one sheet:
 *  - a mis-parsed HEARD result (`response` prop, Phase 2 spec flow — unchanged logic)
 *  - tapping an already-logged tape row (`editSet` prop — simple single-row edit)
 */
export function VoiceConfirmationCard({
  workoutId,
  transcript,
  response,
  editSet,
  autoCommit = false,
  onClose,
}: {
  workoutId: string;
  transcript: string;
  response: VoiceParseResponse | null;
  editSet?: EditableSet | null;
  /** Confident parses (no ambiguities, every exercise resolved) auto-commit after
   * a HEARD-panel drain instead of opening the full correction sheet. */
  autoCommit?: boolean;
  onClose: () => void;
}) {
  const visible = response != null || editSet != null;

  const [entries, setEntries] = useState<EditableEntry[]>([]);
  const [original, setOriginal] = useState<EditableEntry[]>([]);
  const [answeredAmbiguities, setAnsweredAmbiguities] = useState<Set<string>>(new Set());
  const [correctedExerciseAt, setCorrectedExerciseAt] = useState<Set<number>>(new Set());
  const [pickerForEntry, setPickerForEntry] = useState<number | null>(null);
  const [undoIds, setUndoIds] = useState<string[] | null>(null);
  // Once a parse is committed we keep this component mounted (sheet closed) so
  // the undo snackbar can live out its window — closing only when it elapses,
  // is undone, or a new parse arrives. Unmounting here is what used to eat undo.
  const [committed, setCommitted] = useState(false);

  const confirm = useConfirmVoiceEntries(workoutId);
  const discard = useDiscardVoiceLog();
  const undoSets = useUndoVoiceSets(workoutId);
  const createAlias = useCreateExerciseAliasFromVoice();
  const updateSet = useUpdateSet(workoutId);
  const deleteSet = useDeleteSet(workoutId);

  // Local editable copy of a tape-row edit (weight/reps/type only — exercise fixed).
  const [editWeight, setEditWeight] = useState<number | null>(null);
  const [editReps, setEditReps] = useState<number | null>(null);
  const [editType, setEditType] = useState<SetType>('normal');

  useEffect(() => {
    if (!response) return;
    const editable = toEditable(response.result);
    setEntries(editable);
    setOriginal(editable);
    setAnsweredAmbiguities(new Set());
    setCorrectedExerciseAt(new Set());
    // A fresh parse replaces any prior committed/undo state on this instance.
    setCommitted(false);
    setUndoIds(null);
  }, [response]);

  useEffect(() => {
    if (!editSet) return;
    setEditWeight(editSet.weightKg);
    setEditReps(editSet.reps);
    setEditType(editSet.setType);
  }, [editSet]);

  useEffect(() => {
    if (undoIds == null) return;
    const t = setTimeout(() => {
      setUndoIds(null);
      onClose();
    }, UNDO_WINDOW_MS);
    return () => clearTimeout(t);
    // onClose is a stable dismiss callback; re-subscribing on its identity would
    // reset the undo window on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoIds]);

  const result = response?.result ?? null;
  const canConfirm = entries.length > 0 && entries.every((e) => e.exerciseId != null);
  const ambiguityCount = result?.ambiguities.length ?? 0;
  const isHeard = response != null && !editSet && autoCommit && canConfirm && ambiguityCount === 0;

  const [drainProgress, setDrainProgress] = useState(0);
  const [drainCancelled, setDrainCancelled] = useState(false);

  useEffect(() => {
    setDrainProgress(0);
    setDrainCancelled(false);
    if (!isHeard) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const pct = Math.min(1, (Date.now() - start) / timing.commitHoldMs);
      setDrainProgress(pct);
      if (pct >= 1) clearInterval(interval);
    }, 40);
    const commit = setTimeout(() => {
      void handleConfirm();
    }, timing.commitHoldMs);
    return () => {
      clearInterval(interval);
      clearTimeout(commit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHeard, response]);

  if (!visible) return null;

  if (isHeard && !drainCancelled && !committed) {
    return (
      <View style={styles.heardPanel}>
        <View style={styles.heardHeader}>
          <Text style={styles.heardLabel}>HEARD</Text>
          <Text style={styles.heardConfidence}>
            CONFIDENCE {Math.round((result?.confidence ?? 0) * 100)}%
          </Text>
        </View>
        <Text style={styles.heardTranscript}>"{transcript}"</Text>
        <View style={styles.heardChips}>
          {entries[0] && (
            <>
              <ParseChip label={entries[0].exerciseName ?? entries[0].raw} />
              {entries[0].weightKg != null && (
                <ParseChip label={`${entries[0].weightKg} KG`} />
              )}
              {entries[0].reps != null && <ParseChip label={`× ${entries[0].reps}`} />}
            </>
          )}
        </View>
        <View style={{ marginTop: space.sm }}>
          <DrainBar progress={drainProgress} />
          <Pressable
            onPress={() => {
              setDrainCancelled(true);
              handleDiscard();
            }}
          >
            <View style={styles.heardCancelRow}>
              <Text style={styles.heardCancelHint}>COMMITTING · TAP TO CANCEL</Text>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  function updateEntry(index: number, patch: Partial<EditableEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function ambiguitiesFor(entryIndex: number) {
    return result?.ambiguities.filter((a) => a.entry_index === entryIndex) ?? [];
  }

  function answerAmbiguity(entryIndex: number, field: string, patch: Partial<EditableEntry>) {
    updateEntry(entryIndex, patch);
    setAnsweredAmbiguities((prev) => new Set(prev).add(`${entryIndex}.${field}`));
  }

  async function handleConfirm() {
    if (!response || !result) return;
    if (committed || confirm.isPending) return; // guard the auto-commit drain + taps
    const corrections: Record<string, { from: unknown; to: unknown }> = {};
    entries.forEach((e, i) => {
      const orig = original[i];
      if (!orig) return;
      (['weightKg', 'reps', 'setsCount', 'setType', 'exerciseId'] as const).forEach((field) => {
        if (e[field] !== orig[field]) {
          corrections[`entry${i}.${field}`] = { from: orig[field], to: e[field] };
        }
      });
    });

    const hasCorrections = Object.keys(corrections).length > 0;
    const outcome = hasCorrections
      ? 'edited'
      : answeredAmbiguities.size > 0
        ? 'answered_question'
        : 'accepted';

    const { createdSetIds } = await confirm.mutateAsync({
      voiceLogId: response.voice_log_id,
      transcript,
      confidence: result.confidence,
      outcome,
      corrections: hasCorrections ? corrections : undefined,
      entries: entries.map((e) => ({
        exerciseId: e.exerciseId!,
        weightKg: e.weightKg,
        reps: e.reps,
        setsCount: e.setsCount,
        setType: e.setType,
      })),
    });

    // Alias write-back is best-effort — the sets are already committed above, so
    // a failed "learn this phrase" (e.g. migration 0003 not yet applied) must not
    // block the commit or the undo window.
    try {
      for (const entryIndex of correctedExerciseAt) {
        const entry = entries[entryIndex];
        if (entry?.exerciseId) {
          await createAlias.mutateAsync({ rawPhrase: entry.raw, exerciseId: entry.exerciseId });
        }
      }
    } catch {
      /* non-critical: alias learning can fail without affecting the logged set */
    }

    // Close the sheet but stay mounted: the snackbar drives the undo window and
    // dismisses us (onClose) when it elapses, is undone, or a new parse lands.
    setCommitted(true);
    setUndoIds(createdSetIds);
  }

  function handleDiscard() {
    if (response) discard.mutate(response.voice_log_id);
    onClose();
  }

  function handleUndo() {
    if (undoIds) undoSets.mutate(undoIds);
    setUndoIds(null);
    onClose();
  }

  async function handleSaveEdit() {
    if (!editSet) return;
    await updateSet.mutateAsync({
      setId: editSet.id,
      patch: { weight_kg: editWeight, reps: editReps, set_type: editType },
    });
    onClose();
  }

  function handleDeleteEdit() {
    if (!editSet) return;
    deleteSet.mutate(editSet.id);
    onClose();
  }

  return (
    <>
      <Modal visible={visible && !committed} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <Pressable style={styles.backdropTap} onPress={onClose} />
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {editSet ? (
              <>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>
                    {editSet.exerciseName} · set {editSet.setNumber}
                  </Text>
                  <Pressable onPress={handleDeleteEdit}>
                    <Text style={styles.deleteLabel}>DELETE</Text>
                  </Pressable>
                </View>

                <View style={styles.editWell}>
                  <Stepper
                    value={editWeight}
                    unit="KG"
                    step={2.5}
                    big
                    onChange={setEditWeight}
                  />
                  <Stepper value={editReps} unit="REPS" step={1} onChange={setEditReps} />
                </View>

                <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
                  <KeyCap
                    label={SET_TYPE_LABEL[editType]}
                    tone="ghost"
                    onPress={() =>
                      setEditType(SET_TYPES[(SET_TYPES.indexOf(editType) + 1) % SET_TYPES.length])
                    }
                  />
                </View>

                <View style={styles.actionsRow}>
                  <KeyCap
                    label={updateSet.isPending ? 'SAVING…' : 'SAVE'}
                    tone="accent"
                    onPress={handleSaveEdit}
                    style={{ flex: 1 }}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>CORRECTION · "{transcript}"</Text>

                {entries.map((entry, index) => (
                  <View key={index} style={styles.entryCard}>
                    <Pressable onPress={() => setPickerForEntry(index)} style={styles.exerciseRow}>
                      <Text style={styles.exerciseName}>
                        {entry.exerciseName ?? `"${entry.raw}" — tap to match`}
                      </Text>
                      <Text style={styles.tapHint}>CHANGE</Text>
                    </Pressable>

                    {entry.exerciseId == null && (
                      <Text style={styles.unmatchedNote}>
                        Couldn't match "{entry.raw}" — pick above or create it as custom.
                      </Text>
                    )}

                    <View style={styles.editWell}>
                      <Stepper
                        value={entry.weightKg}
                        unit="KG"
                        step={2.5}
                        big
                        onChange={(v) => updateEntry(index, { weightKg: v })}
                      />
                      <Stepper
                        value={entry.reps}
                        unit="REPS"
                        step={1}
                        onChange={(v) => updateEntry(index, { reps: v })}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
                      <KeyCap
                        label={`${entry.setsCount} SET${entry.setsCount === 1 ? '' : 'S'}`}
                        tone="ghost"
                        size="sm"
                        onPress={() =>
                          updateEntry(index, { setsCount: entry.setsCount + 1 > 9 ? 1 : entry.setsCount + 1 })
                        }
                      />
                      <KeyCap
                        label={SET_TYPE_LABEL[entry.setType]}
                        tone="ghost"
                        size="sm"
                        onPress={() =>
                          updateEntry(index, {
                            setType: SET_TYPES[(SET_TYPES.indexOf(entry.setType) + 1) % SET_TYPES.length],
                          })
                        }
                      />
                    </View>

                    {ambiguitiesFor(index).map((a) => (
                      <AmbiguityChip
                        key={a.field}
                        question={a.question}
                        field={a.field}
                        onAnswerNumeric={(value) =>
                          answerAmbiguity(
                            index,
                            a.field,
                            a.field === 'weight'
                              ? { weightKg: value }
                              : a.field === 'reps'
                                ? { reps: value }
                                : a.field === 'sets_count'
                                  ? { setsCount: value ?? 1 }
                                  : {}
                          )
                        }
                      />
                    ))}
                  </View>
                ))}

                {entries.length === 0 && (
                  <Text style={styles.unmatchedNote}>
                    Nothing was logged from that utterance — discard and try again.
                  </Text>
                )}

                <View style={styles.actionsRow}>
                  <KeyCap label="DISCARD" tone="warn" onPress={handleDiscard} />
                  <KeyCap
                    label={confirm.isPending ? 'CONFIRMING…' : 'CONFIRM'}
                    tone="accent"
                    onPress={handleConfirm}
                    style={{ flex: 1 }}
                    labelStyle={!canConfirm ? { color: color.t3 } : undefined}
                  />
                </View>
                {confirm.error != null && (
                  <Text style={styles.errorText}>{confirm.error.message}</Text>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

      <ExercisePickerModal
        visible={pickerForEntry != null}
        onClose={() => setPickerForEntry(null)}
        onPick={(exercise) => {
          if (pickerForEntry == null) return;
          updateEntry(pickerForEntry, {
            exerciseId: exercise.id,
            exerciseName: exercise.canonical_name,
          });
          setCorrectedExerciseAt((prev) => new Set(prev).add(pickerForEntry));
          setPickerForEntry(null);
        }}
      />

      {undoIds != null && (
        <View style={styles.snackbar}>
          <Text style={styles.snackbarText}>LOGGED</Text>
          <Pressable onPress={handleUndo}>
            <Text style={styles.snackbarUndo}>UNDO</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

/** A −/+ stepper over a big LED-styled numeric readout (weight/reps in the drawer). */
function Stepper({
  value,
  unit,
  step,
  big = false,
  onChange,
}: {
  value: number | null;
  unit: string;
  step: number;
  big?: boolean;
  onChange: (v: number | null) => void;
}) {
  const display = value != null ? (Number.isInteger(value) ? String(value) : value.toFixed(1)) : '—';
  const size = big ? 46 : 38;
  return (
    <View style={styles.stepperRow}>
      <Pressable
        style={[styles.stepperKey, { width: size, height: size }]}
        onPress={() => onChange(Math.max(0, (value ?? 0) - step))}
      >
        <Text style={styles.stepperKeyLabel}>−</Text>
      </Pressable>
      <View style={styles.stepperValueWrap}>
        <Text style={[styles.stepperValue, { fontSize: big ? 32 : 24 }]}>{display}</Text>
        <Text style={styles.stepperUnit}>{unit}</Text>
      </View>
      <Pressable
        style={[styles.stepperKey, { width: size, height: size }]}
        onPress={() => onChange((value ?? 0) + step)}
      >
        <Text style={styles.stepperKeyLabel}>+</Text>
      </Pressable>
    </View>
  );
}

function AmbiguityChip({
  question,
  field,
  onAnswerNumeric,
}: {
  question: string;
  field: string;
  onAnswerNumeric: (value: number | null) => void;
}) {
  const [value, setValue] = useState('');
  const numericField = field === 'weight' || field === 'reps' || field === 'sets_count';
  return (
    <View style={styles.chip}>
      <Text style={styles.chipQuestion}>{question}</Text>
      {numericField ? (
        <View style={styles.chipAnswerRow}>
          <TextInput
            style={styles.chipInput}
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder="answer"
            placeholderTextColor={color.t3}
          />
          <KeyCap
            label="OK"
            size="sm"
            tone="accent"
            onPress={() => onAnswerNumeric(value === '' ? null : parseFloat(value))}
          />
        </View>
      ) : (
        <Text style={styles.chipHint}>Edit the field above to resolve this.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,9,0.7)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: color.s1,
    borderTopWidth: 1,
    borderColor: color.line2,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: space.lg,
    paddingBottom: space.xxl,
    gap: space.md,
    maxHeight: '86%',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.line2,
    alignSelf: 'center',
    marginBottom: space.xs,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontFamily: font.uiSemibold, fontSize: 14, color: color.t1, letterSpacing: tracking.label },
  deleteLabel: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.hot2 },

  entryCard: {
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.sm,
  },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontFamily: font.uiSemibold, fontSize: 15, color: color.t1, flex: 1 },
  tapHint: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.t3 },
  unmatchedNote: { fontFamily: font.num, fontSize: 12, color: color.t2 },

  editWell: {
    backgroundColor: color.sin,
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.md,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperKey: {
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.key,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.key,
  },
  stepperKeyLabel: { fontFamily: font.numSemibold, fontSize: 18, color: color.t1 },
  stepperValueWrap: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 },
  stepperValue: { fontFamily: font.numBold, color: color.t1, letterSpacing: tracking.tight },
  stepperUnit: { fontFamily: font.numSemibold, fontSize: 10, color: color.t3 },

  chip: {
    borderWidth: 1,
    borderColor: color.acc,
    backgroundColor: color.acc06,
    borderRadius: radius.card,
    padding: space.sm,
    gap: space.xs,
  },
  chipQuestion: { fontFamily: font.num, fontSize: 13, color: color.t1 },
  chipHint: { fontFamily: font.num, fontSize: 11, color: color.t3 },
  chipAnswerRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  chipInput: {
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.chip,
    padding: 6,
    width: 70,
    color: color.t1,
    fontFamily: font.num,
  },

  actionsRow: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },

  snackbar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.acc,
    borderRadius: radius.card,
    padding: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shadow.glowSm,
  },
  snackbarText: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.t1 },
  snackbarUndo: { fontFamily: font.numBold, fontSize: 11, letterSpacing: tracking.label, color: color.acc },
  errorText: { fontFamily: font.num, fontSize: 12, color: color.hot2 },

  heardPanel: {
    backgroundColor: color.sin,
    borderWidth: 1,
    borderColor: color.acc,
    borderRadius: radius.card,
    padding: space.md,
    gap: space.sm,
    ...shadow.glowSm,
  },
  heardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  heardLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.acc },
  heardConfidence: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.label, color: color.t3 },
  heardTranscript: { fontFamily: font.num, fontSize: 14, color: color.t2 },
  heardChips: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  heardCancelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  heardCancelHint: { fontFamily: font.numSemibold, fontSize: 8.5, letterSpacing: tracking.label, color: color.t3 },
});
