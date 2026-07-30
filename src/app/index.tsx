// Home (mockup 01) — routines first, thumb only. One press to the workout you're
// most likely doing ("up next"), the full rotation underneath, and a week strip
// that marks the days you showed up. No microphone here — this is the manual-first
// build; the voice entry point returns in a later phase.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusPip } from '@/components/voice/primitives';
import { TabBar } from '@/components/voice/TabBar';
import { signOut } from '@/data/auth';
import { useActiveWorkout, useProfile, useRoutines, useStartWorkout, useUpdateProfile, useWorkoutList } from '@/data/hooks';
import { color, font, radius, shadow, space, tracking } from '@/theme/tokens';

const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function agoLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS);
  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return `${days} DAYS AGO`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 WEEK AGO' : `${weeks} WEEKS AGO`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const routines = useRoutines();
  const activeWorkout = useActiveWorkout();
  const startWorkout = useStartWorkout();
  const history = useWorkoutList();
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const unit = profile.data?.default_unit ?? 'kg';

  const workouts = history.data?.pages.flat() ?? [];

  // Last time each routine was trained (from finished workouts).
  const lastDone = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of workouts) {
      if (!w.routine_id) continue;
      if (!map.has(w.routine_id)) map.set(w.routine_id, w.started_at); // list is newest-first
    }
    return map;
  }, [workouts]);

  // Mon→Sun activity marks for the current week.
  const week = useMemo(() => {
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // 0 = Monday
    const monday = startOfDay(today) - dow * DAY_MS;
    const done = new Set(workouts.map((w) => startOfDay(new Date(w.started_at))));
    return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
      const dayStart = monday + i * DAY_MS;
      return { day, active: done.has(dayStart), isToday: dayStart === startOfDay(today) };
    });
  }, [workouts]);

  const list = routines.data ?? [];
  // "Up next" = the routine trained longest ago (never-trained first).
  const upNext = useMemo(() => {
    if (list.length === 0) return null;
    return [...list].sort((a, b) => {
      const da = lastDone.get(a.id);
      const db = lastDone.get(b.id);
      if (!da && !db) return a.position - b.position;
      if (!da) return -1;
      if (!db) return 1;
      return da.localeCompare(db);
    })[0];
  }, [list, lastDone]);

  const busy = !!activeWorkout.data || startWorkout.isPending;

  function start(routineId?: string) {
    if (activeWorkout.data) {
      router.push(`/workout/${activeWorkout.data.id}`);
      return;
    }
    startWorkout.mutate(routineId, {
      onSuccess: (workout) => router.push(`/workout/${workout.id}`),
    });
  }

  function openSettings() {
    const nextUnit = unit === 'kg' ? 'lb' : 'kg';
    const options = [
      'Exercise library',
      `Weight units · switch to ${nextUnit.toUpperCase()}`,
      'Sign out',
      'Cancel',
    ];
    const run = (i: number) => {
      if (i === 0) router.push('/exercises');
      else if (i === 1) updateProfile.mutate({ default_unit: nextUnit });
      else if (i === 2) signOut();
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: 2 },
        run
      );
    } else {
      Alert.alert('Settings', undefined, [
        { text: options[0], onPress: () => run(0) },
        { text: options[1], onPress: () => run(1) },
        { text: options[2], style: 'destructive', onPress: () => run(2) },
        { text: options[3], style: 'cancel' },
      ]);
    }
  }

  const dateLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl }]}>
        <View style={styles.topRow}>
          <Text style={styles.logo}>
            REPVOICE<Text style={{ color: color.acc }}>.</Text>
          </Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>

        {/* Week strip */}
        <View style={styles.week}>
          {week.map((d, i) => (
            <View key={i} style={styles.weekCol}>
              <Text style={[styles.weekDay, d.isToday && { color: color.t2 }]}>{d.day}</Text>
              <View
                style={[
                  styles.weekMark,
                  { backgroundColor: d.active ? color.acc : color.line2 },
                  d.active && shadow.glowSm,
                ]}
              />
            </View>
          ))}
        </View>

        {activeWorkout.data && (
          <Pressable style={styles.resume} onPress={() => router.push(`/workout/${activeWorkout.data!.id}`)}>
            <StatusPip label="WORKOUT IN PROGRESS" />
            <Text style={styles.resumeText}>Resume →</Text>
          </Pressable>
        )}

        {/* Up next */}
        {upNext && !activeWorkout.data && (
          <View style={{ marginTop: space.xl }}>
            <Text style={styles.section}>UP NEXT IN ROTATION</Text>
            <View style={styles.upCard}>
              <View style={styles.upHead}>
                <Text style={styles.upName} numberOfLines={1}>
                  {upNext.name}
                </Text>
                <Text style={styles.upAgo}>{agoLabel(lastDone.get(upNext.id)) ?? 'NEW'}</Text>
              </View>
              <Text style={styles.upMeta}>
                {upNext.exercise_count} EXERCISE{upNext.exercise_count === 1 ? '' : 'S'}
              </Text>
              <Pressable style={styles.startBtn} onPress={() => start(upNext.id)} disabled={busy}>
                <Text style={styles.startText}>START WORKOUT</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* All routines */}
        <View style={{ marginTop: space.xl, flex: 1 }}>
          <Text style={styles.section}>ALL ROUTINES</Text>
          {routines.isLoading ? (
            <Text style={styles.loading}>LOADING…</Text>
          ) : list.length === 0 ? (
            <Text style={styles.emptyRoutines}>
              No routines yet. Create one, or start an empty workout and add exercises as you go.
            </Text>
          ) : (
            list.map((r) => (
              <Pressable key={r.id} style={styles.rowItem} onPress={() => start(r.id)} disabled={busy}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {r.exercise_count} EX · {agoLabel(lastDone.get(r.id)) ?? 'NEVER'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push(`/routine/${r.id}`)}
                  hitSlop={10}
                  style={{ paddingHorizontal: 4 }}
                >
                  <Text style={styles.rowEdit}>EDIT</Text>
                </Pressable>
                <Text style={styles.rowStart}>START →</Text>
              </Pressable>
            ))
          )}

          <View style={styles.ctaRow}>
            <Pressable style={[styles.cta, styles.ctaDashed]} onPress={() => router.push('/routine/new')}>
              <Text style={styles.ctaAcc}>+ NEW ROUTINE</Text>
            </Pressable>
            <Pressable style={styles.cta} onPress={() => start()} disabled={busy}>
              <Text style={styles.ctaDim}>EMPTY WORKOUT</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <TabBar
        active="home"
        tabs={[
          { key: 'home', label: 'HOME' },
          { key: 'calendar', label: 'CALENDAR', onPress: () => router.push('/calendar') },
          { key: 'history', label: 'HISTORY', onPress: () => router.push('/history') },
          { key: 'settings', label: 'SETTINGS', onPress: openSettings },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xl, flexGrow: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  logo: { fontFamily: font.uiBold, fontSize: 24, color: color.t1 },
  date: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3 },

  week: { flexDirection: 'row', gap: 5, marginTop: space.xl },
  weekCol: { flex: 1, alignItems: 'center', gap: 8 },
  weekDay: { fontFamily: font.numSemibold, fontSize: 8, color: color.t3 },
  weekMark: { width: '100%', height: 3, borderRadius: 1 },

  resume: {
    marginTop: space.xl,
    borderWidth: 1,
    borderColor: color.acc,
    borderRadius: radius.card,
    backgroundColor: color.acc06,
    padding: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resumeText: { fontFamily: font.numSemibold, fontSize: 11, color: color.acc },

  section: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },

  upCard: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: color.acc35,
    borderRadius: radius.card,
    backgroundColor: color.s1,
    padding: space.xl,
  },
  upHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },
  upName: { fontFamily: font.uiBold, fontSize: 21, color: color.t1, flex: 1 },
  upAgo: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: 0.8, color: color.t3 },
  upMeta: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t2, marginTop: 9 },
  startBtn: {
    height: 52,
    borderRadius: radius.ctl + 1,
    borderWidth: 1,
    borderColor: color.acc35,
    backgroundColor: color.s2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
    ...shadow.glowSm,
  },
  startText: { fontFamily: font.uiSemibold, fontSize: 12, letterSpacing: tracking.label, color: color.acc },

  loading: { fontFamily: font.numSemibold, fontSize: 11, color: color.t3, marginTop: space.md },
  emptyRoutines: { fontFamily: font.num, fontSize: 12, lineHeight: 19, color: color.t3, marginTop: space.md },

  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  rowName: { fontFamily: font.uiSemibold, fontSize: 14, color: color.t1 },
  rowMeta: { fontFamily: font.num, fontSize: 9.5, letterSpacing: 0.6, color: color.t3, marginTop: 5 },
  rowEdit: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.t3 },
  rowStart: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t2 },

  ctaRow: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
  cta: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.ctl,
  },
  ctaDashed: { borderStyle: 'dashed' },
  ctaAcc: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.acc },
  ctaDim: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t3 },
});
