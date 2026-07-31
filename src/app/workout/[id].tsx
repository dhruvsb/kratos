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
import { ElapsedClock } from '@/components/workout/LiveClock';
import { InsetWell, KeyCap, StatusPip } from '@/components/voice/primitives';
import {
  useAddExerciseToWorkout,
  useAddSet,
  useDeleteSet,
  useDiscardWorkout,
  useFinishWorkout,
  useLastSession,
  usePrefetchLastSessions,
  useProfile,
  useUpdateSet,
  useWorkout,
} from '@/data/hooks';
import { useSettings } from '@/data/settings';
import type { LastSessionSet } from '@/types/db';
import type { SetType, Unit } from '@/types/db';
import { newUuid } from '@/lib/ids';
import { formatSet, formatWeight } from '@/lib/units';
import { color, font, radius, space, tracking } from '@/theme/tokens';

/** PREV cell: a lone em-dash when there's no matching last-session set (mockup 15),
 *  not "— × —" — no fake number to beat on a lift's first day. */
function prevLabel(set: LastSessionSet | undefined, unit: Unit): string {
  return set ? formatSet(set.weight_kg, set.reps, unit) : '—';
}

type KeypadState = {
  mode: 'add' | 'edit';
  setId?: string;
  setNumber: number;
  setType: SetType;
  kg: number | null;
  reps: number | null;
};

export default function ActiveWorkoutScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const profile = useProfile();
  const settings = useSettings();
  const unit: Unit = profile.data?.default_unit ?? 'kg';
  const prefillEnabled = settings.data?.prefillFromLastSession ?? true;

  const addExercise = useAddExerciseToWorkout(id!);
  const addSet = useAddSet(id!);
  const updateSet = useUpdateSet(id!);
  const deleteSet = useDeleteSet(id!);
  const finish = useFinishWorkout(id!);
  const discard = useDiscardWorkout(id!);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [keypad, setKeypad] = useState<KeypadState | null>(null);

  const detail = workout.data;
  const isFinished = detail?.ended_at != null;

  // Warm the last-session panel for every exercise up front (the 80% case: this
  // session repeats last session), so switching exercises is instant from cache.
  const exerciseIds = useMemo(
    () => detail?.exercises.map((we) => we.exercise_id) ?? [],
    [detail]
  );
  usePrefetchLastSessions(id, exerciseIds);

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

  const logged = activeExercise?.sets ?? [];
  const nextSetNumber = logged.length + 1;
  const noHistory = lastSets.length === 0; // first time on this lift (mockup 15)
  const lastForNext = lastSets[logged.length];
  const prevInSession = logged[logged.length - 1];
  // "Pre-fill from last session" (Settings) gates the pending row: off ⇒ blank
  // fields every set, the same treatment a brand-new lift gets (mockup 15).
  const prefillKg = prefillEnabled ? lastForNext?.weight_kg ?? prevInSession?.weight_kg ?? null : null;
  const prefillReps = prefillEnabled ? lastForNext?.reps ?? prevInSession?.reps ?? null : null;

  function logPending() {
    if (!activeExercise) return;
    if (prefillReps == null) {
      // Nothing to repeat — open the keypad instead of logging a blank set.
      openAdd('normal');
      return;
    }
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
    // Optimistic finish (useFinishWorkout patches the cache to look finished), so
    // replace to the summary NOW; on failure, roll back and return to the grid.
    // replace (not push) so Back from the summary doesn't return to the dead grid.
    finish.mutate(undefined, {
      onError: (e) => {
        Alert.alert("Couldn't finish workout", e.message);
        router.replace(`/workout/${id}`);
      },
    });
    router.replace(`/finish/${id}`);
  }

  function confirmDiscard() {
    Alert.alert('Discard workout?', 'Every set logged this session is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discard.mutate(undefined, {
            onError: (e) => Alert.alert("Couldn't discard workout", e.message),
          });
          router.dismissTo('/');
        },
      },
    ]);
  }

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
          <ElapsedClock
            startedAt={detail.started_at}
            endedAt={detail.ended_at}
            format="mmss"
            style={styles.timer}
          />
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
            {topLast ? (
              <Text style={styles.exLast}>LAST {formatSet(topLast.weight_kg, topLast.reps, unit)}</Text>
            ) : (
              <Text style={styles.exLast}>NO PREVIOUS SETS</Text>
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
                <Text style={[styles.rPrev, styles.cPrev]}>{prevLabel(lastSets[i], unit)}</Text>
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
                <Text style={[styles.rPrev, styles.cPrev]}>{prevLabel(lastForNext, unit)}</Text>
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

          {noHistory && !isFinished && (
            <View style={styles.firstNote}>
              <View style={styles.firstNoteBar} />
              <Text style={styles.firstNoteText}>
                {prefillEnabled
                  ? 'First time on this lift. Enter a working weight — every set after today arrives pre-filled from it.'
                  : 'First time on this lift. Enter your weight and reps for each set.'}
              </Text>
            </View>
          )}
        </ScrollView>
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
          // Optimistic: the grid gets the new exercise on this tap (onMutate
          // patches the cache under presetId), so switch to it immediately.
          addExercise.mutate(
            { exercise, presetId: newUuid() },
            { onError: (e) => Alert.alert("Couldn't add exercise", e.message) }
          );
          setActiveExerciseId(exercise.id);
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
          onDeleteWorkout={
            keypad.mode === 'edit'
              ? () => {
                  setKeypad(null);
                  confirmDiscard();
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
  title: { fontFamily: font.uiSemibold, fontSize: 19, color: color.t1, marginTop: 6 },
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
  emptyTitle: { fontFamily: font.uiMedium, fontSize: 17, color: color.t1 },
  emptyBody: { fontFamily: font.num, fontSize: 12, color: color.t3, marginTop: space.sm, textAlign: 'center' },

  body: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  exHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  exName: { fontFamily: font.uiSemibold, fontSize: 18, color: color.t1, flex: 1 },
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
    paddingVertical: 13,
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

  firstNote: {
    flexDirection: 'row',
    gap: space.md,
    marginTop: space.lg,
    padding: 13,
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.ctl + 1,
  },
  firstNoteBar: { width: 2, backgroundColor: color.acc35, borderRadius: 1 },
  firstNoteText: { flex: 1, fontFamily: font.num, fontSize: 10.5, lineHeight: 18, color: color.t2 },

  gridActions: { flexDirection: 'row', gap: 22, paddingVertical: 14, paddingHorizontal: 12 },
  actAcc: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.acc },
  actDim: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t3 },

  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
  navRow: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch' },
  finishRow: { flexDirection: 'row', gap: space.sm },
});
