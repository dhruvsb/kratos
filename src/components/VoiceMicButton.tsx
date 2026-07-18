import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useParseVoiceUtterance } from '@/data/hooks';
import type { VoiceParseResponse } from '@/data/voice';
import { STT_STRATEGY, useSpeechToText } from '@/lib/stt';
import { parseContextSchema, type Unit } from '@/types/parse';
import type { SetType } from '@/types/db';
import { Btn } from './ui';
import { VoiceConfirmationCard } from './VoiceConfirmationCard';

// Give up waiting on the edge function after this long — the request keeps
// running in the background (it still gets logged to voice_logs), but the UI
// stops blocking so the user isn't stuck staring at a spinner.
const PARSE_TIMEOUT_MS = 8000;

type Banner =
  | { kind: 'empty' }
  | { kind: 'timeout'; transcript: string }
  | { kind: 'error'; transcript: string; message: string };

export function VoiceMicButton({
  workoutId,
  currentExerciseId,
  currentExerciseName,
  lastSet,
  sessionExercises,
  recentExercises = [],
  defaultUnit = 'kg',
}: {
  workoutId: string;
  currentExerciseId?: string | null;
  currentExerciseName?: string | null;
  lastSet?: { weight_kg: number; reps: number; set_type: SetType } | null;
  sessionExercises: string[];
  recentExercises?: string[];
  defaultUnit?: Unit;
}) {
  const stt = useSpeechToText();
  const parse = useParseVoiceUtterance();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [card, setCard] = useState<{ transcript: string; response: VoiceParseResponse } | null>(
    null
  );
  const timedOutRef = useRef(false);

  useEffect(() => {
    if (stt.state !== 'processing') return;
    if (!stt.finalTranscript) {
      setBanner({ kind: 'empty' });
      stt.reset();
      return;
    }
    const transcript = stt.finalTranscript;
    stt.reset();
    void runParse(transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.state]);

  async function runParse(transcript: string) {
    setBanner(null);
    const context = parseContextSchema.parse({
      current_exercise_id: currentExerciseId ?? null,
      current_exercise_name: currentExerciseName ?? null,
      last_set: lastSet ?? null,
      session_exercises: sessionExercises,
      recent_exercises: recentExercises,
      default_unit: defaultUnit,
    });

    timedOutRef.current = false;
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timedOutRef.current = true;
        reject(new Error('timeout'));
      }, PARSE_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([
        parse.mutateAsync({ transcript, context, sttSource: STT_STRATEGY, workoutId }),
        timeout,
      ]);
      setCard({ transcript, response });
    } catch (err) {
      if (timedOutRef.current) {
        setBanner({ kind: 'timeout', transcript });
      } else {
        setBanner({
          kind: 'error',
          transcript,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return (
    <View style={styles.row}>
      <Btn
        small
        title={stt.state === 'listening' ? '⏹ Stop' : '🎤 Voice log'}
        onPress={stt.toggle}
      />
      {stt.state === 'listening' && (
        <Text style={styles.interim} numberOfLines={1}>
          {stt.interimTranscript || 'listening…'}
        </Text>
      )}
      {stt.state === 'error' && stt.error && (
        <Text style={styles.bannerText}>{stt.error}</Text>
      )}

      {banner?.kind === 'empty' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Didn't catch that.</Text>
          <Btn small title="Retry" onPress={stt.toggle} />
        </View>
      )}
      {banner?.kind === 'timeout' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Taking a while — "{banner.transcript}"</Text>
          <Btn small title="Retry" onPress={() => runParse(banner.transcript)} />
        </View>
      )}
      {banner?.kind === 'error' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Couldn't parse "{banner.transcript}" — log it manually below, or retry.
          </Text>
          <Btn small title="Retry" onPress={() => runParse(banner.transcript)} />
        </View>
      )}

      <VoiceConfirmationCard
        visible={card != null}
        workoutId={workoutId}
        transcript={card?.transcript ?? ''}
        response={card?.response ?? null}
        onClose={() => setCard(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  interim: { color: '#666', fontStyle: 'italic', fontSize: 13 },
  banner: { gap: 4 },
  bannerText: { color: '#666', fontSize: 13 },
});
