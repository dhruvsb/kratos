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
import { VoiceUndoBanner } from '@/components/workout/VoiceUndoBanner';
import { haptics } from '@/lib/haptics';
import { ElapsedClock } from '@/components/workout/LiveClock';
import { InsetWell, KeyCap } from '@/components/voice/primitives';
import {
  useAddExerciseToWorkout,
  useAddSet,
  useDeleteSet,
  useDiscardWorkout,
  useExerciseBests,
  useFinishWorkout,
  useLastSession,
  usePrefetchExerciseDirectory,
  usePrefetchLastSessions,
  useProfile,
  useRemoveWorkoutExercise,
  useUpdateSet,
  useWorkout,
} from '@/data/hooks';
import { useSettings } from '@/data/settings';
import type { ExerciseBest, WorkoutExerciseDetail } from '@/data/workouts';
import type { LastSessionSet } from '@/types/db';
import type { ExerciseModality, SetType, Unit } from '@/types/db';
import { newUuid } from '@/lib/ids';
import {
  formatDuration,
  formatLevel,
  formatSetByModality,
  formatWeight,
  type SetMetrics,
} from '@/lib/units';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** PREV cell: a lone em-dash when there's no matching last-session set (mockup 15),
 *  not "— × —" — no fake number to beat on a lift's first day. The label reads in the
 *  exercise's own terms (weight×reps / reps / time / time·level). */
function prevLabel(
  set: LastSessionSet | undefined,
  modality: ExerciseModality,
  unit: Unit
): string {
  return set ? formatSetByModality(set, modality, unit) : '—';
}

/** The value columns to the right of PREV, by modality. Header labels here; the logged
 *  rows and the pending row render the same count of `cField` cells so all three grids
 *  line up. */
function valueHeaders(modality: ExerciseModality, unit: Unit): string[] {
  switch (modality) {
    case 'bodyweight_reps':
      return ['REPS'];
    case 'time':
      return ['TIME'];
    case 'distance_time':
      return ['TIME', 'LVL'];
    case 'weight_reps':
    default:
      return [unit.toUpperCase(), 'REPS'];
  }
}

/** A logged set's value cells (one string per column above), by modality. */
function valueCells(set: SetMetrics, modality: ExerciseModality, unit: Unit): string[] {
  switch (modality) {
    case 'bodyweight_reps':
      return [set.reps == null ? '—' : String(set.reps)];
    case 'time':
      return [formatDuration(set.duration_seconds)];
    case 'distance_time':
      return [formatDuration(set.duration_seconds), formatLevel(set.level)];
    case 'weight_reps':
    default:
      return [formatWeight(set.weight_kg, unit), set.reps == null ? '—' : String(set.reps)];
  }
}

