// Exercise picker (mockup 03) — a dark search sheet shared by the routine editor
// and mid-workout. Canonical names + aliases + fuzzy match, with an inline
// "create custom exercise" when nothing fits. RECENT/muscle filter tabs are
// deferred until usage data backs them (tracked in docs).
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateCustomExercise, useExerciseSearch } from '@/data/hooks';
import type { Exercise } from '@/types/db';
import { color, font, radius, space, tracking } from '@/theme/tokens';

export function ExercisePickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [customMuscle, setCustomMuscle] = useState('');
  const [customEquipment, setCustomEquipment] = useState('');
  const search = useExerciseSearch(query);
  const createCustom = useCreateCustomExercise();

  function pick(exercise: Exercise) {
    setQuery('');
    setCreating(false);
    setCustomMuscle('');
    setCustomEquipment('');
    onPick(exercise);
  }

  const results = search.data ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
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
          />
          <Text style={styles.count}>
            {results.length} {query.trim() ? 'MATCH' + (results.length === 1 ? '' : 'ES') : ''}
          </Text>
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: space.md }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => pick(item)}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.canonical_name}
              </Text>
              <Text style={styles.rowMeta}>
                {item.is_custom
                  ? 'CUSTOM'
                  : [item.primary_muscles?.[0], item.equipment].filter(Boolean).join(' · ').toUpperCase()}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            search.isLoading ? (
              <Text style={styles.hint}>SEARCHING…</Text>
            ) : query.trim() ? (
              <Text style={styles.hint}>No matches — create it below.</Text>
            ) : (
              <Text style={styles.hint}>Type to search exercises.</Text>
            )
          }
        />

        {query.trim().length > 1 && (
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
                      { onSuccess: pick }
                    )
                  }
                >
                  <Text style={styles.createBtnText}>
                    {createCustom.isPending ? 'CREATING…' : 'CREATE EXERCISE'}
                  </Text>
                </Pressable>
                {createCustom.error != null && (
                  <Text style={styles.err}>{(createCustom.error as Error).message}</Text>
                )}
              </>
            ) : (
              <Pressable onPress={() => setCreating(true)}>
                <Text style={styles.createLink}>+ create “{query.trim()}” as custom exercise</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,9,0.66)' },
  sheet: {
    height: '86%',
    backgroundColor: color.s1,
    borderTopWidth: 1,
    borderTopColor: color.line2,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.xl,
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

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.line },
  rowName: { fontFamily: font.uiSemibold, fontSize: 13.5, color: color.t1, flex: 1 },
  rowMeta: { fontFamily: font.num, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  hint: { fontFamily: font.num, fontSize: 12, color: color.t3, paddingVertical: space.lg },

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
    backgroundColor: color.s2,
    borderWidth: 1,
    borderColor: color.acc35,
    borderRadius: radius.ctl,
  },
  createBtnText: { fontFamily: font.uiSemibold, fontSize: 11, letterSpacing: tracking.label, color: color.acc },
  err: { fontFamily: font.num, fontSize: 11, color: color.warn },
});
