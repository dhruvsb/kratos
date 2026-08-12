// Persistent active-workout bar (feedback #33; Hevy-style). Whenever a workout is in
// progress, a pill floats just above the tab chrome on the three tab screens showing the
// workout name + a live elapsed clock. Tapping it re-opens (resumes) the workout; the
// trash control discards it (with a confirm). Because the active workout is persisted
// (local-first, #32), the bar re-appears automatically after an app kill/relaunch — the
// data was never lost, and now there's always a visible way back into it.
//
// Rendered by each of the three tab screens (Home / Routines / Settings), just above
// their HomeQuickStart so the quick-start sheet still covers it. Returns null when no
// workout is active, so a screen can drop it in unconditionally.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useActiveWorkout, useDiscardWorkout, useRoutines } from '@/data/hooks';
import { font, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { ElapsedClock } from './LiveClock';

export function ActiveWorkoutBar() {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
  const active = useActiveWorkout();
  const routines = useRoutines();
  const w = active.data;
  const discard = useDiscardWorkout(w?.id ?? '');

  if (!w) return null;

  const name = routines.data?.find((r) => r.id === w.routine_id)?.name ?? 'Empty workout';
  const onDiscard = () =>
    Alert.alert('Discard workout?', 'This deletes the in-progress workout and every set logged in it.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => discard.mutate() },
    ]);

  return (
    <Pressable style={styles.bar} onPress={() => router.push(`/workout/${w.id}`)} accessibilityLabel="Resume workout">
      <View style={styles.dot} />
      <View style={styles.mid}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.sub}>
          <Text style={styles.subLabel}>IN PROGRESS · </Text>
          <ElapsedClock startedAt={w.started_at} format="hmmss" style={styles.subTime} />
        </View>
      </View>
      <Text style={styles.resume}>RESUME →</Text>
      <Pressable onPress={onDiscard} hitSlop={12} style={styles.trash} accessibilityLabel="Discard workout">
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.warn} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
        </Svg>
      </Pressable>
    </Pressable>
  );
}

const makeStyles = (color: Theme['color'], shadow: Theme['shadow']) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: 92, // clears the floating tab pill (bottom:24, ~56 tall)
      zIndex: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: color.s1,
      borderWidth: 1,
      borderColor: color.line,
      ...shadow.cta,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.acc },
    mid: { flex: 1, minWidth: 0 },
    name: { fontFamily: font.uiMedium, fontSize: 14, color: color.t1 },
    sub: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
    subLabel: { fontFamily: font.num, fontSize: 9, letterSpacing: 0.8, color: color.t3 },
    subTime: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.8, color: color.acc },
    resume: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.acc },
    trash: { paddingLeft: 4 },
  });
