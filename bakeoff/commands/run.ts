/**
 * `run` — the one-shot: transcribe every recording with every configured
 * provider (using the cache), then score and write the report.
 *
 *   npx tsx bakeoff/commands/run.ts
 *   npx tsx bakeoff/commands/run.ts --providers openai,deepgram --keyterms routine
 *   npx tsx bakeoff/commands/run.ts --no-e2e         # ASR-quality only
 *   npx tsx bakeoff/commands/run.ts --lang en-US     # A/B the locale
 */
import '../lib/env.ts';
import { parseCommonFlags } from './_util.ts';
import { runTranscribe } from './transcribe.ts';
import { runScore } from './score.ts';

async function main() {
  const flags = parseCommonFlags(process.argv.slice(2));
  const out = await runTranscribe(flags);
  if (!out.pairs.length) return;
  await runScore(flags);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
