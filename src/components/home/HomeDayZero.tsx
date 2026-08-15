// Home day-zero (feedback #34). A brand-new user — zero finished workouts — has no streak,
// no heatmap, and no history to show, so instead of an all-empty dashboard we give them a
// calm welcome with two clear doors into their first workout:
//   • START EMPTY WORKOUT — the solid primary CTA, routed through the shared start flow
//     (`useStartWorkoutFlow`), so it behaves exactly like every other start entry point.
//   • CREATE A ROUTINE — the outlined secondary, jumps to the ROUTINES tab.
// Self-contained: it owns its data-free layout, so Home just drops it in place of the
// streak/heatmap/history feed when doneDays is empty.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useStartWorkoutFlow } from '@/data/useStartWorkoutFlow';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export function HomeDayZero() {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
  const { start, busy } = useStartWorkoutFlow();

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={styles.dot} />
        <Text style={styles.kicker}>WELCOME TO KRATOS</Text>
        <Text style={styles.title}>Your first workout starts here.</Text>
        <Text style={styles.body}>
          Log a session and your streak, heatmap, and history fill in automatically.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.ctaPrimary}
          onPress={() => start()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Start an empty workout"
        >
          <Text style={styles.ctaPrimaryText}>START EMPTY WORKOUT</Text>
        </Pressable>

        <Pressable
          style={styles.ctaSecondary}
          onPress={() => router.push('/routines')}
          accessibilityRole="button"
          accessibilityLabel="Create a routine"
        >
          <Text style={styles.ctaSecondaryText}>CREATE A ROUTINE</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (color: Theme['color'], shadow: Theme['shadow']) =>
  StyleSheet.create({
    wrap: { marginTop: space.xl },

    hero: {
      backgroundColor: color.s0,
      borderWidth: 1,
      borderColor: color.line,
      borderRadius: radius.card,
      paddingHorizontal: space.xxl,
      paddingVertical: space.xxl + 6,
    },
    dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: color.acc, marginBottom: space.lg },
    kicker: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.wide, color: color.t3 },
    title: { fontFamily: font.ui, fontSize: 26, lineHeight: 32, color: color.t1, marginTop: space.md },
    body: { fontFamily: font.ui, fontSize: 15, lineHeight: 22, color: color.t2, marginTop: space.md },

    actions: { marginTop: space.lg, gap: space.sm },
    ctaPrimary: {
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.ctl + 2,
      backgroundColor: color.ctaBg,
      borderWidth: 1,
      borderColor: color.ctaBorder,
      ...shadow.cta,
    },
    ctaPrimaryText: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: tracking.label, color: color.ctaFg },
    ctaSecondary: {
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.ctl + 2,
      borderWidth: 1,
      borderColor: color.line2,
    },
    ctaSecondaryText: { fontFamily: font.numSemibold, fontSize: 12, letterSpacing: tracking.label, color: color.t2 },
  });
