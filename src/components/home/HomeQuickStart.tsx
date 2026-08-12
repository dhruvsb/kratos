// Home quick-start (Rolling Weeks, Phase 2). A `+` FAB that opens a "MOST USED"
// bottom sheet — the fast path to the routines you actually run, without leaving the
// streak Home. The FAB rotates to a `×` and lifts above the sheet to double as its
// close control (mockup behaviour), and the scrim closes it too.
//
// Self-contained: it reads its own (react-query-cached) data and owns the animation +
// open state, so Home just drops it in above the tab bar. START routes through the
// shared start flow, so a live workout is resumed rather than double-started.
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRoutines, useWorkoutList } from '@/data/hooks';
import { useStartWorkoutFlow } from '@/data/useStartWorkoutFlow';
import { agoLabel } from '@/lib/dates';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

const DAY_MS = 86_400_000;
const FAB_BOTTOM = 24; // FAB bottom offset — sits in the bottom row beside the glass pill
const MAX_ROWS = 6;
// Near-white glyph on the saturated moss/lime glass FAB (material contrast, both themes).
const FAB_GLYPH_ON_GLASS = '#F4F2EA';

export function HomeQuickStart() {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
  const glass = isLiquidGlassAvailable();
  const glyphColor = glass ? FAB_GLYPH_ON_GLASS : color.ctaFg;
  const routines = useRoutines();
  const history = useWorkoutList();
  const { start, busy } = useStartWorkoutFlow();

  const [open, setOpen] = useState(false);
  const [sheetH, setSheetH] = useState(560); // measured on first layout; safe fallback
  const anim = useRef(new Animated.Value(0)).current;

  const toggle = (next: boolean) => {
    setOpen(next);
    Animated.timing(anim, {
      toValue: next ? 1 : 0,
      duration: next ? 320 : 240,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  };
  const startAnd = (id?: string) => {
    toggle(false);
    start(id);
  };

  const workouts = history.data?.pages.flat() ?? [];
  const lastDone = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workouts) if (w.routine_id && !m.has(w.routine_id)) m.set(w.routine_id, w.started_at);
    return m;
  }, [workouts]);
  // Usage = finished workouts per routine over the last 90 days (from the loaded
  // history pages — enough to rank "most used" for the sheet).
  const usage = useMemo(() => {
    const cutoff = startOfToday() - 89 * DAY_MS;
    const m = new Map<string, number>();
    for (const w of workouts) {
      if (!w.routine_id || new Date(w.started_at).getTime() < cutoff) continue;
      m.set(w.routine_id, (m.get(w.routine_id) ?? 0) + 1);
    }
    return m;
  }, [workouts]);

  const list = routines.data ?? [];
  const sorted = useMemo(
    () =>
      [...list]
        .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.position - b.position)
        .slice(0, MAX_ROWS),
    [list, usage]
  );

  const scrimOpacity = anim;
  const sheetTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [sheetH + 40, 0] });
  const fabRotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
  // When open, lift the FAB to just above the sheet's top edge so it reads as ×.
  const fabTranslate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -Math.max(0, sheetH - FAB_BOTTOM + 14)],
  });

  return (
    <>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.scrim, { opacity: scrimOpacity }]}>
        <Pressable style={{ flex: 1 }} onPress={() => toggle(false)} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}
        pointerEvents={open ? 'auto' : 'none'}
        style={[styles.sheet, { transform: [{ translateY: sheetTranslate }] }]}
      >
        <View style={styles.grip} />
        <View style={styles.sheetHead}>
          <Text style={styles.sheetLabel}>MOST USED</Text>
          <Text style={styles.sheetSub}>LAST 90 DAYS</Text>
        </View>
        {sorted.map((r) => (
          <Pressable key={r.id} style={styles.row} onPress={() => startAnd(r.id)} disabled={busy}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowName} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.rowMeta}>
                {r.exercise_count} EXERCISE{r.exercise_count === 1 ? '' : 'S'} ·{' '}
                {agoLabel(lastDone.get(r.id)) ?? 'NEVER'}
              </Text>
            </View>
            <Text style={styles.rowCount}>{usage.get(r.id) ?? 0}×</Text>
            <Text style={styles.rowStart}>START →</Text>
          </Pressable>
        ))}
        <View style={styles.ctaRow}>
          <Pressable
            style={[styles.cta, styles.ctaDashed]}
            onPress={() => {
              toggle(false);
              router.push('/routine/new');
            }}
          >
            <Text style={styles.ctaAcc}>+ NEW ROUTINE</Text>
          </Pressable>
          <Pressable style={styles.cta} onPress={() => startAnd()} disabled={busy}>
            <Text style={styles.ctaDim}>EMPTY WORKOUT</Text>
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.fab,
          glass ? styles.fabGlassWrap : styles.fabSolid,
          { transform: [{ translateY: fabTranslate }, { rotate: fabRotate }] },
        ]}
      >
        {glass && <GlassView glassEffectStyle="regular" isInteractive tintColor={color.acc} style={styles.fabGlass} />}
        <Pressable
          onPress={() => toggle(!open)}
          style={styles.fabPress}
          accessibilityLabel={open ? 'Close quick start' : 'Quick start'}
        >
          <View style={styles.glyph}>
            <View style={[styles.glyphH, { backgroundColor: glyphColor }]} />
            <View style={[styles.glyphV, { backgroundColor: glyphColor }]} />
          </View>
        </Pressable>
      </Animated.View>
    </>
  );
}

