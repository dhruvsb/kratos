// Exercise library (mockup 11) — search-first over the seeded names. Tapping a
// row goes to that exercise's progress, not a description.
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorText } from '@/components/ui';
import { useExerciseSearch } from '@/data/hooks';
import { color, font, space, tracking } from '@/theme/tokens';

export default function ExerciseLibraryScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const search = useExerciseSearch(query);
  const results = search.data ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← BACK</Text>
        </Pressable>
        <Text style={styles.count}>{query.trim() ? `${results.length} MATCHES` : 'LIBRARY'}</Text>
      </View>
      <Text style={styles.title}>Library</Text>

      <View style={styles.searchRow}>
        <Text style={styles.slash}>/</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="search exercises…"
          placeholderTextColor={color.t3}
          selectionColor={color.acc}
          autoCorrect={false}
        />
      </View>

      {search.error != null && <ErrorText error={search.error} />}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/exercise/${item.id}`)}>
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
          <Text style={styles.hint}>
            {search.isLoading ? 'SEARCHING…' : query.trim() ? 'No matches.' : 'Type to search the exercise library.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space.xl },
  back: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },
  count: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  title: { fontFamily: font.uiBold, fontSize: 22, color: color.t1, paddingHorizontal: space.xl, marginTop: space.md },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.xl,
    marginTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.acc35,
  },
  slash: { fontFamily: font.numSemibold, fontSize: 13, color: color.acc },
  input: { flex: 1, fontFamily: font.numMedium, fontSize: 15, color: color.t1, padding: 0 },

  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.line },
  rowName: { fontFamily: font.uiSemibold, fontSize: 13.5, color: color.t1, flex: 1 },
  rowMeta: { fontFamily: font.num, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  hint: { fontFamily: font.num, fontSize: 12, color: color.t3, paddingTop: space.lg },
});
