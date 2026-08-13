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
import { PrBadge } from '@/components/PrBadge';
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

  // "N in last 30 days" — sessions trained in the trailing month, shown on the
  // history divider (refined design). Counts finished-workout days from the accurate
  // `days` query, not the paginated history list.
  const last30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return (days.data ?? []).filter((w) => new Date(w.started_at).getTime() >= cutoff).length;
  }, [days.data]);

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

        {/* History divider — label · rule · "N in last 30 days" (refined design). */}
        <View style={styles.histHead}>
          <Text style={styles.histHeadLabel}>HISTORY</Text>
          <View style={styles.histHeadRule} />
          {last30 > 0 && <Text style={styles.histHeadCount}>{last30} IN LAST 30 DAYS</Text>}
        </View>

        {/* Recent workouts — name · date · session volume · PR medal. */}
        <View style={styles.rowsBlock}>
          {history.isLoading ? (
            <Text style={styles.loading}>LOADING…</Text>
          ) : workouts.length === 0 ? (
            <Text style={styles.empty}>No workouts yet. Your history will fill in here.</Text>
          ) : (
            workouts.map((w) => {
              const started = new Date(w.started_at);
              const date = started.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' });
              // Guard a pre-volume_kg cached row (or a null) from rendering "NaNk".
              const vol = Number.isFinite(w.volume_kg) ? `${(w.volume_kg / 1000).toFixed(1)}k` : '—';
              const pr = prCounts.data?.[w.id] ?? 0;
              return (
                <Pressable key={w.id} style={styles.histRow} onPress={() => router.push(`/history/${w.id}`)}>
                  <View style={styles.histMain}>
                    <Text style={styles.histName} numberOfLines={1}>
                      {w.title ?? w.routine_name ?? 'Empty workout'}
                    </Text>
                    <Text style={styles.histDate}>{date}</Text>
                  </View>
                  <View style={styles.histVol}>
                    <Text style={styles.histVolNum}>{vol}</Text>
                    <Text style={styles.histVolUnit}>kg</Text>
                  </View>
                  {pr > 0 && <PrBadge count={pr} />}
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
          { borderWidth: look.border ? 1.5 : 0, borderColor: look.ring, backgroundColor: look.bg },
        ]}
      >
        <Text style={[styles.cellNum, { color: look.fg }]}>{cell.n}</Text>
      </View>
    </View>
  );
}

function cellLook(cell: HeatCell, color: Theme['color']) {
  // Today keeps its dashed accent ring so it stays findable at a glance, but it
  // must ALSO carry the worked fill once you've trained: this check used to
  // short-circuit before the `worked` branch, so a finished workout left today
  // looking identical to a day you skipped — no acknowledgement on the one
  // screen whose whole job is "did I show up today?".
  // Refined look: worked days are soft-filled circles (no ring), today is a solid
  // accent chip once trained, else an accent ring so it stays findable at a glance.
  if (cell.isToday) {
    const worked = cell.state === 'worked';
    return worked
      ? { ring: 'transparent', border: false, bg: color.acc, fg: color.accInk }
      : { ring: color.acc, border: true, bg: 'transparent', fg: color.acc };
  }
  if (cell.state === 'worked') return { ring: 'transparent', border: false, bg: color.acc14, fg: color.acc };
  return { ring: 'transparent', border: false, bg: 'transparent', fg: color.t3 };
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
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellNum: { fontFamily: font.numMedium, fontSize: 14 },

    // History divider
    histHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space.xxl },
    histHeadLabel: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.t3 },
    histHeadRule: { flex: 1, height: 1, backgroundColor: color.line },
    histHeadCount: { fontFamily: font.numMedium, fontSize: 11, letterSpacing: 0.8, color: color.t2 },

    // Recent workouts
    rowsBlock: { marginTop: 6 },
    loading: { fontFamily: font.numSemibold, fontSize: 11, color: color.t3, marginTop: space.md },
    empty: { fontFamily: font.num, fontSize: 11.5, lineHeight: 20, color: color.t2, marginTop: space.md },
    histRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 15,
      borderTopWidth: 1,
      borderTopColor: color.line,
    },
    histMain: { flex: 1, gap: 5 },
    histName: { fontFamily: font.uiMedium, fontSize: 17, color: color.t1 },
    histDate: { fontFamily: font.num, fontSize: 12, color: color.t2 },
    histVol: { flexDirection: 'row', alignItems: 'baseline' },
    histVolNum: { fontFamily: font.numMedium, fontSize: 16, color: color.t1 },
    histVolUnit: { fontFamily: font.num, fontSize: 12, color: color.t2, marginLeft: 3 },
  });
