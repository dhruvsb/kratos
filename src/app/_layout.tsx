import type { Session } from '@supabase/supabase-js';
import { useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SignInScreen } from '@/components/SignInScreen';
import { getSession, onAuthStateChange } from '@/data/auth';
import {
  CACHE_BUSTER,
  CACHE_MAX_AGE,
  persister,
  queryClient,
  resetQueryCache,
} from '@/lib/queryClient';
import { useAppFonts } from '@/theme/fonts';
import { color } from '@/theme/tokens';

// Hold the native splash until the session check, fonts, AND the persisted-cache
// restore all resolve, so first paint is already themed (no flash of the system
// font before Instrument Sans / Geist Mono load) and already shows last-known
// data hydrated from disk (no skeleton→data flash on a warm launch).
void SplashScreen.preventAutoHideAsync();

const persistOptions = {
  persister,
  maxAge: CACHE_MAX_AGE,
  buster: CACHE_BUSTER,
};

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useAppFonts();
  // Last user id we've seen, to distinguish a token refresh (same user) from a
  // sign-out / account switch (must wipe the cache). `undefined` = not yet known.
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    getSession()
      .then((s) => {
        lastUserId.current = s?.user.id ?? null;
        setSession(s);
      })
      .catch(() => {
        lastUserId.current = null;
        setSession(null);
      })
      .finally(() => setReady(true));

    return onAuthStateChange((s, event) => {
      const nextId = s?.user.id ?? null;
      const switchedUser = lastUserId.current !== undefined && lastUserId.current !== nextId;
      // Clear the persisted cache on a real sign-out or a switch to a different
      // account so one user's routines/history can never hydrate into another's.
      // A plain TOKEN_REFRESHED keeps the same id, so it falls through untouched.
      if (event === 'SIGNED_OUT' || switchedUser) {
        void resetQueryCache();
      }
      lastUserId.current = nextId;
      setSession(s);
    });
  }, []);

  const fontsReady = fontsLoaded || fontError != null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        // Restoration is done: flush any writes that were logged offline in a
        // previous run and persisted as paused mutations. resumePausedMutations
        // replays them in order; still-offline, they simply re-pause.
        onSuccess={() => {
          void queryClient.resumePausedMutations();
        }}
      >
        <BootGate ready={ready} fontsReady={fontsReady}>
          {session ? (
            // Every screen is the dark LED theme and draws its own header +
            // safe-area (back links live in-screen), so the native header stays
            // off and first paint is dark end-to-end.
            <>
              <Stack
                screenOptions={{
                  headerShown: false,
                  statusBarStyle: 'light',
                  contentStyle: { backgroundColor: color.bg },
                }}
              />
              {/* Floats over every screen; only visible offline or while the
                  offline queue is draining. */}
              <OfflineBanner />
            </>
          ) : (
            <>
              {/* Sign-in is the dark LED theme (mockup 13), so the bar goes light. */}
              <StatusBar style="light" />
              <SignInScreen />
            </>
          )}
        </BootGate>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

// Gates first paint on session + fonts + cache restore, then hides the splash.
// `useIsRestoring` flips to false even if restore errors out (the persist client
// resolves it in a finally), so a bad/empty snapshot can never strand the splash.
function BootGate({
  ready,
  fontsReady,
  children,
}: {
  ready: boolean;
  fontsReady: boolean;
  children: ReactNode;
}) {
  const isRestoring = useIsRestoring();
  const booted = ready && fontsReady && !isRestoring;

  useEffect(() => {
    if (booted) void SplashScreen.hideAsync();
  }, [booted]);

  if (!booted) return null;
  return <>{children}</>;
}
