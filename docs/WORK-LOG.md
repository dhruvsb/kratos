# Work Log

Append-only, dated log of individual sessions. This is the **history**; the
`PROJECT-SUMMARY-PHASE*.md` files are the **current-state snapshot**. When you finish a
session, add an entry here (newest at the top) and update the relevant summary file's
status table/decisions — don't let the two drift apart.

---

## 2026-08-06 (final) — Deep-scenario QA on the simulator: 2 more fixes (network truth is now probed, not trusted)

Ran the remaining offline scenarios entirely on the simulator, inspecting the persisted
mutation queue directly in the app container (`RCTAsyncLocalStorage_V1`) between steps.

**Verified end-to-end:** empty workout born offline → 3 sets (✓ + keypad) → offline *edit*
(20→22.5) → offline *delete* of set 3 → offline finish → survived a stuck queue → flushed
exactly right on the next launch (DB: set 1 = 20×12, set 2 = 22.5×12, no set 3, ended_at).
In-app offline discard: instant, and `test:offline` (now **11/11**) proves the queued
insert→delete replays to a no-trace net server state.

**Two more fixes (both about NetInfo lying):**
5. **Missed / wedged reachability events** — the simulator dropped transitions entirely
   (Wi-Fi restored, app foregrounded, still "offline"; queue stuck until restart). Fix:
   re-seed on every AppState→active + a 10s poll (`RECHECK_MS`).
6. **NetInfo can lie in BOTH directions** (stale "online" is the dangerous one: writes fire,
   fail, exhaust retries, roll back — the best explanation for a `startWorkout` observed
   vanishing from the persisted queue while its discard survived). Fix: the poll's authority
   is now a **real HEAD probe** of Supabase's public `/auth/v1/health` (3s timeout, ~200
   bytes, foreground-only); NetInfo events remain the fast transition path.

**Env note for future offline testing:** the Wi‑Fi kept coming back mid-test because this is
the user's live machine (they re-enable it when their own work needs it — entirely fair).
Simulator offline tests contend for the host's network; prefer short announced windows, or a
real device's airplane mode. The probe build's offline-detect branch is code-verified (a
fetch cannot succeed without a network path) + tsc/web-export green; the probe's
online-detect branch and the full online regression (start → prefilled ✓ log → discard →
DB net-zero, no SYNCING flash, empty queue after) were verified live on the final build.

## 2026-08-06 (later still) — QA pass on the offline layer: 4 issues found + fixed, re-verified on-device

Audited the day's offline work end to end. Four real issues, all fixed:

1. **Banner absent after an offline cold start** (the known nit) — root cause: RQ's
   `onlineManager` *defaults to online* and the NetInfo listener only reports *changes*, so a
   cold start while disconnected believed it was online until the first network flip. Fix:
   seed real state via `NetInfo.fetch()` in `registerOnlineManager()` (at registration and on
   each lazy listener setup). **Re-verified on-device**: offline relaunch now shows the banner.
2. **SYNCING pill fired on every normal online write** — `useIsMutating() > 0` counts all
   mutations, so each online ✓ would flash the pill. Fix: latch `draining` on the
   offline→online transition (only if something is queued/in flight), clear when the queue
   empties (`OfflineBanner.tsx`).
3. **Offline START dead-end on a never-loaded routine** — with a cold routine cache,
   `buildStartPlan` returns null and the server-path mutation just *pauses*: no navigation, no
   error, START stuck disabled. Fix: honest alert in `index.tsx` ("reconnect once…"); every
   prefetched routine and the empty start keep working offline.
4. **`resumePausedMutations` is `Promise.all` — CONCURRENT — in RQ 5.101** (verified in
   query-core source), so the FK-ordered queue could race child-before-parent (23503) on
   flush; the earlier "sequential replay" assumption was wrong. Fix: `SerialResumeQueryClient`
   (`queryClient.ts`) overrides `resumePausedMutations` with a creation-order promise chain —
   covers the manual restore-time call *and* RQ's own on-reconnect / on-focus resumes (all go
   through `this.resumePausedMutations()`).

**Hardest-case re-test on-device (Release build)**: entire workout born offline — START from
routine (3 exercises) → keypad set 30×8 → FINISH → kill → relaunch → reconnect. The serial
flush landed the full tree exactly once, in FK order: workout row + Barbell Curl + set +
`ended_at`, zero-set exercises dropped (service-role query verified). Also audited-and-fine:
paused-only mutation dehydration (kill mid-active-write self-reconciles), offline re-pause on
launch resume, unsynced-set edit/delete by client id. `tsc` + web export green.

Rebuilt the client with NetInfo and walked the whole offline path live. Two build lessons:
the shell's `C` locale breaks CocoaPods (`Unicode Normalization not appropriate for ASCII-8BIT`)
— run pod-touching commands with `LANG=en_US.UTF-8`; and a **dev build can't be tested offline**
(cutting Wi‑Fi severs Metro itself and the dev overlay takes over) — offline testing needs
`expo run:ios --configuration Release`, which embeds the JS bundle.

The test (Wi‑Fi off on the host = simulator offline): OFFLINE banner appeared → ✓-logged a set
(stuck, header updated, no rollback) → picker listed + searched the **cached** directory
("Curl" → 18 instant matches; custom-create correctly gated with the reconnect hint) → added
Hammer Curl mid-workout + logged 12×10 on the keypad → **force-quit, relaunched still offline**:
Home + grid rehydrated with all 3 sets intact → Wi‑Fi on → queue flushed; a service-role query
confirmed both offline sets **and** the offline-added exercise landed in Supabase under their
client ids (created_at timestamps = the reconnect moment) → FINISH → correct summary (73m ·
3 sets · 220 kg), `ended_at` stamped.

One cosmetic nit found: after the *offline relaunch* the OFFLINE banner didn't re-show (NetInfo
initial-state timing on cold start); the queue itself replayed correctly, so logged as a
low-priority polish item, not a blocker.

## 2026-08-06 — Offline-first logging (log a whole session disconnected, sync on reconnect)

The persisted cache made *reads* offline-tolerant and the logging flow *feel* instant, but an
offline **write** used to fire → fail → roll back (no network awareness, no durable queue). This
session makes the active-logging path fully offline-capable: start a workout (new or from a
routine), pick exercises, log/edit/delete weight×reps×sets, finish — all with no connection —
and it syncs automatically when the network returns, surviving an app kill in between. Scope is
deliberately the logging path only; history/calendar/progress/voice stay online-only. Rode React
Query v5's built-in offline machinery rather than a bespoke queue (the app already had optimistic
patches, a persisted cache, and client-chosen UUIDs).

- **`@react-native-community/netinfo` (new native dep, 12.0.1)** → `src/lib/network.ts`:
  `registerOnlineManager()` points RQ's `onlineManager` at NetInfo, plus `useIsOnline()`. With
  this, an offline mutation **pauses** instead of erroring — so the optimistic patch survives
  offline for free (it never reaches `onError`). **Needs a dev-client rebuild.**
- **Replay-safe writes** — a paused/persisted mutation replays later with only its serializable
  variables, so the dependent server SELECTs were removed: `sets.addSet` takes a client
  `set_number` + `id`; `addExerciseToWorkout` takes a client `position`; start uses the
  preset-only path. `hooks.ts` now captures `id`/`set_number`/`position` into the mutation
  **variables** at enqueue time (recomputing at replay would be wrong once several are queued),
  via thin `mutate` wrappers on `useAddSet` / `useAddExerciseToWorkout`; `finish`/`discard` carry
  `workoutId` in their variables (call sites drop the `undefined` first arg).
