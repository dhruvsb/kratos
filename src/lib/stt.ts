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
