// Exercise library (mockup 11) — search-first over the seeded names. Tapping a
// row goes to that exercise's progress, not a description.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorText } from '@/components/ui';
import { useExerciseSearch } from '@/data/hooks';
import { BODY_REGIONS, type BodyRegion } from '@/lib/muscles';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function ExerciseLibraryScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<BodyRegion | null>(null);
  const search = useExerciseSearch(query, region);
  const results = search.data ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← BACK</Text>
        </Pressable>
        <Text style={styles.count}>
          {query.trim() || region ? `${results.length} EXERCISES` : 'LIBRARY'}
        </Text>
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
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
        />
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
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{r.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {search.error != null && <ErrorText error={search.error} />}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
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
            {search.isLoading
              ? 'SEARCHING…'
              : query.trim()
                ? 'No matches.'
                : region
                  ? `No ${region.toLowerCase()} exercises.`
                  : 'Type to search, or pick a muscle group.'}
          </Text>
        }
      />
    </View>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space.xxl },
  back: { fontFamily: font.numSemibold, fontSize: 9.5, letterSpacing: tracking.label, color: color.t3 },
  count: { fontFamily: font.numSemibold, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  title: { fontFamily: font.uiSemibold, fontSize: 22, color: color.t1, paddingHorizontal: space.xxl, marginTop: space.md },

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

  chipRow: { flexGrow: 0, marginTop: space.md },
  chipRowContent: { gap: space.sm, paddingHorizontal: space.xxl, paddingVertical: space.xs },
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

  content: { paddingHorizontal: space.xxl, paddingBottom: space.xxl, paddingTop: space.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.line },
  rowName: { fontFamily: font.uiMedium, fontSize: 13.5, color: color.t1, flex: 1 },
  rowMeta: { fontFamily: font.num, fontSize: 9, letterSpacing: 0.6, color: color.t3 },
  hint: { fontFamily: font.num, fontSize: 12, color: color.t3, paddingTop: space.lg },
});
