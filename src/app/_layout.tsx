import type { Session } from '@supabase/supabase-js';
import { useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SignInScreen } from '@/components/SignInScreen';
import { getSession, onAuthStateChange } from '@/data/auth';
import {
  CACHE_BUSTER,
  CACHE_MAX_AGE,
  dehydrateOptions,
  flushCache,
  persister,
  queryClient,
  resetQueryCache,
  resumeInterruptedMutations,
} from '@/lib/queryClient';
import { useAppFonts } from '@/theme/fonts';
import { ThemeProvider, useTheme, useThemeName } from '@/theme/ThemeProvider';

// Hold the native splash until the session check, fonts, AND the persisted-cache
// restore all resolve, so first paint is already themed (no flash of the system
// font before Instrument Sans / Geist Mono load) and already shows last-known
// data hydrated from disk (no skeleton→data flash on a warm launch).
void SplashScreen.preventAutoHideAsync();

const persistOptions = {
  persister,
  maxAge: CACHE_MAX_AGE,
  buster: CACHE_BUSTER,
  // Persist running logging writes too (not just paused ones) so an online set-log
  // interrupted by a kill survives to be re-driven — must match flushCache()'s config.
  dehydrateOptions,
};

// The four TabBar destinations are *lateral* moves, not "deeper" ones, so they
// cross-fade instead of playing the iOS slide-from-right push. The slide is what
// made tab switching read as wrong — horizontal travel means "you went one level
// in", which a tab hop never does. Detail routes (workout, exercise, routine,
// finish…) are deliberately left on the native push so depth still reads as depth.
// Paired with router.replace() at every TabBar call site, so stack depth stays 1
// instead of growing on every hop.
const TAB_SCREEN = { animation: 'fade', animationDuration: 160 } as const;

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

  // Safety net for the ~1s persist throttle: the moment iOS moves us off-screen
  // (backgrounded, or 'inactive' — app switcher / incoming call / lock), force a
  // synchronous snapshot to disk so the last set logged before an OS suspend or kill
  // can't be lost in the throttle window (gap #1). Cheap and idempotent; a transient
  // inactive→active blip just writes one extra snapshot.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') void flushCache();
    });
    return () => sub.remove();
  }, []);

  const fontsReady = fontsLoaded || fontError != null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        // Restoration is done: re-drive every write persisted from a previous run —
        // both the paused offline queue AND any write left in-flight by a kill —
        // serially in FK order. Still-offline, they simply re-pause. (Boot-only; the
        // reconnect/focus resume paths stay paused-only inside SerialResumeQueryClient.)
        onSuccess={() => {
          void resumeInterruptedMutations();
        }}
      >
        {/* Resolves the active palette from the persisted preference + OS appearance
            (#17). AppContent reads it via useTheme() so the canvas + status bar follow
            the chosen theme; screens theme themselves through the same hook. */}
        <ThemeProvider>
          <BootGate ready={ready} fontsReady={fontsReady}>
            <AppContent session={session} />
          </BootGate>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

// The themed app tree. Lives under ThemeProvider so the canvas background and the
// status-bar style follow the active palette (dark bar on the dark theme, dark text
// on the light theme). Screens theme their own content via useTheme(); this only
// owns the two chrome bits the Stack/StatusBar control globally.
function AppContent({ session }: { session: Session | null }) {
  const { color } = useTheme();
  const barStyle = useThemeName() === 'light' ? 'dark' : 'light';

  if (!session) {
    return (
      <>
        <StatusBar style={barStyle} />
        <SignInScreen />
      </>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          statusBarStyle: barStyle,
          contentStyle: { backgroundColor: color.bg },
        }}
      >
        <Stack.Screen name="index" options={TAB_SCREEN} />
        <Stack.Screen name="routines" options={TAB_SCREEN} />
        <Stack.Screen name="calendar" options={TAB_SCREEN} />
        <Stack.Screen name="history/index" options={TAB_SCREEN} />
        <Stack.Screen name="settings" options={TAB_SCREEN} />
      </Stack>
      {/* Floats over every screen; only visible offline or while the offline
          queue is draining. */}
      <OfflineBanner />
    </>
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
