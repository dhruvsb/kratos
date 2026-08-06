// The one place the React Query client and its on-disk persister are created —
// mirrors src/lib/supabase.ts's "single source" rule for the client.
//
// Persisting the query cache to AsyncStorage is what makes cold start feel
// instant (local-first): on launch the app hydrates last-known data from disk
// and paints it immediately, then revalidates in the background per each query's
// staleTime. Nothing here is a native module, so this needs no dev-client rebuild.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { registerOfflineMutationDefaults } from '@/data/offlineSync';
import { registerOnlineManager } from './network';

// Teach React Query to read connectivity from NetInfo. Must run before any
// mutation fires so offline writes pause (and later resume) instead of failing.
registerOnlineManager();

// Bump this whenever a persisted row/query shape changes (the zod types in
// src/types/db.ts). A changed buster makes PersistQueryClientProvider discard the
// whole on-disk snapshot on restore instead of hydrating stale-shaped data.
export const CACHE_BUSTER = 'rq-v1';

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

/** Wipe both the in-memory and on-disk cache. Call on sign-out / account switch
 *  so one user's data can never hydrate into another user's session. */
export async function resetQueryCache(): Promise<void> {
  queryClient.clear();
  await persister.removeClient();
}
