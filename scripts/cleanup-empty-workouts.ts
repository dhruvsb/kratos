/**
 * Delete finished workouts that logged nothing — empty shells with zero sets
 * (and, after finishWorkout drops zero-set exercises, zero exercises too). These
 * accumulate from testing: an "empty workout" started and finished without logging,
 * or a routine-started workout finished before any set was checked off. They render
 * as "0 EXERCISES · 0 SETS" in History/Home and are meaningless data.
 *
 * Dry-run by default (lists what it *would* delete); pass --commit to actually delete.
 * Deletes the workout row only — workout_exercises/sets cascade — so a workout that
 * *has* logged sets is never touched. Scoped to one user; real workouts are safe.
 *
 * Run:  npx tsx scripts/cleanup-empty-workouts.ts <email> [--commit]
 *       (defaults to the dev account; dry-run unless --commit)
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

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--')) ?? 'dsooseven@gmail.com';
const commit = args.includes('--commit');

async function main() {
  const { data: usersPage, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (usersErr) throw usersErr;
  const user = usersPage.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }

  // Every finished workout with its set count (same shape History uses).
  const { data, error } = await admin
    .from('workouts')
    .select('id, started_at, external_id, routine:routines(name), workout_exercises(id, sets(count))')
    .eq('user_id', user.id)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });
  if (error) throw error;

  const empty = (data ?? [])
    .map((w: any) => {
      const setCount = (w.workout_exercises ?? []).reduce(
        (sum: number, we: any) => sum + (we.sets?.[0]?.count ?? 0),
        0
      );
      return {
        id: w.id as string,
        name: (w.routine?.name as string) ?? 'Empty workout',
        startedAt: w.started_at as string,
        externalId: (w.external_id as string) ?? null,
        exerciseCount: (w.workout_exercises ?? []).length,
        setCount,
      };
    })
    .filter((w) => w.setCount === 0);

  console.log(`Finished workouts for ${email}: ${(data ?? []).length}; empty (0 sets): ${empty.length}`);
  for (const w of empty) {
    const date = new Date(w.startedAt).toISOString().slice(0, 10);
    const tag = w.externalId ? ` [${w.externalId}]` : '';
    console.log(`  - ${date}  ${w.name}  (${w.exerciseCount} ex, ${w.setCount} sets)${tag}  ${w.id}`);
  }

  if (empty.length === 0) {
    console.log('Nothing to delete.');
    return;
  }
  if (!commit) {
    console.log('\nDry run — pass --commit to delete the above.');
    return;
  }

  const ids = empty.map((w) => w.id);
  const { error: delErr, count } = await admin
    .from('workouts')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (delErr) throw delErr;
  console.log(`\nDeleted ${count ?? ids.length} empty workout(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
