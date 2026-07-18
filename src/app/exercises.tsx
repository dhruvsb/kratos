import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { useExerciseSearch } from '@/data/hooks';

/** Browse/search the library; tap an exercise for its full history. */
export default function ExerciseLibraryScreen() {
  const [query, setQuery] = useState('');
  const search = useExerciseSearch(query);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={search.data ?? []}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises…"
            placeholderTextColor="#999"
          />
          {search.isLoading && <Loading />}
          {search.error != null && <ErrorText error={search.error} />}
        </>
      }
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => router.push(`/exercise/${item.id}`)}>
          <Text style={styles.rowName}>
            {item.canonical_name}
            {item.is_custom ? ' (custom)' : ''}
          </Text>
          <Text style={styles.rowMeta}>
            {[item.primary_muscle, item.equipment].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={!search.isLoading ? <Empty text="No exercises found." /> : null}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    fontSize: 16,
    color: '#000',
    marginBottom: 8,
  },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  rowName: { fontSize: 16, color: '#000' },
  rowMeta: { fontSize: 12, color: '#666' },
});
