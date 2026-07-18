import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { useWorkout } from '@/data/hooks';

/** Read-only view of a past workout: all exercises and sets. */
export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);

  if (workout.isLoading) return <Loading />;
  if (workout.error != null) return <ErrorText error={workout.error} />;
  if (!workout.data) return <Empty text="Workout not found." />;

  const detail = workout.data;
  const started = new Date(detail.started_at);
  const ended = detail.ended_at ? new Date(detail.ended_at) : null;
  const durationMin = ended
    ? Math.round((ended.getTime() - started.getTime()) / 60000)
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {started.toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </Text>
      <Text style={styles.meta}>
        {detail.routine_name ?? 'Empty workout'}
        {durationMin != null ? ` · ${durationMin} min` : ' · in progress'}
      </Text>
      {detail.notes ? <Text style={styles.notes}>{detail.notes}</Text> : null}

      {detail.exercises.length === 0 && <Empty text="No exercises in this workout." />}
      {detail.exercises.map((we) => (
        <View key={we.id} style={styles.block}>
          <Pressable onPress={() => router.push(`/exercise/${we.exercise_id}`)}>
            <Text style={styles.blockTitle}>{we.exercise.canonical_name} →</Text>
          </Pressable>
          {we.sets.map((set) => (
            <Text key={set.id} style={styles.setText}>
              #{set.set_number} {set.weight_kg ?? '—'} kg × {set.reps ?? '—'}
              {set.set_type !== 'normal' ? `  [${set.set_type}]` : ''}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 18, color: '#000' },
  meta: { fontSize: 13, color: '#666' },
  notes: { fontSize: 14, color: '#000', fontStyle: 'italic' },
  block: { borderWidth: 1, borderColor: '#ccc', padding: 10, gap: 4 },
  blockTitle: { fontSize: 16, color: '#000', marginBottom: 4 },
  setText: { color: '#000', fontSize: 15 },
});
