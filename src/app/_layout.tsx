import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { SignInScreen } from '@/components/SignInScreen';
import { getSession, onAuthStateChange } from '@/data/auth';
import { useAppFonts } from '@/theme/fonts';
import { color } from '@/theme/tokens';

// Hold the native splash until fonts + the first session check both resolve, so
// first paint is already themed — no white spinner, and no flash of the system
// font before Space Grotesk / IBM Plex Mono load (they back the whole UI).
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setReady(true));
    return onAuthStateChange(setSession);
  }, []);

  // Font failure shouldn't strand the user on the splash forever — fall through
  // to the system-font fallback instead.
  const booted = ready && (fontsLoaded || fontError != null);

  useEffect(() => {
    if (booted) void SplashScreen.hideAsync();
  }, [booted]);

  if (!booted) return null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        {session ? (
          // Every screen is now the dark LED theme and draws its own header +
          // safe-area (back links live in-screen), so the native header stays off
          // and first paint is dark end-to-end.
          <Stack
            screenOptions={{
              headerShown: false,
              statusBarStyle: 'light',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
        ) : (
          <>
            {/* Sign-in is now the dark LED theme (mockup 13), so the bar goes light. */}
            <StatusBar style="light" />
            <SignInScreen />
          </>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
