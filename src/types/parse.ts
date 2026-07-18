// App-facing entry point for the voice-parse contracts. The canonical schemas
// live in supabase/functions/_shared/parse-types.ts so the Deno edge function
// can bundle them; this re-export keeps app imports on the conventional path.
export * from '../../supabase/functions/_shared/parse-types';
