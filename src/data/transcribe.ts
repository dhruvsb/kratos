// Cloud speech→text for the voice recorder (design "Voice Logging" 1a). Reads the
// recorded clip off disk, base64-encodes it, and hands it to the `transcribe` edge
// function (which calls the ASR model server-side — the OpenAI key never reaches the
// client). Returns the transcript, which then feeds parseVoiceIntent().
import { File } from 'expo-file-system';
import { supabase } from '@/lib/supabase';

export async function transcribeAudio(
  uri: string,
  mimeType = 'audio/m4a'
): Promise<string> {
  const audioBase64 = await new File(uri).base64();
  const { data, error } = await supabase.functions.invoke('transcribe', {
    body: { audio_base64: audioBase64, mime_type: mimeType, filename: 'audio.m4a' },
  });
  if (error) throw error;
  return (data as { text?: string }).text?.trim() ?? '';
}
