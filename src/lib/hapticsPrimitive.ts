// The one low-level expo-haptics wrapper, shared by both the manual-loop haptics
// (lib/haptics.ts) and the Phase 2 voice earcon layer (lib/feedback.ts). It only
// owns the "never let feel break logging / speech" contract:
//   • platform guard — web is a hard no-op (expo-haptics falls back to the
//     Vibration API there, and a buzzing browser is not the intent; the project
//     verifies with `expo export --platform web`);
//   • swallow everything — sync throws AND async rejections (no Taptic engine,
//     Low Power Mode, Expo Go without the module) end here, never in a caller.
//
// Deliberately NOT a gate: the voice mute flag lives in lib/feedback.ts and must
// not be inherited by the manual loop (muting voice must never silence the set
// grid). Callers that need muting check it themselves before calling this.
import { Platform } from 'react-native';

const HAPTICS_SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Run a haptic effect fire-and-forget. Safe from any context: the promise is
 * never awaited, and both synchronous throws and async rejections are swallowed.
 * `run` may be sync or async (some earcons await multi-note patterns).
 */
export function fireHaptic(run: () => Promise<void> | void) {
  if (!HAPTICS_SUPPORTED) return;
  try {
    // Promise.resolve so an async `run`'s rejection is caught too — a bare
    // `void run()` would surface a denied/unavailable engine as an unhandled
    // promise rejection.
    Promise.resolve(run()).catch(() => {
      /* engine unavailable / feedback denied — feel is never load-bearing */
    });
  } catch {
    /* module missing entirely */
  }
}
