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
import Svg, { Circle, Path } from 'react-native-svg';
import { HomeDayZero } from '@/components/home/HomeDayZero';
import { HomeQuickStart } from '@/components/home/HomeQuickStart';
import { HomeTabBar, TAB_BAR_HEIGHT } from '@/components/voice/TabBar';
import { ActiveWorkoutBar } from '@/components/workout/ActiveWorkoutBar';
import { useWorkoutDays } from '@/data/calendar';
import { useWorkoutList, useWorkoutPrCounts } from '@/data/hooks';
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
  const prCounts = useWorkoutPrCounts(); // per-workout PR "records" counts (#35)

  // Days you showed up (one entry per calendar day).
  const doneDays = useMemo(() => {
    const s = new Set<number>();
    for (const w of days.data ?? []) s.add(startOfDay(new Date(w.started_at)));
    return s;
  }, [days.data]);

  const { streak, best, cells } = useMemo(() => computeStreak(doneDays), [doneDays]);

  // Day-zero: a brand-new user with zero finished workouts gets a proper welcome instead of
  // an empty streak/heatmap/history feed. Wait for the days query to settle so we never flash
  // day-zero over a hydrating cache (#34).
  const isDayZero = !days.isLoading && doneDays.size === 0;

  const workouts = history.data?.pages.flat() ?? [];

  // 5 rows of 7 for the heatmap.
  const rows = useMemo(() => {
    const out: HeatCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  if (isDayZero) {
    return (
      <View style={styles.screen}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 14, paddingBottom: space.xl + TAB_BAR_HEIGHT },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <HomeDayZero />
        </ScrollView>

        <HomeTabBar active="home" withFab />
        <ActiveWorkoutBar />
        <HomeQuickStart />
      </View>
    );
  }

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
              const pr = prCounts.data?.[w.id] ?? 0;
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
                  <View style={styles.histPr}>
                    {pr > 0 ? <PrBadge count={pr} color={color} styles={styles} /> : <Text style={styles.histPrNone}>—</Text>}
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

      {/* Persistent active-workout bar (above the pill; null when nothing's running). */}
      <ActiveWorkoutBar />

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

// PR "records" badge (#35): a small medal + the count of exercises that set a PR that
// session (heaviest weight at reps ≥ 6, beating every earlier session — see migration 0007).
function PrBadge({
  count,
  color,
  styles,
}: {
  count: number;
  color: Theme['color'];
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.prBadge}>
      <Svg width={15} height={19} viewBox="0 0 24 30">
        <Path d="M6.6 0h10.8v4.2L13.4 6.2h-2.8L6.6 4.2z" fill={color.acc14} />
        <Circle cx={12} cy={7.4} r={1.5} fill={color.acc} />
        <Path
          d="M12 10.6l2.07 5.55 5.91-.26-4.63 3.68 1.58 6.44L12 22.52l-4.93 3.47 1.58-6.44-4.63-3.68 5.91.26z"
          fill={color.acc}
        />
      </Svg>
      <Text style={styles.prBadgeNum}>{count}</Text>
    </View>
  );
}

function cellLook(cell: HeatCell, color: Theme['color']) {
  // Today keeps its dashed accent ring so it stays findable at a glance, but it
  // must ALSO carry the worked fill once you've trained: this check used to
  // short-circuit before the `worked` branch, so a finished workout left today
  // looking identical to a day you skipped — no acknowledgement on the one
  // screen whose whole job is "did I show up today?".
  if (cell.isToday) {
    const worked = cell.state === 'worked';
    return {
      ring: color.acc,
      dashed: true,
      bg: worked ? color.acc14 : 'transparent',
      fg: color.acc,
    };
  }
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
    histVol: { width: 70, alignItems: 'flex-end' },
    histVolNum: { fontFamily: font.uiSemibold, fontSize: 14, color: color.t1 },
    histVolUnit: { fontFamily: font.num, fontSize: 9, letterSpacing: 1, color: color.t3, marginTop: 5 },
    histPr: { width: 46, alignItems: 'flex-end' },
    histPrNone: { fontFamily: font.num, fontSize: 13, color: color.t3 },
    prBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 5,
      paddingLeft: 6,
      paddingRight: 8,
      borderRadius: 20,
      backgroundColor: color.acc06,
    },
    prBadgeNum: { fontFamily: font.numBold, fontSize: 12, color: color.acc },
  });
