// Screen 02 · RECORDING (design "Voice Logging" 1a) — the full-screen instrument.
// The recorder owns the whole screen: nothing to read, nothing to tap wrong while
// you're mid-set. A level meter + timer are the only proof it's hearing you; Stop
// lands on a preview you approve.
//
// Two paths, chosen by MOCK_VOICE (see voiceParse.ts):
//  • real  — expo-audio records a clip; Stop → transcribe edge function (gpt-transcribe)
//            → parseVoiceIntent. The meter/timer read the live recorder state.
//  • mock  — no mic; a canned transcript + a small MOCK toggle pick the example.
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MicGlyph } from '@/components/voice/MicGlyph';
import { LevelMeter } from '@/components/voice/primitives';
import { useProfile } from '@/data/hooks';
import { transcribeAudio } from '@/data/transcribe';
import {
  MOCK_TRANSCRIPTS,
  MOCK_VOICE,
  parseVoiceIntent,
  type MockIntent,
} from '@/data/voiceParse';
import { setVoiceDraft } from '@/data/voiceDraft';
import type { Unit } from '@/types/db';
import { haptics } from '@/lib/haptics';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// dBFS metering (~ -60..0) → 0..1 for the level meter.
function dbToLevel(db: number | undefined): number {
  if (db == null) return 0;
  return Math.max(0, Math.min(1, (db + 50) / 50));
}

