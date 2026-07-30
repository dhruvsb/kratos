// Active workout — the manual set grid (mockup 04, "the core"). One exercise at a
// time: logged sets sit above one pre-filled pending row, so repeating last
// session is a single tap on ✓; anything else opens the keypad (SetKeypad). PREV
// stays in eyeshot as the number to beat. No microphone — voice drops back in
// later on top of this same grid (see docs/design/RepVoice-VoiceFirst-v3.dc.html).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { SetKeypad } from '@/components/workout/SetKeypad';
import { InsetWell, KeyCap, StatusPip } from '@/components/voice/primitives';
import {
  useAddExerciseToWorkout,
  useAddSet,
  useDeleteSet,
  useDiscardWorkout,
  useFinishWorkout,
  useLastSession,
  useProfile,
  useUpdateSet,
  useWorkout,
} from '@/data/hooks';
import type { LastSessionSet } from '@/types/db';
import type { SetType, Unit } from '@/types/db';
import { formatSet, formatWeight } from '@/lib/units';
import { color, font, radius, space, timing, tracking } from '@/theme/tokens';

type KeypadState = {
  mode: 'add' | 'edit';
  setId?: string;
  setNumber: number;
  setType: SetType;
  kg: number | null;
  reps: number | null;
};

function fmtClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function ActiveWorkoutScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const profile = useProfile();
  const unit: Unit = profile.data?.default_unit ?? 'kg';

  const addExercise = useAddExerciseToWorkout(id!);
  const addSet = useAddSet(id!);
  const updateSet = useUpdateSet(id!);
  const deleteSet = useDeleteSet(id!);
  const finish = useFinishWorkout(id!);
  const discard = useDiscardWorkout(id!);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [keypad, setKeypad] = useState<KeypadState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);

  const detail = workout.data;
  const isFinished = detail?.ended_at != null;

  // One ticking clock drives both the elapsed timer and the rest countdown.
  useEffect(() => {
    if (isFinished) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isFinished]);

  // Default the active exercise to the last one added.
  useEffect(() => {
    if (!detail || activeExerciseId) return;
    const last = detail.exercises[detail.exercises.length - 1];
    if (last) setActiveExerciseId(last.exercise_id);
  }, [detail, activeExerciseId]);

  const activeExercise =
    detail?.exercises.find((we) => we.exercise_id === activeExerciseId) ?? null;
  const activeIndex = detail?.exercises.findIndex((we) => we.exercise_id === activeExerciseId) ?? -1;
  const lastSession = useLastSession(activeExerciseId ?? '', id!);
  const lastSets = lastSession.data ?? [];

  const totals = useMemo(() => {
    let sets = 0;
    let kg = 0;
    for (const we of detail?.exercises ?? []) {
      for (const s of we.sets) {
        sets += 1;
        kg += (s.weight_kg ?? 0) * (s.reps ?? 0);
      }
    }
    return { sets, kg };
  }, [detail]);

  if (workout.isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.dim}>LOADING…</Text>
      </View>
    );
  }
  if (workout.error != null || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{workout.error?.message ?? 'Workout not found'}</Text>
        <Pressable onPress={() => router.dismissTo('/')} style={{ marginTop: space.md }}>
          <Text style={styles.link}>← Home</Text>
        </Pressable>
      </View>
    );
  }

  const restLeft = restEndsAt != null ? (restEndsAt - now) / 1000 : 0;
  if (restEndsAt != null && restLeft <= 0) setRestEndsAt(null);

  const logged = activeExercise?.sets ?? [];
  const nextSetNumber = logged.length + 1;
  const lastForNext = lastSets[logged.length];
  const prevInSession = logged[logged.length - 1];
  const prefillKg = lastForNext?.weight_kg ?? prevInSession?.weight_kg ?? null;
  const prefillReps = lastForNext?.reps ?? prevInSession?.reps ?? null;

  function startRest() {
    setRestEndsAt(Date.now() + timing.restDefaultSec * 1000);
    setNow(Date.now());
  }

  function logPending() {
    if (!activeExercise) return;
    if (prefillReps == null) {
      // Nothing to repeat — open the keypad instead of logging a blank set.
      openAdd('normal');
      return;
    }
    startRest();
    addSet.mutate({
      workoutExerciseId: activeExercise.id,
      set: { weight_kg: prefillKg, reps: prefillReps, set_type: 'normal' },
    });
  }

  function openAdd(setType: SetType) {
    setKeypad({
      mode: 'add',
      setNumber: nextSetNumber,
      setType,
      kg: setType === 'warmup' ? null : prefillKg,
      reps: setType === 'warmup' ? null : prefillReps,
    });
  }

  function onKeypadLog(weightKg: number | null, reps: number) {
    if (!activeExercise || !keypad) return;
    if (keypad.mode === 'edit' && keypad.setId) {
      updateSet.mutate({ setId: keypad.setId, patch: { weight_kg: weightKg, reps } });
    } else {
      startRest();
      addSet.mutate({
        workoutExerciseId: activeExercise.id,
        set: { weight_kg: weightKg, reps, set_type: keypad.setType },
      });
    }
    setKeypad(null);
  }

  function goExercise(dir: -1 | 1) {
    const next = detail!.exercises[activeIndex + dir];
    if (next) setActiveExerciseId(next.exercise_id);
  }

  function confirmFinish() {
    if (totals.sets === 0) {
      Alert.alert('Nothing logged', 'Log at least one set, or discard the workout.');
      return;
    }
    // replace (not push) so Back from the summary doesn't return to the dead grid.
    finish.mutate(undefined, { onSuccess: () => router.replace(`/finish/${id}`) });
  }

  function confirmDiscard() {
    Alert.alert('Discard workout?', 'Every set logged this session is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => discard.mutate(undefined, { onSuccess: () => router.dismissTo('/') }),
      },
    ]);
  }

  const elapsed = fmtClock((now - new Date(detail.started_at).getTime()) / 1000);
  const isLast = activeIndex === detail.exercises.length - 1;
  const topLast = lastSets.reduce<LastSessionSet | null>(
    (best, s) => ((s.weight_kg ?? 0) > (best?.weight_kg ?? -1) ? s : best),
    null
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <StatusPip label={isFinished ? 'FINISHED' : 'IN PROGRESS'} on={!isFinished} />
          <Text style={styles.title} numberOfLines={1}>
            {detail.routine_name ?? 'Empty workout'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.timer}>{elapsed}</Text>
          <Text style={styles.meta}>
            {totals.sets} SET{totals.sets === 1 ? '' : 'S'} · {Math.round(totals.kg).toLocaleString()} KG
          </Text>
        </View>
      </View>

      {/* Exercise chips */}
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: space.lg }}>
          {detail.exercises.map((we, i) => {
            const on = we.exercise_id === activeExerciseId;
            return (
              <Pressable
                key={we.id}
                onPress={() => setActiveExerciseId(we.exercise_id)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && { color: color.acc }]}>{i + 1}</Text>
              </Pressable>
            );
          })}
          {!isFinished && (
            <Pressable onPress={() => setPickerOpen(true)} style={styles.chipAdd}>
              <Text style={styles.chipAddText}>+ ADD</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {!activeExercise ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No exercises yet</Text>
          <Text style={styles.emptyBody}>Add your first exercise to start logging sets.</Text>
          <KeyCap label="+ ADD EXERCISE" tone="accent" onPress={() => setPickerOpen(true)} style={{ marginTop: space.lg }} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Current exercise */}
          <View style={styles.exHead}>
            <Text style={styles.exName} numberOfLines={2}>
              {activeExercise.exercise.canonical_name}
            </Text>
            <Text style={styles.exPos}>
              {activeIndex + 1} OF {detail.exercises.length}
            </Text>
          </View>
          <View style={styles.exSubRow}>
            <Text style={styles.exMuscle}>
              {[activeExercise.exercise.primary_muscles?.[0], activeExercise.exercise.equipment]
                .filter(Boolean)
                .join(' · ')
                .toUpperCase() || 'EXERCISE'}
            </Text>
            {topLast && (
              <Text style={styles.exLast}>LAST {formatSet(topLast.weight_kg, topLast.reps, unit)}</Text>
            )}
          </View>

          {/* Set grid */}
          <View style={styles.gridHead}>
            <Text style={[styles.gh, styles.cNum]}>#</Text>
            <Text style={[styles.gh, styles.cPrev]}>PREV</Text>
            <Text style={[styles.gh, styles.cField, { textAlign: 'center' }]}>{unit.toUpperCase()}</Text>
            <Text style={[styles.gh, styles.cField, { textAlign: 'center' }]}>REPS</Text>
            <Text style={[styles.gh, styles.cCheck]} />
          </View>

          <InsetWell>
            {logged.map((s, i) => (
              <Pressable
                key={s.id}
                style={styles.row}
                onPress={() =>
                  !isFinished &&
                  setKeypad({
                    mode: 'edit',
                    setId: s.id,
                    setNumber: s.set_number,
                    setType: s.set_type,
                    kg: s.weight_kg,
                    reps: s.reps,
                  })
                }
              >
                <Text style={[styles.rNum, styles.cNum]}>{s.set_type === 'warmup' ? 'W' : i + 1}</Text>
                <Text style={[styles.rPrev, styles.cPrev]}>{formatSet(lastSets[i]?.weight_kg, lastSets[i]?.reps, unit)}</Text>
                <View style={[styles.cField, styles.cellDone]}>
                  <Text style={styles.valDone}>{formatWeight(s.weight_kg, unit)}</Text>
                </View>
                <View style={[styles.cField, styles.cellDone]}>
                  <Text style={styles.valDone}>{s.reps ?? '—'}</Text>
                </View>
                <View style={styles.cCheck}>
                  <Text style={styles.checkDone}>✓</Text>
                </View>
              </Pressable>
            ))}

            {/* Pending row */}
            {!isFinished && (
              <View style={[styles.row, { borderBottomWidth: 0, backgroundColor: color.acc06 }]}>
                <Text style={[styles.rNum, styles.cNum, { color: color.acc }]}>{nextSetNumber}</Text>
                <Text style={[styles.rPrev, styles.cPrev]}>
                  {formatSet(lastForNext?.weight_kg, lastForNext?.reps, unit)}
                </Text>
                <Pressable style={[styles.cField, styles.cellActive]} onPress={() => openAdd('normal')}>
                  <Text style={[styles.valActive, prefillKg == null && { color: color.t3 }]}>
                    {formatWeight(prefillKg, unit)}
                  </Text>
                </Pressable>
                <Pressable style={[styles.cField, styles.cellActive]} onPress={() => openAdd('normal')}>
                  <Text style={[styles.valActive, prefillReps == null && { color: color.t3 }]}>
                    {prefillReps ?? '—'}
                  </Text>
                </Pressable>
                <Pressable style={[styles.cCheck, styles.checkBtn]} onPress={logPending}>
                  <Text style={styles.checkActive}>✓</Text>
                </Pressable>
              </View>
            )}

            {!isFinished && (
              <View style={styles.gridActions}>
                <Pressable onPress={() => openAdd('normal')}>
                  <Text style={styles.actAcc}>+ ADD SET</Text>
                </Pressable>
                <Pressable onPress={() => openAdd('warmup')}>
                  <Text style={styles.actDim}>+ WARMUP</Text>
                </Pressable>
                <Pressable onPress={() => router.push(`/exercise/${activeExercise.exercise_id}`)}>
                  <Text style={styles.actDim}>HISTORY</Text>
                </Pressable>
              </View>
            )}
          </InsetWell>
        </ScrollView>
      )}

      {/* Rest bar */}
      {restEndsAt != null && !isFinished && (
        <View style={styles.restBar}>
          <Text style={styles.restLabel}>REST</Text>
          <Text style={styles.restTime}>{fmtClock(restLeft)}</Text>
          <View style={styles.restTrack} />
          <Pressable onPress={() => setRestEndsAt((e) => (e ?? Date.now()) + 30000)} hitSlop={8}>
            <Text style={styles.restAct}>+30s</Text>
          </Pressable>
          <Pressable onPress={() => setRestEndsAt(null)} hitSlop={8}>
            <Text style={[styles.restAct, { color: color.acc }]}>SKIP</Text>
          </Pressable>
        </View>
      )}

      {/* Footer */}
      {!isFinished && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.navRow}>
            <KeyCap
              label="← PREV"
              size="sm"
              onPress={activeIndex > 0 ? () => goExercise(-1) : undefined}
              style={activeIndex > 0 ? undefined : { opacity: 0.4 }}
            />
            <KeyCap
              label={isLast ? 'ADD EXERCISE +' : 'NEXT EXERCISE →'}
              size="sm"
              tone={isLast ? 'ghost' : 'accent'}
              onPress={isLast ? () => setPickerOpen(true) : () => goExercise(1)}
              style={{ flex: 1 }}
            />
          </View>
          <View style={styles.finishRow}>
            <KeyCap
              label={finish.isPending ? 'FINISHING…' : 'FINISH WORKOUT'}
              tone="accent"
              onPress={confirmFinish}
              style={{ flex: 1 }}
            />
            <KeyCap label="DISCARD" tone="warn" onPress={confirmDiscard} />
          </View>
        </View>
      )}

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

      {keypad && activeExercise && (
        <SetKeypad
          visible
          exerciseName={activeExercise.exercise.canonical_name}
          setNumber={keypad.setNumber}
          unit={unit}
          lastKg={lastSets[keypad.setNumber - 1]?.weight_kg ?? null}
          lastReps={lastSets[keypad.setNumber - 1]?.reps ?? null}
          initialKg={keypad.kg}
          initialReps={keypad.reps}
          mode={keypad.mode}
          onLog={onKeypadLog}
          onDelete={
            keypad.mode === 'edit' && keypad.setId
              ? () => {
                  deleteSet.mutate(keypad.setId!);
                  setKeypad(null);
                }
              : undefined
          }
          onClose={() => setKeypad(null)}
        />
      )}
    </View>
  );
}

