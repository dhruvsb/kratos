// Exercise progress (mockup 10) — the "am I getting stronger?" screen and the
// per-exercise weight history. Best / sessions / last up top, a top-set trend
// chart, then every session newest-first. Reached from the library, a past
// workout, or the exercise title mid-set.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { useExercise, useExerciseHistory, useProfile } from '@/data/hooks';
import type { ExerciseHistoryEntry } from '@/data/workouts';
import type { WorkoutSet, Unit, ExerciseModality } from '@/types/db';
import { formatWeight, formatDuration, formatLevel, formatSetByModality, kgToDisplay, trimWeight } from '@/lib/units';
import { font, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const DAY_MS = 86_400_000;

// The single number that represents a set's magnitude for this modality — the
// progress metric plotted + ranked across the whole page.
function metricOf(modality: ExerciseModality): (s: WorkoutSet) => number {
  switch (modality) {
    case 'bodyweight_reps':
      return (s) => s.reps ?? 0;
    case 'time':
    case 'distance_time':
      return (s) => s.duration_seconds ?? 0;
    case 'weight_reps':
    default:
      return (s) => s.weight_kg ?? 0;
  }
}

// Secondary key when two sets tie on the metric: reps for lifts, level for cardio.
function tiebreakOf(modality: ExerciseModality): (s: WorkoutSet) => number {
  switch (modality) {
    case 'distance_time':
      return (s) => s.level ?? 0;
    case 'weight_reps':
      return (s) => s.reps ?? 0;
    default:
      return () => 0;
  }
}

function topSet(sets: WorkoutSet[], modality: ExerciseModality): WorkoutSet | null {
  const metric = metricOf(modality);
  const tie = tiebreakOf(modality);
  return sets.reduce<WorkoutSet | null>(
    (best, s) =>
      best == null ||
      metric(s) > metric(best) ||
      (metric(s) === metric(best) && tie(s) > tie(best))
        ? s
        : best,
    null
  );
}

// The BEST stat, in the exercise's own terms: a big value + a small suffix.
function bestStatOf(set: WorkoutSet, modality: ExerciseModality, unit: Unit): { main: string; suffix: string } {
  switch (modality) {
    case 'bodyweight_reps':
      return { main: `${set.reps ?? '—'}`, suffix: 'reps' };
    case 'time':
      return { main: formatDuration(set.duration_seconds), suffix: '' };
    case 'distance_time':
      return { main: formatDuration(set.duration_seconds), suffix: set.level != null ? `L${formatLevel(set.level)}` : '' };
    case 'weight_reps':
    default:
      return { main: formatWeight(set.weight_kg, unit), suffix: set.reps != null ? `×${set.reps}` : '' };
  }
}

// The chart's min/max range label, formatted for the metric (weight → display
// unit; reps → a count; duration → mm:ss).
function metricRange(min: number, max: number, modality: ExerciseModality, unit: Unit): string {
  switch (modality) {
    case 'bodyweight_reps':
      return `${Math.round(min)}—${Math.round(max)} REPS`;
    case 'time':
    case 'distance_time':
      return `${formatDuration(min)}—${formatDuration(max)}`;
    case 'weight_reps':
    default:
      return `${trimWeight(kgToDisplay(min, unit))}—${trimWeight(kgToDisplay(max, unit))} ${unit.toUpperCase()}`;
  }
}

export default function ExerciseProgressScreen() {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = useExercise(id);
  const history = useExerciseHistory(id);
  const profile = useProfile();
  const unit: Unit = profile.data?.default_unit ?? 'kg';

  // One page-level modality — every session here is the same exercise, so a
  // single metric applies to the whole page. Falls back to weight_reps until the
  // exercise row loads (preserves the legacy lift behaviour).
  const modality: ExerciseModality = exercise.data?.modality ?? 'weight_reps';

  const entries = useMemo<ExerciseHistoryEntry[]>(
    () => (history.data?.pages ?? []).flat(),
    [history.data]
  );

  const derived = useMemo(() => {
    const metric = metricOf(modality);
    let best: WorkoutSet | null = null;
    for (const e of entries) {
      const t = topSet(e.sets, modality);
      if (t && metric(t) > (best ? metric(best) : -1)) best = t;
    }
    const lastDays = entries[0]
      ? Math.round(
          (Date.now() - new Date(entries[0].started_at).getTime()) / DAY_MS
        )
      : null;
    // Chart: top-set metric per session, chronological, last 12.
    const chrono = [...entries].reverse().slice(-12);
    const tops = chrono.map((e) => {
      const t = topSet(e.sets, modality);
      return t ? metric(t) : 0;
    });
    const min = Math.min(...(tops.length ? tops : [0]));
    const max = Math.max(...(tops.length ? tops : [1]));
    const bars = tops.map((w) => {
      const h = max === min ? 70 : 30 + 70 * ((w - min) / (max - min));
      return { h, isPr: w === max && max > 0 };
    });
    return { best, lastDays, bars, min, max };
  }, [entries, modality]);

  if (exercise.isLoading || history.isLoading) return <Loading />;
  if (history.error != null) return <ErrorText error={history.error} />;

  const bestStat = derived.best ? bestStatOf(derived.best, modality, unit) : null;
  const bestMain = bestStat?.main ?? '—';
  const bestSuffix = bestStat?.suffix ?? '';
  const lastLabel =
    derived.lastDays == null ? '—' : derived.lastDays === 0 ? 'TODAY' : `${derived.lastDays}D`;

  const Header = (
    <View>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={styles.back}>← BACK</Text>
      </Pressable>
      <Text style={styles.title}>{exercise.data?.canonical_name ?? ''}</Text>
      <Text style={styles.sub}>
        {[exercise.data?.primary_muscles?.join(', '), exercise.data?.equipment].filter(Boolean).join(' · ').toUpperCase() || 'EXERCISE'}
      </Text>

      <View style={styles.statRow}>
        <View>
          <Text style={styles.statLabel}>BEST</Text>
          <Text style={styles.statValue}>
            {bestMain}
            {bestSuffix !== '' && <Text style={styles.statUnit}> {bestSuffix}</Text>}
          </Text>
        </View>
        <View>
          <Text style={styles.statLabel}>SESSIONS</Text>
          <Text style={styles.statValue}>{entries.length}</Text>
        </View>
        <View>
          <Text style={styles.statLabel}>LAST</Text>
          <Text style={[styles.statValue, { color: color.t2 }]}>{lastLabel}</Text>
        </View>
      </View>

      {derived.bars.length > 1 && (
        <View style={{ marginTop: space.xxl }}>
          <View style={styles.chartHead}>
            <Text style={styles.statLabel}>TOP SET · LAST {derived.bars.length}</Text>
            <Text style={styles.chartRange}>
              {metricRange(derived.min, derived.max, modality, unit)}
            </Text>
          </View>
          <View style={styles.chart}>
            {derived.bars.map((b, i) => (
              <View
                key={i}
                style={[
                  styles.bar,
                  { height: `${b.h}%`, backgroundColor: b.isPr ? color.acc14 : color.s1 },
                  b.isPr && { borderTopWidth: 1, borderTopColor: color.acc, ...shadow.glowSm },
                ]}
              />
            ))}
          </View>
        </View>
      )}

      <Text style={[styles.statLabel, { marginTop: space.xxl }]}>EVERY SESSION</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.workout_id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={Header}
        onEndReached={() => {
          if (history.hasNextPage && !history.isFetchingNextPage) history.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => {
          const t = topSet(item.sets, modality);
          const metric = metricOf(modality);
          const tie = tiebreakOf(modality);
          const isBest =
            t != null &&
            derived.best != null &&
            metric(t) === metric(derived.best) &&
            tie(t) === tie(derived.best);
          const summary = item.sets
            .map((s) => formatSetByModality(s, modality, unit))
            .join('  ·  ');
          return (
            <Pressable style={styles.sessionRow} onPress={() => router.push(`/history/${item.workout_id}`)}>
              <Text style={styles.sessionDate}>
                {new Date(item.started_at)
                  .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
                  .toUpperCase()}
              </Text>
              <Text style={styles.sessionSets} numberOfLines={1}>
                {summary}
              </Text>
              {isBest && <Text style={styles.bestTag}>▲ BEST</Text>}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Empty text="Never performed. It's leg day somewhere." />}
        ListFooterComponent={
          history.isFetchingNextPage ? <Text style={styles.loadingMore}>LOADING…</Text> : null
        }
      />
    </View>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xxl, paddingBottom: space.xxl },
  back: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },
  title: { fontFamily: font.uiSemibold, fontSize: 21, color: color.t1, marginTop: space.lg },
  sub: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3, marginTop: 7 },

  statRow: { flexDirection: 'row', gap: 28, marginTop: space.xl },
  statLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  statValue: { fontFamily: font.numBold, fontSize: 20, color: color.t1, marginTop: 7 },
  statUnit: { fontFamily: font.num, fontSize: 11, color: color.t3 },

  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chartRange: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: 0.6, color: color.t3 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 88,
    marginTop: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  bar: { flex: 1, backgroundColor: color.s1, borderTopLeftRadius: 1, borderTopRightRadius: 1 },

  sessionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  sessionDate: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: 0.6, color: color.t3, width: 64 },
  sessionSets: { fontFamily: font.numSemibold, fontSize: 12, color: color.t2, flex: 1 },
  bestTag: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.6, color: color.acc },
  loadingMore: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3, textAlign: 'center', padding: space.md },
});
