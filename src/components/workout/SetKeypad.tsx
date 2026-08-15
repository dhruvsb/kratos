// Set-entry keypad (mockup 05). A bottom sheet over the set grid. What it captures
// adapts to the exercise's modality:
//   weight_reps         → KG + REPS   (+ plate hint, rep chips)
//   bodyweight_reps     → REPS        (rep chips)
//   weighted_bodyweight → +KG (optional) + REPS   (reps lead; blank weight = bodyweight)
//   time                → DURATION    (mm:ss entry, duration chips)
//   distance_time       → DURATION + LEVEL   (cardio; level = unitless machine setting)
// Weight storage is kg; entry is in the profile's display unit and converted on LOG.
// Used for both adding a new set and editing a logged one.
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Caret } from '@/components/workout/Caret';
import { haptics } from '@/lib/haptics';
import {
  displayToKg,
  formatDuration,
  formatSetByModality,
  kgToDisplay,
  platesLabel,
  step,
  trimWeight,
  type SetMetrics,
} from '@/lib/units';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import type { ExerciseModality, Unit } from '@/types/db';

type Field = 'kg' | 'reps' | 'dur' | 'level';

/** What LOG hands back — only the fields the modality uses are non-null. */
export type SetKeypadValues = {
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  level: number | null;
};

export type SetKeypadProps = {
  visible: boolean;
  modality: ExerciseModality;
  exerciseName: string;
  setNumber: number;
  unit: Unit;
  /** Same-index set from last session, for the LAST label (modality-aware). */
  lastSet?: SetMetrics | null;
  /** Prefill — usually the same last-session set, or the value being edited. */
  initialKg: number | null;
  initialReps: number | null;
  initialDurationSeconds?: number | null;
  initialLevel?: number | null;
  mode?: 'add' | 'edit';
  /** Active-workout add mode: this exercise's position in the session, shown top-right
   *  of the sheet ("3 of 5") in place of the LAST label (design log-sheet v3). */
  exercisePosition?: number;
  exerciseCount?: number;
  onLog: (values: SetKeypadValues) => void;
  onDelete?: () => void;
  /** Edit mode only: "wrong day entirely" — delete the whole workout. Kept visually
   *  apart from SAVE / DELETE SET so it can't be hit by muscle memory (mockup 17). */
  onDeleteWorkout?: () => void;
  /** Add mode (design log-sheet v3): the two flow actions above Log set. "Done" ends
   *  logging for this exercise (dismiss); "Next exercise" advances the session. Shown
   *  only when provided, so the history-edit sheet keeps just SAVE / DELETE. */
  onDone?: () => void;
  onNextExercise?: () => void;
  onClose: () => void;
};

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

// Decision 1a: one control row does both jobs — two ± steps then three value chips that
// cover the overwhelming majority of sets, so a full set is "±step / tap a chip → Log".
// The chips are modality-specific (reps for lifts, longer reps for calisthenics, common
// durations for holds/cardio). Odd values stay reachable via the pad.
const REP_CHIPS_WEIGHT = [8, 10, 12] as const;
const REP_CHIPS_BODYWEIGHT = [10, 15, 20] as const;
const DUR_CHIPS_TIME = [30, 45, 60] as const; // seconds
const DUR_CHIPS_CARDIO = [600, 1200, 1800] as const; // 10 / 20 / 30 min

// Sane upper bound on an entered weight (in kg). Covers every real barbell / dumbbell
// / machine number with margin, and — critically — stays under weight_kg's
// numeric(6,2) ceiling (9999.99) so a mistyped weight can't overflow the column and
// throw on insert mid-workout (feedback #14).
const MAX_WEIGHT_KG = 1000;

// duration_seconds is a plain int; cap entry well below overflow while covering any real
// hold or cardio bout.
const MAX_DURATION_SECONDS = 60 * 60 * 10; // 10h
// level is numeric(4,1): keep it a sane machine dial.
const MAX_LEVEL = 99;

