// Hevy CSV import — the *pure* half (no DB, no Supabase). Parses a Hevy
// "Export Data" CSV into normalized workouts so the same parser can back an
// in-app import screen today and a `scripts/import-hevy.ts` later.
//
// Hevy's export is one row per SET, with the workout + exercise repeated on every
// row. Columns (v2 export):
//   title,start_time,end_time,description,exercise_title,superset_id,
//   exercise_notes,set_index,set_type,weight_kg,reps,distance_km,
//   duration_seconds,rpe
//
// Weights are already in kg (the column is literally `weight_kg`), which lines up
// with our kg-only storage rule — no conversion here.
import type { ExerciseModality, SetType } from '@/types/db';

export type HevySet = {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceKm: number | null;
  durationSeconds: number | null;
  rpe: number | null;
};

export type HevyExercise = {
  /** Hevy's display name, e.g. "Incline Bench Press (Dumbbell)". */
  title: string;
  sets: HevySet[];
};

export type HevyWorkout = {
  title: string;
  description: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
  exercises: HevyExercise[];
  /** Stable idempotency key → workouts.external_id (unique per user). */
  externalId: string;
};

// --- CSV tokenizer (RFC-4180-ish: quoted fields, "" escapes, CRLF) -----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Strip a leading UTF-8 BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      // Skip fully-blank lines.
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Last field / row if the file doesn't end in a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

// Hevy timestamps look like "26 Jul 2026, 10:36" (no timezone). Parsed as the
// device's local time — the same instant the user actually trained.
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
function parseHevyDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, day, monName, year, hour, min] = m;
  const month = MONTHS[monName.slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const d = new Date(Number(year), month, Number(day), Number(hour), Number(min));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapSetType(raw: string): SetType {
  switch (raw.trim().toLowerCase()) {
    case 'warmup':
    case 'warm up':
      return 'warmup';
    case 'failure':
      return 'failure';
    case 'dropset':
    case 'drop set':
    case 'drop':
      return 'drop';
    default:
      return 'normal'; // normal + any Hevy-specific type we don't model
  }
}

function num(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Infer an exercise modality from its logged sets — used when auto-creating a
 * custom exercise for a Hevy name we don't have in the directory.
 */
export function inferModality(sets: HevySet[]): ExerciseModality {
  const any = (f: (s: HevySet) => boolean) => sets.some(f);
  const hasWeight = any((s) => s.weightKg != null && s.weightKg > 0);
  const hasReps = any((s) => s.reps != null);
  const hasDistance = any((s) => s.distanceKm != null);
  const hasDuration = any((s) => s.durationSeconds != null);
  if (hasWeight && hasReps) return 'weight_reps';
  if (hasDistance) return 'distance_time';
  if (hasDuration && !hasReps) return 'time';
  if (hasReps) return 'bodyweight_reps';
  return 'weight_reps';
}

export type HevyParseResult = {
  workouts: HevyWorkout[];
  totalSets: number;
};

/**
 * Parse a full Hevy export into workouts. Rows are grouped into a workout by
 * (title + start_time), and into an exercise by exercise_title within that
 * workout, both preserving first-seen order. Throws if the header isn't Hevy's.
 */
export function parseHevyCsv(text: string): HevyParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('The file is empty.');

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iTitle = col('title');
  const iStart = col('start_time');
  const iExercise = col('exercise_title');
  if (iTitle < 0 || iStart < 0 || iExercise < 0) {
    throw new Error("This doesn't look like a Hevy export (missing title / start_time / exercise_title columns).");
  }
  const iEnd = col('end_time');
  const iDesc = col('description');
  const iSetType = col('set_type');
  const iWeight = col('weight_kg');
  const iReps = col('reps');
  const iDist = col('distance_km');
  const iDur = col('duration_seconds');
  const iRpe = col('rpe');

  // Preserve order with arrays + index maps keyed on the grouping strings.
  const workouts: HevyWorkout[] = [];
  const workoutByKey = new Map<string, HevyWorkout>();
  const exerciseByKey = new Map<string, HevyExercise>();
  let totalSets = 0;

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const title = (cells[iTitle] ?? '').trim();
    const startRaw = (cells[iStart] ?? '').trim();
    const exerciseTitle = (cells[iExercise] ?? '').trim();
    if (!startRaw || !exerciseTitle) continue; // skip malformed rows

    const startedAt = parseHevyDate(startRaw);
    if (!startedAt) continue;
    const wKey = `${title}|${startRaw}`;

    let workout = workoutByKey.get(wKey);
    if (!workout) {
      workout = {
        title: title || 'Workout',
        description: iDesc >= 0 ? (cells[iDesc] ?? '').trim() : '',
        startedAt,
        endedAt: iEnd >= 0 ? parseHevyDate(cells[iEnd] ?? '') : null,
        exercises: [],
        externalId: `hevy:${startedAt}|${title}`.slice(0, 200),
      };
      workoutByKey.set(wKey, workout);
      workouts.push(workout);
    }

    const eKey = `${wKey}||${exerciseTitle}`;
    let exercise = exerciseByKey.get(eKey);
    if (!exercise) {
      exercise = { title: exerciseTitle, sets: [] };
      exerciseByKey.set(eKey, exercise);
      workout.exercises.push(exercise);
    }

    exercise.sets.push({
      setType: iSetType >= 0 ? mapSetType(cells[iSetType] ?? '') : 'normal',
      weightKg: iWeight >= 0 ? num(cells[iWeight] ?? '') : null,
      reps: iReps >= 0 ? num(cells[iReps] ?? '') : null,
      distanceKm: iDist >= 0 ? num(cells[iDist] ?? '') : null,
      durationSeconds: iDur >= 0 ? num(cells[iDur] ?? '') : null,
      rpe: iRpe >= 0 ? num(cells[iRpe] ?? '') : null,
    });
    totalSets++;
  }

  if (workouts.length === 0) throw new Error('No workouts found in the file.');
  return { workouts, totalSets };
}

