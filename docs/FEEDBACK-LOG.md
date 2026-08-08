# RepVoice — Feedback Log

Running log of hands-on feedback from real use, with a code-level verification of each
item (root cause + file references + proposed fix) so any session can pick it up. Newest
entry at top. When an item is fixed, mark it and move the detail into `WORK-LOG.md`.

---

## 2026-08-08 (7) — Gemini PM-lens pass: micro-interaction friction + "hyper-intelligent" ideas

**Context:** a product-management-style review from Gemini (not a device recording), focused on
shaving micro-interactions out of the logging loop and adding anticipatory features. Logged
in full below; not all items need to be built.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 24 | Contextual/predictive exercise suggestions in search (by muscle group) | Search | ⬜ OPEN | Low | M |
| 25 | Swipe gesture to toggle KG/REPS focus instead of tapping | Logging UX | ⬜ OPEN | Low | S |
| 26 | Auto-advance/reopen keypad for the next set after logging | Logging UX | ⬜ OPEN | Med | S |
| 27 | Superset linking — group 2 exercises, cycle input between them | Logging UX | ⬜ OPEN | Low | M |
| 28 | Progressive-overload ghost suggestion (vs. flat previous-best prefill) | Logging UX | ⬜ OPEN (builds on #3) | Low | M |
| 29 | One-tap warmup ramp generator (50/70/90% of working weight) | Logging UX | ⬜ OPEN | Low | S |
| 30 | Global rest timer, auto-triggered on set-checkoff | Logging UX | ⬜ OPEN — **conflicts with #2, needs a call** | — | — |

---

### 24. Contextual/predictive exercise suggestions in search ⬜ Low
**Proposed:** surface likely-next exercises (e.g. "Chest Dip" right after logging "Bench Press")
below the search bar, instead of requiring the user to type.
**Verified:** `ExercisePickerModal` with an empty query falls back to `listExercises(30)`
(`src/data/exercises.ts:12`) — a generic default list, not scoped to the muscle group of what's
already logged in the workout. The file's own header comment already flags a "RECENT/muscle filter
tabs are deferred" gap (also noted under feedback #4's verification).
**Fix (scope, not started):** derive the active workout's dominant `body_region` from its
already-logged exercises, and rank/pin same-region exercises above the default list when the
picker opens with no query. (M)

### 25. Swipe to toggle KG/REPS focus ⬜ Low
**Proposed:** a horizontal swipe across the input card toggles between weight/rep entry, instead
of tapping a specific field.
**Verified:** `SetKeypad`'s `active` field state only changes via the `Field` component's
`onPress` (`SetKeypad.tsx:131-139`) — tap-only, no gesture handler. (`react-native-gesture-handler`
is already a dependency per feedback #11's note, so the primitive is available.)
**Fix:** add a swipe gesture over the two `Field` rows that calls `setActive` on a threshold
swipe, keeping tap as the primary/discoverable path. (S)

### 26. Auto-advance to the next set after logging ⬜ Med
**Proposed:** after tapping the checkmark, immediately move focus to the next set's weight field
instead of requiring the user to manually reopen the keypad.
**Verified:** `onKeypadLog` (`workout/[id].tsx:159-169`) mutates the set then unconditionally calls
`setKeypad(null)`, closing the sheet — there is no re-open/re-prefill for the next set. Every set
today is: tap a cell → keypad opens → log → sheet closes → tap the next cell.
**Fix:** after a successful log, if there's a next planned/likely set, re-open the keypad
pre-filled for it instead of closing to the grid. Ties directly into the "phone touched once or
twice a session" principle behind feedback #3. (S)

### 27. Superset linking — cycle input between two linked exercises ⬜ Low
**Proposed:** a "link" toggle to group exercises into supersets, so the active set input
auto-cycles between the two linked movements instead of manually navigating between them.
**Verified (one correction to the report):** exercise-to-exercise navigation in the workout screen
is **tap-based** ‹/› buttons (`goExercise(dir)`, `workout/[id].tsx:172-175, 389-396`), not a swipe
gesture as the report describes — same underlying friction (leaving the input to switch exercises)
but via a different mechanism than reported. No superset/linking concept exists anywhere in the
schema (`workout_exercises` has no pairing/group column) or UI.
**Fix (scope, not started):** needs a schema change (a `superset_group_id` or ordering pair on
`workout_exercises`) plus UI for creating the link (routine editor or mid-workout) and the
cycling behavior itself. Bigger than the other items here — a real feature, not a tweak. (M–L)

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

### 29. One-tap warmup ramp generator ⬜ Low
**Proposed:** the "+ Warmup" button should auto-generate a 50/70/90%-of-working-weight ramp
instead of requiring the user to type each warmup set manually.
**Verified:** `+ Warmup` exists (`workout/[id].tsx:359`, `openAdd('warmup')`) but only opens the
keypad with `kg`/`reps` forced to `null` (`:154-155`) — a blank entry, same manual typing as any
other set, just tagged `set_type: 'warmup'`.
**Fix:** once a working-set weight exists for the exercise (this session or prefilled from last
time), generate 2-3 warmup rows at 50/70/90% (rounded to a sane plate increment) that the user can
accept with one tap each or edit. (S)

### 30. Global rest timer, auto-triggered on checkoff ⬜ — **conflicts with a shipped decision (#2)**
**Asked:** "are you planning to integrate a global rest timer that automatically triggers the
moment a working set is checked off?"
**Verified — this was already built, then explicitly removed:** feedback **#2** ("Remove the rest
timer. It is annoying and does not add any value.") shipped 2026-07-31 — the rest bar, `startRest()`
calls, and `defaultRestSec`/`autoStartRest` settings were all deleted from `workout/[id].tsx` and
`src/data/settings.ts`. Re-adding an auto-triggered rest timer would directly reverse that decision.
**Not logging this as a build item — flagging for a call instead:** if there's a reason to revisit
(e.g. an *optional*, dismissible timer vs. the old mandatory countdown-nag), that's a product
decision to make explicitly before any code changes, not something to default back to.

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
| 21 | Drop/defer SETS·REPS targets from routine *creation* — exercise selection only | Routine editor | ⬜ OPEN (agent recommends: yes) | Med | S |

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

### 21. Targets (SETS × REPS) don't belong on the routine-*creation* screen ⬜ Med — **agent recommends doing this**
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

---

## 2026-08-08 (4) — Feature request: multi-select exercise add + biceps/triceps split

**Context:** user-requested, routine editor.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 18 | Multi-select exercises when adding to a routine | Routine editor | ⬜ OPEN | Med | M |
| 19 | Split "Arms" filter into Biceps / Triceps | Search / taxonomy | ⬜ OPEN | Med | M |

---

### 18. Multi-select exercise add ⬜ Med
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

### 19. Split "Arms" into Biceps / Triceps in the region filter ⬜ Med
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

---

## 2026-08-08 (3) — Feature request: light theme

**Context:** user-requested feature, not from a device/recording QA pass.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 17 | Add a light theme (dark-only today) | Theming / design system | ⬜ OPEN | Med | L |

---

### 17. Add a light theme ⬜ Med — **conflicts with a hard rule, needs a call**
**Requested:** a light theme option alongside the current dark UI.
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
**Fix (scope, not started):** (1) decide whether light is a real second design pass or a
mechanical invert; (2) if building it, introduce a `ThemeProvider`/context wrapping
`color`/`shadow` per-mode, migrate the 27 direct-import call sites to consume it, add a persisted
preference (reuse the `profiles`/local-settings pattern already used for `default_unit`), default
to system `Appearance` with a manual override in Settings. This is the largest item in the open
backlog — flag with the user before scheduling given the showcase-first / sleek-minimal priority
in `PRODUCT-PRINCIPLES.md`.

---

## 2026-08-08 (2) — Gemini review of the same screen recording

**Context:** a second pass over the same device walkthrough recording, by Gemini. Three items,
code-verified below.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 14 | No max-weight validation → plate calculator runs off-screen | Logging UX / data validation | ✅ DONE | High | S |
| 15 | Plate-calculator text too small / placed too low | Logging UX | ⬜ OPEN | Low | S |
| 16 | Volume shown as "4.7t" — raw kg may be more scannable | Summary screen | ⬜ OPEN (needs a call) | Low | S |

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

### 15. Plate-calculator text is small and easy to miss ⬜ Low
**Reported:** "Plates per side" sits at the very bottom of the keypad sheet, in small type,
away from where the user is actually looking (the weight/reps fields).
**Verified:** `plateText` is `fontSize: 9.5` (`SetKeypad.tsx:310`), placed in `footNote` below
the entire numeric pad and LOG button (`:177-188`) — visually as far as possible from `fields`
(`:126-141`, the KG/REPS boxes at the top of the sheet) where the user's eyes are while typing.
**Fix:** move the plate hint to directly under `fields` (or inline in the KG field's label row)
and bump it a size or two. Straightforward layout change, no logic change.

### 16. Volume as "4.7t" vs raw kg — may want a toggle ⬜ Low — **needs a call, not a bug**
**Reported:** the finish-summary volume ("4.7t") is accurate but some users may find raw kg
(4,700) easier to compare week-to-week at a glance; suggests a settings toggle.
**Verified:** `finish/[id].tsx:54` — `vol >= 1000 ? `${(vol/1000).toFixed(1)}t` : Math.round(vol)`.
One thing worth flagging while touching this: the `1000` threshold and the `t` suffix are
applied to `vol`, which is already unit-converted (`kgToDisplay`, `:53`) — so a **lb** user
crossing 1000 lb also sees a `t` (tonne) label on a pound figure, which is a real unit-label
bug independent of the raw-vs-abbreviated question. If addressing this, fix both at once: decide
kg/tonne vs raw as a preference (possibly reuse the existing `profiles.default_unit` toggle
rather than adding a second setting), and make the abbreviation threshold/label unit-aware.

---

## 2026-08-08 — First run on a real device (iPhone 15), user QA pass

**Context:** First time the app ran on physical hardware — installed as a Release build via a
free Apple Personal Team (see the `ios-device-install` note for the signing route). Feedback
came from a screen recording of the manual loop.

### Summary

| # | Item | Area | Done? | Sev | Effort |
|---|------|------|-------|-----|--------|
| 10 | Screen transitions feel wrong / not smooth | Navigation | ✅ DONE (verified live) | High | M |
| 11 | No way to delete a set (actually: undiscoverable) | Logging UX | ⬜ OPEN | High | S |
| 12 | Weight entry should auto-advance to reps | Logging UX | ⬜ OPEN (design conflict) | Med | S |
| 13 | Reps should be 5 fixed buttons (4/6/8/10/12) | Logging UX | ⬜ OPEN | Med | S |

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

### 11. No delete-set option ⬜ High
**User:** "no delete set option?"
**Verified — the feature exists but is effectively invisible.** `SetKeypad.tsx:183-187` renders
a `DELETE SET` link, but *only* when `mode === 'edit'`, which is reached solely by tapping an
already-logged set in the grid (`workout/[id].tsx:309`). It is 9.5px text in the footer beside
the plate hint, styled `color.warn`. The data path is fine — `useDeleteSet` (`hooks.ts:710`) →
`sets.deleteSet` (`sets.ts:114`).
**So this is a discoverability bug, not a missing capability.**
**Fix options:** swipe-to-delete on the set row (most discoverable, matches Hevy/Strong), or a
long-press on a logged set, or promote DELETE SET in the edit sheet to a real button. Swipe is
the state-of-the-art answer and needs `react-native-gesture-handler`, already a dependency.

### 12. Weight should auto-advance to reps after 2 digits ⬜ Med — **design conflict, needs a call**
**User:** "after double digit it should automatically go to reps… deadlift 60, type 6 and 0,
cursor should automatically go to reps."
**Verified:** `SetKeypad.pressPad` (`SetKeypad.tsx:63-80`) appends digits to whichever field is
active and never moves focus; `active` only changes when a `Field` is tapped (`:132`, `:139`).
**Conflict:** advancing at exactly 2 digits makes **3-digit weights unenterable** without
tapping back — 100/105/120 kg are routine on deadlift and squat, the very lifts cited. The
current cap is 5 digits (`:76`), and decimals (7.5, 2.5 plates) are also legal.
**Recommended resolution:** implement #13 first. Once reps are fixed buttons, the numeric pad
serves **only** weight, so the flow is *type weight → tap a rep chip → logged* — strictly fewer
taps than auto-advance, with no ambiguity about when the weight is "finished". Auto-advance
then becomes unnecessary rather than merely risky.

### 13. Reps should be a fixed set of 5 buttons ⬜ Med
**User:** "reps should be fixed set of 5 buttons -> 4,6,8,10,12"
**Verified:** reps are currently free numeric entry through the shared pad, with a 3-digit cap
(`SetKeypad.tsx:71`) and ± stepping (`adjust`, `:87-91`). `PAD`/`QUICK` (`:42-43`) are shared
between both fields.
**Fix:** replace the reps field's numeric entry with a 5-chip row (4 · 6 · 8 · 10 · 12). Open
question to settle when building: these five cover most working sets but not all (singles,
triples, 15s, 20s, AMRAP) — needs an escape hatch (keep ± stepping, or a "…" chip that reveals
the pad) or the app silently cannot log a 3-rep top single. Ties into #3 (default reps = 12).

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
| 5 | Can't scroll the exercise list | Search | ⬜ OPEN (unreproduced / unfixed) | High | S–M |
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
**Status — STILL OPEN (2026-07-31):** not reproduced or fixed. The picker's `backdrop: flex:1` +
`sheet: height:'86%'` structure is unchanged (the #4 filter chips were added above the list, but the
scroll container itself was untouched). Needs the live repro before a fix.

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
