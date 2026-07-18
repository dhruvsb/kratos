import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = Constants.expoConfig?.extra as
  | { supabaseUrl?: string; supabaseAnonKey?: string }
  | undefined;

const supabaseUrl = extra?.supabaseUrl ?? '';
const supabaseAnonKey = extra?.supabaseAnonKey ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly at startup instead of with confusing network errors later.
  console.warn(
    'Supabase credentials missing. Copy .env.example to .env, fill in SUPABASE_URL ' +
      'and SUPABASE_ANON_KEY, then restart the dev server with `npx expo start -c`.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'missing-anon-key',
  {
    auth: {
      // AsyncStorage keeps the session across app restarts on device;
      // on web supabase-js falls back to localStorage automatically.
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
