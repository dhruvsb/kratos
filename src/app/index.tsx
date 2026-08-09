// Home — "Rolling Weeks" (RepVoice Home Rolling Weeks.dc.html). Streak-first: a big
// day-streak numeral, a rolling five-week heatmap of the days you showed up, and the
// recent history inline. Routine-picking lives in a quick-start sheet behind a FAB
// (Phase 2) and on the ROUTINES tab. A compact streak bar pins to the top and fades in
// as you scroll the hero away (Phase 3).
//
// The running-workout resume state and the day-zero first-run state are deferred — see
// docs/FEEDBACK-LOG.md #33/#34 (a live workout is still resumable via the shared start flow).
import { router } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeQuickStart } from '@/components/home/HomeQuickStart';
import { HomeTabBar } from '@/components/voice/TabBar';
import { useWorkoutDays } from '@/data/calendar';
import { useWorkoutList } from '@/data/hooks';
import { startOfDay } from '@/lib/dates';
import { computeStreak, type CellState, type HeatCell } from '@/lib/streak';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const DAY_MS = 86_400_000;
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Scroll window over which the pinned bar fades in — as the hero streak numeral leaves
// the top. Mirrors the mockup's 92→150 handoff (the numeral has cleared the edge by then,
// so the two are never both at full strength).
const PIN_START = 96;
const PIN_END = 154;

// Micro-bar look per heat state, for the pinned sparkline (mockup: worked 12 / rest 5 /
// skipped 2, coloured accent / faint / hairline).
function microBar(state: CellState, color: Theme['color']) {
  switch (state) {
    case 'worked':
      return { h: 12, bg: color.acc };
    case 'rest':
      return { h: 5, bg: color.acc14 };
    default:
      return { h: 2, bg: color.line2 };
  }
}

export default function HomeScreen() {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
  const insets = useSafeAreaInsets();
  const days = useWorkoutDays(); // all finished-workout days — accurate streak + heatmap
  const history = useWorkoutList(); // paginated rows for the inline history list

  // Days you showed up (one entry per calendar day).
  const doneDays = useMemo(() => {
    const s = new Set<number>();
    for (const w of days.data ?? []) s.add(startOfDay(new Date(w.started_at)));
    return s;
  }, [days.data]);

  const { streak, best, cells, micro } = useMemo(() => computeStreak(doneDays), [doneDays]);

  const inThirty = useMemo(() => {
    const cutoff = startOfDay(new Date()) - 29 * DAY_MS;
    let c = 0;
    for (const d of doneDays) if (d >= cutoff) c++;
    return c;
  }, [doneDays]);

  const workouts = history.data?.pages.flat() ?? [];

  // 5 rows of 7 for the heatmap.
  const rows = useMemo(() => {
    const out: HeatCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();

  // Scroll-driven pinned bar. One native-driven value feeds the fade/slide of the bar
  // (content) and its background — the bg reaches full opacity in the first quarter of
  // the window so it masks the scrolling content instead of letting it read through.
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
  });
  const barOpacity = scrollY.interpolate({ inputRange: [PIN_START, PIN_END], outputRange: [0, 1], extrapolate: 'clamp' });
  const barShift = scrollY.interpolate({ inputRange: [PIN_START, PIN_END], outputRange: [-10, 0], extrapolate: 'clamp' });

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Header */}
        <View style={styles.topRow}>
          <Text style={styles.logo}>
            REPVOICE<Text style={{ color: color.acc }}>.</Text>
          </Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>

        {/* Streak hero */}
        <View style={styles.hero}>
          <Text style={styles.heroNum}>{streak}</Text>
          <View style={styles.heroLabels}>
            <Text style={styles.heroTitle}>DAY STREAK</Text>
            <Text style={styles.heroSub}>BEST {best} · REST DAYS COUNT</Text>
          </View>
        </View>

        {/* Rolling five-week heatmap */}
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
                <HeatSquare key={ci} cell={cell} color={color} shadow={shadow} styles={styles} />
              ))}
            </View>
          ))}
        </View>

        {/* History */}
        <View style={styles.histHead}>
          <Text style={styles.section}>HISTORY</Text>
          <Text style={styles.histCount}>{inThirty} IN 30 DAYS</Text>
        </View>
        {history.isLoading ? (
          <Text style={styles.loading}>LOADING…</Text>
        ) : workouts.length === 0 ? (
          <Text style={styles.empty}>No workouts yet. Your history will fill in here.</Text>
        ) : (
          workouts.map((w) => {
            const started = new Date(w.started_at);
            const mins =
              w.ended_at != null
                ? Math.max(1, Math.round((new Date(w.ended_at).getTime() - started.getTime()) / 60000))
                : null;
            const meta = [
              `${w.exercise_count} EXERCISE${w.exercise_count === 1 ? '' : 'S'}`,
              `${w.set_count} SET${w.set_count === 1 ? '' : 'S'}`,
              mins != null ? `${mins} MIN` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable key={w.id} style={styles.histRow} onPress={() => router.push(`/history/${w.id}`)}>
                <View style={styles.histDate}>
                  <Text style={styles.histDd}>{String(started.getDate()).padStart(2, '0')}</Text>
                  <Text style={styles.histMo}>{MONTHS[started.getMonth()]}</Text>
                </View>
                <View style={styles.histDivider} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.histName} numberOfLines={1}>
                    {w.routine_name ?? 'Empty workout'}
                  </Text>
                  <Text style={styles.histMeta}>{meta}</Text>
                </View>
              </Pressable>
            );
          })
        )}
      </Animated.ScrollView>

      {/* Scroll-pinned compact streak bar — fades in as the hero scrolls away. The
          whole bar (opaque background + content) fades as one layer so it always masks
          the list scrolling underneath. Purely informational, so it never intercepts
          touches. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pinBar,
          { paddingTop: insets.top, height: insets.top + 62, opacity: barOpacity, transform: [{ translateY: barShift }] },
        ]}
      >
        <View style={styles.pinRow}>
          <View style={styles.pinStreakWrap}>
            <Text style={styles.pinStreak}>{streak}</Text>
            <Text style={styles.pinStreakLabel}>DAY STREAK</Text>
          </View>
          <Text style={styles.pinBest}>BEST {best}</Text>
        </View>
        <View style={styles.pinSpark}>
          {micro.map((state, i) => {
            const b = microBar(state, color);
            return <View key={i} style={{ flex: 1, height: b.h, borderRadius: 2, backgroundColor: b.bg }} />;
          })}
        </View>
      </Animated.View>

      <HomeTabBar active="home" />

      {/* FAB + "MOST USED" quick-start sheet — overlays everything, incl. the tab bar. */}
      <HomeQuickStart />
    </View>
  );
}

