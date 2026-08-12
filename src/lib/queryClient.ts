// The one place the React Query client and its on-disk persister are created —
// mirrors src/lib/supabase.ts's "single source" rule for the client.
//
// Persisting the query cache to AsyncStorage is what makes cold start feel
// instant (local-first): on launch the app hydrates last-known data from disk
// and paints it immediately, then revalidates in the background per each query's
// staleTime. Nothing here is a native module, so this needs no dev-client rebuild.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, type DehydrateOptions } from '@tanstack/react-query';
import { persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { isOfflineMutationKey, registerOfflineMutationDefaults } from '@/data/offlineSync';
import { registerOnlineManager } from './network';

// Teach React Query to read connectivity from NetInfo. Must run before any
// mutation fires so offline writes pause (and later resume) instead of failing.
registerOnlineManager();

// Bump this whenever a persisted row/query shape changes (the zod types in
// src/types/db.ts). A changed buster makes PersistQueryClientProvider discard the
// whole on-disk snapshot on restore instead of hydrating stale-shaped data.
export const CACHE_BUSTER = 'rq-v2'; // v2: WorkoutListItem gained volume_kg

// How old a persisted snapshot may be before it's thrown away wholesale on cold
// start and refetched. Generous so a returning user still gets instant paint days
// later; per-query staleTime (see src/data/hooks.ts) still governs the background
// refresh, so "old but shown instantly, then updated" is the worst case.
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// React Query's own resumePausedMutations flushes the paused queue with
// Promise.all — CONCURRENT. Our offline queue is FK-ordered (workout →
// workout_exercise → set, in the order the user logged them), and a child insert
// racing its parent would 23503. Serialize the flush instead: creation order,
// one at a time. Overriding the method covers every resume path — the manual
// call after cache restore (_layout) and RQ's own on-reconnect / on-focus
// resumes both go through this.resumePausedMutations() (verified in
// query-core's queryClient.mount()).
class SerialResumeQueryClient extends QueryClient {
  override resumePausedMutations(): Promise<unknown> {
    const paused = this.getMutationCache()
      .getAll()
      .filter((m) => m.state.isPaused);
    return paused.reduce<Promise<unknown>>(
      (chain, mutation) => chain.then(() => mutation.continue().catch(() => {})),
      Promise.resolve()
    );
  }
}

export const queryClient = new SerialResumeQueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // gcTime must be >= the persister's maxAge, or an inactive query can be
      // garbage-collected out of memory before it's re-persisted / restored.
      gcTime: CACHE_MAX_AGE,
      // A sane floor so remounting a screen within a minute doesn't refetch.
      // Individual hooks raise this. Every mutation invalidates the keys it
      // affects, so staleTime never hides our *own* writes — it only suppresses
      // redundant passive refetch-on-mount, which is what makes navigation snap.
      staleTime: 60 * 1000,
    },
  },
});

// Pair each offline-capable mutation key to a standalone replay fn, so a mutation
// persisted while offline can resume after an app kill (its fn/callbacks don't
// survive serialization — the key + these defaults are how it finds its code).
registerOfflineMutationDefaults(queryClient);

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'repvoice.rq-cache.v1',
});

// What gets written to disk. RQ's default persists only *paused* mutations (the
// offline write queue). We ALSO persist still-running writes on the offline-logging
// keys, so an ONLINE set-log that is mid-request when iOS kills the app survives on
// disk and can be re-driven on relaunch (gap #2 — otherwise the optimistic set
// hydrates from cache but the matching server row is missing, and the next refetch
// silently drops it). A write that completes flips to 'success' and is dropped from
// the next snapshot, so only a genuine mid-flight kill ever leaves one behind. This
// SAME object must feed both the provider's throttled persist (_layout persistOptions)
// and the forced flush below, or the two would disagree on what to save.
export const dehydrateOptions: DehydrateOptions = {
  shouldDehydrateMutation: (m) =>
    m.state.isPaused ||
    (m.state.status === 'pending' && isOfflineMutationKey(m.options.mutationKey)),
};

/** Force a synchronous cache snapshot to disk, bypassing the provider's ~1s persist
 *  throttle. Called when the app backgrounds/inactivates so a set logged in the last
 *  second before an iOS suspend/kill can't miss the on-disk snapshot (gap #1). */
export function flushCache(): Promise<void> {
  return persistQueryClientSave({
    queryClient,
    persister,
    buster: CACHE_BUSTER,
    dehydrateOptions,
  });
}

/** Boot-only recovery, run once right after the persisted cache is restored (when no
 *  mutation is running yet). Re-drives EVERY restored-pending write — RQ's paused
 *  offline queue AND any write still in-flight when the app was killed — serially in
 *  creation (FK-safe) order via each key's registered offline default fn. This
 *  supersedes the plain resumePausedMutations() at boot: paused writes are pending too,
 *  so it's a strict superset that also covers the interrupted-online case. Errors are
 *  swallowed — re-driving a write that DID land before the kill just hits a duplicate
 *  client-id insert, a no-op on end state (the row already exists). Do NOT call this on
 *  the reconnect/focus resume paths (those must stay paused-only — a write may be
 *  genuinely running); it is safe only at boot, before any in-session mutation exists. */
export function resumeInterruptedMutations(): Promise<unknown> {
  const pending = queryClient
    .getMutationCache()
    .getAll()
    .filter((m) => m.state.status === 'pending');
  return pending.reduce<Promise<unknown>>(
    (chain, mutation) => chain.then(() => mutation.continue().catch(() => {})),
    Promise.resolve()
  );
}

/** Wipe both the in-memory and on-disk cache. Call on sign-out / account switch
 *  so one user's data can never hydrate into another user's session. */
export async function resetQueryCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
