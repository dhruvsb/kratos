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
import { useSyncExternalStore } from 'react';

let registered = false;

/** Point `onlineManager` at NetInfo. Idempotent; called once from queryClient. */
export function registerOnlineManager(): void {
  if (registered) return;
  registered = true;
  // `isConnected` is the signal RQ's own docs use — `isInternetReachable` starts
  // null and flaps, which would wrongly pause writes on a good connection.
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(!!state.isConnected))
  );
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
