// Weight display + entry helpers. Storage is ALWAYS kg (hard rule); these convert
// to/from the profile's display unit and format for the LED number style. The kg↔lb
// factor is the exact pound (0.45359237 kg), so a round-tripped value is stable.
import type { Unit } from '@/types/db';

const LB_PER_KG = 1 / 0.45359237; // 2.2046226218…

/** Increment used by the ±step keys, in the *display* unit. 2.5 kg / 5 lb. */
export function step(unit: Unit): number {
  return unit === 'lb' ? 5 : 2.5;
}

/** kg (stored) → a number in the display unit, rounded to 1 decimal. */
export function kgToDisplay(kg: number, unit: Unit): number {
  const v = unit === 'lb' ? kg * LB_PER_KG : kg;
  return Math.round(v * 10) / 10;
}

/** A number the user typed in the display unit → kg for storage. */
export function displayToKg(value: number, unit: Unit): number {
  const kg = unit === 'lb' ? value / LB_PER_KG : value;
  return Math.round(kg * 100) / 100; // numeric(6,2)
}

/** Trims a trailing ".0" so 82.5 stays but 80.0 reads as "80". */
export function trimWeight(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

/** "82.5" — the value alone, in display unit, no unit suffix (grids show KG in the header). */
export function formatWeight(kg: number | null | undefined, unit: Unit): string {
  if (kg == null) return '—';
  return trimWeight(kgToDisplay(kg, unit));
}

/** "82.5 × 8" — a whole set, for PREV / LAST / tape labels. */
export function formatSet(
  kg: number | null | undefined,
  reps: number | null | undefined,
  unit: Unit
): string {
  const w = kg == null ? '—' : trimWeight(kgToDisplay(kg, unit));
  return `${w} × ${reps ?? '—'}`;
}

// Barbell plate math ---------------------------------------------------------
// Standard 20 kg bar; plates a typical gym stocks (kg). Shown as a hint under the
// keypad ("PLATES PER SIDE · 20 + 15 + 2.5"); never something the user has to enter.
const BAR_KG = 20;
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

/**
 * Plates per side to reach `kg` on a `BAR_KG` bar. Returns null when the weight
 * isn't loadable (below the bar, or can't be made from the plate set within 0.05kg).
 */
export function platesPerSide(kg: number | null | undefined): number[] | null {
  if (kg == null || kg < BAR_KG) return null;
  let perSide = (kg - BAR_KG) / 2;
  if (perSide <= 0) return [];
  const out: number[] = [];
  for (const p of PLATES_KG) {
    while (perSide + 1e-6 >= p) {
      out.push(p);
      perSide -= p;
    }
  }
  return perSide < 0.05 ? out : null;
}

/** "20 + 15 + 2.5" or null when not cleanly loadable. */
export function platesLabel(kg: number | null | undefined): string | null {
  const plates = platesPerSide(kg);
  if (plates == null || plates.length === 0) return null;
  return plates.map(trimWeight).join(' + ');
}
