import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { Btn, ErrorText, Loading } from '@/components/ui';
import {
  useAddExerciseToWorkout,
  useAddSet,
  useDeleteSet,
  useDiscardWorkout,
  useFinishWorkout,
  useLastSession,
  useMoveWorkoutExercise,
  useRemoveWorkoutExercise,
  useWorkout,
} from '@/data/hooks';
import type { WorkoutExerciseDetail } from '@/data/workouts';
import type { SetType } from '@/types/db';

const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const SET_TYPE_LABEL: Record<SetType, string> = {
  normal: 'N',
  warmup: 'W',
  drop: 'D',
  failure: 'F',
};

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const finish = useFinishWorkout(id!);
  const discard = useDiscardWorkout(id!);
  const addExercise = useAddExerciseToWorkout(id!);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (workout.isLoading) return <Loading />;
  if (workout.error != null) return <ErrorText error={workout.error} />;
  if (!workout.data) return null;

  const detail = workout.data;
  const isFinished = detail.ended_at != null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>
        {detail.routine_name ?? 'Empty workout'} · started{' '}
        {new Date(detail.started_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>

      {detail.exercises.length === 0 && (
        <Text style={styles.emptyText}>No exercises yet — add one below.</Text>
      )}

      {detail.exercises.map((we) => (
        <ExerciseBlock
          key={we.id}
          workoutId={id!}
          exercise={we}
          expanded={expandedId === we.id}
          onToggle={() => setExpandedId(expandedId === we.id ? null : we.id)}
          readOnly={isFinished}
        />
      ))}

      {!isFinished && (
        <>
          <Btn title="+ Add exercise" onPress={() => setPickerOpen(true)} />
          <Btn
            title={finish.isPending ? 'Finishing…' : 'Finish workout'}
            disabled={finish.isPending}
            onPress={() =>
              finish.mutate(undefined, { onSuccess: () => router.dismissTo('/') })
            }
          />
          <Btn
            title="Discard workout"
            onPress={() =>
              Alert.alert('Discard workout?', 'All sets logged this session are deleted.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Discard',
                  style: 'destructive',
                  onPress: () =>
                    discard.mutate(undefined, { onSuccess: () => router.dismissTo('/') }),
                },
              ])
            }
          />
        </>
      )}
      {finish.error != null && <ErrorText error={finish.error} />}

      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(exercise) => {
          setPickerOpen(false);
          addExercise.mutate(exercise.id, {
            onSuccess: (we) => setExpandedId(we.id),
          });
        }}
      />
    </ScrollView>
  );
}

