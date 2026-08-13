/**
 * `qa-deployed` — end-to-end smoke test of the SHIPPING voice path.
 *
 * Unlike `score.ts` (which runs the parse pipeline in-process), this drives the
 * actually-DEPLOYED Supabase edge functions exactly as the app does:
 *
 *   recording.m4a → transcribe fn (gpt-transcribe) → parse-utterance fn → rows,
 *   scored against bakeoff/ground-truth (routine EM + workout EM).
 *
 * It's the "is the live pipeline healthy?" check after a deploy / key change /
 * prompt edit. Auth: mints a real user JWT with the service-role key (admin OTP
 * → verify), since the functions are auth-guarded. Costs a little OpenAI usage
 * per run (real ASR + parse). Needs the local recordings in bakeoff/recordings.
 *
 *   npm run bake:qa
 */
import '../lib/env.ts';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from '../config.ts';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = process.env.QA_EMAIL || 'dsooseven@gmail.com';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const j = (o: unknown) => JSON.stringify(o);

/** Mint a user access token (functions are auth-guarded): admin OTP → verify. */
async function userToken(): Promise<string> {
  const gen = await fetch(`${URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: j({ type: 'magiclink', email: EMAIL }),
  }).then((r) => r.json());
  const otp = gen?.properties?.email_otp ?? gen?.email_otp;
  if (!otp) throw new Error('no OTP from generate_link: ' + j(gen));
  const ver = await fetch(`${URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: j({ type: 'email', email: EMAIL, token: otp }),
  }).then((r) => r.json());
  if (!ver?.access_token) throw new Error('verify returned no token: ' + j(ver));
  return ver.access_token;
}

async function transcribe(token: string, file: string): Promise<string> {
  const audio_base64 = readFileSync(path.join(PATHS.recordings, file)).toString('base64');
  const r = await fetch(`${URL}/functions/v1/transcribe`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: j({ audio_base64, mime_type: 'audio/m4a', filename: file }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`transcribe ${r.status}: ${j(d)}`);
  return d.text ?? '';
}

async function parse(token: string, transcript: string): Promise<any> {
  const r = await fetch(`${URL}/functions/v1/parse-utterance`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: j({
      transcript,
      context: { session_exercises: [], recent_exercises: [], default_unit: 'kg' },
      stt_source: 'gpt-transcribe',
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`parse ${r.status}: ${j(d)}`);
  return d.result;
}

function scoreRoutine(gt: any, res: any) {
  const want: string[] = gt.routine_exercises ?? [];
  const gotNames: string[] = (res.routine?.exercises ?? []).map((e: any) => e.name).filter(Boolean);
  const resolvedMatched = want.filter((w) => gotNames.some((g) => norm(g) === norm(w))).length;
  const unresolved = (res.routine?.exercises ?? []).filter((e: any) => !e.exercise_id).length;
  const spurious = gotNames.filter((g) => !want.some((w) => norm(w) === norm(g))).length;
  const nameMatch = norm(res.routine?.name ?? '') === norm(gt.routine ?? '');
  const em = nameMatch && resolvedMatched === want.length && spurious === 0 && unresolved === 0;
  return {
    em,
    detail: `name ${nameMatch ? 'OK' : `"${res.routine?.name}"≠"${gt.routine}"`} · exercises ${resolvedMatched}/${want.length}${unresolved ? ` · ${unresolved} unresolved` : ''}${spurious ? ` · ${spurious} spurious` : ''}`,
  };
}

function scoreLog(gt: any, res: any) {
  const byName = new Map<string, string[]>();
  for (const e of res.entries ?? []) {
    const nm = norm(e.exercise?.name ?? e.exercise?.raw ?? '');
    const arr = byName.get(nm) ?? [];
    for (let i = 0; i < Math.max(1, e.sets_count); i++) arr.push(`${e.weight_kg}x${e.reps}`);
    byName.set(nm, arr);
  }
  let exOk = 0;
  const notes: string[] = [];
  for (const ex of gt.exercises ?? []) {
    const got = byName.get(norm(ex.name));
    if (!got) { notes.push(`MISS ${ex.name}`); continue; }
    const wantSets = ex.sets.map((s: any) => `${s.weight_kg}x${s.reps}`).sort();
    if (j(wantSets) === j([...got].sort())) exOk++;
    else notes.push(`${ex.name} [${[...got].sort()}]≠[${wantSets}]`);
  }
  const spurious = [...byName.keys()].filter((k) => !(gt.exercises ?? []).some((e: any) => norm(e.name) === k)).length;
  const em = exOk === (gt.exercises ?? []).length && spurious === 0;
  return { em, detail: `exercises ${exOk}/${(gt.exercises ?? []).length}${spurious ? ` · ${spurious} spurious` : ''}${notes.length ? ' · ' + notes.join('; ') : ''}` };
}

async function main() {
  const token = await userToken();
  console.log('✓ authed as', EMAIL, '\n');
  const files = readdirSync(PATHS.groundTruth).filter((f) => /^\d+\.json$/.test(f)).sort();
  const rows: { file: string; intent: string; intentOk: boolean; em: boolean; detail: string }[] = [];

  for (const gf of files) {
    const gt = JSON.parse(readFileSync(path.join(PATHS.groundTruth, gf), 'utf8'));
    try {
      const transcript = await transcribe(token, gt.audio);
      const res = await parse(token, transcript);
      const wantIntent = gt.intent === 'create_routine' ? 'create_routine' : 'log_sets';
      const intentOk = res.intent === wantIntent;
      const score = gt.intent === 'create_routine' ? scoreRoutine(gt, res) : scoreLog(gt, res);
      const em = score.em && intentOk;
      rows.push({ file: gt.audio, intent: gt.intent, intentOk, em, detail: score.detail });
      console.log(`── ${gt.audio} (${gt.intent}) ──`);
      console.log(`  transcript: ${transcript.slice(0, 140)}${transcript.length > 140 ? '…' : ''}`);
      console.log(`  intent: ${res.intent} ${intentOk ? '✓' : `✗ (want ${wantIntent})`}`);
      console.log(`  ${em ? '✅ EM' : '⚠️ '} ${score.detail}`);
      if (res.ambiguities?.length) console.log(`  asks: ${res.ambiguities.map((a: any) => a.question).join(' | ')}`);
      console.log();
    } catch (e) {
      rows.push({ file: gt.audio, intent: gt.intent, intentOk: false, em: false, detail: String(e) });
      console.log(`── ${gt.audio} (${gt.intent}) ── ERROR: ${e}\n`);
    }
  }

  const routine = rows.filter((r) => r.intent === 'create_routine');
  const log = rows.filter((r) => r.intent === 'log_workout');
  const pct = (rs: typeof rows) => (rs.length ? Math.round((rs.filter((r) => r.em).length / rs.length) * 100) : 0);
  console.log('════════ SUMMARY (deployed path) ════════');
  console.log(`Routine  EM: ${routine.filter((r) => r.em).length}/${routine.length} (${pct(routine)}%)  intent ${routine.filter((r) => r.intentOk).length}/${routine.length}`);
  console.log(`Workout  EM: ${log.filter((r) => r.em).length}/${log.length} (${pct(log)}%)  intent ${log.filter((r) => r.intentOk).length}/${log.length}`);
  for (const r of rows) console.log(`  ${r.em ? '✅' : '⚠️ '} ${r.file}  ${r.detail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
