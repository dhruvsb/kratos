/**
 * Pulls voice_logs where outcome is 'edited' or 'discarded' (the pipeline got
 * something wrong) and appends them as DRAFT golden cases — expected values
 * set to what the user actually corrected to — to eval/golden/drafts.jsonl.
 *
 * These are drafts on purpose: review each one before promoting it into
 * eval/golden/v1.jsonl. A correction doesn't always mean the parse was wrong
 * (the user might have just changed their mind) — see eval/README.md.
 *
 * Run:  npx tsx scripts/harvest-eval-cases.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const DRAFTS_PATH = path.resolve(__dirname, '../eval/golden/drafts.jsonl');

interface VoiceLogRow {
  id: string;
  transcript: string;
  context: Record<string, unknown> | null;
  outcome: 'edited' | 'discarded';
  corrections: Record<string, { from: unknown; to: unknown }> | null;
}

function alreadyHarvested(): Set<string> {
  if (!existsSync(DRAFTS_PATH)) return new Set();
  return new Set(
    readFileSync(DRAFTS_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => (JSON.parse(line) as { source_voice_log_id?: string }).source_voice_log_id)
      .filter((id): id is string => !!id)
  );
}

async function main() {
  const { data, error } = await supabase
    .from('voice_logs')
    .select('id, transcript, context, outcome, corrections')
    .in('outcome', ['edited', 'discarded'])
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as VoiceLogRow[];
  const seen = alreadyHarvested();
  const fresh = rows.filter((r) => !seen.has(r.id));

  if (fresh.length === 0) {
    console.log('Nothing new to harvest.');
    return;
  }

  for (const row of fresh) {
    const draft = {
      id: `draft-${row.id.slice(0, 8)}`,
      category: 'harvested',
      transcript: row.transcript,
      context: row.context ?? undefined,
      // NOT auto-filled: corrections only tell you the fields that changed,
      // not the full expected shape. Fill in expected.{intent,must_ask,entries}
      // by hand before moving this line into v1.jsonl.
      expected: { intent: 'log_sets', must_ask: false, entries: [] },
      note: `harvested from voice_logs (${row.outcome}) — review before promoting`,
      source_voice_log_id: row.id,
      source_outcome: row.outcome,
      source_corrections: row.corrections,
    };
    appendFileSync(DRAFTS_PATH, JSON.stringify(draft) + '\n');
  }

  console.log(`Appended ${fresh.length} draft case(s) to eval/golden/drafts.jsonl`);
  console.log('Review and hand-fill `expected` on each before promoting to v1.jsonl.');
}

main();
