import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { SignInScreen } from '@/components/SignInScreen';
import { Loading } from '@/components/ui';
import { getSession, onAuthStateChange } from '@/data/auth';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setReady(true));
    return onAuthStateChange(setSession);
  }, []);

  if (!ready) return <Loading />;

  if (!session) {
    return (
      <QueryClientProvider client={queryClient}>
        <SignInScreen />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerTintColor: '#000',
          headerStyle: { backgroundColor: '#fff' },
          contentStyle: { backgroundColor: '#fff' },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'RepVoice' }} />
        <Stack.Screen name="routine/[id]" options={{ title: 'Routine' }} />
        <Stack.Screen name="workout/[id]" options={{ title: 'Workout' }} />
        <Stack.Screen name="history/index" options={{ title: 'History' }} />
        <Stack.Screen name="history/[id]" options={{ title: 'Workout detail' }} />
        <Stack.Screen name="exercises" options={{ title: 'Exercise library' }} />
        <Stack.Screen name="exercise/[id]" options={{ title: 'Exercise history' }} />
      </Stack>
    </QueryClientProvider>
  );
}
