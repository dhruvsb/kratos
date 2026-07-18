# Work Log

Append-only, dated log of individual sessions. This is the **history**; the
`PROJECT-SUMMARY-PHASE*.md` files are the **current-state snapshot**. When you finish a
session, add an entry here (newest at the top) and update the relevant summary file's
status table/decisions — don't let the two drift apart.

---

## 2026-07-18 — Phase 2 backend: parsing pipeline

**Session scope:** Phase 2 only (Phase 1 is being built in a parallel session).

**Built:**
- Shared `ParseResult` / `ParseContext` zod schemas (`supabase/functions/_shared/parse-types.ts`)
- Extraction + exercise-resolution prompts and LLM call logic
- Exercise matching: exact → trigram fuzzy → LLM-pick-from-candidates, never free-generated
- `parse-utterance` Supabase Edge Function (auth-guarded, logs telemetry to `voice_logs`)
- `0002_voice_logs.sql` migration: `voice_logs` table + `search_exercise_candidates()` SQL function
- Cost-tracking constants for Claude Haiku 4.5 (default parsing model) and Claude Sonnet 5
  (mid-tier comparison model)
- 25-exercise in-memory fixture, standing in for the real library until Phase 1 seeds it

**Not done / next up:** `parse-cli.ts` local test script, the eval golden set + runner,
model-comparison mode, the voice capture UI, the telemetry dashboard. See
`PROJECT-SUMMARY-PHASE2.md` § 2 for the full status table.

**Decisions made this session:** see `PROJECT-SUMMARY-PHASE2.md` § 4 (not duplicated
here — that file is the source of truth for current decisions).
