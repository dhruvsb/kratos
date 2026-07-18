import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { useWorkoutList } from '@/data/hooks';

export default function HistoryScreen() {
  const list = useWorkoutList();
  const workouts = (list.data?.pages ?? []).flat();

  if (list.isLoading) return <Loading />;
  if (list.error != null) return <ErrorText error={list.error} />;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={workouts}
      keyExtractor={(item) => item.id}
      onEndReached={() => {
        if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => router.push(`/history/${item.id}`)}>
          <Text style={styles.rowTitle}>
            {new Date(item.started_at).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            {item.routine_name ? ` · ${item.routine_name}` : ''}
          </Text>
          <Text style={styles.rowMeta}>
            {item.exercise_count} exercises · {item.set_count} sets
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={<Empty text="No workouts yet. Go lift something." />}
      ListFooterComponent={
        list.isFetchingNextPage ? <Text style={styles.footer}>Loading more…</Text> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  rowTitle: { fontSize: 16, color: '#000' },
  rowMeta: { fontSize: 12, color: '#666' },
  footer: { color: '#666', padding: 12, textAlign: 'center' },
});
