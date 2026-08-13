/**
 * `doctor` — readiness check. Reports which ASR providers are configured, which
 * keys are missing, whether ffmpeg is present, whether the E2E stage can run,
 * and how many recordings / ground-truth files are paired. Zero side effects.
 *
 *   npx tsx bakeoff/commands/doctor.ts
 */
import '../lib/env.ts';
import path from 'node:path';
import { hasFfmpeg } from '../lib/audio.ts';
import { ensureDirs, pairAll } from '../lib/paths.ts';
import { ALL_PROVIDERS } from '../providers/registry.ts';

function line(ok: boolean | 'warn', label: string, detail = ''): string {
  const mark = ok === true ? '✅' : ok === 'warn' ? '🟡' : '❌';
  return `${mark} ${label}${detail ? '  — ' + detail : ''}`;
}

function main() {
  ensureDirs();
  console.log('RepVoice voice-model bakeoff — doctor\n');

  console.log('ASR providers:');
  for (const p of ALL_PROVIDERS) {
    const ok = p.configured();
    const missing = p.keyEnv.filter((k) => !process.env[k]);
    console.log(
      '  ' +
        line(
          ok,
          `${p.id} (${p.label})`,
          ok ? p.keyEnv.join(', ') + ' set' : `missing ${missing.join(', ')}`
        )
    );
    if (p.note) console.log(`        ↳ ${p.note}`);
  }

  const configured = ALL_PROVIDERS.filter((p) => p.configured());
  console.log('');
  console.log(line(configured.length > 0, `${configured.length} provider(s) ready to transcribe`));

  console.log('');
  console.log('End-to-end (parse) stage:');
  console.log('  ' + line(!!process.env.OPENAI_API_KEY, 'OPENAI_API_KEY (runs the parse pipeline)'));
  const supa = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log('  ' + line(supa ? true : 'warn', 'SUPABASE_URL + SERVICE_ROLE_KEY (real exercise catalog)', supa ? 'live library' : 'will fall back to the 25-item fixture'));

  console.log('');
  console.log('Audio tooling:');
  console.log('  ' + line(hasFfmpeg() ? true : 'warn', 'ffmpeg', hasFfmpeg() ? 'present (16k WAV conversion available)' : 'not found — files sent as-is (fine for most providers)'));

  console.log('');
  const { pairs, orphanAudio, orphanGt } = pairAll();
  console.log('Corpus:');
  console.log('  ' + line(pairs.length > 0, `${pairs.length} paired recording(s)`, `in ${path.relative(process.cwd(), path.dirname(pairs[0]?.audioPath ?? 'bakeoff/recordings/x'))}`));
  if (orphanAudio.length) console.log('  ' + line('warn', `${orphanAudio.length} recording(s) without ground truth`, 'run `init` to scaffold stubs'));
  if (orphanGt.length) console.log('  ' + line('warn', `${orphanGt.length} ground-truth file(s) with no audio`, orphanGt.join(', ')));

  const withRef = pairs.filter((p) => p.gt.reference_transcript).length;
  console.log('  ' + line(withRef > 0 ? true : 'warn', `${withRef}/${pairs.length} have a reference_transcript`, 'WER/NEER need it; E2E does not'));

  console.log('\nNext: `init` to scaffold ground truth, then `run` to transcribe + score.');
}

main();
