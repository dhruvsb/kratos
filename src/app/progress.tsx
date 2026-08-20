// Progress — "key lifts" progression board (Phase-3 scaffolding). Headline lifts
// grouped by muscle group (Chest / Back / Quads / Hamstring), each showing its
// all-time best, most recent session, and a suggested next target — a glance-able
// "where am I and what do I aim for" before a training day. Tapping a lift opens the
// full per-exercise progress screen. The visual design here is intentionally basic
// (built from existing tokens/components) and meant to be finalized later.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Empty, Loading } from '@/components/ui';
import { useKeyLiftProgress, useProfile } from '@/data/hooks';
import { KEY_LIFT_GROUPS, suggestNextTarget, type LiftProgress, type TopSet } from '@/data/progression';
import type { Exercise, ExerciseModality, Unit } from '@/types/db';
import { formatWeight, formatDuration, formatLevel } from '@/lib/units';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const DAY_MS = 86_400_000;

/** A top set rendered in the exercise's own terms — big value + small suffix. */
function formatTop(top: TopSet | null, modality: ExerciseModality, unit: Unit): { main: string; suffix: string } {
  if (!top) return { main: '—', suffix: '' };
  switch (modality) {
    case 'bodyweight_reps':
      return { main: `${top.reps ?? '—'}`, suffix: 'reps' };
    case 'time':
      return { main: formatDuration(top.duration_seconds), suffix: '' };
    case 'distance_time':
      return { main: formatDuration(top.duration_seconds), suffix: top.level != null ? `L${formatLevel(top.level)}` : '' };
    case 'weighted_bodyweight':
      return top.weight_kg != null
        ? { main: formatWeight(top.weight_kg, unit), suffix: top.reps != null ? `×${top.reps}` : '' }
        : { main: `${top.reps ?? '—'}`, suffix: 'reps' };
    case 'weight_reps':
    default:
      return { main: formatWeight(top.weight_kg, unit), suffix: top.reps != null ? `×${top.reps}` : '' };
  }
}

function daysAgoLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = Math.round((Date.now() - new Date(iso).getTime()) / DAY_MS);
  return d <= 0 ? 'TODAY' : `${d}D AGO`;
}

function LiftCard({
  exercise,
  progress,
  unit,
  styles,
  color,
}: {
  exercise: Exercise;
  progress: LiftProgress | undefined;
  unit: Unit;
  styles: ReturnType<typeof makeStyles>;
  color: Theme['color'];
}) {
  const modality = exercise.modality;
  const best = formatTop(progress?.best ?? null, modality, unit);
  const target = formatTop(suggestNextTarget(progress?.best ?? null, modality), modality, unit);
  const last = formatTop(progress?.lastTop ?? null, modality, unit);
  const hasData = (progress?.sessionCount ?? 0) > 0;

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/exercise/${exercise.id}`)}>
      <View style={styles.cardHead}>
        <Text style={styles.cardName} numberOfLines={1}>
          {exercise.canonical_name}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </View>

      {hasData ? (
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>BEST</Text>
            <Text style={styles.statValue}>
              {best.main}
              {best.suffix !== '' && <Text style={styles.statUnit}> {best.suffix}</Text>}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>LAST</Text>
            <Text style={[styles.statValue, { color: color.t2 }]}>
              {last.main}
              {last.suffix !== '' && <Text style={styles.statUnit}> {last.suffix}</Text>}
            </Text>
            <Text style={styles.statMeta}>{daysAgoLabel(progress?.lastDate ?? null)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statLabel, { color: color.acc }]}>NEXT TARGET</Text>
            <Text style={[styles.statValue, { color: color.acc }]}>
              {target.main}
              {target.suffix !== '' && <Text style={[styles.statUnit, { color: color.acc }]}> {target.suffix}</Text>}
            </Text>
          </View>
        </View>
      ) : (
        <Text style={styles.noData}>No sessions logged yet — start this lift to track it.</Text>
      )}
    </Pressable>
  );
}

export default function ProgressScreen() {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const unit: Unit = profile.data?.default_unit ?? 'kg';
  const { data, exercisesByName, directoryLoading, isLoading } = useKeyLiftProgress();

  if (directoryLoading || isLoading) return <Loading />;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← BACK</Text>
        </Pressable>
        <Text style={styles.title}>Progress</Text>
        <Text style={styles.sub}>KEY LIFTS · BEST → NEXT TARGET</Text>

        {KEY_LIFT_GROUPS.map((group) => {
          const exercises = group.exerciseNames
            .map((name) => exercisesByName.get(name))
            .filter((e): e is Exercise => e != null);
          if (exercises.length === 0) return null;
          return (
            <View key={group.key} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
              {exercises.map((ex) => (
                <LiftCard
                  key={ex.id}
                  exercise={ex}
                  progress={data?.[ex.id]}
                  unit={unit}
                  styles={styles}
                  color={color}
                />
              ))}
            </View>
          );
        })}

        {!data && <Empty text="Nothing to show yet. Log some lifts to see progress." />}
      </ScrollView>
    </View>
  );
}

const makeStyles = (color: Theme['color'], shadow: Theme['shadow']) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg },
    content: { paddingHorizontal: space.xxl, paddingBottom: space.xxl * 2 },
    back: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },
    title: { fontFamily: font.uiSemibold, fontSize: 30, color: color.t1, letterSpacing: -0.4, marginTop: space.lg },
    sub: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.t3, marginTop: 7 },

    group: { marginTop: space.xxl },
    groupLabel: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.wide, color: color.t2, marginBottom: space.md },

    card: {
      borderWidth: 1,
      borderColor: color.line,
      borderRadius: radius.ctl,
      backgroundColor: color.s1,
      padding: space.lg,
      marginBottom: space.sm,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardName: { fontFamily: font.uiMedium, fontSize: 16, color: color.t1, letterSpacing: -0.2, flex: 1, minWidth: 0 },
    chevron: { fontFamily: font.uiMedium, fontSize: 20, color: color.t3, marginLeft: space.sm },

    statRow: { flexDirection: 'row', gap: space.lg, marginTop: space.md },
    stat: { flex: 1 },
    statLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
    statValue: { fontFamily: font.numBold, fontSize: 17, color: color.t1, marginTop: 6 },
    statUnit: { fontFamily: font.num, fontSize: 10, color: color.t3 },
    statMeta: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: 0.6, color: color.t3, marginTop: 4 },

    noData: { fontFamily: font.num, fontSize: 11.5, lineHeight: 18, color: color.t3, marginTop: space.md },
  });
