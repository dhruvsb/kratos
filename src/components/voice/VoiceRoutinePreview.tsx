// Screen 03A · PREVIEW · NEW ROUTINE (design "Voice Logging" 1a). Reuses the
// routine editor's vocabulary — numbered rows, ↑ ↓ ✕, dashed add — over the parsed
// result. The one voice-specific element is the fuzzy-match note, shown only where
// the spoken phrase differed from the canonical name. Save writes a real routine.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExercisePickerModal } from '@/components/ExercisePickerModal';
import { haptics } from '@/lib/haptics';
import { useCommitVoiceRoutine } from '@/data/useVoiceCommit';
import { setVoiceDraft } from '@/data/voiceDraft';
import type { ParsedRoutineExercise, VoiceParseResult } from '@/data/voiceParse';
import type { Exercise } from '@/types/db';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { userMessage } from '@/lib/errors';

type RoutineResult = Extract<VoiceParseResult, { kind: 'routine' }>;

function metaLabel(muscle: string | null, equipment: string | null): string {
  return [muscle, equipment].filter(Boolean).join(' · ').toUpperCase();
}

function fromExercise(ex: Exercise, key: string): ParsedRoutineExercise {
  return {
    key,
    exerciseId: ex.id,
    name: ex.canonical_name,
    raw: ex.canonical_name,
    muscle: ex.primary_muscles?.[0] ?? null,
    equipment: ex.equipment ?? null,
    matchNote: null,
  };
}

