# RepVoice — Feedback Log

Running log of hands-on feedback from real use, with a code-level verification of each
item (root cause + file references + proposed fix) so any session can pick it up. Newest
entry at top. When an item is fixed, mark it and move the detail into `WORK-LOG.md`.

---

## 2026-08-09 (10) — "Rolling Weeks" Home redesign: deferred edge states

**Context:** implementing the `RepVoice Home Rolling Weeks.dc.html` redesign (streak-first Home:
streak hero + rolling five-week heatmap + inline history + `+` quick-start sheet + 3-tab bar
HOME · ROUTINES · ACCOUNT). Per product call, we ship the **normal-case visuals first** and track
the two states the mockup doesn't draw, plus one data nicety, as backlog.

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 33 | Running-workout resume state absent from the new Home | Home / active workout | ⬜ Open | Med | S–M |
| 34 | Day-zero (first-run) state absent from the new Home | Home / onboarding | ⬜ Open | Low–Med | S |
| 35 | History rows lack the mockup's `+N PR` / `REST` tags | Home / history | ⬜ Open | Low | M |

### 33. Bring back the running-workout resume affordance ⬜ Med
The old Home (mockup 16) showed a "STILL RUNNING" card — resume / finish now / discard — when a
workout was left active. The Rolling Weeks Home doesn't draw one. **Interim safeguard in place:** a
live workout is never a hard dead-end — the shared start flow (`src/data/useStartWorkoutFlow.ts`,
used by the ROUTINES tab and the Phase-2 `+` sheet) routes straight to the active workout if one
exists (`if (activeId) router.push('/workout/'+activeId)`). Follow-up: a first-class resume banner
atop the new Home (or a state on the streak hero) so it's visible, not just reachable.

### 34. Day-zero (first-run) state on the new Home ⬜ Low–Med
The old Home had a mockup-14 empty state (two doors into the first workout + starter templates). On
the new Home a brand-new user sees streak `0`, an all-empty heatmap, and an empty-history line
(`No workouts yet…`) — functional but not a designed welcome. Follow-up: a proper day-zero treatment
(and the ROUTINES tab already has its own empty state).

### 35. History PR / REST tags ⬜ Low
The mockup tags rows `+2 PR` (accent) / `REST` (dim). The `useWorkoutList()` payload
(`WorkoutListItem`) doesn't carry PR info, and there are no "rest day" rows in real history (history
is finished workouts only). Rows currently show date · name · `N EXERCISES · N SETS · N MIN`.
Follow-up: compute per-workout PRs (cf. `getExerciseBests` used by the finish summary) if we want
the tag — cost/benefit TBD.

---

## 2026-08-08 (9) — Data durability across backgrounding / app termination

**Context:** user concern — a workout can run 60+ min, and the phone won't stay on the app the
whole time (messages, other apps, screen lock). Losing logged sets when iOS suspends/kills the
app in the background is unacceptable. User flagged this **very high priority.**

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 32 | No logging data may be lost when the app is backgrounded/killed mid-workout | Data durability | ✅ DONE (code 2026-08-12 — 3 gaps closed, test 16/16) | **High** | S–M |

---

### 32. Don't lose logged sets when the app is backgrounded or killed mid-workout ✅ High — **done (code) 2026-08-12**

**Done (2026-08-12):** all three residual gaps below closed (code only, not yet on device). (1)
Background flush: `_layout.tsx` now `flushCache()`es (`persistQueryClientSave`, bypassing the ~1s
throttle) on AppState `background`/`inactive`. (2) Online in-flight writes: `dehydrateOptions`
(`queryClient.ts`) persists still-*running* offline-logging mutations, not just RQ's paused ones
(`isOfflineMutationKey` in `offlineSync.ts`); `resumeInterruptedMutations()` serially re-drives every
restored-pending write (paused queue + interrupted-in-flight) on relaunch, FK-ordered, leaving RQ's
reconnect/focus paths paused-only. (3) `scripts/test-offline-sync.ts` gained the online
background→kill→relaunch case (`test:offline` now 16/16). Re-drive safety = client-chosen UUIDs +
`insertSet`'s idempotent PK-collision return (logging-robustness work, same batch). Not implemented:
runtime throttle-tightening for the active-workout window (background-flush is the targeted fix); the
"keep running" background-execution approach was explicitly avoided. **On-device verification pending.**

