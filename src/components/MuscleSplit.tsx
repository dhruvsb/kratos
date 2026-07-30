// Muscle split — a compact Hevy-style breakdown of the body regions a workout
// hit. Presentational: it takes the already-computed shares (see lib/muscleSplit)
// and renders a bar-per-region list (label · meter · %), heaviest first. On-theme
// LED look, monochrome — the design's accent is border/glow only, never a fill.
import { StyleSheet, Text, View } from 'react-native';
import type { RegionShare } from '@/lib/muscleSplit';
import { color, font, radius, space, tracking } from '@/theme/tokens';

export function MuscleSplit({ regions }: { regions: RegionShare[] }) {
  if (regions.length === 0) return null;
  const max = regions[0].fraction || 1; // scale bars to the leader for readable contrast

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>MUSCLE SPLIT</Text>
      {regions.map((r) => (
        <View key={r.region} style={styles.row}>
          <Text style={styles.label}>{r.region.toUpperCase()}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(4, (r.fraction / max) * 100)}%` }]} />
          </View>
          <Text style={styles.pct}>{Math.round(r.fraction * 100)}%</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  heading: {
    fontFamily: font.numSemibold,
    fontSize: 8,
    letterSpacing: tracking.wide,
    color: color.t3,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  label: {
    fontFamily: font.numSemibold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: color.t2,
    width: 62,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.sin,
    borderWidth: 1,
    borderColor: color.line,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: color.t2 },
  pct: {
    fontFamily: font.numBold,
    fontSize: 11,
    color: color.t1,
    width: 34,
    textAlign: 'right',
  },
});
