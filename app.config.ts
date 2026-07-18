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
    // On-device STT for voice logging (Phase 2) — needs a config plugin for
    // the native mic/speech-recognizer permission strings.
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Allow RepVoice to use the microphone to log sets by voice.',
        speechRecognitionPermission: 'Allow RepVoice to use speech recognition to log sets by voice.',
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