- **`src/data/offlineSync.ts` (new)** — `mutationKeys` + standalone, self-contained replay fns +
  `registerOfflineMutationDefaults(qc)` (`setMutationDefaults` per key, `networkMode:'online'`,
  `retry:3`, a broad reconcile-on-settle). This is the resume path a persisted mutation binds to
  after an app kill (its own fn/callbacks don't survive serialization).
- **Persist + resume** — the RQ persister already dehydrates paused mutations; `_layout.tsx`'s
  `PersistQueryClientProvider` gains `onSuccess → queryClient.resumePausedMutations()`, which
  flushes the queue in enqueue order on relaunch. Client-chosen ids make that order FK-safe
  (workout → exercise → set).
- **Offline exercise picking** — `listAllExercises()` + `filterExercisesLocally()` in
  `exercises.ts`; `useExerciseDirectory()` + `usePrefetchExerciseDirectory()` (warmed from the
  workout screen). `ExercisePickerModal` uses server search online, local directory filter
  offline, and disables custom-create offline with a reconnect hint.
- **`src/components/OfflineBanner.tsx` (new)** — floats over every screen; shows OFFLINE while
  disconnected and a brief SYNCING while the queue drains (`useIsMutating`). Mounted in `_layout`.
- **`scripts/test-offline-sync.ts` (new, `npm run test:offline`)** — replays the exact insert/
  update/delete shapes the queue emits, in enqueue order, against a throwaway live account and
  asserts the tree. **8/8 pass**: client ids accepted, client set_numbers, sequential FK order,
  mid-session add, edit+delete by id, finish drops zero-set exercises + stamps ended_at.

Verified: `tsc` clean; `expo export --platform web` bundles all 15 routes (NetInfo web-safe);
offline-sync harness 8/8 on the live DB. **Not yet run on device** — needs a dev-client rebuild
for NetInfo, then the airplane-mode walkthrough + kill-and-relaunch check.

## 2026-07-31 — Instant interactions: navigate-first (optimistic start/finish/discard) + prefetch

Idea #2 of the "snappier" plan, built on #1's persisted cache. Start/finish/discard were
gated on a network round-trip (they navigated in the mutation's `onSuccess`); the grid and
finish screens then blocked on their own fetch. Now every one of those transitions happens on
the **same tap**, backed by the local cache, with the server reconciling in the background.
Leans directly into the "80% of sessions repeat" insight: the whole workout is assembled
locally from the cached routine.

- **`src/lib/ids.ts`** (new) — `newUuid()` (WebCrypto with a Math.random v4 fallback for
  runtimes without it). Client-chosen row ids are what let START navigate before the insert:
  the UI seeds the cache with the ids the background insert will use.
- **`src/data/workouts.ts`** — `startWorkout(routineId, preset?)` and
  `addExerciseToWorkout(id, exId, preset?)` accept client ids and skip their lookup SELECT
  (start is now 3→2 round-trips for a routine; both no longer block navigation).
- **`src/data/hooks.ts`** —
  - `buildStartPlan(qc, routineId)` builds a full optimistic `WorkoutDetail` from the **cached
    routine detail** (null when cold ⇒ caller falls back to the await path).
  - `useStartWorkout` seeds `keys.workout(id)` + `activeWorkout` and inserts in the background;
    finish/discard/add-exercise are now optimistic with snapshot rollback.
  - **FK-safety guard:** a `pendingWorkoutInserts` map + `awaitWorkoutCommitted()` — the first
    set / add-exercise / finish / discard for a workout awaits its in-flight insert, so a child
    write can never reach the DB before its parent row exists. A failed start rolls those back too.
  - `usePrefetchRoutineDetails` (Home) + `usePrefetchLastSessions` (grid) warm the routine
    lists and every exercise's last-session panel, so START and mid-workout exercise switches
    are served from cache (the 80% case).
- **`src/components/workout/LiveClock.tsx`** (new) — `ElapsedClock` + `useNowTick`. The 1-second
  timer now lives in a leaf, so a tick re-renders one `<Text>` instead of all of Home / the
  whole set grid. Home's resume meta moved into a `ResumeMeta` leaf for the same reason.
- **`src/app/index.tsx` + `workout/[id].tsx`** — navigate-first handlers with error-path returns
  (roll back + bounce home / back to the grid), isolated clocks, and the new prefetchers wired in.

**QA:** `tsc` clean; `expo export` bundles all 15 routes (its static render exercises Home + the
grid through all the new code); the freshly-built web bundle boots in-browser with **zero console
errors**. A **live-DB harness** (service-role throwaway user, anon-key RLS, `test-rls` pattern)
proves the novel risk end-to-end: client-generated UUIDs are accepted for `workouts.id` /
`workout_exercises.id`, the FK-ordered set insert passes the RLS with-check, the tree round-trips
under the chosen ids, and finish still drops empty exercises + stamps `ended_at` (10/10). Not yet
walked on device — the optimistic *feel* still wants a real-session smoke (JS-only ⇒ no rebuild).

---

## 2026-07-31 — Local-first: persist the React Query cache (instant cold start)

First of the three "snappier / faster to load / fewer taps" ideas. The data layer was
network-gated on every cold start and screen mount (memory-only cache, `staleTime: 0`).
Made it **local-first**: the query cache now persists to disk, so launch paints last-known
data immediately, then revalidates in the background.

- **`src/lib/queryClient.ts`** (new, single source like `supabase.ts`) — the `QueryClient` +
  an AsyncStorage persister. `gcTime = maxAge = 7d` (gcTime must be ≥ maxAge or an inactive
  query is evicted before it can be restored), a global `staleTime` floor of 60s, a
  `CACHE_BUSTER` to discard stale-shaped caches on a schema change, and `resetQueryCache()`.
- **`src/app/_layout.tsx`** — `QueryClientProvider` → **`PersistQueryClientProvider`**; a new
  **`BootGate`** holds the native splash on `useIsRestoring` so first paint already shows
  hydrated data (no skeleton→data flash). It can't strand the splash — `useIsRestoring`
  resolves to false even if restore errors. The auth handler now **wipes the cache on
  `SIGNED_OUT` / account-switch** (`resetQueryCache`) so one user's data can't hydrate into
  another's; a plain `TOKEN_REFRESHED` (same user id) falls through untouched.
- **`src/data/auth.ts`** — `onAuthStateChange` now forwards the `AuthChangeEvent`.
- **`src/data/hooks.ts`** — explicit `staleTime` tiers (profile 30m · routines 5m · exercise
  60m · search 5m · activeWorkout 30s · workout 60s · list/lastSession/history 5m). Safe
  because every mutation already invalidates the keys it touches, and invalidation refetches
  regardless of `staleTime` — so this only suppresses redundant passive refetch-on-mount
  (the refetch-flash on navigation), never our own writes.
- **Deps:** `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`
  (both pinned `5.101.2` to match core). Pure JS — **no dev-client rebuild needed**.

**QA:** `tsc` clean; `expo export` bundles all 15 routes (its static render exercises the full
`PersistQueryClientProvider → BootGate` tree); the freshly-built web bundle boots in-browser
with **zero console errors** and no splash strand (reaches sign-in); a Node harness driving the
real persist packages with this exact config proves **save→restore** (incl. the nested workout
tree), **buster-mismatch discard**, and **maxAge-expiry discard** (5/5 pass). Not yet watched
hydrating real data on a warm relaunch on device (needs an authed session; JS-only ⇒ no rebuild).

---

## 2026-07-31 — Hevy CSV export (in-app, round-trips with import)

Symmetric partner to the import: a real **file export** replacing the old summary-only share.

- **`src/lib/hevy.ts`** — added `serializeHevyCsv()` (+ `formatHevyDate`, reverse `set_type` map,
  RFC-4180 quoting), the exact inverse of the parser. Same 14-column header, so an export re-imports
  cleanly and loads into Hevy.
- **`src/data/export.ts`** — `buildHevyExport()`: one query for all finished workouts (nested
  exercises+sets, RLS-scoped), mapped to Hevy rows → `{ csv, workoutCount, setCount, dateRange }`.
  DB-only; file/share stay in the screen.
- **`src/app/export.tsx`** — summary → **share as a `.csv` file** via `expo-sharing`
  (`expo-file-system` `File`/`Paths` writes to cache). Settings → DATA → “Export workouts” now pushes
  here; the old inline 4-column `Share.share({message})` summary (+ its `Share`/`useWorkoutList`
  imports) is removed.

**New native dep:** `expo-sharing` (~57.0.8) — folds into the same pending dev-client rebuild as the
import deps. Verified: `tsc` clean, `expo export` bundles `/export`, and a **serialize→re-parse
round-trip on the real data is exact** (13 workouts / 239 sets, 0 set-field mismatches, `external_id`
preserved ⇒ export→import is idempotent). Not yet run on device.

---

## 2026-07-31 — Hevy CSV import (in-app)

Built an **in-app import** that reconstructs history from a Hevy "Export Data" CSV — the fastest way
to make History / Calendar / progress screens come alive with real data (also softens the
`seed-demo-workouts` backlog item). Surface + unknown-exercise behaviour chosen by the user:
**in-app screen** + **auto-create custom for anything unmatched** (nothing dropped).

- **`src/lib/hevy.ts`** — pure parser (no DB): RFC-4180 CSV tokenizer, groups one-row-per-set into
  workouts→exercises→sets, parses Hevy's `"26 Jul 2026, 10:36"` timestamps (device-local), maps
  `set_type` (`dropset`→`drop`), infers modality for customs. Weights are already kg → no conversion.
  Each workout gets a stable `external_id` (`hevy:<startedAt>|<title>`) → **idempotent re-import**.
- **`src/data/import.ts`** — resolver + writer through the repo layer (RLS applies). Matching is
  **correctness-first**: exact name/alias → equipment-qualified recombination → bare base, but a
  bare-base hit is **rejected when the canonical names a conflicting equipment** (so `Shrug (Dumbbell)`
  → `Dumbbell Shrug`, never `Barbell Shrug`; `Bicep Curl (Dumbbell)` / `Chest Fly (Machine)` fall
  through to safe customs rather than mapping to the wrong variant). `buildImportPlan` previews
  (new-vs-skipped workouts, matched-vs-custom counts, date range) with **zero writes**;
  `commitImportPlan` creates customs then batch-inserts. `logged_via` is `'manual'` (enum has no
  `import`; `external_id != null` already flags imported rows).
- **`src/app/import.tsx`** — pick (expo-document-picker) → read (expo-file-system `File.text()`) →
  **preview** → commit, LED-themed to match Settings. Wired into **Settings → DATA → “Import from
  Hevy”**. `useCommitImport()` in `hooks.ts` invalidates the cache wholesale on success.

**New native deps:** `expo-document-picker` + `expo-file-system` (~57.0.1) → **a dev-client rebuild
is required** (`expo run:ios`) before this runs on device. Verified: `tsc` clean, `expo export`
bundles `/import`, and the parser+matcher run against the real `workout_data.csv` (13 workouts, 239
sets, 20 matched / 21 custom, every match defensible). **Not yet run on device** (needs the rebuild +
a signed-in session hitting live Supabase). The parser is deliberately DB-free so a future
`scripts/import-hevy.ts` is a thin wrapper.

---

## 2026-07-31 — First on-device (simulator) run + feedback pass #1/#2/#7/#9 + parallel-work reconcile

**Milestone: the manual UI rendered on a simulator for the first time** (iPhone 17, iOS sim, via
`expo run:ios`). Two blockers had to be cleared first, both committed in `36696fd`:
- **8-digit OTP.** `SignInScreen.tsx` accepted only a 6-digit code and auto-verified on the 6th
  digit, but the Supabase project mails an **8-digit** code → `CODE_LEN 6 → 8` + copy.
- **Status-bar red-screen.** `react-native-screens` threw a fatal assertion because `_layout` sets
  `statusBarStyle: 'light'` on the native Stack while `UIViewControllerBasedStatusBarAppearance`
  defaulted to NO. Set `true` via `ios.infoPlist` in `app.config.ts`. NOTE: the committed `ios/`
  folder is gitignored and `expo run:ios` skips prebuild, so the value had to be set directly in
  `ios/RepVoice/Info.plist` too (local, not tracked); a clean prebuild regenerates it from config.

**Feedback items closed this session** (see `FEEDBACK-LOG.md`):
- **#1 History nav** — History was a dead-end (rendered no `TabBar`, and it's a pushed top-level
  tab so no header back). Added `<TabBar active="history">` + `flex: 1` on the list. **Verified live
  on the simulator.**
- **#7 Routine-editor clarity** — the three unlabeled micro-inputs now carry `SETS` / `REPS`
  captions, header reads `TARGETS · OPTIONAL`, and the helper note says weight is logged during the
  workout, not here (routines hold rep/set targets only, by design).
- **#2 rest timer removed** and **#9 tappable exercise → progress** also landed (via the parallel
  frictionless-logging / routine sessions); **#4 filter + #6 muscle split** have their own entry below.

