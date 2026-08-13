// Muscle split — the refined single stacked bar: each body region a segment of one
// horizontal bar (accent, stepping down in opacity heaviest-first), with a legend of
// dot · "Region NN%" beneath. Answers "am I balanced?" at a glance. Presentational —
// it takes the already-computed shares (see lib/muscleSplit).
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { RegionShare } from '@/lib/muscleSplit';
import { font, space, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

// Segment / legend-dot tints, heaviest-first: solid accent, then two faded steps,
// repeating for any tail regions so a 4+-way split still reads.
const TINTS = ['acc', 'acc35', 'acc14', 'acc07'] as const;

export function MuscleSplit({ regions }: { regions: RegionShare[] }) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  if (regions.length === 0) return null;
  const tint = (i: number) => color[TINTS[Math.min(i, TINTS.length - 1)]];

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {regions.map((r, i) => (
          <View
            key={r.region}
            style={{ width: `${Math.max(3, r.fraction * 100)}%`, backgroundColor: tint(i) }}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {regions.map((r, i) => (
          <View key={r.region} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: tint(i) }]} />
            <Text style={styles.legendText}>
              {r.region} {Math.round(r.fraction * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  wrap: { gap: 10 },
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    gap: 2,
    backgroundColor: 'transparent',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, rowGap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { fontFamily: font.num, fontSize: 12, color: color.t2 },
});
