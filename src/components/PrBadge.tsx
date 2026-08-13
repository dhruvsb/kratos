// PR "records" badge — the "Medal" glyph (decision 2a): a ribbon + disc, a literal
// award that reads as distinct from every other accent element in the app. Shared by
// Home's history rows, the Workout-detail PR banner, and per-exercise PR marks so the
// medal means the same thing everywhere. Accent tokens only (never a hardcoded hex).
import { useMemo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { font, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** Bare medal glyph — two angled ribbon tails over a disc ring. */
export function Medal({ size = 13, color }: { size?: number; color: string }) {
  // viewBox is 24×28 (taller than wide — the ribbons rise above the disc).
  const h = (size / 24) * 28;
  return (
    <Svg width={size} height={h} viewBox="0 0 24 28" fill="none">
      <Rect x={8.2} y={1} width={3.4} height={11} rx={1.6} fill={color} transform="rotate(-18 9.9 6.5)" />
      <Rect x={12.4} y={1} width={3.4} height={11} rx={1.6} fill={color} transform="rotate(18 14.1 6.5)" />
      <Circle cx={12} cy={18.5} r={6.4} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

/** The count chip used on list rows: medal + count on a faint accent well. */
export function PrBadge({ count, size = 13 }: { count: number; size?: number }) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  return (
    <View style={styles.chip}>
      <Medal size={size} color={color.acc} />
      <Text style={styles.num}>{count}</Text>
    </View>
  );
}

/** A prominent banner row: medal + "{n} personal records" + a trailing slot (volume). */
export function PrBanner({ count, right }: { count: number; right?: React.ReactNode }) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  return (
    <View style={styles.banner}>
      <Medal size={17} color={color.acc} />
      <Text style={styles.bannerText}>
        {count} personal record{count === 1 ? '' : 's'}
      </Text>
      {right ? <View style={styles.bannerRight}>{right}</View> : null}
    </View>
  );
}

const makeStyles = (color: Theme['color']) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: 28,
      paddingHorizontal: 11,
      borderRadius: 14,
      backgroundColor: color.acc14,
    } as ViewStyle,
    num: { fontFamily: font.numSemibold, fontSize: 13, color: color.acc },

    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 16,
      paddingHorizontal: 18,
      borderRadius: 16,
      backgroundColor: color.acc07,
      borderWidth: 1,
      borderColor: color.acc35,
    },
    bannerText: { fontFamily: font.uiSemibold, fontSize: 15, color: color.acc },
    bannerRight: { marginLeft: 'auto' },
  });
