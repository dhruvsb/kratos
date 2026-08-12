// Audio + haptic feedback — the voice-first app's PRIMARY output channel
// (mockup 2f: "audio IS the moment; the screen version is for whoever looks").
//
// Two channels:
//   • speak()  — TTS echo via expo-speech, gated by the echo-verbosity setting.
//   • earcon() — short tactile/aural confirmations. The mockup specs these as
//     ≤160ms relay-click *sounds*; we ship them as haptic patterns from the same
//     "family" (expo-haptics) because the app has no bundled audio assets yet.
//     When earcon .wav assets are added, wire them here behind the same names —
//     no caller changes. This is the one honest gap vs. the mockup's audio spec.
//
// Everything is wrapped so a missing/na native module (e.g. web, or Expo Go
// without the haptics engine) degrades to a silent no-op instead of throwing.
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';

// --- Echo verbosity (agent-notes variation point #3) --------------------------
// Full sentence / numbers only / earcon only / silent. No settings screen this
// pass, so it's a module-level default; a Settings toggle can call setEchoVerbosity.
export type EchoVerbosity = 'full' | 'numbers' | 'earcon' | 'silent';
let echoVerbosity: EchoVerbosity = 'full';
export function setEchoVerbosity(v: EchoVerbosity) {
  echoVerbosity = v;
}
export function getEchoVerbosity(): EchoVerbosity {
  return echoVerbosity;
}

let muted = false;
export function setMuted(v: boolean) {
  muted = v;
}
export function isMuted(): boolean {
  return muted;
}

const canHaptic = Platform.OS === 'ios' || Platform.OS === 'android';

function safeHaptic(fn: () => Promise<void> | void) {
  if (!canHaptic || muted) return;
  try {
    // Must catch the *rejection*, not just a synchronous throw: several earcons
    // below are async (awaited multi-note patterns), so a bare `void fn()` would
    // let a denied/unavailable engine surface as an unhandled promise rejection.
    Promise.resolve(fn()).catch(() => {
      /* haptics engine unavailable — ignore */
    });
  } catch {
    /* haptics engine unavailable — ignore */
  }
}

/**
 * Speak an echo line. `full` speaks it verbatim, `numbers` strips it to just the
 * numeric core (caller passes that via `numbersOnly`), `earcon`/`silent` stay quiet.
 */
export function speak(text: string, opts?: { numbersOnly?: string }) {
  if (muted) return;
  if (echoVerbosity === 'silent' || echoVerbosity === 'earcon') return;
  const line = echoVerbosity === 'numbers' ? (opts?.numbersOnly ?? text) : text;
  try {
    Speech.stop();
    Speech.speak(line, { rate: 1.05, pitch: 1.0 });
  } catch {
    /* TTS unavailable — ignore */
  }
}

export function stopSpeaking() {
  try {
    Speech.stop();
  } catch {
    /* ignore */
  }
}

export type Earcon =
  | 'commit' // single relay click
  | 'pr' // heavy haptic + rising two-note
  | 'undo' // reverse click
  | 'clarify' // soft double-blip
  | 'restEnd' // triple relay click
  | 'mute' // damped thunk
  | 'unmute'; // open click

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Play an earcon (currently a haptic pattern). Always safe to call. */
export function earcon(kind: Earcon) {
  switch (kind) {
    case 'commit':
      safeHaptic(() => Haptics.selectionAsync());
      break;
    case 'pr':
      // heavy landing + a "rising two-note" of quick selections
      safeHaptic(async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await wait(90);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      });
      break;
    case 'undo':
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      break;
    case 'clarify':
      safeHaptic(async () => {
        await Haptics.selectionAsync();
        await wait(110);
        await Haptics.selectionAsync();
      });
      break;
    case 'restEnd':
      safeHaptic(async () => {
        await Haptics.selectionAsync();
        await wait(90);
        await Haptics.selectionAsync();
        await wait(90);
        await Haptics.selectionAsync();
      });
      break;
    case 'mute':
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
      break;
    case 'unmute':
      safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
      break;
  }
}
