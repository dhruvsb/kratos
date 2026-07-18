import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { Btn, ErrorText, Loading } from '@/components/ui';
import { useRoutine } from '@/data/hooks';
import { createRoutine, setRoutineExercises, updateRoutine } from '@/data/routines';
import { useQueryClient } from '@tanstack/react-query';
import type { Exercise } from '@/types/db';

type Item = {
  exercise: Exercise;
  target_sets: string; // kept as text while editing; parsed on save
  target_reps_low: string;
  target_reps_high: string;
};

/** Create ("new") or edit a routine: name, ordered exercises, optional targets. */
export default function RoutineEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const existing = useRoutine(isNew ? undefined : id);
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [archived, setArchived] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loadedFromServer, setLoadedFromServer] = useState(false);

  // Populate the form once when the existing routine arrives.
  useEffect(() => {
    if (isNew || !existing.data || loadedFromServer) return;
    setName(existing.data.name);
    setArchived(existing.data.archived);
    setItems(
      existing.data.exercises.map((re) => ({
        exercise: re.exercise,
        target_sets: re.target_sets?.toString() ?? '',
        target_reps_low: re.target_reps_low?.toString() ?? '',
        target_reps_high: re.target_reps_high?.toString() ?? '',
      }))
    );
    setLoadedFromServer(true);
  }, [isNew, existing.data, loadedFromServer]);

  function move(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function parseIntOrNull(text: string): number | null {
    const n = parseInt(text, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function save(nextArchived?: boolean) {
    setSaving(true);
    setError(null);
    try {
      const routineId = isNew
        ? (await createRoutine(name || 'Untitled routine')).id
        : id!;
      if (!isNew) {
        await updateRoutine(routineId, {
          name: name || 'Untitled routine',
          archived: nextArchived ?? archived,
        });
      }
      await setRoutineExercises(
        routineId,
        items.map((item) => ({
          exercise_id: item.exercise.id,
          target_sets: parseIntOrNull(item.target_sets),
          target_reps_low: parseIntOrNull(item.target_reps_low),
          target_reps_high: parseIntOrNull(item.target_reps_high),
        }))
      );
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      queryClient.invalidateQueries({ queryKey: ['routine', routineId] });
      router.back();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error != null) return <ErrorText error={existing.error} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Routine name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Push A"
        placeholderTextColor="#999"
      />

      <Text style={styles.label}>Exercises (order = workout order)</Text>
      {items.length === 0 && <Text style={styles.emptyText}>No exercises yet.</Text>}
      {items.map((item, index) => (
        <View key={`${item.exercise.id}-${index}`} style={styles.itemRow}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemName}>
              {index + 1}. {item.exercise.canonical_name}
            </Text>
            <View style={styles.itemButtons}>
              <Btn small title="↑" onPress={() => move(index, -1)} />
              <Btn small title="↓" onPress={() => move(index, 1)} />
              <Btn
                small
                title="✕"
                onPress={() => setItems((prev) => prev.filter((_, i) => i !== index))}
              />
            </View>
          </View>
          <View style={styles.targetsRow}>
            <TextInput
              style={styles.targetInput}
              value={item.target_sets}
              onChangeText={(t) =>
                setItems((prev) =>
                  prev.map((p, i) => (i === index ? { ...p, target_sets: t } : p))
                )
              }
              keyboardType="number-pad"
              placeholder="sets"
              placeholderTextColor="#999"
            />
            <Text style={styles.targetSep}>×</Text>
            <TextInput
              style={styles.targetInput}
              value={item.target_reps_low}
              onChangeText={(t) =>
                setItems((prev) =>
                  prev.map((p, i) => (i === index ? { ...p, target_reps_low: t } : p))
                )
              }
              keyboardType="number-pad"
              placeholder="reps"
              placeholderTextColor="#999"
            />
            <Text style={styles.targetSep}>–</Text>
            <TextInput
              style={styles.targetInput}
              value={item.target_reps_high}
              onChangeText={(t) =>
                setItems((prev) =>
                  prev.map((p, i) => (i === index ? { ...p, target_reps_high: t } : p))
                )
              }
              keyboardType="number-pad"
              placeholder="reps"
              placeholderTextColor="#999"
            />
          </View>
        </View>
      ))}

      <Btn title="+ Add exercise" onPress={() => setPickerOpen(true)} />
      <Btn
        title={saving ? 'Saving…' : 'Save routine'}
        disabled={saving || (isNew && !name.trim() && items.length === 0)}
        onPress={() => save()}
      />
      {!isNew && (
        <Btn
          title={archived ? 'Unarchive routine' : 'Archive routine'}
          disabled={saving}
          onPress={() => save(!archived)}
        />
      )}
      {error != null && <ErrorText error={error} />}

      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(exercise) => {
          setItems((prev) => [
            ...prev,
            { exercise, target_sets: '', target_reps_low: '', target_reps_high: '' },
          ]);
          setPickerOpen(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 10 },
  label: { color: '#000', fontSize: 16 },
  input: { borderWidth: 1, borderColor: '#000', padding: 10, fontSize: 16, color: '#000' },
  emptyText: { color: '#666' },
  itemRow: { borderWidth: 1, borderColor: '#ccc', padding: 8, gap: 6 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { flex: 1, color: '#000', fontSize: 15 },
  itemButtons: { flexDirection: 'row', gap: 4 },
  targetsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  targetInput: {
    borderWidth: 1,
    borderColor: '#999',
    padding: 6,
    width: 60,
    color: '#000',
    textAlign: 'center',
  },
  targetSep: { color: '#666' },
});