// One heatmap square. Its fill/border/text depend on the day's rest-tolerant state;
// today keeps its state colour and gains an accent ring.
function HeatSquare({
  cell,
  color,
  shadow,
  styles,
}: {
  cell: HeatCell;
  color: Theme['color'];
  shadow: Theme['shadow'];
  styles: ReturnType<typeof makeStyles>;
}) {
  const look = cellLook(cell.state, color);
  return (
    <View style={styles.cellWrap}>
      <View
        style={[
          styles.cell,
          {
            backgroundColor: look.bg,
            borderColor: cell.isToday ? color.acc : look.border,
            borderStyle: look.dashed ? 'dashed' : 'solid',
            borderWidth: cell.isToday ? 1.5 : 1,
          },
          cell.isToday && cell.state === 'worked' && shadow.glowSm,
        ]}
      >
        <Text style={[styles.cellNum, { color: look.fg }]}>{cell.n}</Text>
      </View>
    </View>
  );
}

function cellLook(state: CellState | 'future', color: Theme['color']) {
  switch (state) {
    case 'worked':
      return { bg: color.acc, border: color.acc, fg: color.accInk, dashed: false };
    case 'rest':
      return { bg: color.acc06, border: color.acc14, fg: color.t2, dashed: false };
    case 'skipped':
      return { bg: 'transparent', border: color.line2, fg: color.t3, dashed: true };
    case 'future':
    default:
      return { bg: 'transparent', border: color.line, fg: color.t3, dashed: false };
  }
}

const makeStyles = (color: Theme['color'], shadow: Theme['shadow']) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg },
    content: { paddingHorizontal: space.xxl, paddingBottom: space.xl },

    // Pinned streak bar (Phase 3) — opaque background lives on the bar itself so it
    // always masks the list scrolling under it.
    pinBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 3,
      paddingHorizontal: space.xxl,
      justifyContent: 'center',
      gap: 9,
      backgroundColor: color.s0,
      borderBottomWidth: 1,
      borderBottomColor: color.line,
      ...shadow.key,
    },
    pinRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    pinStreakWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    pinStreak: { fontFamily: font.numSemibold, fontSize: 24, letterSpacing: -0.7, color: color.acc },
    pinStreakLabel: { fontFamily: font.numBold, fontSize: 8, letterSpacing: 1.6, color: color.t3 },
    pinBest: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 1.2, color: color.t3 },
    pinSpark: { flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 12 },

    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    logo: { fontFamily: font.uiSemibold, fontSize: 22, color: color.t1, letterSpacing: 0.4 },
    date: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3 },

    // Streak hero
    hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 11, marginTop: space.xl + 2 },
    heroNum: { fontFamily: font.numSemibold, fontSize: 62, lineHeight: 52, letterSpacing: -2.4, color: color.acc },
    heroLabels: { paddingBottom: 7 },
    heroTitle: { fontFamily: font.numBold, fontSize: 10, letterSpacing: 2, color: color.t1 },
    heroSub: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: 1.2, color: color.t3, marginTop: 5 },

    // Heatmap
    dowRow: { flexDirection: 'row', gap: 6, marginTop: space.xl + 2 },
    dow: { flex: 1, textAlign: 'center', fontFamily: font.numSemibold, fontSize: 8, letterSpacing: 1, color: color.t3 },
    grid: { marginTop: 8, gap: 6 },
    gridRow: { flexDirection: 'row', gap: 6 },
    cellWrap: { flex: 1 },
    cell: { aspectRatio: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    cellNum: { fontFamily: font.numSemibold, fontSize: 11 },

    // History
    section: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
    histHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginTop: space.xxl + 6,
      marginBottom: 2,
    },
    histCount: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 1.2, color: color.t3 },
    loading: { fontFamily: font.numSemibold, fontSize: 11, color: color.t3, marginTop: space.md },
    empty: { fontFamily: font.num, fontSize: 11.5, lineHeight: 20, color: color.t2, marginTop: space.md },
    histRow: {
      flexDirection: 'row',
      gap: 14,
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: color.line,
    },
    histDate: { width: 34, alignItems: 'center' },
    histDd: { fontFamily: font.numSemibold, fontSize: 14, color: color.t1 },
    histMo: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: 1, color: color.t3, marginTop: 3 },
    histDivider: { width: 1, alignSelf: 'stretch', backgroundColor: color.line },
    histName: { fontFamily: font.uiMedium, fontSize: 14, color: color.t1 },
    histMeta: { fontFamily: font.num, fontSize: 9.5, letterSpacing: 0.6, color: color.t3, marginTop: 5 },
  });
