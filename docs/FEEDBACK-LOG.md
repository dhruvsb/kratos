# RepVoice — Feedback Log

Running log of hands-on feedback from real use, with a code-level verification of each
item (root cause + file references + proposed fix) so any session can pick it up. Newest
entry at top. When an item is fixed, mark it and move the detail into `WORK-LOG.md`.

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
| 3 | Default reps = 12, weight = previous best | Logging UX | ⬜ OPEN (still last-session prefill) | High | M |
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
**Status — STILL OPEN (2026-07-31):** not implemented. `workout/[id].tsx:132-133` still prefills
weight/reps from the *same-index set of last session* (`lastForNext`) — no `?? 12` reps default and
no all-time previous-best lookup. This is the core frictionless-logging payoff and is still to do.

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
