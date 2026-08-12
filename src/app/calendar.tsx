// Calendar (mockup 12) — "five a week". The goal is a count, not a chain: miss a
// day and the week still stands. A week card shows this week's progress toward five,
// the month grid tallies each week on its own row, three stats read the recent past,
// and a 12-week bar chart plots weeks against the goal line. All derived from the
// finished-workout days — no separate streak table.
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeTabBar, TAB_BAR_HEIGHT } from '@/components/voice/TabBar';
import { ErrorText, Loading } from '@/components/ui';
import { useWorkoutDays } from '@/data/calendar';
import { useSettings } from '@/data/settings';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// Sessions/week the tally counts toward. A count, not a streak — see the header
// note. Driven by Settings › Weekly goal (mockup 18); 5 is the default until the
// settings query resolves.
const DEFAULT_WEEK_GOAL = 5;
const DAY_MS = 86_400_000;
const DAY_HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
/** Local-midnight of `base` shifted by `n` days — DST-safe (goes through the Date
 *  constructor rather than adding milliseconds). */
function addDays(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}
/** Monday (week start) of the week containing `d`. */
function mondayOf(d: Date): Date {
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(d, -dow);
}

type Cell = { key: string; n: string; bg: string; border: string; fg: string };
type Week = { key: string; days: Cell[]; count: string; countColor: string };

