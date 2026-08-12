// Settings (mockup 18) — a real screen, not an OS action sheet. Grouped LOGGING /
// DATA / ACCOUNT with values on the right; tapping a row cycles or toggles it in
// place (no switches — text values keep the LED look and screenshot clean).
//
// Two of these knobs drive behaviour elsewhere: "Pre-fill from last session" flips
// the active grid between the pre-filled row (mockup 04) and blank rows (mockup 15),
// and "Weekly goal" feeds the calendar tally (mockup 12). Weight *unit* is the one
// setting kept on the profile (it's read across the whole write path); the rest are
// device-local (src/data/settings.ts).
import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useQuery } from '@tanstack/react-query';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeTabBar, TAB_BAR_HEIGHT } from '@/components/voice/TabBar';
import { deleteAccount, getSession, signOut } from '@/data/auth';
import { useProfile, useUpdateProfile } from '@/data/hooks';
import { GOAL_PRESETS, THEME_MODES, useSettings, useUpdateSettings } from '@/data/settings';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme, useThemeMode } from '@/theme/ThemeProvider';

// App Store Review Guideline 5.1.1(i) wants the privacy policy reachable from
// *inside* the app as well as from the App Store listing, so it gets a row here.
// The page itself is `docs/legal/privacy-policy.html`.
//
// ⚠️ This must point at the live hosted copy before any TestFlight/App Store
// submission — a 404 here is a review rejection.
const PRIVACY_POLICY_URL = 'https://dhruv-shah1.github.io/repvoice/privacy-policy.html';

function next<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

type Row = {
  label: string;
  note?: string;
  value: string;
  tone?: 'default' | 'on' | 'warn' | 'danger';
  onPress?: () => void;
};

export default function SettingsScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const sessionEmail = useQuery({
    queryKey: ['sessionEmail'],
    queryFn: () => getSession().then((s) => s?.user.email ?? null),
  });

  const unit = profile.data?.default_unit ?? 'kg';
  const s = settings.data;
  const email = sessionEmail.data ?? '';

  function confirmSignOut() {
    Alert.alert('Sign out?', email || undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  // Account deletion — required in-app by App Store Review Guideline 5.1.1(v).
  // Two taps, not one: it's irreversible and sits one row under "Sign out".
  // Apple allows confirmation steps; it only forbids making deletion hard to
  // reach, so this stays two native alerts — no extra screen, no typed word.
  async function runDeleteAccount() {
    setDeleting(true);
    try {
      await deleteAccount();
      // The SIGNED_OUT that deleteAccount emits swaps this screen for sign-in;
      // the alert lands on top of it as the "deletion complete" confirmation.
      Alert.alert('Account deleted', 'Your account and all of its data have been removed.');
    } catch (e) {
      setDeleting(false);
      Alert.alert(
        'Could not delete account',
        e instanceof Error ? e.message : 'Check your connection and try again.'
      );
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and every workout, routine and custom exercise on it. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Delete everything, permanently?', email || undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete account', style: 'destructive', onPress: runDeleteAccount },
            ]),
        },
      ]
    );
  }

  const groups: { title: string; rows: Row[] }[] = s
    ? [
        {
          title: 'LOGGING',
          rows: [
            {
              label: 'Units',
              note: 'stored in kg, always',
              value: unit.toUpperCase(),
              onPress: () =>
                updateProfile.mutate({ default_unit: unit === 'kg' ? 'lb' : 'kg' }),
            },
            {
              label: 'Pre-fill from last session',
              note: 'blank rows if off',
              value: s.prefillFromLastSession ? 'ON' : 'OFF',
              tone: s.prefillFromLastSession ? 'on' : 'default',
              onPress: () =>
                updateSettings.mutate({ prefillFromLastSession: !s.prefillFromLastSession }),
            },
            {
              label: 'Weekly goal',
              note: 'drives the calendar tally',
              value: `${s.weeklyGoal} DAYS`,
              onPress: () => updateSettings.mutate({ weeklyGoal: next(GOAL_PRESETS, s.weeklyGoal) }),
            },
          ],
        },
        {
          title: 'APPEARANCE',
          rows: [
            {
              label: 'Theme',
              note: "'system' follows your device",
              value: themeMode.toUpperCase(),
              tone: themeMode === 'system' ? 'default' : 'on',
              onPress: () => setThemeMode(next(THEME_MODES, themeMode)),
            },
          ],
        },
        {
          title: 'DATA',
          rows: [
            {
              label: 'Exercise library',
              note: 'browse and add custom exercises',
              value: 'MANAGE',
              onPress: () => router.push('/exercises'),
            },
            {
              label: 'Import from Hevy',
              note: 'build history from a Hevy CSV',
              value: 'IMPORT',
              onPress: () => router.push('/import'),
            },
            {
              label: 'Export workouts',
              note: 'Hevy-compatible CSV file',
              value: 'EXPORT',
              onPress: () => router.push('/export'),
            },
          ],
        },
        {
          title: 'ACCOUNT',
          rows: [
            {
              label: 'Sign out',
              note: email,
              value: '→',
              tone: 'warn',
              onPress: confirmSignOut,
            },
            {
              label: 'Delete account',
              note: 'erases every workout, routine and custom exercise',
              value: deleting ? 'DELETING…' : 'DELETE',
              tone: 'danger',
              onPress: deleting ? undefined : confirmDeleteAccount,
            },
          ],
        },
        {
          title: 'ABOUT',
          rows: [
            {
              label: 'Privacy policy',
              note: 'what RepVoice stores, and how to erase it',
              value: 'READ',
              onPress: () => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL),
            },
          ],
        },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl, paddingBottom: space.xl + TAB_BAR_HEIGHT }]}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.email}>{email || ' '}</Text>

        {groups.map((g) => (
          <View key={g.title} style={styles.group}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            {g.rows.map((r) => (
              <Pressable
                key={r.label}
                style={({ pressed }) => [styles.row, pressed && r.onPress != null && styles.rowPressed]}
                onPress={r.onPress}
                disabled={r.onPress == null}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.rowLabel,
                      (r.tone === 'warn' || r.tone === 'danger') && { color: color.warn },
                    ]}
                  >
                    {r.label}
                  </Text>
                  {r.note ? (
                    <Text style={styles.rowNote} numberOfLines={1}>
                      {r.note}
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.rowValue,
                    r.tone === 'on' && { color: color.acc },
                    r.tone === 'warn' && { color: color.t3 },
                    r.tone === 'danger' && { color: color.warn },
                  ]}
                >
                  {r.value}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}

        <Text style={styles.footer}>
          REPVOICE v1 · BUILD 41{'\n'}Weight is stored in kilograms, always. Voice logging arrives in
          a later build.
        </Text>
      </ScrollView>

      <HomeTabBar active="account" />
    </View>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xxl, paddingBottom: space.xl },
  title: { fontFamily: font.uiSemibold, fontSize: 22, color: color.t1 },
  email: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: 0.8, color: color.t3, marginTop: 7 },

  group: { marginTop: space.xxl + 2 },
  groupTitle: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  rowPressed: { backgroundColor: color.acc06 },
  rowLabel: { fontFamily: font.uiMedium, fontSize: 14, color: color.t1 },
  rowNote: { fontFamily: font.num, fontSize: 9.5, color: color.t3, marginTop: 5 },
  rowValue: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t2 },

  footer: {
    fontFamily: font.num,
    fontSize: 9.5,
    lineHeight: 18,
    letterSpacing: 0.4,
    color: color.t3,
    marginTop: space.xxl + 2,
  },
});
