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
import { PrBanner } from '@/components/PrBadge';
import { SetKeypad } from '@/components/workout/SetKeypad';
import {
  useDeleteSet,
  useDeleteWorkout,
  useProfile,
  useUpdateSet,
  useWorkout,
  useWorkoutPrCounts,
} from '@/data/hooks';
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
  const prCounts = useWorkoutPrCounts();
  const [edit, setEdit] = useState<EditState | null>(null);

  if (workout.isLoading) return <Loading />;
  if (workout.error != null) return <ErrorText error={workout.error} />;
  if (!workout.data) return <Empty text="Workout not found." />;

  const detail = workout.data;
  const started = new Date(detail.started_at);
  const totalKg = detail.exercises.reduce(
    (sum, we) => sum + we.sets.reduce((s, set) => s + (set.weight_kg ?? 0) * (set.reps ?? 0), 0),
    0
  );

  const name = detail.title ?? detail.routine_name ?? 'Empty workout';
  const dateLabel = started.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' });
  const prCount = prCounts.data?.[detail.id] ?? 0;
  const volK = totalKg >= 1000 ? `${(totalKg / 1000).toFixed(1)}k` : `${Math.round(totalKg)}`;

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

  // The top-right "Edit" affordance (refined design). Editing a set is inline (tap a
  // row); this surfaces the whole-workout action that used to hide in the set sheet.
  function openWorkoutMenu() {
    Alert.alert(name, dateLabel, [
      { text: 'Delete workout', style: 'destructive', onPress: confirmDeleteWorkout },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.back}>History</Text>
          </Pressable>
          <Pressable onPress={openWorkoutMenu} hitSlop={10}>
            <Text style={styles.edit}>Edit</Text>
          </Pressable>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.date}>{dateLabel}</Text>
        {detail.notes ? <Text style={styles.notes}>{detail.notes}</Text> : null}

        {/* PRs + total volume — the two questions history answers (refined design). */}
        {prCount > 0 ? (
          <View style={styles.bannerWrap}>
            <PrBanner
              count={prCount}
              right={
                <Text style={styles.volNum}>
                  {volK}
                  <Text style={styles.volUnit}> kg</Text>
                </Text>
              }
            />
          </View>
        ) : (
          <View style={styles.volRow}>
            <Text style={styles.volLabel}>TOTAL VOLUME</Text>
            <Text style={styles.volNum}>
              {volK}
              <Text style={styles.volUnit}> kg</Text>
            </Text>
          </View>
        )}

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
                  {we.exercise.canonical_name}
                </Text>
                {top && <Text style={styles.blockTop}>top {formatWeight(top.weight_kg, unit)} {unit}</Text>}
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
                  <Text style={styles.setVol}>
                    {Math.round((set.weight_kg ?? 0) * (set.reps ?? 0))} {unit}
                  </Text>
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

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backChevron: { fontFamily: font.ui, fontSize: 17, color: color.t2, marginTop: -2 },
  back: { fontFamily: font.uiMedium, fontSize: 15, color: color.t2 },
  edit: { fontFamily: font.uiMedium, fontSize: 15, color: color.acc },

  title: { fontFamily: font.uiSemibold, fontSize: 30, color: color.t1, marginTop: space.lg, letterSpacing: -0.4 },
  date: { fontFamily: font.num, fontSize: 13, color: color.t2, marginTop: 8 },
  editHint: { fontFamily: font.num, fontSize: 10, letterSpacing: 0.4, color: color.t3, marginTop: space.xl },
  split: { marginTop: space.xl },
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

  bannerWrap: { marginTop: space.xl },
  volNum: { fontFamily: font.numMedium, fontSize: 16, color: color.t1 },
  volUnit: { fontFamily: font.num, fontSize: 12, color: color.t2 },
  volRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: color.s1,
    borderWidth: 1,
    borderColor: color.line,
  },
  volLabel: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.t3 },

  block: { marginTop: space.xxl },
  blockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.md,
    paddingBottom: 10,
  },
  blockTitle: { fontFamily: font.uiSemibold, fontSize: 17, color: color.t1, flex: 1, letterSpacing: -0.2 },
  blockTop: { fontFamily: font.num, fontSize: 12, color: color.t2, flexShrink: 0 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  setRowPressed: { backgroundColor: color.acc06 },
  setNum: { fontFamily: font.num, fontSize: 13, color: color.t3, width: 20 },
  setVal: { fontFamily: font.numMedium, fontSize: 15, color: color.t1, flex: 1 },
  setTag: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  setVol: { fontFamily: font.num, fontSize: 12, color: color.t3 },
});
