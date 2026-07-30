# RepVoice — Feedback Log

Running log of hands-on feedback from real use, with a code-level verification of each
item (root cause + file references + proposed fix) so any session can pick it up. Newest
entry at top. When an item is fixed, mark it and move the detail into `WORK-LOG.md`.

---

## 2026-07-31 — First simulator run (manual loop), user QA pass

**Context:** First time the manual UI actually rendered on a simulator (iPhone 17, iOS sim).
Getting there required two fixes still **uncommitted** on `master`:
- `CODE_LEN 6 → 8` in `SignInScreen.tsx` — the Supabase project mails an **8-digit** OTP; the
  app only accepted 6 and auto-submitted on the 6th digit.
- `UIViewControllerBasedStatusBarAppearance = true` in `ios/RepVoice/Info.plist` (and mirrored
  in `app.config.ts` → `ios.infoPlist`) — `react-native-screens` was throwing a fatal red-screen
  because `_layout.tsx` sets `statusBarStyle: 'light'` on the native Stack. NOTE: this repo has a
  committed `ios/` folder, so `expo run:ios` **skips prebuild** — `app.config.ts` alone did not
  reach the native project; the `Info.plist` had to be edited directly.

Session state observed: already signed in (persisted session), one in-progress "Chest" workout,
two routines ("Push A", "Chest") both `0 EX · LOCKED` (locked because they have no exercises).

### Verification legend
✅ Confirmed in code · 🟡 Partially present, gap confirmed · 🔁 Needs live repro · 💡 Design/new feature

### Summary

| # | Item | Area | Status | Sev | Effort |
|---|------|------|--------|-----|--------|
| 1 | History has no back / no way out | Navigation | ✅ bug | High | S |
| 2 | Remove the rest timer | Logging UX | ✅ present | Med | S |
| 3 | Default reps = 12, weight = previous best | Logging UX | 🟡 gap | High | M |
| 4 | Muscle filter in exercise search | Search | ✅ missing | Med | M |
| 5 | Can't scroll the exercise list | Search | 🔁 repro | High | S–M |
| 6 | History detail: primary/secondary muscle % (Hevy-style) | History | ✅ missing | Med | M |
| 7 | Routine editor: unclear where weight/reps/sets go | Routine editor | ✅ confirmed | High | S |
| 8 | Set/exercise reordering by drag | Routine editor | ✅ missing (↑/↓ only) | Low | M |
| 9 | Tap an exercise in a routine → see its progress | Routine editor | ✅ missing | Med | S |

---

### 1. History is a dead-end — no back button / no nav out ✅ High
**User:** "There is no back button from history, like no clear navigation to go out."
**Verified:** `src/app/history/index.tsx` renders its own `View` + `FlatList` but **never renders
the shared `TabBar`**. Home (`index.tsx:375`), `calendar.tsx`, and `settings.tsx` all render
`<TabBar .../>` (`src/components/voice/TabBar.tsx`); History does not, and it's a top-level tab
(pushed via `router.push('/history')`), so there is no header back either. → stranded.
**Fix:** render the shared `TabBar` at the bottom of `history/index.tsx` with `active="history"`
and the same four `onPress` routes the other tabs use. (S)

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

### 8. Reorder exercises (and sets) by drag ✅ Low
**User:** "Set ordering (dragging is not there)."
**Verified:** `routine/[id].tsx:184-185` reorders via `↑`/`↓` `move()` only. No drag. (Matches the
pre-existing "Low" backlog item in `CONTEXT.md`.)
**Fix:** adopt a draggable list (e.g. `react-native-draggable-flatlist`) for routine exercises; same
pattern could later apply to reordering sets. (M — adds a native-capable dep; verify against Expo 57.)

### 9. Tap an exercise inside a routine → see its progress ✅ Med
**User:** "I should be able to click any exercise when I'm in a routine to see my progress over time."
**Verified:** The progress screen already exists — `src/app/exercise/[id].tsx` (best / sessions /
top-set trend chart + session history), reached from the **library** and **past-workout** screens.
The **routine editor rows are not tappable** to reach it (`routine/[id].tsx:142` name is plain text).
**Fix:** make the exercise name/row in the routine editor a `Pressable` → `router.push('/exercise/'
+ item.exercise.id)`. Small, reuses the existing screen. (S)

---

### Cross-cutting theme: **frictionless logging**
Items 2, 3, and (indirectly) 5 all serve one goal the user stated explicitly: **the phone is touched
once or twice per session.** Design implication for the workout screen: every set should arrive
pre-filled (weight = previous best, reps = 12/last), logging is a single ✓, and nothing (rest timer,
extra typing) interrupts the flow. Treat this as the guiding principle when picking up items here.

### Suggested order of attack
1. **#1 History nav** and **#7 routine labels** — tiny, remove obvious dead-ends/confusion.
2. **#3 defaults** and **#2 remove rest timer** — the core frictionless-logging payoff.
3. **#9 progress-from-routine** — small, high value.
4. **#5 scroll** — reproduce then fix.
5. **#4 filter** and **#6 muscle split** — medium features, share the muscle metadata.
6. **#8 drag reorder** — lowest priority; adds a dependency.