export default function CalendarScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();
  const query = useWorkoutDays();
  const settings = useSettings();
  const WEEK_GOAL = settings.data?.weeklyGoal ?? DEFAULT_WEEK_GOAL;

  // Days you showed up (one entry per calendar day, even if you logged twice).
  const doneDays = useMemo(() => {
    const s = new Set<number>();
    for (const w of query.data ?? []) s.add(startOfDay(new Date(w.started_at)));
    return s;
  }, [query.data]);

  const today = useMemo(() => new Date(), []);
  const todayStart = startOfDay(today);
  const countWeek = (monday: Date) => {
    let c = 0;
    for (let i = 0; i < 7; i++) if (doneDays.has(startOfDay(addDays(monday, i)))) c += 1;
    return c;
  };

  // Which month the grid is showing (defaults to the current one; ‹ › navigate).
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const atCurrentMonth = view.year === today.getFullYear() && view.month === today.getMonth();
  const shiftMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  // ---- This week card ----
  const weekMonday = useMemo(() => mondayOf(today), [today]);
  const thisWeek = useMemo(() => {
    const days = DAY_HEADS.map((label, i) => {
      const d = addDays(weekMonday, i);
      const t = startOfDay(d);
      return { label, worked: doneDays.has(t), isToday: t === todayStart, isFuture: t > todayStart };
    });
    const count = days.filter((d) => d.worked).length;
    const remaining = Math.max(0, WEEK_GOAL - count);
    const status = remaining === 0 ? 'GOAL HIT' : remaining === 1 ? 'ONE TO GO' : `${remaining} TO GO`;
    return { days, count, status };
  }, [weekMonday, doneDays, todayStart, WEEK_GOAL]);

  // ---- Month grid ----
  const weeks = useMemo<Week[]>(() => {
    const first = new Date(view.year, view.month, 1);
    const monthEnd = new Date(view.year, view.month + 1, 0);
    const out: Week[] = [];
    let wStart = mondayOf(first);
    while (startOfDay(wStart) <= startOfDay(monthEnd)) {
      const rowMonday = startOfDay(wStart);
      const rowSunday = startOfDay(addDays(wStart, 6));
      const days: Cell[] = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(wStart, i);
        const t = startOfDay(d);
        const inMonth = d.getMonth() === view.month;
        const worked = doneDays.has(t);
        const isToday = t === todayStart;
        let bg: string = 'transparent';
        let border: string = inMonth ? color.line : 'transparent';
        let fg: string = color.t3;
        if (isToday) {
          bg = color.acc;
          border = color.acc;
          fg = color.accInk;
        } else if (worked && inMonth) {
          bg = color.acc14;
          border = color.acc35;
          fg = color.acc;
        }
        days.push({ key: `d-${t}`, n: inMonth ? String(d.getDate()) : '', bg, border, fg });
      }
      const count = countWeek(wStart);
      const isFutureWeek = rowMonday > todayStart;
      const isCurrentWeek = todayStart >= rowMonday && todayStart <= rowSunday;
      const countColor =
        count >= WEEK_GOAL ? color.acc : isFutureWeek ? color.t3 : isCurrentWeek ? color.t1 : color.t2;
      out.push({
        key: `w-${rowMonday}`,
        days,
        count: isFutureWeek ? '—' : String(count),
        countColor,
      });
      wStart = addDays(wStart, 7);
    }
    return out;
  }, [view, doneDays, todayStart, WEEK_GOAL, color]);

  // ---- Stats + 12-week bars ----
  const { stats, bars, barsFrom, weeksAtGoal } = useMemo(() => {
    const countLastDays = (n: number) => {
      let c = 0;
      for (let i = 0; i < n; i++) if (doneDays.has(startOfDay(addDays(today, -i)))) c += 1;
      return c;
    };
    const twelve = [];
    for (let i = 11; i >= 0; i--) {
      const wStart = addDays(weekMonday, -i * 7);
      twelve.push({ count: countWeek(wStart), isNow: i === 0, start: wStart });
    }
    const atGoal = twelve.filter((w) => w.count >= WEEK_GOAL).length;
    const bars = twelve.map((w, i) => {
      const pct = Math.min(100, Math.round((w.count / WEEK_GOAL) * 80)); // goal = 80% height
      return {
        key: `b-${i}`,
        h: `${Math.max(3, pct)}%`,
        bg: w.isNow ? color.acc06 : w.count >= WEEK_GOAL ? color.acc35 : color.line2,
        top: w.isNow ? color.acc : 'transparent',
      };
    });
    return {
      stats: [
        { label: 'LAST 7 DAYS', value: String(countLastDays(7)), color: color.t1 },
        { label: 'LAST 30 DAYS', value: String(countLastDays(30)), color: color.t1 },
        { label: `WEEKS AT ${WEEK_GOAL}+`, value: String(atGoal), color: color.acc },
      ],
      bars,
      barsFrom: addDays(weekMonday, -11 * 7).toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      weeksAtGoal: atGoal,
    };
  }, [doneDays, today, weekMonday, WEEK_GOAL, color]);

  const monthLabel = new Date(view.year, view.month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();

  if (query.isLoading) return <Loading />;
  if (query.error != null) return <ErrorText error={query.error} />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl, paddingBottom: space.xxl + TAB_BAR_HEIGHT }]}>
        {/* Header + month nav */}
        <View style={styles.head}>
          <Text style={styles.title}>Calendar</Text>
          <View style={styles.nav}>
            <Text style={styles.navArrow} onPress={() => shiftMonth(-1)}>
              ‹
            </Text>
            <Text style={styles.navMonth}>{monthLabel}</Text>
            <Text
              style={[styles.navArrow, atCurrentMonth && styles.navArrowOff]}
              onPress={atCurrentMonth ? undefined : () => shiftMonth(1)}
            >
              ›
            </Text>
          </View>
        </View>

        {/* This week */}
        <View style={styles.weekCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>THIS WEEK</Text>
            <Text style={styles.weekStatus}>{thisWeek.status}</Text>
          </View>
          <View style={styles.weekBig}>
            <Text style={styles.weekCount}>{thisWeek.count}</Text>
            <Text style={styles.weekGoal}> / {WEEK_GOAL} DAYS</Text>
          </View>
          <View style={styles.weekStrip}>
            {thisWeek.days.map((d, i) => {
              const solid = d.isToday;
              const lit = d.worked && !d.isToday;
              return (
                <View key={i} style={styles.weekStripCol}>
                  <Text style={[styles.weekStripDay, (solid || lit) && { color: color.acc }]}>{d.label}</Text>
                  <View
                    style={[
                      styles.weekStripMark,
                      solid && { backgroundColor: color.acc, borderColor: color.acc },
                      !solid && lit && { backgroundColor: color.acc14, borderColor: color.acc35 },
                      !solid && !lit && d.isFuture && { borderColor: color.line2 },
                    ]}
                  >
                    {(solid || lit) && (
                      <Text style={[styles.weekStripCheck, { color: solid ? color.accInk : color.acc }]}>✓</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Month grid */}
        <View style={styles.grid}>
          <View style={styles.gridHeadRow}>
            {DAY_HEADS.map((h, i) => (
              <Text key={i} style={styles.gridHead}>
                {h}
              </Text>
            ))}
            <View style={styles.countCol} />
          </View>
          {weeks.map((w) => (
            <View key={w.key} style={styles.gridRow}>
              {w.days.map((d) => (
                <View key={d.key} style={styles.dayCellWrap}>
                  <View style={[styles.dayCell, { backgroundColor: d.bg, borderColor: d.border }]}>
                    <Text style={[styles.dayNum, { color: d.fg }]}>{d.n}</Text>
                  </View>
                </View>
              ))}
              <Text style={[styles.weekTally, { color: w.countColor }]}>{w.count}</Text>
            </View>
          ))}
        </View>

        {/* Three stats */}
        <View style={styles.statRow}>
          {stats.map((s, i) => (
            <View key={s.label} style={[styles.statCell, i > 0 && styles.statDivider]}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            </View>
          ))}
        </View>

        {/* 12-week bars */}
        <View style={styles.barsBlock}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>WEEKS AT {WEEK_GOAL} OR MORE</Text>
            <Text style={styles.barsCount}>{weeksAtGoal} / 12 WEEKS</Text>
          </View>
          <View style={styles.barsArea}>
            <View style={styles.goalLine} />
            <View style={styles.barsRow}>
              {bars.map((b) => (
                <View
                  key={b.key}
                  style={[styles.bar, { height: b.h as any, backgroundColor: b.bg, borderTopColor: b.top }]}
                />
              ))}
            </View>
          </View>
          <View style={styles.barsAxis}>
            <Text style={styles.axisLabel}>{barsFrom}</Text>
            <Text style={styles.axisLabel}>GOAL LINE = {WEEK_GOAL}</Text>
            <Text style={styles.axisLabel}>NOW</Text>
          </View>
        </View>

        <Text style={styles.note}>
          The goal is a count, not a chain — miss a day and the week still stands. Each week row carries its own
          tally, so the count is legible at a glance.
        </Text>
      </ScrollView>

      <HomeTabBar active="home" />
    </View>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xxl, paddingBottom: space.xxl },

  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontFamily: font.uiSemibold, fontSize: 22, color: color.t1 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  navArrow: { fontFamily: font.numSemibold, fontSize: 15, color: color.t3, paddingHorizontal: 2 },
  navArrowOff: { color: color.line2 },
  navMonth: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t2 },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },

  // This week card
  weekCard: {
    marginTop: space.xl,
    borderWidth: 1,
    borderColor: color.acc35,
    borderRadius: radius.card,
    backgroundColor: color.s1,
    padding: space.lg,
  },
  weekStatus: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: 0.8, color: color.acc },
  weekBig: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.sm },
  weekCount: { fontFamily: font.numBold, fontSize: 44, color: color.acc },
  weekGoal: { fontFamily: font.numSemibold, fontSize: 15, color: color.t3 },
  weekStrip: { flexDirection: 'row', gap: 5, marginTop: space.lg },
  weekStripCol: { flex: 1, alignItems: 'center', gap: 8 },
  weekStripDay: { fontFamily: font.numSemibold, fontSize: 8.5, color: color.t3 },
  weekStripMark: {
    width: '100%',
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekStripCheck: { fontFamily: font.numSemibold, fontSize: 10 },

  // Month grid
  grid: { marginTop: space.xxl },
  gridHeadRow: { flexDirection: 'row', gap: 5, paddingBottom: 9 },
  gridHead: { flex: 1, textAlign: 'center', fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.label, color: color.t3 },
  gridRow: { flexDirection: 'row', gap: 5, alignItems: 'center', marginBottom: 5 },
  dayCellWrap: { flex: 1 },
  dayCell: { height: 38, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontFamily: font.numSemibold, fontSize: 11 },
  countCol: { width: 32 },
  weekTally: { width: 32, textAlign: 'right', fontFamily: font.numBold, fontSize: 10 },

  // Stats
  statRow: { flexDirection: 'row', marginTop: space.xxl, borderTopWidth: 1, borderTopColor: color.line, borderBottomWidth: 1, borderBottomColor: color.line },
  statCell: { flex: 1, paddingVertical: 17, paddingHorizontal: space.lg },
  statDivider: { borderLeftWidth: 1, borderLeftColor: color.line },
  statLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  statValue: { fontFamily: font.numBold, fontSize: 22, marginTop: 9 },

  // Bars
  barsBlock: { marginTop: space.xxl },
  barsCount: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.label, color: color.t3 },
  barsArea: { position: 'relative', height: 52, marginTop: space.md },
  goalLine: { position: 'absolute', left: 0, right: 0, bottom: '80%', height: 1, backgroundColor: color.acc35 },
  barsRow: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  bar: { flex: 1, borderRadius: 2, borderTopWidth: 1 },
  barsAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  axisLabel: { fontFamily: font.num, fontSize: 9, letterSpacing: 0.6, color: color.t3 },

  note: { fontFamily: font.num, fontSize: 10.5, lineHeight: 18, color: color.t3, marginTop: space.xxl },
});
