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
import { useCreateCustomExercise, useExerciseSearch } from '@/data/hooks';
import type { Exercise } from '@/types/db';
import { Btn, Empty, ErrorText, Loading } from './ui';

/**
 * Searchable exercise picker (canonical names + aliases + fuzzy), with an
 * inline "create custom exercise" form when nothing matches.
 */
export function ExercisePickerModal({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [customMuscle, setCustomMuscle] = useState('');
  const [customEquipment, setCustomEquipment] = useState('');
  const search = useExerciseSearch(query);
  const createCustom = useCreateCustomExercise();

  function pick(exercise: Exercise) {
    setQuery('');
    setCreating(false);
    onPick(exercise);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Pick exercise</Text>
          <Btn small title="Close" onPress={onClose} />
        </View>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setCreating(false);
          }}
          placeholder="Search (e.g. RDL, incline db…)"
          placeholderTextColor="#999"
          autoFocus
        />
        {search.isLoading && <Loading />}
        {search.error != null && <ErrorText error={search.error} />}
        <FlatList
          data={search.data ?? []}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => pick(item)}>
              <Text style={styles.rowName}>
                {item.canonical_name}
                {item.is_custom ? ' (custom)' : ''}
              </Text>
              <Text style={styles.rowMeta}>
                {[item.primary_muscle, item.equipment].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            !search.isLoading ? <Empty text="No matching exercises." /> : null
          }
        />
        {query.trim().length > 1 && (
          <View style={styles.createBox}>
            {creating ? (
              <>
                <Text style={styles.createLabel}>New custom exercise: “{query.trim()}”</Text>
                <TextInput
                  style={styles.input}
                  value={customMuscle}
                  onChangeText={setCustomMuscle}
                  placeholder="Muscle group (optional)"
                  placeholderTextColor="#999"
                />
                <TextInput
                  style={styles.input}
                  value={customEquipment}
                  onChangeText={setCustomEquipment}
                  placeholder="Equipment (optional)"
                  placeholderTextColor="#999"
                />
                <Btn
                  title={createCustom.isPending ? 'Creating…' : 'Create'}
                  disabled={createCustom.isPending}
                  onPress={() =>
                    createCustom.mutate(
                      {
                        name: query,
                        primary_muscle: customMuscle,
                        equipment: customEquipment,
                      },
                      { onSuccess: pick }
                    )
                  }
                />
                {createCustom.error != null && <ErrorText error={createCustom.error} />}
              </>
            ) : (
              <Btn
                title={`Create “${query.trim()}” as custom exercise`}
                onPress={() => setCreating(true)}
              />
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16, gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, color: '#000' },
  input: { borderWidth: 1, borderColor: '#000', padding: 10, fontSize: 16, color: '#000' },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  rowName: { fontSize: 16, color: '#000' },
  rowMeta: { fontSize: 12, color: '#666' },
  createBox: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ddd' },
  createLabel: { color: '#000' },
});
