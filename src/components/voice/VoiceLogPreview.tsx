// Screen 03B · PREVIEW · LOGGED WORKOUT (design "Voice Logging" 1a). The parsed sets
// grouped by exercise, PREV kept beside every value so a mis-heard number is obvious.
// Tap a value → it becomes an accent field with the keypad inline. Anything the model
// couldn't fill (e.g. how many sets) gets a warn border and ONE question, not a form.
// Confirm logs real sets into a live workout and opens it.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SetKeypad } from '@/components/workout/SetKeypad';
import { haptics } from '@/lib/haptics';
import { useProfile, useRoutines } from '@/data/hooks';
import { useCommitVoiceLog } from '@/data/useVoiceCommit';
import { setVoiceDraft } from '@/data/voiceDraft';
import type { ParsedLogExercise, ParsedSet, VoiceParseResult } from '@/data/voiceParse';
import type { Unit } from '@/types/db';
import { formatWeight } from '@/lib/units';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { userMessage } from '@/lib/errors';

type LogResult = Extract<VoiceParseResult, { kind: 'log' }>;
type EditTarget = { exKey: string; setKey: string };

let setKeySeq = 0;
const nextSetKey = () => `vs${++setKeySeq}`;

export function VoiceLogPreview({ result }: { result: LogResult }) {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const routines = useRoutines();
  const unit: Unit = profile.data?.default_unit ?? 'kg';
  const commit = useCommitVoiceLog();

  const [exercises, setExercises] = useState<ParsedLogExercise[]>(result.exercises);
  const [target, setTarget] = useState(result.target);
  const [edit, setEdit] = useState<EditTarget | null>(null);

  const totalSets = useMemo(
    () => exercises.reduce((n, e) => n + e.sets.length, 0),
    [exercises]
  );

  function updateSet(exKey: string, setKey: string, weightKg: number | null, reps: number) {
    setExercises((list) =>
      list.map((e) =>
        e.key === exKey
          ? { ...e, sets: e.sets.map((s) => (s.key === setKey ? { ...s, weightKg, reps } : s)) }
          : e
      )
    );
  }

  // Answer the "how many sets?" question: expand the single parsed set to `count`.
  function chooseSetCount(exKey: string, count: number) {
    haptics.tick();
    setExercises((list) =>
      list.map((e) => {
        if (e.key !== exKey) return e;
        const template = e.sets[0];
        const sets: ParsedSet[] = Array.from({ length: count }, (_, i) =>
          i < e.sets.length ? e.sets[i] : { ...template, key: nextSetKey() }
        );
        return { ...e, sets, missingSets: false };
      })
    );
  }

  function changeTarget() {
    const list = routines.data ?? [];
    haptics.tick();
    const buttons: Parameters<typeof Alert.alert>[2] = list.slice(0, 6).map((r) => ({
      text: r.name,
      onPress: () => setTarget({ routineId: r.id, routineName: r.name }),
    }));
    buttons.push({
      text: 'Standalone workout',
      onPress: () => setTarget({ routineId: null, routineName: null }),
    });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Log into…', undefined, buttons);
  }

  function logAll() {
    if (totalSets === 0) {
      Alert.alert('Nothing to log', 'This parse has no sets.');
      return;
    }
    haptics.success();
    commit.mutate(
      { ...result, target, exercises },
      {
        onSuccess: ({ workoutId }) => {
          setVoiceDraft(null);
          router.replace(`/workout/${workoutId}`);
        },
        onError: (e) => Alert.alert("Couldn't log workout", userMessage(e, 'Something went wrong. Check your connection and try again.')),
      }
    );
  }

  function discard() {
    setVoiceDraft(null);
    router.replace('/');
  }

  const editingEx = edit ? exercises.find((e) => e.key === edit.exKey) : null;
  const editingSet = editingEx?.sets.find((s) => s.key === edit?.setKey) ?? null;
  const editingIndex = editingEx && editingSet ? editingEx.sets.indexOf(editingSet) : -1;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <View style={styles.head}>
        <View style={styles.recRow}>
          <View style={styles.dot} />
          <Text style={styles.heard}>HEARD · {totalSets} SETS</Text>
        </View>
        <Text style={styles.conf}>CONFIDENCE {Math.round(result.confidence * 100)}%</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.quote}>
          <Text style={styles.quoteText}>{result.transcript}</Text>
        </View>

        <View style={styles.targetRow}>
          <View>
            <Text style={styles.fieldLabel}>{target.routineName ? 'INTO ROUTINE' : 'WORKOUT'}</Text>
            <Text style={styles.targetName}>{target.routineName ?? 'Standalone workout'}</Text>
          </View>
          <Pressable onPress={changeTarget} hitSlop={8}>
            <Text style={styles.change}>CHANGE</Text>
          </Pressable>
        </View>

        {exercises.map((e) => (
          <View key={e.key} style={[styles.card, e.missingSets && styles.cardWarn]}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>{e.name}</Text>
              <Text style={[styles.cardSets, e.missingSets && { color: color.warn }]}>
                {e.missingSets ? 'SETS?' : `${e.sets.length} SET${e.sets.length === 1 ? '' : 'S'}`}
              </Text>
            </View>

            <View style={styles.gridHead}>
              <Text style={[styles.gh, styles.cNum]}>#</Text>
              <Text style={[styles.gh, styles.cPrev]}>PREV</Text>
              <Text style={[styles.gh, styles.cField]}>{unit.toUpperCase()}</Text>
              <Text style={[styles.gh, styles.cField]}>REPS</Text>
            </View>

            {e.sets.map((s, i) => (
              <View key={s.key} style={styles.setRow}>
                <Text style={[styles.rNum, styles.cNum]}>{i + 1}</Text>
                <Text style={[styles.rPrev, styles.cPrev]}>{s.prev ?? '—'}</Text>
                <Pressable
                  style={styles.cField}
                  onPress={() => setEdit({ exKey: e.key, setKey: s.key })}
                >
                  <Text style={styles.valUnderline}>{formatWeight(s.weightKg, unit)}</Text>
                </Pressable>
                <Pressable
                  style={styles.cField}
                  onPress={() => setEdit({ exKey: e.key, setKey: s.key })}
                >
                  <Text style={styles.valUnderline}>{s.reps ?? '—'}</Text>
                </Pressable>
              </View>
            ))}

            {e.missingSets && (
              <View style={styles.askRow}>
                <Text style={styles.askText}>how many sets?</Text>
                <View style={styles.askChips}>
                  {(e.setCountChoices ?? [2, 3, 4]).map((c) => (
                    <Pressable key={c} style={styles.askChip} onPress={() => chooseSetCount(e.key, c)}>
                      <Text style={styles.askChipText}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <Pressable style={styles.logBtn} onPress={logAll} disabled={commit.isPending}>
          <Text style={styles.logText}>
            {commit.isPending ? 'Logging…' : `Log ${totalSets} sets & open workout`}
          </Text>
        </Pressable>
        <View style={styles.subActions}>
          <Pressable style={styles.subBtn} onPress={() => router.replace('/voice/record')}>
            <Text style={styles.subText}>ADD MORE BY VOICE</Text>
          </Pressable>
          <Pressable style={styles.subBtn} onPress={discard}>
            <Text style={[styles.subText, { color: color.t3 }]}>DISCARD</Text>
          </Pressable>
        </View>
      </View>

      {edit && editingEx && editingSet && (
        <SetKeypad
          visible
          // Voice logging (Phase 2) is weight_reps-only for now.
          modality="weight_reps"
          mode="edit"
          exerciseName={editingEx.name}
          setNumber={editingIndex + 1}
          unit={unit}
          initialKg={editingSet.weightKg}
          initialReps={editingSet.reps}
          onLog={({ weightKg, reps }) => {
            updateSet(edit.exKey, edit.setKey, weightKg, reps ?? 0);
            setEdit(null);
          }}
          onClose={() => setEdit(null)}
        />
      )}
    </View>
  );
}

const makeStyles = (color: Theme['color'], shadow: Theme['shadow']) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.xxl },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    recRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.acc },
    heard: { fontFamily: font.numSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.acc },
    conf: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.t3 },

    body: { paddingTop: space.lg, paddingBottom: space.xl, gap: 16 },
    quote: { borderLeftWidth: 2, borderLeftColor: color.acc35, paddingLeft: 13, paddingVertical: 2 },
    quoteText: { fontFamily: font.num, fontSize: 12.5, lineHeight: 21, color: color.t2 },

    targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fieldLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
    targetName: { fontFamily: font.uiSemibold, fontSize: 19, color: color.t1, marginTop: 7 },
    change: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.acc },

    card: {
      borderWidth: 1,
      borderColor: color.line2,
      borderRadius: radius.card - 4,
      backgroundColor: color.sin,
      overflow: 'hidden',
    },
    cardWarn: { borderColor: color.warn },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: 13,
      paddingBottom: 11,
      borderBottomWidth: 1,
      borderBottomColor: color.line,
    },
    cardTitle: { fontFamily: font.uiSemibold, fontSize: 14, color: color.t1 },
    cardSets: { fontFamily: font.numMedium, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },

    gridHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 5 },
    gh: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
    cNum: { width: 18 },
    cPrev: { width: 58 },
    cField: { flex: 1, alignItems: 'center' },

    setRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderTopWidth: 1,
      borderTopColor: color.line,
    },
    rNum: { fontFamily: font.numSemibold, fontSize: 10, color: color.t3 },
    rPrev: { fontFamily: font.numSemibold, fontSize: 10, color: color.t3 },
    valUnderline: {
      fontFamily: font.numBold,
      fontSize: 17,
      color: color.t1,
      borderBottomWidth: 1,
      borderBottomColor: color.acc35,
      borderStyle: 'dashed',
      paddingHorizontal: 8,
      paddingBottom: 2,
    },

    askRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderTopColor: color.line,
    },
    askText: { fontFamily: font.num, fontSize: 11, color: color.t2 },
    askChips: { flexDirection: 'row', gap: 6 },
    askChip: {
      width: 34,
      height: 32,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: color.line2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    askChipText: { fontFamily: font.numSemibold, fontSize: 13, color: color.t1 },

    footer: { paddingTop: space.sm, gap: 11 },
    logBtn: {
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color.ctaBg,
      borderWidth: 1,
      borderColor: color.ctaBorder,
      ...shadow.cta,
    },
    logText: { fontFamily: font.uiSemibold, fontSize: 16, letterSpacing: -0.2, color: color.ctaFg },
    subActions: { flexDirection: 'row', gap: 10 },
    subBtn: {
      flex: 1,
      height: 46,
      borderWidth: 1,
      borderColor: color.line2,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subText: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t2 },
  });
