// Home — mockup 2e: "one action, spoken or pressed." The TALK ring starts
// listening for a session-control command ("start push day" / "start empty");
// routines are also one press away underneath, never hidden behind voice.
//
// Session-control commands are matched locally (word-overlap against routine
// names) rather than through the parse-utterance pipeline — that pipeline's
// ParseResult only models `log_sets`/`correct_last` (see
// supabase/functions/_shared/parse-types.ts), it has no "start a workout"
// intent yet. This keeps the mockup's home voice affordance honest about what
// the backend actually understands today.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LevelMeter, StatusPip } from '@/components/voice/primitives';
import { TabBar } from '@/components/voice/TabBar';
import { signOut } from '@/data/auth';
import { useActiveWorkout, useRoutines, useStartWorkout } from '@/data/hooks';
import type { RoutineWithCount } from '@/data/routines';
import { earcon, speak } from '@/lib/feedback';
import { useSpeechToText } from '@/lib/stt';
import { color, font, radius, shadow, space, tracking } from '@/theme/tokens';

function matchRoutine(transcript: string, routines: RoutineWithCount[]): RoutineWithCount | null {
  const words = new Set(transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/));
  let best: { r: RoutineWithCount; score: number } | null = null;
  for (const r of routines) {
    const nameWords = r.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const hits = nameWords.filter((w) => words.has(w)).length;
    if (hits > 0 && (!best || hits > best.score)) best = { r, score: hits };
  }
  return best?.r ?? null;
}

export default function HomeScreen() {
  const routines = useRoutines();
  const activeWorkout = useActiveWorkout();
  const startWorkout = useStartWorkout();
  const stt = useSpeechToText();
  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  function start(routineId?: string) {
    startWorkout.mutate(routineId, {
      onSuccess: (workout) => router.push(`/workout/${workout.id}`),
    });
  }

  useEffect(() => {
    if (stt.state !== 'processing') return;
    const transcript = stt.finalTranscript.trim();
    stt.reset();
    if (!transcript || activeWorkout.data) return;
    const list = routines.data ?? [];
    if (/\bempty\b/i.test(transcript)) {
      earcon('commit');
      start();
      return;
    }
    const routine = matchRoutine(transcript, list);
    if (routine) {
      earcon('commit');
      speak(`starting ${routine.name}`);
      start(routine.id);
    } else {
      setVoiceHint(`Didn't recognize a routine in "${transcript}" — press one below.`);
      speak("didn't catch a routine — press one below");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.state]);

  function openSettings() {
    const options = ['Exercise library', 'Voice telemetry (dev)', 'Sign out', 'Cancel'];
    const run = (i: number) => {
      if (i === 0) router.push('/exercises');
      else if (i === 1) router.push('/dev/telemetry');
      else if (i === 2) signOut();
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1 },
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

  const listening = stt.state === 'listening';
  const today = new Date();
  const dateLabel = today
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.logo}>
            REPVOICE<Text style={{ color: color.acc }}>.</Text>
          </Text>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
        </View>

        {activeWorkout.data && (
          <Pressable
            style={styles.resumeBanner}
            onPress={() => router.push(`/workout/${activeWorkout.data!.id}`)}
          >
            <StatusPip label="WORKOUT IN PROGRESS" />
            <Text style={styles.resumeText}>Tap to resume →</Text>
          </Pressable>
        )}

        <View style={styles.talkWrap}>
          <View style={styles.talkOuterRing}>
            <Pressable
              onPress={() => {
                if (activeWorkout.data) {
                  router.push(`/workout/${activeWorkout.data.id}`);
                  return;
                }
                setVoiceHint(null);
                void stt.toggle();
              }}
              style={[styles.talkRing, listening && styles.talkRingActive]}
            >
              <LevelMeter animating={listening} height={26} style={{ width: 60 }} />
              <Text style={styles.talkLabel}>{listening ? 'LISTENING' : 'TALK'}</Text>
              <View style={styles.talkUnderline} />
            </Pressable>
          </View>
          <Text style={styles.talkHint}>
            {listening
              ? stt.interimTranscript || 'listening…'
              : voiceHint ?? (
                  <>
                    "start push day" · "start empty"
                    {'\n'}
                    <Text style={{ color: color.t3 }}>tap a routine below, or say its name</Text>
                  </>
                )}
          </Text>
        </View>

        <View style={styles.pressSection}>
          <Text style={styles.pressLabel}>OR PRESS</Text>
          {routines.data == null || routines.data.length === 0 ? (
            <Pressable
              style={[styles.routineCard, { flex: undefined }]}
              onPress={() => start()}
              disabled={!!activeWorkout.data || startWorkout.isPending}
            >
              <Text style={styles.routineName}>Start empty workout</Text>
              <Text style={styles.routineMeta}>No routines yet</Text>
            </Pressable>
          ) : (
            <View style={styles.routineRow}>
              {routines.data.slice(0, 3).map((r) => (
                <Pressable
                  key={r.id}
                  style={styles.routineCard}
                  onPress={() => start(r.id)}
                  disabled={!!activeWorkout.data || startWorkout.isPending}
                >
                  <Text style={styles.routineName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.routineMeta}>
                    {r.exercise_count} EX{r.exercise_count === 1 ? '' : 'S'}
                  </Text>
                  <View style={styles.routineUnderline} />
                </Pressable>
              ))}
            </View>
          )}
          <Pressable onPress={() => router.push('/routine/new')}>
            <Text style={styles.newRoutineLink}>+ New routine</Text>
          </Pressable>
        </View>
      </ScrollView>

      <TabBar
        active="home"
        tabs={[
          { key: 'home', label: 'HOME' },
          { key: 'history', label: 'HISTORY', onPress: () => router.push('/history') },
          { key: 'settings', label: 'SETTINGS', onPress: openSettings },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.xl, paddingBottom: space.xl, flexGrow: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  logo: { fontFamily: font.uiBold, fontSize: 24, color: color.t1 },
  dateLabel: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t3 },

  resumeBanner: {
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

  talkWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl, minHeight: 320 },
  talkOuterRing: {
    width: 206,
    height: 206,
    borderRadius: 103,
    borderWidth: 1,
    borderColor: color.acc14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talkRing: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: color.sin,
    borderWidth: 1,
    borderColor: color.line2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  talkRingActive: { borderColor: color.acc, ...shadow.glowLg },
  talkLabel: { fontFamily: font.numBold, fontSize: 15, letterSpacing: tracking.label, color: color.t1 },
  talkUnderline: { width: 40, height: 2, backgroundColor: color.acc, borderRadius: radius.pill, ...shadow.glowSm },
  talkHint: {
    fontFamily: font.num,
    fontSize: 13,
    color: color.t2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },

  pressSection: { gap: space.sm },
  pressLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  routineRow: { flexDirection: 'row', gap: space.sm },
  routineCard: {
    flex: 1,
    backgroundColor: color.s1,
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.card,
    padding: space.md,
  },
  routineName: { fontFamily: font.uiBold, fontSize: 13, color: color.t1 },
  routineMeta: { fontFamily: font.num, fontSize: 9.5, color: color.t3, marginTop: 3 },
  routineUnderline: { width: 22, height: 2, backgroundColor: color.acc, borderRadius: radius.pill, marginTop: 8, ...shadow.glowSm },
  newRoutineLink: { fontFamily: font.numMedium, fontSize: 12, color: color.acc, marginTop: space.xs },
});
