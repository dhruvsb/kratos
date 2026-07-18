import { useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { useExercise, useExerciseHistory } from '@/data/hooks';

/** Every past set of one exercise, grouped by workout date, newest first. */
export default function ExerciseHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = useExercise(id);
  const history = useExerciseHistory(id);
  const entries = (history.data?.pages ?? []).flat();

  if (exercise.isLoading || history.isLoading) return <Loading />;
  if (history.error != null) return <ErrorText error={history.error} />;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={entries}
      keyExtractor={(item) => item.workout_id}
      onEndReached={() => {
        if (history.hasNextPage && !history.isFetchingNextPage) history.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <Text style={styles.title}>{exercise.data?.canonical_name ?? ''}</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.block}>
          <Text style={styles.blockDate}>
            {new Date(item.started_at).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
          {item.sets.map((set) => (
            <Text key={set.id} style={styles.setText}>
              #{set.set_number} {set.weight_kg ?? '—'} kg × {set.reps ?? '—'}
              {set.set_type !== 'normal' ? `  [${set.set_type}]` : ''}
            </Text>
          ))}
        </View>
      )}
      ListEmptyComponent={<Empty text="Never performed. It's leg day somewhere." />}
      ListFooterComponent={
        history.isFetchingNextPage ? <Text style={styles.footer}>Loading more…</Text> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 18, color: '#000', marginBottom: 8 },
  block: { borderWidth: 1, borderColor: '#ccc', padding: 10, gap: 3, marginBottom: 8 },
  blockDate: { fontSize: 13, color: '#666', marginBottom: 4 },
  setText: { color: '#000', fontSize: 15 },
  footer: { color: '#666', padding: 12, textAlign: 'center' },
});
