/**
 * Loads bakeoff secrets. Reuses the repo .env (OPENAI_API_KEY, SUPABASE_*) and
 * layers bakeoff/.env.local on top for the extra ASR-vendor keys, so you never
 * have to touch the app's .env to add a provider. Import this for its side
 * effect once, at the top of every command:  import './lib/env';
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from 'dotenv';

// App .env first (OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
config({ path: path.resolve(__dirname, '../../.env') });

// Bakeoff-only vendor keys (DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, ...). These
// override nothing already set, they only add.
const localEnv = path.resolve(__dirname, '../.env.local');
if (existsSync(localEnv)) config({ path: localEnv });
