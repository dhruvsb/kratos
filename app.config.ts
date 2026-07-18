import type { ExpoConfig } from 'expo/config';

// Dynamic config so we can read Supabase credentials from .env at build time.
// The values land in Constants.expoConfig.extra — never hardcode keys in source.
const config: ExpoConfig = {
  name: 'RepVoice',
  slug: 'repvoice',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'repvoice',
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/expo.icon',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#ffffff',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  },
};

export default config;
