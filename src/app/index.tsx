// Home (mockups 01 / 14 / 16) — routines first, thumb only. One press to the
// workout you're most likely doing ("up next"), the full rotation underneath, and a
// week strip that marks the days you showed up. Two edge states share this screen:
// day zero (mockup 14 — nothing logged, two doors into the first workout) and a
// workout left running (mockup 16 — resume / finish / discard, with the routine list
// held inert). No microphone here — the voice entry point returns in a later phase.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusPip } from '@/components/voice/primitives';
import { TabBar } from '@/components/voice/TabBar';
import { ElapsedClock, useNowTick } from '@/components/workout/LiveClock';
import {
  buildStartPlan,
  useActiveWorkout,
  useDiscardWorkout,
  useFinishWorkout,
  usePrefetchRoutineDetails,
  useRoutines,
  useStartWorkout,
  useWorkout,
  useWorkoutList,
} from '@/data/hooks';
import { useIsOnline } from '@/lib/network';
import { color, font, radius, shadow, space, tracking } from '@/theme/tokens';

const DAY_MS = 86_400_000;

// Push-first day-zero suggestions. Illustrative only — every card opens the routine
// builder so day one still ends with the user's own list, not a canned one.
const STARTER_TEMPLATES = [
  { name: 'Push · Pull · Legs', meta: '3 DAYS' },
  { name: 'Upper / Lower', meta: '4 DAYS' },
  { name: 'Full body', meta: '3 DAYS' },
];

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

