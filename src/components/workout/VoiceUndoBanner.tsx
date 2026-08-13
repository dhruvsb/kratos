// Screen 04 · the "N SETS LOGGED FROM VOICE · UNDO" banner (design "Voice Logging"
// 1a). Shown at the top of the live workout right after a voice commit lands here.
// Self-contained: it reads the last-voice-commit marker and only renders when that
// marker belongs to this workout. UNDO deletes exactly the sets the commit created;
// otherwise it clears itself after the undo window so it never lingers.
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUndoVoiceSets } from '@/data/hooks';
import { getLastVoiceCommit, setLastVoiceCommit, useLastVoiceCommit } from '@/data/voiceDraft';
import { haptics } from '@/lib/haptics';
import { font, radius, space, timing, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export function VoiceUndoBanner({ workoutId }: { workoutId: string }) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const commit = useLastVoiceCommit();
  const undo = useUndoVoiceSets(workoutId);

  const mine = commit && commit.workoutId === workoutId ? commit : null;

  // Auto-clear the marker after the undo window so it can't reappear on a later
  // visit to the same workout. Guard on the current value to avoid clobbering a
  // marker for a different (newer) commit.
  useEffect(() => {
    if (!mine) return;
    const t = setTimeout(() => {
      if (getLastVoiceCommit()?.workoutId === workoutId) setLastVoiceCommit(null);
    }, timing.undoWindowMs);
    return () => clearTimeout(t);
  }, [mine, workoutId]);

  if (!mine) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.label}>{mine.count} SETS LOGGED FROM VOICE</Text>
      <Pressable
        hitSlop={10}
        onPress={() => {
          haptics.warn();
          undo.mutate(mine.setIds);
          setLastVoiceCommit(null);
        }}
      >
        <Text style={styles.undo}>UNDO</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (color: Theme['color']) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: space.lg,
      marginBottom: space.sm,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: color.acc35,
      backgroundColor: color.acc06,
      borderRadius: radius.ctl + 1,
    },
    check: { fontFamily: font.numBold, fontSize: 11, color: color.acc },
    label: { flex: 1, fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t2 },
    undo: { fontFamily: font.numBold, fontSize: 10.5, letterSpacing: tracking.label, color: color.acc },
  });
