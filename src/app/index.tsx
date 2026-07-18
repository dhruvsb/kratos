import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Btn, Empty, ErrorText, Loading } from '@/components/ui';
import { signOut } from '@/data/auth';
import { useActiveWorkout, useRoutines, useStartWorkout } from '@/data/hooks';

export default function HomeScreen() {
  const routines = useRoutines();
  const activeWorkout = useActiveWorkout();
  const startWorkout = useStartWorkout();

  function start(routineId?: string) {
    startWorkout.mutate(routineId, {
      onSuccess: (workout) => router.push(`/workout/${workout.id}`),
    });
  }

  return (
    <View style={styles.container}>
      {activeWorkout.data && (
        <Btn
          title="▶ Resume workout in progress"
          onPress={() => router.push(`/workout/${activeWorkout.data!.id}`)}
        />
      )}

      <View style={styles.actions}>
        <Btn
          title={startWorkout.isPending ? 'Starting…' : 'Start empty workout'}
          disabled={startWorkout.isPending || !!activeWorkout.data}
          onPress={() => start()}
        />
        <Btn title="New routine" onPress={() => router.push('/routine/new')} />
      </View>
      {startWorkout.error != null && <ErrorText error={startWorkout.error} />}

      <Text style={styles.sectionTitle}>Routines</Text>
      {routines.isLoading && <Loading />}
      {routines.error != null && <ErrorText error={routines.error} />}
      <FlatList
        data={routines.data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.routineRow}>
            <View style={styles.routineInfo}>
              <Text style={styles.routineName}>{item.name}</Text>
              <Text style={styles.routineMeta}>
                {item.exercise_count} exercise{item.exercise_count === 1 ? '' : 's'}
              </Text>
            </View>
            <Btn
              small
              title="Start"
              disabled={!!activeWorkout.data || startWorkout.isPending}
              onPress={() => start(item.id)}
            />
            <Btn small title="Edit" onPress={() => router.push(`/routine/${item.id}`)} />
          </View>
        )}
        ListEmptyComponent={
          !routines.isLoading ? (
            <Empty text="No routines yet. Create one, or start an empty workout." />
          ) : null
        }
      />

      <View style={styles.footer}>
        <Btn title="History" onPress={() => router.push('/history')} />
        <Btn title="Exercise library" onPress={() => router.push('/exercises')} />
        <Btn small title="Voice telemetry (dev)" onPress={() => router.push('/dev/telemetry')} />
        <Btn title="Sign out" onPress={() => signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: '#fff' },
  actions: { gap: 8 },
  sectionTitle: { fontSize: 18, color: '#000', marginTop: 8 },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  routineInfo: { flex: 1 },
  routineName: { fontSize: 16, color: '#000' },
  routineMeta: { fontSize: 12, color: '#666' },
  footer: { gap: 8, paddingTop: 8 },
});
