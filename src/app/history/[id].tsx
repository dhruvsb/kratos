// Past workout (mockup 09) — read-only session detail, same set typography as the
// live grid. Tap an exercise to jump to its progress.
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { useProfile, useWorkout } from '@/data/hooks';
import type { WorkoutSet, Unit } from '@/types/db';
import { formatSet, formatWeight } from '@/lib/units';
import { color, font, space, tracking } from '@/theme/tokens';

export default function WorkoutDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const profile = useProfile();
  const unit: Unit = profile.data?.default_unit ?? 'kg';

  if (workout.isLoading) return <Loading />;
  if (workout.error != null) return <ErrorText error={workout.error} />;
  if (!workout.data) return <Empty text="Workout not found." />;

  const detail = workout.data;
  const started = new Date(detail.started_at);
  const ended = detail.ended_at ? new Date(detail.ended_at) : null;
  const durationMin = ended ? Math.round((ended.getTime() - started.getTime()) / 60000) : null;
  const totalKg = detail.exercises.reduce(
    (sum, we) => sum + we.sets.reduce((s, set) => s + (set.weight_kg ?? 0) * (set.reps ?? 0), 0),
    0
  );

  const meta = [
    detail.routine_name ?? 'Empty workout',
    durationMin != null ? `${durationMin} MIN` : 'IN PROGRESS',
    `${Math.round(totalKg).toLocaleString()} KG`,
  ]
    .join(' · ')
    .toUpperCase();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← HISTORY</Text>
        </Pressable>
        <Text style={styles.title}>
          {started.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
        {detail.notes ? <Text style={styles.notes}>{detail.notes}</Text> : null}

        {detail.exercises.length === 0 && <Empty text="No exercises in this workout." />}

        {detail.exercises.map((we) => {
          const top = we.sets.reduce<WorkoutSet | null>(
            (best, s) => ((s.weight_kg ?? 0) > (best?.weight_kg ?? -1) ? s : best),
            null
          );
          return (
            <View key={we.id} style={styles.block}>
              <Pressable style={styles.blockHead} onPress={() => router.push(`/exercise/${we.exercise_id}`)}>
                <Text style={styles.blockTitle} numberOfLines={1}>
                  {we.exercise.canonical_name.toUpperCase()}
                </Text>
                {top && <Text style={styles.blockTop}>TOP {formatWeight(top.weight_kg, unit)}</Text>}
              </Pressable>
              {we.sets.map((set, i) => (
                <View key={set.id} style={styles.setRow}>
                  <Text style={styles.setNum}>{set.set_type === 'warmup' ? 'W' : i + 1}</Text>
                  <Text style={styles.setVal}>{formatSet(set.weight_kg, set.reps, unit)}</Text>
                  {set.set_type !== 'normal' && (
                    <Text style={styles.setTag}>{set.set_type.toUpperCase()}</Text>
                  )}
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  back: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },
  title: { fontFamily: font.uiBold, fontSize: 21, color: color.t1, marginTop: space.lg },
  meta: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: 0.8, color: color.t2, marginTop: 7 },
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

  block: { marginTop: space.xxl },
  blockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: color.line2,
  },
  blockTitle: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: 0.8, color: color.t1, flex: 1 },
  blockTop: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    borderStyle: 'dashed',
  },
  setNum: { fontFamily: font.numSemibold, fontSize: 9.5, color: color.t3, width: 20 },
  setVal: { fontFamily: font.numBold, fontSize: 15, color: color.t1, flex: 1 },
  setTag: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
});
