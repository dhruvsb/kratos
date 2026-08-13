// Screen 03 · PREVIEW router (design "Voice Logging" 1a). Intent is inferred in the
// parse, so Stop lands here and this picks the review surface: a new-routine editor
// (03A) or a logged-workout confirmation (03B). Reads the draft the recorder stashed;
// if it's gone (e.g. a hot reload), bail home rather than render an empty shell.
import { router } from 'expo-router';
import { useEffect } from 'react';
import { VoiceLogPreview } from '@/components/voice/VoiceLogPreview';
import { VoiceRoutinePreview } from '@/components/voice/VoiceRoutinePreview';
import { useVoiceDraft } from '@/data/voiceDraft';

export default function VoicePreviewScreen() {
  const draft = useVoiceDraft();

  useEffect(() => {
    if (!draft) router.replace('/');
  }, [draft]);

  if (!draft) return null;
  return draft.kind === 'routine' ? (
    <VoiceRoutinePreview result={draft} />
  ) : (
    <VoiceLogPreview result={draft} />
  );
}
