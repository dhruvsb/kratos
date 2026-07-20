# RepVoice — Product Principles

**Read this before any development work.** These are the standing priorities behind every
design and engineering decision in this app. When a request would compromise one of these,
**stop and flag it before implementing** — don't silently trade a priority away (see
§"Decision protocol").

This file is the *why*. `CLAUDE.md` is the *how* (hard rules, stack, conventions). If the
two ever conflict, raise it — don't guess.

---

## 0. Why this app exists

RepVoice is **not** a commercial product and its primary purpose is **not** the author's own
daily use. It is a **portfolio / showcase piece**. It will be judged as:

- **Screenshots** — on a social profile, résumé, or product portfolio.
- **Screen recordings / demo videos** — the workout-logging loop shown end to end.
- **Live hands-on** — in an interview, someone says *"can I try it?"*, downloads it on their
  own phone, and uses it cold, with no coaching from the author.

Every decision serves one of those three surfaces. If a change doesn't make the app look
better in a screenshot, feel faster in a recording, or work more obviously in a stranger's
hands — question whether it's worth doing.

---

## 1. The two top priorities (in tension-breaking order)

### Priority A — A visually unique, sleek UI that minimizes interactions
- The design should look **distinctive and intentional**, not like a template or a generic
  CRUD app. The "LED-instrument / voice-first" language is the identity — commit to it.
- **Fewest possible touches to get work done.** Every tap removed from the core loop
  (start → log a set → done) is a win. Voice-first and zero-tap paths beat menus.
- It must **photograph well**: clean hierarchy, generous negative space, no visual clutter,
  no debug affordances or placeholder text visible in any state a viewer could screenshot.

### Priority B — Instant loading, logging, and transitions
- Screen transitions and logging actions must feel **immediate** — no spinners the user
  waits on, no perceptible lag between "I did a thing" and "the UI reflects it."
- **Perceived speed > actual completeness.** It is explicitly OK to compromise on
  animations, heavy effects, or non-essential functionality to keep things instant. The
  author has said this directly: minor animation/feature cuts are acceptable trades.
- Optimize the *common* path (logging a set, moving between screens) even at the cost of
  rare paths.

### Tension-breaking rule
A and B rarely conflict, but when they do (e.g. a lush animation that adds latency),
**B wins** — cut the animation. A sleek app that stutters reads worse in a demo than a
sleek app that's plain but instant.

---

## 2. The "stranger can use it cold" bar

Because an interviewer may download and drive it themselves with zero guidance:

- **No dead ends.** The app must never get stuck on a page, show a blank screen, or leave
  the user with no obvious next action or way back.
- **No confusion.** Labels, states, and affordances must be self-evident. If a first-time
  user could hesitate, the design isn't done.
- **Nothing bloated or unexplained** in view — no half-built features, no dev-only UI, no
  jargon a non-lifter wouldn't understand.

---

## 3. What "done" means for any change (checklist)

Before considering a change complete, confirm:

- [ ] **Fast:** no new blocking spinner on the common path; transitions stay instant.
      Logging feels immediate (optimistic UI where the write isn't instant).
- [ ] **Few taps:** the change didn't add steps to the core loop; ideally removed some.
- [ ] **Screenshot-clean:** every visible state (including empty, loading, and error) looks
      intentional and aesthetic — no debug links, no placeholder/lorem, no raw hex (use
      `src/theme/tokens.ts`).
- [ ] **No dead ends:** every state has a clear next action and a way back.
- [ ] **On-brand:** uses the design tokens and the LED-instrument visual language.

---

## 4. Decision protocol (how to raise conflicts)

When a request (from the author or implied by a task) risks violating a priority above:

1. **Pause before implementing.** Don't quietly pick a side.
2. **Name the specific tension** — which priority, and how the request pushes against it.
3. **Offer the trade-off options** with a recommendation, then let the author decide.

Example: *"Adding a confirmation dialog here makes logging safer, but it adds a tap to the
core loop (Priority A) and a beat of latency (Priority B). I'd skip it and rely on the undo
window instead — okay?"*

---

## 5. Author's suggested additions (Claude's recommendations — prune freely)

These aren't yet confirmed by the author; they're proposed because they directly serve §0–§2:

- **First-run friction is the #1 demo risk.** Email OTP login (current auth) is exactly the
  kind of thing that strands an interviewer who downloads the app cold — they'd need email
  access and a code before seeing anything. Strongly consider a **guest / demo mode** or a
  pre-seeded demo account so the app is usable in <5 seconds from a fresh install. This is
  the single biggest gap against the "stranger uses it cold" bar.
- **Seed demo data for empty states.** A fresh install has no workouts, so the console,
  tape, and history screens render empty — bad for screenshots *and* for a hands-on trial.
  Either ship sample data or make empty states genuinely beautiful and self-explanatory.
- **Optimistic updates everywhere on the write path.** Logging a set should hit the UI
  instantly and sync in the background (React Query optimistic mutations), never block on
  the network. Same for start-workout and edits.
- **Prefetch + skeletons, not spinners.** Prefetch the next likely screen's data; if
  something must load, show a themed skeleton, never a bare spinner the user stares at.
- **Hide dev surfaces in any shippable/demo build.** The `/dev/telemetry` link and similar
  must not be reachable or visible in a build someone might screenshot or install.
- **Lock the status bar / chrome for capture.** Consistent time, full signal/battery, dark
  theme — so screenshots and recordings look deliberate.
- **Set rough perf budgets** so "fast" is testable, e.g. screen transition < ~150 ms,
  log-set perceived response < ~100 ms. Adjust the numbers, but have targets.

When the author confirms or rejects any of these, move the confirmed ones up into §1–§3 and
delete the rest from this section.
