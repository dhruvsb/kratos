// Export history (Settings → DATA). Serializes every finished workout to a
// Hevy-compatible CSV (round-trips back through the importer) and hands it to the
// OS share sheet as a real .csv file. Fetch/serialize live in src/data/export.ts;
// this screen is the summary → share flow, mirroring the import screen.
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from '@/components/ui';
import { buildHevyExport, type HevyExport } from '@/data/export';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Stage =
  | { name: 'loading' }
  | { name: 'ready'; data: HevyExport }
  | { name: 'empty' }
  | { name: 'error'; message: string };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// A filesystem-safe stamp for the filename, e.g. "2026-07-31". Local date is fine.
function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ExportScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let alive = true;
    buildHevyExport()
      .then((data) => {
        if (!alive) return;
        setStage(data.workoutCount === 0 ? { name: 'empty' } : { name: 'ready', data });
      })
      .catch((e) => alive && setStage({ name: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, []);

  async function share(data: HevyExport) {
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setStage({ name: 'error', message: 'Sharing is not available on this device.' });
        return;
      }
      const file = new File(Paths.cache, `repvoice-export-${todayStamp()}.csv`);
      if (file.exists) file.delete(); // overwrite a same-day export
      file.create();
      file.write(data.csv);
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: 'Export RepVoice history',
      });
    } catch (e) {
      setStage({ name: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← BACK</Text>
        </Pressable>
        <Text style={styles.count}>HEVY CSV</Text>
      </View>
      <Text style={styles.title}>Export history</Text>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {stage.name === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator color={color.acc} />
            <Text style={styles.dim}>Gathering your history…</Text>
          </View>
        )}

        {stage.name === 'empty' && (
          <>
            <View style={styles.spacer} />
            <Text style={styles.body}>No finished workouts yet — log one (or import from Hevy) first, then come back to export.</Text>
            <View style={styles.spacer} />
            <Btn title="DONE" onPress={() => router.back()} />
          </>
        )}

        {stage.name === 'ready' && (
          <>
            <Text style={styles.body}>
              Save your full training history as a Hevy-compatible CSV — one row per set. It re-imports
              here and loads into Hevy.
            </Text>

            <View style={styles.statRow}>
              <Stat value={stage.data.workoutCount} label="WORKOUTS" tone="accent" />
              <Stat value={stage.data.setCount} label="SETS" />
            </View>
            {stage.data.dateRange && (
              <Text style={styles.range}>
                {fmtDate(stage.data.dateRange.from)} — {fmtDate(stage.data.dateRange.to)}
              </Text>
            )}

            <View style={styles.spacer} />
            <Btn
              title={sharing ? 'PREPARING…' : 'EXPORT CSV'}
              tone="accent"
              disabled={sharing}
              onPress={() => share(stage.data)}
            />
          </>
        )}

        {stage.name === 'error' && (
          <>
            <View style={styles.spacer} />
            <Text style={styles.errorText}>{stage.message}</Text>
            <View style={styles.spacer} />
            <Btn title="BACK" onPress={() => router.back()} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label, tone }: { value: number | string; label: string; tone?: 'accent' }) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone === 'accent' && { color: color.acc }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.xxl },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t2 },
  count: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  title: { fontFamily: font.uiSemibold, fontSize: 22, color: color.t1, marginTop: space.md, marginBottom: space.xl },

  body: { fontFamily: font.ui, fontSize: 14, lineHeight: 22, color: color.t2 },

  center: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl * 2 },
  dim: { fontFamily: font.num, fontSize: 11, color: color.t3, letterSpacing: tracking.label },

  statRow: { flexDirection: 'row', gap: space.md, marginVertical: space.lg },
  stat: {
    flex: 1,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    backgroundColor: color.s0,
    paddingVertical: space.lg,
    alignItems: 'center',
    gap: 6,
  },
  statValue: { fontFamily: font.numSemibold, fontSize: 22, color: color.t1 },
  statLabel: { fontFamily: font.numSemibold, fontSize: 7.5, letterSpacing: tracking.wide, color: color.t3 },

  range: { fontFamily: font.num, fontSize: 11, color: color.t2, letterSpacing: 0.4 },

  spacer: { height: space.xl },
  errorText: { fontFamily: font.num, fontSize: 12, lineHeight: 19, color: color.warn },
});
