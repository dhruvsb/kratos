// Import workouts (Settings → DATA). The idle stage explains the CSV shape we
// expect (one row per set), then you pick a file, preview exactly what will land
// (new vs already-imported workouts, matched vs new-custom exercises), and commit.
// The format is Hevy's "Export Data" CSV — a Hevy export drops straight in — but
// any CSV with the same columns works. Parsing/matching is in src/lib/hevy.ts +
// src/data/import.ts; this screen is just the guide → pick → preview → commit flow.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from '@/components/ui';
import { useCommitImport } from '@/data/hooks';
import { buildImportPlan, type ImportPlan, type ImportResult } from '@/data/import';
import { font, radius, space, tracking, type Theme } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

type Stage =
  | { name: 'idle' }
  | { name: 'reading' }
  | { name: 'preview'; fileName: string; plan: ImportPlan }
  | { name: 'done'; result: ImportResult }
  | { name: 'error'; message: string };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ImportScreen() {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const insets = useSafeAreaInsets();
  const commit = useCommitImport();
  const [stage, setStage] = useState<Stage>({ name: 'idle' });

  async function pickFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      setStage({ name: 'reading' });
      const text = await new File(asset.uri).text();
      const plan = await buildImportPlan(text);
      setStage({ name: 'preview', fileName: asset.name, plan });
    } catch (e) {
      setStage({ name: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function runImport(plan: ImportPlan) {
    try {
      const result = await commit.mutateAsync(plan);
      setStage({ name: 'done', result });
    } catch (e) {
      setStage({ name: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.md }]}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← BACK</Text>
        </Pressable>
        <Text style={styles.count}>CSV</Text>
      </View>
      <Text style={styles.title}>Import workouts</Text>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {stage.name === 'idle' && (
          <>
            <Text style={styles.body}>
              Bring your training history in from a <Text style={styles.em}>CSV file</Text> — one row
              per set. Coming from Hevy? Its <Text style={styles.em}>Export &amp; Backup Data</Text> file
              drops straight in. Re-importing the same file is safe — workouts already imported are skipped.
            </Text>

            <View style={styles.guide}>
              <Text style={styles.guideTitle}>REQUIRED COLUMNS</Text>
              <Col name="title" desc="Workout name (e.g. Push Day)." />
              <Col name="start_time" desc="When it started — e.g. 26 Jul 2026, 10:36." />
              <Col name="exercise_title" desc="Exercise name, matched to your library." />

              <Text style={[styles.guideTitle, styles.guideTitleGap]}>OPTIONAL COLUMNS</Text>
              <Col name="weight_kg" desc="Weight in kilograms." />
              <Col name="reps" desc="Repetitions in the set." />
              <Col name="set_type" desc="normal, warmup, failure or dropset." />
              <Col name="end_time" desc="When the workout finished." />
              <Col name="duration_seconds · distance_km" desc="For timed / cardio sets." />

              <Text style={styles.guideNote}>
                One line = one set, with the workout and exercise repeated on each of its rows.
                Unknown exercises are added as custom, so nothing is dropped.
              </Text>
            </View>

            <View style={styles.spacer} />
            <Btn title="CHOOSE CSV FILE" tone="accent" onPress={pickFile} />
          </>
        )}

        {stage.name === 'reading' && (
          <View style={styles.center}>
            <ActivityIndicator color={color.acc} />
            <Text style={styles.dim}>Reading file…</Text>
          </View>
        )}

        {stage.name === 'preview' && (
          <Preview
            fileName={stage.fileName}
            plan={stage.plan}
            busy={commit.isPending}
            onConfirm={() => runImport(stage.plan)}
            onCancel={() => setStage({ name: 'idle' })}
          />
        )}

        {stage.name === 'done' && <Done result={stage.result} />}

        {stage.name === 'error' && (
          <>
            <View style={styles.spacer} />
            <Text style={styles.errorText}>{stage.message}</Text>
            <View style={styles.spacer} />
            <Btn title="TRY ANOTHER FILE" onPress={() => setStage({ name: 'idle' })} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Col({ name, desc }: { name: string; desc: string }) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  return (
    <View style={styles.colRow}>
      <Text style={styles.colName}>{name}</Text>
      <Text style={styles.colDesc}>{desc}</Text>
    </View>
  );
}

function Stat({ value, label, tone }: { value: number | string; label: string; tone?: 'accent' | 'dim' }) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone === 'accent' && { color: color.acc }, tone === 'dim' && { color: color.t3 }]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Preview({
  fileName,
  plan,
  busy,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  plan: ImportPlan;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  const nothingNew = plan.newWorkouts.length === 0;
  const customs = [...plan.resolutions.values()].filter((r) => r.kind === 'custom');
  return (
    <>
      <Text style={styles.fileName} numberOfLines={1}>
        {fileName}
      </Text>

      <View style={styles.statRow}>
        <Stat value={plan.newWorkouts.length} label="WORKOUTS" tone="accent" />
        <Stat value={plan.newSetCount} label="SETS" />
        <Stat value={plan.matchedCount} label="MATCHED" />
        <Stat value={plan.customCount} label="NEW" tone={plan.customCount ? undefined : 'dim'} />
      </View>

      {plan.dateRange && (
        <Text style={styles.range}>
          {fmtDate(plan.dateRange.from)} — {fmtDate(plan.dateRange.to)}
        </Text>
      )}
      {plan.skippedWorkouts > 0 && (
        <Text style={styles.note}>
          {plan.skippedWorkouts} workout{plan.skippedWorkouts === 1 ? '' : 's'} already imported — will
          be skipped.
        </Text>
      )}

      {customs.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>NEW CUSTOM EXERCISES ({customs.length})</Text>
          {customs.map((c) => (
            <Text key={c.title} style={styles.customRow} numberOfLines={1}>
              {c.title}
            </Text>
          ))}
          <Text style={styles.note}>Not in your library — added as custom exercises so no data is dropped.</Text>
        </View>
      )}

      <View style={styles.spacer} />
      {nothingNew ? (
        <>
          <Text style={styles.note}>Everything in this file is already in your history.</Text>
          <View style={styles.spacer} />
          <Btn title="DONE" onPress={onCancel} />
        </>
      ) : (
        <>
          <Btn
            title={busy ? 'IMPORTING…' : `IMPORT ${plan.newWorkouts.length} WORKOUTS`}
            tone="accent"
            disabled={busy}
            onPress={onConfirm}
          />
          <View style={styles.spacerSm} />
          <Btn title="CANCEL" disabled={busy} onPress={onCancel} />
        </>
      )}
    </>
  );
}

function Done({ result }: { result: ImportResult }) {
  const { color } = useTheme();
  const styles = useMemo(() => makeStyles(color), [color]);
  return (
    <>
      <View style={styles.spacer} />
      <Text style={styles.doneMark}>✓</Text>
      <Text style={styles.doneTitle}>Import complete</Text>
      <View style={styles.statRow}>
        <Stat value={result.importedWorkouts} label="WORKOUTS" tone="accent" />
        <Stat value={result.importedSets} label="SETS" />
        <Stat value={result.createdExercises} label="NEW EX" />
        {result.skippedWorkouts > 0 && <Stat value={result.skippedWorkouts} label="SKIPPED" tone="dim" />}
      </View>
      <View style={styles.spacer} />
      <Btn title="VIEW HISTORY" tone="accent" onPress={() => router.dismissTo('/history')} />
      <View style={styles.spacerSm} />
      <Btn title="DONE" onPress={() => router.back()} />
    </>
  );
}

const makeStyles = (color: Theme['color']) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.xxl },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { fontFamily: font.numSemibold, fontSize: 10, letterSpacing: tracking.label, color: color.t2 },
  count: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  title: { fontFamily: font.uiSemibold, fontSize: 22, color: color.t1, marginTop: space.md, marginBottom: space.xl },

  body: { fontFamily: font.ui, fontSize: 14, lineHeight: 22, color: color.t2 },
  em: { fontFamily: font.uiSemibold, color: color.t1b },

  guide: {
    marginTop: space.xl,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    backgroundColor: color.s0,
    padding: space.lg,
  },
  guideTitle: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3 },
  guideTitleGap: { marginTop: space.lg },
  colRow: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  colName: {
    fontFamily: font.numMedium,
    fontSize: 11,
    color: color.acc,
    width: 118,
    letterSpacing: 0.2,
  },
  colDesc: { flex: 1, fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: color.t2 },
  guideNote: { fontFamily: font.num, fontSize: 10.5, lineHeight: 17, color: color.t3, marginTop: space.lg },

  center: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl * 2 },
  dim: { fontFamily: font.num, fontSize: 11, color: color.t3, letterSpacing: tracking.label },

  fileName: { fontFamily: font.num, fontSize: 10, letterSpacing: 0.6, color: color.t3, marginBottom: space.lg },

  statRow: { flexDirection: 'row', gap: space.md, marginVertical: space.md },
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

  range: { fontFamily: font.num, fontSize: 11, color: color.t2, letterSpacing: 0.4, marginTop: space.sm },
  note: { fontFamily: font.num, fontSize: 10.5, lineHeight: 17, color: color.t3, marginTop: space.sm },

  group: { marginTop: space.xl },
  groupTitle: { fontFamily: font.numSemibold, fontSize: 8, letterSpacing: tracking.wide, color: color.t3, marginBottom: space.sm },
  customRow: {
    fontFamily: font.uiMedium,
    fontSize: 13,
    color: color.t1b,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },

  spacer: { height: space.xl },
  spacerSm: { height: space.sm },

  errorText: { fontFamily: font.num, fontSize: 12, lineHeight: 19, color: color.warn },

  doneMark: { fontFamily: font.num, fontSize: 40, color: color.ok, textAlign: 'center' },
  doneTitle: {
    fontFamily: font.uiSemibold,
    fontSize: 18,
    color: color.t1,
    textAlign: 'center',
    marginTop: space.sm,
    marginBottom: space.lg,
  },
});
