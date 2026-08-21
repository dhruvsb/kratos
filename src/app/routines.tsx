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
  useDeleteRoutine,
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
import { userMessage } from '@/lib/errors';

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
  const remove = useDeleteRoutine();

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
      onError: (e) => Alert.alert("Couldn't duplicate routine", userMessage(e, 'Something went wrong. Check your connection and try again.')),
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
              { onError: (e) => Alert.alert("Couldn't rename routine", userMessage(e, 'Something went wrong. Check your connection and try again.')) }
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
        onError: (e) => Alert.alert("Couldn't archive routine", userMessage(e, 'Something went wrong. Check your connection and try again.')),
      }
    );
  }

  function confirmArchive(r: RoutineWithCount) {
    Alert.alert(`Archive "${r.name}"?`, 'It leaves your routines list. Logged history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => setArchived(r, true) },
    ]);
  }

  function deleteRoutine(r: RoutineWithCount) {
    remove.mutate(r.id, {
      onError: (e) => Alert.alert("Couldn't delete routine", userMessage(e, 'Something went wrong. Check your connection and try again.')),
    });
  }

  function confirmDelete(r: RoutineWithCount) {
    // Destructive + irreversible, so a second explicit confirm (Archive only warns
    // once because it's undoable; Delete is gone for good). Logged history is
    // untouched — workouts' routine_id is FK set-null, so past sessions survive.
    haptics.warn();
    Alert.alert(
      `Delete "${r.name}"?`,
      'This permanently removes the routine. Your logged workout history is kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteRoutine(r) },
      ]
    );
  }

  function openRoutineMenu(r: RoutineWithCount) {
    haptics.tick();
    Alert.alert(r.name, `${r.exercise_count} EXERCISES`, [
      { text: 'Duplicate', onPress: () => duplicateRoutine(r) },
      { text: 'Rename', onPress: () => renameRoutine(r) },
      // Archive = hide (undoable); Delete = permanent. Kept as two distinct actions.
      { text: 'Archive', onPress: () => confirmArchive(r) },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(r) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl, paddingBottom: space.xl + TAB_BAR_HEIGHT }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>Routines</Text>
          {list.length > 0 && <Text style={styles.count}>{list.length}</Text>}
        </View>

        <View style={styles.list}>
          {routines.isLoading ? (
            <Text style={styles.loading}>LOADING…</Text>
          ) : list.length === 0 ? (
            <Text style={styles.empty}>No routines yet. Build one to start with a tap.</Text>
          ) : (
            list.map((r) => {
              const empty = r.exercise_count === 0;
              return (
                <Pressable
                  key={r.id}
                  style={styles.row}
                  // Hold anywhere on the row for the options menu (duplicate / rename /
                  // archive); the Start pill is the one-tap common path.
                  onLongPress={() => openRoutineMenu(r)}
                  delayLongPress={350}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {r.exercise_count} exercise{r.exercise_count === 1 ? '' : 's'} ·{' '}
                      {(agoLabel(lastDone.get(r.id)) ?? 'never').toLowerCase()}
                    </Text>
                  </View>
                  <Pressable onPress={() => router.push(`/routine/${r.id}`)} hitSlop={8} style={styles.editPill}>
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => !empty && start(r.id)}
                    disabled={busy || empty}
                    hitSlop={8}
                    style={[styles.startPill, empty && styles.startPillOff]}
                  >
                    <Text style={[styles.startText, empty && styles.startTextOff]}>Start</Text>
                  </Pressable>
                </Pressable>
              );
            })
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

      {/* Content-container padding only clears the status bar at scroll-0 — once
          the list scrolls, rows ran straight under the clock / Dynamic Island.
          Home never showed this because its streak header is fixed and opaque;
          here this scrim plays that part. pointerEvents="none" so it can't eat
          taps meant for the row beneath it. */}
      <View
        pointerEvents="none"
        style={[styles.topScrim, { height: insets.top }]}
      />

      <HomeTabBar active="routines" withFab />
      <ActiveWorkoutBar />
      <HomeQuickStart />
    </View>
  );
}

const makeStyles = (color: Theme['color'], _shadow: Theme['shadow']) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg },
    // Opaque status-bar strip so scrolled rows disappear behind it instead of
    // colliding with the clock. Height is the safe-area inset, set at runtime.
    topScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: color.bg,
    },
    content: { paddingHorizontal: space.xxl, paddingBottom: space.xl, flexGrow: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    title: { fontFamily: font.uiSemibold, fontSize: 30, color: color.t1, letterSpacing: -0.4 },
    count: { fontFamily: font.numMedium, fontSize: 13, color: color.t2, paddingBottom: 6 },

    list: { marginTop: space.xl },
    loading: { fontFamily: font.numSemibold, fontSize: 11, color: color.t3, marginTop: space.md },
    empty: { fontFamily: font.num, fontSize: 11.5, lineHeight: 20, color: color.t2, marginTop: space.md },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: color.line,
    },
    rowName: { fontFamily: font.uiMedium, fontSize: 17, color: color.t1, letterSpacing: -0.2 },
    rowMeta: { fontFamily: font.num, fontSize: 12, color: color.t2, marginTop: 5 },
    editPill: {
      height: 38,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    editText: { fontFamily: font.uiMedium, fontSize: 13, color: color.t3 },
    startPill: {
      height: 38,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: color.acc35,
    },
    startPillOff: { borderColor: color.line2 },
    startText: { fontFamily: font.uiSemibold, fontSize: 13, color: color.acc },
    startTextOff: { color: color.t3 },

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
