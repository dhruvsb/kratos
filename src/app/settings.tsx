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
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeQuickStart } from '@/components/home/HomeQuickStart';
import { HomeTabBar, TAB_BAR_HEIGHT } from '@/components/voice/TabBar';
import { ActiveWorkoutBar } from '@/components/workout/ActiveWorkoutBar';
import { deleteAccount, getSession, signOut } from '@/data/auth';
import {
  useActiveWorkout,
  useClearAllWorkouts,
  useProfile,
  useSyncHealthWorkouts,
  useUpdateProfile,
} from '@/data/hooks';
import { GOAL_PRESETS, THEME_MODES, useSettings, useUpdateSettings } from '@/data/settings';
import { useBackups, useRunBackupNow, useWeeklyBackup } from '@/data/backup';
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// "3 days ago" / "Today" / "Never" — the last-backup summary for the DATA row (#50).
function fmtLastBackup(at: number | null | undefined): string {
  if (at == null) return 'Never';
  const days = Math.floor((Date.now() - at) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

type Row = {
  label: string;
  value?: string;
  tone?: 'default' | 'warn' | 'danger';
  /** Renders a switch instead of a value + chevron (the refined design's toggle). */
  toggle?: boolean;
  on?: boolean;
  onPress?: () => void;
};

// The refined design's real switch: a lime track + dark knob when on, a quiet
// track + knob when off. Token-only so both themes read right.
function Toggle({ on, onPress }: { on: boolean; onPress?: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <View
        style={{
          width: 48,
          height: 29,
          borderRadius: 15,
          padding: 2,
          flexDirection: 'row',
          justifyContent: on ? 'flex-end' : 'flex-start',
          backgroundColor: on ? color.acc : color.line2,
        }}
      >
        <View style={{ width: 25, height: 25, borderRadius: 13, backgroundColor: on ? color.accInk : color.t2 }} />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncingHealth, setSyncingHealth] = useState(false);
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const activeWorkout = useActiveWorkout();
  const clearAllWorkouts = useClearAllWorkouts();
  const syncHealth = useSyncHealthWorkouts();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  // Weekly CSV backup (#50): fires the once-per-session foreground check (runs a
  // backup if ≥ 7 days since the last), and drives the DATA status row + "Back up now".
  useWeeklyBackup();
  const backups = useBackups();
  const runBackupNow = useRunBackupNow();
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

  // "Clear all history" — permanently wipes every workout + its sets, keeping
  // routines, custom exercises and the profile (the "wipe test data, re-import
  // fresh from Hevy" flow). Two taps like Delete account, since it's irreversible.
  async function runClearAllWorkouts() {
    setClearing(true);
    try {
      await clearAllWorkouts.mutateAsync();
      setClearing(false);
      Alert.alert('History cleared', 'Every workout has been deleted. Your routines and exercises are untouched.');
    } catch (e) {
      setClearing(false);
      Alert.alert(
        'Could not clear history',
        e instanceof Error ? e.message : 'Check your connection and try again.'
      );
    }
  }

  function confirmClearAllWorkouts() {
    // Edge case (chosen: block, not wipe): deleting the in-progress workout out from
    // under an active session is jarring, so if one is running we refuse and point
    // the user at it rather than yanking it mid-set.
    if (activeWorkout.data) {
      Alert.alert(
        'Finish your workout first',
        'You have a workout in progress. Finish or discard it before clearing your history.'
      );
      return;
    }
    Alert.alert(
      'Clear all history?',
      'This permanently deletes every workout and all of its sets. Your routines and custom exercises are kept. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Delete every workout, permanently?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear history', style: 'destructive', onPress: runClearAllWorkouts },
            ]),
        },
      ]
    );
  }

  // Apple Health gap-fill (iOS-only). Reads strength sessions from Health and
  // backfills a blank "Strength Training" day for any you forgot to log — the
  // permission sheet is shown by the sync itself on first run.
  async function runHealthSync() {
    setSyncingHealth(true);
    try {
      const { added } = await syncHealth.mutateAsync();
      setSyncingHealth(false);
      Alert.alert(
        added > 0 ? 'Synced from Apple Health' : 'Nothing new to add',
        added > 0
          ? `Added ${added} strength ${added === 1 ? 'session' : 'sessions'} you hadn't logged.`
          : 'Every strength session in Apple Health is already on your calendar.'
      );
    } catch (e) {
      setSyncingHealth(false);
      Alert.alert(
        'Could not sync',
        e instanceof Error ? e.message : 'Check Apple Health access in Settings and try again.'
      );
    }
  }

  // Manual "Back up now" — writes a durable CSV immediately (the automatic path is
  // the weekly foreground check above). Keeps the last 4 backups; older ones roll off.
  async function runManualBackup() {
    try {
      const res = await runBackupNow.mutateAsync();
      Alert.alert(
        res.skipped ? 'Nothing to back up' : 'Backup saved',
        res.skipped
          ? 'Log or import a workout first, then your history will back up automatically.'
          : `Saved ${res.workoutCount} ${res.workoutCount === 1 ? 'workout' : 'workouts'} (${res.setCount} sets). RepVoice keeps the last 4 backups on this device.`
      );
    } catch (e) {
      Alert.alert(
        'Could not back up',
        e instanceof Error ? e.message : 'Check your connection and try again.'
      );
    }
  }

  const lastBackupLabel = runBackupNow.isPending
    ? 'Backing up…'
    : fmtLastBackup(s?.lastBackupAt ?? backups.data?.[0]?.modifiedAt ?? null);

  const groups: { title: string; rows: Row[] }[] = s
    ? [
        {
          title: 'LOGGING',
          rows: [
            {
              label: 'Units',
              value: unit,
              onPress: () =>
                updateProfile.mutate({ default_unit: unit === 'kg' ? 'lb' : 'kg' }),
            },
            {
              label: 'Pre-fill from last session',
              toggle: true,
              on: s.prefillFromLastSession,
              onPress: () =>
                updateSettings.mutate({ prefillFromLastSession: !s.prefillFromLastSession }),
            },
            {
              label: 'Weekly goal',
              value: `${s.weeklyGoal} days`,
              onPress: () => updateSettings.mutate({ weeklyGoal: next(GOAL_PRESETS, s.weeklyGoal) }),
            },
          ],
        },
        {
          title: 'APPEARANCE',
          rows: [
            {
              label: 'Theme',
              value: cap(themeMode),
              onPress: () => setThemeMode(next(THEME_MODES, themeMode)),
            },
          ],
        },
        {
          title: 'DATA',
          rows: [
            { label: 'Exercise library', onPress: () => router.push('/exercises') },
            { label: 'Import from Hevy', onPress: () => router.push('/import') },
            // iOS-only: HealthKit exists nowhere else and RepVoice ships iOS-only.
            ...(Platform.OS === 'ios'
              ? [
                  {
                    label: 'Sync from Apple Health',
                    value: syncingHealth ? 'Syncing…' : undefined,
                    onPress: syncingHealth ? undefined : runHealthSync,
                  } as Row,
                ]
              : []),
            { label: 'Export workouts', onPress: () => router.push('/export') },
            {
              label: 'Automatic backup',
              value: lastBackupLabel,
              onPress: runBackupNow.isPending ? undefined : runManualBackup,
            },
            {
              label: 'Clear all history',
              value: clearing ? 'Clearing…' : undefined,
              tone: 'danger',
              onPress: clearing ? undefined : confirmClearAllWorkouts,
            },
          ],
        },
        {
          title: 'ACCOUNT',
          rows: [
            { label: 'Sign out', tone: 'warn', onPress: confirmSignOut },
            {
              label: 'Delete account',
              value: deleting ? 'Deleting…' : undefined,
              tone: 'danger',
              onPress: deleting ? undefined : confirmDeleteAccount,
            },
          ],
        },
        {
          title: 'ABOUT',
          rows: [
            { label: 'Privacy policy', onPress: () => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL) },
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
            <View style={styles.groupHead}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              <View style={styles.groupRule} />
            </View>
            {g.rows.map((r) => (
              <Pressable
                key={r.label}
                style={({ pressed }) => [styles.row, pressed && r.onPress != null && styles.rowPressed]}
                onPress={r.onPress}
                disabled={r.onPress == null}
              >
                <Text
                  style={[
                    styles.rowLabel,
                    (r.tone === 'warn' || r.tone === 'danger') && { color: color.warn },
                  ]}
                  numberOfLines={1}
                >
                  {r.label}
                </Text>
                {r.toggle ? (
                  <Toggle on={!!r.on} onPress={r.onPress} />
                ) : (
                  <View style={styles.valueWrap}>
                    {r.value ? (
                      <Text style={[styles.rowValue, r.tone === 'danger' && { color: color.warn }]}>{r.value}</Text>
                    ) : null}
                    <Text style={styles.chevron}>›</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        ))}

        <Text style={styles.footer}>
          REPVOICE v1 · BUILD 41{'\n'}Weight is stored in kilograms, always. Voice logging arrives in
          a later build.
        </Text>
      </ScrollView>

      <HomeTabBar active="account" withFab />
      <ActiveWorkoutBar />
      <HomeQuickStart />
    </View>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { paddingHorizontal: space.xxl, paddingBottom: space.xl },
  title: { fontFamily: font.uiSemibold, fontSize: 30, color: color.t1, letterSpacing: -0.4 },
  email: { fontFamily: font.num, fontSize: 13, color: color.t2, marginTop: 8 },

  group: { marginTop: space.xxl + 2 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  groupTitle: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.t3 },
  groupRule: { flex: 1, height: 1, backgroundColor: color.line },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  rowPressed: { backgroundColor: color.acc06 },
  rowLabel: { fontFamily: font.uiMedium, fontSize: 16, color: color.t1, flex: 1 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { fontFamily: font.numMedium, fontSize: 13, color: color.t2 },
  chevron: { fontFamily: font.ui, fontSize: 15, color: color.t3 },

  footer: {
    fontFamily: font.num,
    fontSize: 9.5,
    lineHeight: 18,
    letterSpacing: 0.4,
    color: color.t3,
    marginTop: space.xxl + 2,
  },
});
