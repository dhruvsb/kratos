# Agent Protocol — how to work in this repo (read every session)

Operating rules for Claude Code sessions here, tuned for **lots of parallel work** (multiple
chats/agents at once). Keep this file short; it's loaded into every session.

## 1. At session start — orient from the docs, not the whole codebase
- **Read [`CONTEXT.md`](./CONTEXT.md) first** — the dashboard (current state / pending / open issues).
- Open a deeper doc **only when the task needs it**: `PRODUCT-PRINCIPLES.md` (the "why"),
  `../CLAUDE.md` + `../AGENTS.md` (hard rules), `PROJECT-SUMMARY-PHASE1/2.md` (built state),
  `FEEDBACK-LOG.md` (open UX feedback), `WORK-LOG.md` (dated history).
- These answer "what exists and why" without re-reading the code. Don't restate what they already say.

## 2. Parallel work — one working tree, shared by all chats
Unless a chat is running in its own git worktree, **every chat here edits the same folder and the
same git repo.** Consequences:
- Edits from different chats **combine on disk automatically** — there is no branch to merge and no
  conflict markers. The real risk is **silent clobbering** (two chats editing the same file/function).
- **Commit once, from any single chat.** `git add -A` captures every chat's work. Do **not** switch to
  the other chats to "also commit" — they'll show a clean tree and re-committing does nothing.
- **Before committing a combined batch, verify it's coherent:** `tsc --noEmit` clean; if `package.json`
  changed, confirm the new deps are installed and the lockfile is in sync; skim any file two chats
  touched to confirm both changes survived.
- Big intermingled pile? **Checkpoint first** (`git add -A && git commit`) as a recovery anchor, then
  optionally `git reset --soft HEAD~1` to re-split into cleaner commits — reversible because of the checkpoint.
- Need true isolation between chats? Run one in its **own git worktree/branch**.

## 3. On a completion step (a fix or feature is done AND verified) — update + commit the docs
A step isn't "done" until the docs reflect it and it's committed. Update **only** what changed meaning:
- **`CONTEXT.md`** — the three live sections (Current state / Pending / Open issues) + the "Last
  updated" banner. This is the dashboard; keep edits to one or two lines.
- **`WORK-LOG.md`** — one dated entry, newest at top: *what changed and why*, not a diff dump.
- **`PROJECT-SUMMARY-PHASE1/2.md`** — only if the built/decided state actually changed.
- **`FEEDBACK-LOG.md`** — if the work was feedback-driven, flip the item to **Done** (or note **Still open**).
- **Commit code + its docs together**, clear message. There's **no git remote** — a commit *is* the
  durable save (that's what "upload" means here).
- **Verify before claiming done:** `tsc` clean; for UI, run/screenshot it. Report failures honestly.

## 4. Keep the docs lean (anti-bloat — this matters)
- Docs capture **what exists and why**, not every detail. If the code or git history already says it,
  don't repeat it in a doc.
- **Prefer editing an existing line to adding a new one; delete stale lines.**
- `CONTEXT.md` is a dashboard — keep it short. Detail belongs in `WORK-LOG.md` or the phase summaries.
- One fact lives in one place. **Link** between docs instead of duplicating.