// --- serialize (export) ------------------------------------------------------
// The inverse of the parser: emit a Hevy-format CSV so an export round-trips back
// through parseHevyCsv (and is importable into Hevy itself). Column order matches
// the header the parser expects.
const HEVY_HEADER =
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,' +
  'set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO → "26 Jul 2026, 10:36" in device-local time (the format the parser reads). */
export function formatHevyDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hevySetTypeLabel(t: SetType): string {
  return t === 'drop' ? 'dropset' : t; // warmup / normal / failure pass through
}

// Quote a field iff it contains a comma, quote, or newline; double embedded quotes.
function csvField(value: string | number | null): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type ExportWorkout = Pick<HevyWorkout, 'title' | 'description' | 'startedAt' | 'endedAt' | 'exercises'>;

/** Serialize workouts to a Hevy-compatible CSV string (one row per set). */
export function serializeHevyCsv(workouts: ExportWorkout[]): string {
  const lines = [HEVY_HEADER];
  for (const w of workouts) {
    const start = formatHevyDate(w.startedAt);
    const end = w.endedAt ? formatHevyDate(w.endedAt) : '';
    for (const ex of w.exercises) {
      ex.sets.forEach((s, i) => {
        lines.push(
          [
            csvField(w.title),
            csvField(start),
            csvField(end),
            csvField(w.description),
            csvField(ex.title),
            '', // superset_id — not modelled
            '', // exercise_notes — not modelled
            i, // set_index (0-based, Hevy-style)
            csvField(hevySetTypeLabel(s.setType)),
            csvField(s.weightKg),
            csvField(s.reps),
            csvField(s.distanceKm),
            csvField(s.durationSeconds),
            csvField(s.rpe),
          ].join(',')
        );
      });
    }
  }
  return lines.join('\n');
}