function startOfToday(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const makeStyles = (color: Theme['color'], shadow: Theme['shadow']) =>
  StyleSheet.create({
    scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 6, backgroundColor: 'rgba(0,0,0,0.45)' },

    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 7,
      backgroundColor: color.s0,
      borderTopWidth: 1,
      borderTopColor: color.line2,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: space.xxl,
      paddingTop: space.xxl,
      paddingBottom: 30,
      ...shadow.cta,
    },
    grip: { width: 38, height: 4, borderRadius: 2, backgroundColor: color.line2, alignSelf: 'center', marginBottom: space.xl },
    sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    sheetLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
    sheetSub: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 1.2, color: color.t3 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: color.line,
    },
    rowName: { fontFamily: font.uiMedium, fontSize: 15, color: color.t1 },
    rowMeta: { fontFamily: font.num, fontSize: 9.5, letterSpacing: 0.6, color: color.t3, marginTop: 5 },
    rowCount: { fontFamily: font.numSemibold, fontSize: 12, color: color.t2 },
    rowStart: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.acc },

    ctaRow: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
    cta: {
      flex: 1,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: color.line2,
      borderRadius: radius.ctl + 1,
    },
    ctaDashed: { borderStyle: 'dashed' },
    ctaAcc: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t2 },
    ctaDim: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t3 },

    // FAB — the design's green-glass circle beside the tab pill. On iOS 26 a GlassView
    // tinted with the accent (moss on light, LED lime on dark) fills it; older OSes fall
    // back to the semantic CTA tokens (never an accent fill on dark — hard rule).
    fab: {
      position: 'absolute',
      right: 14,
      bottom: FAB_BOTTOM,
      zIndex: 8,
      width: 62,
      height: 62,
      borderRadius: 31,
      ...shadow.cta,
    },
    fabSolid: { backgroundColor: color.ctaBg, borderWidth: 1, borderColor: color.ctaBorder },
    fabGlassWrap: {}, // glass surface is the GlassView child below; wrapper stays transparent for the shadow
    fabGlass: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 31 },
    fabPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    glyph: { width: 22, height: 22 },
    glyphH: { position: 'absolute', top: 10, left: 0, width: 22, height: 2.5, borderRadius: 2 },
    glyphV: { position: 'absolute', left: 10, top: 0, width: 2.5, height: 22, borderRadius: 2 },
  });
