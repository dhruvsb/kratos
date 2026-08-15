// Past workout (mockups 09 / 17) — session detail with the same set typography as
// the live grid, and the same correction sheet: tap any set to fix its weight/reps
// or delete it weeks later, or delete the whole workout if it's the wrong day.
// Edits reuse the optimistic set hooks (they key off the shared workout cache, so a
// finished session patches instantly just like the active one).
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { MuscleSplit } from '@/components/MuscleSplit';
import { PrBanner } from '@/components/PrBadge';
import { SetKeypad } from '@/components/workout/SetKeypad';
import {
  useDeleteSet,
  useDeleteWorkout,
  useProfile,
  useRenameWorkout,
  useUpdateSet,
  useWorkout,
  useWorkoutPrCounts,
} from '@/data/hooks';
import type { WorkoutSet, Unit, ExerciseModality } from '@/types/db';
import { formatSetByModality, formatWeight } from '@/lib/units';
import { muscleSplit } from '@/lib/muscleSplit';
import { font, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type EditState = {
  setId: string;
  exerciseName: string;
  setNumber: number;
  modality: ExerciseModality;
  kg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  level: number | null;
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
  const renameWorkout = useRenameWorkout(id!);
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

  // The top-right "Edit" affordance (feedback #48). Opens the full logging workflow
  // on this finished session — the live set grid + keypad, add/remove exercises,
  // add/edit/delete sets — by re-using the active-workout screen in edit mode
  // (`?edit=1`; the workout stays finished, ended_at untouched). Quick single-set
  // fixes still work inline here (tap a row); this is the broader editor.
  function openEditor() {
    router.push(`/workout/${detail.id}?edit=1`);
  }

  // Tap the title to name the session (feedback #51) — chiefly for ad-hoc empty
  // workouts that otherwise read as a bare "Empty workout" with no name. Prefilled
  // with the current title (blank when it's the default); a blank/whitespace submit
  // clears it back to null so it falls back to routine_name / "Empty workout".
  // Alert.prompt is iOS-only (this app ships iOS only).
  function promptRename() {
    if (Platform.OS !== 'ios') return;
    Alert.prompt(
      'Name this workout',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (value?: string) => {
            const next = value?.trim() ? value.trim() : null;
            if (next === (detail.title ?? null)) return;
            renameWorkout.mutate(next, {
              onError: (e) => Alert.alert("Couldn't rename workout", e.message),
            });
          },
        },
      ],
      'plain-text',
      detail.title ?? ''
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backChevron}>‹</Text>
            <Text style={styles.back}>History</Text>
          </Pressable>
          <Pressable onPress={openEditor} hitSlop={10}>
            <Text style={styles.edit}>Edit</Text>
          </Pressable>
        </View>

        <Pressable onPress={promptRename} hitSlop={8} disabled={Platform.OS !== 'ios'}>
          <Text style={styles.title} numberOfLines={2}>
            {name}
          </Text>
        </Pressable>
        {Platform.OS === 'ios' ? <Text style={styles.renameHint}>Tap title to rename</Text> : null}
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
          <Text style={styles.editHint}>Tap a set to fix it · Edit to add or remove.</Text>
        )}

        {detail.exercises.map((we) => {
          const modality = we.exercise.modality;
          // "Top" set depends on what the exercise measures: heaviest weight, most reps,
          // or the longest hold/cardio time — so it isn't a bare "—" for non-weight work.
          const top = we.sets.reduce<WorkoutSet | null>((best, s) => {
            switch (modality) {
              case 'bodyweight_reps':
                return (s.reps ?? 0) > (best?.reps ?? -1) ? s : best;
              case 'weighted_bodyweight': {
                // Heaviest added load, reps break ties (bodyweight sets = 0 load).
                const sw = s.weight_kg ?? 0;
                const bw = best?.weight_kg ?? -1;
                if (sw > bw) return s;
                if (sw === bw && (s.reps ?? 0) > (best?.reps ?? -1)) return s;
                return best;
              }
              case 'time':
              case 'distance_time':
                return (s.duration_seconds ?? 0) > (best?.duration_seconds ?? -1) ? s : best;
              case 'weight_reps':
              default:
                return (s.weight_kg ?? 0) > (best?.weight_kg ?? -1) ? s : best;
            }
          }, null);
          return (
            <View key={we.id} style={styles.block}>
              <Pressable style={styles.blockHead} onPress={() => router.push(`/exercise/${we.exercise_id}`)}>
                <Text style={styles.blockTitle} numberOfLines={1}>
                  {we.exercise.canonical_name}
                </Text>
                {top && (
                  <Text style={styles.blockTop}>
                    {modality === 'weight_reps'
                      ? `top ${formatWeight(top.weight_kg, unit)} ${unit}`
                      : `top ${formatSetByModality(top, modality, unit)}`}
                  </Text>
                )}
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
                      modality,
                      kg: set.weight_kg,
                      reps: set.reps,
                      durationSeconds: set.duration_seconds,
                      level: set.level,
                    })
                  }
                >
                  <Text style={styles.setNum}>{i + 1}</Text>
                  <Text style={styles.setVal}>{formatSetByModality(set, modality, unit)}</Text>
                  {/* Warmup carries no visible trace (feedback #31); drop/failure tags stay
                      for imported (Hevy) data that can still contain them. */}
                  {set.set_type !== 'normal' && set.set_type !== 'warmup' && (
                    <Text style={styles.setTag}>{set.set_type.toUpperCase()}</Text>
                  )}
                  {/* Per-set volume is meaningful only for weight×reps work; hide the "0 kg"
                      badge for bodyweight / time / cardio sets. */}
                  {modality === 'weight_reps' && (
                    <Text style={styles.setVol}>
                      {Math.round((set.weight_kg ?? 0) * (set.reps ?? 0))} {unit}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {edit && (
        <SetKeypad
          visible
          modality={edit.modality}
          exerciseName={edit.exerciseName}
          setNumber={edit.setNumber}
          unit={unit}
          lastSet={null}
          initialKg={edit.kg}
          initialReps={edit.reps}
          initialDurationSeconds={edit.durationSeconds ?? null}
          initialLevel={edit.level ?? null}
          mode="edit"
          onLog={({ weightKg, reps, durationSeconds, level }) => {
            updateSet.mutate({
              setId: edit.setId,
              patch: { weight_kg: weightKg, reps, duration_seconds: durationSeconds, level },
            });
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
  renameHint: { fontFamily: font.num, fontSize: 10, letterSpacing: 0.4, color: color.t3, marginTop: 6 },
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
