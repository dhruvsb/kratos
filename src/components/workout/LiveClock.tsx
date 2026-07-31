// Self-contained ticking clock. The 1-second interval lives HERE, in a leaf
// component, so each tick re-renders one <Text> — previously Home and the whole
// set grid re-rendered every second while a workout was running.
import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

/** Re-render on a timer. Pass `running: false` to freeze (interval torn down). */
export function useNowTick(intervalMs: number, running = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now()); // re-sync immediately when (re)starting
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, running]);
  return now;
}

// 'mmss' = total-minutes:seconds (the grid header, matches old fmtClock);
// 'hmmss' = h:mm:ss above an hour, m:ss below (Home resume, old fmtDuration).
function fmtElapsed(ms: number, format: 'mmss' | 'hmmss'): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const sec = (s % 60).toString().padStart(2, '0');
  if (format === 'mmss') return `${Math.floor(s / 60)}:${sec}`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function ElapsedClock({
  startedAt,
  endedAt,
  format,
  style,
}: {
  startedAt: string;
  /** When set, the clock freezes at the finished duration and stops ticking. */
  endedAt?: string | null;
  format: 'mmss' | 'hmmss';
  style?: StyleProp<TextStyle>;
}) {
  const running = endedAt == null;
  const now = useNowTick(1000, running);
  const end = endedAt != null ? new Date(endedAt).getTime() : now;
  return <Text style={style}>{fmtElapsed(end - new Date(startedAt).getTime(), format)}</Text>;
}
