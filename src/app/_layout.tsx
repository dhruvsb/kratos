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
          <Stack
            screenOptions={{
              // Phase-1 screens are still the plain white UI, so their header
              // stays white; the dark voice-first screens hide it (below).
              statusBarStyle: 'dark',
              headerTintColor: '#000',
              headerStyle: { backgroundColor: '#fff' },
              contentStyle: { backgroundColor: '#fff' },
            }}
          >
            <Stack.Screen
              name="index"
              options={{
                headerShown: false,
                statusBarStyle: 'light',
                contentStyle: { backgroundColor: color.bg },
              }}
            />
            <Stack.Screen
              name="workout/[id]"
              options={{
                headerShown: false,
                statusBarStyle: 'light',
                contentStyle: { backgroundColor: color.bg },
              }}
            />
            <Stack.Screen name="routine/[id]" options={{ title: 'Routine' }} />
            <Stack.Screen name="history/index" options={{ title: 'History' }} />
            <Stack.Screen name="history/[id]" options={{ title: 'Workout detail' }} />
            <Stack.Screen name="exercises" options={{ title: 'Exercise library' }} />
            <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise history' }} />
          </Stack>
        ) : (
          <>
            <StatusBar style="dark" />
            <SignInScreen />
          </>
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
