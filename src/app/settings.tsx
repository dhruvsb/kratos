// Settings (mockup 18) — a real screen, not an OS action sheet. Grouped LOGGING /
// DATA / ACCOUNT with values on the right; tapping a row cycles or toggles it in
// place (no switches — text values keep the LED look and screenshot clean).
//
// Two of these knobs drive behaviour elsewhere: "Pre-fill from last session" flips
// the active grid between the pre-filled row (mockup 04) and blank rows (mockup 15),
// and "Weekly goal" feeds the calendar tally (mockup 12). Weight *unit* is the one
// setting kept on the profile (it's read across the whole write path); the rest are
// device-local (src/data/settings.ts).
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar } from '@/components/voice/TabBar';
import { getSession, signOut } from '@/data/auth';
import { useProfile, useUpdateProfile } from '@/data/hooks';
import { GOAL_PRESETS, useSettings, useUpdateSettings } from '@/data/settings';
import { color, font, radius, space, tracking } from '@/theme/tokens';

function next<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

type Row = {
  label: string;
  note?: string;
  value: string;
  tone?: 'default' | 'on' | 'warn';
  onPress?: () => void;
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
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
          ],
        },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl }]}>
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
                  <Text style={[styles.rowLabel, r.tone === 'warn' && { color: color.warn }]}>
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

      <TabBar
        active="settings"
        tabs={[
          { key: 'home', label: 'HOME', onPress: () => router.dismissTo('/') },
          { key: 'calendar', label: 'CALENDAR', onPress: () => router.replace('/calendar') },
          { key: 'history', label: 'HISTORY', onPress: () => router.replace('/history') },
          { key: 'settings', label: 'SETTINGS' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