/** mm:ss digit buffer → total seconds (last two digits = seconds). */
function digitsToSeconds(d: string): number {
  if (!d) return 0;
  const ss = parseInt(d.slice(-2) || '0', 10);
  const mm = parseInt(d.slice(0, -2) || '0', 10);
  return mm * 60 + ss;
}
/** Total seconds → the minimal digit buffer that renders back to it. */
function secondsToDigits(total: number | null | undefined): string {
  if (!total || total <= 0) return '';
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return mm > 0 ? `${mm}${String(ss).padStart(2, '0')}` : String(ss);
}
/** Render a digit buffer as m:ss while typing (0:00 when empty). */
function displayDigits(d: string): string {
  const ss = (d.slice(-2) || '0').padStart(2, '0');
  const mm = d.slice(0, -2) || '0';
  return `${parseInt(mm, 10)}:${ss}`;
}

export function SetKeypad(props: SetKeypadProps) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const { visible, modality, unit, initialKg, initialReps, lastSet } = props;
  const insets = useSafeAreaInsets();
  const [kgStr, setKgStr] = useState('');
  const [repsStr, setRepsStr] = useState('');
  const [durDigits, setDurDigits] = useState('');
  const [levelStr, setLevelStr] = useState('');

  const isWeight = modality === 'weight_reps';
  const isWeightedBw = modality === 'weighted_bodyweight';
  // Weight field shows for both, but it's REQUIRED-ish only for weight_reps; for
  // weighted_bodyweight it's optional added load (a blank weight is a bodyweight set).
  const usesWeight = isWeight || isWeightedBw;
  const isReps = isWeight || isWeightedBw || modality === 'bodyweight_reps';
  const isTime = modality === 'time';
  const isCardio = modality === 'distance_time';
  const usesDuration = isTime || isCardio;

  const [active, setActive] = useState<Field>('kg');

  // Reset the buffers each time the sheet opens for a (new) set, seeding the field the
  // modality leads with.
  useEffect(() => {
    if (!visible) return;
    setKgStr(initialKg == null ? '' : trimWeight(kgToDisplay(initialKg, unit)));
    setRepsStr(initialReps == null ? '' : String(initialReps));
    setDurDigits(secondsToDigits(props.initialDurationSeconds));
    setLevelStr(props.initialLevel == null ? '' : trimWeight(props.initialLevel));
    setActive(isWeight ? 'kg' : isReps ? 'reps' : 'dur');
  }, [
    visible,
    initialKg,
    initialReps,
    props.initialDurationSeconds,
    props.initialLevel,
    unit,
    modality,
  ]);

  function pressPad(key: string) {
    if (key === '⌫') {
      if (active === 'dur') return setDurDigits((s) => s.slice(0, -1));
      if (active === 'kg') return setKgStr((s) => s.slice(0, -1));
      if (active === 'level') return setLevelStr((s) => s.slice(0, -1));
      return setRepsStr((s) => s.slice(0, -1));
    }
    if (key === '.') {
      // Only weight and level are fractional; reps + duration digits are integers.
      if (active === 'kg') return setKgStr((s) => (s.includes('.') ? s : s === '' ? '0.' : s + '.'));
      if (active === 'level')
        return setLevelStr((s) => (s.includes('.') ? s : s === '' ? '0.' : s + '.'));
      return;
    }
    // digit
    if (active === 'dur') {
      return setDurDigits((s) => {
        const next = s + key;
        if (next.replace(/^0+/, '').length > 5) return s; // cap length
        if (digitsToSeconds(next) > MAX_DURATION_SECONDS) return s;
        return next.replace(/^0+(?=\d)/, ''); // trim leading zeros
      });
    }
    if (active === 'kg') {
      return setKgStr((s) => {
        const next = s + key;
        if (next.includes('.') && next.split('.')[1].length > 1) return s;
        if (next.replace('.', '').length > 5) return s;
        if (displayToKg(parseFloat(next) || 0, unit) > MAX_WEIGHT_KG) return s;
        return next;
      });
    }
    if (active === 'level') {
      return setLevelStr((s) => {
        const next = s + key;
        if (next.includes('.') && next.split('.')[1].length > 1) return s;
        if ((parseFloat(next) || 0) > MAX_LEVEL) return s;
        return next;
      });
    }
    // reps
    setRepsStr((s) => (s.length >= 3 ? s : s + key));
  }

  function adjust(sign: 1 | -1) {
    if (active === 'kg') {
      const cur = parseFloat(kgStr || '0') || 0;
      const maxDisplay = kgToDisplay(MAX_WEIGHT_KG, unit);
      const next = Math.min(maxDisplay, Math.max(0, Math.round((cur + sign * step(unit)) * 10) / 10));
      setKgStr(next === 0 && kgStr === '' ? '' : trimWeight(next));
    } else if (active === 'dur') {
      const stepS = isCardio ? 30 : 5;
      const next = Math.max(0, Math.min(MAX_DURATION_SECONDS, digitsToSeconds(durDigits) + sign * stepS));
      setDurDigits(secondsToDigits(next));
    } else if (active === 'level') {
      const cur = parseFloat(levelStr || '0') || 0;
      const next = Math.max(0, Math.min(MAX_LEVEL, cur + sign));
      setLevelStr(next === 0 && levelStr === '' ? '' : trimWeight(next));
    } else {
      const cur = parseInt(repsStr || '0', 10) || 0;
      const next = Math.max(0, cur + sign);
      setRepsStr(next === 0 ? '' : String(next));
    }
  }

  const reps = parseInt(repsStr || '0', 10) || 0;
  const kgDisplay = kgStr === '' ? null : parseFloat(kgStr);
  const weightKg = kgDisplay == null ? null : displayToKg(kgDisplay, unit);
  const durationSeconds = digitsToSeconds(durDigits);
  const level = levelStr === '' ? null : parseFloat(levelStr);
  const canLog = usesDuration ? durationSeconds > 0 : reps > 0;
  const plates = isWeight ? platesLabel(weightKg) : null;

  // The ± step label reflects whatever field is active.
  const stepLabel =
    active === 'kg'
      ? String(step(unit))
      : active === 'dur'
        ? isCardio
          ? '30s'
          : '5s'
        : '1';

  function log() {
    if (!canLog) return;
    haptics.log();
    props.onLog({
      weightKg: usesWeight ? weightKg : null,
      reps: isReps ? reps : null,
      durationSeconds: usesDuration ? durationSeconds : null,
      level: isCardio ? level : null,
    });
  }

  const lastLabel =
    lastSet && (lastSet.weight_kg != null || lastSet.reps != null || lastSet.duration_seconds != null)
      ? `LAST ${formatSetByModality(lastSet, modality, unit)}`
      : null;

  // The value chips for the control row, by modality.
  const chips: { label: string; on: boolean; apply: () => void }[] = isWeight
    ? REP_CHIPS_WEIGHT.map((n) => ({
        label: String(n),
        on: reps === n,
        apply: () => {
          setRepsStr(String(n));
          setActive('kg'); // hand focus back to weight — the common flow needs no switch
        },
      }))
    : modality === 'bodyweight_reps' || isWeightedBw
      ? REP_CHIPS_BODYWEIGHT.map((n) => ({
          label: String(n),
          on: reps === n,
          apply: () => setRepsStr(String(n)),
        }))
      : (isCardio ? DUR_CHIPS_CARDIO : DUR_CHIPS_TIME).map((s) => ({
          label: formatDuration(s),
          on: durationSeconds === s,
          apply: () => {
            setDurDigits(secondsToDigits(s));
            setActive('dur');
          },
        }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.handle} />

        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {props.exerciseName} · Set {props.setNumber}
          </Text>
          {props.exercisePosition != null && props.exerciseCount != null ? (
            <Text style={styles.lastLabel}>
              {props.exercisePosition} of {props.exerciseCount}
            </Text>
          ) : lastLabel ? (
            <Text style={styles.lastLabel}>{lastLabel}</Text>
          ) : null}
        </View>

        <View style={styles.fields}>
          {usesWeight && (
            <Field
              // Weighted-bodyweight: the number is ADDED load, so it reads "+KG"
              // and can be left blank for a pure-bodyweight set.
              label={isWeightedBw ? `+${unit.toUpperCase()}` : unit.toUpperCase()}
              value={kgStr || '0'}
              dim={kgStr === ''}
              active={active === 'kg'}
              onPress={() => setActive('kg')}
            />
          )}
          {isReps && (
            <Field
              label="REPS"
              value={repsStr || '0'}
              dim={repsStr === ''}
              active={active === 'reps'}
              onPress={() => setActive('reps')}
            />
          )}
          {usesDuration && (
            <Field
              label="TIME"
              value={displayDigits(durDigits)}
              dim={durDigits === ''}
              active={active === 'dur'}
              onPress={() => setActive('dur')}
            />
          )}
          {isCardio && (
            <Field
              label="LEVEL"
              value={levelStr || '0'}
              dim={levelStr === ''}
              active={active === 'level'}
              onPress={() => setActive('level')}
            />
          )}
        </View>

        {/* One control row (decision 1a): two ± steps + the modality's value chips. */}
        <View style={styles.chipRow}>
          <Pressable style={styles.stepChip} onPress={() => adjust(-1)}>
            <Text style={styles.stepText}>−{stepLabel}</Text>
          </Pressable>
          <Pressable style={styles.stepChip} onPress={() => adjust(1)}>
            <Text style={styles.stepText}>+{stepLabel}</Text>
          </Pressable>
          {chips.map((c) => (
            <Pressable
              key={c.label}
              style={[styles.repChip, c.on && styles.repChipOn]}
              onPress={() => {
                if (!c.on) haptics.tick();
                c.apply();
              }}
            >
              <Text style={[styles.repChipText, c.on && styles.repChipTextOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.plateRow}>
          {plates ? (
            <Text style={styles.plateText} numberOfLines={1} ellipsizeMode="tail">
              Plates per side · {plates}
            </Text>
          ) : null}
        </View>

        <View style={styles.pad}>
          {PAD.map((k) => (
            <Pressable key={k} style={styles.key} onPress={() => pressPad(k)}>
              <Text style={[styles.keyText, (k === '.' || k === '⌫') && { color: color.t2 }]}>{k}</Text>
            </Pressable>
          ))}
        </View>

        {/* Flow actions above Log set (design log-sheet v3), add mode only. */}
        {(props.onDone || props.onNextExercise) && (
          <View style={styles.flowRow}>
            {props.onDone && (
              <Pressable style={styles.doneBtn} onPress={props.onDone}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            )}
            {props.onNextExercise && (
              <Pressable style={styles.nextBtn} onPress={props.onNextExercise}>
                <Text style={styles.nextText}>Next exercise</Text>
                <Text style={styles.nextChevron}>›</Text>
              </Pressable>
            )}
          </View>
        )}

        <Pressable
          style={[styles.logBtn, !canLog && styles.logBtnOff]}
          onPress={log}
          disabled={!canLog}
        >
          <Text style={[styles.logText, !canLog && { color: color.t3 }]}>
            {props.mode === 'edit' ? 'Save set' : 'Log set'}
          </Text>
        </Pressable>

        {props.mode === 'edit' && props.onDelete && (
          <View style={styles.editActions}>
            <Pressable onPress={props.onDelete} hitSlop={8} style={styles.deleteBtn}>
              <Text style={styles.deleteText}>DELETE SET</Text>
            </Pressable>
          </View>
        )}

        {props.mode === 'edit' && props.onDeleteWorkout && (
          <View style={styles.deleteWorkoutRow}>
            <Text style={styles.deleteWorkoutHint}>Wrong day entirely?</Text>
            <Pressable onPress={props.onDeleteWorkout} hitSlop={8}>
              <Text style={styles.deleteWorkoutText}>DELETE WORKOUT</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  dim,
  active,
  onPress,
}: {
  label: string;
  value: string;
  dim: boolean;
  active: boolean;
  onPress: () => void;
}) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  return (
    <Pressable style={[styles.field, active && styles.fieldActive]} onPress={onPress}>
      <Text style={[styles.fieldLabel, active && { color: color.acc }]}>{label}</Text>
      <View style={styles.fieldValRow}>
        <Text style={[styles.fieldVal, dim && { color: color.t3 }]}>{value}</Text>
        {active && <Caret height={24} style={{ marginLeft: 3 }} />}
      </View>
    </Pressable>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,9,0.66)' },
  sheet: {
    backgroundColor: color.s1,
    borderTopWidth: 1,
    borderTopColor: color.line2,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.lg + 2,
    paddingTop: space.md,
  },
  handle: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: color.line2,
    alignSelf: 'center',
    marginBottom: space.lg,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },
  title: { flex: 1, fontFamily: font.uiSemibold, fontSize: 15, color: color.t1 },
  lastLabel: { fontFamily: font.num, fontSize: 12, color: color.t2, flexShrink: 0 },

  fields: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  field: {
    flex: 1,
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.ctl + 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: color.sin,
  },
  fieldActive: { borderColor: color.acc },
  fieldLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  fieldValRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  fieldVal: { fontFamily: font.numBold, fontSize: 30, color: color.t1 },

  // 1a control row: two ± step pills + up to three value chips, all one height.
  chipRow: { flexDirection: 'row', gap: 8, marginTop: space.md },
  stepChip: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.line2,
  },
  stepText: { fontFamily: font.numMedium, fontSize: 14, color: color.t1 },
  repChip: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.line2,
  },
  repChipOn: { borderColor: color.acc, backgroundColor: color.acc06 },
  repChipText: { fontFamily: font.numMedium, fontSize: 14, color: color.t1 },
  repChipTextOn: { color: color.acc, fontFamily: font.numSemibold },

  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: space.md },
  key: {
    width: '31.5%',
    flexGrow: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.ctl,
  },
  keyText: { fontFamily: font.numSemibold, fontSize: 21, color: color.t1 },

  // Flow actions (Done + Next exercise) above Log set — quiet surfaces, distinct from
  // the primary CTA below them.
  flowRow: { flexDirection: 'row', gap: 10, marginTop: space.md },
  doneBtn: {
    width: 104,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.line2,
  },
  doneText: { fontFamily: font.uiSemibold, fontSize: 15, color: color.t2 },
  nextBtn: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.pill,
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.line2,
  },
  nextText: { fontFamily: font.uiSemibold, fontSize: 15, color: color.t1 },
  nextChevron: { fontFamily: font.ui, fontSize: 15, color: color.t2 },

  logBtn: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ctaBg,
    borderWidth: 1,
    borderColor: color.ctaBorder,
    borderRadius: radius.ctl + 1,
    marginTop: space.md,
  },
  // Disabled falls back to the plain surface — in dark that's the same s2 (no visual
  // change); in light it neutralizes the solid accent fill to a clean outline.
  logBtnOff: { backgroundColor: color.s2, borderColor: color.line2 },
  logText: { fontFamily: font.uiSemibold, fontSize: 15, color: color.ctaFg },

  // Plate hint, promoted from a 9.5px footer whisper to a readable line right under
  // the fields (feedback #15). Reserve height so it doesn't shift the pad when it
  // appears/clears as the weight crosses the bar weight.
  plateRow: { minHeight: 16, marginTop: 8, justifyContent: 'center' },
  plateText: { fontFamily: font.numSemibold, fontSize: 11.5, letterSpacing: 0.6, color: color.t2 },

  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: space.md,
  },
  // A real outlined button, not a whisper of footer text — feedback #11 was "no delete
  // set option?" because the old 9.5px link went unseen. Long-press on the grid row is
  // the fast path; this is the discoverable one you reach by tapping a set to edit it.
  deleteBtn: {
    borderWidth: 1,
    borderColor: color.warn,
    borderRadius: radius.key,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteText: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.warn },

  deleteWorkoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  deleteWorkoutHint: { fontFamily: font.num, fontSize: 10.5, color: color.t3 },
  deleteWorkoutText: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.warn },
});
