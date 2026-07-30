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

// Bump this whenever a persisted row/query shape changes (the zod types in
// src/types/db.ts). A changed buster makes PersistQueryClientProvider discard the
// whole on-disk snapshot on restore instead of hydrating stale-shaped data.
export const CACHE_BUSTER = 'rq-v1';

// How old a persisted snapshot may be before it's thrown away wholesale on cold
// start and refetched. Generous so a returning user still gets instant paint days
// later; per-query staleTime (see src/data/hooks.ts) still governs the background
// refresh, so "old but shown instantly, then updated" is the worst case.
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

export const queryClient = new QueryClient({
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
