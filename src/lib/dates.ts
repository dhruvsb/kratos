// Small shared date helpers. Local-midnight math is DST-safe (goes through the Date
// constructor rather than adding milliseconds). Used by the streak/heatmap math and
// every screen that shows a "3 DAYS AGO"-style recency.

const DAY_MS = 86_400_000;

/** Local-midnight epoch ms of a date. */
export function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local-midnight of `base` shifted by `n` days. */
export function addDays(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}

/** Monday (week start) of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  return addDays(d, -dow);
}

/** Coarse "when did this happen" label (uppercase), day-granular. */
export function agoLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY_MS);
  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return `${days} DAYS AGO`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? '1 WEEK AGO' : `${weeks} WEEKS AGO`;
}
