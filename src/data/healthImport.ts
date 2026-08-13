// Apple Health gap-fill (iOS-only). Backfills a blank "Strength Training"
// placeholder for any day the user actually worked out but forgot to log in
// RepVoice/Hevy — so the calendar stays honest with zero manual effort.
//
// Source-agnostic on purpose: it reads whatever wrote strength sessions into
// Apple Health (Whoop today, an Amazfit Helio via the Zepp app later) — no
// app-side change on a wearable switch.
//
// Like every module in src/data/, all DB access goes through the Supabase client
// here (RLS scopes writes to the signed-in user); screens call the hook, not this.
import { supabase } from '@/lib/supabase';
import { newUuid } from '@/lib/ids';
import {
  isHealthAvailable,
  readStrengthWorkouts,
  requestStrengthPermission,
} from '@/lib/healthkit';
import { requireUserId } from './auth';

/** Namespaced external_id (unique per user, same column Hevy import uses) makes
 *  re-syncing idempotent: a HealthKit session is imported at most once, ever. */
const HK_PREFIX = 'healthkit:';
/** Manual button, recent gaps only — matches the "I forgot to log lately" case. */
const BACKFILL_DAYS = 30;

export type HealthSyncResult = { added: number; skipped: number };

/** Local calendar-day key (YYYY-MM-DD in device time). Day-level dedup is judged
 *  the way the user sees the calendar, not by UTC. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Read strength sessions from Apple Health and insert a blank placeholder for any
 * day with no workout yet. A HealthKit session is skipped if EITHER its exact id
 * was already imported (external_id) OR any workout already exists that calendar
 * day — a real RepVoice/Hevy log always wins. No exercises/sets are created; the
 * placeholder just marks the day (a future feature can let the user tag muscle
 * groups onto it). No-ops entirely off iOS.
 */
export async function syncHealthWorkouts(): Promise<HealthSyncResult> {
  if (!isHealthAvailable()) return { added: 0, skipped: 0 };
  await requestStrengthPermission();

  const hk = await readStrengthWorkouts(BACKFILL_DAYS);
  if (hk.length === 0) return { added: 0, skipped: 0 };

  const userId = await requireUserId();

  // Pull existing workouts across the backfill window (+1 day of slack) to dedup
  // against — by exact HealthKit id and by calendar day.
  const since = new Date(Date.now() - (BACKFILL_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing, error } = await supabase
    .from('workouts')
    .select('started_at, external_id')
    .gte('started_at', since);
  if (error) throw error;

  const existingDays = new Set<string>();
  const existingExtIds = new Set<string>();
  for (const row of existing ?? []) {
    if (row.started_at) existingDays.add(dayKey(row.started_at));
    if (row.external_id) existingExtIds.add(row.external_id);
  }

  const seenDays = new Set<string>(); // at most one placeholder per day within this batch
  const rows = [];
  for (const w of hk) {
    const extId = HK_PREFIX + w.uuid;
    if (existingExtIds.has(extId)) continue; // already imported
    const key = dayKey(w.start);
    if (existingDays.has(key) || seenDays.has(key)) continue; // real log (or an earlier session today) wins
    seenDays.add(key);
    rows.push({
      id: newUuid(),
      user_id: userId,
      // Titled so Home/History render "Strength Training", not "Empty workout".
      title: 'Strength Training',
      // started_at + ended_at both set: history and the calendar heatmap only
      // count finished workouts (ended_at IS NOT NULL).
      started_at: w.start,
      ended_at: w.end,
      external_id: extId,
      notes: 'Imported from Apple Health',
    });
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('workouts').insert(rows);
    if (insErr) throw insErr;
  }
  return { added: rows.length, skipped: hk.length - rows.length };
}
