// Finish summary (mockup 07) — the payoff screen the earlier build skipped
// (finishing dropped you straight home). Stats + a per-exercise recap, then DONE.
// Reached by router.replace after finishWorkout, so back doesn't return to the
// now-finished live grid.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, Loading } from '@/components/ui';
import { useExerciseBests, useWorkout } from '@/data/hooks';
import type { WorkoutSet, Unit } from '@/types/db';
import { formatSet, formatWeight, kgToDisplay } from '@/lib/units';
import { color, font, radius, shadow, space, tracking } from '@/theme/tokens';

/** Session top set: heaviest weight wins, reps break ties. */
function topSet(sets: WorkoutSet[]): WorkoutSet | null {
  return sets.reduce<WorkoutSet | null>((best, s) => {
    if (s.weight_kg == null) return best;
    if (best?.weight_kg == null) return s;
    if (s.weight_kg > best.weight_kg) return s;
    if (s.weight_kg === best.weight_kg && (s.reps ?? 0) > (best.reps ?? 0)) return s;
    return best;
  }, null);
}

export default function FinishScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  // #16: the finish summary always reads in kg — the storage unit. This fixes the
  // unit-label bug (a converted lb volume still got a "t"/tonne suffix), and per
  // the product call the payoff screen shows kg regardless of the display unit.
  const unit: Unit = 'kg';

  // Pre-workout all-time bests (excludes this workout server-side), for the
  // NEW BESTS callout. Order of hooks: must run before the early returns.
  const exerciseIds = (workout.data?.exercises ?? []).map((we) => we.exercise_id);
  const bests = useExerciseBests(id, exerciseIds);

  if (workout.isLoading) return <Loading />;
  if (!workout.data) return <Empty text="Workout not found." />;

  const detail = workout.data;
  const started = new Date(detail.started_at);
  const ended = detail.ended_at ? new Date(detail.ended_at) : new Date();
  const durationMin = Math.max(1, Math.round((ended.getTime() - started.getTime()) / 60000));

  let setCount = 0;
  let totalKg = 0;
  for (const we of detail.exercises) {
    for (const s of we.sets) {
      setCount += 1;
      totalKg += (s.weight_kg ?? 0) * (s.reps ?? 0);
    }
  }
  const vol = kgToDisplay(totalKg, unit);
  const volText = vol >= 1000 ? `${(vol / 1000).toFixed(1)}t` : `${Math.round(vol)}`;

  // NEW BESTS (mockup 07): session top set beat the all-time best that existed
  // before this workout — strictly heavier, or same weight for more reps.
  // Improvements only: a first-ever exercise has no baseline to beat, and bests
  // are an online read (offline finish just omits the section).
  const bestByExercise = new Map((bests.data ?? []).map((b) => [b.exercise_id, b]));
  const newBests = detail.exercises.flatMap((we) => {
    const top = topSet(we.sets);
    const prior = bestByExercise.get(we.exercise_id);
    if (!top || top.weight_kg == null || !prior) return [];
    const beat =
      top.weight_kg > prior.weight_kg ||
      (top.weight_kg === prior.weight_kg && (top.reps ?? 0) > (prior.reps ?? 0));
    return beat
      ? [{ id: we.id, name: we.exercise.canonical_name, val: formatSet(top.weight_kg, top.reps, unit) }]
      : [];
  });

  const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.lg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.saved}>WORKOUT SAVED</Text>
        <Text style={styles.title}>{detail.routine_name ?? 'Empty workout'}</Text>
        <Text style={styles.when}>
          {started.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()} ·{' '}
          {time(started)} — {time(ended)}
        </Text>

        <View style={styles.statRow}>
          <Tile label="DURATION" value={`${durationMin}m`} />
          <Tile label="SETS" value={String(setCount)} />
          <Tile label="VOLUME" value={volText} unit={vol >= 1000 ? '' : unit.toUpperCase()} />
        </View>

        {newBests.length > 0 && (
          <>
            <Text style={[styles.section, styles.bestsLabel, { marginTop: space.xxl }]}>
              NEW BESTS
            </Text>
            {newBests.map((b) => (
              <View key={b.id} style={styles.exRow}>
                <Text style={styles.bestName} numberOfLines={1}>
                  {b.name}
                </Text>
                <Text style={styles.bestVal}>{b.val}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={[styles.section, { marginTop: space.xxl }]}>SESSION</Text>
        {detail.exercises.map((we) => {
          const top = topSet(we.sets);
          return (
            <View key={we.id} style={styles.exRow}>
              <Text style={styles.exName} numberOfLines={1}>
                {we.exercise.canonical_name}
              </Text>
              <Text style={styles.exMeta}>
                {we.sets.length} SET{we.sets.length === 1 ? '' : 'S'}
                {top ? ` · TOP ${formatWeight(top.weight_kg, unit)}` : ''}
              </Text>
            </View>
          );
        })}
        {detail.exercises.length === 0 && <Text style={styles.hint}>No exercises logged.</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.doneWrap}>
          <Text style={styles.done} onPress={() => router.dismissTo('/')}>
            DONE
          </Text>
        </View>
      </View>
    </View>
  );
}

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>
        {value}
        {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xxl, paddingBottom: space.xxl },
  saved: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.wide, color: color.ok },
  title: { fontFamily: font.uiSemibold, fontSize: 22, color: color.t1, marginTop: space.md },
  when: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: 0.8, color: color.t3, marginTop: 7 },

  statRow: {
    flexDirection: 'row',
    gap: 1,
    marginTop: space.xxl,
    backgroundColor: color.line,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  tile: { flex: 1, backgroundColor: color.s0, paddingVertical: 18, paddingHorizontal: 16 },
  tileLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.label, color: color.t3 },
  tileValue: { fontFamily: font.numBold, fontSize: 23, color: color.t1, marginTop: 9 },
  tileUnit: { fontFamily: font.num, fontSize: 11, color: color.t3 },

  section: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  // NEW BESTS — cyan per mockup 07 (the hot palette stays reserved for the live
  // floor-mode PR moment).
  bestsLabel: { color: color.acc },
  bestName: { fontFamily: font.uiSemibold, fontSize: 13, color: color.t1, flex: 1 },
  bestVal: { fontFamily: font.numBold, fontSize: 14, color: color.acc },
  exRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  exName: { fontFamily: font.uiMedium, fontSize: 13, color: color.t2, flex: 1 },
  exMeta: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: 0.4, color: color.t3 },
  hint: { fontFamily: font.num, fontSize: 12, color: color.t3, paddingTop: space.md },

  footer: { paddingHorizontal: space.xxl, paddingTop: space.md },
  doneWrap: {
    height: 52,
    borderRadius: radius.ctl + 1,
    borderWidth: 1,
    borderColor: color.acc35,
    backgroundColor: color.s2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glowSm,
  },
  done: {
    fontFamily: font.uiMedium,
    fontSize: 11,
    letterSpacing: tracking.label,
    color: color.acc,
    paddingVertical: 18,
    paddingHorizontal: 40,
    textAlign: 'center',
  },
});