export default function VoiceRecordScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const unit: Unit = profile.data?.default_unit ?? 'kg';

  const [mockIntent, setMockIntent] = useState<MockIntent>('log');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real recorder (only driven when !MOCK_VOICE). Hooks must run unconditionally.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 100);
  const startedRef = useRef(false);

  // Mock timer/meter (only driven when MOCK_VOICE).
  const [mockSeconds, setMockSeconds] = useState(0);
  const [mockLevel, setMockLevel] = useState(0.6);

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  // Start the real recording once on mount.
  useEffect(() => {
    if (MOCK_VOICE || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setError('Microphone permission is off. Enable it in Settings to log by voice.');
          return;
        }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        haptics.tick();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start recording.");
      }
    })();
    return () => {
      // Release the mic if we leave mid-recording (cancel / unmount).
      if (recorder.isRecording) recorder.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mock timer + meter wander.
  useEffect(() => {
    if (!MOCK_VOICE) return;
    const t = setInterval(() => setMockSeconds((s) => s + 1), 1000);
    const meter = setInterval(
      () => setMockLevel(0.4 + Math.abs(Math.sin(Date.now() / 700)) * 0.55),
      180
    );
    haptics.tick();
    return () => {
      clearInterval(t);
      clearInterval(meter);
    };
  }, []);

  useEffect(() => {
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 2600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const a = loop(ring1, 0);
    const b = loop(ring2, 800);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [ring1, ring2]);

  const seconds = MOCK_VOICE ? mockSeconds : Math.floor((recorderState.durationMillis ?? 0) / 1000);
  const level = MOCK_VOICE ? mockLevel : dbToLevel(recorderState.metering);

  function cancel() {
    haptics.tick();
    if (!MOCK_VOICE && recorder.isRecording) recorder.stop().catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function stopAndReview() {
    if (busy) return;
    setBusy(true);
    setError(null);
    haptics.success();
    try {
      let transcript: string;
      if (MOCK_VOICE) {
        transcript = MOCK_TRANSCRIPTS[mockIntent];
      } else {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new Error('No audio was recorded.');
        transcript = await transcribeAudio(uri);
        if (!transcript) {
          setError("Didn't catch that — try again.");
          setBusy(false);
          return;
        }
      }
      const result = await parseVoiceIntent({
        transcript,
        forceKind: mockIntent,
        context: { session_exercises: [], recent_exercises: [], default_unit: unit },
      });
      setVoiceDraft(result);
      router.replace('/voice/preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't process that recording.");
      setBusy(false);
    }
  }

  const ringStyle = (v: Animated.Value) => ({
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }],
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <View style={styles.head}>
        <View style={styles.recRow}>
          <BlinkDot color={color.warn} />
          <Text style={styles.recLabel}>RECORDING</Text>
        </View>
        <Pressable onPress={cancel} hitSlop={12}>
          <Text style={styles.cancel}>CANCEL</Text>
        </Pressable>
      </View>

      {MOCK_VOICE && (
        <View style={styles.mockRow}>
          <Text style={styles.mockLabel}>MOCK · WHAT DID YOU SAY?</Text>
          <View style={styles.mockChips}>
            {(['log', 'routine'] as MockIntent[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => setMockIntent(k)}
                style={[styles.mockChip, mockIntent === k && styles.mockChipOn]}
              >
                <Text style={[styles.mockChipText, mockIntent === k && styles.mockChipTextOn]}>
                  {k === 'log' ? 'WORKOUT' : 'ROUTINE'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={styles.center}>
        <View style={styles.ringWrap}>
          <Animated.View style={[styles.ring, ringStyle(ring1)]} />
          <Animated.View style={[styles.ring, ringStyle(ring2)]} />
          <View style={styles.micDisc}>
            <MicGlyph size={50} color={color.acc} strokeWidth={1.6} />
          </View>
        </View>

        <LevelMeter level={level} height={72} style={{ gap: 4 }} />

        <View style={styles.readout}>
          <Text style={styles.timer}>{mmss(seconds)}</Text>
          <Text style={styles.subtle}>
            {error ?? 'KEEP TALKING · NOTHING IS SAVED YET'}
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.xl }]}>
        <Pressable onPress={stopAndReview} style={styles.stopBtn} disabled={busy}>
          <View style={styles.stopSquare} />
          <Text style={styles.stopText}>{busy ? 'Reviewing…' : 'Stop & review'}</Text>
        </Pressable>
        <Text style={styles.hint}>
          Say the exercise, then weight, reps and sets. Pause between exercises.
        </Text>
      </View>
    </View>
  );
}

function BlinkDot({ color }: { color: string }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: v }} />;
}

const makeStyles = (color: Theme['color']) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.xxl },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    recRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    recLabel: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.warn },
    cancel: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.t3 },

    mockRow: { marginTop: space.xl, alignItems: 'center', gap: 10 },
    mockLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
    mockChips: { flexDirection: 'row', gap: 8 },
    mockChip: {
      paddingVertical: 7,
      paddingHorizontal: 16,
      borderRadius: radius.chip,
      borderWidth: 1,
      borderColor: color.line2,
    },
    mockChipOn: { borderColor: color.acc, backgroundColor: color.acc14 },
    mockChipText: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t2 },
    mockChipTextOn: { color: color.acc },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 44 },
    ringWrap: { width: 184, height: 184, alignItems: 'center', justifyContent: 'center' },
    ring: {
      position: 'absolute',
      width: 184,
      height: 184,
      borderRadius: 92,
      borderWidth: 1,
      borderColor: color.acc35,
    },
    micDisc: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: color.acc14,
      borderWidth: 1,
      borderColor: color.acc,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: color.acc,
      shadowOpacity: 0.25,
      shadowRadius: 40,
      shadowOffset: { width: 0, height: 0 },
    },
    readout: { alignItems: 'center', gap: 14 },
    timer: { fontFamily: font.numMedium, fontSize: 46, letterSpacing: -1, color: color.t1 },
    subtle: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.wide, color: color.t3, textAlign: 'center', paddingHorizontal: space.lg },

    footer: { gap: 14 },
    stopBtn: {
      height: 64,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: color.warn,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    stopSquare: { width: 15, height: 15, borderRadius: 3, backgroundColor: color.warn },
    stopText: { fontFamily: font.uiSemibold, fontSize: 15, letterSpacing: 0.2, color: color.warn },
    hint: { textAlign: 'center', fontFamily: font.ui, fontSize: 11.5, lineHeight: 18, color: color.t3 },
  });
