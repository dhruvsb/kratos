// History (mockup 08) — finished workouts, newest first, grouped by month. Three
// numbers up top answer "am I still showing up?". Tap a row for the full session.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorText, Loading } from '@/components/ui';
import { useWorkoutList } from '@/data/hooks';
import type { WorkoutListItem } from '@/data/workouts';
import { color, font, space, tracking } from '@/theme/tokens';

const DAY_MS = 86_400_000;
type Listed =
  | { type: 'header'; key: string; label: string }
  | { type: 'row'; key: string; w: WorkoutListItem };

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const list = useWorkoutList();
  const workouts = useMemo(() => (list.data?.pages ?? []).flat(), [list.data]);

  const stats = useMemo(() => {
    const today = new Date();
    const dow = (today.getDay() + 6) % 7;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - dow * DAY_MS;
    let thisWeek = 0;
    let durSum = 0;
    let durCount = 0;
    for (const w of workouts) {
      if (new Date(w.started_at).getTime() >= monday) thisWeek += 1;
      if (w.ended_at) {
        durSum += (new Date(w.ended_at).getTime() - new Date(w.started_at).getTime()) / 60000;
        durCount += 1;
      }
    }
    return { thisWeek, avgMin: durCount ? Math.round(durSum / durCount) : 0 };
  }, [workouts]);

  const rows = useMemo<Listed[]>(() => {
    const out: Listed[] = [];
    let lastMonth = '';
    for (const w of workouts) {
      const m = new Date(w.started_at)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        .toUpperCase();
      if (m !== lastMonth) {
        out.push({ type: 'header', key: `h-${m}`, label: m });
        lastMonth = m;
      }
      out.push({ type: 'row', key: w.id, w });
    }
    return out;
  }, [workouts]);

  if (list.isLoading) return <Loading />;
  if (list.error != null) return <ErrorText error={list.error} />;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.lg }]}>
      <View style={styles.head}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.count}>{workouts.length} LOGGED</Text>
      </View>
      <View style={styles.statRow}>
        <Stat label="THIS WEEK" value={String(stats.thisWeek)} />
        <Stat label="AVG SESSION" value={stats.avgMin ? String(stats.avgMin) : '—'} unit="MIN" />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.content}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text style={styles.monthLabel}>{item.label}</Text>
          ) : (
            <Pressable style={styles.row} onPress={() => router.push(`/history/${item.w.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.w.routine_name ?? 'Empty workout'}
                </Text>
                <Text style={styles.rowMeta}>
                  {new Date(item.w.started_at)
                    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
                    .toUpperCase()}{' '}
                  · {item.w.exercise_count} EX
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.rowSets}>{item.w.set_count}</Text>
                <Text style={styles.rowSetsLabel}>SETS</Text>
              </View>
            </Pressable>
          )
        }
        ListEmptyComponent={<Text style={styles.empty}>No workouts yet. Go lift something.</Text>}
        ListFooterComponent={
          list.isFetchingNextPage ? <Text style={styles.loadingMore}>LOADING…</Text> : null
        }
      />
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        {unit && <Text style={styles.statUnit}> {unit}</Text>}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: space.xl },
  title: { fontFamily: font.uiBold, fontSize: 22, color: color.t1 },
  count: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },

  statRow: { flexDirection: 'row', gap: space.xxl, paddingHorizontal: space.xl, paddingTop: space.lg },
  statLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  statValue: { fontFamily: font.numBold, fontSize: 21, color: color.t1, marginTop: 7 },
  statUnit: { fontFamily: font.num, fontSize: 11, color: color.t3 },

  content: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xxl },
  monthLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3, paddingBottom: 4, paddingTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.line },
  rowName: { fontFamily: font.uiSemibold, fontSize: 14, color: color.t1 },
  rowMeta: { fontFamily: font.num, fontSize: 9.5, letterSpacing: 0.6, color: color.t3, marginTop: 5 },
  rowSets: { fontFamily: font.numBold, fontSize: 14, color: color.t2 },
  rowSetsLabel: { fontFamily: font.num, fontSize: 8, letterSpacing: 0.6, color: color.t3, marginTop: 3 },

  empty: { fontFamily: font.num, fontSize: 12, color: color.t3, paddingTop: space.xl },
  loadingMore: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3, textAlign: 'center', padding: space.md },
});
