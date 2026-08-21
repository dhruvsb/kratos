// The one place that asks iOS for a permission and explains the answer.
//
// Why it exists: iOS shows a system permission alert exactly ONCE per install,
// the first time the app asks while the status is still "undetermined". After
// that, `request…` resolves instantly with the remembered answer and nothing is
// shown. So an app must (a) ask at the moment the user opts in — not deep inside
// a screen they may never reach — and (b) when the answer is already "denied",
// stop pretending and hand the user a button to iOS Settings.
//
// Both permission surfaces Kratos ships (microphone for voice logging, Apple
// Health for the gap-fill sync) go through here so the flow, and the copy, match.
import { AudioModule } from 'expo-audio';
import { Alert, Linking, Platform } from 'react-native';
import {
  healthAuthorizationRequestStatus,
  isHealthAvailable,
  requestStrengthPermission,
} from './healthkit';

export type PermissionState = 'granted' | 'undetermined' | 'denied';

/** Current mic status without prompting — `undetermined` is the one state in
 *  which iOS will still show its native alert. */
export async function micPermissionState(): Promise<PermissionState> {
  const p = await AudioModule.getRecordingPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** Offer the trip to iOS Settings for a permission the app can no longer ask for. */
function offerSettings(title: string, body: string): void {
  Alert.alert(title, body, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => void Linking.openSettings() },
  ]);
}

/**
 * Make sure Kratos can use the microphone, showing the native iOS permission
 * alert when that's still possible.
 *
 * @param explain when true and access was already denied, offer iOS Settings.
 * @returns whether recording is allowed right now.
 */
export async function ensureMicPermission(explain = true): Promise<boolean> {
  const state = await micPermissionState();
  if (state === 'granted') return true;
  if (state === 'undetermined') {
    // The native "…would like to access the microphone" alert fires here.
    const res = await AudioModule.requestRecordingPermissionsAsync();
    if (res.granted) return true;
    // Declined at the system alert: iOS won't ask again, so say what that means
    // and where to undo it rather than leaving a switch that quietly does nothing.
    if (explain) {
      offerSettings(
        'Voice logging needs the microphone',
        'Kratos can’t hear your sets without it. You can turn the microphone on anytime in Settings › Kratos.'
      );
    }
    return false;
  }
  if (explain) {
    offerSettings(
      'Microphone access is off',
      'Kratos needs the microphone to log sets by voice. You can turn it on in Settings › Kratos › Microphone.'
    );
  }
  return false;
}

/**
 * Make sure the Apple Health permission sheet has been offered.
 *
 * HealthKit is deliberately opaque: iOS never tells an app whether *read* access
 * was granted, only whether it would still present the sheet
 * (`shouldRequest`). So this presents it when it can, and reports back which of
 * the two happened so callers can word their result honestly.
 *
 * @returns 'asked'        — the Health sheet was just presented
 *          'already-asked'— iOS won't show it again (answered on an earlier run)
 *          'unavailable'  — not an iOS device with a Health store
 */
export async function ensureHealthPermission(): Promise<'asked' | 'already-asked' | 'unavailable'> {
  if (!isHealthAvailable()) return 'unavailable';
  const status = await healthAuthorizationRequestStatus();
  if (status === 'should-request') {
    await requestStrengthPermission();
    return 'asked';
  }
  return 'already-asked';
}

/** Open the Health app so the user can change Kratos' data access by hand
 *  (Health › Sharing › Apps). iOS has no deep link straight to that pane, so we
 *  land on Health and say where to go; falls back to iOS Settings. */
export async function openHealthAccessSettings(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const url = 'x-apple-health://';
  if (await Linking.canOpenURL(url).catch(() => false)) {
    await Linking.openURL(url).catch(() => Linking.openSettings());
    return;
  }
  await Linking.openSettings();
}
