// Set-entry keypad (mockup 05). A bottom sheet over the set grid: two big LED
// fields (KG active / REPS), ±step + SAME-AS-LAST shortcuts, a numeric pad, and a
// plate-math hint. Storage is kg; entry is in the profile's display unit and
// converted on LOG. Used for both adding a new set and editing a logged one.
import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Caret } from '@/components/workout/Caret';
import { haptics } from '@/lib/haptics';
import {
  displayToKg,
  formatSet,
  kgToDisplay,
  platesLabel,
  step,
  trimWeight,
} from '@/lib/units';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import type { Unit } from '@/types/db';

type Field = 'kg' | 'reps';

export type SetKeypadProps = {
  visible: boolean;
  exerciseName: string;
  setNumber: number;
  unit: Unit;
  /** Same-index set from last session (kg), for the SAME-AS-LAST shortcut + label. */
  lastKg?: number | null;
  lastReps?: number | null;
  /** Prefill (kg) — usually the same last-session set, or the value being edited. */
  initialKg: number | null;
  initialReps: number | null;
  mode?: 'add' | 'edit';
  onLog: (weightKg: number | null, reps: number) => void;
  onDelete?: () => void;
  /** Edit mode only: "wrong day entirely" — delete the whole workout. Kept visually
   *  apart from SAVE / DELETE SET so it can't be hit by muscle memory (mockup 17). */
  onDeleteWorkout?: () => void;
  onClose: () => void;
};

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

// Decision 1a: one control row does both jobs — two weight steps (±step) then the
// three working-rep chips that cover the overwhelming majority of sets, so a full set
// is "±weight / tap a rep chip → Log". Odd counts (singles, triples, 15s, 20s, AMRAP)
// stay reachable: tap the REPS field and the pad edits reps directly, so nothing is
// unloggable. The ⌫ escape hatch lives in the keypad's bottom-right.
const REP_CHIPS = [8, 10, 12] as const;

// Sane upper bound on an entered weight (in kg). Covers every real barbell / dumbbell
// / machine number with margin, and — critically — stays under weight_kg's
// numeric(6,2) ceiling (9999.99) so a mistyped weight can't overflow the column and
// throw on insert mid-workout (feedback #14).
const MAX_WEIGHT_KG = 1000;

export function SetKeypad(props: SetKeypadProps) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const { visible, unit, initialKg, initialReps, lastKg, lastReps } = props;
  const insets = useSafeAreaInsets();
  const [kgStr, setKgStr] = useState('');
  const [repsStr, setRepsStr] = useState('');
  const [active, setActive] = useState<Field>('kg');

  // Reset the buffers each time the sheet opens for a (new) set.
  useEffect(() => {
    if (!visible) return;
    setKgStr(initialKg == null ? '' : trimWeight(kgToDisplay(initialKg, unit)));
    setRepsStr(initialReps == null ? '' : String(initialReps));
    setActive('kg');
  }, [visible, initialKg, initialReps, unit]);

  const setActiveStr = (updater: (s: string) => string) =>
    active === 'kg' ? setKgStr(updater) : setRepsStr(updater);

  function pressPad(key: string) {
    if (key === '⌫') return setActiveStr((s) => s.slice(0, -1));
    if (key === '.') {
      if (active !== 'kg') return; // reps are integers
      return setKgStr((s) => (s.includes('.') ? s : (s === '' ? '0.' : s + '.')));
    }
    // digit
    setActiveStr((s) => {
      if (active === 'reps' && s.length >= 3) return s; // sane cap
      if (active === 'kg') {
        const next = s + key;
        // one decimal place max
        if (next.includes('.') && next.split('.')[1].length > 1) return s;
        if (next.replace('.', '').length > 5) return s;
        // hard weight ceiling — a typo can't overflow numeric(6,2) or the plate math
        if (displayToKg(parseFloat(next) || 0, unit) > MAX_WEIGHT_KG) return s;
      }
      return s + key;
    });
  }

  function adjust(sign: 1 | -1) {
    if (active === 'kg') {
      const cur = parseFloat(kgStr || '0') || 0;
      const maxDisplay = kgToDisplay(MAX_WEIGHT_KG, unit);
      const next = Math.min(maxDisplay, Math.max(0, Math.round((cur + sign * step(unit)) * 10) / 10));
      setKgStr(next === 0 && kgStr === '' ? '' : trimWeight(next));
    } else {
      const cur = parseInt(repsStr || '0', 10) || 0;
      const next = Math.max(0, cur + sign);
      setRepsStr(next === 0 ? '' : String(next));
    }
  }

  const reps = parseInt(repsStr || '0', 10) || 0;
  const kgDisplay = kgStr === '' ? null : parseFloat(kgStr);
  const weightKg = kgDisplay == null ? null : displayToKg(kgDisplay, unit);
  const canLog = reps > 0;
  const plates = platesLabel(weightKg);

  function log() {
    if (!canLog) return;
    haptics.log();
    props.onLog(weightKg, reps);
  }

  const lastLabel =
    lastKg != null || lastReps != null ? `LAST ${formatSet(lastKg, lastReps, unit)}` : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.handle} />

        <View style={styles.titleRow}>
          <Text style={styles.title}>Set {props.setNumber}</Text>
          {lastLabel && <Text style={styles.lastLabel}>{lastLabel}</Text>}
        </View>

        <View style={styles.fields}>
          <Field
            label={unit.toUpperCase()}
            value={kgStr || '0'}
            dim={kgStr === ''}
            active={active === 'kg'}
            onPress={() => setActive('kg')}
          />
          <Field
            label="REPS"
            value={repsStr || '0'}
            dim={repsStr === ''}
            active={active === 'reps'}
            onPress={() => setActive('reps')}
          />
        </View>

        {/* Plate hint sits right under the weight field, where the eyes are while
            typing — not buried at the bottom of the sheet (feedback #15). */}
        {/* One control row (decision 1a): two weight steps + the working-rep chips. */}
        <View style={styles.chipRow}>
          <Pressable style={styles.stepChip} onPress={() => adjust(-1)}>
            <Text style={styles.stepText}>−{step(unit)}</Text>
          </Pressable>
          <Pressable style={styles.stepChip} onPress={() => adjust(1)}>
            <Text style={styles.stepText}>+{step(unit)}</Text>
          </Pressable>
          {REP_CHIPS.map((n) => {
            const on = reps === n;
            return (
              <Pressable
                key={n}
                style={[styles.repChip, on && styles.repChipOn]}
                // Set reps and hand focus back to KG so the pad stays weight — the
                // common flow needs no field switch (feedback #13).
                onPress={() => {
                  // Detent tick only when the value actually moves — re-tapping the
                  // chip you're already on stays silent, so a tap-tap-tap run of
                  // identical sets buzzes once per LOG, not once per touch.
                  if (!on) haptics.tick();
                  setRepsStr(String(n));
                  setActive('kg');
                }}
              >
                <Text style={[styles.repChipText, on && styles.repChipTextOn]}>{n}</Text>
              </Pressable>
            );
          })}
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

        <Pressable
          style={[styles.logBtn, !canLog && styles.logBtnOff]}
          onPress={log}
          disabled={!canLog}
        >
          <Text style={[styles.logText, !canLog && { color: color.t3 }]}>
            {props.mode === 'edit' ? 'SAVE SET' : 'LOG SET'}
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
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t2 },
  lastLabel: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: 0.6, color: color.t3 },

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

  // 1a control row: two weight-step pills + three rep chips, all one height.
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
  logText: { fontFamily: font.uiMedium, fontSize: 11, letterSpacing: tracking.label, color: color.ctaFg },

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
