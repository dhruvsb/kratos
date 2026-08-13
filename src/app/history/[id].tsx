// Past workout (mockups 09 / 17) — session detail with the same set typography as
// the live grid, and the same correction sheet: tap any set to fix its weight/reps
// or delete it weeks later, or delete the whole workout if it's the wrong day.
// Edits reuse the optimistic set hooks (they key off the shared workout cache, so a
// finished session patches instantly just like the active one).
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { MuscleSplit } from '@/components/MuscleSplit';
import { SetKeypad } from '@/components/workout/SetKeypad';
import { useDeleteSet, useDeleteWorkout, useProfile, useUpdateSet, useWorkout } from '@/data/hooks';
import type { WorkoutSet, Unit } from '@/types/db';
import { formatSet, formatWeight } from '@/lib/units';
import { muscleSplit } from '@/lib/muscleSplit';
import { font, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type EditState = {
  setId: string;
  exerciseName: string;
  setNumber: number;
  kg: number | null;
  reps: number | null;
};

export default function WorkoutDetailScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const profile = useProfile();
  const unit: Unit = profile.data?.default_unit ?? 'kg';
  const updateSet = useUpdateSet(id!);
  const deleteSet = useDeleteSet(id!);
  const deleteWorkout = useDeleteWorkout(id!);
  const [edit, setEdit] = useState<EditState | null>(null);

  if (workout.isLoading) return <Loading />;
  if (workout.error != null) return <ErrorText error={workout.error} />;
  if (!workout.data) return <Empty text="Workout not found." />;

  const detail = workout.data;
  const started = new Date(detail.started_at);
  const ended = detail.ended_at ? new Date(detail.ended_at) : null;
  const durationMin = ended ? Math.round((ended.getTime() - started.getTime()) / 60000) : null;
  const totalKg = detail.exercises.reduce(
    (sum, we) => sum + we.sets.reduce((s, set) => s + (set.weight_kg ?? 0) * (set.reps ?? 0), 0),
    0
  );

  const meta = [
    detail.title ?? detail.routine_name ?? 'Empty workout',
    durationMin != null ? `${durationMin} MIN` : 'IN PROGRESS',
    `${Math.round(totalKg).toLocaleString()} KG`,
  ]
    .join(' · ')
    .toUpperCase();

  const split = muscleSplit(
    detail.exercises.map((we) => ({
      primaryMuscles: we.exercise.primary_muscles ?? [],
      secondaryMuscles: we.exercise.secondary_muscles ?? [],
      setCount: we.sets.length,
    }))
  );

  function confirmDeleteWorkout() {
    setEdit(null);
    Alert.alert('Delete this workout?', 'The whole session and every set in it are removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteWorkout.mutate(undefined, { onSuccess: () => router.back() }),
      },
    ]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← HISTORY</Text>
        </Pressable>
        <Text style={styles.title}>
          {started.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
        {detail.notes ? <Text style={styles.notes}>{detail.notes}</Text> : null}

        {split.length > 0 && (
          <View style={styles.split}>
            <MuscleSplit regions={split} />
          </View>
        )}

        {detail.exercises.length === 0 ? (
          <Empty text="No exercises in this workout." />
        ) : (
          <Text style={styles.editHint}>Tap any set to fix it.</Text>
        )}

        {detail.exercises.map((we) => {
          const top = we.sets.reduce<WorkoutSet | null>(
            (best, s) => ((s.weight_kg ?? 0) > (best?.weight_kg ?? -1) ? s : best),
            null
          );
          return (
            <View key={we.id} style={styles.block}>
              <Pressable style={styles.blockHead} onPress={() => router.push(`/exercise/${we.exercise_id}`)}>
                <Text style={styles.blockTitle} numberOfLines={1}>
                  {we.exercise.canonical_name.toUpperCase()}
                </Text>
                {top && <Text style={styles.blockTop}>TOP {formatWeight(top.weight_kg, unit)}</Text>}
              </Pressable>
              {we.sets.map((set, i) => (
                <Pressable
                  key={set.id}
                  style={({ pressed }) => [styles.setRow, pressed && styles.setRowPressed]}
                  onPress={() =>
                    setEdit({
                      setId: set.id,
                      exerciseName: we.exercise.canonical_name,
                      setNumber: set.set_number,
                      kg: set.weight_kg,
                      reps: set.reps,
                    })
                  }
                >
                  <Text style={styles.setNum}>{i + 1}</Text>
                  <Text style={styles.setVal}>{formatSet(set.weight_kg, set.reps, unit)}</Text>
                  {/* Warmup carries no visible trace (feedback #31); drop/failure tags stay
                      for imported (Hevy) data that can still contain them. */}
                  {set.set_type !== 'normal' && set.set_type !== 'warmup' && (
                    <Text style={styles.setTag}>{set.set_type.toUpperCase()}</Text>
                  )}
                  <Text style={styles.setEdit}>EDIT</Text>
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {edit && (
        <SetKeypad
          visible
          exerciseName={edit.exerciseName}
          setNumber={edit.setNumber}
          unit={unit}
          initialKg={edit.kg}
          initialReps={edit.reps}
          mode="edit"
          onLog={(weightKg, reps) => {
            updateSet.mutate({ setId: edit.setId, patch: { weight_kg: weightKg, reps } });
            setEdit(null);
          }}
          onDelete={() => {
            deleteSet.mutate(edit.setId);
            setEdit(null);
          }}
          onDeleteWorkout={confirmDeleteWorkout}
          onClose={() => setEdit(null)}
        />
      )}
    </View>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xxl, paddingBottom: space.xxl },
  back: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },
  title: { fontFamily: font.uiSemibold, fontSize: 21, color: color.t1, marginTop: space.lg },
  meta: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: 0.8, color: color.t2, marginTop: 7 },
  editHint: { fontFamily: font.num, fontSize: 10, letterSpacing: 0.4, color: color.t3, marginTop: space.md },
  split: { marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: color.line },
  notes: {
    fontFamily: font.num,
    fontSize: 11.5,
    lineHeight: 18,
    color: color.t3,
    marginTop: space.md,
    paddingLeft: 11,
    borderLeftWidth: 1,
    borderLeftColor: color.line2,
  },

  block: { marginTop: space.xxl },
  blockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: color.line2,
  },
  blockTitle: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: 0.8, color: color.t1, flex: 1 },
  blockTop: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    borderStyle: 'dashed',
  },
  setRowPressed: { backgroundColor: color.acc06 },
  setNum: { fontFamily: font.numSemibold, fontSize: 9.5, color: color.t3, width: 20 },
  setVal: { fontFamily: font.numBold, fontSize: 15, color: color.t1, flex: 1 },
  setTag: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  setEdit: { fontFamily: font.numSemibold, fontSize: 8.5, letterSpacing: tracking.label, color: color.t3 },
});
