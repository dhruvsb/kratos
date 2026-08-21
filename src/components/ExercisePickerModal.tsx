// Exercise picker (mockup 03) — a dark search sheet shared by the routine editor
// and mid-workout. Canonical names + aliases + fuzzy match, with an inline
// "create custom exercise" when nothing fits. A body-region chip row narrows the
// list by muscle group (all BODY_REGIONS from the exercise metadata); it composes
// with search — with a query typed, it filters the ranked matches.
//
// Two selection modes:
//  - single (default): tapping a row picks it immediately via `onPick` — used
//    mid-workout, where you add one exercise at a time.
//  - multi (`multiSelect`, routine editor): tapping toggles a checkmark, search
//    and region persist so you keep browsing, and an "ADD (n)" bar commits the
//    whole batch via `onPickMany` (feedback #18).
import { useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCreateCustomExercise,
  useExerciseDirectory,
  useExerciseSearch,
} from '@/data/hooks';
import { filterExercisesLocally } from '@/data/exercises';
import { useIsOnline } from '@/lib/network';
import { BODY_REGIONS, type BodyRegion } from '@/lib/muscles';
import type { Exercise } from '@/types/db';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import { userMessage } from '@/lib/errors';

export function ExercisePickerModal({
  visible,
  onClose,
  onPick,
  multiSelect = false,
  onPickMany,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  // When true, rows toggle a selection instead of picking immediately, and the
  // batch is returned via onPickMany. Falls back to single-pick when omitted, so
  // the mid-workout call site needs no changes.
  multiSelect?: boolean;
  onPickMany?: (exercises: Exercise[]) => void;
}) {
  const { color, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(color, shadow), [color, shadow]);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<BodyRegion | null>(null);
  const [creating, setCreating] = useState(false);
  const [customMuscle, setCustomMuscle] = useState('');
  const [customEquipment, setCustomEquipment] = useState('');
  const [selected, setSelected] = useState<Exercise[]>([]);
  const online = useIsOnline();
  // Online: server search (trigram + aliases). Offline: filter the cached, persisted
  // directory locally — same picker, no connection needed. The directory also warms
  // the offline path (it's loaded whenever the picker opens online, then persisted).
  const search = useExerciseSearch(query, region);
  const directory = useExerciseDirectory();
  const createCustom = useCreateCustomExercise();

  const results = online
    ? search.data ?? []
    : filterExercisesLocally(directory.data ?? [], query, region);
  const loading = online ? search.isLoading : directory.isLoading;

  function reset() {
    setQuery('');
    setRegion(null);
    setCreating(false);
    setCustomMuscle('');
    setCustomEquipment('');
    setSelected([]);
  }

  // Single-select: pick immediately and close (parent closes on onPick).
  function pick(exercise: Exercise) {
    reset();
    onPick(exercise);
  }

  const isSelected = (id: string) => selected.some((e) => e.id === id);

  // Multi-select: toggle membership, keeping search/region so the user keeps browsing.
  function toggle(exercise: Exercise) {
    setSelected((prev) =>
      prev.some((e) => e.id === exercise.id)
        ? prev.filter((e) => e.id !== exercise.id)
        : [...prev, exercise]
    );
  }

  function onRowPress(exercise: Exercise) {
    if (multiSelect) toggle(exercise);
    else pick(exercise);
  }

  function commitMany() {
    const chosen = selected;
    reset();
    onPickMany?.(chosen);
  }

  // A freshly created custom exercise: adds to the batch in multi mode (stay open
  // to keep adding), or picks-and-closes in single mode.
  function onCreated(exercise: Exercise) {
    if (multiSelect) {
      setSelected((prev) => (prev.some((e) => e.id === exercise.id) ? prev : [...prev, exercise]));
      setQuery('');
      setCreating(false);
      setCustomMuscle('');
      setCustomEquipment('');
    } else {
      pick(exercise);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.handle} />

        <View style={styles.searchRow}>
          <Text style={styles.slash}>/</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setCreating(false);
            }}
            placeholder="search — RDL, incline db…"
            placeholderTextColor={color.t3}
            selectionColor={color.acc}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
          />
          <Text style={styles.count}>
            {results.length} {query.trim() ? 'MATCH' + (results.length === 1 ? '' : 'ES') : ''}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.chipRow}
          contentContainerStyle={styles.chipRowContent}
        >
          {BODY_REGIONS.map((r) => {
            const active = region === r;
            return (
              <Pressable
                key={r}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setRegion(active ? null : r)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {r.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: space.md }}
          renderItem={({ item }) => {
            const sel = multiSelect && isSelected(item.id);
            return (
              <Pressable style={styles.row} onPress={() => onRowPress(item)}>
                {multiSelect && (
                  <View style={[styles.check, sel && styles.checkOn]}>
                    {sel && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                )}
                <Text style={[styles.rowName, sel && styles.rowNameOn]} numberOfLines={1}>
                  {item.canonical_name}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.is_custom
                    ? 'CUSTOM'
                    : [item.primary_muscles?.[0], item.equipment].filter(Boolean).join(' · ').toUpperCase()}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            loading ? (
              <Text style={styles.hint}>SEARCHING…</Text>
            ) : query.trim() ? (
              <Text style={styles.hint}>
                {online ? 'No matches — create it below.' : 'No matches in your saved exercises.'}
              </Text>
            ) : region ? (
              <Text style={styles.hint}>No {region.toLowerCase()} exercises.</Text>
            ) : (
              <Text style={styles.hint}>Type to search, or pick a muscle group.</Text>
            )
          }
        />

        {query.trim().length > 1 && !online && (
          <View style={styles.createBox}>
            <Text style={styles.hint}>Reconnect to add “{query.trim()}” as a custom exercise.</Text>
          </View>
        )}

        {query.trim().length > 1 && online && (
          <View style={styles.createBox}>
            {creating ? (
              <>
                <Text style={styles.createLabel}>NEW CUSTOM · “{query.trim()}”</Text>
                <TextInput
                  style={styles.customInput}
                  value={customMuscle}
                  onChangeText={setCustomMuscle}
                  placeholder="muscle group (optional)"
                  placeholderTextColor={color.t3}
                  selectionColor={color.acc}
                />
                <TextInput
                  style={styles.customInput}
                  value={customEquipment}
                  onChangeText={setCustomEquipment}
                  placeholder="equipment (optional)"
                  placeholderTextColor={color.t3}
                  selectionColor={color.acc}
                />
                <Pressable
                  style={styles.createBtn}
                  disabled={createCustom.isPending}
                  onPress={() =>
                    createCustom.mutate(
                      { name: query, primary_muscle: customMuscle, equipment: customEquipment },
                      { onSuccess: onCreated }
                    )
                  }
                >
                  <Text style={styles.createBtnText}>
                    {createCustom.isPending ? 'CREATING…' : 'CREATE EXERCISE'}
                  </Text>
                </Pressable>
                {createCustom.error != null && (
                  <Text style={styles.err}>
                    {userMessage(createCustom.error, 'That exercise couldn’t be created. Try again.')}
                  </Text>
                )}
              </>
            ) : (
              <Pressable onPress={() => setCreating(true)}>
                <Text style={styles.createLink}>+ create “{query.trim()}” as custom exercise</Text>
              </Pressable>
            )}
          </View>
        )}

        {multiSelect && selected.length > 0 && (
          <Pressable style={styles.addBar} onPress={commitMany}>
            <Text style={styles.addBarText}>
              ADD {selected.length} EXERCISE{selected.length === 1 ? '' : 'S'}
            </Text>
          </Pressable>
        )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (color: Theme['color'], shadow: Theme['shadow']) => StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,9,0.66)' },
  sheet: {
    height: '86%',
    backgroundColor: color.s1,
    borderTopWidth: 1,
    borderTopColor: color.line2,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.xxl,
    paddingTop: space.md,
  },
  handle: { width: 34, height: 3, borderRadius: 2, backgroundColor: color.line2, alignSelf: 'center', marginBottom: space.lg },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.acc35,
  },
  slash: { fontFamily: font.numSemibold, fontSize: 13, color: color.acc },
  input: { flex: 1, fontFamily: font.numMedium, fontSize: 15, color: color.t1, padding: 0 },
  count: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.6, color: color.t3 },

  chipRow: { flexGrow: 0, marginTop: space.md, marginHorizontal: -space.xl },
  chipRowContent: { gap: space.sm, paddingHorizontal: space.xxl },
  chip: {
    paddingHorizontal: space.md,
    height: 30,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line2,
    backgroundColor: color.s0,
  },
  chipActive: { borderColor: color.acc35, backgroundColor: color.acc07 },
  chipText: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },
  chipTextActive: { color: color.acc },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.line },
  rowName: { fontFamily: font.uiMedium, fontSize: 13.5, color: color.t1, flex: 1 },
  rowNameOn: { color: color.acc },
  rowMeta: { fontFamily: font.num, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  hint: { fontFamily: font.num, fontSize: 12, color: color.t3, paddingVertical: space.lg },

  check: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: color.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: color.acc35, backgroundColor: color.acc07 },
  checkMark: { fontFamily: font.numSemibold, fontSize: 11, color: color.acc, lineHeight: 13 },

  addBar: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ctaBg,
    borderWidth: 1,
    borderColor: color.ctaBorder,
    borderRadius: radius.ctl,
    marginTop: space.md,
    ...shadow.cta,
  },
  addBarText: { fontFamily: font.uiMedium, fontSize: 11, letterSpacing: tracking.label, color: color.ctaFg },

  createBox: { gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.line },
  createLink: { fontFamily: font.numMedium, fontSize: 12, color: color.acc, paddingVertical: 4 },
  createLabel: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: tracking.label, color: color.t2 },
  customInput: {
    fontFamily: font.num,
    fontSize: 13,
    color: color.t1,
    borderWidth: 1,
    borderColor: color.line2,
    borderRadius: radius.key,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  createBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ctaBg,
    borderWidth: 1,
    borderColor: color.ctaBorder,
    borderRadius: radius.ctl,
  },
  createBtnText: { fontFamily: font.uiMedium, fontSize: 11, letterSpacing: tracking.label, color: color.ctaFg },
  err: { fontFamily: font.num, fontSize: 11, color: color.warn },
});
