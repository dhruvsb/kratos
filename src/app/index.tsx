// Home — "RepVoice Home Final" (ring dates + records). Whitespace-reduced: a fixed
// single-line streak header, then a rolling five-week **ring-date** heatmap (each day a
// circle — trained days get a filled accent ring, today a dashed ring), then the recent
// workouts as rows of date · name · session volume. The floating glass tab pill + green
// FAB dock at the bottom (content scrolls under the glass — no fade, so it has something
// to refract). Per-session PR "records" badges are deferred (backlog #35, high pri).
//
// Running-workout resume + day-zero states are deferred — see docs/FEEDBACK-LOG.md #33/#34.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeQuickStart } from '@/components/home/HomeQuickStart';
import { HomeTabBar, TAB_BAR_HEIGHT } from '@/components/voice/TabBar';
import { useWorkoutDays } from '@/data/calendar';
import { useWorkoutList } from '@/data/hooks';
import { startOfDay } from '@/lib/dates';
import { computeStreak, type HeatCell } from '@/lib/streak';
import { font, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function HomeScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();
  const days = useWorkoutDays(); // all finished-workout days — accurate streak + heatmap
  const history = useWorkoutList(); // paginated rows for the inline history list

  // Days you showed up (one entry per calendar day).
  const doneDays = useMemo(() => {
    const s = new Set<number>();
    for (const w of days.data ?? []) s.add(startOfDay(new Date(w.started_at)));
    return s;
  }, [days.data]);

  const { streak, best, cells } = useMemo(() => computeStreak(doneDays), [doneDays]);

  const workouts = history.data?.pages.flat() ?? [];

  // 5 rows of 7 for the heatmap.
  const rows = useMemo(() => {
    const out: HeatCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  return (
    <View style={styles.screen}>
      {/* Fixed single-line streak header — always visible above the scrolling feed. */}
      <View style={[styles.streakHead, { paddingTop: insets.top + 14 }]}>
        <View style={styles.streakDot} />
        <Text style={styles.streakText}>{streak} DAY STREAK</Text>
        <View style={styles.streakRule} />
        <Text style={styles.streakBest}>BEST {best}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: space.xl + TAB_BAR_HEIGHT }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Rolling five-week ring-date heatmap */}
        <View style={styles.dowRow}>
          {DOW.map((d, i) => (
            <Text key={i} style={styles.dow}>
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.grid}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              {row.map((cell, ci) => (
                <HeatDot key={ci} cell={cell} color={color} styles={styles} />
              ))}
            </View>
          ))}
        </View>

        {/* Recent workouts — date · name · session volume (records badge = backlog #35) */}
        <View style={styles.rowsBlock}>
          {history.isLoading ? (
            <Text style={styles.loading}>LOADING…</Text>
          ) : workouts.length === 0 ? (
            <Text style={styles.empty}>No workouts yet. Your history will fill in here.</Text>
          ) : (
            workouts.map((w) => {
              const started = new Date(w.started_at);
              const dow = started.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
              // Guard a pre-volume_kg cached row (or a null) from rendering "NaNk".
              const vol = Number.isFinite(w.volume_kg) ? `${(w.volume_kg / 1000).toFixed(1)}k` : '—';
              return (
                <Pressable key={w.id} style={styles.histRow} onPress={() => router.push(`/history/${w.id}`)}>
                  <View style={styles.histDate}>
                    <Text style={styles.histDd}>{String(started.getDate()).padStart(2, '0')}</Text>
                    <Text style={styles.histDow}>{dow}</Text>
                  </View>
                  <Text style={styles.histName} numberOfLines={1}>
                    {w.routine_name ?? 'Empty workout'}
                  </Text>
                  <View style={styles.histVol}>
                    <Text style={styles.histVolNum}>{vol}</Text>
                    <Text style={styles.histVolUnit}>KG</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* No bottom fade — the feed scrolls *under* the glass pill so it has live content
          to refract (a fade would blank the area behind it). */}
      <HomeTabBar active="home" withFab />

      {/* FAB + "MOST USED" quick-start sheet — overlays everything, incl. the tab pill. */}
      <HomeQuickStart />
    </View>
  );
}

// One heatmap day as a ring-date circle: worked days get a solid accent ring + faint
// tint fill, today a dashed accent ring, every other day just its number.
function HeatDot({
  cell,
  color,
  styles,
}: {
  cell: HeatCell;
  color: Theme['color'];
  styles: ReturnType<typeof makeStyles>;
}) {
  const look = cellLook(cell, color);
  return (
    <View style={styles.cellWrap}>
      <View
        style={[
          styles.cell,
          { borderColor: look.ring, borderStyle: look.dashed ? 'dashed' : 'solid', backgroundColor: look.bg },
        ]}
      >
        <Text style={[styles.cellNum, { color: look.fg }]}>{cell.n}</Text>
      </View>
    </View>
  );
}

function cellLook(cell: HeatCell, color: Theme['color']) {
  if (cell.isToday) return { ring: color.acc, dashed: true, bg: 'transparent', fg: color.acc };
  if (cell.state === 'worked') return { ring: color.acc, dashed: false, bg: color.acc14, fg: color.acc };
  return { ring: 'transparent', dashed: false, bg: 'transparent', fg: color.t3 };
}

const makeStyles = (color: Theme['color']) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg },
    content: { paddingHorizontal: space.xxl, paddingTop: space.lg },

    // Fixed single-line streak header
    streakHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.xxl, paddingBottom: space.md },
    streakDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: color.acc },
    streakText: { fontFamily: font.numBold, fontSize: 15, letterSpacing: 1.4, color: color.t1 },
    streakRule: { flex: 1, height: 1, backgroundColor: color.line },
    streakBest: { fontFamily: font.num, fontSize: 15, letterSpacing: 1.4, color: color.t3 },

    // Ring-date heatmap
    dowRow: { flexDirection: 'row', marginTop: space.sm, marginBottom: 4 },
    dow: { flex: 1, textAlign: 'center', fontFamily: font.num, fontSize: 10, letterSpacing: 0.6, color: color.t3 },
    grid: { marginTop: 6, gap: 8 },
    gridRow: { flexDirection: 'row', gap: 4 },
    cellWrap: { flex: 1, alignItems: 'center' },
    cell: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellNum: { fontFamily: font.uiSemibold, fontSize: 14 },

    // Recent workouts
    rowsBlock: { marginTop: space.xxl },
    loading: { fontFamily: font.numSemibold, fontSize: 11, color: color.t3, marginTop: space.md },
    empty: { fontFamily: font.num, fontSize: 11.5, lineHeight: 20, color: color.t2, marginTop: space.md },
    histRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 13,
      borderTopWidth: 1,
      borderTopColor: color.line,
    },
    histDate: { width: 44 },
    histDd: { fontFamily: font.uiSemibold, fontSize: 15, color: color.t1 },
    histDow: { fontFamily: font.num, fontSize: 9, letterSpacing: 1, color: color.t3, marginTop: 5 },
    histName: { flex: 1, fontFamily: font.ui, fontSize: 17, color: color.t1 },
    histVol: { width: 76, alignItems: 'flex-end' },
    histVolNum: { fontFamily: font.uiSemibold, fontSize: 14, color: color.t1 },
    histVolUnit: { fontFamily: font.num, fontSize: 9, letterSpacing: 1, color: color.t3, marginTop: 5 },
  });
