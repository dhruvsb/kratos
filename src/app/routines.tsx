// Routines tab (Rolling Weeks redesign). The full rotation lives here now that Home
// is streak-first: every routine, edit + start, and the two ways to begin something
// new. Home's quick-start sheet (Phase 2) is the fast path to the most-used few; this
// screen is the complete, manageable list.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeQuickStart } from '@/components/home/HomeQuickStart';
import { HomeTabBar, TAB_BAR_HEIGHT } from '@/components/voice/TabBar';
import { ActiveWorkoutBar } from '@/components/workout/ActiveWorkoutBar';
import {
  useArchiveRoutine,
  useDuplicateRoutine,
  useRenameRoutine,
  useRoutines,
  useWorkoutList,
} from '@/data/hooks';
import type { RoutineWithCount } from '@/data/routines';
import { useStartWorkoutFlow } from '@/data/useStartWorkoutFlow';
import { agoLabel } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function RoutinesScreen() {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
  const insets = useSafeAreaInsets();
  const routines = useRoutines();
  const history = useWorkoutList();
  const { start, busy } = useStartWorkoutFlow();
  const duplicate = useDuplicateRoutine();
  const rename = useRenameRoutine();
  const archive = useArchiveRoutine();

  const list = routines.data ?? [];
  const workouts = history.data?.pages.flat() ?? [];

  // Last time each routine was trained (finished workouts, newest-first).
  const lastDone = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of workouts) {
      if (w.routine_id && !map.has(w.routine_id)) map.set(w.routine_id, w.started_at);
    }
    return map;
  }, [workouts]);

  // --- Long-press actions ---------------------------------------------------
  // Management lives behind a hold so the row keeps its one-tap START (Priority A:
  // the common path stays a single touch). Pressable only fires onPress OR
  // onLongPress, never both, so holding never starts a workout by accident; the
  // nested EDIT pressable swallows its own touches, so it's unaffected too.

  function duplicateRoutine(r: RoutineWithCount) {
    duplicate.mutate(r.id, {
      // Land in the editor of the copy — duplicating is always "…and tweak it",
      // and it's instant proof the copy exists (the new row is at the list's end).
      onSuccess: (copy) => router.push(`/routine/${copy.id}`),
      onError: (e) => Alert.alert("Couldn't duplicate routine", e.message),
    });
  }

  function renameRoutine(r: RoutineWithCount) {
    // Alert.prompt is iOS-only; elsewhere the editor is the rename surface.
    if (Platform.OS !== 'ios') {
      router.push(`/routine/${r.id}`);
      return;
    }
    Alert.prompt(
      'Rename routine',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (value?: string) => {
            const name = value?.trim();
            if (!name || name === r.name) return;
            rename.mutate(
              { id: r.id, name },
              { onError: (e) => Alert.alert("Couldn't rename routine", e.message) }
            );
          },
        },
      ],
      'plain-text',
      r.name
    );
  }

  function setArchived(r: RoutineWithCount, archived: boolean) {
    archive.mutate(
      { id: r.id, archived },
      {
        onSuccess: () => {
          if (!archived) return;
          // Archiving hides the routine from every list, so offer the way back
          // right here rather than leaving a dead end.
          Alert.alert('Archived', `"${r.name}" is hidden from your routines.`, [
            { text: 'Undo', onPress: () => setArchived(r, false) },
            { text: 'OK', style: 'cancel' },
          ]);
        },
        onError: (e) => Alert.alert("Couldn't archive routine", e.message),
      }
    );
  }

  function confirmArchive(r: RoutineWithCount) {
    Alert.alert(`Archive "${r.name}"?`, 'It leaves your routines list. Logged history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => setArchived(r, true) },
    ]);
  }

  function openRoutineMenu(r: RoutineWithCount) {
    haptics.tick();
    Alert.alert(r.name, `${r.exercise_count} EXERCISES`, [
      { text: 'Duplicate', onPress: () => duplicateRoutine(r) },
      { text: 'Rename', onPress: () => renameRoutine(r) },
      { text: 'Archive', style: 'destructive', onPress: () => confirmArchive(r) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl, paddingBottom: space.xl + TAB_BAR_HEIGHT }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Routines</Text>
        <Text style={styles.section}>{list.length} SAVED · TAP TO START · HOLD FOR OPTIONS</Text>

        <View style={styles.list}>
          {routines.isLoading ? (
            <Text style={styles.loading}>LOADING…</Text>
          ) : list.length === 0 ? (
            <Text style={styles.empty}>No routines yet. Build one to start with a tap.</Text>
          ) : (
            list.map((r) => (
              <Pressable
                key={r.id}
                style={styles.row}
                onPress={() => start(r.id)}
                onLongPress={() => openRoutineMenu(r)}
                delayLongPress={350}
                disabled={busy}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {r.exercise_count} EX · {agoLabel(lastDone.get(r.id)) ?? 'NEVER'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => router.push(`/routine/${r.id}`)}
                  hitSlop={10}
                  style={{ paddingHorizontal: 4 }}
                >
                  <Text style={styles.rowEdit}>EDIT</Text>
                </Pressable>
                <Text style={styles.rowStart}>START →</Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.ctaRow}>
          <Pressable style={[styles.cta, styles.ctaDashed]} onPress={() => router.push('/routine/new')}>
            <Text style={styles.ctaAcc}>+ NEW ROUTINE</Text>
          </Pressable>
          <Pressable style={styles.cta} onPress={() => start()} disabled={busy}>
            <Text style={styles.ctaDim}>EMPTY WORKOUT</Text>
          </Pressable>
        </View>
      </ScrollView>

      <HomeTabBar active="routines" withFab />
      <ActiveWorkoutBar />
      <HomeQuickStart />
    </View>
  );
}

const makeStyles = (color: Theme['color'], _shadow: Theme['shadow']) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg },
    content: { paddingHorizontal: space.xxl, paddingBottom: space.xl, flexGrow: 1 },
    title: { fontFamily: font.uiSemibold, fontSize: 22, color: color.t1 },
    section: {
      fontFamily: font.numSemibold,
      fontSize: 8,
      letterSpacing: tracking.wide,
      color: color.t3,
      marginTop: 10,
    },

    list: { marginTop: space.lg },
    loading: { fontFamily: font.numSemibold, fontSize: 11, color: color.t3, marginTop: space.md },
    empty: { fontFamily: font.num, fontSize: 11.5, lineHeight: 20, color: color.t2, marginTop: space.md },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingVertical: 17,
      borderBottomWidth: 1,
      borderBottomColor: color.line,
    },
    rowName: { fontFamily: font.uiMedium, fontSize: 15, color: color.t1 },
    rowMeta: { fontFamily: font.num, fontSize: 9.5, letterSpacing: 0.6, color: color.t3, marginTop: 6 },
    rowEdit: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.t3 },
    rowStart: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.acc },

    ctaRow: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
    cta: {
      flex: 1,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: color.line2,
      borderRadius: radius.ctl,
    },
    ctaDashed: { borderStyle: 'dashed' },
    ctaAcc: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t2 },
    ctaDim: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t3 },
  });