/** Compact session-volume label: "1.2k" past a tonne, else the rounded number. */
function volLabel(kg: number): string {
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)}k` : `${Math.round(kg)}`;
}

/** Title-case a lowercase metadata token (muscle / equipment) for the sub-header. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Frictionless default (feedback #3): when there's no prior rep signal, suggest 12
// so the pending row is one-tap-loggable instead of blank.
const DEFAULT_REPS = 12;

// Progressive-overload ghost (feedback #28). A visually distinct, ghosted hint that
// suggests adding a little load when last session was clearly a strong, complete one.
// It is ADDITIVE: it never touches the real prefill (prefillKg/prefillReps), so ✓
// still logs the flat previous number — the user opts in by tapping the ghost.
//
// Rule — deliberately independent of routine targets (removed in #21, so
// target_reps_high is null everywhere): suggest a bump only when
//   1. prefill is on (the row is showing suggested numbers at all), AND
//   2. no set is logged yet this session for the exercise (we're picking the
//      opening weight — a mid-session bump would fight the auto-advance prefill), AND
//   3. a previous session exists with at least one normal set, AND
//   4. EVERY normal set last session (both weight & reps present) hit reps >=
//      OVERLOAD_REP_THRESHOLD — i.e. the whole session was completed strongly, AND
//   5. there is a top weight to build on.
// Then suggest topWeight + OVERLOAD_STEP_KG (a barbell-friendly +2.5 kg jump,
// matching the keypad's kg step). Values are stored/computed in kg and converted for
// display via lib/units (kgToDisplay / formatWeight).
const OVERLOAD_STEP_KG = 2.5;
const OVERLOAD_REP_THRESHOLD = 10;

type KeypadState = {
  mode: 'add' | 'edit';
  setId?: string;
  setNumber: number;
  setType: SetType;
  kg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  level: number | null;
};

export default function ActiveWorkoutScreen() {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
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
  const removeExercise = useRemoveWorkoutExercise(id!);

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
  // All-time top set per exercise (excludes this workout) — the "previous best" the
  // pending weight pre-fills to (feedback #3). Cached 30min; offline it simply never
  // resolves and prefill falls back to the last-session value.
  const bests = useExerciseBests(id, exerciseIds);
  const bestByExercise = useMemo(() => {
    const m = new Map<string, ExerciseBest>();
    for (const b of bests.data ?? []) m.set(b.exercise_id, b);
    return m;
  }, [bests.data]);
  // Warm the exercise directory so the picker can add exercises even if the
  // connection drops mid-workout (the picker filters this list locally offline).
  usePrefetchExerciseDirectory();

  // Default the active exercise to where the session actually is: the first
  // exercise that has no logged sets yet. On a fresh start from a routine that's
  // exercise 1 (landing on the *last* one made a new workout open at "3 OF 3");
  // on a resume it's the one you were about to do. If every exercise already has
  // sets you're at the end, so stay on the last. Adding an exercise mid-workout
  // jumps to it explicitly (see the picker's onPick), so this only decides the
  // first paint.
  useEffect(() => {
    if (!detail || activeExerciseId) return;
    const next =
      detail.exercises.find((we) => we.sets.length === 0) ??
      detail.exercises[detail.exercises.length - 1];
    if (next) setActiveExerciseId(next.exercise_id);
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

  // Each exercise carries a modality; the grid columns, prefill, keypad, and the
  // overload ghost all key off it. weight_reps is the lift default (byte-identical to
  // before); the others drop the weight column and/or add duration + level.
  const modality: ExerciseModality = activeExercise?.exercise.modality ?? 'weight_reps';
  const isWeightModality = modality === 'weight_reps';
  const usesReps = modality === 'weight_reps' || modality === 'bodyweight_reps';
  const usesDuration = modality === 'time' || modality === 'distance_time';
  const isCardio = modality === 'distance_time';

  const logged = activeExercise?.sets ?? [];
  const nextSetNumber = logged.length + 1;
  const noHistory = lastSets.length === 0; // first time on this lift (mockup 15)
  const lastForNext = lastSets[logged.length];
  const prevInSession = logged[logged.length - 1];
  const best = activeExerciseId ? bestByExercise.get(activeExerciseId) : undefined;
  // "Pre-fill from last session" (Settings) gates the pending row: off ⇒ blank
  // fields every set, the same treatment a brand-new lift gets (mockup 15).
  // When on (feedback #3): weight suggests what you're lifting today (this session's
  // last set) → your all-time previous best → last session's same-index set; reps
  // repeat what you did → else default to 12, so ✓ is a true one-tap log. Non-weight
  // modalities pre-fill only their own fields (reps / duration / duration+level) from
  // this session's last set, else last session's same-index set.
  const prefillKg = prefillEnabled && isWeightModality
    ? prevInSession?.weight_kg ?? best?.weight_kg ?? lastForNext?.weight_kg ?? null
    : null;
  const prefillReps = prefillEnabled && usesReps
    ? prevInSession?.reps ?? lastForNext?.reps ?? DEFAULT_REPS
    : null;
  const prefillDuration = prefillEnabled && usesDuration
    ? prevInSession?.duration_seconds ?? lastForNext?.duration_seconds ?? null
    : null;
  const prefillLevel = prefillEnabled && isCardio
    ? prevInSession?.level ?? lastForNext?.level ?? null
    : null;
  // Whether ✓ can log the pending row as-shown (else it opens the keypad): a duration
  // for time/cardio, otherwise reps.
  const canQuickLog = usesDuration ? prefillDuration != null : prefillReps != null;

  // The pending row's editable value cells, by modality — same column count as the
  // header/logged rows so the grid lines up. `dim` renders the placeholder-grey ink
  // (t3) when the field has no suggestion yet.
  const prefillMetrics: SetMetrics = {
    weight_kg: prefillKg,
    reps: prefillReps,
    duration_seconds: prefillDuration,
    level: prefillLevel,
  };
  const pendingCells: { text: string; dim: boolean }[] = usesDuration
    ? isCardio
      ? [
          { text: formatDuration(prefillDuration), dim: prefillDuration == null },
          { text: formatLevel(prefillLevel), dim: prefillLevel == null },
        ]
      : [{ text: formatDuration(prefillDuration), dim: prefillDuration == null }]
    : isWeightModality
      ? [
          { text: formatWeight(prefillKg, unit), dim: prefillKg == null },
          { text: prefillReps == null ? '—' : String(prefillReps), dim: prefillReps == null },
        ]
      : [{ text: prefillReps == null ? '—' : String(prefillReps), dim: prefillReps == null }];

  function logPending() {
    if (!activeExercise) return;
    // ✓ logs the pending row exactly as shown. It diverts to the keypad only when
    // there's genuinely nothing to log yet — prefill is off, so the row is blank
    // (prefillReps == null). Otherwise it commits, INCLUDING a null weight: bodyweight
    // and time-based lifts (plank, dead hang, pull-up) carry no weight, so a reps-only
    // set is still a real logged set. Previously a first-time lift with no weight to
    // suggest opened the keypad instead — and tapping the keypad's "Done"/"Next
    // exercise" there dropped the typed set silently, so those exercises finished with
    // zero sets and were culled from the saved workout (feedback #45). To set a weight,
    // the weight cell still opens the keypad.
    if (!canQuickLog) {
      openAdd();
      return;
    }
    // Fire alongside the optimistic cache patch, not after it — the tap, the row
    // appearing, and the tick should read as one event. Only the modality's fields are
    // non-null (prefill* is gated per modality above).
    haptics.log();
    addSet.mutate({
      workoutExerciseId: activeExercise.id,
      set: {
        weight_kg: prefillKg,
        reps: prefillReps,
        duration_seconds: prefillDuration,
        level: prefillLevel,
        set_type: 'normal',
      },
    });
  }

  function openAdd() {
    setKeypad({
      mode: 'add',
      setNumber: nextSetNumber,
      setType: 'normal',
      kg: prefillKg,
      reps: prefillReps,
      durationSeconds: prefillDuration,
      level: prefillLevel,
    });
  }

  function onKeypadLog(v: {
    weightKg: number | null;
    reps: number | null;
    durationSeconds: number | null;
    level: number | null;
  }) {
    if (!activeExercise || !keypad) return;
    if (keypad.mode === 'edit' && keypad.setId) {
      updateSet.mutate({
        setId: keypad.setId,
        patch: {
          weight_kg: v.weightKg,
          reps: v.reps,
          duration_seconds: v.durationSeconds,
          level: v.level,
        },
      });
      setKeypad(null);
      return;
    }
    addSet.mutate({
      workoutExerciseId: activeExercise.id,
      set: {
        weight_kg: v.weightKg,
        reps: v.reps,
        duration_seconds: v.durationSeconds,
        level: v.level,
        set_type: keypad.setType,
      },
    });
    // Auto-advance (feedback #26): keep the sheet open on the next set, pre-filled with
    // what was just logged, so a run of working sets is tap-tap-tap without reopening
    // the keypad each time. The user dismisses by tapping the backdrop when done.
    setKeypad({
      mode: 'add',
      setNumber: keypad.setNumber + 1,
      setType: 'normal',
      kg: v.weightKg,
      reps: v.reps,
      durationSeconds: v.durationSeconds,
      level: v.level,
    });
  }

  function confirmDeleteSet(setId: string, displayNumber: number) {
    Alert.alert(`Delete set ${displayNumber}?`, 'This removes the logged set.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          // Warning, not the log tick — a set leaving must not feel like one landing.
          haptics.warn();
          deleteSet.mutate(setId, {
            onError: (e) => Alert.alert("Couldn't delete set", e.message),
          });
        },
      },
    ]);
  }

  // Remove an exercise added by mistake mid-workout. Long-press its chip or tap the
  // explicit REMOVE control — both land here. Deleting the active exercise moves the
  // selection to a neighbour so the grid never points at a gone row.
  function confirmRemoveExercise(we: WorkoutExerciseDetail) {
    Alert.alert(
      `Remove ${we.exercise.canonical_name}?`,
      we.sets.length > 0
        ? `This deletes it and its ${we.sets.length} logged set${we.sets.length === 1 ? '' : 's'}.`
        : 'This removes the exercise from the workout.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            haptics.warn();
            if (activeExerciseId === we.exercise_id) {
              const remaining = (detail?.exercises ?? []).filter((e) => e.id !== we.id);
              setActiveExerciseId(remaining[remaining.length - 1]?.exercise_id ?? null);
            }
            removeExercise.mutate(we.id, {
              onError: (e) => Alert.alert("Couldn't remove exercise", e.message),
            });
          },
        },
      ]
    );
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
    // The payoff haptic lands with the transition, not on the summary's mount.
    haptics.success();
    finish.mutate({
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
          haptics.warn();
          discard.mutate({
            onError: (e) => Alert.alert("Couldn't discard workout", e.message),
          });
          router.dismissTo('/');
        },
      },
    ]);
  }

  // The ⋯ menu (refined design): the destructive/less-common actions moved off the
  // grid into here — remove the current exercise, or discard the whole session.
  function openWorkoutMenu() {
    haptics.tick();
    const buttons: Parameters<typeof Alert.alert>[2] = [];
    if (activeExercise) {
      buttons.push({
        text: `Remove ${activeExercise.exercise.canonical_name}`,
        onPress: () => confirmRemoveExercise(activeExercise),
      });
    }
    buttons.push({ text: 'Discard workout', style: 'destructive', onPress: confirmDiscard });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(detail?.title ?? detail?.routine_name ?? 'Workout', undefined, buttons);
  }

  const isLast = activeIndex === detail.exercises.length - 1;
  const topLast = lastSets.reduce<LastSessionSet | null>(
    (best, s) => ((s.weight_kg ?? 0) > (best?.weight_kg ?? -1) ? s : best),
    null
  );

  // Progressive-overload ghost weight (kg) — null unless the rule above holds. See the
  // OVERLOAD_* comment for the exact criteria. Only offered before the first set of the
  // exercise this session, and only when it would actually exceed the flat prefill.
  const normalLastSets = lastSets.filter(
    (s) => s.set_type === 'normal' && s.weight_kg != null && s.reps != null
  );
  const strongLastSession =
    normalLastSets.length > 0 &&
    normalLastSets.every((s) => (s.reps ?? 0) >= OVERLOAD_REP_THRESHOLD);
  const ghostKg =
    isWeightModality &&
    prefillEnabled &&
    logged.length === 0 &&
    strongLastSession &&
    topLast?.weight_kg != null &&
    topLast.weight_kg + OVERLOAD_STEP_KG > (prefillKg ?? -1)
      ? topLast.weight_kg + OVERLOAD_STEP_KG
      : null;

  // Tap-to-accept: open the keypad primed with the bumped weight (keeping the suggested
  // reps), so accepting the overload is one tap and still passes through the normal
  // LOG path — nothing about how a set is written changes.
  function acceptGhost() {
    if (ghostKg == null) return;
    setKeypad({
      mode: 'add',
      setNumber: nextSetNumber,
      setType: 'normal',
      kg: ghostKg,
      reps: prefillReps,
      durationSeconds: prefillDuration,
      level: prefillLevel,
    });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm }]}>
      {/* Header: RECORDING + ⋯, then title + timer/meta (refined design). */}
      <View style={styles.recBar}>
        <View style={styles.recRow}>
          {!isFinished && <View style={styles.recDot} />}
          <Text style={styles.recLabel}>{isFinished ? 'FINISHED' : 'RECORDING'}</Text>
        </View>
        {!isFinished && (
          <Pressable style={styles.menuBtn} onPress={openWorkoutMenu} hitSlop={8}>
            <Text style={styles.menuGlyph}>⋯</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {detail.title ?? detail.routine_name ?? 'Empty workout'}
        </Text>
        <View style={{ alignItems: 'flex-end' }}>
          <ElapsedClock
            startedAt={detail.started_at}
            endedAt={detail.ended_at}
            format="mmss"
            style={styles.timer}
          />
          <Text style={styles.meta}>
            {totals.sets} set{totals.sets === 1 ? '' : 's'} · {volLabel(totals.kg)} kg
          </Text>
        </View>
      </View>

      {/* Exercise chips — named, ✓ when logged, any chip tappable (refined design). */}
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: space.lg }}>
          {detail.exercises.map((we) => {
            const on = we.exercise_id === activeExerciseId;
            const done = we.sets.length > 0;
            return (
              <Pressable
                key={we.id}
                onPress={() => setActiveExerciseId(we.exercise_id)}
                // Long-press a chip to remove that exercise — the same fast gesture the
                // set rows use; the ⋯ menu carries the discoverable path.
                onLongPress={() => !isFinished && confirmRemoveExercise(we)}
                style={[styles.chip, done && !on && styles.chipDone, on && styles.chipOn]}
              >
                {done && <Text style={styles.chipCheck}>✓</Text>}
                <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                  {we.exercise.canonical_name}
                </Text>
              </Pressable>
            );
          })}
          {!isFinished && (
            <Pressable onPress={() => setPickerOpen(true)} style={styles.chipAdd}>
              <Text style={styles.chipAddText}>+ Add</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      {/* Voice commit landed here → transient "N sets logged from voice · UNDO". */}
      <VoiceUndoBanner workoutId={id!} />

      {!activeExercise ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No exercises yet</Text>
          <Text style={styles.emptyBody}>Add your first exercise to start logging sets.</Text>
          <KeyCap label="+ ADD EXERCISE" tone="accent" onPress={() => setPickerOpen(true)} style={{ marginTop: space.lg }} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Current exercise — tap the name for its weight history (refined design). */}
          <Pressable onPress={() => router.push(`/exercise/${activeExercise.exercise_id}`)}>
            <Text style={styles.exName} numberOfLines={2}>
              {activeExercise.exercise.canonical_name}
            </Text>
          </Pressable>
          <View style={styles.exSubRow}>
            <Text style={styles.exMuscle}>
              {[activeExercise.exercise.primary_muscles?.[0], activeExercise.exercise.equipment]
                .filter(Boolean)
                .map((t) => cap(String(t)))
                .join(' · ') || 'Exercise'}
            </Text>
            <Text style={styles.exPos}>
              {activeIndex + 1} of {detail.exercises.length}
            </Text>
          </View>

          {/* Set grid */}
          <View style={styles.gridHead}>
            <Text style={[styles.gh, styles.cNum]}>#</Text>
            <Text style={[styles.gh, styles.cPrev]}>PREV</Text>
            {valueHeaders(modality, unit).map((h, i) => (
              <Text key={i} style={[styles.gh, styles.cField, { textAlign: 'center' }]}>{h}</Text>
            ))}
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
                    durationSeconds: s.duration_seconds,
                    level: s.level,
                  })
                }
                // Long-press = the fast delete path from the grid (feedback #11); tapping
                // still opens the edit sheet, which now carries a prominent DELETE button.
                onLongPress={() => !isFinished && confirmDeleteSet(s.id, i + 1)}
              >
                <Text style={[styles.rNum, styles.cNum]}>{i + 1}</Text>
                <Text style={[styles.rPrev, styles.cPrev]}>{prevLabel(lastSets[i], modality, unit)}</Text>
                {valueCells(s, modality, unit).map((v, ci) => (
                  <View key={ci} style={[styles.cField, styles.cellDone]}>
                    <Text style={styles.valDone}>{v}</Text>
                  </View>
                ))}
                <View style={styles.cCheck}>
                  <Text style={styles.checkDone}>✓</Text>
                </View>
              </Pressable>
            ))}

            {/* Pending row */}
            {!isFinished && (
              <View style={[styles.row, { borderBottomWidth: 0, backgroundColor: color.acc06 }]}>
                <Text style={[styles.rNum, styles.cNum, { color: color.acc }]}>{nextSetNumber}</Text>
                <Text style={[styles.rPrev, styles.cPrev]}>{prevLabel(lastForNext, modality, unit)}</Text>
                {pendingCells.map((c, ci) => (
                  <Pressable key={ci} style={[styles.cField, styles.cellActive]} onPress={openAdd}>
                    <Text style={[styles.valActive, c.dim && { color: color.t3 }]}>{c.text}</Text>
                  </Pressable>
                ))}
                <Pressable style={[styles.cCheck, styles.checkBtn]} onPress={logPending}>
                  <Text style={styles.checkActive}>✓</Text>
                </Pressable>
              </View>
            )}

            {/* Progressive-overload ghost (feedback #28) — a dimmed, opt-in hint that
                sits under the pending row without changing its real prefill. Tapping
                opens the keypad primed with the bumped weight. */}
            {!isFinished && ghostKg != null && (
              <Pressable style={styles.ghostRow} onPress={acceptGhost}>
                <Text style={styles.ghostText}>
                  STRONG LAST TIME · TRY {formatWeight(ghostKg, unit)} {unit.toUpperCase()}
                </Text>
                <Text style={styles.ghostAccept}>TAP TO USE</Text>
              </Pressable>
            )}

          </InsetWell>

          {/* One quiet hint + Add set (refined design) — discard/remove moved to ⋯. */}
          {!isFinished && (
            <View style={styles.belowGrid}>
              <Text style={styles.belowHint} numberOfLines={1}>
                {canQuickLog
                  ? `✓ logs ${formatSetByModality(prefillMetrics, modality, unit)} · tap a field to change`
                  : isWeightModality
                    ? 'Enter weight and reps'
                    : usesDuration
                      ? 'Enter a time'
                      : 'Enter reps'}
              </Text>
              <Pressable onPress={openAdd} hitSlop={8}>
                <Text style={styles.addSet}>Add set</Text>
              </Pressable>
            </View>
          )}

          {noHistory && !isFinished && (
            <View style={styles.firstNote}>
              <View style={styles.firstNoteBar} />
              <Text style={styles.firstNoteText}>
                {prefillEnabled
                  ? 'First time on this lift. Tap ✓ to log it as shown, or set a weight first — every set after today pre-fills from it.'
                  : 'First time on this lift. Enter your weight and reps for each set.'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Footer: back + next/add row, then the primary Finish CTA (refined design). */}
      {!isFinished && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.navRow}>
            <Pressable
              onPress={activeIndex > 0 ? () => goExercise(-1) : undefined}
              disabled={activeIndex === 0}
              style={[styles.navSquare, activeIndex === 0 && { opacity: 0.4 }]}
            >
              <Text style={styles.navChevron}>‹</Text>
            </Pressable>
            <Pressable
              onPress={isLast ? () => setPickerOpen(true) : () => goExercise(1)}
              style={styles.navWide}
            >
              <Text style={styles.navWideText}>{isLast ? 'Add exercise' : 'Next exercise'}</Text>
              <Text style={styles.navWideChevron}>{isLast ? '+' : '›'}</Text>
            </Pressable>
          </View>
          <Pressable style={styles.finishBtn} onPress={confirmFinish}>
            <Text style={styles.finishText}>{finish.isPending ? 'Finishing…' : 'Finish workout'}</Text>
          </Pressable>
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
          modality={modality}
          exerciseName={activeExercise.exercise.canonical_name}
          setNumber={keypad.setNumber}
          unit={unit}
          lastSet={lastSets[keypad.setNumber - 1] ?? null}
          initialKg={keypad.kg}
          initialReps={keypad.reps}
          initialDurationSeconds={keypad.durationSeconds}
          initialLevel={keypad.level}
          mode={keypad.mode}
          // Log-sheet v3 flow actions (add mode only): position + Done/Next exercise.
          exercisePosition={keypad.mode === 'add' ? activeIndex + 1 : undefined}
          exerciseCount={keypad.mode === 'add' ? detail.exercises.length : undefined}
          onDone={keypad.mode === 'add' ? () => setKeypad(null) : undefined}
          onNextExercise={
            keypad.mode === 'add'
              ? () => {
                  setKeypad(null);
                  if (isLast) setPickerOpen(true);
                  else goExercise(1);
                }
              : undefined
          }
          onLog={onKeypadLog}
          onDelete={
            keypad.mode === 'edit' && keypad.setId
              ? () => {
                  // DELETE SET commits straight from the sheet (no Alert), so this
                  // is the confirm — same warning tone as the long-press path.
                  haptics.warn();
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

const makeStyles = (color: Theme['color'], shadow: Theme['shadow']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  dim: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: tracking.label, color: color.t3 },
  err: { fontFamily: font.num, fontSize: 12, color: color.warn, paddingHorizontal: space.lg, textAlign: 'center' },
  link: { fontFamily: font.numSemibold, fontSize: 12, color: color.acc },

  // RECORDING + ⋯ bar
  recBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: 8 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.acc },
  recLabel: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.acc },
  menuBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: color.line2, alignItems: 'center', justifyContent: 'center' },
  menuGlyph: { fontFamily: font.uiSemibold, fontSize: 15, color: color.t2, marginTop: -5, letterSpacing: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  title: { fontFamily: font.uiSemibold, fontSize: 26, color: color.t1, letterSpacing: -0.4, flex: 1 },
  timer: { fontFamily: font.numMedium, fontSize: 20, color: color.t1 },
  meta: { fontFamily: font.num, fontSize: 12, color: color.t2, marginTop: 4 },

  chipRow: { paddingLeft: space.lg, paddingBottom: space.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: color.s2,
  },
  chipDone: { backgroundColor: color.acc14 },
  chipOn: { borderColor: color.acc, backgroundColor: color.acc06 },
  chipCheck: { fontFamily: font.numBold, fontSize: 11, color: color.acc },
  chipText: { fontFamily: font.uiMedium, fontSize: 13, color: color.t2, maxWidth: 170 },
  chipTextOn: { color: color.t1, fontFamily: font.uiSemibold },
  chipAdd: {
    height: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: 18,
    borderStyle: 'dashed',
  },
  chipAddText: { fontFamily: font.uiMedium, fontSize: 13, color: color.t2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  emptyTitle: { fontFamily: font.uiMedium, fontSize: 17, color: color.t1 },
  emptyBody: { fontFamily: font.num, fontSize: 12, color: color.t3, marginTop: space.sm, textAlign: 'center' },

  body: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  exName: { fontFamily: font.uiSemibold, fontSize: 22, color: color.t1, letterSpacing: -0.3, paddingTop: space.sm },
  exSubRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 7 },
  exMuscle: { fontFamily: font.num, fontSize: 12, color: color.t2 },
  exPos: { fontFamily: font.num, fontSize: 12, color: color.t2 },

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
  // Current-set ✓ (handoff rule 2). Dark: accent border, no fill, accent glyph.
  // Light: a filled accent chip with white ink — the semantic checkBg/checkFg carry
  // both without a theme branch here.
  checkBtn: {
    height: 38,
    borderWidth: 1,
    borderColor: color.acc,
    borderRadius: radius.key,
    backgroundColor: color.checkBg,
  },
  checkActive: { fontFamily: font.numSemibold, fontSize: 15, color: color.checkFg },

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

  // Overload ghost: a low-emphasis, opt-in suggestion — dimmed ink (t3) on a barely
  // tinted accent well, clearly distinct from the solid pending row it hints about.
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginHorizontal: 12,
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: color.acc14,
    borderRadius: radius.key,
    backgroundColor: color.acc06,
  },
  ghostText: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3, flexShrink: 1 },
  ghostAccept: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.acc },

  belowGrid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingHorizontal: 12, paddingTop: 12 },
  belowHint: { fontFamily: font.num, fontSize: 12, color: color.t2, flexShrink: 1 },
  addSet: { fontFamily: font.uiSemibold, fontSize: 14, color: color.acc },

  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md },
  navRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  navSquare: { width: 54, height: 52, borderRadius: 26, backgroundColor: color.s1, borderWidth: 1, borderColor: color.line2, alignItems: 'center', justifyContent: 'center' },
  navChevron: { fontFamily: font.ui, fontSize: 18, color: color.t2 },
  navWide: { flex: 1, height: 52, borderRadius: 26, backgroundColor: color.s1, borderWidth: 1, borderColor: color.line2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  navWideText: { fontFamily: font.uiSemibold, fontSize: 15, color: color.t1 },
  navWideChevron: { fontFamily: font.ui, fontSize: 15, color: color.t2 },
  finishBtn: {
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ctaBg,
    borderWidth: 1,
    borderColor: color.ctaBorder,
    ...shadow.cta,
  },
  finishText: { fontFamily: font.uiSemibold, fontSize: 16, letterSpacing: -0.2, color: color.ctaFg },
});
