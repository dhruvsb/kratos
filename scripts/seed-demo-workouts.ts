/**
 * Seed a realistic block of demo workout history for one account, so Home /
 * History / Calendar / progress charts look alive in screenshots and demos
 * (a fresh account renders empty everywhere — backlog item).
 *
 * What it writes: `--weeks` (default 8) of a Push / Pull / Legs / Upper
 * rotation (~4 sessions/week, ~12% randomly skipped for realism), with
 * per-exercise progressive overload + jitter, warmups on the first compound,
 * evening timestamps, and every workout finished (`ended_at` set — never
 * creates an active workout). The most recent week nudges a few lifts past
 * their previous bests so a follow-up live workout can demo NEW BESTS.
 *
 * Deterministic (seeded RNG) and idempotent: every workout carries
 * `external_id 'demo:<week>-<slot>'` (unique per user), existing ids are
 * skipped on re-run, and `--wipe` deletes exactly the `demo:%` rows first.
 * Real (non-demo) data is never touched.
 *
 * Run:  npx tsx scripts/seed-demo-workouts.ts <email> [--weeks 8] [--wipe]
 *       (npm run seed:demo — defaults to the dev account)
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (service role — local only).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// --- CLI ---------------------------------------------------------------------
const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--')) ?? 'dsooseven@gmail.com';
const weeks = Math.max(1, Number(args[args.indexOf('--weeks') + 1] || 8) || 8);
const wipe = args.includes('--wipe');

// --- Deterministic RNG -------------------------------------------------------
// Reseeded per session from (week, slot) — every run makes identical decisions
// for a given session regardless of which other sessions were skipped, so
// re-runs are true no-ops (a single shared stream would desync on skips).
let rngState = 1;
function seedRng(week: number, slot: string): void {
  rngState = 0x5eed5 + week * 7919;
  for (const ch of slot) rngState = (rngState * 31 + ch.charCodeAt(0)) % 2 ** 31;
}
function rand(): number {
  // LCG — plenty for jitter.
  rngState = (rngState * 1103515245 + 12345) % 2 ** 31;
  return rngState / 2 ** 31;
}
const jitter = (amt: number) => (rand() * 2 - 1) * amt;

// --- The training block ------------------------------------------------------
// dow: 1=Mon … 6=Sat. Base weights in kg (storage unit — hard rule).
// `pr: true` lifts get an extra bump in the final week (NEW BESTS demo bait).
type SlotExercise = { name: string; base: number; reps: number; warmup?: boolean; pr?: boolean };
const ROTATION: { slot: string; routine: string; dow: number; exercises: SlotExercise[] }[] = [
  {
    slot: 'push',
    routine: 'Push Day',
    dow: 1,
    exercises: [
      { name: 'Barbell Bench Press', base: 60, reps: 8, warmup: true, pr: true },
      { name: 'Arnold Press', base: 20, reps: 10 },
      { name: 'Cable Chest Press', base: 35, reps: 12 },
      { name: 'Cable Overhead Triceps Extension', base: 22.5, reps: 12 },
    ],
  },
  {
    slot: 'pull',
    routine: 'Pull Day',
    dow: 2,
    exercises: [
      { name: 'Bent-Over Barbell Row', base: 50, reps: 8, warmup: true, pr: true },
      { name: 'Assisted Pull-Up', base: 35, reps: 8 },
      { name: 'Barbell Curl', base: 27.5, reps: 10 },
      { name: 'Hammer Curl', base: 12, reps: 12 },
    ],
  },
  {
    slot: 'legs',
    routine: 'Leg Day',
    dow: 4,
    exercises: [
      { name: 'Barbell Back Squat', base: 80, reps: 6, warmup: true, pr: true },
      { name: 'Lying Leg Curl', base: 35, reps: 10 },
      { name: 'Back Extension', base: 20, reps: 12 },
      { name: 'Cable Glute Kickback', base: 15, reps: 12 },
    ],
  },
  {
    slot: 'upper',
    routine: 'Upper Day',
    dow: 6,
    exercises: [
      { name: 'Dumbbell Bench Press', base: 24, reps: 10 },
      { name: 'Cable Lateral Raise', base: 10, reps: 15 },
      { name: 'Preacher Curl', base: 22.5, reps: 10 },
      { name: 'Cable Crunch', base: 30, reps: 15 },
    ],
  },
];

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/** Working weight for a lift in a given week (0 = oldest … weeks-1 = latest). */
function weightFor(ex: SlotExercise, week: number): number {
  const progress = weeks > 1 ? week / (weeks - 1) : 1;
  let w = ex.base * (1 + 0.3 * progress) + jitter(ex.base * 0.03);
  if (ex.pr && week === weeks - 1) w += 2.5; // the final-week PR nudge
  return Math.max(2.5, roundTo(w, 2.5));
}

