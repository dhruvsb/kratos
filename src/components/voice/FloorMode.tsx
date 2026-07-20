// Floor mode — the mockup's "phone on the floor, 2m away" screen. Two sub-states:
// Resting (rest countdown + next/last/set summary) and PR (a thermal celebration,
// the one place the system's color goes warm). Entered by the console's FLOOR key
// or by laying the phone face-up and still; exits on pickup or tap.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import type { WorkoutExerciseDetail } from '@/data/workouts';
import type { LastSessionSet } from '@/types/db';
import { color, font, shadow, space, timing, tracking } from '@/theme/tokens';
import { LedDigits, LevelMeter, StatusPip, TickRule } from './primitives';

function bestPrevious(sets: LastSessionSet[]): { weightKg: number; reps: number } | null {
  let best: { weightKg: number; reps: number } | null = null;
  for (const s of sets) {
    if (s.weight_kg == null || s.reps == null) continue;
    if (!best || s.weight_kg > best.weightKg || (s.weight_kg === best.weightKg && s.reps > best.reps)) {
      best = { weightKg: s.weight_kg, reps: s.reps };
    }
  }
  return best;
}

export function FloorMode({
  exercise,
  lastSessionSets,
  onClose,
}: {
  workoutId: string;
  exercise: WorkoutExerciseDetail;
  lastSessionSets: LastSessionSet[];
  onClose: () => void;
}) {
  const [subState, setSubState] = useState<'resting' | 'pr'>('resting');
  const [restSecs, setRestSecs] = useState<number>(timing.restDefaultSec);
  const seenSetCount = useRef(exercise.sets.length);

  const sets = exercise.sets;
  const last = sets[sets.length - 1];
  const secondLast = sets[sets.length - 2];

  // A newly-appended set: reset the rest countdown and check for a PR.
  useEffect(() => {
    if (sets.length <= seenSetCount.current) return;
    seenSetCount.current = sets.length;
    setRestSecs(timing.restDefaultSec);
    const newest = sets[sets.length - 1];
    const best = bestPrevious(lastSessionSets);
    const isPr =
      newest?.weight_kg != null &&
      newest?.reps != null &&
      (!best || newest.weight_kg > best.weightKg || (newest.weight_kg === best.weightKg && newest.reps > best.reps));
    if (isPr) {
      setSubState('pr');
      const t = setTimeout(() => setSubState('resting'), timing.prMomentMs);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets.length]);

  // Rest countdown ticks while resting.
  useEffect(() => {
    if (subState !== 'resting') return;
    const t = setInterval(() => setRestSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [subState]);

  // Exit on pickup: z-axis gravity drops once the phone is lifted off a flat surface.
  useEffect(() => {
    Accelerometer.setUpdateInterval(300);
    const sub = Accelerometer.addListener(({ z }) => {
      if (Math.abs(z) < timing.floorGyroThreshold) onClose();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mm = Math.floor(restSecs / 60);
  const ss = restSecs % 60;

  return (
    <Pressable style={styles.screen} onPress={onClose}>
      {subState === 'resting' ? (
        <View style={styles.center}>
          <StatusPip label="LISTENING" />
          <Text style={styles.restLabel}>REST</Text>
          <LedDigits value={`${mm}:${ss.toString().padStart(2, '0')}`} size={96} style={{ marginTop: space.sm }} />
          <TickRule width={210} />
          <View style={styles.summaryRow}>
            <SummaryCol label="NEXT" value={exercise.exercise.canonical_name.toUpperCase()} />
            <View style={styles.divider} />
            <SummaryCol
              label="LAST"
              value={last ? `${last.weight_kg ?? '—'}×${last.reps ?? '—'}` : '—'}
              dim
            />
            <View style={styles.divider} />
            <SummaryCol label="SET" value={`${sets.length}`} />
          </View>
          <LevelMeter height={22} opacity={0.7} style={{ marginTop: space.xxl, width: 150 }} />
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.prTag}>NEW PR</Text>
          <View style={styles.effortChip}>
            <Text style={styles.effortLabel}>EFFORT</Text>
            <View style={styles.effortBar} />
            <Text style={styles.effortPeak}>PEAK</Text>
          </View>
          <Text style={styles.prExercise}>{exercise.exercise.canonical_name.toUpperCase()}</Text>
          <Text style={styles.prWeight}>{last?.weight_kg?.toFixed(1) ?? '—'}</Text>
          <Text style={styles.prReps}>× {last?.reps ?? '—'}</Text>
          <View style={styles.prRule} />
          {secondLast?.weight_kg != null && last?.weight_kg != null && (
            <Text style={styles.prDelta}>
              {secondLast.weight_kg.toFixed(1)} → {last.weight_kg.toFixed(1)} · +
              {(last.weight_kg - secondLast.weight_kg).toFixed(1)} KG
            </Text>
          )}
          <Text style={styles.prMeta}>SET {sets.length} OF {sets.length} · REST {timing.restDefaultSec / 60}:00</Text>
        </View>
      )}
    </Pressable>
  );
}

function SummaryCol({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, dim && { color: color.t2 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  center: { alignItems: 'center' },
  restLabel: { fontFamily: font.numSemibold, fontSize: 15, letterSpacing: tracking.widest, color: color.t3, marginTop: space.xl },
  summaryRow: { flexDirection: 'row', gap: space.xxl, marginTop: space.xxl, alignItems: 'center' },
  divider: { width: 1, height: 32, backgroundColor: color.line },
  summaryLabel: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.wide, color: color.t3 },
  summaryValue: { fontFamily: font.numBold, fontSize: 22, color: color.t1, marginTop: space.xs },

  prTag: { fontFamily: font.numBold, fontSize: 11, letterSpacing: tracking.widest, color: color.hot, textShadowColor: color.hotGlow, textShadowRadius: 12 },
  effortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,138,60,0.4)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginTop: space.md,
  },
  effortLabel: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.t3 },
  effortBar: { width: 60, height: 5, borderRadius: 3, backgroundColor: color.hot },
  effortPeak: { fontFamily: font.numBold, fontSize: 10, color: color.hot },
  prExercise: { fontFamily: font.numBold, fontSize: 26, color: color.t2, marginTop: space.xxl },
  prWeight: { fontFamily: font.numBold, fontSize: 110, color: color.t1, marginTop: 2, ...shadow.glowHot },
  prReps: { fontFamily: font.numBold, fontSize: 38, color: color.hot, marginTop: 4 },
  prRule: { width: 190, height: 2, backgroundColor: color.hot, marginTop: space.xxl, ...shadow.glowHot },
  prDelta: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: tracking.label, color: color.t2, marginTop: space.lg },
  prMeta: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.t3, marginTop: space.sm },
});