<details><summary>Original verification (2026-08-08)</summary>
**Reported:** start a workout, log 10–12 sets, switch to another app / get a message / lock the
screen for 20–30 min; iOS may suspend or terminate the app in the background. None of the logging
done so far should be lost.
**Important framing correction (the right lever isn't "keep it running"):** a normal iOS app
*cannot* keep executing in the background for 20–30 min — iOS suspends apps within seconds of
backgrounding unless they hold a specific background mode (audio, location, VoIP…), and none of
those legitimately apply to a set logger; requesting one to "stay alive" is an App Store rejection
risk and still wouldn't guarantee survival against the OS memory killer. So the correct goal is
**not** fighting the OS to stay running — it's making backgrounding *and* outright termination
completely safe through **durable persistence**, so a kill is a non-event.
**Verified — this is largely already built (local-first architecture), which is why this is a
"verify + close the gaps" item, not a from-scratch build:**
- The React Query cache persists to AsyncStorage via `PersistQueryClientProvider`
  (`_layout.tsx:28-32`, `src/lib/queryClient.ts`). Every set-log optimistically patches the cache
  (`useAddSet` `onMutate`), and the persister flushes to disk on a short throttle (RQ default
  ~1s). So logged sets land on durable storage within ~1s, independent of the network.
- Offline writes are **paused** (not rolled back) and persisted as paused mutations that survive an
  app kill, then replay **serially** in FK order on relaunch (`SerialResumeQueryClient`,
  `resumePausedMutations` in `_layout.tsx:88`; `src/data/offlineSync.ts`).
- On relaunch the persisted cache hydrates behind the splash (`BootGate`), so the in-progress
  workout + its logged sets are already on screen, and `useActiveWorkout` + the resume Home state
  (mockup 16) surface it.
- **This exact scenario was proven on-device 2026-08-06** (offline QA): logged sets → force-quit →
  relaunch → all sets intact from cache → reconnect → serial flush to Supabase. See CONTEXT.md /
  WORK-LOG 2026-08-06.
**Real residual gaps worth closing (why this stays open, not ✅):**
1. **No forced flush on background.** The persist throttle is ~1s and the AppState listener only
   re-seeds *online state* on foreground (`network.ts:77-79`) — nothing forces a synchronous cache
   persist when the app goes to `background`/`inactive`. A set logged in the ~1s before an immediate
   background→kill could miss the on-disk snapshot. Fix: on AppState `background`, trigger
   `persistQueryClient`/flush (and consider dropping the throttle to near-0 for the active-workout
   window). (S)
2. **Online in-flight writes interrupted by a kill.** When online, a set-log mutation runs
   immediately (not paused), so it isn't in the paused-mutation queue. If iOS kills the app
   mid-request, the *optimistic cache* still hydrates on relaunch (good), but there's no paused
   mutation to re-drive the network write — the row could be missing server-side until something
   re-invalidates. Fix: confirm behavior and, if needed, treat interrupted-in-flight the same as
   paused (re-enqueue on relaunch when the cached optimistic state has no confirmed server id). (M)
3. **Explicit test for this scenario.** `npm run test:offline` covers the offline queue; add/confirm
   a case for *online* mid-workout background→kill→relaunch with the last set landing server-side.
**Bottom line:** the architecture already protects the common case; this item is (a) add the
background-flush safety net, (b) verify the online-kill path, (c) lock it with a test — then it can
close. Do **not** pursue background-execution / "keep running" approaches.
</details>

---

## 2026-08-08 (8) — Feature request: remove warmup sets entirely

**Context:** user-requested. "I don't want to log the warmup set, and I don't want to see any
mention of warmup in my application." This **withdraws #29** (the warmup-ramp generator) — no point
improving a feature we're deleting.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 31 | Remove the warmup set feature — no "+ WARMUP" entry, no "W"/WARMUP labels anywhere | Logging UX / history | ✅ DONE (code 2026-08-08) | Med | S |

---

### 31. Remove warmup sets from the app ✅ Med — **done (code) 2026-08-08**
**Requested:** drop warmup entirely — the ability to log a warmup set and every visible trace of the
word "warmup".
**Verified — the manual-UI footprint is small and self-contained:**
- **Add path:** `workout/[id].tsx:416-417` renders the `+ WARMUP` button (`openAdd('warmup')`); `:179-180`
  force `kg`/`reps` to `null` for a warmup; `:199` skips the #26 auto-advance for warmups.
- **Labels:** the grid shows a `W` for warmup rows (`workout/[id].tsx:376`); history does the same plus a
  `WARMUP` tag (`history/[id].tsx:130,132-133`).
**Leave in place (not user-visible, needed for data integrity):** the `set_type` enum
(`types/db.ts:10`) and its DB check (`0001_init.sql:92-93`) — the column stays so **imported Hevy data**
that contains warmup sets still loads (`lib/hevy.ts` maps `warmup`), and the Phase-2 voice
correction UI (`VoiceConfirmationCard`) keeps the type list; voice is unwired from the manual screens
today, so it's not a visible surface. So this is a **UI-removal**, not a schema change.
**Done (2026-08-08):** the manual UI no longer references warmup anywhere. In `workout/[id].tsx`:
removed the `+ WARMUP` button, collapsed `openAdd(setType)` → `openAdd()` (always logs `normal`),
dropped the warmup-null prefill branch and the auto-advance warmup-skip, and the live grid now numbers
every row `i + 1` (no `W`). In `history/[id].tsx`: rows number `i + 1`, and the set-type tag is hidden
for warmup while **drop/failure tags stay** (imported Hevy data can still carry those). Any *existing*
warmup rows (imported/already-logged) now just show as plainly-numbered sets. As scoped, this is a
**UI-removal only** — the `set_type` enum + DB check, `lib/hevy.ts`'s warmup mapping, and the unwired
Phase-2 `VoiceConfirmationCard` type list are all untouched, so Hevy imports still load. `tsc` +
web-export green; not yet run on device.

---

## 2026-08-08 (7) — Gemini PM-lens pass: micro-interaction friction + "hyper-intelligent" ideas

**Context:** a product-management-style review from Gemini (not a device recording), focused on
shaving micro-interactions out of the logging loop and adding anticipatory features. Logged
in full below; not all items need to be built.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 26 | Auto-advance/reopen keypad for the next set after logging | Logging UX | ✅ DONE (code 2026-08-08) | Med | S |
| 28 | Progressive-overload ghost suggestion (vs. flat previous-best prefill) | Logging UX | ⬜ OPEN (builds on #3) | Low | M |

> **Withdrawn 2026-08-08 (won't do):** **#24** (predictive exercise suggestions), **#25** (swipe to
> toggle KG/REPS focus), **#27** (superset linking), **#30** (global rest timer) — dropped per product
> call. **#29** (one-tap warmup ramp) was already withdrawn, superseded by **#31** which removes warmup
> entirely (see the top of this log).

---

### 26. Auto-advance to the next set after logging ✅ Med — **done (code) 2026-08-08**
**Proposed:** after tapping the checkmark, immediately move focus to the next set's weight field
instead of requiring the user to manually reopen the keypad.
**Verified:** `onKeypadLog` (`workout/[id].tsx`) mutated the set then unconditionally called
`setKeypad(null)`, closing the sheet — no re-open/re-prefill for the next set.
**Done (2026-08-08):** after an **add** of a normal set, `onKeypadLog` now re-opens the keypad on the
next set number, pre-filled with the weight+reps just logged — a run of working sets is tap-tap-tap
without reopening. Warmups and edits still close (warmups ramp rather than repeat; edits are one-shot);
the user dismisses the chain by tapping the backdrop. The grid's one-tap ✓ (`logPending`) is unchanged
— it stays on the grid, so the two frictionless paths (chained keypad vs. grid ✓) complement each
other. Not yet run on device — verify the chain feels seamless (no sheet flicker / re-slide).

### 28. Progressive-overload ghost suggestion ⬜ Low — builds on open item #3
**Proposed:** instead of prefilling the exact previous-session numbers, show a ghosted suggested
weight *increase* when the user hit all prescribed reps last time.
**Verified:** current prefill (`workout/[id].tsx:138-139`, `settings.prefillFromLastSession`) is a
flat copy of the same-indexed last-session set — no "hit target reps → suggest +weight" logic
exists. This is explicitly the same prefill mechanism feedback **#3** (still open) already flags
for a different reason (same-index vs. all-time-best). Worth building together rather than as two
separate prefill changes.
**Fix (scope, not started):** define the progression rule (e.g. +2.5kg if all sets hit the top of
the rep range), compute it from the last session's sets vs. the routine's `target_reps_high`, show
it as a ghosted/suggested value distinct from a hard prefill. (M)

---

## 2026-08-08 (6) — Feature request: iOS Liquid Glass + 3-tab nav (History into Calendar)

**Context:** user-requested, not from a device QA pass.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 22 | Adopt iOS Liquid Glass, specifically for Home / Calendar / History chrome | Theming / design system | ⬜ OPEN | Med | L |
| 23 | Collapse to 3 tabs (Home · Calendar · Account) — move History content into Calendar, below the calendar | Navigation | ⬜ OPEN | Med | M |

---

### 22. Adopt iOS Liquid Glass (Home / Calendar / History) ⬜ Med — **conflicts with a hard rule, needs a call**
**Requested:** implement the latest iOS Liquid Glass material, specifically for the Home, Calendar,
and History screens.
**Verified:** `expo-glass-effect` (`~57.0.1`) is **already an installed dependency**
(`package.json:25`) — the Expo SDK 57 wrapper around iOS 26's native Liquid Glass API
(`GlassView` / `isLiquidGlassAvailable`) — but it's imported **nowhere** in `src/`, completely
unwired. Current chrome is flat/opaque by design: `TabBar` (`src/components/voice/TabBar.tsx`)
renders a solid `color.s1` background with a hard 1px top border; there's no `BlurView`/blur
anywhere in the component tree (checked project-wide). `theme/tokens.ts` is one flat opaque
palette consumed directly in 27 files (same finding as feedback #17).
**Conflicts with a hard rule — same shape as #17 (light theme):** `CLAUDE.md` states tokens.ts is
"the single source of truth for every color... never introduce a color/font outside the token
set," which assumes one static opaque design language. Liquid Glass is a *material*, not a color —
dynamic blur/specular-highlight/refraction that reacts to what's behind it and to motion — so it
needs specific surfaces wrapped in `GlassView` (with an `isLiquidGlassAvailable()` fallback), not a
token swap.
**Also:** Liquid Glass is iOS 26+ and iOS-only — needs an Android + older-iOS fallback path, and
needs an iOS 26 device/simulator to actually see rendered (current on-device testing has been an
iPhone 15 running whatever iOS it shipped with — check its OS version supports iOS 26 before this
is demoable).
**Fix (scope, not started):** decide which specific surfaces get glass (the bottom tab bar is the
obvious first target; calendar cards / history rows are the "specially for" ask) and wrap those in
`GlassView` behind `isLiquidGlassAvailable()`, keeping current flat token colors as the non-glass
fallback. Largest-scope item in the open backlog alongside #17 — both change the *rendering model*,
not just values, worth sequencing together rather than separately.

### 23. Collapse to 3 tabs — merge History into Calendar ⬜ Med
**Requested:** bottom nav should be **Home / Calendar / Account (Settings)** — History moves inside
the Calendar tab, below the calendar widget, so scrolling down on Calendar reveals workout history.
**Verified:** there's no shared tab-bar layout to change in one place — each of the 4 screens
(`index.tsx`, `calendar.tsx`, `history/index.tsx`, `settings.tsx`) independently renders
`<TabBar active="..." tabs={...}>` with its own hardcoded tabs array (matches the "plain Stack
routes, no Expo Router `Tabs` layout" architecture already noted in feedback #10). Calendar
(`calendar.tsx:173-288`) is a single `ScrollView`; History (`history/index.tsx`) is a `FlatList`
fed by `useWorkoutList()`'s infinite-paginated query, plus 3 stat numbers up top.
**Implementation wrinkle worth flagging:** nesting History's `FlatList` inside Calendar's
`ScrollView` hits RN's "VirtualizedLists should never be nested inside plain ScrollViews"
warning/perf issue — the merge needs either History's rows flattened into Calendar's own
`ScrollView` (loses virtualization/infinite-scroll — fine if history is usually short) or Calendar
restructured around one `FlatList` with the calendar widget as a `ListHeaderComponent`.
**Fix (scope, not started):** (1) drop the History tab from the bar, rename SETTINGS→ACCOUNT in
`TabBar`'s label/route; (2) render History's stats + grouped list beneath Calendar's existing
content, resolving the list-nesting issue above; (3) update the remaining `<TabBar>` call sites
down to 3 tabs — decide whether `history/index.tsx` as a standalone route disappears entirely or
stays reachable some other way (e.g. deep-linked from a past-workout edit flow).

---

## 2026-08-08 (5) — Routine editor: stuck keyboard + targets-on-creation-screen

**Context:** device screenshots, creating a "Biceps" routine.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 20 | Number-pad keyboard has no way to dismiss in the routine editor | Routine editor | ✅ DONE | High | S |
| 21 | Drop/defer SETS·REPS targets from routine *creation* — exercise selection only | Routine editor | ✅ DONE | Med | S |

---

### 20. Numeric keypad has no dismiss control ⬜ High
**Reported:** tapping SETS or REPS while creating a routine pops the number-pad keyboard, and
there is no way to close it — screenshot shows it still open, blocking `+ ADD EXERCISE` /
`SAVE ROUTINE` behind it, with no visible escape.
**Verified:** all three target inputs (`routine/[id].tsx:161,175,185`) use
`keyboardType="number-pad"` — on iOS this variant has **no built-in Done key** at all (unlike
`numeric`, which sometimes gets one via the software row). Checked project-wide: no
`InputAccessoryView`, no `returnKeyType`, no `Keyboard.dismiss()` call anywhere in `src/`. The
`ScrollView` does have `keyboardShouldPersistTaps="handled"` (`:107`), so tapping straight into
another input works, but tapping blank space/the header does nothing.
**Fix:** add a small `InputAccessoryView` "Done" bar shared across the three inputs via
`inputAccessoryViewID`, and/or wrap the screen in a `Pressable`/`TouchableWithoutFeedback` that
calls `Keyboard.dismiss()` on background tap. (S)
**Done (2026-08-08):** iOS `InputAccessoryView` (shared `nativeID`) with a DONE button
(`Keyboard.dismiss()`) now sits over all three numeric target inputs; the editor `ScrollView` also
got `keyboardDismissMode="on-drag"` so a scroll drops the keyboard on both platforms. Accessory is
`Platform.OS === 'ios'`-gated (no-op on Android, which has a system dismiss). `tsc` + web-export
green. NOTE: this is superseded in spirit by #21 (drop targets from creation entirely) if that
lands — but the dismiss fix is correct regardless, and targets still exist on the edit path.

### 21. Targets (SETS × REPS) don't belong on the routine-*creation* screen ✅ Med
**Requested:** while creating a routine, the screen should just be exercise selection — no
sets/reps target entry.
**Verified — and there's a concrete reason to agree:** `target_sets` / `target_reps_low` /
`target_reps_high` are written by the editor (`routine/[id].tsx`, `src/data/routines.ts`) and
typed in `src/types/db.ts`, but are **read nowhere else in the app** — not by the workout screen,
not by the prefill logic, not on Home's routine cards (checked project-wide). So today the three
target inputs are pure write-only friction (and the direct trigger for #20's stuck keyboard) with
no visible payoff yet.
**One real tradeoff:** the editor's own helper copy ("Leave targets blank and the workout screen
simply shows what you did last time") implies targets were meant to eventually feed the workout
screen as a goal/guide. Dropping them from creation is shelving a half-built feature, not just
deleting clutter — worth deciding whether targets come back later as an edit-time-only feature, or
get removed for good.
**Fix (scope, not started):** simplify the create/edit routine screen to exercise picking +
reorder only; either remove the SETS/REPS columns entirely or move them behind a secondary
"edit targets" step reached after the exercise list exists. (S once scoped)
**Done (2026-08-08):** removed the three SETS/REPS target inputs from the routine editor entirely —
each row is now just the exercise name (tappable → progress) + reorder/delete. `setRoutineExercises`
no longer receives target values, so new routines write null targets; existing routines' targets are
nulled on next save (harmless — read nowhere in the app). Removed the now-dead `InputAccessoryView`
DONE bar (feedback **#20** existed only to dismiss the number-pad on *these* inputs — with them gone
the name field is the sole input and needs no accessory), plus the `Item` target fields, `patchItem`,
`parseIntOrNull`, and the orphaned target styles. Helper note reworded to "just pick exercises + order;
log weight/reps/sets during the workout." `tsc` + web-export green; not yet on device.

---

## 2026-08-08 (4) — Feature request: multi-select exercise add + biceps/triceps split

**Context:** user-requested, routine editor.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 18 | Multi-select exercises when adding to a routine | Routine editor | ✅ DONE | Med | M |
| 19 | Split "Arms" filter into Biceps / Triceps | Search / taxonomy | ✅ DONE (code 2026-08-12; re-seed pending) | Med | M |

---

### 18. Multi-select exercise add ✅ Med
**Requested:** picking a body-region filter (e.g. Chest) in the exercise picker while building a
routine should allow selecting multiple exercises before returning, rather than one add per open
of the picker.
**Verified:** `ExercisePickerModal`'s `onPick` fires once per row tap, and the routine editor's
handler (`routine/[id].tsx:235-241`) immediately does `setItems([...prev, item])` and
`setPickerOpen(false)` — the modal closes on the first tap. So today, adding N exercises to a new
routine means opening the picker, filtering/searching, tapping one, closing, and reopening N times.
**Fix (scope, not started):** give the picker a multi-select mode — tapping a row toggles a
checkmark instead of closing, an "ADD (n)" button at the bottom commits the batch via
`onPick(exercises: Exercise[])`, filter/search state persists across taps so the user can keep
browsing the same body-region list. `onPick`'s signature and both call sites need to change
together — the modal is also used mid-workout (per the file's header comment), where adding many
exercises at once makes less sense than up front in a routine; worth deciding whether mid-workout
add should stay single-select or get an escape hatch.
**Done (2026-08-08):** `ExercisePickerModal` gained an optional `multiSelect` mode + `onPickMany`
callback. In multi mode a row tap toggles a checkmark (query + region persist so you keep browsing),
and an **ADD (n) EXERCISES** bar commits the whole batch at once; a custom exercise created mid-flow
joins the selection rather than closing. The routine editor (`routine/[id].tsx`) opts in via
`multiSelect` + `onPickMany`. **Mid-workout add stays single-select** — `onPick` (single) is
unchanged, so `workout/[id].tsx` needed no edit (deliberate, to avoid clobbering the parallel
#11/#13/#26 chat editing that file). `tsc` + web-export green; not yet on device.

### 19. Split "Arms" into Biceps / Triceps in the region filter ✅ Med — **done (code) 2026-08-12**

**Done (2026-08-12):** `src/lib/muscles.ts` `BODY_REGIONS` now lists **Biceps** and **Triceps** in
place of `Arms` (7 regions); `MUSCLE_TO_REGION` maps `biceps→Biceps`, `triceps→Triceps`, and
**`forearms→Biceps`** (folded in rather than its own chip — grip/curl work clusters with biceps,
avoids a 3-item region). `scripts/build-curated-exercises.py` got the same split (and a fixed output
path — it was writing `curated-exercises.json` to cwd instead of `scripts/data/`), and
`scripts/data/exercises-curated.json` was regenerated (Biceps 18 / Triceps 10 by primary muscle, 150
exercises, no `Arms` left). The History muscle-split (`lib/muscleSplit.ts` + `components/MuscleSplit.tsx`)
and the picker/library chip rows derive from `BODY_REGIONS` dynamically, so they render fine at 7 with
no change. `tsc` + `test:offline` green. **User follow-up: `npm run seed` to publish the new
`body_region[]` to the live DB** — only the local JSON was regenerated; not yet on device. "Legs"
(quads/hams/glutes/calves) staying one bucket for now, as noted below.

<details><summary>Original scope (2026-08-08)</summary>
**Requested:** the body-region filter should let you pick Triceps or Biceps specifically, not just
a combined "Arms".
**Verified:** `src/lib/muscles.ts` — `BODY_REGIONS` is a fixed 6-item list (`Chest, Back,
Shoulders, Arms, Legs, Core`) and `MUSCLE_TO_REGION` collapses `biceps`, `triceps`, and `forearms`
all into `'Arms'`. This rollup isn't picker-only — the file's own comment says it's "shared by the
exercise directory and the 'muscles worked' charts," and `deriveBodyRegion` feeds the
`body_region[]` column set on every exercise (migration `0004_exercise_metadata.sql`) as well as
the History muscle-split bars (`lib/muscleSplit.ts` + `components/MuscleSplit.tsx`). Not a
one-file fix.
**Fix (scope, not started):** add `Biceps` / `Triceps` as their own `BODY_REGIONS` entries (decide
where `forearms` goes — its own chip, or folded into one of the two), update `MUSCLE_TO_REGION`,
regenerate `body_region[]` on the curated exercise set (`scripts/build-curated-exercises.py` →
`scripts/data/exercises-curated.json`, then re-seed), and check the History muscle-split view still
reads sensibly with 7–8 regions instead of 6. Same-shape request likely applies to "Legs" later
(quads/hamstrings/glutes/calves currently one bucket) — out of scope for this item but worth noting.
</details>

---

## 2026-08-08 (3) — Feature request: light theme

**Context:** user-requested feature, not from a device/recording QA pass.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 17 | Add a light theme (dark-only today) | Theming / design system | ✅ DONE (full light theme + System·Light·Dark toggle, 2026-08-08) | Med | L |

---

### 17. Add a light theme ✅ Med — **DONE 2026-08-08 (Phases 1–3 complete)**
**Shipped:** the full "Greige + Moss" light theme (design from `design_handoff_light_mode/`, option 2a)
plus a System · Light · Dark toggle. `themes.light` in `tokens.ts` carries the real values; **all ~28
screens/components** now read `color`/`shadow` from `useTheme()` through a memoized
`makeStyles(color, shadow)` factory (styles rebuild only on an actual theme flip — no steady-state cost).
The handoff's four "not a straight swap" rules are carried by **semantic tokens** (`ctaBg/ctaBorder/ctaFg`
+ `shadow.cta` for solid-fill primary CTAs; `checkBg/checkFg` for the filled current-set ✓) plus a
`useThemeName()` branch in `KeyCap` (accent NEXT/FINISH), so **dark is byte-for-byte unchanged**. Settings
→ APPEARANCE → Theme cycles the three modes (`useThemeMode()`); `_layout`'s `AppContent` makes the canvas
+ status bar theme-aware. `tsc` + web-export green; light mode + the enabled solid-moss CTA visually
verified on the web sign-in screen, then **walked on the iOS simulator** (Home / active workout / Calendar /
Settings — the solid-CTA and filled-✓-chip rules confirmed; the System·Light·Dark toggle flips the whole app
live; dark unchanged). User confirmed it looks good hands-on. **Physical-device confirm still pending** (the
installed Release build bundles old JS — needs a rebuild+reinstall to show light there).
<details><summary>Earlier: decisions + Phase 1 (plumbing), 2026-08-08</summary>
**Decisions (user):** (1) the user supplies the light **design** — not a mechanical invert; (2)
behavior is **follow-system with a Settings override**. Building in phases: **1** theme
infrastructure (done), **2** migrate the ~28 screens off the static `color`/`shadow` imports to
`useTheme()` + drop in the real light values, **3** the Settings `Light · Dark · System` control +
theme-aware status bar, **4** docs.
**Phase 1 done (2026-08-08) — plumbing only, zero visual change:** `tokens.ts` now exports
`themes.{dark,light}` (each `{ color, shadow }`); `dark` is the untouched literal source of truth,
`light` is a **placeholder clone** until the design arrives. `src/theme/ThemeProvider.tsx` resolves
the active palette from a persisted preference (`data/settings.ts` `themeMode`, default `'system'`)
+ RN `Appearance` (live OS-change listener), exposed via `useTheme()` / `useThemeName()` /
`useThemeMode()`. Mounted in `_layout`. Back-compat: the static `color`/`shadow` exports still equal
dark, so the unmigrated screens render exactly as before. `Appearance` is JS-only ⇒ **no dev-client
rebuild**. `tsc` + web-export green. **Next:** Phase 2 needs the light palette values from the user
(see the format options in the session) before the 28-screen migration.
<details><summary>Original verification (2026-08-08)</summary>

**Verified:** there is currently **no theming abstraction at all**. `src/theme/tokens.ts` exports
one flat `color` const (`bg`, `s0`/`s1`/`s2`, `t1`/`t2`/`t3`, `acc`, etc.) imported directly by
**27 files** across `src/app/` and `src/components/`; there's no `useColorScheme`/`Appearance`
usage anywhere in `src/`, so nothing currently reads the system theme or a stored preference.
**Conflicts with `CLAUDE.md`'s hard rule:** "the design phase has happened — the UI is the dark
'LED-instrument' theme... never hardcode a value that has a token, never introduce a color/font
outside the token set." That rule assumes a single palette; a light theme means either (a) a
second full token set + a theme-context/provider that every one of those 27 call sites resolves
through, or (b) a separate light "LED-instrument" design pass first — the lime-on-black accent,
glow shadows, and meter-bar ramp in `tokens.ts` are dark-canvas-specific and wouldn't just invert.
</details>
</details>

---

## 2026-08-08 (2) — Gemini review of the same screen recording

**Context:** a second pass over the same device walkthrough recording, by Gemini. Three items,
code-verified below.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 14 | No max-weight validation → plate calculator runs off-screen | Logging UX / data validation | ✅ DONE | High | S |
| 15 | Plate-calculator text too small / placed too low | Logging UX | ✅ DONE | Low | S |
| 16 | Volume shown as "4.7t" — raw kg may be more scannable | Summary screen | ✅ DONE (finish summary pinned to kg) | Low | S |

---

### 14. No max-weight validation — a mistyped weight breaks the plate calculator ⬜ High
**Reported:** typing "3925" instead of "39.25" makes the "Plates per side" line explode into a
long `25 + 25 + 25 + …` string that runs off the screen.
**Verified — and it's more than cosmetic.** `SetKeypad.pressPad` (`SetKeypad.tsx:63-80`) caps kg
entry at 5 significant digits (`:76`) with no upper-bound check, so up to **99999** is enterable.
`platesPerSide` (`units.ts:56-68`) greedily subtracts plates with no iteration cap — for 3925 kg
it computes `perSide = (3925-20)/2 = 1952.5` and emits **79 plates** (78×25kg + 1×2.5kg).
`plateText` (`SetKeypad.tsx:310`, styles `:310`) has no `numberOfLines` and sits in a
`flexDirection:'row'` footer with no `flexWrap` (`footNote`, `:303-309`), so the string doesn't
wrap — it overflows the row horizontally, which reads as "running off the screen".
**There's a second, worse failure past the UI:** `weight_kg` is `numeric(6,2)` (max **9999.99**,
per `CLAUDE.md`'s hard rule). 3925 stays under that and would save fine, but anything the pad
allows above ~10000 (typo territory, e.g. "99999") would make the Supabase insert **throw**
mid-workout — a crash, not just an ugly label. The digit cap and the DB column limit are
currently unrelated numbers that happen to almost line up.
**Fix:** clamp kg entry to a sane lift ceiling (~1000 kg covers every real barbell/dumbbell/
machine number with margin) in `pressPad`'s digit branch, and defensively cap `platesPerSide`'s
loop / cap `plateText` to `numberOfLines={1}` with `ellipsizeMode` regardless, so a future
edge case can't reproduce the overflow even if the numeric cap is ever loosened.
**Done (2026-08-08):** three-layer fix — (1) `SetKeypad.pressPad` now rejects any kg digit that
would push the entry over `MAX_WEIGHT_KG` (1000 kg, well under numeric(6,2)'s 9999.99), checked in
the display unit via `displayToKg` so lb entry is capped too; `adjust` clamps to the same ceiling;
(2) `platesPerSide` (`units.ts`) caps at `MAX_PLATES_PER_SIDE` (12) and returns null past it, so an
absurd weight hides the hint instead of emitting a runaway string; (3) `plateText` is
`numberOfLines={1}` + `ellipsizeMode="tail"` so it can never overflow the row regardless. `tsc` +
web-export green.

### 15. Plate-calculator text is small and easy to miss ✅ Low
**Reported:** "Plates per side" sits at the very bottom of the keypad sheet, in small type,
away from where the user is actually looking (the weight/reps fields).
**Verified:** `plateText` is `fontSize: 9.5` (`SetKeypad.tsx:310`), placed in `footNote` below
the entire numeric pad and LOG button (`:177-188`) — visually as far as possible from `fields`
(`:126-141`, the KG/REPS boxes at the top of the sheet) where the user's eyes are while typing.
**Fix:** move the plate hint to directly under `fields` (or inline in the KG field's label row)
and bump it a size or two. Straightforward layout change, no logic change.
**Done (2026-08-08):** the plate hint now sits in its own row **directly under the KG/REPS fields**
(`SetKeypad.tsx`), bumped 9.5px→11.5px and to `numSemibold`/`t2` (was `num`/`t3`) so it reads at a
glance where the eyes already are. Label shortened to `PLATES / SIDE · …`; row has a reserved
`minHeight` so the pad doesn't jump when the hint appears/clears at the bar weight; kept
`numberOfLines={1}` (feedback #14 overflow guard). The old bottom `footNote` became an edit-only
`editActions` row holding just the DELETE SET button.

### 16. Volume as "4.7t" vs raw kg — may want a toggle ✅ Low
**Reported:** the finish-summary volume ("4.7t") is accurate but some users may find raw kg
(4,700) easier to compare week-to-week at a glance; suggests a settings toggle.
**Verified:** `finish/[id].tsx:54` — `vol >= 1000 ? `${(vol/1000).toFixed(1)}t` : Math.round(vol)`.
One thing worth flagging while touching this: the `1000` threshold and the `t` suffix are
applied to `vol`, which is already unit-converted (`kgToDisplay`, `:53`) — so a **lb** user
crossing 1000 lb also sees a `t` (tonne) label on a pound figure, which is a real unit-label
bug independent of the raw-vs-abbreviated question. If addressing this, fix both at once: decide
kg/tonne vs raw as a preference (possibly reuse the existing `profiles.default_unit` toggle
rather than adding a second setting), and make the abbreviation threshold/label unit-aware.
**Done (2026-08-08):** per the product call, **the whole finish summary now reads in kg** — the
storage unit — regardless of the profile's display unit (`finish/[id].tsx` sets `unit = 'kg'` instead
of reading `profiles.default_unit`). This kills the bug outright: a tonne is metric, so the `t`
suffix on a kg value is correct (1000 kg = 1 t), and a lb user never again sees `t` on a pound figure.
Volume, NEW BESTS values, and per-exercise TOP all show kg. The `t`/tonne abbreviation was kept (it's
unit-correct now and keeps the tile scannable) — flip to raw kg trivially if preferred.

---

## 2026-08-08 — First run on a real device (iPhone 15), user QA pass

**Context:** First time the app ran on physical hardware — installed as a Release build via a
free Apple Personal Team (see the `ios-device-install` note for the signing route). Feedback
came from a screen recording of the manual loop.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 10 | Screen transitions feel wrong / not smooth | Navigation | ✅ DONE (verified live) | High | M |
| 11 | No way to delete a set (actually: undiscoverable) | Logging UX | ✅ DONE (code 2026-08-08) | High | S |
| 12 | Weight entry should auto-advance to reps | Logging UX | ✅ RESOLVED — dissolved by #13 | Med | S |
| 13 | Reps should be 5 fixed buttons (4/6/8/10/12) | Logging UX | ✅ DONE (code 2026-08-08) | Med | S |

---

### 10. Screen transitions feel wrong — "not state of the art" ✅ High
**User:** "transitions are very odd, not smooth. like home to calendar, calendar to history."
**Verified — this is architectural, not cosmetic. There is no tab navigator.** The four
top-level tabs are plain Stack routes and `TabBar` moves between them with `router.push()`:
`index.tsx:413-415`, `calendar.tsx:293-296`, `history/index.tsx:111-114`. Three consequences:
1. **Wrong animation.** A `push` plays the iOS slide-from-right — the "going deeper" gesture.
   Tab switches must never slide horizontally; that mismatch is exactly what reads as "odd".
2. **The stack grows without bound.** Home→Calendar→History→Home leaves 4 screens stacked and
   never popped. Every hop remounts a screen and re-runs its queries.
3. **Inconsistent.** `settings.tsx:171-172` uses `router.replace()` while every other tab uses
   `push()`, so leaving Settings behaves unlike leaving any other tab.
**Fix (staged, part (a) done 2026-08-08):** all four `TabBar` call sites now use
`router.replace()` (`index.tsx`, `calendar.tsx`, `history/index.tsx`, `settings.tsx`), so stack
depth stays 1 instead of growing on every hop; the four tab routes cross-fade (160ms,
`TAB_SCREEN` in `_layout.tsx:34`) instead of the native push-slide, while detail routes
(workout/exercise/routine/finish) keep the push so "going deeper" still reads as depth.
**Verified live on-device** — feels smooth. **Still open (part (b)):** each hop still remounts
the screen (no `Tabs` layout yet), so scroll position resets on return to a tab. The full fix is
an Expo Router `Tabs` layout (`(tabs)/_layout.tsx`) with the existing `TabBar` as a custom
`tabBar`, which would also preserve per-tab state.

### 11. No delete-set option ✅ High — **done (code) 2026-08-08**
**User:** "no delete set option?"
**Verified — the feature existed but was effectively invisible.** `SetKeypad` rendered a `DELETE
SET` link only in `mode === 'edit'` (reached by tapping a logged set), as 9.5px footer text beside
the plate hint. Data path was fine — `useDeleteSet` → `sets.deleteSet`. A discoverability bug, not a
missing capability.
**Done (2026-08-08) — two discoverable paths, no accidental-delete risk:**
1. **Long-press** a logged set row → `confirmDeleteSet` Alert → `deleteSet.mutate` (fast path from the
   grid; `workout/[id].tsx`).
2. The edit-sheet `DELETE SET` is now a real **outlined button** (11px, warn border) instead of 9.5px
   footer text — unmissable once you tap a set to edit it (`SetKeypad.tsx`).
**Swipe-to-delete deliberately deferred.** It's the flashiest option but the RNGH/reanimated stack,
though installed (`react-native-gesture-handler`, `react-native-reanimated`), is **completely
unexercised** — no `GestureHandlerRootView` at the root, no babel config, reanimated 4 needs the
worklets plugin. Wiring + on-device-testing that is its own task; not worth shipping untested into a
showcase build for one affordance when long-press already solves the discoverability complaint. Revisit
if swipe gestures are wanted more broadly (also unblocks #25). Not yet run on device.

### 12. Weight should auto-advance to reps after 2 digits ✅ Med — **resolved by #13, not built as asked**
**User:** "after double digit it should automatically go to reps… deadlift 60, type 6 and 0,
cursor should automatically go to reps."
**Why not built literally:** advancing at exactly 2 digits makes **3-digit weights unenterable**
without tapping back — 100/105/120 kg are routine on deadlift/squat, the very lifts cited — and
decimals (7.5, 2.5) are legal too. The recommended resolution was always "do #13 first."
**Resolved (2026-08-08) by #13:** reps are now fixed chips, so the numeric pad serves **weight
alone** — the flow is *type weight → tap a rep chip → LOG*, strictly fewer taps than auto-advance
with no ambiguity about when the weight is "finished." The user's underlying goal (don't hand-type
reps every set) is met without the 3-digit-weight regression, so no focus-advance logic was added.

### 13. Reps should be a fixed set of 5 buttons ✅ Med — **done (code) 2026-08-08**
**User:** "reps should be fixed set of 5 buttons -> 4,6,8,10,12"
**Done (2026-08-08):** `SetKeypad` now has an **always-visible rep-chip row** (`REP_CHIPS = [4, 6, 8,
10, 12]`) between the fields and the quick row. Tapping a chip sets reps and hands focus back to KG,
so the numeric pad serves weight alone and the common set is *type weight → tap chip → LOG* with no
field switch. The selected chip is highlighted (accent border + `acc06` fill).
**Escape hatch for odd counts (singles/triples/15s/20s/AMRAP):** tap the **REPS** field to focus it —
the numeric pad + ± stepper then edit reps directly, exactly as before — so nothing is unloggable.
Chips are always shown (not hidden behind a focus swap), which avoids a sheet-height jump when
switching fields. Not yet run on device — verify chip sizing/spacing at 402pt width.

---

## 2026-07-31 — First simulator run (manual loop), user QA pass

**Context:** First time the manual UI actually rendered on a simulator (iPhone 17, iOS sim).
Getting there required two fixes (committed in `36696fd`):
- `CODE_LEN 6 → 8` in `SignInScreen.tsx` — the Supabase project mails an **8-digit** OTP; the
  app only accepted 6 and auto-submitted on the 6th digit.
- `UIViewControllerBasedStatusBarAppearance = true` in `ios/RepVoice/Info.plist` (and mirrored
  in `app.config.ts` → `ios.infoPlist`) — `react-native-screens` was throwing a fatal red-screen
  because `_layout.tsx` sets `statusBarStyle: 'light'` on the native Stack. NOTE: this repo has a
  committed `ios/` folder, so `expo run:ios` **skips prebuild** — `app.config.ts` alone did not
  reach the native project; the `Info.plist` had to be edited directly.

Session state observed: already signed in (persisted session), one in-progress "Chest" workout,
two routines ("Push A", "Chest") both `0 EX · LOCKED` (locked because they have no exercises).

### Status roll-up (as of 2026-07-31, commit `c5c1b38`)
**6 of 9 addressed:** ✅ #1 #2 #4 #6 #7 #9 · ⬜ still open: #3 (defaults), #5 (scroll), #8 (drag).
Everything below is code-verified; #1 also verified live on the simulator. Detail per item.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 1 | History has no back / no way out | Navigation | ✅ DONE (verified live) | High | S |
| 2 | Remove the rest timer | Logging UX | ✅ DONE | Med | S |
| 3 | Default reps = 12, weight = previous best | Logging UX | ✅ DONE | High | M |
| 4 | Muscle filter in exercise search | Search | ✅ DONE | Med | M |
| 5 | Can't scroll the exercise list | Search | 🟡 FIX APPLIED (keyboard-avoidance; device-confirm pending) | High | S–M |
| 6 | History detail: primary/secondary muscle % (Hevy-style) | History | ✅ DONE | Med | M |
| 7 | Routine editor: unclear where weight/reps/sets go | Routine editor | ✅ DONE | High | S |
| 8 | Set/exercise reordering by drag | Routine editor | ⬜ OPEN (still ↑/↓) | Low | M |
| 9 | Tap an exercise in a routine → see its progress | Routine editor | ✅ DONE | Med | S |

---

### 1. History is a dead-end — no back button / no nav out ✅ High
**User:** "There is no back button from history, like no clear navigation to go out."
**Verified:** `src/app/history/index.tsx` renders its own `View` + `FlatList` but **never renders
the shared `TabBar`**. Home (`index.tsx:375`), `calendar.tsx`, and `settings.tsx` all render
`<TabBar .../>` (`src/components/voice/TabBar.tsx`); History does not, and it's a top-level tab
(pushed via `router.push('/history')`), so there is no header back either. → stranded.
**Fix:** render the shared `TabBar` at the bottom of `history/index.tsx` with `active="history"`
and the same four `onPress` routes the other tabs use. (S)
**Done (2026-07-31):** `<TabBar active="history" …>` added to `history/index.tsx`, with the list
given `flex: 1` so it scrolls above the bar. **Verified live on the simulator** — History is no
longer a dead-end. Commit `c5c1b38`.

### 2. Remove the rest timer ✅ Med
**User:** "Remove the rest timer. It is annoying and does not add any value."
**Verified:** Rest timer is fully wired in `src/app/workout/[id].tsx`: `restEndsAt` state (line 73),
`startRest()` (141) fired after logging a set (154, 176), the `REST` bar UI with `+30s`/`SKIP`
(378–389), driven by `settings.autoStartRest` + `settings.defaultRestSec`. Settings screen exposes
rest presets (`REST_PRESETS` in `src/data/settings.ts`, surfaced in `settings.tsx`).
**Fix:** remove the rest bar + `startRest()` calls from the workout screen; drop the rest-timer
row from Settings. Keep `defaultRestSec`/`autoStartRest` out of the settings type or default
`autoStartRest` to `false` and hide the UI. (S)
**Note:** aligns with the frictionless-logging goal below — no countdown nagging between sets.
**Done (2026-07-31):** rest bar + `startRest()` removed from `workout/[id].tsx`; rest fields dropped
from `settings.ts` and the Settings screen. No `restEndsAt` / `REST_PRESETS` references remain.
Commit `c5c1b38`.

### 3. Frictionless defaults — reps default 12, weight default = previous best 🟡 High
**User philosophy (important — drives several items):** "I touch my phone once or twice in the
entire workout… make logging as frictionless as possible. Reps always suggested as 12 by default,
weight always suggested as the previous best by default, rather than entering every time."
**Verified (partial):** Prefill exists — `settings.prefillFromLastSession` (default `true`) and
`workout/[id].tsx:138-139` pre-fills `weight_kg`/`reps`. **But** the source is the *same-indexed set
from last session* (`lastForNext = lastSets[logged.length]`), not the **all-time best**, and when
there's **no history** `prefillReps` is `null` and the field shows `—` (no 12 default).
**Fix:**
- Reps: default to **12** whenever there's no better signal (no last-session value).
- Weight: default to the exercise's **previous best** (max `weight_kg`, tie-break higher reps —
  `exercise/[id].tsx:21` already computes a "best" this way for the progress screen; reuse it) rather
  than the same-index set.
- Keep it one-tap: pressing ✓ should log the pre-filled set with zero typing. (M)
**Open Q:** "previous best" = heaviest ever, or heaviest at similar reps? Assume heaviest-ever for v1.
**Done (2026-08-08):** `workout/[id].tsx` now pre-fills the pending row from a real signal chain
instead of the same-index last set. Weight: this session's last set → **all-time previous best**
(via the existing `useExerciseBests`/`getExerciseBests`, excludes the current workout, cached 30min)
→ last-session same-index → null. Reps: this session's last set → last-session same-index →
**`DEFAULT_REPS` (12)**. `logPending` (the ✓) now logs the pre-filled set in one tap for any
returning lift (including bodyweight, where weight is legitimately null); it only opens the keypad
when pre-fill is off or it's a brand-new lift with no weight to suggest yet. Offline the bests query
just doesn't resolve and weight falls back to the last-session value — no regression. `tsc` +
web-export green. NOTE: chose heaviest-ever for the "previous best" open question, per the v1 call.
Related follow-ups now unblocked: #28 (progressive-overload ghost) builds directly on this chain.

### 4. Muscle-group filter in exercise search ✅ Med
**User:** "Implement a filter in the exercise search list — filter all triceps exercises easily.
Selecting that filter should be very easy, straightforward, intuitive."
**Verified:** Deliberately deferred — `ExercisePickerModal.tsx:3-4` comment: "RECENT/muscle filter
tabs are deferred." Search is name/alias/fuzzy only (`searchExercises` → RPC). **Metadata to power
it already exists:** `primary_muscles[]`, `secondary_muscles[]`, `body_region[]` on every exercise
(`src/types/db.ts:36-40`, migration `0004`).
**Fix:** add a horizontal chip row (body region or primary muscle) above the results in both
`ExercisePickerModal.tsx` and `exercises.tsx`; filter client-side on `primary_muscles`. Chips from a
fixed taxonomy (`src/lib/muscles.ts`). (M)
**Done (2026-07-31):** body-region chip row (6 `BODY_REGIONS`) added above the results in both
`ExercisePickerModal.tsx` and `exercises.tsx`; single-select toggle. `searchExercises(query, region?)`
+ `listExercisesByRegion()` back it (region list via `.contains('body_region', …)`, query results
filtered by region). Server-side region list rather than client filter so all matches show, not just
the first page.

### 5. Can't scroll the exercise list 🔁 High — needs live repro
**User:** "Somehow I can't scroll down the exercise list."
**Verified (code, inconclusive):** With an empty query the picker DOES load rows —
`searchExercises('')` → `listExercises(30)` (`src/data/exercises.ts:12`), so there are ~30 items.
The `FlatList` has `style={{ flex: 1 }}` inside a `Modal` where the backdrop `Pressable` is `flex: 1`
and the sheet is `height: '86%'` (`ExercisePickerModal.tsx:154-164`) — backdrop + sheet exceed 100%,
a plausible layout/overflow cause that could clip or block the scroll area. Also `autoFocus` opens
the keyboard immediately, which can cover the lower rows.
**Next:** reproduce on the simulator to confirm whether it's the picker (modal) or the library
(`exercises.tsx`), then fix the specific container. Prime suspects: modal backdrop/sheet height math,
or missing `flex` on the sheet content. (S–M once reproduced)
**Status — FIX APPLIED (2026-08-08), device-confirm still pending.** Best-reasoned root cause: the
picker's search field has `autoFocus`, so the keyboard opens the moment the modal appears. The `Modal`
was **not** keyboard-aware, and the sheet (`height:'86%'`, bottom-anchored) has its lower portion —
including much of the `FlatList`'s scroll area — sitting *behind* the keyboard, so the lower rows can't
be seen or reliably dragged ("can't scroll down"). Fix: wrapped the sheet + backdrop in a
`KeyboardAvoidingView` (`behavior='padding'` on iOS) so the sheet lifts above the keyboard and the whole
list is scrollable; `autoFocus` kept (type-immediately UX preserved). Keyboard-down layout is unchanged,
so no regression when the field isn't focused. **Only the picker modal was changed** — if a live repro
shows the *library* screen (`exercises.tsx`, a full screen, not a modal) also can't scroll, that's a
separate container and a separate fix. Reason-only (the repo has no offline way to drive the modal +
keyboard); verify on device by opening the picker and scrolling with the keyboard up.

### 6. History detail — primary/secondary muscles worked, with % (Hevy-style) ✅ Med
**User:** "Clicking a chest workout should show primary + secondary muscle worked with %, like Hevy."
(Ref screenshot: Hevy "Muscle Split" — Chest 57%, Arms 21%, Shoulders 21%.)
**Verified:** `src/app/history/[id].tsx` shows the set grid + edit/delete, **no muscle-split
section**. Data exists (`primary_muscles`/`secondary_muscles` per exercise), so this is
computable now.
**Fix:** aggregate across the workout's exercises → per-muscle share. Weight each set's contribution
by muscle; count `primary_muscles` fully and `secondary_muscles` at a reduced factor (Hevy uses ~0.5),
normalize to 100%, render the labeled bars. (M)
**Metadata question (answered):** current arrays are **sufficient** for a v1 split. Optional
enhancement later: a per-exercise muscle-weighting map for finer accuracy; not required now.
**Done (2026-07-31):** "MUSCLE SPLIT" section on `history/[id].tsx` (under the meta line) — body-region
% bars, heaviest first. Pure helper `src/lib/muscleSplit.ts` (primary ×1, secondary ×0.5, normalized)
+ presentational `src/components/MuscleSplit.tsx`. Computed from the workout already in cache, no extra
query. v1 splits at the **body-region** level (6 groups) rather than individual muscles.

### 7. Routine editor — unclear where weight / reps / sets go ✅ High
**User:** "Selected Deadlift in a new routine 'Back'. I don't know where to put weight, reps, sets.
It doesn't make sense." (Screenshot: `1  Deadlift  GLUTES·BARBELL   [ | ] × [—] – [—]  ↑ ↓ ✕`.)
**Verified:** `routine/[id].tsx:152-182` renders three unlabeled 26px inputs as `sets × reps_low –
reps_high`, with the only header being a small right-aligned `SETS × REPS` (line 131) that doesn't
line up over the fields. **There is no weight field by design** — routines store set/rep *targets*;
weight is entered live during the workout. The confusion is (a) cryptic micro-inputs and (b) the
missing mental model that weight isn't set here.
**Fix:** label each field inline (SETS / REPS / REPS, or "sets × reps range"), widen/space them, and
add a one-line helper: "Targets only — you'll log actual weight during the workout." The note at
line 197 hints at this but is easy to miss. (S)
**Done (2026-07-31):** per-field `SETS` / `REPS` captions under each input (new `targetCol` / `tCap`
styles), header changed to `TARGETS · OPTIONAL`, and the helper note now states weight is entered
during the workout, not here. Commit `c5c1b38`.

### 8. Reorder exercises (and sets) by drag ✅ Low
**User:** "Set ordering (dragging is not there)."
**Verified:** `routine/[id].tsx:184-185` reorders via `↑`/`↓` `move()` only. No drag. (Matches the
pre-existing "Low" backlog item in `CONTEXT.md`.)
**Fix:** adopt a draggable list (e.g. `react-native-draggable-flatlist`) for routine exercises; same
pattern could later apply to reordering sets. (M — adds a native-capable dep; verify against Expo 57.)
**Status — STILL OPEN (2026-07-31):** unchanged — routine still reorders via `↑`/`↓` `move()`; no
draggable dependency added.

### 9. Tap an exercise inside a routine → see its progress ✅ Med
**User:** "I should be able to click any exercise when I'm in a routine to see my progress over time."
**Verified:** The progress screen already exists — `src/app/exercise/[id].tsx` (best / sessions /
top-set trend chart + session history), reached from the **library** and **past-workout** screens.
The **routine editor rows are not tappable** to reach it (`routine/[id].tsx:142` name is plain text).
**Fix:** make the exercise name/row in the routine editor a `Pressable` → `router.push('/exercise/'
+ item.exercise.id)`. Small, reuses the existing screen. (S)
**Done (2026-07-31):** the exercise row in `routine/[id].tsx` is now a `Pressable` →
`router.push('/exercise/' + id)` with a `›` affordance. Commit `c5c1b38`.

---

### Cross-cutting theme: **frictionless logging**
Items 2, 3, and (indirectly) 5 all serve one goal the user stated explicitly: **the phone is touched
once or twice per session.** Design implication for the workout screen: every set should arrive
pre-filled (weight = previous best, reps = 12/last), logging is a single ✓, and nothing (rest timer,
extra typing) interrupts the flow. Treat this as the guiding principle when picking up items here.

### Remaining work (what's left after the 2026-07-31 pass)
Done: #1 #2 #4 #6 #7 #9. Left, in priority order:
1. **#3 defaults** — reps default 12, weight = all-time previous best; make ✓ a true one-tap log.
   This is the biggest remaining frictionless-logging win. (M)
2. **#5 scroll** — reproduce on the simulator (picker vs library), then fix the specific container. (S–M)
3. **#8 drag reorder** — lowest priority; adds a native-capable dependency. (M)
