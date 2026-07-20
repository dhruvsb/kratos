// Voice console — the mockup's in-hand active-workout screen. Sets append to a
// flight-recorder "session tape"; voice logging auto-commits through the HEARD
// panel (VoiceMicButton/VoiceConfirmationCard) with no confirm button on the
// happy path. Tapping a tape row opens the Correction drawer (the 5% path) for
// a manual fix. Floor mode is a full-screen overlay triggered by the FLOOR key
// or by laying the phone face-up on a flat surface (see FloorMode.tsx).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { VoiceConfirmationCard, type EditableSet } from '@/components/VoiceConfirmationCard';
import { VoiceMicButton } from '@/components/VoiceMicButton';
import { FloorMode } from '@/components/voice/FloorMode';
import { InsetWell, KeyCap, LedDigits, LevelMeter, StatusPip } from '@/components/voice/primitives';
import {
  useAddExerciseToWorkout,
  useDiscardWorkout,
  useFinishWorkout,
  useLastSession,
  useProfile,
  useWorkout,
} from '@/data/hooks';
import type { WorkoutExerciseDetail } from '@/data/workouts';
import type { WorkoutSet } from '@/types/db';
import { color, font, space, tracking } from '@/theme/tokens';

type TapeRow = {
  set: WorkoutSet;
  exercise: WorkoutExerciseDetail;
};

function formatElapsed(startedAt: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const profile = useProfile();
  const finish = useFinishWorkout(id!);
  const discard = useDiscardWorkout(id!);
  const addExercise = useAddExerciseToWorkout(id!);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [editSet, setEditSet] = useState<{ row: TapeRow } | null>(null);
  const [floorOpen, setFloorOpen] = useState(false);
  const [elapsed, setElapsed] = useState('0:00');

  const detail = workout.data;

  useEffect(() => {
    if (!detail) return;
    setElapsed(formatElapsed(detail.started_at));
    const t = setInterval(() => setElapsed(formatElapsed(detail.started_at)), 1000);
    return () => clearInterval(t);
  }, [detail?.started_at]);

  useEffect(() => {
    if (!detail || activeExerciseId) return;
    const last = detail.exercises[detail.exercises.length - 1];
    if (last) setActiveExerciseId(last.exercise_id);
  }, [detail, activeExerciseId]);

  const activeExercise = detail?.exercises.find((we) => we.exercise_id === activeExerciseId) ?? null;
  const lastSession = useLastSession(activeExerciseId ?? '', id!);

  const tape: TapeRow[] = useMemo(() => {
    if (!detail) return [];
    const rows: TapeRow[] = [];
    for (const we of detail.exercises) {
      for (const set of we.sets) rows.push({ set, exercise: we });
    }
    return rows.sort((a, b) => a.set.created_at.localeCompare(b.set.created_at));
  }, [detail]);

  const totalKg = tape.reduce(
    (sum, row) => sum + (row.set.weight_kg ?? 0) * (row.set.reps ?? 0),
    0
  );

  if (workout.isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingText}>LOADING…</Text>
      </View>
    );
  }
  if (workout.error != null || !detail) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.errorText}>{workout.error?.message ?? 'Workout not found'}</Text>
      </View>
    );
  }

  const isFinished = detail.ended_at != null;
  const sessionExercises = detail.exercises.map((we) => we.exercise.canonical_name);
  const prevSet = activeExercise?.sets[activeExercise.sets.length - 1];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <StatusPip label={isFinished ? 'FINISHED' : 'LISTENING'} on={!isFinished} />
          <Text style={styles.headerTitle}>{detail.routine_name ?? 'Empty workout'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.headerTimer}>{elapsed}</Text>
          <Text style={styles.headerMeta}>
            SET {tape.length} · {Math.round(totalKg).toLocaleString()} KG
          </Text>
        </View>
      </View>

      <View style={styles.exerciseRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {detail.exercises.map((we) => (
            <KeyCap
              key={we.id}
              label={we.exercise.canonical_name.toUpperCase()}
              tone={we.exercise_id === activeExerciseId ? 'accent' : 'ghost'}
              size="sm"
              onPress={() => setActiveExerciseId(we.exercise_id)}
            />
          ))}
          {!isFinished && (
            <KeyCap label="+ ADD" size="sm" onPress={() => setPickerOpen(true)} />
          )}
        </ScrollView>
      </View>

      <ScrollView style={styles.tapeScroll} contentContainerStyle={styles.tapeContent}>
        <Text style={styles.tapeLabel}>SESSION TAPE</Text>
        <InsetWell>
          {tape.length === 0 ? (
            <Text style={styles.emptyTape}>No sets logged yet — say one, or press VOICE LOG below.</Text>
          ) : (
            tape.map((row, i) => (
              <Pressable
                key={row.set.id}
                style={[styles.tapeRow, i === tape.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => !isFinished && setEditSet({ row })}
              >
                <Text style={styles.tapeTime}>
                  {new Date(row.set.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.tapeExercise} numberOfLines={1}>
                  {row.exercise.exercise.canonical_name.toUpperCase()}
                </Text>
                <Text style={styles.tapeVal}>
                  {row.set.weight_kg ?? '—'}×{row.set.reps ?? '—'}
                </Text>
                <Text style={styles.tapeFlag}>{row.set.logged_via === 'voice' ? '✓' : ''}</Text>
              </Pressable>
            ))
          )}
        </InsetWell>
      </ScrollView>

      {!isFinished && activeExerciseId && (
        <View style={styles.micWrap}>
          <VoiceMicButton
            workoutId={id!}
            currentExerciseId={activeExerciseId}
            currentExerciseName={activeExercise?.exercise.canonical_name}
            lastSet={
              prevSet?.weight_kg != null && prevSet?.reps != null
                ? { weight_kg: prevSet.weight_kg, reps: prevSet.reps, set_type: prevSet.set_type }
                : null
            }
            sessionExercises={sessionExercises}
            defaultUnit={profile.data?.default_unit ?? 'kg'}
          />
        </View>
      )}

      {!isFinished && (
        <View style={styles.transport}>
          <LedDigits value={elapsed.padStart(5, '0')} size={28} />
          <LevelMeter height={26} style={{ flex: 1 }} />
          <View style={{ gap: space.xs, alignItems: 'flex-end' }}>
            <KeyCap label="FLOOR ⤢" size="sm" onPress={() => setFloorOpen(true)} />
          </View>
        </View>
      )}

      {!isFinished && (
        <View style={styles.footerActions}>
          <KeyCap
            label={finish.isPending ? 'FINISHING…' : 'FINISH WORKOUT'}
            tone="accent"
            onPress={() =>
              finish.mutate(undefined, { onSuccess: () => router.dismissTo('/') })
            }
            style={{ flex: 1 }}
          />
          <KeyCap
            label="DISCARD"
            tone="warn"
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
        </View>
      )}
      {finish.error != null && <Text style={styles.errorText}>{finish.error.message}</Text>}

      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(exercise) => {
          setPickerOpen(false);
          addExercise.mutate(exercise.id, {
            onSuccess: (we) => setActiveExerciseId(we.exercise_id),
          });
        }}
      />

      {editSet && (
        <VoiceConfirmationCard
          workoutId={id!}
          transcript=""
          response={null}
          editSet={toEditableSet(editSet.row)}
          onClose={() => setEditSet(null)}
        />
      )}

      {floorOpen && activeExercise && (
        <FloorMode
          workoutId={id!}
          exercise={activeExercise}
          lastSessionSets={lastSession.data ?? []}
          onClose={() => setFloorOpen(false)}
        />
      )}
    </View>
  );
}