/** One exercise in the session: sets so far, last-session panel, add-set row. */
function ExerciseBlock({
  workoutId,
  exercise: we,
  expanded,
  onToggle,
  readOnly,
}: {
  workoutId: string;
  exercise: WorkoutExerciseDetail;
  expanded: boolean;
  onToggle: () => void;
  readOnly: boolean;
}) {
  const lastSession = useLastSession(we.exercise_id, workoutId);
  const addSet = useAddSet(workoutId);
  const deleteSet = useDeleteSet(workoutId);
  const removeExercise = useRemoveWorkoutExercise(workoutId);
  const moveExercise = useMoveWorkoutExercise(workoutId);

  const prevSet = we.sets[we.sets.length - 1];
  // Inputs default to the previous set this session → 1-tap repeat logging.
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [setType, setSetType] = useState<SetType>('normal');
  const effectiveWeight = weight !== '' ? weight : (prevSet?.weight_kg?.toString() ?? '');
  const effectiveReps = reps !== '' ? reps : (prevSet?.reps?.toString() ?? '');

  function submitSet() {
    const w = parseFloat(effectiveWeight);
    const r = parseInt(effectiveReps, 10);
    addSet.mutate({
      workoutExerciseId: we.id,
      set: {
        weight_kg: Number.isFinite(w) ? w : null,
        reps: Number.isFinite(r) ? r : null,
        set_type: setType,
      },
    });
  }

  return (
    <View style={styles.block}>
      <Pressable onPress={onToggle} style={styles.blockHeader}>
        <Text style={styles.blockTitle}>
          {expanded ? '▾' : '▸'} {we.exercise.canonical_name}
        </Text>
        <Text style={styles.blockMeta}>{we.sets.length} sets</Text>
      </Pressable>

      {expanded && (
        <View style={styles.blockBody}>
          {/* This session's sets */}
          {we.sets.map((set) => (
            <View key={set.id} style={styles.setRow}>
              <Text style={styles.setText}>
                #{set.set_number} {set.weight_kg ?? '—'} kg × {set.reps ?? '—'}
                {set.set_type !== 'normal' ? `  [${SET_TYPE_LABEL[set.set_type]}]` : ''}
              </Text>
              {!readOnly && (
                <Btn small title="✕" onPress={() => deleteSet.mutate(set.id)} />
              )}
            </View>
          ))}
          {we.sets.length === 0 && (
            <Text style={styles.emptyText}>No sets logged yet.</Text>
          )}

          {/* LAST SESSION panel */}
          <View style={styles.lastSession}>
            <Text style={styles.lastSessionTitle}>
              LAST SESSION
              {lastSession.data?.[0]
                ? ` · ${new Date(lastSession.data[0].started_at).toLocaleDateString()}`
                : ''}
            </Text>
            {lastSession.isLoading && <Text style={styles.emptyText}>Loading…</Text>}
            {lastSession.data?.length === 0 && (
              <Text style={styles.emptyText}>First time doing this exercise.</Text>
            )}
            {(lastSession.data ?? []).map((set) => (
              <Text key={`${set.workout_id}-${set.set_number}`} style={styles.setText}>
                #{set.set_number} {set.weight_kg ?? '—'} kg × {set.reps ?? '—'}
                {set.set_type !== 'normal'
                  ? `  [${SET_TYPE_LABEL[set.set_type as SetType]}]`
                  : ''}
              </Text>
            ))}
          </View>

          {/* Add-set row */}
          {!readOnly && (
            <View style={styles.addSetRow}>
              <TextInput
                style={styles.setInput}
                value={effectiveWeight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="kg"
                placeholderTextColor="#999"
              />
              <Text style={styles.setSep}>×</Text>
              <TextInput
                style={styles.setInput}
                value={effectiveReps}
                onChangeText={setReps}
                keyboardType="number-pad"
                placeholder="reps"
                placeholderTextColor="#999"
              />
              <Btn
                small
                title={SET_TYPE_LABEL[setType]}
                onPress={() =>
                  setSetType(
                    SET_TYPES[(SET_TYPES.indexOf(setType) + 1) % SET_TYPES.length]
                  )
                }
              />
              <Btn
                title={addSet.isPending ? '…' : 'Add set'}
                disabled={addSet.isPending}
                onPress={submitSet}
              />
            </View>
          )}
          {addSet.error != null && <ErrorText error={addSet.error} />}

          {!readOnly && (
            <View style={styles.blockActions}>
              <Btn
                small
                title="↑"
                onPress={() =>
                  moveExercise.mutate({ workoutExerciseId: we.id, direction: 'up' })
                }
              />
              <Btn
                small
                title="↓"
                onPress={() =>
                  moveExercise.mutate({ workoutExerciseId: we.id, direction: 'down' })
                }
              />
              <Btn
                small
                title="Remove exercise"
                onPress={() => {
                  if (we.sets.length === 0) {
                    removeExercise.mutate(we.id);
                    return;
                  }
                  Alert.alert(
                    'Remove exercise?',
                    `This deletes ${we.sets.length} logged set(s).`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => removeExercise.mutate(we.id),
                      },
                    ]
                  );
                }}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 10 },
  header: { color: '#000', fontSize: 15 },
  emptyText: { color: '#666' },
  block: { borderWidth: 1, borderColor: '#ccc' },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
  },
  blockTitle: { fontSize: 16, color: '#000', flex: 1 },
  blockMeta: { fontSize: 12, color: '#666' },
  blockBody: { padding: 10, paddingTop: 0, gap: 8 },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setText: { color: '#000', fontSize: 15 },
  lastSession: { borderWidth: 1, borderColor: '#ddd', backgroundColor: '#f5f5f5', padding: 8 },
  lastSessionTitle: { fontSize: 11, color: '#666', marginBottom: 4 },
  addSetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setInput: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 8,
    width: 70,
    color: '#000',
    textAlign: 'center',
    fontSize: 16,
  },
  setSep: { color: '#666' },
  blockActions: { flexDirection: 'row', gap: 6 },
});
