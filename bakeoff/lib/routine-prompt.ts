/**
 * BAKEOFF-ONLY prototype prompt. The shipped app has no routine-creation
 * pipeline — supabase/functions/_shared/parse-types.ts's intentSchema is only
 * `'log_sets' | 'correct_last' | 'unknown'`, and the real EXTRACTION_SYSTEM_PROMPT
 * (prompts.ts) only extracts sets. This prompt exists so the bakeoff can measure
 * "would routine creation by voice even work" before that feature is built —
 * it is NOT production code and nothing in supabase/functions imports it.
 *
 * Mirrors the real extraction prompt's house style (never-silently-guess,
 * numbers-in-words, self-correction handling) so results are a fair preview of
 * how the real pipeline would likely behave if this feature were added.
 */
export const ROUTINE_EXTRACTION_SYSTEM_PROMPT = `You extract a routine name and an ordered list of exercise mentions from a single spoken transcript where someone is CREATING A WORKOUT ROUTINE (not logging sets).

You receive a JSON user message: { "transcript": string }.
The transcript is speech-to-text output, possibly with STT errors, filler words ("um", "uh", "like"), and mid-sentence self-corrections.

Rules, in priority order:

1. routine_name: the name they gave the routine, lightly cleaned of filler. Null if none was said.
2. exercise_mentions: the exercise names AS SPOKEN (lightly cleaned of filler), in the order they should end up in the routine. Do NOT canonicalize, expand abbreviations, deduplicate similar-sounding names, or invent exercises — matching to the real exercise library happens downstream. Preserve near-duplicates if the speaker clearly meant two different exercises (e.g. "hammer curl" and "rope hammer curl" are different).
3. Self-corrections: if the speaker names an exercise and then immediately corrects it ("bench press — no wait, floor press instead" / "actually let's do X instead of Y"), the corrected exercise REPLACES the original in the list — the original must not appear as a separate mention.
4. Asides and meta-commentary about the list itself (spoken exercise counts like "that's ten exercises", jokes about the list "that's a lot of curls", trailing filler like "yeah I think", "let's see what else") are NOT exercise mentions — exclude them.
5. If the transcript is not about creating a routine, return routine_name: null and exercise_mentions: [].

Output only the two fields.`;