**Parallel-work reconcile.** Four concurrent chats edited the *same* working tree (no branches /
worktrees), so git already held the merged result — no conflicts, but a risk of silent clobbering.
Verified the combined tree: `tsc` clean, both new font deps installed + lockfile in sync, app runs
with no red screen, and the shared files kept **both** features (`history/index` #1; `routine/[id]`
#7 + #9). Committed everything as one recovery checkpoint **`c5c1b38`** ("combined QA-feedback work").

**Still open after this pass:** **#3** frictionless defaults (reps 12 / previous-best — `workout/[id]`
still prefills from last session's same-index set), **#5** exercise-list scroll (unreproduced), **#8**
drag-reorder (still ↑/↓). The transient `fetch failed: network connection was lost` toast seen on the
sim is a Supabase/network blip, unrelated to the diff (both muscle-split files are pure).

---

## 2026-07-31 — Type refresh: "option 01" (Instrument Sans + Geist Mono) across all screens

Implemented the updated `RepVoice Manual.dc.html` from the Claude Design project — the
"type option 01" pass. Two structural changes plus spacing polish, all driven through the
token system so screens barely moved.

**Fonts.** UI family Space Grotesk → **Instrument Sans**; number family IBM Plex Mono →
**Geist Mono**. Installed `@expo-google-fonts/instrument-sans` + `@expo-google-fonts/geist-mono`,
swapped the loads in `src/theme/fonts.ts` and the family strings in `src/theme/tokens.ts`
(`font.*` keys unchanged, so every screen picked up the new families for free — all raw
family strings live only in `tokens.ts`).

**Weight drop.** Instrument Sans reads heavier than Space Grotesk, so every UI weight steps
down one: titles 700→600 (`font.uiBold`→`font.uiSemibold`), names/buttons 600→500
(`font.uiSemibold`→`font.uiMedium`). Mono readouts keep their weight (`font.num*` untouched)
so the numbers still carry. Applied as a uniform token rename across all 18 screens +
components (voice components included, to keep the type system consistent).

**Spacing opened up.** Screen insets 20→24 (`paddingHorizontal: space.xl`→`space.xxl`, the
design's 24px); list/set rows +2px (14→16, 15→17, set-grid 11→13; the inline `gridActions`
row deliberately left at 14); +2 air between a list name and its meta line; caption leading
17→18.

Verified: `tsc --noEmit` clean, `expo export --platform web` bundles all 13 routes, and a
web render of the sign-in screen confirms both families load (Instrument Sans logo, Geist
Mono body). Not yet run on device.

---

## 2026-07-31 — Muscle-group filter (#4) + per-workout muscle split (#6)

Two FEEDBACK-LOG items that share the exercise muscle metadata (migration 0004's
`primary_muscles[]` / `secondary_muscles[]` / `body_region[]`), no schema change needed.

**#4 — muscle filter chips.** A horizontal body-region chip row (the 6 `BODY_REGIONS` from
`src/lib/muscles.ts`) now sits above the results in **both** `ExercisePickerModal.tsx` and the
library screen `src/app/exercises.tsx`. Tapping a chip toggles it (single-select). Plumbing:
`searchExercises(query, region?)` gains an optional region — with no query it lists that region
via a new `listExercisesByRegion()` (`.contains('body_region', [region])`); with a query it filters
the ranked trigram matches by `body_region`. `useExerciseSearch(query, region?)` and the
`exerciseSearch` query key carry the region. Chips styled on-theme (pill, accent border/tint when
active — accent stays border-only).

**#6 — per-workout muscle split.** The workout **detail** screen (`src/app/history/[id].tsx`) now
shows a Hevy-style "MUSCLE SPLIT" section under the meta line: body regions with % bars, heaviest
first. Computed purely from the workout already in the cache (no extra query) via a new pure helper
`src/lib/muscleSplit.ts` — each set adds `PRIMARY_WEIGHT` to its exercise's primary regions and
`SECONDARY_WEIGHT` (0.5) to secondary, normalized to shares. Rendered by a new presentational
`src/components/MuscleSplit.tsx` (monochrome LED bars — no accent fill).

`tsc` clean; web export bundles all routes. Not run on device. (Built alongside a parallel session
editing the routine editor / settings / workout screens — those files untouched here.)

---

## 2026-07-30 (session 5) — Wire weekly goal into the calendar tally

After merging the calendar (screen 12) and Entry & edges (13–18) branches, closed the one open
seam between them: `calendar.tsx` hardcoded `WEEK_GOAL = 5`, while screens 13–18 shipped a Settings
"Weekly goal" pref (`src/data/settings.ts`). The calendar now reads it via `useSettings()` —
`const WEEK_GOAL = settings.data?.weeklyGoal ?? 5` (default holds until the query resolves), threaded
through the this-week card, month-grid per-week tallies, the "WEEKS AT N+" stat, and the 12-week
goal line; the three affected `useMemo`s gained `WEEK_GOAL` deps so changing the goal recomputes
live. Also wired the calendar's previously-inert `SETTINGS` tab to `/settings`. `tsc` clean; web
export bundles 13 routes. Not run on device.

---

## 2026-07-30 (session 4) — Calendar view (mockup 12, "five a week")

**Context:** the `RepVoice Manual` design gained a 12th screen — a **Calendar** built on a
"five a week" goal (a count, not a streak: miss a day and the week still stands). Implemented
**in isolation** (parallel chats were editing other files), so the whole feature is two new
files and — at first — zero edits to existing code; the Home tab-wiring was added in a
follow-up step once that was safe.

**Built:**
- `src/app/calendar.tsx` — the screen (`/calendar`, auto-registered by file-based routing).
  Sections, all derived from finished-workout days (no new table): **this-week card** (count
  toward 5, Mon–Sun marks, `ONE TO GO` / `GOAL HIT` status), **month grid** (Monday-first,
  worked days lit / today solid, per-week tally colored by whether it hit 5, `‹ ›` month nav
  capped at the current month), **three stats** (last 7d / last 30d / weeks-at-5+ over 12
  weeks), and a **12-week bar chart** vs. a goal line at 5. Dark LED theme, tokens only; own
  `TabBar` with `CALENDAR` active.
