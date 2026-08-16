# Kratos — Session Context (start here)

**This is the fast-start dashboard. Read this first in any new chat**, then open the
deeper docs only as needed. It holds the current state, what's pending, and the open
issue backlog — so a fresh session can get productive without re-reading the whole
codebase or a huge prior conversation.

> **Maintenance rule:** at the end of any session that changes what's built/decided,
> update the three live sections here (**Current state**, **Pending actions**, **Open
> issues**) *and* append a dated entry to [`WORK-LOG.md`](./WORK-LOG.md). This file is the
> snapshot; `WORK-LOG.md` is the full history. Keep this file short.

**Last updated:** 2026-08-16 — **Pre-submission App Store audit + 8 compliance fixes** (see
[`docs/app-store/PRE-SUBMISSION-AUDIT.md`](./app-store/PRE-SUBMISSION-AUDIT.md)): fixed the in-app
privacy-policy **404** (missing `/legal/`; URL now centralized in `src/lib/urls.ts`); **built the
5.1.2(i) AI-consent gate** before audio → OpenAI (`components/voice/VoiceConsentGate.tsx` +
`voiceAiConsent` in `data/settings.ts` + Settings → PRIVACY toggle; recorder gates the mic on it);
and via new `plugins/withIosPrivacyCleanup.js` + `app.config.ts` stripped `UIBackgroundModes:[audio]`
(2.5.4), the read-only-violating `NSHealthUpdateUsageDescription` (5.1.3), the dead
`expo-speech-recognition` permission, and the unused motion string; dev telemetry screen now
`__DEV__`-gated; stale "voice arrives later" footer removed. **All `tsc`-clean; native fixes verified by
a real clean-room `expo prebuild`.** ⚠️ **Must build via EAS** (committed `ios/` is stale) + verify demo
login on a clean install + keep the voice backend funded during review — see the audit checklist. Prior:
**Auth switched to email + password** (SignInScreen rewritten: SIGN IN /
CREATE ACCOUNT + SHOW/HIDE; "Forgot password?" = in-app one-time-code recovery, no deep links) with a new
Settings → ACCOUNT → **"Set password"** (two secure prompts → `updateUser`; the migration path for the
old code-only account). `auth.ts` +`signInWithPassword`/`signUpWithPassword`/`setPassword`/`sendRecoveryCode`/`verifyRecoveryCode`.
Also **"Import from Hevy" → "Import workouts"**: generic framing + a CSV-format guide (required
`title`/`start_time`/`exercise_title` + optional weight/reps/set_type/…) on the idle stage; parser unchanged
(Hevy exports still drop in). `tsc` clean; **not device-verified**. Supabase dashboard follow-up: password
min length + email-confirmation toggle affect signup. Prior: **App renamed RepVoice → Kratos** + **new photographic barbell icon**. Clean iOS prebuild done (bundle id `com.dhruvshah.kratos`, team `TUR974K866`), **built + installed + launched on device** (Dhruv's iPhone 15, iOS 26.6) via `devicectl`. Prebuild/pod install/xcodebuild all need `LANG=en_US.UTF-8` (Ruby 4.0 + CocoaPods 1.17 crash otherwise). Still to do: host `dhruvsb.github.io/kratos` Pages repo for the privacy-policy link.
#51: History-detail workout **title is now tappable → rename** (`Alert.prompt`, iOS; blank clears back to
"Empty workout"); new `renameWorkout`/`useRenameWorkout` (optimistic). #53: exercise search keyboard now
**dismisses on scroll** (`keyboardDismissMode="on-drag"`) + return-key, in both `ExercisePickerModal` and the
`exercises` library. #42: shared expo-haptics wrapper extracted to `lib/hapticsPrimitive.ts` (`fireHaptic`);
`haptics.ts` + `feedback.ts` both use it, voice mute-gate separation preserved. Prior:
**#52 FIXED (code): new `weighted_bodyweight` modality + full 156-exercise audit** (applied live to the DB —
migration 0011 + `update-exercise-metadata.ts`; sim walkthrough still owed).
Bodyweight-or-loaded lifts (Pull-Up, Dip, Back Extension, …) get an **optional +weight** field: reps lead, a blank
weight is a pure-bodyweight set (`— × 12`), a loaded set reads `+10 × 12` — one exercise, not two. New modality wired
through `SetKeypad`, the active-workout grid, finish/history top-set ranking, `formatSetByModality`, and the
exercise-detail chart; enum + migration `0011` (widened CHECK, no new columns — `weight_kg` already exists). Data:
**20** exercises retagged `weighted_bodyweight`, **11** stay pure `bodyweight_reps`; category fixes (Clean and Press
label **resolves #44**, Rowing Machine/Sumo now Legs+Back, missing secondaries, mechanic tidy-ups); **+6 new
exercises** (150→156) + alias gaps. **⚠️ DB apply pending — use the new NON-destructive `scripts/update-exercise-metadata.ts`
after migration 0011; do NOT run the old destructive `seed-exercises.ts`.** `tsc` clean; not yet on device / live DB.
Prior: **#49 FIXED (code): Home reconciled to the final `Voice Logging.dc.html` (1a) design.**
Imported the design + diffed 1a against the app — the whole voice flow (recorder, routine/log previews, undo banner)
already matched. One real Home delta: the **mic FAB was 62px but the 1a design draws it at 72px/r36** (in both the
Home + Committed screens; the caption's "62px" is stale) — bumped `HomeQuickStart.tsx` FAB → 72/36 and `TabBar.tsx`
`withFab` right-inset 86 → 96 so the glass pill leaves the right gap. The "stray history sub-line" was **already gone
in code** (rows are `weekday · name` post-3c-grouping; the user's screenshot was an older on-device build). `tsc` clean;
constants-only, not yet re-run on sim/device. Prior: **#47 + #48 + #50 FIXED (code), parallel batch (tsc-clean, not device-verified).**
#48: History "Edit" now opens the full live logging workflow on a finished session (in-place, `ended_at` stays set)
via reuse of `workout/[id].tsx` behind `?edit=1`. #47: red **Delete** in the routine long-press menu (hard delete,
history preserved by cascade/set-null). #50: durable weekly local CSV backup (`src/data/backup.ts`) with 4-file
rotation + foreground check-on-mount scheduling. Prior — **#46 FIXED (code): modality-aware set logging.** The set grid + `SetKeypad`
now adapt to each exercise's `modality` — weight_reps (KG+REPS, unchanged), bodyweight_reps (REPS), time
(mm:ss duration), distance_time (cardio: duration + machine level). New migration `0010_set_metrics.sql`
(nullable `duration_seconds`+`level` on `sets`, widened `last_session_sets()`); new
`formatDuration`/`formatLevel`/`formatSetByModality` in `units.ts`; grid/finish/history/exercise-chart all
render in the exercise's own terms. `tsc` green; **migration 0010 applied live + sim-verified 2026-08-14**
(Plank/Elliptical/Push-Up logged, edited, finished — grids, keypads, PREV, finish summary + history all
modality-correct). Prior same day — **Logged #50 (backlog): automatic weekly local CSV
backup**, 4-backup rotation — see [`FEEDBACK-LOG.md`](./FEEDBACK-LOG.md) §15. Not built; the export/serialize
logic already exists (`buildHevyExport`/`serializeHevyCsv`), missing pieces are scheduling (foreground-check on
`lastBackupAt` recommended over true background execution), durable `Paths.document` storage (today's
manual export only writes to the ephemeral `Paths.cache` for the share sheet), and rotation. Prior same day:
**#45 (High) FIXED + sim-verified.** Time-based/weightless exercises
(Plank/Side Plank/Dead Hang) no longer vanish from the finished summary: the pending-row ✓ now **logs the row
as shown, null weight included** (`workout/[id].tsx` `logPending` diverts to the keypad only when there's
nothing to log), so a reps-only set is a real committed set instead of being trapped in the keypad (where
Done/Next silently dropped it) and then culled by `finishWorkout`. Verified on the iOS 17 sim: add Plank
(first-time) → ✓ → "1 set" → Finish → summary shows **Plank · 1 SET**. `tsc` + web-export green. Prior same
day: **logged hands-on device feedback #45–#49** (see [`FEEDBACK-LOG.md`](./FEEDBACK-LOG.md) §14): **#46** no
duration set type;
**#47** can't hard-delete a routine (only Archive); **#48** History "Edit" only deletes — want full editing
of a past session; **#49** latest `Voice Logging.dc.html` design unshipped (mic FAB misaligned + stray Home
history sub-line). Prior: **Phase 2 voice logging UI + workflow built (design "Voice Logging" 1a),
model deliberately left unplugged.** The `+` FAB on Home is now a **mic** (tap → record; long-press → the
old MOST USED sheet). New flow: **full-screen recorder** (`src/app/voice/record.tsx`) → **Stop & review** →
a preview that branches on inferred intent — **03A new-routine** (`components/voice/VoiceRoutinePreview.tsx`)
or **03B logged-workout** (`VoiceLogPreview.tsx`, grouped by exercise, PREV beside every value, tap-to-edit
via the existing `SetKeypad`, missing-field "how many sets?" chips) → **commit writes real rows** through the
existing repos (`useCommitVoiceRoutine` → routine; `useCommitVoiceLog` → start/resume a live workout + write
each set via `confirmVoiceEntries`) → lands on the existing **active-workout screen (04)** with a new
**"N SETS LOGGED FROM VOICE · UNDO"** banner (`components/workout/VoiceUndoBanner.tsx`). **The one seam the
eval's chosen model plugs into is `src/data/voiceParse.ts` — `parseVoiceIntent()` + the `VoiceParseResult`
union (routine | log); it's `MOCK_VOICE=true` today** (canned data, but exercise ids resolved against the real
library so commits write valid FKs; the recorder carries a small MOCK toggle for the log-vs-routine example).
When the model lands: implement `parseVoiceIntent`'s real body + flip `MOCK_VOICE`. Existing Phase-2 code
(`VoiceMicButton`/`VoiceConfirmationCard`/`FloorMode`, `ParseResult`) untouched. `tsc` + web-export (18
routes incl. `/voice/record`, `/voice/preview`) green; **not yet run on the simulator/device.** Prior:
**Apple Health gap-fill (iOS-only) built.** New **Settings → DATA → "Sync
from Apple Health"** button reads strength sessions (`traditional`/`functional` only) from the Health store
and inserts a blank **"Strength Training"** placeholder for any day you worked out but forgot to log —
day-level + `external_id: healthkit:<uuid>` dedup, a real Kratos/Hevy log always wins. Source-agnostic
(Whoop now, Amazfit Helio via Zepp later — no app change). New `src/lib/healthkit.ts` (the only HealthKit
touch-point) + `src/data/healthImport.ts` + `useSyncHealthWorkouts`; config plugin `@kingstinct/react-native-healthkit`
(read-only, `NSHealthShareUsageDescription`). **iOS-only by design** — button hidden off iOS, every entry
point no-ops. `tsc` clean. **Needs a dev-client rebuild** (new native module) before the button works on
device. **Also flagged (awaiting decision): leftover Android/web scaffolding** — see Open issues. Prior:
**"Refined Screens (Dark)" TURN 3 shipped (import `fd29fa5c`).** On top of
TURN 2: **(1)** dark accent toned `#A3E635`→**`#ACD455`** in `tokens.ts` (+ every derivative/CTA/meter;
glows follow `color.acc`; light palette untouched) — "stops glowing at night". **(2)** Home → **3c
week-grouped history**: date moved into a group header (`THIS WEEK` / `3–9 AUG` + per-week count), rows
now just **weekday · name · PR medal — no volume**; HISTORY divider centered; the "N in last 30 days"
count removed. **(3)** **Log-sheet v3**: keypad gained **Done + Next exercise** above Log set (SetKeypad
`onDone`/`onNextExercise`, add-mode only) and a **"{exercise} · Set N" · "{i} of {total}"** header.
**(4)** Primary CTAs now **solid lime fill + near-black ink on dark too** (`ctaBg`/`ctaBorder`/`ctaFg`
flipped in `tokens.ts` dark palette to match the mockup; light was already solid moss) — the LED
dark-fill/accent-border CTA look is retired for full-width buttons; the current-set ✓ stays
accent-border-only. Built + installed to the iPhone 15 (Release, Personal Team). `tsc` + web-export (16 routes) green. Prior: **"Refined Screens
(Dark)" design pass shipped (import `fd29fa5c`).**
Implemented the whole refinement + the three picks: **PR badge → 2a Medal** (new shared
`components/PrBadge.tsx` — ribbon+disc medal, replaces Home's star, now the app-wide PR mark),
**nav icons → 2d** (dumbbell Routines icon, sentence-case labels), **log set → 1a** (SetKeypad:
"Set N" header, merged ±step + 8/10/12 rep row). Screens reflowed to the design (Home history
rows name+date·vol·medal + "HISTORY · N IN LAST 30 DAYS" + filled calendar cells; Active workout
RECORDING+⋯, named ✓ chips, Next/Finish footer, discard→⋯; Workout detail leads with name + PR
banner + stacked-bar MuscleSplit + per-set volume; Routines Edit/Start pills + count; Settings
section rules + real Pre-fill switch). **Colours/fonts stay on `tokens.ts`** (design hexes render
through `acc`/`t1..t3`/`font.*`); primary CTAs keep the `ctaBg` semantics (dark = dark-fill+accent,
solid fill reserved for light) rather than the mockup's solid-lime. `tsc` + web-export (16 routes)
green. Prior: **Imported workouts no longer show "Empty workout":** workouts got a
first-class `title` (migration **`0009`**, applied live + backfills existing Hevy imports); importer
writes it, display fallback is now `title ?? routine_name ?? 'Empty workout'` everywhere, export uses it
for round-trip. `tsc` clean. Prior: **Backlog batch (5 fixes, code):** repo reads now `.parse()` through zod
(dead `z.coerce` guards killed; numeric-as-string can't corrupt `weight_kg`); **#34** day-zero Home welcome
(`HomeDayZero.tsx`); `ios.appleTeamId` moved into `app.config.ts` (survives prebuild); **#28** progressive-
overload ghost in the set grid; **Task 5** in-app "Clear all history" (Settings → DATA; keeps routines) via
new RPC `clear_own_workouts()` — **migration `0008` written, NOT applied** (apply before the row works live).
`tsc` + `test:offline` 16/16 green; none on device yet. Prior: **"Kratos Home" redesign shipped: single-line streak + liquid-glass tabs
(#22).** Implemented the `Kratos Home.dc.html` design — a floating **glass tab pill** (HOME · ROUTINES ·
SETTINGS, SVG icons via new `react-native-svg`, active-tab glass chip) + a **green-glass `+` FAB** beside
it, real iOS-26 `GlassView` with `colorScheme` bound to the in-app theme and an opaque-token fallback off
iOS 26 (`TabBar.tsx`, `HomeQuickStart.tsx`). Home reflowed to a **fixed single-line streak header** over a
scrolling feed that dissolves under a bottom fade (`index.tsx`). **Verified on the iOS 26.5 simulator, both
themes** (dark glass renders while OS is light; taps pass through; FAB sheet intact). Design calls
followed as drawn: dropped the `KRATOS.` wordmark; third tab labelled SETTINGS (was ACCOUNT). Prior:
**Three parallel agents landed (one commit): #32 data durability, logging
robustness, #19 Biceps/Triceps split.** All `tsc`-clean; `test:offline` **16/16** (5 new online-kill
checks). **#32 (High) DONE (code):** forced cache flush on AppState background (`flushCache()`
bypasses the ~1s throttle, `_layout.tsx`); online in-flight writes now persist + re-drive on relaunch
(`dehydrateOptions` keeps *running* offline-logging mutations, `resumeInterruptedMutations()` serially
re-drives paused + interrupted, FK-ordered); new online background→kill→relaunch test case. **Logging
robustness:** migration `0006_sets_unique_set_number.sql` adds `UNIQUE(workout_exercise_id, set_number)`
(**written, not applied**) + `insertSet` made idempotent/retrying on `23505` (composes with #32's
re-drive); `addExerciseToWorkout` dedupes `(workout_id, exercise_id)`; mid-workout **remove exercise**
wired into `workout/[id].tsx` (REMOVE control + long-press, `useRemoveWorkoutExercise`). **#19:** Arms →
**Biceps + Triceps** (forearms folded into Biceps) = 7 regions in `muscles.ts`; curated JSON regenerated
(re-seed `npm run seed` **left for the user**). **Two user follow-ups: apply `0006`; `npm run seed`.**
Not yet on device. Prior: **"Rolling Weeks" Home redesign — ALL 3 PHASES DONE + simulator-verified both
themes.** The full `Kratos Home Rolling Weeks.dc.html` is implemented. **Phase 3:** a **scroll-pinned
compact streak bar** (`{streak} DAY STREAK · BEST n` + a 30-day micro sparkline from `computeStreak().micro`)
that fades/slides in as the hero scrolls away — `Animated.ScrollView` + one native-driven `scrollY` (bar
opacity, bg opacity reaching full in the first quarter to mask content, and a small slide); `pointerEvents:
none` so it never blocks touches. **Phase 2:** a `+` **FAB** (`components/home/HomeQuickStart.tsx`) opens a **"MOST USED"
bottom sheet** — routines ranked by 90-day usage, each `START →`, plus `+ NEW ROUTINE` / `EMPTY WORKOUT`;
the FAB rotates to `×` and lifts above the sheet as its close control (dynamic-height positioned via
`onLayout`), scrim closes it too, all `Animated` (native driver). FAB uses the semantic `cta*` tokens (dark =
dark circle + accent glyph/glow, light = solid moss fill), START routes through `useStartWorkoutFlow`.
**Phase 1:** streak-first Home (`Kratos Home Rolling Weeks.dc.html`): a big day-streak numeral, a
rolling **five-week weekday-aligned heatmap** (worked = accent fill, rest = faint, skipped = dashed, today =
accent ring), and the recent **history inline** — the calendar + history folded into Home. Bottom bar cut to
**3 tabs: HOME · ROUTINES · ACCOUNT** (`HomeTabBar` in `components/voice/TabBar.tsx`); the routine list moved
to a **new `/routines` screen**; ACCOUNT → Settings. Streak is **rest-tolerant** (an isolated non-worked day
keeps the chain and counts; a 2+-day gap breaks it) — pure, unit-tested logic in `src/lib/streak.ts` (+
shared date helpers `src/lib/dates.ts`; shared start flow `src/data/useStartWorkoutFlow.ts`). Calendar/History
screens stay on disk but are off the tab bar. **Deferred + logged as backlog #33–35** (`FEEDBACK-LOG.md`):
running-workout resume state, day-zero first-run state, history PR/REST tags — a live workout is still
resumable via the shared start flow. **Phases 2–3 next:** the `+` FAB + "MOST USED" quick-start sheet, then
the scroll-pinned streak bar. `tsc` + web-export (16 routes incl. `/routines`) green; **walked on the iOS
simulator (light + dark; dark LED look unchanged; all 3 tabs navigate).** Prior: **Warmup feature removed
(#31) + backlog pruned.** The manual UI no
longer references warmup anywhere: no `+ WARMUP` button, no `W`/`WARMUP` labels in the live grid or
history — every set numbers plainly (`workout/[id].tsx`, `history/[id].tsx`). UI-removal only; the
`set_type` enum, `lib/hevy.ts` warmup mapping, and unwired Phase-2 voice type-list stay, so Hevy imports
still load. Drop/failure tags remain in history for imported data. Also **withdrew #24 #25 #27 #30**
(won't do — dropped per product call). `tsc` + web-export green; not yet on device. Prior: **Light theme
(#17) COMPLETE — Phases 2 + 3 done; the toggle works app-wide.** The real light palette ("Greige + Moss", option 2a from `design_handoff_light_mode/`) is in
`tokens.ts` (`themes.light` — warm off-white ground `#EBE8E1`, moss accent `#3F6B3B`, warm brown-black
hairlines, flat glows + soft-warm CTA shadow). **All ~28 screens/components migrated** from the static
`color`/`shadow` imports to `useTheme()` via a `makeStyles(color, shadow)` factory memoized per component
(zero steady-state cost — styles rebuild only on an actual theme flip). Four non-straight-swap rules from
the handoff are carried by **semantic tokens** so one StyleSheet serves both themes and **dark stays
byte-for-byte unchanged**: primary CTAs (`ctaBg/ctaBorder/ctaFg` + `shadow.cta`) become a solid moss fill
with white ink on light (they'd read as disabled with a plain swap); the current-set ✓ (`checkBg/checkFg`)
becomes a filled accent chip; `KeyCap` accent tone (NEXT/FINISH) branches on `useThemeName()` for the same
reason. **Phase 3:** Settings → APPEARANCE → **Theme** row cycles System·Light·Dark (`useThemeMode()`);
`_layout`'s `AppContent` makes the canvas bg + status-bar style theme-aware. `tsc` + web-export green (15
routes). **Verified on the iOS simulator (2026-08-08):** Home (solid moss START CTA), active workout (solid
FINISH CTA + filled ✓ chip + completed plain-glyph ✓ — both hard rules), Calendar (computed cell colors incl.
solid "today" cell), Settings; the System·Light·Dark toggle flips the whole app live and **dark renders
byte-identical to before**. Not yet on physical device (the installed Release build bundles old JS — needs a
rebuild). Prior: **Feedback fixes #16 / #15 + warmup-removal logged (#31).**
**#16:** the finish summary now reads in **kg** regardless of the profile display unit
(`finish/[id].tsx`) — kills the tonne-on-pounds label bug (a converted lb volume no longer gets a `t`
suffix). **#15:** the plate-per-side hint moved from a 9.5px footer whisper to a readable line
(11.5px) right under the KG/REPS fields in `SetKeypad`. Also logged **#31** (remove the warmup feature
entirely — UI only; the `set_type` enum + Hevy import stay) and **withdrew #29** (warmup ramp). `tsc` +
web-export green; not on device. Prior: **App Store prep, part 2: privacy policy + `eas.json`.**
`docs/legal/privacy-policy.html` (self-contained, LED-themed, written from a real audit of the code —
there are **no** analytics/ads/crash SDKs anywhere, so Supabase is the only third party) + a Settings →
ABOUT → "Privacy policy" row, since 5.1.1(i) wants the link in-app *and* in App Store Connect.
`eas.json` (which already existed) gained a `development-device` profile and an explicit
`preview.ios.simulator: false`, so `preview` is the internal-distribution **Release** build.
**Two blockers before any build:**
the policy URL in `settings.tsx` is a placeholder until the page is hosted, and `.env` is gitignored so
the Supabase vars must be pushed to EAS or the build ships with empty credentials. Prior:
**In-app account deletion** (App Store Guideline 5.1.1(v): an
account-creating app that can't delete accounts in-app gets rejected). Settings → ACCOUNT → "Delete
account" → two confirms → `deleteAccount()` → RPC `public.delete_own_account()` (migration **`0005`,
applied live** — security-definer, no args, acts only on `auth.uid()`) → local sign-out wipes the
persisted cache. Custom exercises are deleted explicitly (their FK is `set null`, so the cascade
would strand them). Proven end-to-end on a throwaway live account; not yet seen on device.
Prior: **Feedback fixes #21 / #18 / #5** (code only, not yet on device):
**#21** dropped the SETS/REPS target inputs from the routine editor — creating a routine is now
exercise-selection + order only (targets were write-only, read nowhere); this also retired the
`InputAccessoryView` from **#20** (it existed only to dismiss the number-pad on those inputs).
**#18** the exercise picker gained a `multiSelect` mode — tap rows to check them (search/region
persist), an **ADD (n)** bar commits the batch; routine editor uses it, mid-workout add stays
single-select (so `workout/[id].tsx` was untouched). **#5** exercise-list scroll: wrapped the picker
sheet in a `KeyboardAvoidingView` so the `autoFocus` keyboard no longer sits over the lower list rows
(best-reasoned root cause; device-confirm pending). `tsc` + web-export green. Prior: **Feedback fixes #13 / #26 / #11** (code only, not yet on device):
**#13** reps are now a fixed chip row (4·6·8·10·12) in `SetKeypad`, always visible so the numeric pad
serves weight alone — flow is "type weight → tap a rep chip → LOG"; odd reps stay reachable via the
REPS field + ± step (this also dissolves **#12**'s weight→reps auto-advance — no longer needed);
**#26** logging a working set now keeps the keypad open on the next set, pre-filled with what you just
logged, so a run of sets is tap-tap-tap (warmups/edits still close); **#11** delete-set is now
discoverable — **long-press** a logged row → confirm-delete, and the edit-sheet DELETE is now a real
outlined button, not 9.5px footer text (swipe-to-delete deferred: the RNGH/reanimated stack is
installed but unexercised — no `GestureHandlerRootView`/babel setup — not worth wiring untested into a
showcase build). `tsc` green. Prior: **Feedback fixes #14 / #20 / #3** — **#14** weight entry capped at
1000 kg + plate math/hint clamped (no insert-overflow crash or off-screen plate string); **#20**
routine-editor number-pad dismissable (iOS DONE accessory + drag-to-dismiss); **#3** frictionless
defaults — pending row pre-fills weight from all-time previous best, reps default to 12. Prior: **First run on real hardware** (iPhone 15, free Apple Personal
Team `TUR974K866` — no paid dev account, 7-day cert, see `WORK-LOG.md` for the signing route).
Fixed feedback **#10** (tab transitions): the 4 top-level tabs are plain Stack routes (no `Tabs`
layout) that were navigating via `router.push()`, playing the wrong "going deeper" slide and
growing the stack unbounded — now all 4 use `router.replace()` (depth stays 1) with a 160ms
cross-fade override, verified smooth live on-device. Detail routes still push, so depth still
reads as depth. Not complete: no real `Tabs` layout yet, so tabs still remount (scroll position
lost) — see `FEEDBACK-LOG.md` #10. Prior: 2026-08-06 (evening) — **Showcase-finish pass:** app icon + splash are now the
LED-barbell brand (generated by `npm run build:icons`; dark splash — white flash gone; stock Expo art
deleted); `npm run seed:demo` seeds 8 weeks of Push/Pull/Legs/Upper history + the four named routines
(deterministic, idempotent, `--wipe`-able) so History/Calendar/progress look alive; the finish summary
gained its **NEW BESTS** callout (cyan, mockup 07; improvements-only via `getExerciseBests`). See
WORK-LOG. Prior same day: **Offline-first logging: built, QA'd (2 rounds, 6 fixes), verified live.**
The active-logging path (start new/from-routine → pick exercises → log/edit/delete weight×reps×sets →
finish/discard) works fully disconnected, syncs on reconnect, and survives an app kill. Mechanism:
NetInfo→`onlineManager` so offline writes **pause** (not roll back); replay-safe writes (client
`set_number`/`position`/ids in mutation *variables*); persisted+resumable queue (`src/data/offlineSync.ts`
+ **serial** resume via `SerialResumeQueryClient` — RQ's own flush is concurrent and can race FK order);
offline picker (cached directory + local filter); `OfflineBanner`; connectivity truth from a **HEAD probe**
of Supabase health (NetInfo can lie both ways — stale-"online" makes writes fire→fail→roll back).
History/calendar/progress/voice stay online-only by design. Proven on the simulator (Release build; a dev
build can't test offline — Wi-Fi-off severs Metro) against the live DB: workout born offline → kill →
relaunch → reconnect → exact serial flush incl. offline edit/delete; offline discard nets no trace;
`npm run test:offline` **11/11**; online regression sweep green. `tsc` + web-export green. NetInfo is
native ⇒ dev-client rebuilt. See WORK-LOG 2026-08-06 (three entries) for the QA findings.
Prior: **Instant interactions: navigate-first start/finish/discard + prefetch**
(idea #2, on top of the persisted cache). Start/finish/discard now act on the same tap against the local
cache and reconcile in the background; the client picks row ids (`src/lib/ids.ts`) so START builds the
whole workout from the cached routine and navigates immediately — guarded by an FK-ordering await
(`awaitWorkoutCommitted`) so no child write beats its parent insert. `usePrefetchRoutineDetails` /
`usePrefetchLastSessions` warm the 80%-repeat data; the 1s clock moved into a leaf (`LiveClock`) so it no
longer re-renders Home / the grid. `tsc` + web-export green; a **live-DB RLS harness** proves client-uuid
inserts + finish semantics (10/10). On-device optimistic-feel smoke still pending. Prior: **Local-first:
persisted React Query cache (instant cold start)**. The
query cache now persists to AsyncStorage (`src/lib/queryClient.ts`); `_layout` uses
`PersistQueryClientProvider` + a `BootGate` that holds the splash on cache-restore so first paint shows
hydrated data, and wipes the cache on sign-out/account-switch. `staleTime` tiered in `hooks.ts`. New deps
are pure-JS ⇒ **no dev-client rebuild**. `tsc` + web-export green; save→restore proven by a Node harness;
on-device warm-relaunch check pending. Prior same day: **Hevy CSV import + export (in-app)**. Import (Settings → DATA → “Import
from Hevy”) previews then writes real history through the repo layer, idempotent via
`workouts.external_id`; export (“Export workouts”) shares a Hevy-compatible `.csv` file that round-trips
back through the importer (verified exact on the real data). New native deps (`expo-document-picker`,
`expo-file-system`, `expo-sharing`) ⇒ **dev-client rebuild required**; static-verified, not yet run on
device. See WORK-LOG. Prior same day: **first on-device (simulator) run of the manual UI** + a QA-feedback
pass. Cleared two blockers (8-digit OTP + status-bar red-screen; `36696fd`) and closed feedback items
**#1 nav · #2 rest-timer · #4 filter · #6 muscle split · #7 routine labels · #9 progress-from-routine**
(see [`FEEDBACK-LOG.md`](./FEEDBACK-LOG.md)); four parallel sessions' work combined + checkpointed in
`c5c1b38`. Still open: **#3** defaults, **#5** list scroll, **#8** drag-reorder. Prior same day:
**type refresh "option 01"** (Space Grotesk → **Instrument Sans**, IBM Plex Mono → **Geist Mono**;
UI weights step down one, mono unchanged; 24px insets) — see WORK-LOG. Prior: session-4 branches, now merged: **calendar view**
(mockup-12 "five a week" `/calendar` + `data/calendar.ts`, wired into Home's tab bar) and **"Entry &
edges" screens 13–18** (sign-in, first-run, resume, no-history grid, fix-a-set, real Settings + a
local AsyncStorage settings store). Both static-verified, not on device. Prior: session 3 exercise
directory rebuild — migrations 0003 & 0004 live. See WORK-LOG.

---

## What this is (10-second version)

Kratos = a workout logger (Expo/React Native + Supabase), built as a **portfolio /
showcase piece** (judged on screenshots, demo recordings, and a stranger trying it cold).
Weight is always stored in kg. **Current focus: manual-first.** The whole manual loop
(routine → start → pick exercises → log weight×reps×sets → per-exercise weight history)
is now implemented on the dark "LED-instrument" theme per the `Kratos Manual` design.
Voice logging (Phase 2) is built but **unwired from the manual screens** and returns
later on top of the same set grid. Three phases: **1** manual tracker, **2** voice
logging via an LLM pipeline, **3** TBD (PRs/charts).

> **Where the designs live:** [`docs/design/`](./design/) holds the imported Claude Design
> canvases — `Kratos-Manual.dc.html` (what's implemented) and
> `Kratos-VoiceFirst-v3.dc.html` (kept for the later voice phase), plus `support.js` so
> both render standalone.

## Read order (deeper docs)

1. [`PRODUCT-PRINCIPLES.md`](./PRODUCT-PRINCIPLES.md) — the *why* / standing priorities. Flag conflicts before implementing.
2. `../CLAUDE.md` + `../AGENTS.md` — hard rules (kg-only, no client API keys, repo-layer-only DB access, RLS) and stack.
3. [`PROJECT-SUMMARY-PHASE1.md`](./PROJECT-SUMMARY-PHASE1.md) — manual tracker: built/decided/left.
4. [`PROJECT-SUMMARY-PHASE2.md`](./PROJECT-SUMMARY-PHASE2.md) — voice/LLM pipeline: same. (§9 = latest QA fixes.)
5. [`WORK-LOG.md`](./WORK-LOG.md) — full dated change history (newest at top).

---

## Current state

| Area | Status |
|---|---|
| **"Rolling Weeks" Home redesign — ALL 3 PHASES** | ✅ **Built + simulator-verified 2026-08-09** — **P1:** streak-first Home (streak hero + rest-tolerant 5-week heatmap + inline history) on the new **3-tab** IA (HOME · ROUTINES · ACCOUNT); new `/routines` screen; `src/lib/streak.ts` (unit-tested) + `dates.ts` + `useStartWorkoutFlow.ts`. **P2:** `+` FAB + "MOST USED" quick-start sheet (`components/home/HomeQuickStart.tsx`; Animated slide/rotate, usage-ranked, START/new/empty). **P3:** scroll-pinned compact streak bar + 30-day sparkline (`Animated.ScrollView`, native-driven fade/slide). Both themes walked; dark unchanged. Deferred states = backlog #33–35. |
| Phase 1 backbone (schema, RLS, repos) | ✅ Built; backend verified live (**150 curated exercises** / 156 aliases seeded; RLS test passed) |
| **Local-first cache (persisted React Query)** | ✅ **Built 2026-07-31** — cold start hydrates last-known data from AsyncStorage (`src/lib/queryClient.ts`), revalidates in background; `staleTime` tiered; cache wiped on sign-out/account-switch. Warm-relaunch hydration **proven live 2026-08-06** (instant paint from disk even offline). |
| **Offline-first logging (write while disconnected + sync)** | ✅ **Built + verified on-device 2026-08-06** — start→pick→log/edit/delete sets→finish all work offline and sync on reconnect, surviving app kill. NetInfo→`onlineManager` (writes pause, not roll back); replay-safe writes (client `set_number`/`position`/ids in mutation *variables*); persisted+resumable queue (`src/data/offlineSync.ts`, `resumePausedMutations`); offline picker (`useExerciseDirectory` + local filter); `OfflineBanner`. History/calendar/progress/voice stay online-only. `npm run test:offline` **8/8** on live DB **and the full loop proven on the simulator** (offline log → kill → relaunch → reconnect → rows verified in Supabase). **QA'd 2026-08-06 (6 fixes)**: banner cold-start seed, SYNCING-pill latch, offline cold-cache START alert, **serial resume** (`SerialResumeQueryClient` — RQ 5.101's own resume is concurrent `Promise.all`), foreground re-seed + 10s poll, and an **authoritative reachability probe** (HEAD `/auth/v1/health` — NetInfo can lie in both directions; a stale "online" makes writes fire→fail→roll back). Deep scenarios verified vs the live DB: offline edit/delete of unsynced sets, offline discard (net no-trace), stuck-queue recovery; harness `test:offline` **11/11**. |
| **Instant interactions (navigate-first + prefetch)** | ✅ **Built 2026-07-31** — start/finish/discard/add-exercise are optimistic (client-chosen ids via `src/lib/ids.ts`, FK-ordering guard, snapshot rollback); routine + last-session prefetch serve the 80%-repeat case from cache; 1s clock isolated in `LiveClock`. Live-DB RLS harness green (10/10). On-device optimistic-feel smoke pending. |
| **Exercise directory — curated + rich metadata** | ✅ **Rebuilt this session**: replaced the 873 free-exercise-db import with a curated 150-set carrying `primary_muscles[]`, `secondary_muscles[]`, `body_region[]` rollup, `mechanic`, `modality`. Source of truth: `scripts/data/exercises-curated.json` (regen via `scripts/build-curated-exercises.py`). Muscle taxonomy in `src/lib/muscles.ts`. |
| **Manual-first UI — all 12 `Kratos Manual` screens** | ✅ Built (dark LED theme); **now renders on the iOS simulator** (first run 2026-07-31 — Home, History, routines all render; full manual-loop walkthrough still pending) |
| **"Entry & edges" screens 13–18** | ✅ **Built session 4**: 13 sign-in (LED, 6-box code) · 14 first-run + 16 resume (Home states) · 15 no-history grid · 17 fix-a-set from history + delete-workout · 18 real Settings screen. New local settings store `src/data/settings.ts` (AsyncStorage; drives pre-fill/rest/weekly-goal). 4-tab nav (HOME·CALENDAR·HISTORY·SETTINGS). Static-verified only. |
| ↳ Manual set logging (grid + keypad) — *the core, previously missing* | ✅ Built (`workout/[id]`, `components/workout/SetKeypad`, `lib/units`) |
| ↳ Home / routine editor / picker / history / past workout / exercise progress / library / finish | ✅ Built / restyled dark |
| ↳ **Calendar (mockup 12, "five a week")** | ✅ **Built this session** — `src/app/calendar.tsx` + `src/data/calendar.ts` (finished-workout days → week card / month grid / streak stats / 12-week bars); wired into Home tab bar. Weekly goal driven by Settings (`useSettings().weeklyGoal`, default 5). |
| **Hevy CSV import + export (in-app)** | ✅ **Built this session** — **Import**: `src/lib/hevy.ts` (pure parser) + `src/data/import.ts` (correctness-first matcher; auto-creates customs) + `src/app/import.tsx` (pick→preview→commit), idempotent via `external_id`. **Export**: `serializeHevyCsv` (inverse) + `src/data/export.ts` + `src/app/export.tsx` (summary → share `.csv` file). Round-trip verified exact on the real data (13 workouts / 239 sets). Both wired into Settings → DATA. **Needs a dev-client rebuild** for new native deps (`expo-document-picker`/`expo-file-system`/`expo-sharing`); not yet run on device. |
| Two-theme white/dark patchwork | ✅ **Resolved** — every screen is now dark; `_layout` header config dropped |
| **Light theme (#17) + System·Light·Dark toggle** | ✅ **Built + simulator-verified 2026-08-08** — real "Greige + Moss" light palette (`design_handoff_light_mode/`) in `tokens.ts`; all ~28 screens/components read `useTheme()` (memoized `makeStyles` factory); semantic `cta*`/`check*` tokens + `KeyCap` theme-branch carry the 4 non-swap rules so **dark is unchanged**; Settings → APPEARANCE → Theme + theme-aware `_layout` chrome. **Walked on the iOS simulator** (Home / active workout / Calendar / Settings; both CTA + ✓-chip rules confirmed; toggle flips the app live; dark byte-identical). `tsc` + web-export green. Not yet on physical device (installed Release build has old JS bundled — needs a rebuild). |
| Phase 2 voice pipeline (extraction → resolution → kg) | ✅ Built; edge fn deployed + auth-guarded; **unwired from manual UI** (returns later) |
| Native iOS Release build on physical iPhone 15 | ✅ **Installed + running 2026-08-08** — free Apple Personal Team (`TUR974K866`), no cable needed day-to-day, 7-day cert (reinstall route in `WORK-LOG.md`). |
| First OTP login + on-device smoke test of the manual loop | 🟡 **Partial** — app runs on real hardware, signed in via a persisted session, and **#1 History nav** + **#10 tab transitions** verified live. Still to do: a real OTP sign-in from scratch (8-digit code now supported) and walk the full loop (start routine → log sets via ✓ and keypad → finish → History → progress). |
| Eval baseline (`npm run eval`) | ❌ Never run against the real API (Phase 2 concern) |
| Migration `0003_alias_write_policy.sql` | ✅ **Applied this session** (was committed-but-unapplied; Phase 2 alias write-back policy now live) |
| **In-app account deletion** (App Store 5.1.1(v)) | ✅ **Built + verified live 2026-08-08** — Settings → ACCOUNT → "Delete account" (two native confirms, completion alert) → `deleteAccount()` in `src/data/auth.ts` → RPC `delete_own_account()` (migration `0005`) → `signOut({ scope: 'local' })`. Verified on a throwaway live account: user, profile, routines, workouts, sets, voice_logs, custom exercises + aliases all gone; seeded 150 intact. Not yet rendered on device (pure JS — no dev-client rebuild needed). |
| Migration `0006_sets_unique_set_number.sql` (`set_number` UNIQUE + dedupe) | ✅ **Applied live 2026-08-13** (had real dups; migration now dedupes first) |
| Migration `0007_workout_pr_counts.sql` (PR-counts RPC, #35) | ✅ **Applied live 2026-08-13** |
| Migration `0005_delete_own_account.sql` | ✅ **Applied live 2026-08-08** |
| Migration `0004_exercise_metadata.sql` | ✅ Applied — exercises table restructured (muscle arrays + body_region + mechanic + modality; dropped `primary_muscle`/`category`) |

Static checks currently green: `tsc --noEmit` clean; `expo export --platform web` bundles all 15 routes;
`xcodebuild -allowProvisioningUpdates` builds + installs Release to physical hardware.
**Feedback pass (`FEEDBACK-LOG.md`): 22 done** — ✅ #1 #2 #3 #4 #6 #7 #9 #10 #11 #13 #14 #15 #16
#17 #18 #19 #20 #21 #26 #31 #32 (#12 dissolved by #13) · 🟡 #5 (fix applied — keyboard-avoidance;
device-confirm pending) · ⬜ **open: #8 #23 #36 #44 #49** · **#47 #48 #50 DONE (code) 2026-08-14** (parallel batch; tsc-clean, device-verify pending) · **#45 (High) DONE 2026-08-14** (sim-verified) · **#46 DONE 2026-08-14** (modality-aware logging; migration 0010 applied live + sim-verified across all 4 modalities) · **withdrawn (won't do): #24 #25 #27 #29 #30**.
**#33 (active-workout resume bar) + #35 (PR records badge) DONE 2026-08-13** (bar sim+device-verified;
badge sim-verified, RPC 0007 applied). **#22 (Liquid Glass): DONE 2026-08-12** — glass tab pill + FAB, device-verified on the iPhone 15 (iOS
26.5.2); device-QA fixes landed (refraction, consistent FAB, cross-fade). **#36 (backlog):** authentic
native-`UITabBar` drag-lens glass — deferred, keeping the custom pill+FAB.
**#17 light theme: DONE** (full Greige+Moss light mode + System·Light·Dark toggle; device-confirm pending).

## Pending actions (owner: user / next session)

- [x] ~~**Apply the exercise-audit changes to the live DB (#52 / #44)**~~ — **done 2026-08-15**: migration `0011`
      pushed (`supabase db push`, dry-run-confirmed) + `npx tsx scripts/update-exercise-metadata.ts` (150 updated
      in place, 6 inserted, 198 aliases). Verified live: 156 seeded, `weighted_bodyweight`=20, Back Extension
      retagged, and user data intact (3 routines / 26 workouts / 429 sets untouched). **Still owed:** on-device
      cache refresh + a sim walkthrough of a weighted_bodyweight lift (Back Extension: `— × 12`, then `+10 × 12`).
      **Never run the old `seed-exercises.ts` / `npm run seed` on this DB — it wipes routines + workout sets.**
- [x] ~~Apply migration `0010_set_metrics.sql`~~ — **done 2026-08-14** (applied live via `supabase db push`;
      #46 modality logging sim-verified across all four modalities).
- [ ] **Rebuild the dev client for Apple Health** — the `@kingstinct/react-native-healthkit` native module
      was added, so the current on-device build can't run the "Sync from Apple Health" button until a fresh
      `xcodebuild -allowProvisioningUpdates` install (same flow as the last device build). Until then it's
      `tsc`-verified only.
- [ ] **Decide on the Android/web scaffolding** flagged in Open issues (Kratos is iOS-only). Audit done
      2026-08-13; three buckets: **(a) clearly dead → safe to delete** — `app.config.ts` `android:` block +
      3 `assets/images/android-icon-*.png` + `"android"` npm script + the `Platform.OS === 'android'`
      clauses in `lib/haptics.ts:20` & `lib/feedback.ts:38`; **(b) web → dead for shipping, but confirm
      web-export isn't still used as a build check first** — `web:` block, `"web"` script,
      `react-native-web` dep, `!== 'web'` branch in `lib/supabase.ts:29`; **(c) leave** — the `? 'padding' :
      undefined` KeyboardAvoidingView idioms + `Alert.prompt` fallback in `routines.tsx:66` (iOS branch is
      the real path). Recommendation: do (a) now; do (b) only if web-export is retired.
- [x] ~~**Apply migration `0008_clear_own_workouts.sql`**~~ — **applied live 2026-08-13** (`supabase db
      push`; 0001–0008 all on remote). The `clear_own_workouts()` RPC is live, so Settings → DATA → "Clear
      all history" works. Not yet exercised on device.
- [x] ~~Apply migration `0006`~~ — **done live 2026-08-13** (had real dups; migration now dedupes via a
      contiguous `row_number()` renumber, atomic with the constraint).
- [x] ~~Re-seed the exercise library (`npm run seed`)~~ — **done 2026-08-13**; Biceps/Triceps `body_region`
      live. Side effect: the seed wiped `routine_exercises`/`workout_exercises` (test data) — run
      `npm run seed:demo` to repopulate showcase history if wanted.
- [x] ~~**Move `DEVELOPMENT_TEAM` into `app.config.ts`**~~ — **done 2026-08-13**: added
      `ios.appleTeamId: 'TUR974K866'` to `app.config.ts` (the config-schema field; `expo-build-properties`
      has no `developmentTeam`/team option in SDK 57). A prebuild now bakes it into the Xcode project's
      `DEVELOPMENT_TEAM` instead of wiping the hand-edited `project.pbxproj`.
- [x] ~~**Fix #11 (delete-set discoverability)**~~ — **done 2026-08-08 (code)**: long-press a logged
      row → confirm-delete + a prominent DELETE button in the edit sheet. Swipe-to-delete deferred —
      the RNGH/reanimated stack is installed but unwired (no `GestureHandlerRootView`/babel plugin);
      wiring + device-testing it is its own task, not worth it untested in a showcase build.
- [x] ~~**Decide + build #12/#13 together**~~ — **done 2026-08-08 (code)**: #13 fixed rep chips
      (4·6·8·10·12, always visible; ± escape hatch) shipped, which dissolves #12 (weight→reps
      auto-advance no longer needed — the pad serves weight alone).
- [x] ~~Walk the offline logging path on-device~~ — **done 2026-08-06 (simulator, Release build)**:
      Wi‑Fi off → banner shows → logged a set via ✓ (stuck, no rollback) → picker searched the cached
      directory ("Curl" → 18 local matches, custom-create gated) → added Hammer Curl + logged 12×10
      via keypad → **force-quit + relaunched still offline** (all 3 sets intact from cache) →
      Wi‑Fi on → queue flushed: both offline sets + the offline-added exercise landed in Supabase
      (verified by service-role query) → finish → summary correct. Two notes: (1) the OFFLINE banner
      didn't re-show after the *offline relaunch* (cosmetic — NetInfo initial-state timing; queue
      still replayed correctly); (2) a **dev** build can't be tested offline (cutting Wi‑Fi severs
      Metro itself) — use a Release build (`expo run:ios --configuration Release`).
- [x] ~~Verify warm-relaunch hydration on device~~ — **done 2026-08-06** (proven repeatedly by the
      offline QA's kill+relaunch cycles: Home/grid paint instantly from disk, even fully offline).
- [x] ~~Smoke the optimistic flow on device~~ — **done 2026-08-06** (offline QA covered it end-to-end:
      START→grid same-tap, immediate set logs, FINISH→summary, DISCARD→home, kill-after-START commits).
- [x] ~~Walk the manual logging loop on the simulator~~ — **mostly done 2026-08-06** via the QA passes
      (start → picker → ✓ and keypad logs → edit a set → delete a set → finish → summary all exercised
      live). Still unseen: History list → past-workout detail → an exercise's progress chart on-device.
- [ ] **Rebuild the dev client** (`expo run:ios`) to pick up `expo-document-picker` /
      `expo-file-system` / `expo-sharing`, then **run import + export** end-to-end: Settings → DATA →
      Import from Hevy → pick `workout_data.csv` → confirm preview → import; check History / Calendar /
      an exercise's progress light up; then Export workouts → share the `.csv` and confirm it re-imports
      cleanly (idempotent — should report all skipped).
- [ ] **Host `docs/legal/privacy-policy.html` and set `PRIVACY_POLICY_URL`** in `src/app/settings.tsx`
      to the live URL (same URL goes in the App Store Connect privacy field). A 404 = rejection.
      **Policy CONTENT updated 2026-08-15** to disclose audio→OpenAI + both processors + Apple Health
      (it was inaccurate for a shipping-voice app); only hosting remains. See [`app-store/`](./app-store/).
- [ ] **Push the Supabase vars to EAS** (`eas env:create` for `SUPABASE_URL` + `SUPABASE_ANON_KEY` in
      the `development`/`preview`/`production` environments). `.env` is gitignored, so a cloud build
      without these ships credential-less and can't sign in. Service-role / OpenAI keys stay local.
- [ ] **`eas init`**, then paste the printed id into `app.config.ts` as `extra.eas.projectId` — the
      config is a dynamic `.ts` file, so the CLI can't write it for you.
- [x] ~~**Decide what to do about the mic/speech permission strings**~~ — **resolved 2026-08-15: keep
      them.** Voice logging is LIVE and reviewer-reachable (`MOCK_VOICE = false`; Home mic → `record.tsx`
      → `expo-audio` → `transcribe` edge fn → OpenAI), so the mic permission is legitimately used. The
      earlier "unwired" note only covered the unreachable `VoiceMicButton`/`useVoiceSession` path. Do NOT
      drop `expo-speech-recognition` — it would strip the mic string the shipping feature needs. Review
      notes explain the OpenAI audio call. Added `ITSAppUsesNonExemptEncryption: false` to `app.config.ts`.
      Full launch record + user step-by-step in [`docs/app-store/APP-STORE-LAUNCH-LOG.md`](./app-store/APP-STORE-LAUNCH-LOG.md).
- [ ] **See "Delete account" on device** (Settings → ACCOUNT) — the row is static-verified only.
      Don't smoke-test it on the real account; make a throwaway one, or re-run the live-DB check.
- [ ] **Verify the new email + password auth on device** (2026-08-15): sign out → SIGN IN with
      email + password; CREATE ACCOUNT for a fresh email; "Forgot password?" → one-time code → set a
      new password in Settings. **First:** on the existing (code-only) account, use Settings → ACCOUNT
      → **Set password** while still signed in via the persisted session, then confirm password sign-in.
      Recovery still uses the 8-digit email code (`CODE_LEN` in `SignInScreen.tsx`).
- [ ] **Create + save a routine** on device (name, add exercises, targets, save) and confirm
      it appears on Home and starts.
- [ ] Log ~4 real workouts on-device (the real "done" bar for the manual tracker) — this also
      populates the new **Calendar** tab; verify the week card / month grid / 12-week bars read
      right against real workout days.
- [ ] *(Phase 2, when voice resumes)* Apply migration `0003` to the live DB; run `npm run eval`.
- [ ] Replace temporary Gmail SMTP with a dedicated provider before any external-user testing.
- [x] ~~See light mode on device~~ — **done on the iOS simulator 2026-08-08**: walked Home, active
      workout (solid FINISH CTA + filled ✓ chip + completed plain ✓), Calendar (solid "today" cell),
      Settings; toggle flips the whole app live; dark unchanged. **Still to do:** see it on the *physical*
      iPhone — the installed Release build has old JS bundled, so it needs a rebuild+reinstall
      (`xcodebuild -allowProvisioningUpdates`) to show the light theme there.
- [ ] **Remaining feedback items** (`FEEDBACK-LOG.md`): **#8** drag-reorder + the newer backlog
      (**#19 #22 #23 #28**; #24 #25 #27 #30 withdrawn). **#31 warmup-removal done 2026-08-08** (code).
      **#5/#18/#21 fixed 2026-08-08** (code) alongside earlier
      #3/#14/#20 and #11/#13/#26 — **verify on device**: #5 open the picker and scroll with the keyboard
      up (should reach every row now); #18 multi-select add in the routine editor; #21 routine creation
      has no target inputs; plus #13 chip layout, #26 auto-advance feel, #11 long-press delete.
- [x] ~~Wire `useSettings().weeklyGoal` into the Calendar tally~~ — **done**: `calendar.tsx` now reads
      the Settings "Weekly goal" pref (default 5 until the query resolves); every tally, label, and the
      12-week goal line follow it. (If a longer OTP length is ever configured, bump `CODE_LEN` in
      `SignInScreen.tsx`.)

## Open issues / backlog (from the 2026-07-30 QA pass)

**Fixed in `6f96bf3`:** ✅ fonts load · ✅ white headers off dark screens · ✅ 10s undo reachable · ✅ alias-write RLS policy (migration 0003).

**Resolved in session 2 (manual-first):** ✅ two-theme patchwork gone (every screen dark) ·
✅ dev telemetry no longer reachable from the UI (removed from Home settings sheet) ·
✅ manual set-logging UI now exists (was entirely missing) · ✅ **manual writes are now
optimistic** (instant ✓, rollback on error) · ✅ **kg/lb unit toggle** in Settings (Home).

**Still open** (ranked):

| Sev | Issue | Where |
|---|---|---|
| ~~Med~~ | ✅ **Done 2026-08-12** — `sets.set_number` now has `UNIQUE(workout_exercise_id, set_number)` (migration `0006`, **not yet applied**); `insertSet` retries/idempotent on `23505`. | `0006_sets_unique_set_number.sql`, `src/data/sets.ts` |
| ~~Med~~ | ✅ **Done 2026-08-12** — mid-workout **remove exercise** wired into the set grid (REMOVE control + long-press → `useRemoveWorkoutExercise`, destructive confirm). | `src/app/workout/[id].tsx` |
| ~~Med~~ | ✅ **Done 2026-08-13** — repo reads now `.parse()` through the zod schemas (flat rows + the numeric-bearing nested `sets`/`last_session` arrays); partial selects (`listWorkouts` volume, `getExerciseBests`) coerce `weight_kg` via `Number()`. A numeric-as-string can no longer make `weight_kg` a string. `tsc` + `test:offline` 16/16 green. | `src/data/*`, `src/types/db.ts` |
| ~~Low~~ | ✅ **Done 2026-07-31** — body-region **muscle filter** chip row added to the picker *and* the library (`exercises.tsx`); `searchExercises(query, region?)` + `listExercisesByRegion()`. (RECENT tab still deferred.) Also new: per-workout **muscle split** on `history/[id].tsx` (`lib/muscleSplit.ts` + `components/MuscleSplit.tsx`). | `ExercisePickerModal.tsx` |
| Low | Routine editor uses ↑/↓ reorder, not drag (= FEEDBACK **#8**, still open) | `src/app/routine/[id].tsx` |
| New | **iOS-only cleanup (awaiting user decision):** Kratos ships iOS-only, but non-iOS scaffolding remains — `android:` block + 3 `android-icon-*.png` assets + `web:` block in `app.config.ts`; `"android"`/`"web"` npm scripts; `react-native-web` dep; dead `Platform.OS === 'android'` clauses in `lib/haptics.ts` + `lib/feedback.ts` and the `!== 'web'` branch in `lib/supabase.ts`. All harmless but bloat. New iOS-only code (`healthkit.ts`, `healthImport.ts`) already guards correctly. **Do NOT remove without asking** — web-export was historically a `tsc`-adjacent CI check. | `app.config.ts`, `package.json`, `src/lib/*` |
| ~~Low~~ | ✅ **Done 2026-08-12** — `addExerciseToWorkout` now dedupes `(workout_id, exercise_id)` (returns the existing row as a no-op) | `src/data/workouts.ts` |
| — | *(Phase 2 / voice — parked until voice resumes)* model IDs `gpt-5.6-luna/terra` unverified + eval never run; floor-mode auto-exit & PR-celebration wiring; voice dead code (`useVoiceSession.ts`, `useSessionSpeech`, `floorSensor.ts`); telemetry queries never invalidated; duplicated zod enums; `eval/README.md` stale `gpt-4o` refs | Phase 2 files |

---

## Environment & commands

Use Node 22 for anything Expo (the shell may default to Node 23, which is out of RN 0.86's engine range):

```bash
# Dev (JS iteration) — after the native client is installed
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo start --dev-client

# Rebuild native (only after native dep / config-plugin / app.config changes)
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo run:ios --device

# Static checks
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx tsc --noEmit
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npx expo export --platform web

# Data / pipeline tooling
npm run seed        # seed exercise library (idempotent)
npm run test:rls    # two-account RLS isolation test
npm run test:offline # replay an offline-logged session against the live DB + assert the tree
npm run eval        # score the golden set against the real pipeline
```

- Live Supabase project ref: `amonovkkjohvlkjlfsit` (region `ap-southeast-1`).
- Secrets live in `.env` (gitignored): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`. Only URL + anon key reach the client (via `app.config.ts` → `extra`).
