// Floor-mode auto-entry (mockup 2c: "auto-enters via face-down→up gyro").
// Watches DeviceMotion; when the phone lies flat and still for `floorEnterMs`
// it fires onEnter, and when it's picked back up it fires onExit. The FLOOR
// MODE key is the manual override, so this hook is purely additive — if the
// sensor is unavailable (web / Expo Go), it silently does nothing.
import { useEffect, useRef } from 'react';
import { DeviceMotion } from 'expo-sensors';
import { timing } from '@/theme/tokens';

export function useFloorModeSensor({
  enabled,
  isFloor,
  onEnter,
  onExit,
}: {
  /** Only watch while a workout is active. */
  enabled: boolean;
  /** Whether the UI is currently in floor mode (so we know which edge to fire). */
  isFloor: boolean;
  onEnter: () => void;
  onExit: () => void;
}) {
  // Keep the latest callbacks/flags without re-subscribing the listener.
  const cbs = useRef({ isFloor, onEnter, onExit });
  cbs.current = { isFloor, onEnter, onExit };
  const flatSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const available = await DeviceMotion.isAvailableAsync().catch(() => false);
      if (!available || cancelled) return;
      DeviceMotion.setUpdateInterval(300);
      sub = DeviceMotion.addListener((m) => {
        const g = m.accelerationIncludingGravity;
        if (!g) return;
        const mag = Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0) || 1;
        // Fraction of gravity on the z-axis ≈ 1 when the phone lies flat.
        const flat = Math.abs((g.z ?? 0) / mag) >= timing.floorGyroThreshold;

        // Timestamps come from the sensor sample interval, not Date.now(), so
        // this stays deterministic and side-effect-free.
        const now = flatSinceRef.current == null ? 0 : flatSinceRef.current;

        if (flat) {
          if (flatSinceRef.current == null) {
            flatSinceRef.current = 0;
          } else {
            flatSinceRef.current = now + (m.interval ?? 300);
          }
          if (!cbs.current.isFloor && flatSinceRef.current >= timing.floorEnterMs) {
            cbs.current.onEnter();
          }
        } else {
          flatSinceRef.current = null;
          if (cbs.current.isFloor) cbs.current.onExit();
        }
      });
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      flatSinceRef.current = null;
    };
  }, [enabled]);
}