function minutesAgo(iso: string | undefined, now: number): string | null {
  if (!iso) return null;
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins <= 0) return 'JUST NOW';
  if (mins < 60) return `${mins} MIN AGO`;
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? '1 HR AGO' : `${hrs} HR AGO`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const routines = useRoutines();
  const activeWorkout = useActiveWorkout();
  const startWorkout = useStartWorkout();
  const history = useWorkoutList();
  const online = useIsOnline();

  const activeId = activeWorkout.data?.id;
  const activeDetail = useWorkout(activeId);
  const finish = useFinishWorkout(activeId ?? '');
  const discard = useDiscardWorkout(activeId ?? '');

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
  // Warm every routine's exercise list so START can build the workout locally
  // and navigate on the same tap (see start() below).
  const routineIds = useMemo(() => list.map((r) => r.id), [list]);
  usePrefetchRoutineDetails(routineIds);
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

  const hasActive = !!activeId;
  const busy = hasActive || startWorkout.isPending;
  // Day zero: no routines, no history, nothing running — and both queries have loaded.
  const firstRun =
    !hasActive &&
    !routines.isLoading &&
    !history.isLoading &&
    list.length === 0 &&
    workouts.length === 0;

  function start(routineId?: string) {
    if (activeId) {
      router.push(`/workout/${activeId}`);
      return;
    }
    // Fast path: build the whole workout from the cached routine detail and
    // navigate NOW — the insert runs in the background under the same ids.
    const plan = buildStartPlan(qc, routineId);
    if (plan) {
      startWorkout.mutate(
        { routineId, plan },
        {
          onError: (e) => {
            Alert.alert("Couldn't start workout", e.message);
            router.dismissTo('/');
          },
        }
      );
      router.push(`/workout/${plan.detail.id}`);
      return;
    }
    // Routine detail not cached yet (first cold run) — the fallback needs the
    // server. Offline, the mutation would just pause (no navigation, button stuck
    // in isPending — a silent dead-end), so say so honestly instead. Only a
    // routine that was *never opened online* hits this; an empty start and every
    // prefetched routine take the plan path above.
    if (!online) {
      Alert.alert(
        'Routine not available offline',
        'This routine has never been loaded on this device. Reconnect once and it will work offline from then on.'
      );
      return;
    }
    startWorkout.mutate(
      { routineId },
      {
        onSuccess: (workout) => router.push(`/workout/${workout.id}`),
        onError: (e) => Alert.alert("Couldn't start workout", e.message),
      }
    );
  }

  function finishNow() {
    if (!activeId) return;
    // Optimistic finish (see useFinishWorkout) — the summary renders from the
    // already-patched cache, so navigate immediately.
    finish.mutate({
      onError: (e) => {
        Alert.alert("Couldn't finish workout", e.message);
        router.dismissTo('/');
      },
    });
    router.push(`/finish/${activeId}`);
  }

  function confirmDiscard() {
    if (!activeId) return;
    Alert.alert('Discard workout?', 'Every set logged this session is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () =>
          discard.mutate({
            onError: (e) => Alert.alert("Couldn't discard workout", e.message),
          }),
      },
    ]);
  }

  // Resume-card stats (mockup 16). Set count + last-set recency from the live detail.
  const resume = useMemo(() => {
    const d = activeDetail.data;
    if (!d) return null;
    let sets = 0;
    let lastSetAt: string | undefined;
    for (const we of d.exercises) {
      for (const s of we.sets) {
        sets += 1;
        if (!lastSetAt || s.created_at > lastSetAt) lastSetAt = s.created_at;
      }
    }
    return {
      name: d.routine_name ?? 'Empty workout',
      startedAt: d.started_at,
      sets,
      lastSetAt,
    };
  }, [activeDetail.data]);

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

        {hasActive ? (
          /* ---- Mockup 16: workout left running ---- */
          <>
            <View style={styles.resumeCard}>
              <StatusPip label="STILL RUNNING" on />
              <View style={styles.resumeHead}>
                <Text style={styles.resumeName} numberOfLines={1}>
                  {resume?.name ?? 'Workout'}
                </Text>
                {resume ? (
                  <ElapsedClock startedAt={resume.startedAt} format="hmmss" style={styles.resumeClock} />
                ) : (
                  <Text style={styles.resumeClock}>—</Text>
                )}
              </View>
              {resume ? (
                <ResumeMeta startedAt={resume.startedAt} sets={resume.sets} lastSetAt={resume.lastSetAt} />
              ) : (
                <Text style={styles.resumeMeta}>LOADING…</Text>
              )}
              <View style={styles.resumeBtns}>
                <Pressable style={styles.resumeMain} onPress={() => router.push(`/workout/${activeId}`)}>
                  <Text style={styles.resumeMainText}>RESUME</Text>
                </Pressable>
                <Pressable style={styles.resumeSecondary} onPress={finishNow}>
                  <Text style={styles.resumeSecondaryText}>
                    {finish.isPending ? 'FINISHING…' : 'FINISH NOW'}
                  </Text>
                </Pressable>
              </View>
              <Pressable onPress={confirmDiscard} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text style={styles.discard}>DISCARD WORKOUT</Text>
              </Pressable>
            </View>

            <View style={styles.note}>
              <View style={styles.noteBar} />
              <Text style={styles.noteText}>
                Nothing was lost — sets save the moment you tap ✓. Only a half-typed set that was
                never checked off is gone.
              </Text>
            </View>

            {list.length > 0 && (
              <View style={styles.lockedWrap}>
                <Text style={styles.section}>ALL ROUTINES</Text>
                {list.map((r) => (
                  <View key={r.id} style={styles.lockedRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {r.exercise_count} EX · {agoLabel(lastDone.get(r.id)) ?? 'NEVER'}
                      </Text>
                    </View>
                    <Text style={styles.locked}>LOCKED</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : firstRun ? (
          /* ---- Mockup 14: day zero ---- */
          <View style={styles.firstRun}>
            <Text style={styles.frTitle}>
              Nothing logged yet.{'\n'}
              <Text style={{ color: color.t3 }}>Start with a routine.</Text>
            </Text>
            <Text style={styles.frBody}>
              A routine is just an ordered list of exercises — say, five for a push day. Two minutes
              now, one tap every session after.
            </Text>
            <Pressable style={styles.frPrimary} onPress={() => router.push('/routine/new')}>
              <Text style={styles.frPrimaryText}>BUILD MY FIRST ROUTINE</Text>
            </Pressable>
            <Pressable style={styles.frSecondary} onPress={() => start()} disabled={busy}>
              <Text style={styles.frSecondaryText}>OR JUST START LIFTING</Text>
            </Pressable>
            <Text style={styles.frHint}>An empty workout can be saved as a routine when you finish.</Text>

            <View style={styles.frTemplates}>
              <View style={styles.frTemplatesHead}>
                <Text style={styles.section}>STARTER TEMPLATES</Text>
                <Pressable onPress={() => router.push('/routine/new')} hitSlop={8}>
                  <Text style={styles.frBrowse}>BROWSE</Text>
                </Pressable>
              </View>
              <View style={styles.frCards}>
                {STARTER_TEMPLATES.map((t) => (
                  <Pressable key={t.name} style={styles.frCard} onPress={() => router.push('/routine/new')}>
                    <Text style={styles.frCardName}>{t.name}</Text>
                    <Text style={styles.frCardMeta}>{t.meta}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        ) : (
          /* ---- Mockup 01: the standing home ---- */
          <>
            {upNext && (
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

            <View style={{ marginTop: space.xl, flex: 1 }}>
              <Text style={styles.section}>ALL ROUTINES</Text>
              {routines.isLoading ? (
                <Text style={styles.loading}>LOADING…</Text>
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
          </>
        )}
      </ScrollView>

      <TabBar
        active="home"
        tabs={[
          { key: 'home', label: 'HOME' },
          { key: 'calendar', label: 'CALENDAR', onPress: () => router.push('/calendar') },
          { key: 'history', label: 'HISTORY', onPress: () => router.push('/history') },
          { key: 'settings', label: 'SETTINGS', onPress: () => router.push('/settings') },
        ]}
      />
    </View>
  );
}

// Resume-card meta line. A leaf so its "LAST SET … AGO" recency can tick without
// re-rendering the whole Home screen (the clock and this are the only live bits).
function ResumeMeta({
  startedAt,
  sets,
  lastSetAt,
}: {
  startedAt: string;
  sets: number;
  lastSetAt: string | undefined;
}) {
  const now = useNowTick(1000);
  const ago = minutesAgo(lastSetAt, now);
  const text = [
    `STARTED ${new Date(startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    `${sets} SET${sets === 1 ? '' : 'S'} LOGGED`,
    ago && `LAST SET ${ago}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return <Text style={styles.resumeMeta}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xxl, paddingBottom: space.xl, flexGrow: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  logo: { fontFamily: font.uiSemibold, fontSize: 24, color: color.t1 },
  date: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3 },

  week: { flexDirection: 'row', gap: 5, marginTop: space.xl },
  weekCol: { flex: 1, alignItems: 'center', gap: 8 },
  weekDay: { fontFamily: font.numSemibold, fontSize: 8, color: color.t3 },
  weekMark: { width: '100%', height: 3, borderRadius: 1 },

  section: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },

  // Resume (mockup 16)
  resumeCard: {
    marginTop: space.xl,
    borderWidth: 1,
    borderColor: color.acc35,
    borderRadius: radius.card,
    backgroundColor: color.s1,
    padding: space.xl,
  },
  resumeHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.md,
    marginTop: space.md,
  },
  resumeName: { fontFamily: font.uiSemibold, fontSize: 21, color: color.t1, flex: 1 },
  resumeClock: { fontFamily: font.numBold, fontSize: 17, color: color.t2 },
  resumeMeta: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: 0.7, color: color.t3, marginTop: 8 },
  resumeBtns: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  resumeMain: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.acc35,
    borderRadius: radius.ctl,
    ...shadow.glowSm,
  },
  resumeMainText: { fontFamily: font.uiMedium, fontSize: 11, letterSpacing: tracking.label, color: color.acc },
  resumeSecondary: {
    width: 118,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.ctl,
  },
  resumeSecondaryText: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: 0.8, color: color.t2 },
  discard: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3, marginTop: space.lg },

  note: { flexDirection: 'row', gap: space.md, marginTop: space.xl, padding: 14, borderWidth: 1, borderColor: color.line2, borderRadius: radius.ctl + 1, borderStyle: 'dashed' },
  noteBar: { width: 2, backgroundColor: color.line2, borderRadius: 1 },
  noteText: { flex: 1, fontFamily: font.num, fontSize: 10.5, lineHeight: 18, color: color.t2 },

  lockedWrap: { marginTop: space.xl, opacity: 0.4 },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  locked: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3 },

  // First run (mockup 14)
  firstRun: { marginTop: space.xl, flex: 1 },
  frTitle: { fontFamily: font.uiSemibold, fontSize: 25, lineHeight: 34, color: color.t1 },
  frBody: { fontFamily: font.num, fontSize: 11.5, lineHeight: 20, color: color.t2, marginTop: space.lg, maxWidth: 300 },
  frPrimary: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.acc35,
    borderRadius: radius.ctl + 1,
    marginTop: space.xl + 4,
    ...shadow.glowSm,
  },
  frPrimaryText: { fontFamily: font.uiMedium, fontSize: 11.5, letterSpacing: tracking.label, color: color.acc },
  frSecondary: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.ctl + 1,
    marginTop: space.sm + 2,
  },
  frSecondaryText: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t2 },
  frHint: { fontFamily: font.num, fontSize: 10.5, lineHeight: 18, color: color.t3, marginTop: 14, textAlign: 'center' },

  frTemplates: { marginTop: space.xxl + 4, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.lg },
  frTemplatesHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  frBrowse: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: 0.6, color: color.acc },
  frCards: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  frCard: { flex: 1, borderWidth: 1, borderColor: color.line2, borderStyle: 'dashed', borderRadius: radius.ctl + 2, padding: 13 },
  frCardName: { fontFamily: font.uiMedium, fontSize: 12.5, color: color.t2 },
  frCardMeta: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.8, color: color.t3, marginTop: 5 },

  // Up next (mockup 01)
  upCard: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: color.acc35,
    borderRadius: radius.card,
    backgroundColor: color.s1,
    padding: space.xl,
  },
  upHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md },
  upName: { fontFamily: font.uiSemibold, fontSize: 21, color: color.t1, flex: 1 },
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
  startText: { fontFamily: font.uiMedium, fontSize: 12, letterSpacing: tracking.label, color: color.acc },

  loading: { fontFamily: font.numSemibold, fontSize: 11, color: color.t3, marginTop: space.md },

  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  rowName: { fontFamily: font.uiMedium, fontSize: 14, color: color.t1 },
  rowMeta: { fontFamily: font.num, fontSize: 9.5, letterSpacing: 0.6, color: color.t3, marginTop: 7 },
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
