import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  useConfirmVoiceEntries,
  useCreateExerciseAliasFromVoice,
  useDiscardVoiceLog,
  useUndoVoiceSets,
} from '@/data/hooks';
import type { SetType } from '@/types/db';
import type { ParseResult } from '@/types/parse';
import type { VoiceParseResponse } from '@/data/voice';
import { Btn, ErrorText } from './ui';
import { ExercisePickerModal } from './ExercisePickerModal';

const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: 'Normal',
  warmup: 'Warmup',
  drop: 'Drop',
  failure: 'Failure',
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
 * The voice logging confirmation card (Phase 2 spec, prompt 2.3): one mini-card
 * per parsed entry, every field tap-editable, ambiguities render as question
 * chips, unmatched exercises get a create/pick flow. Confirm writes sets and
 * closes; a 10s undo snackbar follows.
 */
export function VoiceConfirmationCard({
  visible,
  workoutId,
  transcript,
  response,
  onClose,
}: {
  visible: boolean;
  workoutId: string;
  transcript: string;
  response: VoiceParseResponse | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<EditableEntry[]>([]);
  const [original, setOriginal] = useState<EditableEntry[]>([]);
  const [answeredAmbiguities, setAnsweredAmbiguities] = useState<Set<string>>(new Set());
  const [correctedExerciseAt, setCorrectedExerciseAt] = useState<Set<number>>(new Set());
  const [pickerForEntry, setPickerForEntry] = useState<number | null>(null);
  const [undoIds, setUndoIds] = useState<string[] | null>(null);

  const confirm = useConfirmVoiceEntries(workoutId);
  const discard = useDiscardVoiceLog();
  const undoSets = useUndoVoiceSets(workoutId);
  const createAlias = useCreateExerciseAliasFromVoice();

  // Reset local editable state whenever a new parse result comes in.
  useEffect(() => {
    if (!response) return;
    const editable = toEditable(response.result);
    setEntries(editable);
    setOriginal(editable);
    setAnsweredAmbiguities(new Set());
    setCorrectedExerciseAt(new Set());
  }, [response]);

  // Auto-expire the undo window.
  useEffect(() => {
    if (undoIds == null) return;
    const t = setTimeout(() => setUndoIds(null), UNDO_WINDOW_MS);
    return () => clearTimeout(t);
  }, [undoIds]);

  if (!visible || !response) return null;

  const { result } = response;
  const canConfirm = entries.length > 0 && entries.every((e) => e.exerciseId != null);

  function updateEntry(index: number, patch: Partial<EditableEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function answerAmbiguity(entryIndex: number, field: string, patch: Partial<EditableEntry>) {
    updateEntry(entryIndex, patch);
    setAnsweredAmbiguities((prev) => new Set(prev).add(`${entryIndex}.${field}`));
  }

  function ambiguitiesFor(entryIndex: number) {
    return result.ambiguities.filter((a) => a.entry_index === entryIndex);
  }

  async function handleConfirm() {
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
      voiceLogId: response!.voice_log_id,
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

    for (const entryIndex of correctedExerciseAt) {
      const entry = entries[entryIndex];
      if (entry?.exerciseId) {
        await createAlias.mutateAsync({ rawPhrase: entry.raw, exerciseId: entry.exerciseId });
      }
    }

    setUndoIds(createdSetIds);
    onClose();
  }

  function handleDiscard() {
    discard.mutate(response!.voice_log_id);
    onClose();
  }

  function handleUndo() {
    if (undoIds) undoSets.mutate(undoIds);
    setUndoIds(null);
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={handleDiscard}>
        <View style={styles.container}>
          <Text style={styles.title}>Confirm voice log</Text>
          <Text style={styles.transcript}>"{transcript}"</Text>

          {entries.map((entry, index) => (
            <View key={index} style={styles.entryCard}>
              <Pressable onPress={() => setPickerForEntry(index)} style={styles.exerciseRow}>
                <Text style={styles.exerciseName}>
                  {entry.exerciseName ?? `"${entry.raw}" — tap to match`}
                </Text>
                <Text style={styles.tapHint}>tap to change</Text>
              </Pressable>

              {entry.exerciseId == null && (
                <Text style={styles.unmatchedNote}>
                  Couldn't match "{entry.raw}" to an exercise. Pick one above or create it as
                  custom.
                </Text>
              )}

              <View style={styles.fieldRow}>
                <Field label="kg">
                  <TextInput
                    style={styles.fieldInput}
                    value={entry.weightKg?.toString() ?? ''}
                    onChangeText={(t) =>
                      updateEntry(index, { weightKg: t === '' ? null : parseFloat(t) || null })
                    }
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor="#999"
                  />
                </Field>
                <Field label="reps">
                  <TextInput
                    style={styles.fieldInput}
                    value={entry.reps?.toString() ?? ''}
                    onChangeText={(t) =>
                      updateEntry(index, { reps: t === '' ? null : parseInt(t, 10) || null })
                    }
                    keyboardType="number-pad"
                    placeholder="—"
                    placeholderTextColor="#999"
                  />
                </Field>
                <Field label="sets">
                  <View style={styles.stepper}>
                    <Btn
                      small
                      title="−"
                      onPress={() =>
                        updateEntry(index, { setsCount: Math.max(1, entry.setsCount - 1) })
                      }
                    />
                    <Text style={styles.stepperValue}>{entry.setsCount}</Text>
                    <Btn
                      small
                      title="+"
                      onPress={() => updateEntry(index, { setsCount: entry.setsCount + 1 })}
                    />
                  </View>
                </Field>
                <Field label="type">
                  <Btn
                    small
                    title={SET_TYPE_LABEL[entry.setType]}
                    onPress={() =>
                      updateEntry(index, {
                        setType:
                          SET_TYPES[(SET_TYPES.indexOf(entry.setType) + 1) % SET_TYPES.length],
                      })
                    }
                  />
                </Field>
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

          <View style={styles.actions}>
            <Btn title="Discard" onPress={handleDiscard} />
            <Btn
              title={confirm.isPending ? 'Confirming…' : 'Confirm'}
              disabled={!canConfirm || confirm.isPending}
              onPress={handleConfirm}
            />
          </View>
          {confirm.error != null && <ErrorText error={confirm.error} />}
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
          <Text style={styles.snackbarText}>Logged.</Text>
          <Btn small title="Undo" onPress={handleUndo} />
        </View>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
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
            placeholderTextColor="#999"
          />
          <Btn
            small
            title="OK"
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
  container: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 12 },
  title: { fontSize: 18, color: '#000' },
  transcript: { color: '#666', fontStyle: 'italic' },
  entryCard: { borderWidth: 1, borderColor: '#ccc', padding: 10, gap: 8 },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 16, color: '#000', flex: 1 },
  tapHint: { fontSize: 11, color: '#999' },
  unmatchedNote: { color: '#666', fontSize: 13 },
  fieldRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  field: { alignItems: 'center', gap: 2 },
  fieldLabel: { fontSize: 11, color: '#666' },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 6,
    width: 60,
    color: '#000',
    textAlign: 'center',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepperValue: { fontSize: 16, color: '#000', width: 20, textAlign: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#f5f5f5',
    padding: 8,
    gap: 6,
  },
  chipQuestion: { color: '#000', fontSize: 14 },
  chipHint: { color: '#666', fontSize: 12 },
  chipAnswerRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chipInput: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 6,
    width: 70,
    color: '#000',
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto' },
  snackbar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: '#000',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  snackbarText: { color: '#fff' },
});
