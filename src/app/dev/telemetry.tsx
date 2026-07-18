// Dev-only telemetry screen (Phase 2 spec, prompt 2.4): last 50 voice_logs
// plus aggregate cards. Not linked prominently in nav — reached via the small
// "Voice telemetry" link on the Home screen. Unstyled like everything else.
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Empty, ErrorText, Loading } from '@/components/ui';
import { useRecentVoiceLogs, useVoiceLogsSince } from '@/data/hooks';
import { MONTHLY_COST_BUDGET_INR, USD_TO_INR } from '@/lib/pricing';
import type { VoiceLog } from '@/types/db';
import type { ParseResult } from '@/types/parse';

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

function fieldNameFromCorrectionKey(key: string): string {
  // "entry0.weightKg" -> "weightKg"
  const dot = key.indexOf('.');
  return dot === -1 ? key : key.slice(dot + 1);
}

function computeAggregates(logs: VoiceLog[]) {
  const total = logs.length;
  const respondedTotal = logs.filter((l) => l.outcome != null).length;
  const accepted = logs.filter((l) => l.outcome === 'accepted').length;
  const edited = logs.filter((l) => l.outcome === 'edited').length;
  const discarded = logs.filter((l) => l.outcome === 'discarded').length;

  const fieldEditCounts = new Map<string, number>();
  for (const log of logs) {
    if (!log.corrections) continue;
    for (const key of Object.keys(log.corrections)) {
      const field = fieldNameFromCorrectionKey(key);
      fieldEditCounts.set(field, (fieldEditCounts.get(field) ?? 0) + 1);
    }
  }
  const topEditedFields = [...fieldEditCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const ambiguityCount = logs.filter((log) => {
    const parsed = log.parsed as ParseResult | null;
    return (parsed?.ambiguities?.length ?? 0) > 0;
  }).length;

  const latencies = logs
    .map((l) => l.latency_ms)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);

  const totalCostUsd = logs.reduce((sum, l) => sum + (l.cost_usd ?? 0), 0);
  const workoutIds = new Set(logs.map((l) => l.workout_id).filter(Boolean));

  return {
    total,
    respondedTotal,
    accepted,
    edited,
    discarded,
    topEditedFields,
    ambiguityCount,
    p50Latency: percentile(latencies, 50),
    p95Latency: percentile(latencies, 95),
    totalCostUsd,
    costPerWorkoutUsd: workoutIds.size > 0 ? totalCostUsd / workoutIds.size : 0,
    workoutCount: workoutIds.size,
  };
}

export default function VoiceTelemetryScreen() {
  const recent = useRecentVoiceLogs(50);
  const sinceIso = useMemo(startOfMonthIso, []);
  const monthly = useVoiceLogsSince(sinceIso);

  if (recent.isLoading || monthly.isLoading) return <Loading />;
  if (recent.error != null) return <ErrorText error={recent.error} />;
  if (monthly.error != null) return <ErrorText error={monthly.error} />;

  const logs = recent.data ?? [];
  const monthlyLogs = monthly.data ?? [];
  const agg = computeAggregates(monthlyLogs);

  const now = new Date();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedMonthlyUsd =
    daysElapsed > 0 ? (agg.totalCostUsd / daysElapsed) * daysInMonth : 0;
  const projectedMonthlyInr = projectedMonthlyUsd * USD_TO_INR;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Voice telemetry (this month)</Text>

      <View style={styles.cardRow}>
        <Card
          label="Acceptance rate"
          value={agg.respondedTotal ? `${Math.round((agg.accepted / agg.respondedTotal) * 100)}%` : '—'}
          sub={`${agg.accepted}/${agg.respondedTotal} accepted without edits`}
        />
        <Card
          label="Ambiguity-question rate"
          value={agg.total ? `${Math.round((agg.ambiguityCount / agg.total) * 100)}%` : '—'}
          sub={`${agg.ambiguityCount}/${agg.total} utterances`}
        />
        <Card
          label="Discarded"
          value={agg.total ? `${Math.round((agg.discarded / agg.total) * 100)}%` : '—'}
          sub={`${agg.discarded}/${agg.total}`}
        />
      </View>

      <View style={styles.cardRow}>
        <Card label="p50 latency" value={`${agg.p50Latency}ms`} />
        <Card label="p95 latency" value={`${agg.p95Latency}ms`} />
      </View>

      <View style={styles.cardRow}>
        <Card
          label="Cost per workout"
          value={`$${agg.costPerWorkoutUsd.toFixed(4)}`}
          sub={`over ${agg.workoutCount} workout(s)`}
        />
        <Card
          label="Projected this month"
          value={`₹${projectedMonthlyInr.toFixed(0)}`}
          sub={`budget ₹${MONTHLY_COST_BUDGET_INR} · so far $${agg.totalCostUsd.toFixed(4)}`}
          warn={projectedMonthlyInr > MONTHLY_COST_BUDGET_INR}
        />
      </View>

      {agg.topEditedFields.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Most-edited fields</Text>
          {agg.topEditedFields.map(([field, count]) => (
            <Text key={field} style={styles.row}>
              {field}: {count}
            </Text>
          ))}
        </>
      )}

      <Text style={styles.sectionTitle}>Last {logs.length} voice logs</Text>
      {logs.length === 0 && <Empty text="No voice logs yet." />}
      {logs.map((log) => (
        <View key={log.id} style={styles.logRow}>
          <Text style={styles.logTranscript}>"{log.transcript}"</Text>
          <Text style={styles.logMeta}>
            {log.model ?? '—'} · {log.latency_ms ?? '—'}ms · ${(log.cost_usd ?? 0).toFixed(5)} ·{' '}
            {log.outcome ?? 'pending'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function Card({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <View style={[styles.card, warn && styles.cardWarn]}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={styles.cardValue}>{value}</Text>
      {sub && <Text style={styles.cardSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 10 },
  header: { fontSize: 18, color: '#000' },
  sectionTitle: { fontSize: 15, color: '#000', marginTop: 8 },
  cardRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  card: { borderWidth: 1, borderColor: '#ccc', padding: 10, flex: 1, minWidth: 140, gap: 2 },
  cardWarn: { borderColor: '#000', borderWidth: 2 },
  cardLabel: { fontSize: 11, color: '#666' },
  cardValue: { fontSize: 18, color: '#000' },
  cardSub: { fontSize: 11, color: '#666' },
  row: { color: '#000' },
  logRow: { borderBottomWidth: 1, borderBottomColor: '#ddd', paddingVertical: 6, gap: 2 },
  logTranscript: { color: '#000' },
  logMeta: { color: '#666', fontSize: 12 },
});
