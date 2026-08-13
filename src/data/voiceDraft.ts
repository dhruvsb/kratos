// Ephemeral voice state that spans a route hop, held in a tiny module store (the
// draft is a single in-flight thing, not server data, so it doesn't belong in the
// React Query cache).
//
//  • draft      — the parse result being reviewed, handed from the recorder to the
//                 preview screen.
//  • lastCommit — what a voice log just wrote, so the workout screen can show the
//                 "N SETS LOGGED FROM VOICE · UNDO" banner (design screen 04).
import { useSyncExternalStore } from 'react';
import type { VoiceParseResult } from './voiceParse';

export type LastVoiceCommit = { workoutId: string; setIds: string[]; count: number };

let draft: VoiceParseResult | null = null;
let lastCommit: LastVoiceCommit | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function setVoiceDraft(next: VoiceParseResult | null) {
  draft = next;
  emit();
}
export function getVoiceDraft(): VoiceParseResult | null {
  return draft;
}
export function useVoiceDraft(): VoiceParseResult | null {
  return useSyncExternalStore(subscribe, getVoiceDraft, getVoiceDraft);
}

export function setLastVoiceCommit(next: LastVoiceCommit | null) {
  lastCommit = next;
  emit();
}
export function getLastVoiceCommit(): LastVoiceCommit | null {
  return lastCommit;
}
export function useLastVoiceCommit(): LastVoiceCommit | null {
  return useSyncExternalStore(subscribe, getLastVoiceCommit, getLastVoiceCommit);
}
