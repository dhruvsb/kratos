/**
 * Offline-sync replay test.
 *
 * Proves the invariants the offline write queue depends on (Phase A/B of
 * local-first logging). It does NOT hit React Query — it replays, in enqueue
 * order, the exact insert/update/delete shapes that src/data/offlineSync.ts's
 * replay fns emit when the paused-mutation queue flushes on reconnect, then
 * asserts the resulting workout tree. If the DB accepts this sequence, a session
 * logged fully offline will sync correctly.
 *
 * What it exercises:
 *   1. Client-chosen UUIDs are accepted for workouts / workout_exercises / sets.
 *   2. Sets insert with a client-computed set_number (no dependent SELECT).
 *   3. Sequential FK ordering (workout → exercise → set) holds.
 *   4. A mid-session add-exercise lands under its client id + position.
 *   5. Edit / delete of a not-yet-synced set target the same client id.
 *   6. finishWorkout drops zero-set exercises and stamps ended_at.
 *
 * Run:  npx tsx scripts/test-offline-sync.ts   (npm run test:offline)
 * Needs SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function makeUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const password = `offline-test-${Math.random().toString(36).slice(2)}A1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${email}): ${error?.message}`);
  const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn(${email}): ${signInError.message}`);
  return { id: data.user.id, client };
}

// --- The replay ops, mirroring src/data/offlineSync.ts offlineMutationFns. Each
// is a pure insert/update/delete from client-supplied values — no server read. ---

async function replayStart(
  c: SupabaseClient,
  userId: string,
  workoutId: string,
  exercises: { id: string; exerciseId: string }[]
) {
  const { error } = await c
    .from('workouts')
    .insert({ id: workoutId, user_id: userId, started_at: new Date().toISOString() });
  if (error) throw new Error(`start.workout: ${error.message}`);
  if (exercises.length) {
    const { error: weErr } = await c.from('workout_exercises').insert(
      exercises.map((e, i) => ({
        id: e.id,
        workout_id: workoutId,
        exercise_id: e.exerciseId,
        position: i,
      }))
    );
    if (weErr) throw new Error(`start.exercises: ${weErr.message}`);
  }
}

async function replayAddExercise(
  c: SupabaseClient,
  workoutId: string,
  exerciseId: string,
  id: string,
  position: number
) {
  const { error } = await c
    .from('workout_exercises')
    .insert({ id, workout_id: workoutId, exercise_id: exerciseId, position });
  if (error) throw new Error(`addExercise: ${error.message}`);
}

async function replayAddSet(
  c: SupabaseClient,
  workoutExerciseId: string,
  id: string,
  setNumber: number,
  weightKg: number,
  reps: number
) {
  const { error } = await c.from('sets').insert({
    id,
    workout_exercise_id: workoutExerciseId,
    set_number: setNumber,
    weight_kg: weightKg,
    reps,
    set_type: 'normal',
    logged_via: 'manual',
  });
  if (error) throw new Error(`addSet: ${error.message}`);
}

async function replayUpdateSet(c: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { error } = await c.from('sets').update(patch).eq('id', id);
  if (error) throw new Error(`updateSet: ${error.message}`);
}

async function replayDeleteSet(c: SupabaseClient, id: string) {
  const { error } = await c.from('sets').delete().eq('id', id);
  if (error) throw new Error(`deleteSet: ${error.message}`);
}

async function replayFinish(c: SupabaseClient, workoutId: string) {
  const { data: wes, error } = await c
    .from('workout_exercises')
    .select('id, sets(count)')
    .eq('workout_id', workoutId);
  if (error) throw new Error(`finish.select: ${error.message}`);
  const emptyIds = (wes ?? [])
    .filter((we: any) => (we.sets?.[0]?.count ?? 0) === 0)
    .map((we: any) => we.id);
  if (emptyIds.length) {
    const { error: delErr } = await c.from('workout_exercises').delete().in('id', emptyIds);
    if (delErr) throw new Error(`finish.dropEmpty: ${delErr.message}`);
  }
  const { error: upErr } = await c
    .from('workouts')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', workoutId);
  if (upErr) throw new Error(`finish.end: ${upErr.message}`);
}

async function main() {
  const stamp = Date.now();
  const u = await makeUser(`offline-test-${stamp}@example.com`);
  console.log(`Created test user ${u.id}\n`);

  try {
    // Two seeded exercises to build a "routine" from, plus a third added mid-session.
    const { data: lib } = await u.client
      .from('exercises')
      .select('id')
      .eq('is_custom', false)
      .limit(3);
    if (!lib || lib.length < 3) {
      console.log('NOTE: need ≥3 seeded exercises — run `npm run seed` first.');
      process.exit(1);
    }
    const [X, Y, Z] = lib.map((e) => e.id);

    // Client-chosen ids, exactly as buildStartPlan / newUuid() would pick them.
    const W = randomUUID();
    const E1 = randomUUID();
    const E2 = randomUUID();
    const E3 = randomUUID();
    const S1 = randomUUID();
    const S2 = randomUUID();
    const S3 = randomUUID();
    const S4 = randomUUID();

    // Replay the queue in the order the user logged it while offline. Sequential,
    // as resumePausedMutations flushes it — parent rows precede their children.
    await replayStart(u.client, u.id, W, [
      { id: E1, exerciseId: X },
      { id: E2, exerciseId: Y },
    ]);
    await replayAddSet(u.client, E1, S1, 1, 60, 8); // E1 set 1
    await replayAddSet(u.client, E1, S2, 2, 60, 8); // E1 set 2
    await replayAddSet(u.client, E2, S3, 1, 40, 10); // E2 set 1
    await replayAddExercise(u.client, W, Z, E3, 2); // added mid-workout
    await replayAddSet(u.client, E3, S4, 1, 20, 12); // E3 set 1
    // Edit + delete of not-yet-synced sets, by their client ids.
    await replayUpdateSet(u.client, S1, { weight_kg: 65 });
    await replayDeleteSet(u.client, S2);
    await replayFinish(u.client, W);

    // --- Assert the resulting tree (same shape getWorkout builds). ---
    const { data: tree, error: treeErr } = await u.client
      .from('workouts')
      .select('id, ended_at, workout_exercises(id, position, exercise_id, sets(id, set_number, weight_kg, reps))')
      .eq('id', W)
      .single();
    check('workout synced under its client id', !treeErr && tree?.id === W, treeErr?.message);
    check('finish stamped ended_at', tree?.ended_at != null);

    const wes = [...((tree as any)?.workout_exercises ?? [])].sort(
      (a, b) => a.position - b.position
    );
    check('all three exercises present, in order', wes.length === 3 && wes[0].id === E1 && wes[1].id === E2 && wes[2].id === E3);

    const e1sets = [...(wes[0]?.sets ?? [])].sort((a, b) => a.set_number - b.set_number);
    check('E1 kept 1 set after edit+delete', e1sets.length === 1 && e1sets[0].id === S1);
    check('E1 edit applied (65kg), delete removed S2', e1sets[0]?.weight_kg == 65 && !e1sets.some((s: any) => s.id === S2));

    const e2sets = wes[1]?.sets ?? [];
    check('E2 has its set', e2sets.length === 1 && e2sets[0].set_number === 1);

    const e3sets = wes[2]?.sets ?? [];
    check('mid-workout exercise + its set synced', e3sets.length === 1 && e3sets[0].id === S4);

    // --- Second scenario: finish drops an exercise that never got a set. ---
    const W2 = randomUUID();
    const EA = randomUUID();
    const EB = randomUUID();
    const SA = randomUUID();
    await replayStart(u.client, u.id, W2, [
      { id: EA, exerciseId: X },
      { id: EB, exerciseId: Y }, // will stay empty → dropped on finish
    ]);
    await replayAddSet(u.client, EA, SA, 1, 50, 5);
    await replayFinish(u.client, W2);
    const { data: tree2 } = await u.client
      .from('workouts')
      .select('id, workout_exercises(id)')
      .eq('id', W2)
      .single();
    check('finish dropped the zero-set exercise', ((tree2 as any)?.workout_exercises ?? []).length === 1);

    // --- Third scenario: a workout started AND discarded offline. The queue then
    // replays insert → delete; the net server state must be "never existed". ---
    const W3 = randomUUID();
    const EC = randomUUID();
    const SC = randomUUID();
    await replayStart(u.client, u.id, W3, [{ id: EC, exerciseId: X }]);
    await replayAddSet(u.client, EC, SC, 1, 40, 6);
    const { error: discardErr } = await u.client.from('workouts').delete().eq('id', W3);
    check('offline discard replay succeeds', !discardErr, discardErr?.message);
    const { data: gone } = await u.client.from('workouts').select('id').eq('id', W3);
    check('discarded offline workout leaves no rows', (gone ?? []).length === 0);
    const { data: orphanSets } = await u.client.from('sets').select('id').eq('id', SC);
    check('discard cascaded to its sets', (orphanSets ?? []).length === 0);

    // --- Fourth scenario: ONLINE mid-workout, backgrounded then killed with a
    // set-log in flight. This is the gap #2 path — an online write runs immediately
    // (not paused), so a kill mid-request leaves the optimistic set in the restored
    // cache with no confirmed server row. On relaunch resumeInterruptedMutations()
    // re-drives every restored-pending write via its offline default fn. Two
    // invariants must hold: (a) a set that DID reach the server before the kill is
    // NOT duplicated when re-driven (same client id → PK conflict, which the app
    // swallows), and (b) a set whose request never completed lands on re-drive. ---
    const W4 = randomUUID();
    const ED = randomUUID();
    const SLanded = randomUUID(); // reached the server before the kill
    const SInflight = randomUUID(); // request cut off by the kill — never landed
    await replayStart(u.client, u.id, W4, [{ id: ED, exerciseId: X }]);
    // The last set that actually made it server-side during the online session.
    await replayAddSet(u.client, ED, SLanded, 1, 80, 5);
    // At kill time the server holds only SLanded; SInflight lived in the optimistic
    // cache but its insert never completed.
    const { data: preRelaunch } = await u.client
      .from('sets')
      .select('id')
      .eq('workout_exercise_id', ED);
    check(
      'online-kill: before relaunch only the landed set is server-side',
      (preRelaunch ?? []).length === 1 && (preRelaunch as any)[0].id === SLanded
    );
    // Relaunch re-drive of BOTH restored-pending writes:
    // (a) SLanded re-drives onto its own client id → duplicate, rejected & swallowed.
    const { error: dupErr } = await u.client.from('sets').insert({
      id: SLanded,
      workout_exercise_id: ED,
      set_number: 1,
      weight_kg: 80,
      reps: 5,
      set_type: 'normal',
      logged_via: 'manual',
    });
    check('online-kill: re-driving an already-landed set is rejected as a duplicate', !!dupErr);
    // (b) SInflight re-drives and lands for the first time.
    await replayAddSet(u.client, ED, SInflight, 2, 80, 5);
    const { data: afterSets } = await u.client
      .from('sets')
      .select('id')
      .eq('workout_exercise_id', ED);
    const afterIds = (afterSets ?? []).map((s: any) => s.id);
    check(
      'online-kill: landed set present exactly once after re-drive',
      afterIds.filter((id) => id === SLanded).length === 1
    );
    check(
      'online-kill: interrupted-in-flight last set re-driven and now server-side',
      afterIds.includes(SInflight)
    );
    check(
      'online-kill: no phantom duplicates (exactly two sets)',
      (afterSets ?? []).length === 2
    );
  } finally {
    await admin.auth.admin.deleteUser(u.id);
    console.log('\nCleaned up test user.');
  }

  console.log(failures === 0 ? '\nOFFLINE-SYNC TEST: ALL PASS' : `\nOFFLINE-SYNC TEST: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