// Fixed column widths shared by the grid header + rows.
const NUM_W = 22;
const PREV_W = 62;
const CHECK_W = 42;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  dim: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: tracking.label, color: color.t3 },
  err: { fontFamily: font.num, fontSize: 12, color: color.warn, paddingHorizontal: space.lg, textAlign: 'center' },
  link: { fontFamily: font.numSemibold, fontSize: 12, color: color.acc },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  title: { fontFamily: font.uiBold, fontSize: 19, color: color.t1, marginTop: 6 },
  timer: { fontFamily: font.numSemibold, fontSize: 15, color: color.acc, textShadowColor: color.acc14, textShadowRadius: 8 },
  meta: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.t3, marginTop: 4 },

  chipRow: { paddingLeft: space.lg, paddingBottom: space.md },
  chip: {
    width: 38,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.keySm,
  },
  chipOn: { borderColor: color.acc35, backgroundColor: color.acc06 },
  chipText: { fontFamily: font.numSemibold, fontSize: 9.5, color: color.t3 },
  chipAdd: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.keySm,
    borderStyle: 'dashed',
  },
  chipAddText: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  emptyTitle: { fontFamily: font.uiSemibold, fontSize: 17, color: color.t1 },
  emptyBody: { fontFamily: font.num, fontSize: 12, color: color.t3, marginTop: space.sm, textAlign: 'center' },

  body: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  exHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  exName: { fontFamily: font.uiBold, fontSize: 18, color: color.t1, flex: 1 },
  exPos: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3, marginTop: 4 },
  exSubRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 9 },
  exMuscle: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t2 },
  exLast: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: 0.6, color: color.t3 },

  gridHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingTop: space.lg, paddingBottom: 9 },
  gh: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  cNum: { width: NUM_W },
  cPrev: { width: PREV_W },
  cField: { flex: 1 },
  cCheck: { width: CHECK_W, alignItems: 'center', justifyContent: 'center' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingLeft: 12,
    paddingRight: 8,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  rNum: { fontFamily: font.numSemibold, fontSize: 10, color: color.t3 },
  rPrev: { fontFamily: font.numSemibold, fontSize: 10, color: color.t3 },
  cellDone: { height: 38, alignItems: 'center', justifyContent: 'center' },
  valDone: { fontFamily: font.numBold, fontSize: 17, color: color.t2 },
  cellActive: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.acc,
    borderRadius: radius.key,
    backgroundColor: color.sin,
  },
  valActive: { fontFamily: font.numBold, fontSize: 17, color: color.t1 },
  checkDone: { fontFamily: font.numSemibold, fontSize: 15, color: color.ok },
  checkBtn: {
    height: 38,
    borderWidth: 1,
    borderColor: color.acc,
    borderRadius: radius.key,
  },
  checkActive: { fontFamily: font.numSemibold, fontSize: 15, color: color.acc },

  gridActions: { flexDirection: 'row', gap: 22, paddingVertical: 14, paddingHorizontal: 12 },
  actAcc: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.acc },
  actDim: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t3 },

  restBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line2,
    backgroundColor: color.sin,
  },
  restLabel: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3 },
  restTime: { fontFamily: font.numBold, fontSize: 20, color: color.acc, textShadowColor: color.acc14, textShadowRadius: 8 },
  restTrack: { flex: 1, height: 1, backgroundColor: color.line },
  restAct: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: 0.6, color: color.t2 },

  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  navRow: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch' },
  finishRow: { flexDirection: 'row', gap: space.sm },
});
