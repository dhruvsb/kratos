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
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MicGlyph } from '@/components/voice/MicGlyph';
import { LevelMeter } from '@/components/voice/primitives';
import { useProfile } from '@/data/hooks';
import { useSettings, useUpdateSettings } from '@/data/settings';
import { VoiceConsentGate } from '@/components/voice/VoiceConsentGate';
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
import { userMessage } from '@/lib/errors';
import { ensureMicPermission } from '@/lib/permissions';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// MUST be module-level: `useAudioRecorder` re-creates the recorder whenever the
// options identity changes, and `useAudioRecorderState` re-renders this screen
// every 100ms — an inline object would build a new recorder on every one of those
// renders, saturating the JS thread (frozen timer/meter, dead buttons).
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

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

  // AI data-sharing consent (Guideline 5.1.2). No audio is captured until the user
  // has agreed to send it to OpenAI; the choice is persisted + revocable in Settings.
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const consented = settings.data?.voiceAiConsent ?? false;

  const [mockIntent, setMockIntent] = useState<MockIntent>('log');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mic access refused (or refused on an earlier run): the screen stops pretending
  // to record and turns into a one-tap route to iOS Settings.
  const [micBlocked, setMicBlocked] = useState(false);

  // Real recorder (only driven when !MOCK_VOICE). Hooks must run unconditionally.
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const startedRef = useRef(false);
  const recordingRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer + level, driven by the mock effect OR the real recorder's own interval.
  // We deliberately do NOT use expo-audio's `useAudioRecorderState`: it re-subscribes
  // to the recorder on every render and, on the simulator, never advanced
  // durationMillis — that combination jammed the JS thread (frozen 00:00 timer and
  // unresponsive buttons, while the native-driver ring/dot animations kept going and
  // masked it). A self-managed wall-clock timer is reliable and cheap.
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  // Stop the mic + the timer once, idempotently.
  const stopRecording = useCallback(async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (recordingRef.current) {
      recordingRef.current = false;
      await recorder.stop().catch(() => {});
    }
  }, [recorder]);

  // Start the real recording once consent is granted, and self-drive the timer +
  // meter. Gated on `consented` so the mic is never opened before the user agrees
  // to the OpenAI upload (5.1.2); fires the moment consent flips true.
  useEffect(() => {
    if (MOCK_VOICE || startedRef.current || !consented) return;
    startedRef.current = true;
    (async () => {
      try {
        // Shows the native iOS microphone alert on a first run. `explain: false`
        // suppresses the "access is off" alert — this screen already says so
        // inline and carries its own Open Settings button, and stacking a modal
        // on top of that reads as nagging.
        const allowed = await ensureMicPermission(false);
        if (!allowed) {
          setMicBlocked(true);
          setError('Turn on the microphone to log sets by voice.');
          return;
        }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        recordingRef.current = true;
        haptics.tick();
        const startedAt = Date.now();
        tickRef.current = setInterval(() => {
          setSeconds(Math.floor((Date.now() - startedAt) / 1000));
          try {
            const status = recorder.getStatus();
            if (typeof status?.metering === 'number') setLevel(dbToLevel(status.metering));
          } catch {
            // getStatus can throw in the gap around prepare/stop — keep the timer.
          }
        }, 300);
      } catch (e) {
        setError(userMessage(e, 'Couldn’t start recording. Close this and try again.'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consented]);

  // Stop the mic if the screen unmounts mid-recording (kept separate from the
  // consent-gated start effect so it always runs on teardown).
  useEffect(() => () => void stopRecording(), [stopRecording]);

  // Mock timer + meter wander.
  useEffect(() => {
    if (!MOCK_VOICE) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    const meter = setInterval(
      () => setLevel(0.4 + Math.abs(Math.sin(Date.now() / 700)) * 0.55),
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

  function cancel() {
    haptics.tick();
    if (!MOCK_VOICE) void stopRecording();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  // Persist the AI-sharing consent; the start effect above then opens the mic.
  function grantConsent() {
    updateSettings.mutate({ voiceAiConsent: true });
  }

  async function stopAndReview() {
    if (busy) return;
    setBusy(true);
    setError(null);
    haptics.success();
    // One id per utterance: links the transcribe + parse traces into a single
    // Langfuse session so the whole voice interaction is one row in monitoring.
    const sessionId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try {
      let transcript: string;
      if (MOCK_VOICE) {
        transcript = MOCK_TRANSCRIPTS[mockIntent];
      } else {
        await stopRecording();
        const uri = recorder.uri;
        if (!uri) {
          setError('Nothing was recorded. Try again and speak after the timer starts.');
          setBusy(false);
          return;
        }
        transcript = await transcribeAudio(uri, 'audio/m4a', {
          durationMs: seconds * 1000,
          sessionId,
        });
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
        sessionId,
      });
      setVoiceDraft(result);
      router.replace('/voice/preview');
    } catch (e) {
      setError(userMessage(e, 'Couldn’t process that recording. Try saying it again.'));
      setBusy(false);
    }
  }

  const ringStyle = (v: Animated.Value) => ({
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.85] }) }],
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
  });

  // Consent gate (5.1.2): on the real path, don't open the mic until the user has
  // agreed to send audio to OpenAI. Wait for the persisted flag to load first so a
  // returning (already-consented) user never sees the gate flash.
  if (!MOCK_VOICE) {
    if (settings.isPending) {
      return <View style={[styles.screen, { paddingTop: insets.top + 24 }]} />;
    }
    if (!consented) {
      return <VoiceConsentGate onAllow={grantConsent} onDeny={cancel} />;
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <View style={styles.head}>
        <View style={styles.recRow}>
          {!micBlocked && <BlinkDot color={color.warn} />}
          <Text style={[styles.recLabel, micBlocked && { color: color.t3 }]}>
            {micBlocked ? 'MICROPHONE OFF' : 'RECORDING'}
          </Text>
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
          {!micBlocked && (
            <>
              <Animated.View style={[styles.ring, ringStyle(ring1)]} />
              <Animated.View style={[styles.ring, ringStyle(ring2)]} />
            </>
          )}
          <View style={[styles.micDisc, micBlocked && styles.micDiscOff]}>
            <MicGlyph size={50} color={micBlocked ? color.t3 : color.acc} strokeWidth={1.6} />
          </View>
        </View>

        <LevelMeter level={micBlocked ? 0 : level} height={72} style={{ gap: 4 }} />

        <View style={styles.readout}>
          <Text style={styles.timer}>{mmss(seconds)}</Text>
          <Text style={styles.subtle}>
            {error ?? 'KEEP TALKING · NOTHING IS SAVED YET'}
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.xl }]}>
        {micBlocked ? (
          <Pressable onPress={() => void Linking.openSettings()} style={styles.settingsBtn}>
            <Text style={styles.settingsText}>Open Settings</Text>
          </Pressable>
        ) : (
          <Pressable onPress={stopAndReview} style={styles.stopBtn} disabled={busy}>
            <View style={styles.stopSquare} />
            <Text style={styles.stopText}>{busy ? 'Reviewing…' : 'Stop & review'}</Text>
          </Pressable>
        )}
        <Text style={styles.hint}>
          {micBlocked
            ? 'Settings › Kratos › Microphone. Everything else in Kratos works without it.'
            : 'Say the exercise, then weight, reps and sets. Pause between exercises.'}
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
    micDiscOff: {
      backgroundColor: color.s1,
      borderColor: color.line2,
      shadowOpacity: 0,
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
    settingsBtn: {
      height: 64,
      borderRadius: 32,
      backgroundColor: color.ctaBg,
      borderWidth: 1,
      borderColor: color.ctaBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingsText: { fontFamily: font.uiSemibold, fontSize: 15, letterSpacing: 0.2, color: color.ctaFg },
    hint: { textAlign: 'center', fontFamily: font.ui, fontSize: 11.5, lineHeight: 18, color: color.t3 },
  });