- `src/data/calendar.ts` — new repo module: `listWorkoutDays()` (finished-workout `started_at`
  only, RLS-scoped) + a co-located `useWorkoutDays` query hook (kept out of `data/hooks.ts` to
  preserve isolation; move it there if the file is ever consolidated).

**Wired in (follow-up):** added a `CALENDAR` tab to Home's `TabBar` in `src/app/index.tsx`
(`HOME · CALENDAR · HISTORY · SETTINGS`, per the design) → `router.push('/calendar')`.

**Verified:** `tsc --noEmit` clean; `expo export --platform web` bundles **12** routes incl.
`/calendar`; regenerated typed-routes so `'/calendar'` is a known route. Not yet run on device.

**Left:** `WEEK_GOAL` is hardcoded to 5 (design value) — could become a profile setting. The
calendar's `SETTINGS` tab is inert (Home owns the settings sheet). Not verified on device.

---

## 2026-07-30 (session 4) — "Entry & edges" screens 13–18 (built in an isolated worktree)

**Context:** design canvas `RepVoice Manual.dc.html` grew an **Entry & edges** section (screens 13–18)
covering the states the happy-path 11 skipped. Imported the latest canvas via the Claude Design MCP
and implemented all six. Done on branch `worktree-entry-edges-screens` so the main tree stayed free
for parallel work; the untracked `src/app/calendar.tsx` (screen 12, another chat) is deliberately not
in this worktree.

**Decision (isolation over migration):** the four new logging prefs (default rest, auto-start rest,
pre-fill, weekly goal) are stored **device-local in AsyncStorage** (`src/data/settings.ts`), not on
`profiles` — no migration, no shared-schema edit, works the moment Settings opens. Weight *unit*
stays on `profiles` (read across the whole write path). This mirrors the "built in isolation" pattern
`src/data/calendar.ts` already uses. `weeklyGoal` is the one cross-screen contract: import
`useSettings` in the calendar screen when the calendar tab lands (it currently hardcodes 5).

**Built:**
- **13 Sign in** — rewrote `src/components/SignInScreen.tsx` from the old white placeholder to the dark
  LED theme: email stage with blinking caret → segmented six-box code that auto-advances and verifies
  on the sixth digit (hidden `TextInput` drives the boxes; `oneTimeCode`/`sms-otp` autofill). `_layout`
  status bar for the signed-out branch flipped to light.
- **14 First run** + **16 Resume** — both are Home states (`src/app/index.tsx`). Day-zero: empty week
  strip, "Nothing logged yet / Start with a routine", BUILD MY FIRST ROUTINE vs OR JUST START LIFTING,
  three starter-template cards (all open the routine builder — illustrative, no canned lists).
  Resume: a live-ticking "STILL RUNNING" card (started/sets/last-set from the active `useWorkout`
  detail) with RESUME / FINISH NOW / DISCARD, the "nothing lost — only a half-typed set is gone" note,
  and the routine list held inert (LOCKED, dimmed).
- **15 No-history set grid** — `src/app/workout/[id].tsx` now honours the new settings: `defaultRestSec`
  + `autoStartRest` drive the rest timer, `prefillFromLastSession` gates the pending row (off ⇒ blank
  fields). First time on a lift: lone em-dash PREV (not "— × —"), "NO PREVIOUS SETS", and a one-line
  explainer.
- **17 Fix a logged set** — `src/app/history/[id].tsx` sets are now tappable → the same `SetKeypad`
  edit sheet (save / delete set) weeks later, reusing the optimistic `useUpdateSet`/`useDeleteSet`
  hooks (they key off the shared workout cache, so a finished session patches instantly). Added
  `useDeleteWorkout` + a "Wrong day entirely? DELETE WORKOUT" affordance in the keypad footer, kept
  visually apart from SAVE; wired in both the history sheet and mid-workout.
