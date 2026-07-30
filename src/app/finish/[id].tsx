// Finish summary (mockup 07) — the payoff screen the earlier build skipped
// (finishing dropped you straight home). Stats + a per-exercise recap, then DONE.
// Reached by router.replace after finishWorkout, so back doesn't return to the
// now-finished live grid.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, Loading } from '@/components/ui';
import { useProfile, useWorkout } from '@/data/hooks';
import type { WorkoutSet, Unit } from '@/types/db';
import { formatWeight, kgToDisplay } from '@/lib/units';
import { color, font, radius, shadow, space, tracking } from '@/theme/tokens';

export default function FinishScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const profile = useProfile();
  const unit: Unit = profile.data?.default_unit ?? 'kg';

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

        <Text style={[styles.section, { marginTop: space.xxl }]}>SESSION</Text>
        {detail.exercises.map((we) => {
          const top = we.sets.reduce<WorkoutSet | null>(
            (best, s) => ((s.weight_kg ?? 0) > (best?.weight_kg ?? -1) ? s : best),
            null
          );
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
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  saved: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.wide, color: color.ok },
  title: { fontFamily: font.uiBold, fontSize: 22, color: color.t1, marginTop: space.md },
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
  exRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  exName: { fontFamily: font.uiSemibold, fontSize: 13, color: color.t2, flex: 1 },
  exMeta: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: 0.4, color: color.t3 },
  hint: { fontFamily: font.num, fontSize: 12, color: color.t3, paddingTop: space.md },

  footer: { paddingHorizontal: space.xl, paddingTop: space.md },
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
    fontFamily: font.uiSemibold,
    fontSize: 11,
    letterSpacing: tracking.label,
    color: color.acc,
    paddingVertical: 18,
    paddingHorizontal: 40,
    textAlign: 'center',
  },
});
