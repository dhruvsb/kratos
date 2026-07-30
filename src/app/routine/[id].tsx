// Routine editor (mockup 02) — create ("new") or edit: name, ordered exercises,
// optional per-exercise targets. Same screen for both; the workout screen just
// shows "last time" when a target is left blank.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { ErrorText, Loading } from '@/components/ui';
import { useRoutine } from '@/data/hooks';
import { createRoutine, setRoutineExercises, updateRoutine } from '@/data/routines';
import { useQueryClient } from '@tanstack/react-query';
import type { Exercise } from '@/types/db';
import { color, font, radius, shadow, space, tracking } from '@/theme/tokens';

type Item = {
  exercise: Exercise;
  target_sets: string; // kept as text while editing; parsed on save
  target_reps_low: string;
  target_reps_high: string;
};

export default function RoutineEditorScreen() {
  const insets = useSafeAreaInsets();
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

  function patchItem(index: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function parseIntOrNull(text: string): number | null {
    const n = parseInt(text, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function save(nextArchived?: boolean) {
    setSaving(true);
    setError(null);
    try {
      const routineId = isNew ? (await createRoutine(name || 'Untitled routine')).id : id!;
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
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.navLink}>← BACK</Text>
          </Pressable>
          {!isNew && (
            <Pressable onPress={() => save(!archived)} hitSlop={10} disabled={saving}>
              <Text style={styles.navLink}>{archived ? 'UNARCHIVE' : 'ARCHIVE'}</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.label}>ROUTINE NAME</Text>
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Push · A"
          placeholderTextColor={color.t3}
          selectionColor={color.acc}
        />

        <View style={styles.exHeadRow}>
          <Text style={styles.label}>EXERCISES · ORDER = WORKOUT ORDER</Text>
          <Text style={styles.labelDim}>SETS × REPS</Text>
        </View>

        {items.length === 0 && (
          <Text style={styles.emptyText}>No exercises yet — add your first below.</Text>
        )}

        {items.map((item, index) => (
          <View key={`${item.exercise.id}-${index}`} style={styles.itemRow}>
            <Text style={styles.itemNum}>{index + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.exercise.canonical_name}
              </Text>
              <Text style={styles.itemMeta}>
                {[item.exercise.primary_muscles?.[0], item.exercise.equipment]
                  .filter(Boolean)
                  .join(' · ')
                  .toUpperCase() || 'EXERCISE'}
              </Text>
            </View>
            <View style={styles.targets}>
              <TextInput
                style={styles.tInput}
                value={item.target_sets}
                onChangeText={(t) => patchItem(index, { target_sets: t })}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={color.t3}
                selectionColor={color.acc}
              />
              <Text style={styles.tSep}>×</Text>
              <TextInput
                style={styles.tInput}
                value={item.target_reps_low}
                onChangeText={(t) => patchItem(index, { target_reps_low: t })}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={color.t3}
                selectionColor={color.acc}
              />
              <Text style={styles.tSep}>–</Text>
              <TextInput
                style={styles.tInput}
                value={item.target_reps_high}
                onChangeText={(t) => patchItem(index, { target_reps_high: t })}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={color.t3}
                selectionColor={color.acc}
              />
            </View>
            <View style={styles.rowBtns}>
              <Pressable onPress={() => move(index, -1)} hitSlop={6}><Text style={styles.rowBtn}>↑</Text></Pressable>
              <Pressable onPress={() => move(index, 1)} hitSlop={6}><Text style={styles.rowBtn}>↓</Text></Pressable>
              <Pressable onPress={() => setItems((p) => p.filter((_, i) => i !== index))} hitSlop={6}>
                <Text style={[styles.rowBtn, { color: color.warn }]}>✕</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable style={styles.addEx} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addExText}>+ ADD EXERCISE</Text>
        </Pressable>

        <Text style={styles.note}>
          Targets are optional. Leave them blank and the workout screen just shows what you did last time.
        </Text>

        {error != null && <ErrorText error={error} />}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Pressable
          style={[styles.save, (saving || (isNew && !name.trim() && items.length === 0)) && styles.saveOff]}
          disabled={saving || (isNew && !name.trim() && items.length === 0)}
          onPress={() => save()}
        >
          <Text style={styles.saveText}>{saving ? 'SAVING…' : 'SAVE ROUTINE'}</Text>
        </Pressable>
        <Pressable style={styles.cancel} onPress={() => router.back()} disabled={saving}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </Pressable>
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: 0 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  navLink: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },

  label: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3, marginTop: space.xl },
  labelDim: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: 0.6, color: color.t3, marginTop: space.xl },
  nameInput: {
    fontFamily: font.uiBold,
    fontSize: 19,
    color: color.t1,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.acc35,
  },

  exHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  emptyText: { fontFamily: font.num, fontSize: 12, color: color.t3, marginTop: space.md },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  itemNum: { fontFamily: font.numSemibold, fontSize: 9.5, color: color.t3, width: 16 },
  itemName: { fontFamily: font.uiSemibold, fontSize: 13, color: color.t1 },
  itemMeta: { fontFamily: font.num, fontSize: 9, letterSpacing: 0.6, color: color.t3, marginTop: 4 },
  targets: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tInput: {
    width: 26,
    fontFamily: font.numSemibold,
    fontSize: 12,
    color: color.t1,
    textAlign: 'center',
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: color.line2,
  },
  tSep: { fontFamily: font.num, fontSize: 11, color: color.t3 },
  rowBtns: { flexDirection: 'row', gap: 10, marginLeft: 4 },
  rowBtn: { fontFamily: font.numSemibold, fontSize: 14, color: color.t2 },

  addEx: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.acc35,
    borderRadius: radius.ctl,
    marginTop: space.xl,
  },
  addExText: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.acc },
  note: { fontFamily: font.num, fontSize: 10.5, lineHeight: 17, color: color.t3, marginTop: space.lg },

  footer: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  save: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.acc35,
    borderRadius: radius.ctl + 1,
    ...shadow.glowSm,
  },
  saveOff: { borderColor: color.line2, ...({ shadowOpacity: 0 } as object) },
  saveText: { fontFamily: font.uiSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.acc },
  cancel: {
    width: 96,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.ctl + 1,
  },
  cancelText: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3 },
});
