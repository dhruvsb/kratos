// Streak + rolling-heatmap math for the "Rolling Weeks" Home (Kratos Home Rolling
// Weeks.dc.html). Pure and framework-free so it can be unit-reasoned in isolation —
// the screen just renders what this returns.
//
// The app only records the days you actually trained (finished workouts). The mockup
// distinguishes three cell states, so we derive the other two with a **rest-tolerant**
// rule agreed with the product owner:
//   • worked  — a finished workout that day.
//   • rest    — a single, isolated non-worked day *between* activity. It keeps the
//               streak alive and COUNTS toward the streak number ("REST DAYS COUNT").
//   • skipped — a non-worked day that is part of a run of two or more consecutive
//               non-worked days. It breaks the streak.
// Equivalently: a non-worked day is `rest` iff its maximal consecutive non-worked run
// has length 1 (both neighbours worked — today's "future" side counts as the end).

import { addDays, mondayOf, startOfDay } from '@/lib/dates';

const DAY_MS = 86_400_000;

export type CellState = 'worked' | 'rest' | 'skipped';

// `future` cells sit in the current week after today — drawn as empty placeholders so
// the grid always reads as whole Mon–Sun weeks.
export type HeatCell = { n: number; state: CellState | 'future'; isToday: boolean };

export type StreakData = {
  /** Current rest-tolerant streak length, in days (worked + isolated rest days). */
  streak: number;
  /** Longest such run over all recorded history. */
  best: number;
  /** 5 weeks (35 cells), Mon–Sun aligned, current week last — the Home heatmap. */
  cells: HeatCell[];
  /** Last 30 days (oldest→newest) — the pinned-bar sparkline (Phase 3). */
  micro: CellState[];
};

const GRID_WEEKS = 5;
const MICRO_DAYS = 30;

/**
 * Derive the streak numbers + heatmap cells from the set of trained-day midnights.
 *
 * @param doneDays  local-midnight epoch ms of every finished-workout day.
 * @param today     the reference "today" (defaults to now).
 */
export function computeStreak(doneDays: Set<number>, today: Date = new Date()): StreakData {
  const todayStart = startOfDay(today);

  // The heatmap shows GRID_WEEKS whole Mon–Sun weeks ending with the current week, so
  // each column is a real weekday and today lands in its true column (the mockup's
  // static M–S header only lined up because its "today" happened to be a Sunday).
  const gridStart = startOfDay(mondayOf(addDays(today, -(GRID_WEEKS - 1) * 7)));

  // Build one contiguous day timeline through today. It must reach back far enough for
  // `best` (all history) and for the grid's first column, plus one leading pad day
  // (always non-worked) so index 0 has a defined "outside" neighbour.
  let earliest = Math.min(gridStart, todayStart);
  for (const d of doneDays) if (d < earliest) earliest = d;
  const start = earliest - DAY_MS; // pad
  const len = Math.round((todayStart - start) / DAY_MS) + 1;
  const lastIdx = len - 1; // == today
  const idxOf = (dayStart: number) => Math.round((dayStart - start) / DAY_MS);

  const worked: boolean[] = new Array(len);
  for (let i = 0; i < len; i++) worked[i] = doneDays.has(start + i * DAY_MS);

  // Classify every index. today's right ("future") side is treated as the run end,
  // so an isolated non-worked today (yesterday trained) reads as a live rest day.
  const state: CellState[] = new Array(len);
  for (let i = 0; i < len; i++) {
    if (worked[i]) {
      state[i] = 'worked';
      continue;
    }
    const prevWorked = i > 0 && worked[i - 1];
    const nextWorked = i === lastIdx || (i < lastIdx && worked[i + 1]);
    state[i] = prevWorked && nextWorked ? 'rest' : 'skipped';
  }

  // Current streak: walk back from today while the day isn't skipped.
  let streak = 0;
  for (let i = lastIdx; i >= 0 && state[i] !== 'skipped'; i--) streak++;

  // Best streak: longest run of non-skipped days anywhere in the timeline.
  let best = 0;
  let run = 0;
  for (let i = 0; i < len; i++) {
    if (state[i] === 'skipped') {
      run = 0;
    } else {
      run++;
      if (run > best) best = run;
    }
  }

  // Heatmap cells: GRID_WEEKS × 7, Mon–Sun. Days after today are `future` placeholders.
  const cells: HeatCell[] = [];
  for (let c = 0; c < GRID_WEEKS * 7; c++) {
    const dayStart = gridStart + c * DAY_MS;
    const date = new Date(dayStart);
    if (dayStart > todayStart) {
      cells.push({ n: date.getDate(), state: 'future', isToday: false });
    } else {
      cells.push({ n: date.getDate(), state: state[idxOf(dayStart)], isToday: dayStart === todayStart });
    }
  }

  const micro = state.slice(len - MICRO_DAYS);

  return { streak, best, cells, micro };
}