function toEditableSet(row: TapeRow): EditableSet {
  return {
    id: row.set.id,
    exerciseName: row.exercise.exercise.canonical_name,
    weightKg: row.set.weight_kg,
    reps: row.set.reps,
    setType: row.set.set_type,
    setNumber: row.set.set_number,
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, paddingTop: space.xxl },
  loadingScreen: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: tracking.label, color: color.t3 },
  errorText: { fontFamily: font.num, fontSize: 12, color: color.warn, padding: space.md },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  headerTitle: { fontFamily: font.uiBold, fontSize: 19, color: color.t1, marginTop: 4 },
  headerTimer: { fontFamily: font.numSemibold, fontSize: 15, color: color.acc, textShadowColor: color.acc14, textShadowRadius: 8 },
  headerMeta: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.t3, marginTop: 3 },

  exerciseRow: { paddingHorizontal: space.lg, paddingBottom: space.sm },

  tapeScroll: { flex: 1 },
  tapeContent: { paddingHorizontal: space.lg, gap: space.xs },
  tapeLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  emptyTape: { fontFamily: font.num, fontSize: 12, color: color.t3, padding: space.md },
  tapeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    padding: space.sm + 3,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    borderStyle: 'dashed',
  },
  tapeTime: { fontFamily: font.numSemibold, fontSize: 10, color: color.t3, width: 44 },
  tapeExercise: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: 0.4, color: color.t2, flex: 1 },
  tapeVal: { fontFamily: font.numBold, fontSize: 15, color: color.t1 },
  tapeFlag: { fontFamily: font.numSemibold, fontSize: 10, color: color.ok, width: 16, textAlign: 'right' },

  micWrap: { paddingHorizontal: space.lg, paddingVertical: space.sm },

  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.line2,
    backgroundColor: color.sin,
  },
  footerActions: { flexDirection: 'row', gap: space.sm, padding: space.lg },
});
