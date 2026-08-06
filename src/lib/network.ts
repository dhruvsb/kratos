// Network awareness for React Query's offline mode.
//
// Wiring NetInfo into `onlineManager` is what turns offline writes from
// "fire → fail → roll back" into "pause → resume on reconnect": once RQ knows
// it's offline, a mutation with networkMode 'online' enters the *paused* state
// instead of running its mutationFn, and RQ auto-resumes the paused queue when
// connectivity returns. Reads behave the same way — cached data still shows,
// refetches just wait for the connection.
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

let registered = false;

/** NetInfo's reachability source can wedge and keep reporting a stale answer in
 *  EITHER direction (both observed in QA on the simulator; captive portals can
 *  produce the online-lie on real devices too). A stale "offline" strands the
 *  sync queue; a stale "online" is worse — writes fire, fail, exhaust their
 *  retries and roll back. So the authoritative check is a real request: HEAD
 *  Supabase's public no-auth health endpoint with a short timeout. Any HTTP
 *  response at all means the network path works. */
async function probeReachability(): Promise<boolean> {
  const url = (Constants.expoConfig?.extra as { supabaseUrl?: string } | undefined)?.supabaseUrl;
  if (!url) return false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 3000);
  try {
    await fetch(`${url}/auth/v1/health`, { method: 'HEAD', signal: abort.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Determine the true connectivity state and push it into onlineManager.
 *  NetInfo is consulted first, but the probe has the final word — it's ~200
 *  bytes every RECHECK_MS while the app is foregrounded, and it can't be lied
 *  to. (setInterval doesn't fire while iOS suspends the app, so this costs
 *  nothing in the background.) */
async function seedOnlineState(): Promise<void> {
  onlineManager.setOnline(await probeReachability());
}

/** How often to re-check reality against our believed connectivity. NetInfo.fetch
 *  reads locally cached interface state (no network traffic), so this is near
 *  free — and it bounds how long a missed reachability event can mislead us, in
 *  EITHER direction: a stuck-offline queue resumes within one interval, and a
 *  missed drop flips us to paused-writes before retries can exhaust. */
const RECHECK_MS = 10_000;

/** Point `onlineManager` at NetInfo. Idempotent; called once from queryClient. */
export function registerOnlineManager(): void {
  if (registered) return;
  registered = true;
  // Seed the real current state up front: onlineManager *defaults to online*, and
  // the event listener only reports changes — so an app cold-started while
  // disconnected would believe it's online until the first network flip (observed
  // on-device: after an offline relaunch the banner stayed hidden). fetch()
  // resolves the actual state regardless of event timing.
  void seedOnlineState();
  // `isConnected` is the signal RQ's own docs use — `isInternetReachable` starts
  // null and flaps, which would wrongly pause writes on a good connection.
  onlineManager.setEventListener((setOnline) => {
    // The setup runs lazily on first subscription — re-seed then too.
    void NetInfo.fetch().then((state) => setOnline(!!state.isConnected));
    return NetInfo.addEventListener((state) => setOnline(!!state.isConnected));
  });
  // Reachability change events can be MISSED entirely — iOS suspends callbacks in
  // the background, and the simulator sometimes drops them outright (observed in
  // QA: Wi-Fi restored, app foregrounded, still "offline" — queue stuck until
  // restart). The cached state never self-corrects, so two failsafes:
  // 1) every foreground, re-read reality;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void seedOnlineState();
  });
  // 2) poll reality every RECHECK_MS regardless of believed state — symmetric,
  //    so both a stuck-offline queue and a missed connection-drop self-correct
  //    within one interval even with dead callbacks.
  setInterval(() => {
    void seedOnlineState();
  }, RECHECK_MS);
}

/** Reactive online flag for the UI (offline banner, disabling custom-create).
 *  Reads straight from `onlineManager`, so it tracks the same state the query
 *  layer uses to pause/resume. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true // web SSR / export snapshot — assume online
  );
}
