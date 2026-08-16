// AI data-sharing consent gate for voice logging (App Store Guideline 5.1.2(i),
// tightened Nov 2025: personal data shared with third-party AI needs an explicit,
// specific, revocable in-app consent BEFORE the first upload — a privacy-policy
// mention alone is not enough).
//
// The voice recorder (src/app/voice/record.tsx) renders this instead of starting
// the mic until the user taps Allow; the choice is persisted in settings
// (`voiceAiConsent`) and revocable in Settings → PRIVACY. It names the specific
// provider (OpenAI), the specific data (the audio recording), and the purpose
// (transcription), which is exactly what reviewers check for.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { MicGlyph } from '@/components/voice/MicGlyph';
import { haptics } from '@/lib/haptics';
import { PRIVACY_POLICY_URL } from '@/lib/urls';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export function VoiceConsentGate({
  onAllow,
  onDeny,
}: {
  onAllow: () => void;
  onDeny: () => void;
}) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.iconWrap}>
          <MicGlyph size={34} color={color.acc} strokeWidth={1.6} />
        </View>

        <Text style={styles.title}>Voice logging uses AI</Text>

        <Text style={styles.lead}>
          To log sets by voice, Kratos records a short audio clip and sends it to{' '}
          <Text style={styles.strong}>OpenAI</Text>, our speech-to-text provider, to transcribe what
          you said into exercises, weights and reps.
        </Text>

        <Text style={styles.para}>
          The recording is used only to provide this feature — never for advertising or tracking. You
          can turn voice logging off anytime in Settings, and the rest of Kratos works without it.
        </Text>

        <Pressable
          onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
          hitSlop={10}
          style={styles.policyLink}
        >
          <Text style={styles.policyText}>Read our Privacy Policy</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.xl }]}>
        <Pressable
          onPress={() => {
            haptics.success();
            onAllow();
          }}
          style={styles.allowBtn}
        >
          <Text style={styles.allowText}>Allow voice logging</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            haptics.tick();
            onDeny();
          }}
          style={styles.denyBtn}
          hitSlop={8}
        >
          <Text style={styles.denyText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (color: Theme['color']) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.xxl },
    body: { flexGrow: 1, justifyContent: 'center', paddingVertical: space.xl },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 1,
      borderColor: color.line2,
      backgroundColor: color.s1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.xl,
    },
    title: {
      fontFamily: font.uiSemibold,
      fontSize: 26,
      color: color.t1,
      marginBottom: space.md,
    },
    lead: {
      fontFamily: font.ui,
      fontSize: 16,
      lineHeight: 24,
      color: color.t1b,
      marginBottom: space.md,
    },
    strong: { fontFamily: font.uiSemibold, color: color.t1 },
    para: {
      fontFamily: font.ui,
      fontSize: 15,
      lineHeight: 23,
      color: color.t2,
      marginBottom: space.lg,
    },
    policyLink: { alignSelf: 'flex-start', paddingVertical: 4 },
    policyText: {
      fontFamily: font.uiMedium,
      fontSize: 14,
      color: color.acc,
      textDecorationLine: 'underline',
    },
    footer: { gap: space.md },
    allowBtn: {
      height: 54,
      borderRadius: radius.card,
      backgroundColor: color.ctaBg,
      borderWidth: 1,
      borderColor: color.ctaBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    allowText: {
      fontFamily: font.uiSemibold,
      fontSize: 16,
      color: color.ctaFg,
      letterSpacing: tracking.tight,
    },
    denyBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
    denyText: {
      fontFamily: font.uiMedium,
      fontSize: 15,
      color: color.t3,
      letterSpacing: tracking.label,
    },
  });
