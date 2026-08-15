// The manual loop's haptic vocabulary — the moments that matter (a set lands, a
// workout finishes, something destructive confirms, a discrete value snaps) each
// get a distinct, deliberately small feedback.
//
// Deliberately NOT routed through lib/feedback.ts: that is the Phase 2 *voice*
// output channel — gated by the voice mute flag and speaking a different
// (earcon) vocabulary. The manual loop must not inherit either; muting voice
// should never silence the set grid.
//
// Rules this helper enforces so feel can never break logging:
//   • fire-and-forget — the promise is never awaited on a write path;
//   • swallow everything — sync throws AND async rejections (no Taptic engine,
//     Low Power Mode, Expo Go without the module) end here, not in a mutation;
//   • web is a hard no-op — expo-haptics falls back to the Vibration API on web,
//     and a buzzing browser is not the intent (`expo export --platform web` is
//     part of this project's verification).
//
// The platform-guard + swallow-everything wrapper itself lives in
// lib/hapticsPrimitive.ts (shared with the voice earcon layer); this module only
// names the manual loop's vocabulary on top of it — and stays ungated, unlike
// feedback.ts's earcons.
import * as Haptics from 'expo-haptics';
import { fireHaptic as fire } from './hapticsPrimitive';

/** The logging loop's haptic vocabulary. Every call is safe from any context. */
export const haptics = {
  /** A set landed. The rep-by-rep beat, so the lightest impact there is. */
  log: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A discrete value snapped into place (rep chip, menu open) — the "detent". */
  tick: () => fire(() => Haptics.selectionAsync()),
  /** Workout finished: the payoff, and the one weighty moment in the loop. */
  success: () =>
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A destructive action confirmed — must not feel like a normal log. */
  warn: () =>
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
