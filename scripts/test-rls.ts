/**
 * RLS two-account test (Phase 1 acceptance criterion for user story 8).
 *
 * Creates two throwaway users with the service role, writes a workout as user A,
 * then verifies user B cannot see or modify it through the anon-key client.
 *
 * Run:  npx tsx scripts/test-rls.ts
 * Needs SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
  const password = `rls-test-${Math.random().toString(36).slice(2)}A1!`;
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

async function main() {
  const stamp = Date.now();
  const a = await makeUser(`rls-test-a-${stamp}@example.com`);
  const b = await makeUser(`rls-test-b-${stamp}@example.com`);
  console.log(`Created test users A=${a.id} B=${b.id}\n`);

  try {
    // A creates a workout with one exercise and one set.
    const { data: workout, error: wErr } = await a.client
      .from('workouts')
      .insert({ user_id: a.id, started_at: new Date().toISOString() })
      .select()
      .single();
    if (wErr || !workout) throw new Error(`A insert workout: ${wErr?.message}`);

    const { data: exercise } = await a.client
      .from('exercises')
      .select('id')
      .eq('is_custom', false)
      .limit(1)
      .maybeSingle();

    let workoutExerciseId: string | null = null;
    if (exercise) {
      const { data: we, error: weErr } = await a.client
        .from('workout_exercises')
        .insert({ workout_id: workout.id, exercise_id: exercise.id, position: 0 })
        .select()
        .single();
      if (weErr) throw new Error(`A insert workout_exercise: ${weErr.message}`);
      workoutExerciseId = we.id;
      const { error: sErr } = await a.client
        .from('sets')
        .insert({ workout_exercise_id: we.id, set_number: 1, weight_kg: 60, reps: 8 });
      check('A can insert own set', !sErr, sErr?.message);
    } else {
      console.log('NOTE: exercise library empty — run seed first for full coverage.');
    }

    // B must see nothing of A's.
    const { data: bWorkouts } = await b.client.from('workouts').select('id');
    check('B cannot select A workouts', (bWorkouts ?? []).length === 0);

    const { data: bDirect } = await b.client
      .from('workouts')
      .select('id')
      .eq('id', workout.id);
    check('B cannot select A workout by id', (bDirect ?? []).length === 0);

    if (workoutExerciseId) {
      const { data: bSets } = await b.client
        .from('sets')
        .select('id')
        .eq('workout_exercise_id', workoutExerciseId);
      check('B cannot select A sets', (bSets ?? []).length === 0);

      // Insert into A's workout must be rejected by the with-check policy.
      const { error: bInsertErr } = await b.client
        .from('sets')
        .insert({ workout_exercise_id: workoutExerciseId, set_number: 99, weight_kg: 1, reps: 1 });
      check('B cannot insert set into A workout', !!bInsertErr);
    }

    // Update/delete silently affect 0 rows under RLS — verify via A.
    await b.client.from('workouts').update({ notes: 'hacked' }).eq('id', workout.id);
    await b.client.from('workouts').delete().eq('id', workout.id);
    const { data: after } = await a.client
      .from('workouts')
      .select('notes')
      .eq('id', workout.id)
      .single();
    check('B update/delete had no effect', after !== null && after.notes !== 'hacked');

    // Both can read the seeded (non-custom) library.
    const { data: bExercises, error: bExErr } = await b.client
      .from('exercises')
      .select('id')
      .eq('is_custom', false)
      .limit(1);
    check('B can read seeded exercises', !bExErr && bExercises !== null);

    // B cannot read A's profile.
    const { data: bProfiles } = await b.client
      .from('profiles')
      .select('user_id')
      .eq('user_id', a.id);
    check('B cannot read A profile', (bProfiles ?? []).length === 0);
  } finally {
    await admin.auth.admin.deleteUser(a.id);
    await admin.auth.admin.deleteUser(b.id);
    console.log('\nCleaned up test users.');
  }

  console.log(failures === 0 ? '\nRLS TEST: ALL PASS' : `\nRLS TEST: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
