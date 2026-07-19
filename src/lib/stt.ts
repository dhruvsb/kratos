// Speech-to-text, isolated behind one hook so swapping on-device <-> cloud STT
// is a change to this file only (see CLAUDE.md / docs/PROJECT-SUMMARY-PHASE2.md).
// STT_STRATEGY: 'on-device' via expo-speech-recognition (free, offline-capable).
// A 'cloud' strategy (Whisper/Deepgram) would live in this same file behind
// the same useSpeechToText() interface.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export const STT_STRATEGY = 'on-device' as const;

export type SttState = 'idle' | 'listening' | 'processing' | 'error';

export interface UseSpeechToText {
  state: SttState;
  /** Live partial transcript while listening (interimResults: true). */
  interimTranscript: string;
  /** Set once recognition ends after stop(). */
  finalTranscript: string;
  error: string | null;
  /** Tap-to-toggle: press once to start, press again to stop and finalize. */
  toggle: () => Promise<void>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Continuous "session mic" — the voice-first model (mockup 2b): during a workout
// the mic stays open, emitting a final transcript per utterance without a tap
// per set. Interim text + mic level drive the console's live readout / meter.
// Kept in this same file so the STT provider seam stays single-source.
// ---------------------------------------------------------------------------
export interface UseSessionSpeech {
  listening: boolean;
  muted: boolean;
  /** Live partial transcript for the current utterance. */
  interim: string;
  /** 0–1 mic amplitude from `volumechange`, for the level meter. */
  level: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  setMuted: (muted: boolean) => void;
}

export function useSessionSpeech(opts: {
  /** Fired once per finalized utterance segment. */
  onSegment: (transcript: string) => void;
  lang?: string;
}): UseSessionSpeech {
  const [listening, setListening] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [interim, setInterim] = useState('');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Refs so the persistent event listeners always see current values.
  const wantRef = useRef(false);
  const mutedRef = useRef(false);
  const onSegmentRef = useRef(opts.onSegment);
  onSegmentRef.current = opts.onSegment;
  const lang = opts.lang ?? 'en-IN';

  const begin = useCallback(() => {
    ExpoSpeechRecognitionModule.start({
      lang,
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 200 },
    });
  }, [lang]);

  useSpeechRecognitionEvent('result', (event) => {
    if (mutedRef.current) return;
    const transcript = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      setInterim('');
      const trimmed = transcript.trim();
      if (trimmed) onSegmentRef.current(trimmed);
    } else {
      setInterim(transcript);
    }
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    // `value` is a rough dB-ish scale (~ -2 quiet … 10 loud); normalize to 0–1.
    const raw = (event as { value?: number }).value ?? 0;
    setLevel(Math.max(0, Math.min(1, (raw + 2) / 12)));
  });

  useSpeechRecognitionEvent('end', () => {
    // Continuous recognizers still stop on long silence / OS limits — restart
    // ourselves as long as the session still wants the mic open.
    if (wantRef.current && !mutedRef.current) {
      try {
        begin();
      } catch {
        setListening(false);
      }
    } else {
      setListening(false);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    // 'no-speech' just means a quiet gap; keep the session alive.
    if (event.error === 'no-speech') return;
    setError(event.message || event.error || "didn't catch that");
  });

  useEffect(() => {
    return () => {
      wantRef.current = false;
      if (listening) ExpoSpeechRecognitionModule.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    setError(null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone/speech permission denied');
      return;
    }
    wantRef.current = true;
    setListening(true);
    begin();
  }, [begin]);

  const stop = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    setInterim('');
    setLevel(0);
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const setMuted = useCallback(
    (next: boolean) => {
      mutedRef.current = next;
      setMutedState(next);
      if (next) {
        setInterim('');
        setLevel(0);
        ExpoSpeechRecognitionModule.stop();
      } else if (wantRef.current) {
        begin();
      }
    },
    [begin]
  );

  return { listening, muted, interim, level, error, start, stop, setMuted };
}

export function useSpeechToText(): UseSpeechToText {
  const [state, setState] = useState<SttState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listeningRef = useRef(false);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      setFinalTranscript(transcript);
      setInterimTranscript('');
    } else {
      setInterimTranscript(transcript);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    listeningRef.current = false;
    setState((prev) => (prev === 'error' ? prev : 'processing'));
  });

  useSpeechRecognitionEvent('error', (event) => {
    listeningRef.current = false;
    setError(event.message || event.error || "didn't catch that");
    setState('error');
  });

  useEffect(() => {
    return () => {
      if (listeningRef.current) ExpoSpeechRecognitionModule.abort();
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setInterimTranscript('');
    setFinalTranscript('');
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone/speech permission denied');
      setState('error');
      return;
    }
    listeningRef.current = true;
    setState('listening');
    ExpoSpeechRecognitionModule.start({
      lang: 'en-IN',
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
    });
  }, []);

  const stop = useCallback(() => {
    if (listeningRef.current) ExpoSpeechRecognitionModule.stop();
  }, []);

  const toggle = useCallback(async () => {
    if (state === 'listening') stop();
    else await start();
  }, [state, start, stop]);

  const reset = useCallback(() => {
    setState('idle');
    setInterimTranscript('');
    setFinalTranscript('');
    setError(null);
  }, []);

  return { state, interimTranscript, finalTranscript, error, toggle, reset };
}
