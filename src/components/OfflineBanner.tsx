// A thin status pill that floats over whatever screen is showing. Two jobs, both
// about trust: tell the user we know we're offline (their logging is being kept,
// not lost), and show a brief "syncing" beat when the connection returns and the
// queued writes flush. Purely informational — pointerEvents none, never blocks a tap.
import { useIsMutating } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '@/lib/network';
import { color, font, radius, space, tracking } from '@/theme/tokens';

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const isOnline = useIsOnline();
  const inFlight = useIsMutating();
  const paused = useIsMutating({ predicate: (m) => m.state.isPaused });

  // SYNCING must mean "draining the offline queue", not "a write is happening" —
  // otherwise every normal online ✓ would flash the pill. Latch it on the
  // offline→online transition (only if something is actually queued/running),
  // clear it once the queue is empty.
  const [draining, setDraining] = useState(false);
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      setDraining(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      if (paused > 0 || inFlight > 0) setDraining(true);
    }
  }, [isOnline, paused, inFlight]);
  useEffect(() => {
    if (draining && inFlight === 0 && paused === 0) setDraining(false);
  }, [draining, inFlight, paused]);

  const show = !isOnline || draining;
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