async function main() {
  // Resolve the target user.
  const { data: usersPage, error: usersErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (usersErr) throw usersErr;
  const user = usersPage.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  console.log(`Seeding ${weeks} weeks of demo history for ${email} (${user.id})`);

  if (wipe) {
    const { error, count } = await admin
      .from('workouts')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .like('external_id', 'demo:%');
    if (error) throw error;
    console.log(`Wiped ${count ?? 0} existing demo workout(s).`);
  }

  // Resolve exercise ids by canonical name (global curated table).
  const names = [...new Set(ROTATION.flatMap((s) => s.exercises.map((e) => e.name)))];
  const { data: exRows, error: exErr } = await admin
    .from('exercises')
    .select('id, canonical_name')
    .in('canonical_name', names);
  if (exErr) throw exErr;
  const exId = new Map((exRows ?? []).map((r) => [r.canonical_name, r.id]));
  for (const n of names) {
    if (!exId.has(n)) console.warn(`  ! "${n}" not in the exercise library — skipping it`);
  }

  // Find-or-create the rotation's routines (by name, per user) so demo history
  // rows carry real titles and Home shows a plausible rotation. `--wipe` leaves
  // these in place deliberately — they're genuinely usable routines.
  const { data: existingRoutines, error: rErr } = await admin
    .from('routines')
    .select('id, name')
    .eq('user_id', user.id)
    .in('name', ROTATION.map((s) => s.routine));
  if (rErr) throw rErr;
  const routineId = new Map((existingRoutines ?? []).map((r) => [r.name, r.id]));
  for (const [i, slot] of ROTATION.entries()) {
    if (routineId.has(slot.routine)) continue;
    const { data: routine, error: cErr } = await admin
      .from('routines')
      .insert({ user_id: user.id, name: slot.routine, position: i })
      .select('id')
      .single();
    if (cErr) throw cErr;
    const present = slot.exercises.filter((e) => exId.has(e.name));
    const { error: reErr } = await admin.from('routine_exercises').insert(
      present.map((e, pos) => ({
        routine_id: routine.id,
        exercise_id: exId.get(e.name)!,
        position: pos,
        target_sets: 3,
        target_reps_low: Math.max(3, e.reps - 2),
        target_reps_high: e.reps,
      }))
    );
    if (reErr) throw reErr;
    routineId.set(slot.routine, routine.id);
    console.log(`Created routine "${slot.routine}"`);
  }

  // Existing demo ids (idempotency).
  const { data: existing, error: existErr } = await admin
    .from('workouts')
    .select('external_id')
    .eq('user_id', user.id)
    .like('external_id', 'demo:%');
  if (existErr) throw existErr;
  const have = new Set((existing ?? []).map((w) => w.external_id));

  // Anchor the block so it ends yesterday-ish: week w=weeks-1 is the current week.
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));

  let created = 0;
  let skipped = 0;
  let setsWritten = 0;

  for (let w = 0; w < weeks; w++) {
    for (const slot of ROTATION) {
      seedRng(w, slot.slot);
      const externalId = `demo:${w}-${slot.slot}`;
      // The session's calendar day; skip future days and ~12% at random.
      const day = new Date(monday);
      day.setDate(monday.getDate() - (weeks - 1 - w) * 7 + (slot.dow - 1));
      const isFuture = day >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const skipRoll = rand() < 0.12;
      if (isFuture || skipRoll) {
        skipped++;
        continue;
      }
      if (have.has(externalId)) {
        skipped++;
        continue;
      }

      const startedAt = new Date(day);
      startedAt.setHours(18, Math.floor(rand() * 50), 0, 0);
      const endedAt = new Date(startedAt.getTime() + (45 + rand() * 30) * 60_000);

      const { data: workout, error: wErr } = await admin
        .from('workouts')
        .insert({
          user_id: user.id,
          routine_id: routineId.get(slot.routine) ?? null,
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          external_id: externalId,
        })
        .select('id')
        .single();
      if (wErr) throw wErr;

      const present = slot.exercises.filter((e) => exId.has(e.name));
      const { data: weRows, error: weErr } = await admin
        .from('workout_exercises')
        .insert(
          present.map((e, i) => ({
            workout_id: workout.id,
            exercise_id: exId.get(e.name)!,
            position: i,
          }))
        )
        .select('id, position');
      if (weErr) throw weErr;
      const weByPos = new Map((weRows ?? []).map((r) => [r.position, r.id]));

      const setRows: Record<string, unknown>[] = [];
      present.forEach((e, i) => {
        const workingKg = weightFor(e, w);
        let setNumber = 1;
        if (e.warmup) {
          setRows.push({
            workout_exercise_id: weByPos.get(i),
            set_number: setNumber++,
            weight_kg: Math.max(2.5, roundTo(workingKg * 0.6, 2.5)),
            reps: 8,
            set_type: 'warmup',
            logged_via: 'manual',
          });
        }
        const workingSets = 3;
        for (let s = 0; s < workingSets; s++) {
          // Last working set occasionally drops a rep or two — real fatigue.
          const reps = Math.max(3, e.reps - (s === workingSets - 1 && rand() < 0.5 ? 1 + Math.floor(rand() * 2) : 0));
          setRows.push({
            workout_exercise_id: weByPos.get(i),
            set_number: setNumber++,
            weight_kg: workingKg,
            reps,
            set_type: 'normal',
            logged_via: 'manual',
          });
        }
      });
      const { error: sErr } = await admin.from('sets').insert(setRows);
      if (sErr) throw sErr;

      created++;
      setsWritten += setRows.length;
    }
  }

  console.log(
    `Done: ${created} workout(s) created, ${skipped} skipped (existing/rest-day/future), ${setsWritten} sets.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
