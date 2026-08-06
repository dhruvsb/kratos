// A thin status pill that floats over whatever screen is showing. Two jobs, both
// about trust: tell the user we know we're offline (their logging is being kept,
// not lost), and show a brief "syncing" beat when the connection returns and the
// queued writes flush. Purely informational — pointerEvents none, never blocks a tap.
import { useIsMutating } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '@/lib/network';
import { color, font, radius, space, tracking } from '@/theme/tokens';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const isOnline = useIsOnline();
  // Any mutation still in flight right after we come back online is the offline
  // queue draining. While offline, mutations are paused (not counted), so this
  // only lights up during the flush — not on every normal online write.
  const flushing = useIsMutating() > 0;

  const show = !isOnline || (isOnline && flushing);
  if (!show) return null;

  const offline = !isOnline;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + space.xs }]}>
      <View style={[styles.pill, offline ? styles.pillOffline : styles.pillSync]}>
        <View style={[styles.dot, offline ? styles.dotOffline : styles.dotSync]} />
        <Text style={styles.text}>
          {offline ? 'OFFLINE · CHANGES WILL SYNC' : 'SYNCING…'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: color.s1,
  },
  pillOffline: { borderColor: color.line2 },
  pillSync: { borderColor: color.acc35 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOffline: { backgroundColor: color.t3 },
  dotSync: { backgroundColor: color.acc },
  text: {
    fontFamily: font.uiSemibold,
    fontSize: 10,
    letterSpacing: tracking.wide,
    color: color.t2,
  },
});
