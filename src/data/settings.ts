// Local logging preferences (mockup 18 — "Settings"). These knobs are pure
// client behaviour, so they live in AsyncStorage rather than the profiles row: no
// migration, no shared-schema edit, and the screen works the moment it's opened.
// Weight *unit* is the one setting that stays on profiles (it's read all over the
// write path) — see auth.ts / useProfile. Everything here is device-local.
//
// This file is deliberately self-contained (the same "built in isolation" pattern
// as data/calendar.ts): the only cross-screen contract is `weeklyGoal`, which the
// calendar tally reads — import `useSettings` there when the calendar tab lands.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Theme preference (#17): follow the OS ('system') or force a palette. */
export type ThemeMode = 'system' | 'light' | 'dark';

export type AppSettings = {
  /** Pre-fill the pending set row from last session (mockup 04). Off ⇒ blank rows
   *  every set (mockup 15's blank-field treatment for every lift, not just new ones). */
  prefillFromLastSession: boolean;
  /** Sessions/week the calendar tally counts toward (mockup 12's "five a week"). */
  weeklyGoal: number;
  /** Light/dark preference; 'system' follows the OS appearance (#17). */
  themeMode: ThemeMode;
  /** Epoch ms of the last automatic/manual CSV backup (#50); null = never. Drives
   *  the weekly foreground-check scheduling in src/data/backup.ts. */
  lastBackupAt: number | null;
};

export const DEFAULT_SETTINGS: AppSettings = {
  prefillFromLastSession: true,
  weeklyGoal: 5,
  themeMode: 'system',
  lastBackupAt: null,
};

/** Theme options offered by the Settings control (#17 Phase 3). */
export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

const STORAGE_KEY = 'repvoice.settings.v1';
const SETTINGS_KEY = ['settings'] as const;

/** Weekly-goal presets offered by the Settings picker (sessions/week). */
export const GOAL_PRESETS = [3, 4, 5, 6] as const;

async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    // Merge over defaults so a settings shape that gains a key stays valid.
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(next: AppSettings): Promise<AppSettings> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Reads once and caches for the session; never stale (only this app mutates it). */
export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: loadSettings,
    staleTime: Infinity,
  });
}

/** Optimistic patch so a toggle flips on the same frame it's tapped (Priority B). */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const current = qc.getQueryData<AppSettings>(SETTINGS_KEY) ?? (await loadSettings());
      return saveSettings({ ...current, ...patch });
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: SETTINGS_KEY });
      const prev = qc.getQueryData<AppSettings>(SETTINGS_KEY);
      qc.setQueryData<AppSettings>(SETTINGS_KEY, {
        ...(prev ?? DEFAULT_SETTINGS),
        ...patch,
      });
      return { prev };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(SETTINGS_KEY, ctx.prev);
    },
    onSuccess: (next) => qc.setQueryData(SETTINGS_KEY, next),
  });
}