export function VoiceRoutinePreview({ result }: { result: RoutineResult }) {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
  const insets = useSafeAreaInsets();
  const commit = useCommitVoiceRoutine();

  const [name, setName] = useState(result.routine.name);
  const [exercises, setExercises] = useState<ParsedRoutineExercise[]>(result.routine.exercises);
  // picker mode: 'add' appends, { replaceKey } swaps one row.
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'replace'; key: string }>(null);

  function move(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= exercises.length) return;
    haptics.tick();
    setExercises((list) => {
      const next = [...list];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }
  function remove(key: string) {
    haptics.warn();
    setExercises((list) => list.filter((e) => e.key !== key));
  }
  function onPick(ex: Exercise) {
    setExercises((list) => {
      if (picker?.mode === 'replace') {
        return list.map((e) => (e.key === picker.key ? fromExercise(ex, e.key) : e));
      }
      return [...list, fromExercise(ex, `p${Date.now()}`)];
    });
    setPicker(null);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name your routine', 'Give this routine a name before saving.');
      return;
    }
    if (exercises.filter((e) => e.exerciseId).length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise, or discard.');
      return;
    }
    haptics.success();
    commit.mutate(
      { ...result, routine: { name: trimmed, exercises } },
      {
        onSuccess: () => {
          setVoiceDraft(null);
          router.replace('/routines');
        },
        onError: (e) => Alert.alert("Couldn't save routine", userMessage(e, 'Something went wrong. Check your connection and try again.')),
      }
    );
  }

  function discard() {
    setVoiceDraft(null);
    router.replace('/');
  }

  const resolvedCount = exercises.filter((e) => e.exerciseId).length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <View style={styles.head}>
        <View style={styles.recRow}>
          <View style={styles.dot} />
          <Text style={styles.heard}>HEARD · NEW ROUTINE</Text>
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

        <Text style={styles.fieldLabel}>ROUTINE NAME</Text>
        <View style={styles.nameField}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Routine name"
            placeholderTextColor={color.t3}
            style={styles.nameInput}
            returnKeyType="done"
          />
        </View>

        <View style={styles.exHead}>
          <Text style={styles.fieldLabel}>EXERCISES · ORDER = WORKOUT ORDER</Text>
          <Text style={styles.exCount}>{resolvedCount}</Text>
        </View>

        {exercises.map((e, i) => (
          <View key={e.key} style={styles.exRow}>
            <Text style={styles.exNum}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.exName}>{e.name}</Text>
              <Text style={styles.exMeta}>{metaLabel(e.muscle, e.equipment) || 'UNMATCHED'}</Text>
              {e.matchNote && (
                <Pressable
                  style={styles.noteBox}
                  onPress={() => setPicker({ mode: 'replace', key: e.key })}
                >
                  <Text style={styles.noteText}>{e.matchNote}</Text>
                  <Text style={styles.noteChange}>CHANGE</Text>
                </Pressable>
              )}
              {!e.exerciseId && (
                <Pressable
                  style={[styles.noteBox, styles.noteWarn]}
                  onPress={() => setPicker({ mode: 'replace', key: e.key })}
                >
                  <Text style={styles.noteText}>no match — pick one</Text>
                  <Text style={styles.noteChange}>CHANGE</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.exCtrls}>
              <Pressable onPress={() => move(i, -1)} hitSlop={8}>
                <Text style={styles.ctrl}>↑</Text>
              </Pressable>
              <Pressable onPress={() => move(i, 1)} hitSlop={8}>
                <Text style={styles.ctrl}>↓</Text>
              </Pressable>
              <Pressable onPress={() => remove(e.key)} hitSlop={8}>
                <Text style={[styles.ctrl, { color: color.warn }]}>✕</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable style={styles.addRow} onPress={() => setPicker({ mode: 'add' })}>
          <Text style={styles.addText}>+ ADD EXERCISE</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <Pressable style={styles.saveBtn} onPress={save} disabled={commit.isPending}>
          <Text style={styles.saveText}>{commit.isPending ? 'Saving…' : 'Save routine'}</Text>
        </Pressable>
        <View style={styles.subActions}>
          <Pressable style={styles.subBtn} onPress={() => router.replace('/voice/record')}>
            <Text style={styles.subText}>RE-RECORD</Text>
          </Pressable>
          <Pressable style={styles.subBtn} onPress={discard}>
            <Text style={[styles.subText, { color: color.t3 }]}>DISCARD</Text>
          </Pressable>
        </View>
      </View>

      <ExercisePickerModal
        visible={picker != null}
        onClose={() => setPicker(null)}
        onPick={onPick}
      />
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

    body: { paddingTop: space.xl, paddingBottom: space.xl },
    quote: { borderLeftWidth: 2, borderLeftColor: color.acc35, paddingLeft: 13, paddingVertical: 2 },
    quoteText: { fontFamily: font.num, fontSize: 13, lineHeight: 22, color: color.t2 },

    fieldLabel: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
    nameField: {
      marginTop: 10,
      height: 54,
      borderWidth: 1,
      borderColor: color.acc,
      borderRadius: radius.ctl + 1,
      backgroundColor: color.sin,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    nameInput: { fontFamily: font.uiSemibold, fontSize: 19, color: color.t1, padding: 0 },

    exHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26 },
    exCount: { fontFamily: font.numMedium, fontSize: 11, color: color.t3 },

    exRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      paddingVertical: 17,
      borderTopWidth: 1,
      borderTopColor: color.line,
    },
    exNum: { width: 16, fontFamily: font.numSemibold, fontSize: 11, color: color.t3, marginTop: 2 },
    exName: { fontFamily: font.uiMedium, fontSize: 16, color: color.t1 },
    exMeta: { fontFamily: font.num, fontSize: 10, letterSpacing: 1, color: color.t3, marginTop: 5 },
    exCtrls: { flexDirection: 'row', gap: 12, marginTop: 2 },
    ctrl: { fontFamily: font.num, fontSize: 14, color: color.t3 },

    noteBox: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      borderWidth: 1,
      borderColor: color.acc35,
      backgroundColor: color.acc07,
      borderRadius: radius.key,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    noteWarn: { borderColor: color.warn, backgroundColor: 'transparent' },
    noteText: { fontFamily: font.num, fontSize: 11, lineHeight: 17, color: color.t2, flexShrink: 1 },
    noteChange: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.acc },

    addRow: {
      marginTop: 16,
      height: 46,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: color.line2,
      borderRadius: radius.ctl + 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addText: { fontFamily: font.numSemibold, fontSize: 10.5, letterSpacing: tracking.label, color: color.t2 },

    footer: { paddingTop: space.md, gap: 12 },
    saveBtn: {
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: color.ctaBg,
      borderWidth: 1,
      borderColor: color.ctaBorder,
      ...shadow.cta,
    },
    saveText: { fontFamily: font.uiSemibold, fontSize: 16, letterSpacing: -0.2, color: color.ctaFg },
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