- **18 Settings** — new real screen `src/app/settings.tsx` (replaces Home's ActionSheet), grouped
  LOGGING / DATA / ACCOUNT; rows toggle/cycle in place (no switches). Export = share a workout-summary
  CSV via the RN `Share` sheet. `TabBar` is now the 4-tab HOME · CALENDAR · HISTORY · SETTINGS across
  Home + Settings.

**Verified:** `tsc --noEmit` clean; `expo export --platform web` bundles all 12 routes (incl. `/settings`;
`/calendar` intentionally absent from this worktree). **Not** run on device (unchanged project state).

**Pending / handoff:** now merged with the calendar branch — `src/app/calendar.tsx` is present so the
CALENDAR tab resolves. Remaining: wire `useSettings().weeklyGoal` into the calendar tally (still
hardcodes `WEEK_GOAL = 5`); if longer OTP codes are ever configured, bump `CODE_LEN` in `SignInScreen`.

---

## 2026-07-30 (session 3) — Exercise directory rebuild: curated 150 with rich, chart-ready metadata

**Decision (user):** the 873-row free-exercise-db import was too large and metadata-poor. Replace
it with a curated set (~150) covering ~95% of common gym movements, each carrying the metadata a
user actually needs to search and to see *which muscle groups a lift trains* (e.g. a deadlift must
credit glutes/hams/lower-back + secondary quads/traps/forearms/lats so a "muscles worked" chart is
complete). Source chosen after review: **curate free-exercise-db** (public domain, already wired,
has primary+secondary muscles) over ExerciseDB / wger.

**Built:**
- `scripts/data/exercises-curated.json` — the curated 150, generated + validated by
  `scripts/build-curated-exercises.py` (checks muscle vocab, dupes, primary/secondary overlap;
  derives `body_region` from primary muscles). Coverage: Legs 50 / Back 30 / Arms 28 / Core 20 /
  Shoulders 19 / Chest 18 (regions can overlap). Modality: 106 weight_reps / 30 bodyweight_reps /
  8 distance_time / 6 time.
- `0004_exercise_metadata.sql` — restructured `exercises`: added `primary_muscles[]`,
  `secondary_muscles[]`, `body_region[]`, `mechanic`, `modality` (checked); dropped `primary_muscle`
  + `category`; GIN indexes on the muscle/region arrays; rewrote `search_exercises()` to be
  column-agnostic (`select e.*` by id).
- `src/lib/muscles.ts` — shared 17-muscle → 6-region taxonomy + `deriveBodyRegion()` +
  primary/secondary volume weights (1.0 / 0.5) for the future muscle-worked chart.
- Rewrote `scripts/seed-exercises.ts` to wipe the old seeded rows (clearing the 4 blocking
  `routine_exercises` first; aliases cascade) and insert the curated 150 + merged aliases.
- Updated `src/types/db.ts` (new `exerciseSchema` + `ExerciseModality`), `src/data/exercises.ts`
  (custom-create maps a single muscle → arrays + derived region + modality), and the 5 UI reads of
  the old `primary_muscle` column.

**Applied live:** repaired CLI migration history (0001–0002 were applied outside the CLI), then
pushed **0003** (alias write policy — turned out to be committed-but-never-applied; now live) and
**0004**. Ran the seed: **873 removed → 150 inserted, 156 aliases**; search probes (RDL, OHP,
incline db, deadlift) resolve. `tsc --noEmit` clean.

**Not done / next up:** on-device verification of the picker/library with the new metadata; optional
UI to surface secondary muscles + a muscle-worked chart (data + weighting are ready); custom-create
UI still only captures one muscle + equipment (no modality picker yet).

---

## 2026-07-30 (session 2) — Manual-first pivot: implemented the "RepVoice Manual" design (11 screens)

**Decision (user):** step back from voice-first. Make the **manual** logging loop work well
first — add a routine, start it, pick exercises, enter weight × reps × sets, see per-exercise
weight history, save routines. Voice comes later, layered back on top of the same set grid.
The voice-first work is **not deleted** — designs and code are preserved.

**Design source:** imported the Claude Design project *"RepVoice voice-first design"*
(`claude.ai/design/p/638a7d3a…`). It already contained a dedicated **`RepVoice Manual.dc.html`**
(11 screens, same dark LED-instrument language). All three design files were pulled into the
repo so nothing depends on the cloud project — see [`docs/design/`](./design/):
`RepVoice-Manual.dc.html`, `RepVoice-VoiceFirst-v3.dc.html`, `support.js`.

**Key finding that drove the work:** the app had **no manual set-creation UI at all** —
`sets.addSet` / `useAddSet` existed but were called by nothing; sets could only be created by
voice. The active-workout screen was a voice console. So the core of a manual tracker was
missing and had to be built, and half the screens were still the plain black-on-white
"Phase-1" UI.

**Built / changed this session (all `tsc`-clean; `expo export --platform web` bundles all 11 routes):**
- **NEW `src/lib/units.ts`** — kg↔display conversion (storage stays kg, hard rule intact),
  `formatWeight/formatSet`, ±step, and barbell plate-per-side math.
- **NEW `src/components/workout/SetKeypad.tsx`** (mockup 05) — bottom-sheet keypad: big KG/REPS
  fields, ±2.5 / SAME-AS-LAST, numeric pad, plate hint. Handles add **and** edit.
- **NEW `src/components/workout/Caret.tsx`** — the blinking LED caret.
- **REWROTE `src/app/workout/[id].tsx`** (mockup 04, "the core") — manual **set grid**
  (`# · PREV · KG · REPS · ✓`), pre-filled from last session so a repeat is one tap on ✓;
  otherwise the keypad opens. Exercise chips, +warmup, inline rest countdown, prev/next,
  finish → summary. No microphone (voice components left intact, just unwired here).
- **REWROTE `src/app/index.tsx`** (mockup 01) — routines-first Home: week-activity strip,
  "up next in rotation" (routine trained longest ago), full routine list, + new routine /
  empty workout. Removed the TALK voice ring.
- **NEW `src/app/finish/[id].tsx`** (mockup 07) — finish summary (duration / sets / volume +
  per-exercise recap). The earlier build skipped this and dropped straight home.
- **Restyled plain-white → dark LED:** `src/components/ui.tsx` (shared `Btn/Loading/Empty/
  ErrorText` — biggest leverage), `routine/[id]` (02), `ExercisePickerModal` (03),
  `history/index` (08), `history/[id]` (09), `exercise/[id]` (10, + top-set trend chart &
  best/sessions/last stats — this is the "weight history per exercise" screen), `exercises`
  (11).
- **`_layout.tsx`** — dropped the white-header stack config; every screen is now dark and
  draws its own in-screen header + safe area, so first paint is dark end-to-end.
- **Hid the dev surface for demos** — removed the "Voice telemetry (dev)" entry from the Home
  settings sheet (route still exists, just unreachable from the UI).

**Follow-ups same session:**
- **Optimistic set writes.** `useAddSet/useUpdateSet/useDeleteSet` now patch the `workout`
  cache synchronously in `onMutate` (snapshot rollback on error, reconciling refetch on
  settle), so the ✓ turns green and the grid updates on the same frame as the tap — no
  network round-trip in the perceived path. Rest timer starts on tap; ✓ isn't disabled
  mid-flight, so back-to-back logging works.
- **kg/lb unit toggle.** Finished the half-built units feature: Settings sheet (Home) now has
  "Weight units · switch to LB/KG", via a new optimistic `useUpdateProfile` — flips every
  screen's weight display at once (storage stays kg).

**Not done / deferred (see CONTEXT open issues):** on-device run + real logging (still no first
OTP login); picker RECENT/muscle filter tabs (need usage data); "NEW BESTS" callout on the
finish screen (needs per-exercise all-time baseline — omitted rather than faked); drag-to-
reorder in the routine editor (uses ↑/↓).

## 2026-07-30 — Full-codebase QA pass + high-impact fix cluster

**Session scope:** Read the whole codebase, flag done/remaining, run static QA, then fix
the highest-impact issues found. No on-device run happened (first login still pending), so
everything below is verified by `tsc --noEmit` + `expo export --platform web` + reasoning,
not a device walkthrough.

**QA findings (full list handed to the user; the ones fixed this session are starred):**
- ★ **Custom fonts never loaded.** `useAppFonts()` existed but was called nowhere, so every
  `font.*` family silently fell back to the system font — the whole LED/mono identity was
  not rendering.
- ★ **White nav headers over the dark voice-first screens.** `_layout.tsx` set a white
  header + white `contentStyle` and never hid the header, so Home/console rendered under a
  white title bar with a white transition flash.
- ★ **Undo snackbar unreachable.** `VoiceConfirmationCard.handleConfirm()` called `onClose()`
  right after `setUndoIds()`, and `onClose` unmounts the component in `VoiceMicButton`
  (`setCard(null)`), so the documented 10-second undo never rendered on the voice path.
- ★ **Voice alias write-back RLS-blocked for seeded exercises.** 0001's `aliases write own
  custom` INSERT policy required `is_custom=true AND created_by=auth.uid()`, but corrections
  almost always map to a seeded exercise, so `createExerciseAliasFromVoice` threw (AC #5
  silently broken).
- (Not fixed this session — reported for later) two-theme white/dark patchwork on the
  Phase-1 screens; `set_number` has no UNIQUE (client-computed, race-prone); `db.ts`'s
  `z.coerce` guards are dead because repos never `.parse()`; model IDs `gpt-5.6-luna/terra`
  unverifiable + eval never run; floor-mode auto-exit fires on manual FLOOR-key entry when
  the phone isn't flat; floor-mode PR celebration effectively unreachable in current wiring;
  dev telemetry reachable in 2 taps; default Expo icon/splash; dead code
  (`useVoiceSession.ts`, `useSessionSpeech`, `floorSensor.ts`); telemetry queries never
  invalidated; `addExerciseToWorkout` doesn't dedupe; `eval/README.md` stale `gpt-4o` refs.

**Fixed this session:**
- **Fonts + first paint** (`_layout.tsx`): wired `useAppFonts()`, held the native splash via
  `expo-splash-screen` until fonts **and** the first session check resolve (falls through on
  font error so it can't strand). No white spinner, no unstyled-font flash.
- **Headers / theme** (`_layout.tsx`): `headerShown:false` + dark `contentStyle` on `index`
  and `workout/[id]` only (the Phase-1 white screens keep their white header, which matches
  their content); per-screen `statusBarStyle` (`light` on the two dark screens, `dark`
  elsewhere / on sign-in); collapsed the two auth branches under one `SafeAreaProvider` +
  `QueryClientProvider`.
- **Safe area** (`index.tsx`, `workout/[id].tsx`): now that those headers are gone, added
  `useSafeAreaInsets()` top padding (replaced the workout screen's guessed `paddingTop:
  space.xxl`) so content clears the notch / Dynamic Island.
- **Undo** (`VoiceConfirmationCard.tsx`): added a `committed` state — on confirm the sheet
  closes (`Modal visible={visible && !committed}`) but the component stays mounted so the
  snackbar runs its window; it dismisses (`onClose`) when the window elapses, on UNDO, or
  when a new parse arrives (reset in the `response` effect). Guarded `handleConfirm` against
  the auto-commit drain double-firing.
- **Alias RLS** (`supabase/migrations/0003_alias_write_policy.sql`, new): replaced the
  narrow policy with `aliases write visible` — an authenticated user may insert a
  `source in ('user','llm')` alias onto any exercise they can SELECT (seeded or own custom).
  `'seed'` stays reserved for the service-role seed script. Idempotent. **NOT YET APPLIED**
  to the live project — run `supabase db push` (or paste it into the SQL editor).

**Verified:** `npx tsc --noEmit` clean; `npx expo export --platform web` bundles all 10
routes; the Space Grotesk / IBM Plex Mono TTFs now appear in the web export (they were
tree-shaken out before the wiring).

**Not done / next up:** apply `0003` to the live DB; the same pending on-device first-login
walkthrough (now the way to actually see the fonts + dark headers render); the unfixed
findings listed above.

**Doc tooling (same day):** added [`docs/CONTEXT.md`](./CONTEXT.md) as the single fast-start
dashboard (current state + pending actions + open-issue backlog + run commands) and pointed
`CLAUDE.md` at it first, so a new chat can bootstrap from one short file instead of a long
prior conversation. Convention going forward: update `CONTEXT.md`'s three live sections
**and** append a `WORK-LOG.md` entry at the end of any session that changes what's built.

---

## 2026-07-20 — Voice-first v2 redesign: console, floor mode, correction drawer

**Session scope:** Implement the 5-screen Claude Design mockup `RepVoice Voice-First.dc.html`
(project `94a04f7d-7d08-41bc-a9c9-e0b31092bb93`, labeled "v2"). Home was already
partially restyled in a prior session against an amber palette from an earlier mockup
iteration; confirmed with the user to replace it with v2's cyan/quantum-black palette
rather than keep both.

**Built:**
- Corrected `src/theme/tokens.ts`'s `color` object from amber to v2's cyan values.
- Home (`src/app/index.tsx`): added the 206px outer glow ring.
- Voice console (`src/app/workout/[id].tsx`): full restyle — header timer/totals,
  exercise-chip selector, session-tape `InsetWell`, bottom transport bar with a FLOOR
  key.
- Correction drawer (`components/VoiceConfirmationCard.tsx`): bottom-sheet restyle,
  widened to also accept a tapped tape row (`editSet` prop, uses existing
  `useUpdateSet`/`useDeleteSet`), and added the auto-commit HEARD panel (confident
  parses drain and self-confirm via `timing.commitHoldMs`, tap-to-cancel).
- Floor mode (`components/voice/FloorMode.tsx`, new): Resting + PR sub-states,
  `expo-sensors` Accelerometer for face-up auto-entry/pickup-exit, PR detection against
  `useLastSession` history.
- `docs/PROJECT-SUMMARY-PHASE2.md` §8 has the full breakdown, including intentional
  scope cuts (tap-only auto-commit cancel, no plate-calculator button).

**Verified:** `npx tsc --noEmit` clean; `npx expo export --platform web` bundles all 10
routes with no errors.

**Not done / next up:** on-device manual walkthrough of the full loop (Home → console →
floor mode → correction drawer) — blocked on the same pending first-login as the rest of
Phase 2. History/Settings screens remain the old Phase 1 unstyled UI; out of scope for
this mockup.

---

## 2026-07-19 — Live iPhone development environment, Supabase deployment, and email OTP setup

**Session scope:** Take the existing Phase 1 + Phase 2 implementation from
"written but not deployed/device-tested" to a locally installed development build on
the user's physical iPhone 15, verify the live Supabase backend, deploy the voice Edge
Function, and make the hosted email-auth flow usable for on-device testing.

### Current end state

- The live Supabase project is linked and healthy:
  - project ref: `amonovkkjohvlkjlfsit`
  - project name: `dsooseven@gmail.com's Project`
  - organization: `ql` (`fgamompxagwefcekbmfw`)
  - region: `ap-southeast-1`
- `.env` contains the real Supabase URL, anon key, service-role key, and OpenAI key.
  Values are intentionally not recorded here. Only the Supabase URL and anon key are
  exposed to the Expo client through `app.config.ts`; service-role/OpenAI credentials
  remain server/local-tool credentials.
- Phase 2 database prerequisites were verified against the live project:
  `voice_logs` is queryable and `search_exercise_candidates` executes successfully.
  Therefore `0002_voice_logs.sql` is applied, in addition to the already-verified Phase
  1 schema/seed/RLS setup.
- Supabase CLI was installed and the project linked. The `parse-utterance` Edge
  Function was deployed successfully, including its shared pipeline modules. The
  OpenAI secret was set in the hosted project. A direct unauthenticated probe returns
  HTTP 401 `not authenticated`, which proves the function exists and is reachable while
  preserving its required JWT guard.
- A native Expo development build now exists on the user's physical iPhone 15. The app
  compiles, installs, is trusted by iOS, launches, connects far enough to render the
  RepVoice sign-in screen, and is ready for JavaScript updates through Metro.
- Hosted Supabase Auth now uses temporary Gmail custom SMTP for development. The
  `Magic link or OTP` template was changed from `{{ .ConfirmationURL }}` to
  `{{ .Token }}` and successfully delivered an 8-digit OTP. This Gmail sender is a
  development-only choice; replace it with a dedicated SMTP provider and verified
  RepVoice-owned sending domain before inviting external users.
- Login has **not yet been confirmed end-to-end** after the OTP-length client fix. The
  immediate next action is to reload the development client, enter the latest 8-digit
  OTP, and verify that the authenticated app shell opens.

### Native/Expo environment completed

- Installed and selected full Xcode at
  `/Applications/Xcode.app/Contents/Developer` (Xcode 26.6, build 17F113), replacing
  the Command-Line-Tools-only setup.
- Installed CocoaPods 1.17.0. Expo prebuild completed and CocoaPods integrated all
  native dependencies.
- Installed Node 22.23.1 because React Native 0.86 / Metro 0.84 explicitly support
  Node `^20.19.4 || ^22.13.0 || ^24.3.0 || >=25`; the previously selected odd-numbered
  Node 23 line is outside that engine range. The machine's default shell may still
  resolve `/opt/homebrew/bin/node` to Node 23, so use this prefix for Expo commands:
  ```bash
  PATH="/opt/homebrew/opt/node@22/bin:$PATH"
  ```
- Added `expo-dev-client@~57.0.7` to `package.json`/`package-lock.json`. This is required
  because `expo-speech-recognition` is a native module/config plugin and the app cannot
  exercise its real voice path in Expo Go.
- Expo's native generation changed the package scripts to:
  - `npm run ios` → `expo run:ios`
  - `npm run android` → `expo run:android`
- Added the stable iOS bundle identifier `com.dhruvshah.repvoice` in
  `app.config.ts`. This avoids Expo's anonymous bundle-ID prompt path and is the ID used
  by the generated Xcode target and installed app.
- `npx expo run:ios --device` generated the ignored `ios/` directory, completed
  prebuild/Pods/Xcode compilation, installed RepVoice on `Dhruv's iPhone`, and selected
  the user's Xcode-managed Personal Team provisioning profile and Apple Development
  certificate. The user trusted that developer profile under iOS Settings and the app
  can launch.
- The generated `ios/` tree remains intentionally ignored by the repository's existing
  `/ios` rule. Native configuration should continue to be sourced from
  `app.config.ts` + config plugins unless the project explicitly decides to commit
  native projects later.

### Authentication implementation changes

- Supabase's current hosted dashboard requires custom SMTP before authentication email
  subjects/bodies can be edited. For this private test environment, Gmail SMTP was
  configured using a Google App Password; no Gmail password or app password is stored
  in the repository or this log.
- The hosted `Magic link or OTP` email now renders `{{ .Token }}`. The project's Auth
  configuration currently emits an 8-digit token, despite older app copy assuming six.
- Updated `src/components/SignInScreen.tsx` so email OTP length follows Supabase's
  supported configurable range rather than a hardcoded value:
  - accepts numeric codes from 6 through 10 digits (`/^\d{6,10}$/`)
  - strips non-digit input
  - raises `maxLength` from 6 to 10
  - enables Verify only for a valid 6–10 digit code
  - changes the label/placeholder to length-neutral copy
- Updated the stale `src/data/auth.ts` comment so it describes the project's configured
  OTP instead of claiming the service always sends six digits.
- This auth change is JavaScript-only and does not require a native rebuild; Metro/Fast
  Refresh or a manual reload is enough.

### Verification completed

- `npx expo-doctor`: **20/20 checks passed** after adding the development client.
- `npx tsc --noEmit`: clean after the configurable OTP change.
- Xcode native build: completed and installed on the physical device.
- Physical-device discovery: iPhone 15 detected by Apple's CoreDevice tools and Expo.
- Supabase Phase 2 schema: `voice_logs` table and candidate-search RPC verified live.
- Edge Function: deployed and reachable; unauthenticated request correctly rejected.
- SMTP/template: real 8-digit OTP delivered through the temporary Gmail sender.

### Exact pickup point for the next agent/session

1. Start Metro from the project root with the supported Node version:
   ```bash
   PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo start --dev-client
   ```
2. Open RepVoice on the iPhone, reload if needed, enter a newly requested 8-digit OTP,
   and verify successful navigation from `SignInScreen` into the signed-in app.
3. Run the Phase 1 smoke test on-device: start empty workout → add Bench Press → add a
   manual set → finish workout → confirm it appears in History/last-session recall.
4. Run the current Phase 2 voice smoke test: start a workout → tap `Voice log` → allow
   Microphone and Speech Recognition → say “bench press sixty kilograms for eight
   reps” → inspect/edit the confirmation card → Confirm → verify a voice-tagged set →
   finish and inspect History. Record any STT/parse/UI issue before changing prompts.
5. Inspect `voice_logs`/the telemetry route after the voice attempt. Then run
   `npm run eval` for the still-missing first real OpenAI baseline; run
   `npm run eval:compare` only after the baseline result is understood.
6. Continue the paused voice-first redesign from the preceding work-log entry. The
   active workout route still uses the older exercise-card UI and `VoiceMicButton`;
   `CorrectionDrawer`, `VoiceConsole`, `FloorMode`, rest timer, supported query answer,
   and the `workout/[id].tsx` rewire remain unfinished.
7. Before any external-user testing, replace temporary Gmail SMTP with a dedicated
   provider (for example Resend/Postmark/SES) and a verified sender such as
   `login@auth.<repvoice-domain>`. Do not ship personal Gmail as the production sender.

### Operational commands

```bash
# Normal JavaScript iteration after the native client is installed
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo start --dev-client

# Rebuild only after native dependency/config-plugin/app-config changes
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo run:ios --device

# Static verification
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo-doctor
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx tsc --noEmit
```

**Working-tree note:** setup currently leaves intentional uncommitted changes in
`app.config.ts`, `package.json`, `package-lock.json`, `src/components/SignInScreen.tsx`,
and `src/data/auth.ts`. `supabase/.temp/` is Supabase CLI link metadata and is currently
untracked. Preserve these changes; do not reset them when starting the next session.

## 2026-07-19 — Voice-first redesign (IN PROGRESS, paused mid-session)

**Session scope:** Implement the Claude Design mockup "RepVoice Voice-First"
(`claude.ai/design/p/3490cf7c-7c24-47da-a2a7-dbc0f28ed54e`, project "RepVoice
Mobile App Mockup") — a dark LED-instrument redesign of the voice logging flow.
User approved: full behavioral rebuild (not just visuals) + gyro floor mode +
TTS/earcons, scoped to **voice-first screens only** (Home + active workout);
history/exercise-library/routine-editor/sign-in stay Phase-1 unstyled for now.

**Paused because:** approaching a usage-limit boundary. Everything committed
below typechecks clean (`npx tsc --noEmit`) but **nothing has been run on a
device or in Expo Go yet** — same "unverified" caveat as the rest of Phase 2's
voice UI.

### Done this session
- `npm install`ed: `@expo-google-fonts/space-grotesk`, `@expo-google-fonts/ibm-plex-mono`,
  `expo-speech`, `expo-haptics`, `expo-sensors`, `expo-linear-gradient`.
- **`src/theme/tokens.ts`** — filled in for real (was the empty Phase-1 placeholder):
  `color`/`radius`/`space`/`shadow`/`tracking`/`timing` + `font` family-name
  strings, all lifted 1:1 from the mockup's CSS custom properties. `timing.*`
  holds the commit state machine's config tokens (`commitHoldMs` 1200,
  `undoWindowMs` 6000, `confFloor` 0.9, `floorEnterMs` 2000, etc) — change
  behavior there, never inline a number.
- **`src/theme/fonts.ts`** — `useAppFonts()` (wraps `expo-font`'s `useFonts`).
  **Not yet wired into `_layout.tsx`** — that's the first thing left to do
  (see below): root layout must gate first paint on `loaded` or text renders
  in the system font until fonts resolve.
- **`src/components/voice/primitives.tsx`** — `LedDigits` (ghost-segment
  digits), `LevelMeter`, `DrainBar`, `KeyCap` (physical keycap via
  `expo-linear-gradient`), `StatusPip`, `TickRule`, `ParseChip`, `InsetWell`.
- **`src/components/voice/TabBar.tsx`** — HOME/HISTORY/SETTINGS bottom nav.
- **`src/lib/feedback.ts`** — `speak()` (TTS via `expo-speech`, gated by an
  echo-verbosity setting: full/numbers/earcon/silent) + `earcon()` (haptic
  patterns via `expo-haptics` standing in for the mockup's relay-click sound
  spec — **there are no bundled audio assets**, this is the one honest gap;
  see the file's top comment for how to wire real `.wav`s later without
  touching call sites).
- **`src/lib/floorSensor.ts`** — `useFloorModeSensor()`, gyro-based floor-mode
  auto-enter/exit via `expo-sensors` DeviceMotion (face-up + stationary
  `timing.floorEnterMs`). Additive only — the FLOOR MODE key is still the
  manual override.
- **`src/lib/stt.ts`** — added `useSessionSpeech()` alongside the existing
  tap-to-toggle `useSpeechToText()` (untouched, still used by Home's
  session-start voice command). New hook is the continuous "mic stays open
  all workout" model: `continuous:true` + `volumeChangeEventOptions`, restarts
  itself on the recognizer's natural `end` events, exposes `interim`/`level`
  for the console's live readout and meter, and a `setMuted()` that actually
  stops/restarts the native recognizer (not just a UI flag).
- **`src/hooks/useVoiceSession.ts`** — the commit state machine from the
  mockup's agent notes (2h): `idle → parsing → committing (drain bar,
  cancelable) → committed (echo + undo window) → idle`, with a `clarify`
  branch for low-confidence/ambiguous/unmatched results. Routes control words
  locally with zero LLM round-trip: "no"/"undo"/"cancel" (cancel the drain or
  undo a just-committed set), "mute"/"unmute", "done"/"finish" (calls
  `onFinishRequested`), `"rest <N>"` / `"skip rest"` (calls
  `onRestOverride`/`onSkipRest` — **caller must supply these**, the hook
  itself has no rest-timer state), and anything matching `/^(what|how|plates)/`
  routes to `onQuery(transcript)` **unanswered** — the hook just detects it's
  a query and hands the raw transcript back; **the screen still needs to
  implement the actual answer** (see Not Done below). Everything else goes
  through the real `parse-utterance` pipeline via the existing
  `useParseVoiceUtterance`/`useConfirmVoiceEntries`/`useUndoVoiceSets` hooks —
  no parsing logic was duplicated.
- **`src/data/sets.ts` / `src/data/hooks.ts`** — added `useUpdateSet()` (the
  repo's `updateSet()` existed but had no hook; the correction drawer needs it).
- **`src/app/index.tsx`** — Home screen fully rebuilt to the mockup (2e):
  REPVOICE wordmark, TALK ring (LevelMeter + LED underline, tap-to-toggle via
  the *existing* `useSpeechToText`, not the new session hook — Home doesn't
  need a continuous mic), routine cards under "OR PRESS" (real data —
  `exercise_count`, not the mockup's fabricated "3 days ago"), bottom TabBar.
  **Voice command matching is local, not LLM**: "start empty" / routine-name
  word-overlap against `useRoutines()` — documented in-file *why*:
  `ParseResult`'s `intent` enum is only `log_sets | correct_last | unknown`,
  there is no session-control intent in the backend yet, so inventing one
  client-side (rather than pretending the LLM understands it) is the honest
  choice. Settings tab opens an action sheet (Exercise library / Voice
  telemetry / Sign out) — folds in the three Phase-1 home-screen affordances
  the mockup's tab bar doesn't have room for, so nothing was lost.

### Not done yet — pick up here
1. **`src/app/_layout.tsx`**: wire `useAppFonts()` in in, dark-theme the
   `Stack` (`screenOptions`), gate first paint on fonts loaded (show
   `<Loading/>` until then, same pattern as the existing auth-session gate).
2. **`src/components/voice/CorrectionDrawer.tsx`** (not started): bottom
   sheet, mockup 2d. Needs `mode: 'edit' | 'create'`. Edit: header
   `{Exercise} · set {n}` + `LOGGED {time}` + DELETE (warn-tone `KeyCap`,
   confirm via `Alert`, calls `deleteSet`); weight/reps steppers (±2.5kg /
   ±1 rep) using `KeyCap`; SAVE calls the new `useUpdateSet()`. A `PLATES ⊞`
   key renders **decorative/disabled** (`tone:'ghost'`, no `onPress`) — no
   plate-math feature exists, don't fake one. Create mode: same stepper UI
   for logging a first manual set on an exercise not yet in the tape (opens
   `ExercisePickerModal` first if no exerciseId given, then calls `addSet`).
3. **`src/components/voice/VoiceConsole.tsx`** (not started): mockup 2b.
   Header (StatusPip LISTENING/MUTED, routine name, elapsed timer, "SET N ·
   TOTAL KG"), session tape (`InsetWell` + tape rows built from
   `workout.exercises.flatMap(sets)` sorted by `created_at`, tapping a row
   opens `CorrectionDrawer` in edit mode), HEARD panel driven entirely by
   `useVoiceSession`'s `phase`/`heard`/`clarify`/`committed`/`drainProgress` (a
   `switch` on `phase` — parsing/committing/clarify/committed/error all need
   their own small render, all four already have the data shaped for them),
   bottom bar (rest-timer `LedDigits`, `LevelMeter` bound to `session.level`,
   MUTE `KeyCap` → `session.setMuted`, FLOOR MODE `KeyCap` → floor-mode
   toggle state owned by the parent screen).
4. **`src/components/voice/FloorMode.tsx`** (not started): mockup 2c, two
   states (`rest` / `echo`) as described in the mockup HTML pulled earlier in
   this conversation (still in this session's context if resumed same-session;
   otherwise re-fetch via `DesignSync get_file` on `RepVoice Voice-First.dc.html`
   in project `3490cf7c-7c24-47da-a2a7-dbc0f28ed54e` — the full HTML/JS is
   there, sections `2c` for floor mode, `2h` for the state-machine spec).
5. **Rest timer**: no rest-timer state exists anywhere yet. Owned by
   `workout/[id].tsx` itself (not `useVoiceSession`): a `useState<number|null>`
   counting down every 1s, started whenever `session.committed` changes
   identity (new commit ⇒ start `timing.restDefaultSec`), adjusted by the
   session hook's `onRestOverride`/`onSkipRest` callbacks, firing
   `earcon('restEnd')` + `speak(...)` at zero.
6. **Query answering**: `useVoiceSession`'s `onQuery` only detects "this looks
   like a question" — implement **exactly one** answer to stay honest about
   backend capability: "what did I \<exercise\> last time" → resolve the
   exercise name against `sessionExercises`/current exercise, call
   `workouts.getLastSession`, `speak()` the result. Do **not** implement PR
   queries or plate math — no PR detection exists (Phase 3) and there's no
   plate-math logic anywhere; answering those would be fabricating a
   capability. If a query doesn't match the one implemented pattern, speak a
   plain "I can't answer that yet."
7. **`src/app/workout/[id].tsx`**: the big rewire. Replace the current
   `ExerciseBlock`-per-exercise UI with `VoiceConsole` as the primary view
   (mockup's "no exercise cards, no expand/collapse — the workout IS the
   log"), `FloorMode` as a full-screen overlay (entered via
   `useFloorModeSensor` or the FLOOR MODE key, exited by tap or gyro pick-up),
   `CorrectionDrawer` as the tap-a-tape-row / add-exercise-manually path.
   Keep Finish/Discard (dark-themed `KeyCap`s). Wire `useVoiceSession` with
   `enabled: !isFinished`, `context` built from `profile.data?.default_unit`,
   `lastSession`/`sessionExercises` same as today's `VoiceMicButton` props.
8. Run `npx tsc --noEmit` (must remain clean — it is right now) and
   `npx expo export --platform web` after the rewire.
9. Actually run it: `npx expo prebuild && npx expo run:ios` (or Android) —
   none of steps 1–8 have been tried on a simulator/device. Fonts, haptics,
   speech, and the gyro sensor are all native-module-dependent; Expo Go will
   not work for the same reason Phase 2's original voice UI needed a native
   build (`expo-speech-recognition`).
10. Update `PROJECT-SUMMARY-PHASE2.md` (or split a `PHASE2-DESIGN.md`) once
    the above is verified working, not before — don't mark this "done" in the
    summary file while it's still unverified on-device.

### Decisions made this session (carry forward)
- Voice-first screens only for this pass — Phase 1 screens (history, exercise
  library, routine editor, sign-in) intentionally left unstyled; don't
  restyle them as a side effect of touching shared components.
- Client-side command matching (Home's routine-start, the session hook's
  control words / rest override / query detection) is **deliberately not**
  routed through the LLM pipeline — `ParseResult`'s intent enum doesn't cover
  session control or queries yet. If Phase 2's backend ever adds those
  intents, these client-side matchers should be replaced, not layered under.
- Earcons are haptics, not audio, until real sound assets exist — see
  `src/lib/feedback.ts`'s top comment.
- `PLATES ⊞` key (correction drawer) should render but stay non-functional —
  don't build a plate calculator that wasn't asked for.

## 2026-07-19 — Pin model to gpt-5.6-luna + full functional audit

**Session scope:** Verify everything required for the app to function is built (frontend/
design/UI and QA excluded — user's domain), and finish wiring the specific OpenAI model.

**Audit result:** All Phase 1 + Phase 2 code is complete and `tsc --noEmit` is clean. No
stubs or TODOs anywhere except `src/theme/tokens.ts` (intentionally deferred to the design
phase). The only remaining work is account/device setup that requires the user's own
credentials/CLI (apply `0002_voice_logs.sql`, deploy the edge function + set the
`OPENAI_API_KEY` secret, run the eval baseline, native dev-client build) — none of it
doable unattended here; `supabase`/`deno` CLIs are not installed in this env.

**Changed:**
- Pinned `PARSE_MODEL_DEFAULT` = `gpt-5.6-luna`, `PARSE_MODEL_MID` = `gpt-5.6-terra` in
  `prices.ts` (were the old placeholder `gpt-4o-mini`/`gpt-4o`). **Verified live** against
  platform.openai.com / developers.openai.com: GPT-5.6 family GA 2026-07-09, Luna $1/$6
  per 1M in/out, Terra $2.50/$15. Updated `MODEL_PRICES` accordingly and dropped the
  "unverified" warnings the file/docs carried.
- Confirmed the code's API surface matches GPT-5.6: Chat Completions with
  `response_format:{type:'json_schema',strict:true}` + `max_completion_tokens` — no code
  change needed in `llm.ts`.
- Refreshed stale `gpt-4o*` references in `eval/run.ts` and `scripts/parse-cli.ts` usage
  comments; updated `PROJECT-SUMMARY-PHASE2.md` §2/§3/§5/§7.

**Not done / next up:** unchanged from below — the user sets `OPENAI_API_KEY` (local `.env`
+ Supabase secret) and does the deploy/migrate/eval/native-build steps. See
`PROJECT-SUMMARY-PHASE2.md` §3.

## 2026-07-19 — Phase 2: switched LLM provider from Anthropic to OpenAI

**Session scope:** Phase 2 only. User doesn't want to get an Anthropic key right now and
has an OpenAI key instead.

**Changed:**
- Added `OpenAiLlm` to `llm.ts` (Chat Completions API, `response_format:
  {type:'json_schema', strict:true}`), implementing the same `LlmClient` interface.
  `AnthropicLlm` is untouched and still there, just unused — switching back later is a
  call-site change, not a rewrite.
- Repointed `PARSE_MODEL_DEFAULT`/`PARSE_MODEL_MID` and `MODEL_PRICES` in `prices.ts` to
  OpenAI models. **Could not verify these live** — two WebFetch lookups against OpenAI's
  pricing/model pages returned inconsistent catalogs, so the model IDs (`gpt-4o-mini`,
  `gpt-4o`) and prices are carried over from pre-cutoff training knowledge, flagged
  clearly in-file as needing confirmation at platform.openai.com before trusting cost
  numbers.
- Updated the edge function, `parse-cli.ts`, `eval/run.ts`, `.env.example`, and
  `eval/README.md` to read `OPENAI_API_KEY` instead of `ANTHROPIC_API_KEY`.
- `npm install openai` (added as a dependency; `@anthropic-ai/sdk` also left in place).

**Not done / next up:** user needs to get their key, confirm the model IDs/pricing are
still current, and run `npm run eval` for the first time — same outstanding list as
before, now against OpenAI. See `PROJECT-SUMMARY-PHASE2.md` §3.

## 2026-07-18 — Phase 2 complete: voice UI, eval harness, telemetry

**Session scope:** Phase 2 only. Finished everything remaining from the previous Phase 2
session's status table.

**Built:**
- Eval harness: 50-case synthetic golden set v1 (all 7 spec categories), `eval/run.ts`
  (per-field + ambiguity-behavior + intent scoring, markdown report), `eval:compare` mode,
  `eval/README.md`.
- `scripts/parse-cli.ts` — local pipeline test tool. Deviates from the original spec
  (which had it hit the deployed edge function): calls Anthropic directly instead, since
  the deployed function requires a user JWT that's awkward to script. See
  `PROJECT-SUMMARY-PHASE2.md` §5 for the reasoning.
- Voice UI: `src/lib/stt.ts` (on-device STT via expo-speech-recognition, tap-to-toggle),
  `src/data/voice.ts` (parse/confirm/undo/alias-write repository), `VoiceMicButton` +
  `VoiceConfirmationCard` components, wired into the active-workout screen at both
  workout and per-exercise level. Failure modes handled: empty STT result, client-side
  parse timeout, parse error — transcript is never silently lost.
- `scripts/harvest-eval-cases.ts` — promotes edited/discarded `voice_logs` into draft
  golden cases.
- Dev-only telemetry screen (`/dev/telemetry`): acceptance rate, edit rate by field,
  ambiguity-question rate, p50/p95 latency, cost vs. the ₹2,000/month budget.
- Schema addition: `ParsedExercise.name` (resolved canonical name), needed by the
  confirmation card to display something other than the raw spoken phrase.
- `tsc --noEmit` and `expo export --platform web` both clean.

**Not done / next up:** everything remaining is account/device setup, not code — deploy
the edge function, apply `0002_voice_logs.sql`, set the `ANTHROPIC_API_KEY` secret (and
in local `.env`), run the eval baseline for the first time, build a native dev client and
test the voice flow on a real phone. Full list in `PROJECT-SUMMARY-PHASE2.md` §3.

## 2026-07-18 — Phase 1 setup verified against real Supabase project

**Session scope:** Phase 1 only. User created their Supabase project and filled `.env`.

**Verified (against the live project, not just files on disk):**
- Migrations applied: all 8 Phase 1 tables present and queryable.
- Seed ran: 873 exercises, 217 aliases in the DB; `search_exercises` spot-checked
  with "RDL", "OHP", "incline db" — all resolve correctly.
- `npm run test:rls` executed for real: all 8 two-account isolation checks passed.

**Not done / next up:** only the human step remains — log 4 consecutive real
workouts in the app. Nothing left to build for Phase 1.

## 2026-07-18 — Phase 1 finalization

**Session scope:** Phase 1 only. Closing out everything that doesn't require the
user's real Supabase credentials.

**Built:**
- Verification pass: `tsc --noEmit` clean; `npx expo export --platform web` bundles
  all 9 routes with no errors.
- Added `npm run seed` and `npm run test:rls` convenience scripts (were long `npx tsx`
  commands before).
- Confirmed `0002_voice_logs.sql` (Phase 2, added by the parallel session) is purely
  additive and doesn't conflict with anything Phase 1 depends on.

**Not done / next up:** everything remaining is account setup + real usage — create
the Supabase project, fill `.env`, apply the migrations, run seed + RLS test, log 4
real workouts. See `PROJECT-SUMMARY-PHASE1.md` § 3.

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
