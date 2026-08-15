// Automatic weekly CSV backup (feedback #50). The heavy lifting — serializing all
// finished workouts to a Hevy-compatible CSV — already exists (buildHevyExport,
// src/data/export.ts); this module only adds the three missing pieces:
//
//   1. DURABLE storage — writes to Paths.document (survives launches + iOS cache
//      eviction), under a dedicated `backups/` subfolder, one date-stamped file per
//      backup. (The manual Export screen only writes to Paths.cache for the share
//      sheet — ephemeral, OS-purgeable — so nothing persisted before this.)
//   2. ROTATION — after each write, keep only the 4 most recent backups, delete the
//      rest. The decision of *what* to delete is a pure function (backupsToDelete),
//      unit-testable without touching the filesystem.
//   3. SCHEDULING — no server cron on-device, so we check on foreground: useWeeklyBackup()
//      runs once per app session and, if ≥ 7 days have passed since the persisted
//      lastBackupAt (src/data/settings.ts), runs a backup. This foreground-check
//      approach needs no background-execution entitlement (App Store review risk) and
//      matches how the app's other durability work already reasons about iOS
//      backgrounding (FEEDBACK-LOG #32).
//
// Uses the object-oriented expo-file-system API (SDK 57 — File / Directory / Paths,
// the current documented form; the same API the Export screen already uses).
import { Directory, File, Paths } from 'expo-file-system';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { buildHevyExport } from './export';
import { useSettings, useUpdateSettings } from './settings';

/** Subfolder under the document directory that holds the rolling backups. */
export const BACKUP_DIR = 'backups';
/** Rolling window: keep at most this many backups on disk. */
export const MAX_BACKUPS = 4;
/** Run at most one automatic backup per this interval (7 days). */
export const BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** React Query key for the on-disk backup listing (Settings status row). */
export const BACKUPS_KEY = ['backups'] as const;

const FILE_PREFIX = 'kratos-backup-';
// kratos-backup-YYYY-MM-DD.csv — the date stamp sorts lexicographically ==
// chronologically, which the rotation relies on.
const BACKUP_NAME_RE = /^kratos-backup-\d{4}-\d{2}-\d{2}\.csv$/;

/** True for a filename this module created — so rotation never touches foreign files. */
export function isBackupName(name: string): boolean {
  return BACKUP_NAME_RE.test(name);
}

/** Filesystem-safe local-date stamp, e.g. "2026-08-14". */
function dateStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Backup filename for a given moment (one backup per calendar day; a same-day rerun overwrites). */
export function backupFilename(d: Date): string {
  return `${FILE_PREFIX}${dateStamp(d)}.csv`;
}

/**
 * Pure rotation decision: given the backup filenames present, return the ones to
 * delete so at most `max` (the newest) survive. Newest = lexicographically largest
 * name (date-stamped). Filesystem-free so it can be unit-tested directly.
 */
export function backupsToDelete(names: string[], max = MAX_BACKUPS): string[] {
  const sorted = names.filter(isBackupName).sort(); // ascending == oldest → newest
  const excess = sorted.length - max;
  return excess > 0 ? sorted.slice(0, excess) : [];
}

/** All backup files currently on disk, as File instances (unsorted). */
function backupFiles(dir: Directory): File[] {
  if (!dir.exists) return [];
  return dir
    .list()
    .filter((e): e is File => e instanceof File && isBackupName(e.name));
}

/** Delete everything past the newest MAX_BACKUPS. */
function rotate(dir: Directory): void {
  const files = backupFiles(dir);
  const doomed = new Set(backupsToDelete(files.map((f) => f.name)));
  for (const f of files) if (doomed.has(f.name)) f.delete();
}

export type BackupResult = {
  /** True when there was nothing to back up (no finished workouts) — no file written. */
  skipped: boolean;
  /** Epoch ms the backup completed. */
  at: number;
  uri?: string;
  workoutCount: number;
  setCount: number;
};

/**
 * Serialize all finished workouts and write a durable, date-stamped CSV under
 * Paths.document/backups, then prune to the newest MAX_BACKUPS. A brand-new account
 * with no finished workouts is skipped (no empty file, and the caller should NOT
 * advance lastBackupAt so it retries once real data exists).
 */
export async function runBackup(now: Date = new Date()): Promise<BackupResult> {
  const { csv, workoutCount, setCount } = await buildHevyExport();
  if (workoutCount === 0) {
    return { skipped: true, at: now.getTime(), workoutCount, setCount };
  }

  const dir = new Directory(Paths.document, BACKUP_DIR);
  if (!dir.exists) dir.create({ intermediates: true });

  const file = new File(dir, backupFilename(now));
  if (file.exists) file.delete(); // a same-day rerun overwrites rather than duplicating
  file.create();
  file.write(csv);

  rotate(dir);
  return { skipped: false, at: now.getTime(), uri: file.uri, workoutCount, setCount };
}

export type BackupInfo = {
  name: string;
  uri: string;
  /** Bytes on disk. */
  size: number;
  /** Epoch ms of last modification (null if unreadable). */
  modifiedAt: number | null;
};

/** The backups on disk, newest first (for the Settings status row). */
export function listBackups(): BackupInfo[] {
  const dir = new Directory(Paths.document, BACKUP_DIR);
  return backupFiles(dir)
    .map((f) => ({ name: f.name, uri: f.uri, size: f.size, modifiedAt: f.modificationTime }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Query the on-disk backup listing (cheap; invalidated after each backup). */
export function useBackups() {
  return useQuery({
    queryKey: BACKUPS_KEY,
    queryFn: async () => listBackups(),
    staleTime: 60_000,
  });
}

/** Manual "Back up now" — writes a backup immediately and records the timestamp. */
export function useRunBackupNow() {
  const qc = useQueryClient();
  const update = useUpdateSettings();
  return useMutation({
    mutationFn: async () => runBackup(),
    onSuccess: (res) => {
      if (!res.skipped) update.mutate({ lastBackupAt: res.at });
      void qc.invalidateQueries({ queryKey: BACKUPS_KEY });
    },
  });
}

// One check per app session — a module-level latch, not per-component, so the
// scheduling fires once even if the host screen remounts.
let checkedThisSession = false;

/** For tests / dev: allow the once-per-session latch to be reset. */
export function __resetWeeklyBackupLatch() {
  checkedThisSession = false;
}

/**
 * Foreground scheduling: mount this on the relevant screen. Once per app session,
 * after settings have loaded, it runs a backup if ≥ 7 days have passed since the
 * last one (or one has never run). Failures (offline, RLS) are swallowed and simply
 * retried next session — lastBackupAt only advances on a real write.
 */
export function useWeeklyBackup() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const data = settings.data;

  useEffect(() => {
    if (checkedThisSession || !data) return;
    checkedThisSession = true;

    const last = data.lastBackupAt;
    if (last != null && Date.now() - last < BACKUP_INTERVAL_MS) return;

    runBackup()
      .then((res) => {
        if (res.skipped) {
          checkedThisSession = false; // nothing to back up yet — try again next session
          return;
        }
        update.mutate({ lastBackupAt: res.at });
        void qc.invalidateQueries({ queryKey: BACKUPS_KEY });
      })
      .catch(() => {
        checkedThisSession = false; // transient (offline / not signed in) — retry next session
      });
    // Only re-run when settings first resolve; the latch guards against re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
