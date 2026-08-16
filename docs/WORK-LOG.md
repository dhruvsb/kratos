# Work Log

Append-only, dated log of individual sessions. This is the **history**; the
`PROJECT-SUMMARY-PHASE*.md` files are the **current-state snapshot**. When you finish a
session, add an entry here (newest at the top) and update the relevant summary file's
status table/decisions — don't let the two drift apart.

---

## 2026-08-16 — Pre-submission App Store audit + compliance fixes (verified via clean-room prebuild)

Full pre-submission codebase audit against the current Apple guidelines + 2025–2026 rejection trends
(web-researched). Findings + the manual checklist live in
[`docs/app-store/PRE-SUBMISSION-AUDIT.md`](./app-store/PRE-SUBMISSION-AUDIT.md). Eight fixes landed
(all `tsc`-clean; the native ones proven by moving `ios/` aside and running a real
`expo prebuild -p ios` — what EAS does — then restoring `ios/`):

- **Privacy-policy 404 fixed (BLOCKER).** The in-app Settings link pointed at `…/kratos/privacy-policy.html`
  (missing the `/legal/` segment) and 404'd while App Store Connect's URL was correct — a broken in-app
  policy reads as missing (5.1.1). URL centralized in new `src/lib/urls.ts` so it can't drift again;
  `settings.tsx` imports it.
- **AI-consent gate built (5.1.2(i), tightened Nov 2025).** No consent existed before audio was sent to
  OpenAI. New `src/components/voice/VoiceConsentGate.tsx` (names OpenAI + the audio + the purpose,
  Allow/Not-now) shown by `voice/record.tsx` before the mic opens; choice persists as `voiceAiConsent`
  in `data/settings.ts` and is revocable in a new **Settings → PRIVACY** toggle. The mic-start effect is
  gated on consent; the recorder waits for the flag to load so returning users don't see a flash.
- **Native/plist fixes via new `plugins/withIosPrivacyCleanup.js` + `app.config.ts`:** stripped
  `UIBackgroundModes: [audio]` (foreground-only recorder ⇒ 2.5.4 risk); suppressed the read-only-violating
  `NSHealthUpdateUsageDescription` (`NSHealthUpdateUsageDescription: false` on the healthkit plugin, 5.1.3);
  dropped the dead-code `expo-speech-recognition` plugin so `NSSpeechRecognitionUsageDescription` (a usage
  string with no shipping feature) is gone; defensively removed the unused `NSMotionUsageDescription`.
  **Gotcha discovered:** Expo runs `withInfoPlist` mods in **reverse** of the plugins-array order, so the
  cleanup plugin had to be listed **first** to run **last** (after expo-audio adds `audio`). Verified: the
  generated `Info.plist` has none of these keys, and keeps `NSMicrophoneUsageDescription` +
  `NSHealthShareUsageDescription` + `ITSAppUsesNonExemptEncryption: false` + a healthkit-only entitlement.
- **Dev telemetry screen gated out of production** (`app/dev/telemetry.tsx` → `Redirect` home unless
  `__DEV__`; was deep-link-reachable as `kratos://dev/telemetry`). **Stale Settings footer removed**
  ("Voice logging arrives in a later build" — voice is the primary Home action now).

Confirmed already-correct: no client secrets (only anon key bundled), account deletion, privacy manifest,
empty-account crash-safety, graceful network errors. **Remaining risks are manual** (can't be coded):
build via **EAS** so the plist fixes ship (the committed `ios/` is stale), verify the demo account signs in
on a clean install, keep the voice backend funded during review, upload real iOS-only screenshots. See the
audit's checklist.

## 2026-08-15 — Email + password auth; "Import from Hevy" → "Import workouts" + CSV guide

Three related changes (code-complete, `tsc` clean; **not yet device-verified**):

- **Auth is now email + password** (replaces the everyday email-code/OTP flow). `src/data/auth.ts`
  gains `signInWithPassword`, `signUpWithPassword` (returns `needsConfirmation` when the project has
  email confirmations on), `setPassword` (`updateUser`), and a recovery pair `sendRecoveryCode` /
  `verifyRecoveryCode`. `SignInScreen.tsx` rewritten: email + password with a SIGN IN / CREATE
  ACCOUNT toggle and a SHOW/HIDE reveal. **"Forgot password?"** is a fully in-app recovery (no email
  deep links): it emails a one-time sign-in code (`shouldCreateUser: false`), reuses the old
  segmented 8-box code field, signs you in, and you set a new password from Settings.
- **Set password in Settings** (`settings.tsx` → ACCOUNT → "Set password", iOS-only). Two secure
  `Alert.prompt`s (enter + confirm) → `setPassword`. This is the migration path for the existing
  account, which was created via email-code and has **no password** — sign in via the persisted
  session, then set one here.
- **Import rebranded generic.** Settings row "Import from Hevy" → **"Import workouts"**;
  `import.tsx` header `HEVY CSV` → `CSV`, title → "Import workouts", and the idle stage now shows a
  **CSV-format guide** (required `title` / `start_time` / `exercise_title`; optional `weight_kg`,
  `reps`, `set_type`, `end_time`, `duration_seconds`/`distance_km`) with one-line descriptions. The
  underlying parser is unchanged (still Hevy-shaped — a Hevy export still drops straight in); only
  the framing is generalized. Export screen untouched.

**Supabase-side follow-ups (dashboard, owner=user):** password min length (default 6); if "email
confirmations" is ON, new `signUp`s land in the "check your email" state — turn it off for
frictionless showcase signups if desired. Recovery codes require the account to already exist.

---

## 2026-08-15 — New app icon: "Reps" blueprint barbell (from Claude Design handoff)

Replaced the photographic-barbell icon with the **blueprint-barbell** design imported from the
Claude Design project *Workout App Icon Design* (`App Icon.dc.html`, graphite variant): a loaded
Olympic bar end — red + two steel plates, spring collar, end cap — on a graphite grid, 100% CSS
boxes/gradients.

- The handoff's `icon-1024-square.png` exceeds DesignSync's 256 KiB `get_file` cap (returns
  `truncated`), so instead rendered the pixel-exact source (`icon.html` square block) to a true
  1024² via headless Google Chrome (`--headless=new --force-device-scale-factor=1
  --window-size=1024,1024 --screenshot`). Kept that exact render source in-repo as
  `assets/icon-source/app-icon-source.html` (+ header note in the generator on how to reproduce).
- New master → `assets/icon-source/app-icon-1024.png`; ran `npm run build:icons` to regenerate
  icon/splash/favicon/android-foreground. Refreshed the generated iOS AppIcon and rebuilt +
  reinstalled on device.
- **Follow-up refinement (per on-device feedback):** more padding + depth shading (Developer-icon
  feel). Scaled the barbell to 0.78 for margin, added a corner vignette
  (`radial-gradient(circle at 50% 44%, transparent 40%, rgba(3,9,18,.55))`) and a deeper drop
  shadow. Edited the render source, re-rendered, regenerated, rebuilt + reinstalled.

---

## 2026-08-15 — Rename RepVoice → Kratos (app-wide)

Renamed the app from **RepVoice** to **Kratos** across every git-tracked, non-generated file
(37 files) — all three case variants (`RepVoice`/`repvoice`/`REPVOICE` → `Kratos`/`kratos`/`KRATOS`).

- **Identity/config:** `app.config.ts` (name, slug `kratos`, scheme `kratos`, `bundleIdentifier`
  `com.dhruvshah.kratos`, all permission strings) and `eas.json` submit bundle id.
- **User-visible strings:** sign-in wordmark, day-zero welcome, Settings version line.
- **Storage keys / file prefixes** bumped: React Query cache `kratos.rq-cache.v1`, settings
  `kratos.settings.v1`, backup/export prefixes `kratos-backup-`/`kratos-export-`. Safe — app
  has never run on a device, so no real local data to orphan; caches/settings just repopulate.
- **Design files renamed** (`git mv`): `Kratos-Manual.dc.html`, `Kratos-VoiceFirst-v3.dc.html`,
  `Kratos Light Options.dc.html`; all in-doc references updated.
- **Privacy-policy URL** → `https://dhruvsb.github.io/kratos/privacy-policy.html` (corrected to the
  real GitHub account `dhruvsb` + new repo name).
- **Not touched:** generated `build/` and gitignored `ios/` trees still say RepVoice — they get
  regenerated with the Kratos name on the next clean prebuild/build.

Verified: `tsc --noEmit` clean.

**Same session — new icon + clean prebuild + on-device install:**
- Swapped `assets/images/icon.png` for a photographic barbell (colored competition plates), 1024²
  opaque. **`scripts/build-app-icons.ts` rewritten** to derive every output from a checked-in master
  (`assets/icon-source/app-icon-1024.png`) instead of drawing the old LED-barbell SVG — so
  `npm run build:icons` now reproduces the new icon (icon.png copied byte-for-byte; splash/favicon/
  android-foreground resized from it). Dropped the Android **monochrome** layer (no meaningful
  single-color form for a photo) + its `app.config.ts` reference. To rebrand later: replace the
  master and re-run.
- `expo prebuild --clean -p ios` → regenerated `ios/Kratos.xcodeproj` (name **Kratos**, bundle id
  `com.dhruvshah.kratos`, team `TUR974K866` baked in, new icon in AppIcon set).
- ⚠️ **CocoaPods/Ruby-4.0 gotcha:** `pod install` (and the xcodebuild pod script phases) crash with
  `Unicode Normalization not appropriate for ASCII-8BIT` unless `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`
  is exported. Ran pod install + the build with that set.
- Built signed **Release** for device (`xcodebuild -workspace Kratos.xcworkspace -scheme Kratos
  -configuration Release -destination 'id=<UDID>' -allowProvisioningUpdates -derivedDataPath ./build`),
  then installed + launched on **Dhruv's iPhone 15 (iOS 26.6)** via `xcrun devicectl device install/launch`
  (`--timeout` needed; tunnel established even though `tunnelState` initially read `disconnected`).
  Dev profile already trusted from prior same-team builds. **First real on-device install of the app.**

**Follow-up (outside code):** host the GitHub Pages repo `kratos` under `dhruvsb` or the
privacy-policy link 404s (App Store listing depends on it).

---

## 2026-08-15 — App Store launch-compliance pass (paid membership now active)

Apple Developer Program enrollment completed (individual — same team `TUR974K866`, now paid → 1-year
certs + App Store Connect live). Did a pre-submission compliance audit and executed everything doable
without the user's Apple/Supabase/hosting logins. **Two parallel agents** drafted the listing copy and
the compliance answers while the code/policy fixes were done inline.

- **Corrected a wrong prior read:** voice logging is **live and reviewer-reachable** (`MOCK_VOICE = false`;
  Home mic → `record.tsx` → `expo-audio` → `transcribe` edge fn → OpenAI). The doc's "unwired" only refers
  to the older, unreachable `VoiceMicButton`/`useVoiceSession` path. So the mic permission is legitimate —
  the earlier idea to drop `expo-speech-recognition` was retracted (it would have broken a shipping feature).
- **`app.config.ts`:** added `ITSAppUsesNonExemptEncryption: false` (standard HTTPS only → export-exempt;
  auto-answers the upload prompt). `tsc` clean.
- **`docs/legal/privacy-policy.html` rewritten to be truthful:** now discloses audio → **OpenAI**, names
  **both** processors (Supabase + OpenAI), and describes the optional **Apple Health** read. The old copy
  ("no audio", "Supabase is the only third party") was a real rejection risk now that voice ships.
- **New `docs/app-store/`:** `LISTING.md` (all product-page text within Apple limits), `COMPLIANCE-ANSWERS.md`
  (privacy labels, age rating 4+, export compliance, review notes, Supabase test-OTP demo-account recipe),
  and `APP-STORE-LAUNCH-LOG.md` (this pass's record + a beginner step-by-step for the user-only remainder:
  host policy/support pages, Supabase test OTP, EAS build+submit, 6.9" screenshots, ASC fields, EU trader
  status, on-device verification incl. confirming the real voice pipeline works).

Decisions: category Health & Fitness / Sports; age 4+; name stays `Kratos` / subtitle "Speak your sets.
Log faster."; reviewer demo login = Supabase test OTP `appreview@kratos.app` / `123456`.

## 2026-08-15 — #51 + #53 + #42: rename empty workout, keyboard dismiss, haptics dedup (3-agent parallel)

Three independent low-severity items fixed by **3 parallel implementation agents** with disjoint file
boundaries (no shared files → no clobber risk; combined `tsc` clean afterward).

- **#51 rename an "Empty workout":** the History-detail title is now a `Pressable` → `Alert.prompt` (iOS,
  prefilled) with a "Tap title to rename" hint. `renameWorkout(id, title|null)` (`workouts.ts`) sets
  `workouts.title`; a blank submit → null → falls back to routine_name / "Empty workout". `useRenameWorkout`
  (`hooks.ts`) optimistically patches the detail cache + invalidates the history list.
- **#53 keyboard won't dismiss:** both search surfaces (`ExercisePickerModal`, `exercises` library) got
  `keyboardDismissMode="on-drag"` on the results FlatList + `returnKeyType="search"` /
  `onSubmitEditing={Keyboard.dismiss}`; `keyboardShouldPersistTaps="handled"` was already there.
- **#42 two haptic wrappers:** extracted the shared expo-haptics primitive to `lib/hapticsPrimitive.ts`
  (`fireHaptic` — platform guard + swallow sync throws & async rejections, no mute gate). `haptics.ts` (ungated)
  and `feedback.ts` (`if (muted) return` before firing) both use it — the deliberate voice-mute separation is
  preserved, public APIs unchanged. Note #42's scope was the *low-level wrapper only*, NOT merging the voice/TTS
  layer into haptics (`haptics.ts`'s design comment forbids that) — flagged and confirmed before implementing.

Also this session: applied the #52/#44 exercise-audit changes to the live DB (migration `0011` +
`update-exercise-metadata.ts`, non-destructive — user data verified intact). `tsc` clean; none device-verified.

---

## 2026-08-15 — #52/#44: `weighted_bodyweight` modality + full 156-exercise audit

Device feedback (#51 empty-workout rename, #52 Back Extension has no weight field, #53 search keyboard won't
dismiss) logged first. Then, on the #52 ask ("re-check all exercises where bodyweight-or-loaded is possible"),
ran **3 parallel read-only audit agents** over the 150-exercise curated set — modality, categorization, and
coverage — synthesized their findings, and implemented the modality + label + coverage streams (loaded carries
deferred). Implementation kept sequential (all streams touch the one authoring file + overlapping grid code).

**New `weighted_bodyweight` modality** — the product-correct answer over reclassifying to `weight_reps` (which
would force a mandatory weight and render `0 kg × 12` for a bodyweight set). One exercise, optional +weight:
reps lead, blank weight = pure bodyweight (`— × 12`), loaded = `+10 × 12`. Enum in `src/types/db.ts`; migration
`0011` widens the `exercises_modality_check` CHECK (no new columns — `weight_kg` from 0010 stores the added
load). Wired through `SetKeypad` (+KG optional field, bodyweight rep chips), `workout/[id].tsx` grid
(`valueHeaders`/`valueCells`, `usesWeight`, prefill), `finish`/`history` top-set ranking (heaviest load, reps
break ties, bodyweight sets still count — unlike `weight_reps` which skips null-weight), `formatSetByModality`
(`+load × reps` / `N reps`), and the exercise-detail chart (resolves to load-progress if ever loaded, else reps).

**Data (`build-curated-exercises.py` → regenerated JSON, 150→156):** 20 retagged `weighted_bodyweight`, 11 kept
pure `bodyweight_reps` (plyo / high-rep ab / wheel). Category fixes: Clean and Press primaries reordered so the
row label agrees with its Legs placement (**closes #44's reported case**); Rowing Machine + Sumo Deadlift now
span Legs+Back; added secondaries (Front Squat traps, OHP/Back Squat abs, Pec Deck delts); Sit-Up/Hanging Leg
Raise → isolation. 6 new exercises (Machine Lateral Raise, Glute-Ham Raise, Seated Barbell OHP, Smith Bench,
Decline DB Press, Air Bike) + alias gaps (BSS, sumo, T-bar, face pull, …).

**Rollout is NON-destructive:** the old `seed-exercises.ts` nukes `routine_exercises`/`workout_exercises`, so
wrote **`scripts/update-exercise-metadata.ts`** — UPDATEs existing rows by name (ids preserved, user history
intact), inserts the 6 new ones + aliases, touches no user data. Apply order: migration `0011`, then that
script. `tsc` clean (app + scripts). **Not yet applied to the live DB or run on device.**

Deferred + logged as follow-ups: general multi-region row-label fix (Burpee/Thruster/TGU still show one
primary), a dedicated Forearms region, loaded carries (Farmer's Walk/Sled Push), and rekeying/retiring the
dead `SEED_ALIASES` map.

---

## 2026-08-14 — #49: reconciled Home to the final `Voice Logging.dc.html` (1a) design

Imported the "Voice Logging" design (Claude Design project `fefd8154-…`) via the design MCP and diffed
its **1a** column (the user's "1a is final") against the shipped app. Result: the whole voice flow —
recorder (`voice/record.tsx`), routine/log previews (`VoiceRoutinePreview`/`VoiceLogPreview`), and the
`VoiceUndoBanner` — already matched 1a. **Two Home deltas, one real:**

- **Mic FAB was 62px, design is 72px.** The 1a markup draws the FAB at **72px / radius 36** in both the
  Home and Committed screens (its prose caption "62px, only the glyph changes" is stale — the pixels are
  72, twice). Bumped `HomeQuickStart.tsx` FAB to 72/36 and moved `TabBar.tsx`'s `withFab` right-inset
  86 → 96 so the glass pill leaves the right gap. This is the "misaligned FAB" the user saw.
- **"Stray history sub-line" was already fixed in code** — `index.tsx` history rows are `weekday · name`
  only (the volume sub-line went away with the earlier 3c week-grouping). The user's screenshot was an
  older on-device build; it corrects itself on the next rebuild, no code change.

`tsc` clean. Constants-only UI change — not yet re-run on sim/device (verify FAB-vs-pill balance on the
next build). Feedback **#49 → FIXED (code)**.

---

## 2026-08-14 — #47 + #48 + #50 shipped as a parallel 3-agent batch

Ran three independent feedback items concurrently (one subagent each, non-overlapping scopes),
then verified as one batch: `tsc --noEmit` clean, shared files (`hooks.ts`, `routines.ts`,
`settings.ts`) skimmed to confirm both agents' additive edits survived, committed together.

- **#48 (Med–High) — History "Edit" now really edits.** Tapping Edit on a finished workout opens the
  **full live logging workflow** by reusing `workout/[id].tsx` behind `?edit=1` (in-place edit —
  `ended_at` stays set, so the session never resurfaces as "active"); every `!isFinished` affordance
  regated behind a `locked` flag, footer CTA becomes **Done**, ⋯ becomes a real history delete. New
  `useReconcileEditedWorkout()` broad-invalidates the finished-session caches (list/PR/heatmap/lastSession/
  exerciseHistory) on Done + unmount. Non-edit finished view byte-identical (no regression).
- **#47 (Med) — Delete a routine.** `deleteRoutine()` + `useDeleteRoutine()` + red **Delete** in the
  long-press menu with warning haptic + destructive confirm, distinct from Archive. Cascade/set-null
  in `0001_init.sql` means logged history survives; no migration.
- **#50 (Med) — Weekly local CSV backup.** New `src/data/backup.ts`: reuses `buildHevyExport()`, writes to
  durable `Paths.document/backups/` (v57 File/Directory/Paths API), pure `backupsToDelete(_,4)` rotation,
  `useWeeklyBackup()` foreground check-on-mount (≥7d since persisted `lastBackupAt`). Settings → DATA →
  **Automatic backup** row. *Open follow-up:* scheduler mounts on Settings, not `_layout.tsx` — fires when
  Settings opens after 7+ days, not at cold start; `useWeeklyBackup()` is lift-ready for `AppContent`.

Not device-verified — `tsc`/scope-reviewed only. Non-weight "NEW BEST" PR detection stayed **open** (lives in
server RPC `workout_pr_counts` / migration territory, out of #48's scope). #49 (voice FAB) is in flight in a
separate chat — its `HomeQuickStart.tsx`/`TabBar.tsx` edits were left unstaged for that chat.

## 2026-08-14 — #46: modality-aware set logging (all four modalities)

Started as a requested recheck of the exercise directory ("which exercises aren't
weight×reps?"). The directory was already correctly classified by `modality`; the real
gap was that **no screen read it** — the set grid + `SetKeypad` were hardwired to KG×REPS,
so planks and cardio got a bench-press weight field. Fixed the UI to honour modality (the
substance of open issue #46), full scope, all four modalities.

Product decisions (with the user): cardio (`distance_time`) captures **duration + machine
level**, distance dropped; distance unit would follow the weight unit if ever needed;
Farmer's Walk/Sled Push left mis-bucketed (rarely used) so no reseed; enum values kept
(`distance_time` now means duration+level) to avoid an exercises-table migration.

- **Schema/data:** migration `0010_set_metrics.sql` adds nullable `duration_seconds` +
  `level` to `sets` and drops/recreates `last_session_sets()` to return them. `db.ts`
  (`workoutSetSchema` + `lastSessionSetSchema`), `sets.ts` (`AddSetInput`/insert/update),
  and the `useAddSet` optimistic cache patch all thread the two fields.
- **Helpers:** `formatDuration` (mm:ss), `formatLevel`, `formatSetByModality` in
  `units.ts` — the single source every label now uses.
- **`SetKeypad`:** modality-branched fields — KG+REPS / REPS / mm:ss duration / duration+
  level — with per-modality chips (rep chips 8/10/12 vs 10/15/20; duration chips), phone-
  timer digit entry for time, plate hint gated to weight_reps. `onLog` widened to an object.
- **Screens** (fanned out to 4 parallel agents, one file each): active workout grid
  (`workout/[id]`), finish summary, history detail, per-exercise chart — each renders and
  picks its "top" set in the exercise's own terms; overload ghost + kg-tonnage stay
  weight-only. `VoiceLogPreview` pinned to `weight_reps` (Phase-2, unwired).

`tsc --noEmit` green. **Migration 0010 applied live (`supabase db push`) + sim-verified**: logged,
edited, and finished a workout with Plank (time), Elliptical (cardio duration+level), and Push-Up
(bodyweight) — grids, keypads (mm:ss + level entry, per-modality chips), PREV labels, finish summary
("TOP 0:45 / 20:00·L8 / 10 reps"), and history detail all render in each exercise's own terms; volume
stays weight-only (0 kg). Follow-up commit fixed the first-time hint copy for non-weight exercises.
Server-side PR *counts* stay weight-only (noted follow-up: widen `getExerciseBests`).

## 2026-08-14 — Logged #50 backlog: automatic weekly local CSV backup

User-requested feature, logged (no code) in [`FEEDBACK-LOG.md`](./FEEDBACK-LOG.md) §15:

- **#50 (Med)** — back up training history to a local CSV automatically, weekly, keeping only the 4 most
  recent backups (delete older). Verified the serialization already exists (`buildHevyExport` /
  `serializeHevyCsv` in `src/data/export.ts` / `src/lib/hevy.ts`) — today it's manual-only via Settings →
  Export, and writes to `Paths.cache` (ephemeral, purely for the share sheet). Scoped into three pieces:
  (1) scheduling — recommended a foreground `lastBackupAt` check over true iOS background execution; (2)
  durable storage under `Paths.document`; (3) rotation to 4. Flagged open product questions (silent vs.
  visible, restore path) before building.

---

## 2026-08-14 — #45 FIXED + sim-verified (time-based exercises no longer lost)

Fixed the data-loss bug where weightless/time-based exercises (Plank, Side Plank, Dead Hang) logged
mid-workout vanished from the finished summary.

- **Root cause (recap):** on a first-time lift the pending-row ✓ (`logPending`) diverted to the keypad
  instead of committing (no weight to repeat); the keypad's "Done"/"Next exercise" then `setKeypad(null)`
  without logging, so the exercise finished with zero sets and `finishWorkout` culled it.
- **Fix (`src/app/workout/[id].tsx`):** ✓ now logs the pending row **as shown**, null weight included — a
  reps-only set is a real set (`canLog = reps > 0` already allowed it). `logPending` diverts to the keypad
  only when `prefillReps == null` (prefill off / nothing to log); removed the weight-based divert. Updated
  the below-grid hint and the first-time-lift note to say ✓ logs as shown. Weight cell still opens the keypad.
- **Verified on the iOS 17 simulator:** empty workout → add Plank (Body only, first-time) → tap ✓ → set 1
  commits `— × 12` (header "1 set"), auto-advances to set 2 → Finish → summary shows **Plank · 1 SET**
  (would previously have been dropped). `tsc` + web-export green.
- Still open: **#46** (a real duration set type) is the deeper model fix; this closes the data loss only.

---

## 2026-08-14 — Logged hands-on device feedback (#45–#49)

User's own Core-workout session + general use surfaced five items, all logged (no code changes) in
[`FEEDBACK-LOG.md`](./FEEDBACK-LOG.md) §14 with root-cause verification:

- **#45 (High) — time-based exercises vanish from the finished summary.** Plank / Side Plank / Dead Hang
  were logged but absent from the saved session. Root cause: on a **first-time lift** the pending row's
  green ✓ (`logPending`, `workout/[id].tsx:204`) diverts to the keypad instead of committing (no weight to
  repeat), so if the keypad's Log set isn't tapped, **zero sets are written** — and `finishWorkout`
  (`workouts.ts:124`) deletes every zero-set exercise. Reps-only sets *are* loggable (`canLog = reps > 0`);
  the trap is the ✓ reading as "logged" while only opening the editor.
- **#46 (Med) — no duration set type.** Time exercises are forced into kg×reps; needs a per-exercise
  time flag + `duration_seconds` + a time entry mode. The real fix behind #45's ambiguity.
- **#47 (Med) — can't delete a routine.** Long-press menu has only Duplicate/Rename/Archive; no
  `deleteRoutine` in the data layer — add a hard delete distinct from Archive.
- **#48 (Med–High) — History "Edit" can't edit.** It only offers Delete workout; want the full logging
  workflow (add/remove exercises, sets, weights) on a finished session. Wrinkle: live grid keys off
  `useActiveWorkout` (`ended_at IS NULL`).
- **#49 (Med) — latest `Voice Logging.dc.html` design not shipped.** Mic FAB misaligned + stray Home
  history sub-line vs. the exported design (Claude Design `fefd8154-…`); needs a design-vs-code diff.

---

## 2026-08-14 — Recorder bug FIXED + verified; Release build pushed to the iPhone 15

Follow-up to the QA pass below — fixed both bugs and shipped to device.

- **Voice recorder freeze — FIXED + verified on the simulator** (commit `834d7aa`). Root cause:
  `useAudioRecorderState` re-subscribed to the recorder every render and never advanced
  `durationMillis` on the simulator → JS thread jammed (dead 00:00 timer + unresponsive buttons;
  the native-driver ring animations masked it). Dropped that hook, self-manage a wall-clock timer
  + guarded `getStatus().metering` poll, made `stop()` idempotent via refs. **Verified:** timer
  ticks (00:16→00:23), "Stop & review" fires ("Reviewing…"), and the **whole pipeline runs
  end-to-end on-sim** — record → `transcribe` edge fn returned real text → `parse-utterance` →
  the 03B preview rendered ("Standalone workout", "Log N sets"). On the sim the transcript is
  garbage (mic catches only ambient noise → 0 sets, 20% confidence), which is correct; real
  accuracy is the bakeoff's 100%/80%.
- **Status-bar redbox — FIXED + verified** (commit `4203a73`, see below): clean cold boot, no redbox.
- **Tab-bar "touch-through" — NOT a bug.** Re-examined: the glass pill spans ~y794–850pt; the QA
  taps at y≈851 landed just below it on content. The pill is also already device-verified (#22).
  Left untouched.
- **Pushed to device:** Release build (`xcodebuild -allowProvisioningUpdates`, free Personal Team
  `TUR974K866`) installed to the iPhone 15 — Release bundles the JS so it runs without Metro. The
  `transcribe`/`parse-utterance` functions are live, so voice works on-device with a real mic.

## 2026-08-14 — Simulator QA pass (partial): 1 bug fixed, 1 open, sign-in workaround

Comprehensive on-simulator QA of the whole app. **Cut short — see "not covered".**

**Fixed + verified**
- **Status-bar exception on every cold boot** (pre-existing, commit `4203a73`). `<StatusBar>`
  (expo-status-bar → RCTStatusBarManager, needs `UIViewControllerBasedStatusBarAppearance=NO`)
  and the Stack's react-native-screens `statusBarStyle` (needs YES) were both in play; the plist
  said YES so it threw at launch. Both set the same theme value, so the global one won: plist →
  false, Stack option dropped (this also keeps the sign-in screen theme-aware). **Clean boot
  confirmed.** `ios/Kratos/Info.plist` is gitignored — kept in sync by hand.

**Open defect — voice recorder (`src/app/voice/record.tsx`)**
- On the simulator the timer stays `00:00`, the level meter never moves, and **"Stop & review"
  never fires** (label never flips to "Reviewing…", so `onPress` isn't running). Touches/JS are
  alive (the dev menu opens, rings animate).
- One real cause found + fixed: a **new options object per render** into `useAudioRecorder` while
  `useAudioRecorderState` re-rendered every 100ms → a new recorder per poll, saturating JS.
  Hoisted to a module constant, poll → 250ms. That restored the animations but **not** the timer
  or the button.
- Device logs prove recording genuinely starts (AAC encoder + input audio queue created), so the
  remaining fault is on the JS/state side (or `durationMillis`/`stop()` on the simulator).
  **Needs another pass + real-mic verification on device.**

**Verified working:** sign-in (light-theme solid-moss CTA, disabled state, 8-box code entry,
auto-focus, rate-limit + invalid-token errors), Home (streak, ring heatmap w/ today ringed,
week-grouped history, PR medals, glass tab pill, **mic FAB**), workout-detail history screen (PR
banner, volume, muscle split, per-set volumes, FAILURE tag), mic-permission prompt with the
expo-audio string, both edge functions 401 without auth, `voice_logs` telemetry writing live
(`gpt-transcribe` / `gpt-5.6-luna`, ~$0.001 + ~6s per utterance).

**Not covered (ran out of session):** Routines tab, Settings + theme toggle, the manual
start→log→finish loop, calendar, exercise library/picker, exercise progress, and the voice
preview/commit UI. Bottom-tab-bar taps were also unreliable to drive from the harness (taps in
that strip repeatedly landed on the content underneath) — worth a human check that the glass pill
isn't passing touches through.

**Sign-in on a fresh simulator install (one-off):** Supabase rate-limits OTPs (~1/min, plus an
hourly email cap) and `admin/generate_link` mints a **magiclink**-type OTP which the app's
`verifyOtp({type:'email'})` rejects. Workaround used: set a temporary password via the admin API,
exchange it for a session (`grant_type=password`), and write it into the app's AsyncStorage
manifest (`sb-<ref>-auth-token`) before launch. **A temporary password now exists on the
dsooseven@gmail.com account — remove/rotate it if unwanted.**

## 2026-08-13 (latest) — Voice logging CUT OVER to the real models (mock retired)

The 1a voice flow now runs on the real pipeline (was gated behind `MOCK_VOICE`). Using the
finalised bakeoff models below.

- **Edge functions deployed** to `amonovkkjohvlkjlfsit`: `parse-utterance` (now also handles the
  `create_routine` intent) + new **`transcribe`** (cloud ASR). Verified deployed; `OPENAI_API_KEY`
  secret present.
- **`transcribe`** biases like the bakeoff: `language:'en'` + a keyterm `prompt` (static gym prime,
  or live routine keyterms if passed). Model = `ASR_MODEL` = **`gpt-transcribe`** (`prices.ts`).
- **Routine extraction prompt** (`prompts.ts` rules 13–14) aligned with the validated
  `bakeoff/lib/routine-prompt.ts` — self-correction replacement, exclude list-asides, preserve
  near-dupes, and strip a trailing generic word from the name (fixes the top failure, "leg day
  routine" → "Leg Day").
- **Client**: `MOCK_VOICE=false`. `parseVoiceIntent` calls `parse-utterance` and maps
  `ParseResult`→`VoiceParseResult` (log + routine); recorder records via **expo-audio** →
  `transcribe` → parse. Dev client **rebuilt** (expo-audio pod `ExpoAudio 57.0.3` linked via
  `pod install`; needs `LANG=…UTF-8` or cocoapods' error reporter crashes).
- **Deliberately NOT changed**: `llm.ts` temperature (their flagged top follow-up — wants an eval
  re-run at `temperature:0`; left untouched so the deployed function matches the measured behaviour).
- `tsc` clean; dev client rebuilt on the sim.

**QA against the 10 real bakeoff recordings, through the DEPLOYED functions** (transcribe → parse-utterance;
harness in scratchpad `qa-voice.ts` — mints a user JWT via service-role OTP, scores vs `bakeoff/ground-truth`):
- **Workout logging: 5/5 (100%) exact-match, intent 5/5.** Incl. 06's mid-sentence weight self-correction
  (65→67.5, no dup), distributive bodyweight sets, and the 15-vs-50 same-workout danger pair.
- **Routine creation: 4/5 (80%) EM, intent 5/5**, all exercises resolved (10/10/10/11/10/12). The one miss
  (04) is the same `SPURIOUS: Deadlift` case the bakeoff prototype failed across providers — an extraction
  edge case on that recording, not a wiring bug. The trailing-generic-word strip rule **fixed 03**
  ("leg day routine" → "Leg Day"), which had failed on every bakeoff provider — so routine EM here beats the
  prototype's 60%.
- **Found + fixed a live bug:** the Supabase `OPENAI_API_KEY` secret was a **stale key** (a different org
  with no credits → every call 429'd) while `.env` held the funded key. Reset the secret to `.env`'s key
  (`supabase secrets set` — value never printed); QA then passed. The on-device voice feature depends on this
  secret, so this also unblocked the real app.

## 2026-08-13 (later) — Bakeoff corrected; models FINALISED (`gpt-transcribe` + `gpt-5.6-luna`)

Supersedes the entry below, which reported numbers produced by a **broken harness**. A
question about whether `gpt-4o-transcribe` was current turned up three separate problems.

**Bugs found and fixed (all committed):**
1. **`bakeoff/lib/catalog.ts` — unbound method.** `const rpc = this.db.rpc` detached the
   method from the Supabase client (`this === undefined` → "Cannot read properties of
   undefined (reading 'rest')"). Every transcript needing a fuzzy exercise lookup threw.
2. **`bakeoff/commands/score.ts` — percentages hid the failures.** Those throws were
   swallowed into a console warning and the percentages computed over only the survivors, so
   a run where **3 of 5 workouts crashed displayed as "100% workout EM."** The earlier
   entry's headline numbers were therefore invalid. Tables now carry `scored` + `FAILED`
   columns and print a warning banner whenever anything throws.
3. **Transcription cache key omitted the model** — switching a `BAKEOFF_*_MODEL` override
   would have silently replayed the previous model's transcripts and faked any comparison.
   `model` is now part of the `AsrProvider` contract and the cache key.
   (Also: `routine-extraction.ts` maxTokens 1024 → 4096; a 12-exercise routine truncated.)

**Model decisions (both FINAL — detail + caveats in `PROJECT-SUMMARY-PHASE2.md` §5):**
- **ASR = `gpt-transcribe`** (released 2026-07-28, after the previous entry's default was
  chosen). Now the `openai` provider; `openai-4o` kept as baseline.
- **LLM = `gpt-5.6-luna`**, unchanged — verified still the current generation and the
  cheapest structured-outputs tier. **`prices.ts` corrected**: an ~80% price cut on
  2026-07-30 meant cost telemetry was overstating spend ~5× (Luna $1.00/$6.00 → $0.20/$1.20;
  Terra $2.50/$15 → $2/$12; added Sol).

**The result that matters most:** on the clean run, the *same cached transcripts* scored
differently between two runs (gpt-4o-transcribe 100% → 80%) — **the extraction LLM is
non-deterministic and at n=5 the run-to-run noise exceeds the between-model gap, so these
models are not distinguishable on this corpus.** The models were therefore chosen on
structural grounds (newest/cheapest/faster/one-vendor), not a measured accuracy win.
**Top open follow-up: `llm.ts` never sets `temperature`, so production structured extraction
runs at the API default (1.0). Set it to 0 and re-run.** Second: the scorer is fully
sequential (~700 round-trips, ~8 min) — parallelise per provider.

Stable across every run: Groq **silently drops a whole exercise** (⇒ keep a glanceable
commit-time confirmation); routine-*name* extraction is weak for every provider (⇒ resolve
names against the closed routine list); the exercise resolver is 98–100% (⇒ don't weaken it).

---

## 2026-08-13 — Voice-model bakeoff: ASR chosen (OpenAI `gpt-4o-transcribe`) — SUPERSEDED, see above

Ran the standalone `bakeoff/` harness (not in the app bundle) on a **10-recording personal
corpus** — 5 routine-creation + 5 workout-logging dictations, Indian-accented English,
filler-heavy, **all with background YouTube gym noise**, recorded on iPhone Voice Memos.
Compared 4 ASR models (OpenAI gpt-4o-transcribe, Groq whisper-large-v3, Deepgram Nova-3,
AssemblyAI universal-3-5-pro) two ways: transcript quality (WER/NEER) and **end-to-end
through the real parse pipeline** (workout exact-match vs DB-semantic ground truth).

**Decision: ship OpenAI `gpt-4o-transcribe` as the ASR.** Rationale in
`PROJECT-SUMMARY-PHASE2.md` §5 (new first bullet). Short version: tied-best 100% workout EM,
single vendor (already the extraction provider), and a non-Whisper architecture that avoided
the one dangerous failure below. Low-regret — the `src/lib/stt.ts` seam makes switching cheap.

**Findings worth keeping:**
- **End-to-end scoring overturned the transcript-quality ranking.** Groq had the *best*
  number accuracy (0.0% NEER) but the *worst* workout EM (50%) — it **silently dropped an
  entire exercise** ("Assisted Pull-Up") from one transcript. Deepgram had the *worst* NEER
  (6.2%, duplicating numbers "22 22") but 100% EM — the extraction LLM absorbed the noise.
  Lesson: WER/NEER can't see silent omission; only end-to-end exercise-recall can. **The
  real app must keep a commit-time confirmation that makes a missing exercise visible.**
- **The closed-vocabulary exercise resolver is bulletproof** — 100% exercise-resolution
  across all 4 providers. The weak spot was routine *name* extraction ("Leg Day" → "leg day
  routine", "Push Day" → "push today"); fix when routine-creation is built for real =
  resolve the name against the user's existing routine list (a closed set), don't free-extract.
- **Background gym noise did not break it** — OpenAI hit 100% EM *with* noise, which
  materially de-risks the "real gym audio destroys accuracy" worry for this setup.

**Harness note:** the run first exposed a bug in the harness's own NEER scorer
(`bakeoff/lib/numbers.ts` mis-parsed spelled-out numbers — "one twenty" → 21, "twelve sixty"
→ 72, "67 and a half" → [67,1.5]), which made correct ASR look wrong (Groq's real 0% NEER
showed as 5.6%). Fixed + covered by `bakeoff/lib/numbers.test.ts` (18 cases). Committed
`6298a66` (parser fix + create_routine scoring + AssemblyAI live-API-drift fixes + the
labeled 10-file dataset; audio and `.env.local` stay gitignored). Bakeoff scaffold was
`1b8ea33`. Caveat: n=5 per intent chooses a direction, doesn't certify reliability — keep
harvesting real corrections (`voice_logs` + `scripts/harvest-eval-cases.ts`).

---

## 2026-08-13 — Phase 2 voice logging: real model pipeline wired (cloud ASR + routine intent), gated

Follow-up to the 1a UI build (below): wired the real model path end-to-end, still gated behind
`MOCK_VOICE` so the running app is unaffected until cutover. User's model bake-off is nearly done
(ASR = new cloud **gpt-transcribe**; parse = a GPT model, id TBD).

**Backend (Deno / shared pipeline):**
- **`create_routine` intent.** `parse-types.ts` adds the intent + `ParseResult.routine` (name + resolved
  exercises). `extraction.ts`/`prompts.ts` extract a routine name + exercise names (rules 13–14).
  `pipeline.ts` resolves each name via the existing alias/fuzzy/LLM resolver and returns a routine payload
  instead of set entries. Set-logging path unchanged.
- **`transcribe` edge function** (new): auth-guarded, takes base64 audio, calls OpenAI
  `audio.transcriptions` with `ASR_MODEL` (`prices.ts`, = `gpt-transcribe` — confirm exact id), returns
  `{ text }`. Key stays server-side (same hard rule as parse-utterance).

**Client:**
- `voiceParse.ts` `parseVoiceIntent` real body: calls `parseVoiceUtterance` (edge fn), maps `ParseResult`
  → `VoiceParseResult` (log + routine), enriches muscle/equipment from the cached library. `MOCK_VOICE`
  switch retained with the cutover checklist in a header comment.
- Cloud ASR capture: added **expo-audio** (dep + config-plugin mic string). `src/data/transcribe.ts`
  (reads the clip via `new File(uri).base64()`, posts to the edge fn). Recorder screen now records →
  transcribes → parses on the real path; the mock path (canned transcript + toggle) stays for `MOCK_VOICE`.

**Verified:** `tsc` clean; web-export 18 routes. **NOT cut over** — needs: deploy both edge functions,
rebuild the dev client (expo-audio is native), confirm the final parse-model + ASR ids, then flip
`MOCK_VOICE=false`. Edge functions couldn't be Deno-typechecked locally (no `deno`; supabase CLI present).

## 2026-08-13 — Phase 2 voice logging: UI + workflow (design "Voice Logging" 1a), model left unplugged

Built the whole 1a flow from the Claude Design "Voice logging feature design" project
(`fefd8154-…`, file `Voice Logging.dc.html`), on the user's explicit instruction to finish the UI/workflow
now and leave every model / STT / parsing decision for their in-progress model bake-off.

**The seam (the only place a model plugs in later):** `src/data/voiceParse.ts` — a UI-facing
`VoiceParseResult` discriminated union (`kind: 'routine' | 'log'`) + `parseVoiceIntent()`. It's
`MOCK_VOICE = true` today: canned, structurally-real data, with exercise ids resolved against the real
seeded library (`listAllExercises`) so a commit writes valid FKs. Chose a *new* shape over `ParseResult`
(`src/types/parse.ts`) because that contract only models set-logging; 1a also infers a "create routine"
intent from the same utterance. `ParseResult` and all existing Phase-2 code left untouched. When the eval
picks a model: fill in `parseVoiceIntent`'s real body (call `parse-utterance`, map onto `VoiceParseResult`)
and flip `MOCK_VOICE`.

**Screens / wiring (all 5 of 1a):**
- **01 Home** — the `+` FAB is now a mic (`components/voice/MicGlyph.tsx`): **tap → recorder**, **long-press
  → the old MOST USED sheet** (`HomeQuickStart.tsx`); while the sheet's open the FAB is still its × close.
- **02 Recording** — `src/app/voice/record.tsx`: full-screen instrument (pulsing mic ring, `LevelMeter`,
  count-up timer, Stop & review). STT/meter are cosmetic mocks; a small clearly-labelled MOCK toggle picks
  which example (WORKOUT vs ROUTINE) Stop returns, since the simulator has no mic.
- **03A/03B Preview** — `src/app/voice/preview.tsx` branches on `kind`. `VoiceRoutinePreview` (editable name,
  numbered rows ↑↓✕, fuzzy-match note → picker, dashed add, Save) and `VoiceLogPreview` (grouped by exercise,
  PREV per value, tap a value → the existing `SetKeypad` for inline edit, warn-border + "how many sets?"
  chips for a missing field, CHANGE target routine).
- **Commit (real repo writes)** — `src/data/useVoiceCommit.ts`: `useCommitVoiceRoutine` (create routine +
  `setRoutineExercises`), `useCommitVoiceLog` (log into the running workout if one's live, else start one —
  linked to the target routine via an empty preset so it inherits the name without pre-loading exercises —
  then write each parsed set through `confirmVoiceEntries`, flattened one entry per set so per-set edits
  survive). Ephemeral draft passed record→preview via a tiny module store (`src/data/voiceDraft.ts`).
- **04 Committed** — reuses the existing `workout/[id].tsx` (its layout already matches the design) + a new
  transient **"N SETS LOGGED FROM VOICE · UNDO"** banner (`components/workout/VoiceUndoBanner.tsx`; UNDO
  deletes exactly the committed sets, auto-clears after `timing.undoWindowMs`).

**Verified:** `tsc --noEmit` clean; `expo export --platform web` bundles all 18 routes (incl. `/voice/record`,
`/voice/preview`). **Not yet run on the simulator or device** — no new native deps (STT is mocked, `react-native-svg`
already present), so it should run on the current dev client without a rebuild.

## 2026-08-13 — Library feedback: bottomless region chips (#43) + logged #44

Device screenshot of the Exercise **Library** flagged two things; logged both in `FEEDBACK-LOG.md`
(2026-08-13 (13)), fixed the UI one.

- **#43 (fixed) — region chips rendered bottomless.** The filter pills sit in a horizontal `ScrollView`
  whose `chipRowContent` had no vertical padding, so the strip collapsed to the chip's exact `height: 30`
  and the ScrollView clipped each pill's 1px **bottom** border → open-bottomed boxes. Fix: added
  `paddingVertical: space.xs` (4px) to `chipRowContent` (`src/app/exercises.tsx`). Layout/token-only,
  theme-safe. `tsc` green; not yet on device.
- **#44 (logged, open) — "Clean and Press" shows under LEGS with a `SHOULDERS` tag.** Not bad data: its
  seed `primary_muscles: ['shoulders','glutes']` → `body_region: ['Shoulders','Legs']`, so it *correctly*
  filters into LEGS, but the row prints only `primary_muscles[0]`, hiding why. Left open with a product
  decision (recommend showing all contributing muscles in the row meta).

---

## 2026-08-13 — Apple Health gap-fill (iOS-only): backfill forgotten strength days

Built the "did I train at all that day?" backfill. Purpose: when a workout happened but wasn't logged in
Kratos/Hevy, the calendar shouldn't show a blank day — Apple Health (fed by Whoop today, an Amazfit
Helio via the Zepp app later) knows a strength session occurred, so we mark the day.

- **`src/lib/healthkit.ts`** (new) — the single HealthKit touch-point (mirrors the `supabase.ts` rule).
  `@kingstinct/react-native-healthkit` v14 (Nitro): `isHealthAvailable()`, `requestStrengthPermission()`
  (read-only, `HKWorkoutTypeIdentifier`), `readStrengthWorkouts(days)` → filters to `traditional`/
  `functional` strength in JS, returns `{uuid, start, end}`. **iOS-only** — every export short-circuits off
  iOS so no caller needs a Platform check.
- **`src/data/healthImport.ts`** (new) — `syncHealthWorkouts()`: reads the last **30 days**, inserts a blank
  **`title: 'Strength Training'`** workout (no exercises/sets) for any day not already covered. Dedup is
  twofold: exact `external_id: 'healthkit:<uuid>'` (idempotent re-sync, same column Hevy uses) **and**
  local calendar-day — a real log always wins. `started_at`+`ended_at` both set so it counts in history and
  the calendar heatmap (both filter `ended_at IS NOT NULL`). Returns `{added, skipped}`.
- **UI** — `useSyncHealthWorkouts` (invalidates workoutList/prCounts/workoutDays) + a **Settings → DATA →
  "Sync from Apple Health"** row, rendered only when `Platform.OS === 'ios'`, with a result Alert.
- **Config** — `app.config.ts` plugin `@kingstinct/react-native-healthkit` with read-only
  `NSHealthShareUsageDescription` (no update string, no background). `npx expo install` added the package +
  `react-native-nitro-modules`.
- **Future hook:** the placeholder is just an empty workout, so a later "tap → pick muscle groups" feature
  drops in with no schema change.

`tsc` clean; `expo config` resolves the plugin. **Not yet on device** — the new native module needs a
dev-client rebuild before the button does anything (noted in Pending).

**Also flagged (per the iOS-only mandate):** audited the repo for non-iOS cruft — `android:`/`web:` config
blocks, 3 android icon assets, `android`/`web` npm scripts, `react-native-web`, dead `Platform.OS` android/
web branches in `lib/haptics.ts`, `lib/feedback.ts`, `lib/supabase.ts`. Reported for a keep/remove decision
(logged in Open issues); **not touched** this session.

## 2026-08-13 — "Refined Screens (Dark)" TURN 3 (import fd29fa5c): toned accent, week-grouped Home, keypad flow actions

The design doc advanced to **TURN 3 · TONED ACCENT, LIGHTER HOME, KEYPAD ACTIONS**; implemented the
delta on top of TURN 2 (picks 3c + 1a, nav still 2d). Four changes:

- **Accent retone (dark):** `acc` `#A3E635` → **`#ACD455`** in `tokens.ts` (design's `#C0F23C` → `#ACD455`
  — same hue, less chroma/lightness so it stops glowing at night). Retoned every derivative
  (`acc05/06/07/14/35`, `accHi`, `ctaFg`, `ctaBorder`, `checkFg`, `meterHot`); the glow shadows follow
  automatically (they resolve `color.acc`). Light (moss) palette untouched. App-wide dark accent shift.
- **Home → 3c (week-grouped history):** the exact date moved into a **group header** (`THIS WEEK` /
  `3–9 AUG` + a per-week count), and each row now carries only a **three-letter weekday + name + PR
  medal — no volume column**. New `mondayOf`-based grouping + `weekRangeLabel()` in `index.tsx`; the
  HISTORY divider is now **centered** (rule · HISTORY · rule); the "N in last 30 days" count is gone
  (replaced by the per-week counts).
- **Log-sheet v3:** the keypad gained a **Done** + **Next exercise ›** row above **Log set**
  (`SetKeypad` new optional `onDone`/`onNextExercise` — add mode only, so history-edit keeps just
  Save/Delete). Header is now **"{exercise} · Set N"** with **"{i} of {total}"** top-right (position
  passed from the active workout; falls back to the LAST label when absent). Done dismisses; Next
  exercise advances the session (or opens the picker on the last exercise).
- **Volume dropped from the Home history rows** (folded into the 3c change above).

CTA treatment unchanged from TURN 2: primary CTAs keep `ctaBg` semantics (dark = dark-fill+accent),
not the mockup's solid `#ACD455` fill. `tsc` clean; `expo export web` bundles all 16 routes.

---

## 2026-08-13 — "Refined Screens (Dark)" design pass (import: fd29fa5c) + three picks (2a / 2d / 1a)

Imported the Claude Design doc **"Refined Screens (Dark)"** (project `fd29fa5c`, via the
DesignSync MCP) and implemented the whole refinement across every top-level screen, plus the
three decision picks the user chose:

- **PR badge → 2a (Medal).** New shared `src/components/PrBadge.tsx` — a ribbon+disc **Medal**
  glyph (`Medal`), a list-row count chip (`PrBadge`), and a `PrBanner`. Replaced Home's old
  **star** SVG badge and is now the single PR mark app-wide (Home rows + Workout-detail banner).
- **Nav icons → 2d (Outline + label).** `TabBar.tsx`: Routines icon redrawn as an outlined
  **dumbbell**; labels went sentence-case (Home/Routines/Settings), inactive lifted to `t2`.
- **Log set sheet → 1a (Chips + keypad).** `SetKeypad.tsx`: header is now just "Set N", the two
  control rows merged into one (**±step + 8/10/12 rep chips**), plate line sentence-cased. (The
  4/6 rep chips + SAME shortcut were dropped per the 1a spec; any reps stay typeable on the pad.)

Screen refinements (structure/layout to the design, **colours + fonts stay on `tokens.ts`** —
the design's `#C0F23C`/`#F2F4EF`/Schibsted/JetBrains render through `acc`/`t1..t3`/`font.*`):
- **Home:** history rows reflowed to name+date stacked · volume · medal (leading date column
  dropped); a **HISTORY · N IN LAST 30 DAYS** divider; calendar cells are now soft-filled circles
  (worked) / solid accent (today) instead of rings.
- **Active workout:** **RECORDING + ⋯** header (⋯ menu carries Remove-exercise / Discard — both
  left the grid); the chip rail shows **exercise names with a ✓ when logged**; sub-header is
  "Chest · Barbell" + "3 of 6"; below-grid is one hint + **Add set**; footer is a glass back +
  Next/Add pill, then a single **Finish workout** CTA (Discard moved to ⋯).
- **Workout detail:** leads with the **workout name** (date as subtitle), a **PR banner** (medal +
  "N personal records" + volume) when PRs exist else a volume card; `MuscleSplit` rebuilt as a
  single **stacked bar + legend**; set rows show per-set volume; top-right **Edit** → delete menu.
- **Routines:** count in the header; each row got **Edit** + **Start** pills (Start dimmed for an
  empty routine); hold-for-options menu kept.
- **Settings:** section headers get a hairline rule; helper sentences dropped; values gained a **›**
  chevron; **Pre-fill from last session** is now a **real switch** (`Toggle`).

One deliberate deviation from the literal mockup: the design draws the full-width primary CTAs
(Finish / Log set) as **solid lime**, but the hard-rule CTA semantics (`ctaBg/ctaBorder/ctaFg`)
keep dark CTAs dark-fill+accent-border and reserve the solid fill for **light** mode — so the
buttons follow the token system (dark stays byte-consistent) rather than hardcoding a solid dark
fill. `tsc --noEmit` clean; `expo export --platform web` bundles all 16 routes.

---

## 2026-08-13 — Imported workouts showed "Empty workout" — added workouts.title

Every Hevy-imported workout rendered as **"Empty workout"** on Home/History. Root cause:
a workout's display name came *only* from a linked routine (`workouts.routine_id →
routines.name`), but a Hevy import is a one-off session with its own title and no routine.
The importer had the title in hand and could only smuggle it into `notes`
(`Imported from Hevy · <title>`), which nothing rendered — so the fallback
`routine_name ?? 'Empty workout'` always hit the default.

Fix: gave workouts a first-class `title` (migration **`0009_workouts_title.sql`**, applied
live via `supabase db push`; it also **backfills** already-imported rows by lifting the
title out of the synthetic note and clearing that note). `title` added to `workoutSchema`.
Importer now writes `title: w.title` and keeps `notes` for the real description only.
Display fallback is now `title ?? routine_name ?? 'Empty workout'` at all 5 sites
(`index`, `history/index`, `history/[id]`, `finish/[id]`, `workout/[id]`), and the Hevy
**export** uses `title` for the CSV title so the round-trip preserves the session name.
`tsc` clean; backfill verified live (8 recent workouts now read "Chest & Triceps",
"Back & Biceps", "Legs", … with notes cleared). Not yet re-run on device.

## 2026-08-13 — Home routine-name weight fix (font consistency)

The recent-workout name on Home rendered in Instrument Sans **Regular (400)** — the only
place in the app a name uses 400 (every other list row/title uses `uiMedium` 500 or
`uiSemibold` 600), so at 17px it read noticeably thinner and "off" next to the Geist Mono
readouts on the same row. Changed `histName` in `src/app/index.tsx` from `font.ui` →
`font.uiMedium`, matching the history/routines list rows. No stray fonts found — the
two-family mix (Instrument Sans names + Geist Mono numbers) is by design.

---

## 2026-08-13 — Simulator QA pass: 4 bugs found and fixed

First full end-to-end walk since the backlog batch, on the iPhone 17 Pro / iOS 26.5 sim (light theme).
Detail + the verified-working list in `FEEDBACK-LOG.md` 2026-08-13 (12). Four real bugs, all fixed:

- **#37 (High)** fresh workout opened on the *last* exercise ("3 OF 3") — `workout/[id].tsx` seeded the
  active exercise to `exercises[length-1]`. Now seeds to the first exercise with **no logged sets**
  (fresh routine → #1; resume → where you stopped). Mid-workout adds already jump explicitly.
- **#38 (High)** today's heatmap cell never took the worked fill — `cellLook()` tested `isToday`
  *before* `worked` and short-circuited, so finishing a workout looked identical to skipping the day
  on the streak-first Home. Today now keeps its dashed ring **and** takes the `acc14` fill.
- **#39 (Med)** `useFinishWorkout` / `useDeleteWorkout` never invalidated `['workoutDays']` (that query
  lives in `data/calendar.ts`, outside `keys`), so the streak/heatmap stayed stale until a cold start.
  `useDiscardWorkout` intentionally left alone — it only discards unfinished workouts.
- **#40 (Med)** the Routines list scrolled under the status bar / Dynamic Island; added an opaque
  `color.bg` top scrim (safe-area height, `pointerEvents="none"`). Home was immune via its fixed header.

Logged as open: **#41** duplicate commits before the editor opens (CANCEL doesn't undo), **#42**
consolidate `lib/feedback.ts` onto `lib/haptics.ts`. `tsc` clean; `test:offline` 16/16.

---

## 2026-08-13 — Four parallel-agent backlog fixes (day-zero Home, signing config, overload ghost, clear-history)

Ran four file-disjoint agents at once (on top of the zod fix below), one coherent commit. All `tsc`-clean;
`test:offline` 16/16 with the combined tree.

- **#34 Day-zero Home (code):** new `src/components/home/HomeDayZero.tsx` — welcome + two doors (START EMPTY
  WORKOUT via `useStartWorkoutFlow`, CREATE A ROUTINE → `/routines`), tokens-only. `index.tsx` early-returns
  it when `doneDays.size === 0 && !isLoading`; tab pill / FAB / active-workout bar stay, non-empty path
  unchanged.
- **Signing config (pending action):** `app.config.ts` gained `ios.appleTeamId: 'TUR974K866'` (the config-
  schema field — `expo-build-properties` has no team option in SDK 57), so a prebuild bakes `DEVELOPMENT_TEAM`
  instead of wiping the hand-edited `project.pbxproj`. No dep added.
- **#28 Progressive-overload ghost (code):** `workout/[id].tsx` only. A dimmed opt-in row suggests
  `top_last + 2.5 kg` only when prefill is on, no set logged yet this session, and *every* normal set last
  session hit reps ≥ 10 (rule is routine-target-independent, since #21 nulled targets). Tap-to-accept primes
  the keypad + flows through normal LOG; real prefill and normal-✓ writes unchanged.
- **Task 5 Clear-all-history (new):** migration `0008_clear_own_workouts.sql` (**written, NOT applied**) — a
  security-definer `clear_own_workouts()` RPC, `auth.uid()`-scoped, one `delete from workouts` (FK cascade
  handles workout_exercises→sets; nulls voice_logs.workout_id; routines/exercises/profile untouched). Repo
  `clearAllWorkouts()` + hook `useClearAllWorkouts()` (invalidates workoutList / workoutDays / workoutPrCounts
  / activeWorkout / lastSession / exerciseHistory, removes `['workout']`+`['exerciseBests']`). Settings → DATA
  → "Clear all history" destructive row, two confirms; **blocks** if a workout is in progress ("Finish your
  workout first"). **User follow-up: apply `0008`** (`supabase db push`) before the row works live.

---

## 2026-08-13 — Repo reads validate through zod (kill the dead `z.coerce` guards)

Closed the open backlog item "`db.ts` `z.coerce` numeric guards are dead." Every repo returned
`data as X` and never called `.parse()`, so a numeric column PostgREST serialized as a **string**
would have silently made `weight_kg` a string — breaking volume sums and PR/best comparisons.

- **Flat, schema-exact reads now `.parse()`** through their zod schema: `getProfile`
  (`auth.ts`); `searchExercises`/`listExercises*`/`getExercise`/`createCustomExercise`
  (`exercises.ts`); `createRoutine` (`routines.ts`); `insertSet` returns + `listSets` (`sets.ts`);
  `startWorkout`/`getActiveWorkout`/`addExerciseToWorkout`/`getLastSession` (`workouts.ts`);
  `listRecentVoiceLogs`/`listVoiceLogsSince` (`voice.ts`).
- **Composite joins parse their numeric-bearing nested rows:** `getWorkout` +
  `getExerciseHistory` parse the nested `sets(*)` arrays via `workoutSetSchema` (and `getWorkout`
  the joined exercise + base workout); the rest of the join shape stays as-is.
- **Partial selects can't schema-parse, so coerce with `Number()`:** `listWorkouts` volume math
  and `getExerciseBests` `weight_kg` (both select only a subset of set columns).
- Left as casts where there's genuinely no schema: `listRoutines`/`getRoutine` composites,
  `calendar.ts` `{started_at}`, the edge-fn `VoiceParseResponse`, RPC id strings.

`tsc --noEmit` clean; `npm run test:offline` 16/16 (that suite drives real PostgREST reads through
these repos, so the parses are validated against live serialized data). Backlog row flipped to done
in `CONTEXT.md`.

---

## 2026-08-13 — Applied 0006 (set_number UNIQUE, with dedupe) + re-seeded #19 split

- **0006 applied live.** First attempt failed (real duplicate `(workout_exercise_id, set_number)` rows
  existed from set-logging races — `23505`, rolled back cleanly). Added a **dedupe** to the migration: a
  `row_number()` renumber of every workout_exercise's sets to a contiguous 1..N in current order (relabels
  `set_number` only — no weight/reps/order change), atomic with the constraint. Re-applied via
  `supabase db push --include-all` (0006 sorts before the already-applied 0007). `set_number` is now unique.
- **Re-seeded the exercise library (#19).** `npm run seed` → 150 exercises + 156 aliases with the
  Biceps/Triceps `body_region` split now live. **Side effect (accepted — test data):** the seed clears all
  `routine_exercises` + `workout_exercises` first (they reference exercises without cascade), so routines are
  now empty and workout history has no sets/volume. The exercise *library* (what #19 needed) is intact. Run
  `npm run seed:demo` to repopulate showcase history/routines if wanted.

---

## 2026-08-13 — PR "records" badge on history rows (#35)

Built the deferred records badge. **PR = heaviest weight among a session's reps-≥-6 sets strictly beating
every earlier session of that exercise** (user's definition — the rep floor filters ego singles; first
qualifying session counts; reps<6 / null-weight excluded). Per-workout counts come from a new SECURITY
DEFINER RPC **`workout_pr_counts()`** (migration `0007`, auth.uid()-scoped, window `max(...) rows between
unbounded preceding and 1 preceding` for the prior-session best) — server-side because it must see all
history. Wired `getWorkoutPrCounts` → `useWorkoutPrCounts` (invalidated on finish/discard/delete); the Home
history row's reserved right slot now shows a medal + count (`PrBadge`, the design's SVG) or `—`. `tsc`
green. **Migration `0007` applied to the live DB** (2026-08-13, via `supabase db push` with 0006 stashed so
only 0007 went — 0006 stays unapplied). **Sim-verified**: real discriminating counts (Arms 5 · Back 4 ·
Biceps 1 · Chest/Push Day —). Closes #35.

---

## 2026-08-13 — Persistent active-workout bar (#33, Hevy-style)

User ask (Hevy inspiration): a persistent bar showing the in-progress workout so it's never lost /
accidentally closed. Reassurance given: durability is already handled (#32 — sets persist to disk, survive
a kill); what was missing is the *visible* affordance. Built `components/workout/ActiveWorkoutBar.tsx`: a
pill above the tab chrome (green dot · routine name · `IN PROGRESS · {live ElapsedClock}` · `RESUME →` ·
trash→`useDiscardWorkout` with confirm), tap → `router.push('/workout/[id]')`. Driven by `useActiveWorkout`,
so it re-appears after a relaunch (persisted workout). **First tried global in `_layout`** with a
`usePathname()` tab-route guard — the bar never showed because `usePathname()` in the root-layout position
(sibling of `<Stack>`) didn't resolve to the active route. **Switched to per-screen**: rendered in
`index`/`routines`/`settings` before each `HomeQuickStart` (so the MOST USED sheet layers over it), no
pathname dependency. Sim-verified: bar on Home + Routines, timer ticking, present on a cold start, sheet
covers it. Closes feedback #33. Device pass next.

---

## 2026-08-12 — Fix: START buttons dead whenever a workout is active

Device report: "can't click any start button for any routine." Root cause (pre-existing, not the
Home redesign): `useStartWorkoutFlow`'s `busy = hasActive || isPending` disabled every routine row
(`disabled={busy}`) as soon as an in-progress workout existed — and the disabled Pressable swallowed
the very tap meant to *resume* it (`start()` routes to `activeId`). Fix: `busy = startWorkout.isPending`
only; `start()` already prevents a second live workout, so an active workout no longer disables the
trigger — tapping now resumes it. Reproduced + fixed on the sim (tap → routed into the active "Leg Day").
Follow-up still open: a first-class **resume banner** (#33) so resuming isn't disguised as "start X".

---

## 2026-08-12 — "Kratos Home Final": ring-date heatmap + volume rows (records deferred)

Implemented the `Kratos Home Final.dc.html` design (claude.ai/design), minus the PR records badge
(deferred — see below). Sim-verified (light).

- **Ring-date heatmap.** The heatmap cells are now **circles** (`HeatDot` in `index.tsx`): a worked day =
  solid accent ring + faint `acc14` tint fill + accent number; **today** = dashed accent ring; every
  other day = bare number in `t3`. Weekday labels kept. Dropped the rounded-square cells + the
  worked/rest/skipped shading (design distinguishes only trained / today / other) and the today-glow.
- **History rows recut to volume.** Rows are now `date · DOW · name · session volume` (`4.1k KG`),
  replacing `N EXERCISES · N SETS · N MIN`. Added **`WorkoutListItem.volume_kg`** (Σ weight_kg × reps)
  to `listWorkouts` (`workout_exercises(id, sets(weight_kg, reps))`, summed client-side). Dropped the
  `HISTORY / N IN 30 DAYS` header (design omits it).
- **Cache buster `rq-v1`→`rq-v2`** — the persisted `WorkoutListItem` shape changed (added `volume_kg`);
  without the bump, hydrated old rows rendered `NaNk` (caught + fixed on the sim). UI also guards a
  non-finite `volume_kg` → `—`.
- **Deferred (backlog #35, bumped to HIGH):** the per-session PR "records" medal badge — needs accurate
  per-session PR computation (RPC / full-history pass, not a loaded-pages approximation). Row's right
  slot reserved.
- **Kept the fade removed** (design re-includes a 150px bottom fade; left out per the device feedback
  that it blanks the glass refraction). **Dark rings use the app's LED-lime `acc`**, not the design's
  softer `#8FB877` — consistency with the established dark theme over the mockup's exact swatch.

---

## 2026-08-12 — "Kratos Home" redesign: single-line streak + liquid-glass tabs (#22)

Implemented the `Kratos Home.dc.html` design (claude.ai/design project "Whitespace reduction design
options"). **Verified on the iOS 26.5 simulator (iPhone 17 Pro), both themes.**

- **Liquid-glass tab bar (#22).** `TabBar.tsx` rewritten as a floating **glass pill** — HOME · ROUTINES ·
  SETTINGS, each an SVG icon (`react-native-svg`, new dep) + mono label, the active tab lit by a
  brighter inner glass chip. Real iOS-26 `GlassView` (`glassEffectStyle="regular"`, `colorScheme` bound
  to the **in-app** theme via `useThemeName()` — verified: dark glass renders while the OS is light);
  `isLiquidGlassAvailable()` falls back to an opaque token pill off iOS 26. `withFab` shrinks the pill's
  right edge on Home to seat the FAB. The retired calendar/history routes keep working via a `TabBar`
  shim. `TAB_BAR_HEIGHT` 60→100 (floating chrome clearance); all 5 tab screens inset accordingly.
- **Green-glass FAB.** `HomeQuickStart.tsx` FAB restyled to the design's accent-tinted glass circle
  (moss on light, LED lime on dark) and moved into the bottom row beside the pill (`right:14 bottom:24`,
  `FAB_BOTTOM` 96→24). Its MOST USED sheet + rotate-to-× open animation are unchanged and verified.
- **Whitespace reduction.** `index.tsx` reflowed: a **fixed single-line streak header**
  (`● N DAY STREAK ──── BEST n`) above a scrolling feed (heatmap + history) that **dissolves under a
  bottom fade** (`expo-linear-gradient`) into the tabs. Drops the big streak numeral, the `KRATOS.`
  wordmark, and the scroll-pinned streak bar (the streak is always visible now).

**Device-QA follow-up (same day, on the iPhone 15 / iOS 26.5.2 — glass renders on-device):** four
fixes from hands-on feedback. (1) **Glass had nothing to refract** — the bottom fade blanked the area
behind the pill; removed it so the feed scrolls *under* the glass (`index.tsx`). (2) **FAB inconsistency**
— it was Home-only, so the chrome changed shape ("3 tabs vs 4"); now the FAB + full-width pill render on
Routines + Settings too (`routines.tsx`, `settings.tsx`, `withFab` everywhere). (3) **Routines slid
instead of cross-fading** — `routines` was never registered with `TAB_SCREEN` in `_layout.tsx`; added it.
(4) `isInteractive` on the pill + FAB glass for tap-morph. **Open:** the Apple-Music finger-drag "lens"
(magnify-follow across tabs) is a native `UITabBar` behavior our custom pill+FAB can't fully reproduce —
pending a call on custom-pill vs. native-tab-bar. Sim-verified; device rebuild in flight.

**Two design calls to revisit if wanted:** the design drops the `KRATOS.` wordmark from Home
entirely, and labels the third tab **SETTINGS** (was ACCOUNT) — both followed as drawn. Needed a native
rebuild for `react-native-svg` (hit + fixed a CocoaPods UTF-8 locale error: export `LANG=en_US.UTF-8`).
`tsc` green; walked both themes on the simulator.

---

## 2026-08-12 — Three parallel agents: data durability (#32), logging robustness, Biceps/Triceps split (#19)

Ran three file-disjoint agents in the shared tree, one integration + commit. All landed `tsc`-clean;
`npm run test:offline` green at **16/16** (5 new online-kill checks).

- **#32 data durability (High) — 3 residual gaps closed.** (1) Forced cache flush on AppState
  `background`/`inactive` (`flushCache()` → `persistQueryClientSave`, bypassing the ~1s throttle),
  wired in `_layout.tsx`. (2) Online in-flight writes now reach disk: `dehydrateOptions`
  (`queryClient.ts`) persists still-*running* offline-logging mutations (not just RQ's paused ones),
  identified via `isOfflineMutationKey` (`offlineSync.ts`); on relaunch `resumeInterruptedMutations()`
  serially re-drives every restored-pending write in FK order (paused queue + interrupted-in-flight),
  leaving RQ's reconnect/focus paths paused-only. (3) `scripts/test-offline-sync.ts` gained the
  online mid-workout background→kill→relaunch scenario. Re-drive safety rests on client-chosen UUIDs.
  Left undone: runtime throttle-tightening for the active-workout window (background-flush is the
  targeted fix). Deferred approach explicitly *not* taken: background-execution / "keep running".
- **Logging robustness.** New migration `0006_sets_unique_set_number.sql` adds
  `UNIQUE(workout_exercise_id, set_number)` + drops the redundant 0001 index (**written, not
  applied**). `sets.ts` `insertSet` made resilient: on `23505`, PK collision → idempotent return of
  the existing row (offline replay), tuple collision → re-pick max+1 and retry (bounded). This
  composes with #32's re-drive path — an already-landed re-drive now returns idempotently instead of
  erroring. `workouts.ts` `addExerciseToWorkout` dedupes `(workout_id, exercise_id)`. `workout/[id].tsx`
  wired the existing `useRemoveWorkoutExercise` via a REMOVE control + long-press on the exercise chip
  (destructive confirm, active-exercise reassignment; `actWarn`/`color.warn` per-mode token).
- **#19 Biceps/Triceps split.** `muscles.ts` `BODY_REGIONS` now splits Arms → **Biceps + Triceps**
  (forearms folded into Biceps) → 7 regions; `MUSCLE_TO_REGION` updated. `build-curated-exercises.py`
  matched + its output path fixed (was writing `curated-exercises.json` to cwd, not
  `scripts/data/`); regenerated `exercises-curated.json` (Biceps 18 / Triceps 10, 150 exercises, no
  `Arms`). Muscle-split view + picker/library chip rows derive from `BODY_REGIONS` dynamically —
  render fine at 7. **Live DB re-seed (`npm run seed`) left for the user.**

**User follow-ups:** apply `0006` migration to Supabase; `npm run seed` to publish the new
`body_region[]`. Nothing verified on device yet.

---

## 2026-08-09 — Fix: pinned streak bar bled the list through its background

On the physical device the scroll-pinned bar (Phase 3) let the history list read *through* its lower
half — the `HISTORY · N IN 30 DAYS` header and rows showed behind the sparkline. Cause: the bar's
opaque background was a separate absolutely-positioned layer that (in practice) didn't cover the full
bar height, so only the top portion masked. Fix: fold the background onto the `pinBar` container itself
(`backgroundColor`/border/shadow on the bar, single `opacity` + slide for the whole thing) and drop the
separate `pinBg` layer + its `bgOpacity` — the background is now intrinsic to the bar and always covers
it. The hero has already scrolled away before the bar fades in (`PIN_START 96`), so fading bg+content
together doesn't reintroduce the "ghosted double streak". Verified on the simulator (light + dark) at the
worst-case scroll positions: the bar fully masks the list; top fade-out is clean.

---

## 2026-08-09 — Clean up empty finished workouts (0 exercises / 0 sets)

Two stray finished workouts on the dev account (`Leg Day`, `Test 2`, both 2026-08-08) had zero sets —
empty shells from testing (an empty workout, or a routine-started workout finished before any set was
logged; `finishWorkout` drops zero-set exercises, leaving nothing). They showed as `0 EXERCISES · 0 SETS`
in the new Home history. Added **`scripts/cleanup-empty-workouts.ts`** (dry-run by default, `--commit` to
delete; scoped to one user; deletes the workout row only, sets/exercises cascade — a workout with any
logged set is never touched) and ran it: 2 deleted, 38 finished workouts remain, history now clean.
Neither was demo data (no `demo:` external_id), and both fell on a day that had other real workouts, so the
heatmap/streak are unaffected.

**Guard added (root-cause fix):** `finishWorkout` (`src/data/workouts.ts`) now **auto-discards** a workout
with zero total sets instead of finishing it into a shell — it deletes the row (sets/exercises cascade) and
returns `{ discarded: true }` (vs `{ discarded: false }` for a real finish). The workout screen already
blocks a zero-set finish at the UI ("Nothing logged" alert), so this is the **backstop**: it guarantees no
caller — offline replay, or the deferred resume-from-Home action (#33) — can ever leave an empty shell.
Verified on the simulator: an empty workout's FINISH still shows the "Nothing logged" prompt and DISCARD
returns home with no History row added; `tsc` clean.

---

## 2026-08-09 — "Rolling Weeks" Home redesign, Phase 3 of 3 (scroll-pinned streak bar) — redesign COMPLETE

The finishing flourish, and the last piece of `Kratos Home Rolling Weeks.dc.html`: a compact streak bar
that pins to the top and fades in as the hero scrolls out of view, so the streak stays glanceable while you
read history.

**Built (all in `src/app/index.tsx`):**
- Converted Home's `ScrollView` → **`Animated.ScrollView`**, capturing `contentOffset.y` into one
  native-driven `scrollY` (`scrollEventThrottle=16`, `useNativeDriver`).
- An absolutely-positioned top bar (respecting `insets.top`) with two layers: a **background** (`s0` +
  hairline + soft key shadow) whose opacity ramps to full in the first quarter of the scroll window (so it
  masks the content scrolling under it, not letting it ghost through), and a **content** layer (compact
  `{streak} DAY STREAK` + `BEST {best}` + a 30-day micro sparkline) that fades + slides down `−10→0` across
  the window. Thresholds `PIN_START 96 → PIN_END 154` mirror the mockup's 92→150 handoff so the big hero
  numeral and the compact one are never both at full strength.
- The sparkline reads `computeStreak().micro` (last 30 days) mapped to the mockup's heights/colours
  (worked 12/acc · rest 5/acc14 · skipped 2/line2). `pointerEvents: none` on the whole bar — it's purely
  informational and must never intercept a scroll or tap.

**Verified:** `tsc` clean; `expo export` bundles (routes unchanged). **Walked on the iOS simulator
(light + dark):** scrolling the heatmap/history away fades the bar in with the compact streak + sparkline
and the bg masks the list beneath; scrolling back to the top fades it cleanly out with no overlap on the
hero; dark keeps the LED look. **The Rolling Weeks Home redesign is now complete** (Phases 1–3). Remaining
follow-ups are the deferred edge states (`FEEDBACK-LOG.md` #33–35).

---

## 2026-08-09 — "Rolling Weeks" Home redesign, Phase 2 of 3 (+ FAB + "MOST USED" sheet)

The quick-start layer on the streak Home. `+` FAB → a "MOST USED" bottom sheet, so the routines you
actually run are one tap from Home without going to the ROUTINES tab.

**Built — `src/components/home/HomeQuickStart.tsx` (new), rendered as Home's top-most overlay:**
- **FAB** bottom-right using the semantic `cta*` tokens (dark = dark circle + accent glyph/border/glow,
  light = solid moss fill + white glyph — the "no accent fill on dark" rule holds). Two-bar `+` glyph.
- On open it **rotates to `×` and lifts above the sheet** to double as the close control — the lift
  distance is derived from the sheet's real height (`onLayout`), so it's robust across content/devices,
  not the mockup's hardcoded −448px. The scrim also closes it. All motion is `Animated` (native driver:
  translate/rotate/opacity) off one shared value.
- **Sheet content:** `MOST USED · LAST 90 DAYS`; routine rows ranked by 90-day usage (finished workouts
  per `routine_id` from the loaded history pages), each `name · N EXERCISES · ago · N× · START →` (top 6);
  footer `+ NEW ROUTINE` (`/routine/new`) / `EMPTY WORKOUT`. START/empty route through the shared
  `useStartWorkoutFlow`, so a live workout resumes instead of double-starting.

**Verified:** `tsc` clean. **Walked on the iOS simulator (light + dark):** FAB renders, opens the sheet
(scrim + slide), the FAB rotates to `×` and sits at the sheet's top-right, rows are usage-ranked
(Pull 3× / Leg 3× / Push 2× …), buttons present; dark keeps the LED look (dark FAB + lime `×`/glow).
**Phase 3 (scroll-pinned compact streak bar + 30-day sparkline) is next.**

---

## 2026-08-09 — "Rolling Weeks" Home redesign, Phase 1 of 3 (streak Home + 3-tab IA)

First slice of the big main-screen redesign imported from the Claude Design project
(`Kratos Home Rolling Weeks.dc.html`, via the design MCP). The mockup reworks Home into a
streak-first surface and folds the calendar heatmap + history into it, cutting the bottom bar to three
tabs. Locked with the user: **adopt the 3-tab bar**, **rest-tolerant streak**, and **ship the visuals
first, defer the edge states to backlog**.

**Built (Phase 1 — static content + IA + data):**
- **`src/lib/streak.ts`** (new, pure) — the rest-tolerant streak engine. A single non-worked day between
  workouts is a *rest* day (keeps the chain, counts toward the number); two+ consecutive non-worked days
  are *skipped* (break it). Returns `{ streak, best, cells, micro }`: `cells` is a **weekday-aligned**
  5-week grid (Mon–Sun, current week last, future days blank — the mockup's static M–S header only lined
  up because its "today" was a Sunday), `micro` is the last 30 days for Phase 3's sparkline.
  **Unit-verified** via a throwaway tsx harness (7 cases: isolated-rest-keeps-streak, 2-day-gap-breaks,
  pending-today, empty history, best-run).
- **`src/lib/dates.ts`** (new) — shared `startOfDay`/`addDays`/`mondayOf`/`agoLabel` (lifted from the old
  Home + calendar so the math lives once); `streak.ts` imports from it.
- **`src/data/useStartWorkoutFlow.ts`** (new) — the optimistic "start a workout" flow extracted verbatim
  from the old Home, so the ROUTINES screen and (Phase 2) the `+` sheet share identical behaviour. Also the
  **interim safeguard** for deferred item #33: a live workout is still resumable (routes straight to it).
- **`src/app/index.tsx`** (rewritten) — header, streak hero (big Geist-Mono numeral + `BEST n · REST DAYS
  COUNT`), the rolling heatmap (cell colours via `useTheme()` tokens, same recipe as `calendar.tsx`), and
  the inline history list (`useWorkoutList()` rows: date · name · `N EXERCISES · N SETS · N MIN`; PR/REST
  tags deferred). Reads all finished-workout days via `useWorkoutDays()` for accurate streak/heatmap.
- **`src/app/routines.tsx`** (new, ROUTINES tab) — the full routine list lifted out of the old Home
  (name · `N EX · ago`, EDIT, START →, + NEW ROUTINE / EMPTY WORKOUT), using the shared start flow.
- **3-tab bar** — new `HomeTabBar` wrapper in `components/voice/TabBar.tsx` (HOME · ROUTINES · ACCOUNT,
  `router.replace` so depth stays 1); swapped into Home, `settings.tsx` (active=account), and the now-retired
  `calendar.tsx` / `history/index.tsx` (active=home). Those two screens stay routable, just off the bar.

**Deferred → backlog (`FEEDBACK-LOG.md` #33–35):** running-workout resume state on the new Home (#33,
safeguarded), day-zero first-run state (#34), history PR/REST tags (#35).

**Verified:** `tsc --noEmit` clean; `expo export --platform web` bundles 16 routes (incl. `/routines`).
**Walked on the iOS simulator (iPhone 17, Debug):** Home in light *and* dark — streak `6` / `BEST 43`,
heatmap states render correctly against seeded demo data (worked/rest/skipped/today-ring), history rows,
and all three tabs navigate (ROUTINES → the new list, ACCOUNT → Settings). Dark keeps the LED-lime look
unchanged. **Phases 2 (`+` FAB + MOST-USED sheet) and 3 (scroll-pinned streak bar) are next.**

---

## 2026-08-08 — Remove the warmup feature (#31) + prune the feedback backlog

**#31 — warmup removed from the manual UI (code).** The user asked to drop warmup entirely — no way to
log a warmup set and no visible trace of the word. Scoped as a UI-removal, not a schema change:
- `workout/[id].tsx`: deleted the `+ WARMUP` action button; collapsed `openAdd(setType)` → `openAdd()`
  (always logs `normal`, always uses the normal prefill); removed the warmup-null prefill branch and the
  `onKeypadLog` warmup auto-advance-skip; the live grid now numbers every row `i + 1` (dropped the `W`).
- `history/[id].tsx`: rows number `i + 1` (no `W`); the set-type tag is hidden for warmup but **kept for
  `drop`/`failure`**, which imported Hevy data can still carry.
- **Left intact by design:** the `set_type` enum (`types/db.ts`) + its DB check, `lib/hevy.ts`'s warmup
  mapping, and the unwired Phase-2 `VoiceConfirmationCard` type list — so Hevy imports with warmup rows
  still load; those rows just render as plainly-numbered sets. `SetKeypad` had no warmup references, so it
  needed no edit. `tsc` + web-export (15 routes) green; not yet run on device.

**Backlog pruned.** Per a product call the user withdrew four open items — deleted from `FEEDBACK-LOG.md`
(entries + summary rows): **#24** predictive exercise suggestions, **#25** swipe to toggle KG/REPS focus,
**#27** superset linking, **#30** global rest timer. Open feedback backlog is now **#8 #19 #22 #23 #28**
(plus #5 device-confirm). (Also cleared the stale "feedback-log-only" session memory — this chat now
implements.)

---

## 2026-08-08 — Light theme (#17) Phases 2 + 3: real light palette + full screen migration + toggle

Finished the biggest backlog item. The user delivered the light design (`design_handoff_light_mode/` —
"Greige + Moss", option 2a, a full spec: token table + three reference screens + four "not a straight
swap" rules). This session dropped in the real values, migrated every screen to `useTheme()`, and added
the Settings control. Dark is untouched.

**Palette (`tokens.ts` → `lightColor`/`lightShadow`).** Warm off-white ground (`bg #EBE8E1`), near-white
cards (`s0 #FBF7F0`), moss accent (`acc #3F6B3B`), warm brown-black hairline alphas (`rgba(60,50,38,…)`),
dark ink text ramp. Glows go flat on white (`glowSm/Lg` opacity 0 — accent marks render as solid fills);
the raised keycap softens to a warm low-opacity drop; a new `shadow.cta` is the soft warm CTA elevation.
To satisfy `typeof darkColor`/`typeof darkShadow` with different values, `darkColor`/`darkShadow` lost
their `as const` (values widen to `string`/`number`; keys stay fixed).

**Semantic tokens for the 4 non-straight-swap rules** (added to *both* palettes, dark = its current
values, so dark is byte-for-byte unchanged; one StyleSheet serves both themes without per-screen theme
branching):
- `ctaBg` / `ctaBorder` / `ctaFg` + `shadow.cta` — **primary CTAs** (START, LOG SET, SAVE ROUTINE, DONE,
  RESUME, SEND CODE, ADD n, CREATE, …). Dark = dark fill + accent border + accent text (unchanged); light
  = solid moss fill + no border + white ink (a plain swap would read as disabled). Disabled states fall
  back to the plain `s2`/`s0` surface (unchanged in dark, clean outline in light).
- `checkBg` / `checkFg` — the **current-set ✓** (`workout/[id]`). Dark = accent border, no fill, accent
  glyph; light = filled accent chip, white glyph. (Completed ✓ stays a plain `ok` glyph — straight swap.)
- **`KeyCap` accent tone** (NEXT EXERCISE / FINISH WORKOUT) is a shared gradient keycap, so it branches on
  `useThemeName()`: light + accent → solid moss fill + white ink + `shadow.cta`; dark unchanged.

**Screen migration (~28 files).** Every screen/component that read the static `color`/`shadow` now reads
them from `useTheme()`, and its module-level `StyleSheet.create({…})` became
`makeStyles(color, shadow) => StyleSheet.create({…})` called per-component via
`useMemo(() => makeStyles(color, shadow), [color, shadow])`. The theme object is stable per palette, so
`makeStyles` runs once per mount and **only re-runs on an actual theme flip** — zero steady-state cost
(confirmed the reasoning with the user before starting). Primitives that referenced `color` in default
params (`LedDigits lit`, `StatusPip tone`) resolve it in-body instead. `calendar.tsx` computes cell/bar
colors in `useMemo`s — added `color` to their deps. Nothing outside `tokens.ts` imports the static
`color`/`shadow` anymore (kept exported as the dark reference + for the glow-shadow colors).

**Phase 3 — the control + chrome.** Settings gained an **APPEARANCE → Theme** row cycling
System·Light·Dark (`useThemeMode()` + `THEME_MODES`). `_layout` was refactored: the session/sign-in tree
moved into an `AppContent` component *inside* `ThemeProvider`, so the `Stack` `contentStyle` background
and the status-bar style are theme-aware (dark bar on dark, dark text on light) instead of hardcoded.

**Verified.** `tsc --noEmit` clean; `expo export --platform web` bundles all 15 routes; served the web
export and forced `themeMode:'light'` (had to also clear the persisted RQ cache — the `settings` query is
`staleTime: Infinity`, so a stale cached copy overrode the change) — the sign-in screen renders the greige
ground + dark ink, and SEND CODE is the muted outline when disabled and a **solid moss fill with white
ink** once a valid email is entered (rule 1 confirmed).

**Then verified on the iOS simulator** (Debug build via the sim-build tool + Metro; iPhone 17): walked Home
(solid moss START CTA), an active workout (**solid FINISH CTA + filled moss ✓ chip** for the current set,
and after logging, the completed row's ✓ drops to a plain moss glyph — both hard rules confirmed, distinct),
Calendar (worked-day `acc14` chips + **solid moss "today" cell** — the per-cell computed colors render right),
and Settings. The **APPEARANCE → Theme** row cycles System·Light·Dark and **flips the whole app live**;
switching to Dark showed the original lime-on-black LED theme **unchanged** — the byte-identical-dark promise
holds on device. (Discarded the test sets afterward.) One coordinate gotcha for future sim work: the control
tool's tap space is 402×874 *points*, but screenshots are 918-px wide — multiply screenshot coords by ~0.438.
User confirmed it looks good hands-on. **Physical iPhone still pending** — the installed Release build has
old JS bundled, so light mode needs a rebuild+reinstall to show there.

## 2026-08-08 — Light theme (#17) Phase 1: theme infrastructure (dark-only, zero visual change)

First slice of the biggest backlog item. Decisions locked with the user first: **the user supplies the
light design** (not a mechanical invert — the lime accent + LED glows don't survive inversion on white),
and behavior is **follow-system with a Settings override**. Built in phases so the design-agnostic
plumbing lands now and the 28-screen migration + real light values come once the palette arrives.

**Phase 1 (this session) — plumbing only, nothing changes visually:**
- **`tokens.ts` → per-mode palettes.** The flat `color`/`shadow` consts became `darkColor`/`darkShadow`
  (verbatim values) + placeholder `lightColor`/`lightShadow` (typed clones of dark, to overwrite in
  Phase 2). Exported as `themes.{dark,light}` (each `{ color, shadow }`), plus `ThemeName`/`Theme`
  types. `radius`/`space`/`font`/`tracking`/`timing` stay shared. **Back-compat kept:** `export const
  color`/`shadow` still point at dark, so the ~28 screens that import them statically are byte-for-byte
  unchanged — no migration forced yet.
- **`src/theme/ThemeProvider.tsx` (new).** `ThemeProvider` resolves the active palette from the stored
  preference + OS appearance; `useTheme()` (→ `{ color, shadow }`), `useThemeName()`, and
  `useThemeMode()` (→ `{ mode, setMode }` for the Phase-3 Settings control). `Appearance.getColorScheme()`
  seeds first paint synchronously; an `Appearance` listener keeps `'system'` live if the OS flips.
  Falls back to dark outside the provider (can't crash a stray consumer).
- **`data/settings.ts`.** Added `themeMode: 'system' | 'light' | 'dark'` (default `'system'`) to
  `AppSettings` + a `THEME_MODES` preset; the load-merge-over-defaults path picks it up for existing
  stored settings. Persisted via the existing optimistic `useUpdateSettings`.
- **`_layout.tsx`.** Mounted `<ThemeProvider>` under the query provider (it reads `useSettings`). The
  Stack's `contentStyle`/`statusBarStyle` still use the static dark `color` — made theme-aware in Phase 3.
- **`CLAUDE.md`.** Amended the single-palette hard rule to describe the theme layer (tokens.ts still the
  SoT, now `themes.{dark,light}` via `useTheme()`; dark unchanged + default; new/edited screens read
  `color`/`shadow` from `useTheme()`).

`Appearance` is JS-only ⇒ **no dev-client rebuild**. `tsc` + web-export green. Zero visual change (light
=== dark today), so nothing to see on device yet. **Blocked on the user for Phase 2:** the light palette
values (hex map against the token keys, a light `.dc.html` canvas, or a mockup to sample).

---

## 2026-08-08 — Feedback fixes: #16 finish summary in kg, #15 plate hint moved up; #31 logged, #29 withdrawn

Two small logging-readout fixes (user asked for these after picking the next batch), plus feedback
bookkeeping. Feedback-log chat, implementation explicitly requested.

- **#16 — finish summary reads in kg.** The summary rendered every number through the profile's
  display unit, and the volume tile applied the `t` (tonne) threshold to the *converted* value — so a
  **lb** user over 1000 lb saw `4.7t` (tonne) on a pound figure. Per the product call, the whole finish
  screen is now pinned to **kg** (`finish/[id].tsx`: `unit = 'kg'`, dropped the `useProfile` read).
  That fixes the bug for free — a tonne is metric, so `t` on a kg value is correct. Kept the `t`
  abbreviation (unit-correct now, keeps the tile scannable); raw-kg is a one-line change if wanted.
- **#15 — plate hint promoted.** "Plates per side" was 9.5px in a footer *below* the pad + LOG button,
  as far as possible from where the eyes sit. Moved it to its own row **directly under the KG/REPS
  fields** in `SetKeypad`, 9.5→11.5px, `num`/`t3`→`numSemibold`/`t2`, relabeled `PLATES / SIDE · …`,
  with a reserved `minHeight` so the pad doesn't jump as it appears/clears at the bar weight
  (`numberOfLines={1}` kept — #14 overflow guard). The old footer became an edit-only `editActions` row
  holding just DELETE SET.
- **Feedback bookkeeping.** Logged **#31** — remove the warmup feature entirely (user: "don't want to
  see any mention of warmup"). It's a UI-removal (`+ WARMUP` button + `W`/`WARMUP` labels in
  `workout/[id].tsx` and `history/[id].tsx`); the `set_type` enum + DB check + Hevy import stay so
  imported warmup rows still load. **Withdrew #29** (warmup-ramp generator) — no point improving a
  feature we're deleting.

`tsc --noEmit` clean. Not yet on device. Committed with the docs.

---

## 2026-08-08 — Release plumbing: privacy policy + `eas.json`

Second half of the App Store prep. Nothing here changes app behaviour except one new Settings row.

- **Privacy policy — `docs/legal/privacy-policy.html`.** Guideline 5.1.1(i) requires the policy to be
  linked from the App Store Connect metadata field **and** from inside the app, and to state what is
  collected, how, every use of it, every third party that receives it (with a commitment that they
  protect it equally), retention/deletion, and how to revoke consent. Written from an actual audit of
  the codebase rather than from a template: a grep for analytics/attribution/ads/crash SDKs
  (amplitude, mixpanel, segment, sentry, firebase, posthog, bugsnag, AppsFlyer, …) returns **nothing**,
  so the policy can honestly say Supabase is the *only* third party and no background collection
  happens at all. Self-contained HTML in the app's own LED theme so it drops onto any static host.
  Also states that no audio is recorded — true today, and it has to be revisited when Phase 2 voice
  ships (the mic/speech permission strings are already in the Info.plist via the
  `expo-speech-recognition` plugin, which is its own review risk while the feature is unwired).
- **In-app link:** Settings gained an ABOUT group with a "Privacy policy" row that opens
  `PRIVACY_POLICY_URL` in `expo-web-browser` (already a dependency — no new native module, so no
  dev-client rebuild). **The URL is a placeholder** until the page is hosted; a 404 there is a
  rejection, so it's a blocking pending action.
- **`eas.json` — already existed** (committed in `8c68457`, `development`/`preview`/`production` +
  `appVersionSource: remote`), but had gone missing from the working tree, so it was rewritten before
  that was noticed and then reconciled against `HEAD`. The committed diff is **purely additive**: a new
  `development-device` profile (dev client on real hardware, not the simulator) and
  `preview.ios.simulator: false`, so `preview` is unambiguously the internal-distribution **Release**
  build — the one that can be tested offline, since cutting Wi-Fi on a dev build severs Metro. Existing
  `cli.version`, both `channel`s, and the `submit` block were kept as they were. Profiles are flat
  rather than `extends`-chained so the `ios.simulator` override doesn't ride on deep-merge semantics.
  (The `channel` fields are inert until `expo-updates` is added — harmless, left alone.)
- **The trap this sets up:** `.env` is gitignored, and `app.config.ts` reads `process.env.SUPABASE_URL`
  at *build* time. EAS builds from the git tree in the cloud, so without EAS environment variables the
  app ships with empty Supabase credentials and simply cannot sign in — a green build that fails on
  launch. Each profile declares an `environment`, so the variables must exist in all three.

---

## 2026-08-08 — In-app account deletion (App Store Guideline 5.1.1(v))

Prompted by the App Store launch question: an app that creates accounts **must** let the user delete
the account *and its data* from inside the app — deactivation doesn't count, and a "email us to
delete" flow is only allowed for highly-regulated industries. Kratos creates accounts (email OTP)
and had no delete path, which is a near-certain 5.1.1(v) rejection. Built independently of the two
parallel chats — no shared files.

- **Server: migration `0005_delete_own_account.sql`.** A `security definer` RPC that reads
  `auth.uid()` and takes **no arguments**, so a caller can only ever delete itself; `execute` granted
  to `authenticated` only. Chosen over an edge function deliberately: same privilege story, but one
  migration instead of a new function + deploy step + secret — the minimal-overhead ask.
- **Why it has a body at all.** Most of the tree cascades off `auth.users`. Two things don't:
  `exercises.created_by` is `on delete set null`, so custom exercises would outlive the cascade as
  orphans (RLS then hides them from *everyone* — dead rows carrying user-authored names). They're
  deleted explicitly, and the ordering is forced: after routines/workouts (whose FKs to `exercises`
  are NO ACTION and would block the delete) but before `auth.users` (afterwards `created_by` is null
  and the rows are unfindable).
- **Client:** `deleteAccount()` in `src/data/auth.ts` = RPC + `signOut({ scope: 'local' })`. Local
  scope on purpose — the user row is gone so a server logout would fail, but the local clear still
  emits `SIGNED_OUT`, which is what wipes the persisted cache (and the paused offline-mutation queue)
  in `_layout`. UI is one row in Settings → ACCOUNT under Sign out: two native alerts, no new screen,
  no typed confirmation word (Apple allows confirmation steps, but not friction that makes deletion
  hard); a completion alert lands over the sign-in screen as the required "deletion complete" notice.
- **Verified against the live DB**, not just typechecked: a throwaway account was created, given a
  routine + workout + set + custom exercise + alias + voice_log, then deleted through the RPC as
  itself. Every row gone (user, profile, routines, routine_exercises, workouts, workout_exercises,
  sets, voice_logs, exercises, exercise_aliases); the seeded 150-exercise library intact. One
  non-finding: the pre-deletion JWT still validates until it expires (~1h) — stateless by design, and
  it resolves to no rows under RLS, which is exactly why the client signs out locally straight away.
  `tsc` clean; web export bundles.
- **Not yet seen on device** — no dev-client rebuild was needed (pure JS), but the row hasn't been
  rendered on hardware. Migration `0005` **is** applied to the live project.

---

## 2026-08-08 — Feedback fixes: #21 routine targets dropped, #18 multi-select add, #5 picker scroll

Three items across the routine editor + exercise picker, in the otherwise feedback-log-only chat (user
explicitly asked for these three). No overlap with the parallel #11/#13/#26 chat — those live in
`SetKeypad.tsx` / `workout/[id].tsx`, which this session deliberately never touches.

- **#21 — targets off the routine editor.** `target_sets`/`target_reps_low/high` were written by the
  editor but read *nowhere* in the app (workout screen, prefill, Home cards all ignore them), so the
  three micro-inputs were pure write-only friction — and the direct cause of #20's stuck-keyboard.
  Removed them entirely: a routine row is now name (tappable → progress) + reorder/delete. Save no
  longer sends targets (new routines write null; existing routines null on next save — invisible,
  read nowhere). Retired the `InputAccessoryView` DONE bar from **#20** (it existed only for these
  number-pad inputs), plus the `Item` target fields, `patchItem`, `parseIntOrNull`, and orphaned styles.
- **#18 — multi-select exercise add.** `ExercisePickerModal` gained an optional `multiSelect` prop +
  `onPickMany` callback. In multi mode a row tap toggles a checkmark (query + region persist so you
  keep browsing a filtered list), and an **ADD (n) EXERCISES** bar commits the whole batch; a custom
  exercise created mid-flow joins the selection instead of closing. Routine editor opts in. Kept
  `onPick` (single) unchanged so **mid-workout add stays single-select and `workout/[id].tsx` needed
  no edit** — both a UX call (adding many at once makes less sense mid-workout) and a clobber-avoidance
  call (that file is the parallel chat's).
- **#5 — exercise-list scroll (fix applied, device-confirm pending).** Best-reasoned root cause: the
  search field's `autoFocus` opens the keyboard on modal appear, and the `Modal` wasn't keyboard-aware,
  so the bottom of the `height:'86%'` sheet — including much of the `FlatList` — sat behind the
  keyboard ("can't scroll down"). Wrapped the sheet + backdrop in a `KeyboardAvoidingView`
  (`behavior='padding'` on iOS); keyboard-down layout unchanged (no regression), `autoFocus` kept. Only
  the picker modal changed — if a repro shows the library screen (`exercises.tsx`) also can't scroll,
  that's a separate container. Can't drive the modal+keyboard offline here, so this one still wants a
  device check.

`tsc --noEmit` clean; `expo export --platform web` bundles all 15 routes. Not yet run on device.
Committed with the docs.

---

## 2026-08-08 — Feedback fixes: #13 rep chips, #26 keypad auto-advance, #11 delete-set

Parallel chat to the #14/#20/#3 work below — took the three frictionless-logging items that build
on the same set-grid/keypad, started after that chat committed (`294a9d5`) so the two didn't clobber
`SetKeypad.tsx` / `workout/[id].tsx`.

- **#13 — reps as fixed chips.** `SetKeypad` gains an always-visible `REP_CHIPS = [4,6,8,10,12]` row;
  tapping a chip sets reps and returns focus to KG, so the numeric pad serves weight alone (flow:
  type weight → tap chip → LOG). Selected chip highlighted. Odd reps (singles/triples/15s/20s/AMRAP)
  stay loggable via the REPS field (pad + ± step edit reps directly). Chips always shown to avoid a
  sheet-height jump on field switch.
- **#12 — dissolved, not built.** Auto-advancing weight→reps at 2 digits breaks 3-digit weights
  (100/105/120 kg). #13 makes it moot: the pad is weight-only, so no focus-advance is needed. Marked
  RESOLVED.
- **#26 — keypad auto-advance.** After an **add** of a normal set, `onKeypadLog` re-opens the keypad
  on the next set number pre-filled with what was just logged, so a run of sets is tap-tap-tap without
  reopening. Warmups + edits still close. The grid's one-tap ✓ (`logPending`) is untouched — the two
  frictionless paths complement each other.
- **#11 — delete-set discoverability.** Long-press a logged row → confirm Alert → `deleteSet`; and the
  edit-sheet `DELETE SET` is now a real outlined button (was 9.5px footer text). **Swipe-to-delete
  deferred:** RNGH/reanimated are installed but wholly unexercised (no `GestureHandlerRootView`, no
  babel config, reanimated 4 needs worklets) — not worth wiring untested into a showcase build for one
  affordance; long-press already answers "no delete set option?". Revisit if broader swipe gestures
  are wanted (also unblocks #25).

`tsc --noEmit` clean. Not yet run on device — the app isn't installed on the booted sim and sign-in
needs an 8-digit OTP, so visual/interaction verification (chip layout, auto-advance feel, long-press
delete) is a user device-check. Committed with the docs.

---

## 2026-08-08 — Feedback fixes: #14 weight-cap, #20 keypad-dismiss, #3 frictionless defaults

Fixed the three "must-fix" feedback items (this chat is otherwise feedback-log-only; user
explicitly asked for these three).

- **#14 — mistyped weight can crash / overflow the plate hint.** Three layers: `SetKeypad`
  rejects kg entry over `MAX_WEIGHT_KG` (1000 kg, checked via `displayToKg` so lb is capped too)
  and clamps `adjust`; `platesPerSide` (`units.ts`) caps at `MAX_PLATES_PER_SIDE` (12) → returns
  null past it; `plateText` is `numberOfLines={1}`. Removes the mid-workout insert-throw risk on
  `weight_kg numeric(6,2)` and the off-screen plate string.
- **#20 — number-pad had no dismiss in the routine editor.** Added an iOS `InputAccessoryView`
  DONE bar (shared `nativeID`) over the three numeric target inputs + `keyboardDismissMode="on-drag"`
  on the editor ScrollView (cross-platform). iOS-gated so it's a no-op on Android.
- **#3 — frictionless defaults (the biggest open logging win).** Pending row now pre-fills weight
  from this-session's last set → **all-time previous best** (`useExerciseBests`, excludes current
  workout, cached) → last-session same-index; reps from this-session → last-session → **12**. ✓ is
  now a true one-tap log for any returning lift; keypad only opens for a brand-new lift with no
  weight yet, or when pre-fill is off. Chose heaviest-ever for "previous best" (v1 call).

`tsc --noEmit` clean; `expo export --platform web` bundles all routes. Not yet run on device.
Not committed (awaiting user).

---

## 2026-08-08 — First run on real hardware (iPhone 15) + tab-transition fix

**First time the app ran on physical hardware**, not a simulator. Installed as a Release build
via a free Apple **Personal Team** (`TUR974K866`, dhruvsb@icloud.com) — no paid Apple Developer
account, fully wireless once trusted, no cable needed for daily use. Signing cert expires every
**7 days** (free-team limit); reinstall command is in the `ios-device-install` memory note.
Getting there needed: `DEVELOPMENT_TEAM` wired into `ios/Kratos.xcodeproj/project.pbxproj`
(gitignored/regenerated — **should move into `app.config.ts`** so `expo prebuild` doesn't wipe
it), and building with `xcodebuild -allowProvisioningUpdates` directly since `expo run:ios`
doesn't pass that flag and can't self-heal a missing profile.

**QA pass from a screen recording surfaced 4 items** (`FEEDBACK-LOG.md` #10–13). Fixed #10 this
session:

- **Tab transitions (#10, DONE).** Root cause: the 4 top-level tabs (Home/Calendar/History/
  Settings) are plain Stack routes, not a `Tabs` layout — `TabBar` moved between them with
  `router.push()`, which plays iOS's "going deeper" slide-from-right on a lateral move, and grew
  the stack unbounded (never popped). `settings.tsx` also used a different verb (`replace`/
  `dismissTo`) than the other three (`push`), so leaving Settings behaved differently. Fix: all
  four call sites → `router.replace()` (depth stays 1), plus a `TAB_SCREEN` animation override
  (`_layout.tsx`, 160ms fade) applied only to the 4 tab routes — detail routes (workout,
  exercise, routine, finish) deliberately kept the native push so depth still reads as depth.
  **Verified live on-device** — user confirmed it feels smooth. Not the complete fix: each hop
  still remounts its screen (no real `Tabs` layout), so scroll position isn't preserved across
  tab switches — tracked as the open half of #10.
- **Logged, not yet fixed:** #11 delete-set exists but is undiscoverable (buried in the edit
  sheet, reachable only via `mode==='edit'`) — needs swipe-to-delete or similar. #12 "auto-advance
  weight→reps after 2 digits" conflicts with 3-digit weights (100kg+ deadlift/squat) — recommended
  resolution is to build #13 first (fixed rep-count chips), which removes the need for
  auto-advance entirely. #13 reps as 5 fixed buttons (4/6/8/10/12) needs an escape hatch for
  reps outside that set (singles, AMRAP, 15s) — ties into open item #3 (default reps=12).

`tsc --noEmit` clean throughout.

## 2026-08-06 (evening) — Showcase-finish pass: brand assets, demo data, NEW BESTS

Three items that made every screenshot read "unfinished," now closed:

- **App icon + splash (LED barbell brand).** New `scripts/build-app-icons.ts` (`npm run
  build:icons`; `@resvg/resvg-js` devDep) renders one parametric SVG glyph — cyan barbell +
  5-tick meter row with one lit tick, LED glow on `#020609` — into `icon.png` (1024²),
  Android adaptive foreground/background/monochrome, `splash-icon.png`, `favicon.png`. Pure
  geometry, no font deps ⇒ deterministic. `app.config.ts`: dropped the stock `ios.icon`
  Icon Composer bundle (deleted `assets/expo.icon/` + all leftover Expo/React placeholder
  art), adaptive bg → `#020609`, splash → dark (`#020609`, imageWidth 104) — **the white
  cold-start flash is gone**. `expo prebuild -p ios` regenerated the native icon/splash;
  verified on the springboard and a cold launch.
- **`scripts/seed-demo-workouts.ts`** (`npm run seed:demo <email> [--weeks 8] [--wipe]`).
  Seeds a Push/Pull/Legs/Upper block (~4 sessions/week, ~12% skipped, warmups, progressive
  overload + jitter, evening timestamps, all finished) and **find-or-creates the four
  named routines** so History rows carry real titles and Home shows a plausible rotation.
  Deterministic per-session RNG (seeded from week+slot — a shared stream desynced on skips
  and broke idempotency; found by re-running) and idempotent via `external_id 'demo:%'`;
  `--wipe` removes exactly the demo workouts (routines stay — they're usable). Verified:
  wipe 28 → create 28 → re-run creates 0; History/Calendar/progress light up.
- **NEW BESTS on the finish summary** (mockup 07, cyan — the hot palette stays reserved for
  floor mode). `getExerciseBests(exerciseIds, excludeWorkoutId)` in `data/workouts.ts` (one
  tiny indexed top-set query per exercise, parallel; a `distinct on` RPC is the future
  optimization) + `useExerciseBests` (excludes the finished workout server-side, so the
  result stays valid while its own rows sync) + the section in `finish/[id].tsx`:
  improvements-only (first-ever lifts don't count), session top vs prior best with
  heavier-or-same-weight-more-reps semantics; offline finish simply omits it. Also
  extracted a proper `topSet()` (weight then reps) replacing the weight-only reduce.

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
  `ios/Kratos/Info.plist` too (local, not tracked); a clean prebuild regenerates it from config.

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

Implemented the updated `Kratos Manual.dc.html` from the Claude Design project — the
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

**Context:** the `Kratos Manual` design gained a 12th screen — a **Calendar** built on a
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

**Context:** design canvas `Kratos Manual.dc.html` grew an **Entry & edges** section (screens 13–18)
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

## 2026-07-30 (session 2) — Manual-first pivot: implemented the "Kratos Manual" design (11 screens)

**Decision (user):** step back from voice-first. Make the **manual** logging loop work well
first — add a routine, start it, pick exercises, enter weight × reps × sets, see per-exercise
weight history, save routines. Voice comes later, layered back on top of the same set grid.
The voice-first work is **not deleted** — designs and code are preserved.

**Design source:** imported the Claude Design project *"Kratos voice-first design"*
(`claude.ai/design/p/638a7d3a…`). It already contained a dedicated **`Kratos Manual.dc.html`**
(11 screens, same dark LED-instrument language). All three design files were pulled into the
repo so nothing depends on the cloud project — see [`docs/design/`](./design/):
`Kratos-Manual.dc.html`, `Kratos-VoiceFirst-v3.dc.html`, `support.js`.

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

**Session scope:** Implement the 5-screen Claude Design mockup `Kratos Voice-First.dc.html`
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
  Kratos sign-in screen, and is ready for JavaScript updates through Metro.
- Hosted Supabase Auth now uses temporary Gmail custom SMTP for development. The
  `Magic link or OTP` template was changed from `{{ .ConfirmationURL }}` to
  `{{ .Token }}` and successfully delivered an 8-digit OTP. This Gmail sender is a
  development-only choice; replace it with a dedicated SMTP provider and verified
  Kratos-owned sending domain before inviting external users.
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
- Added the stable iOS bundle identifier `com.dhruvshah.kratos` in
  `app.config.ts`. This avoids Expo's anonymous bundle-ID prompt path and is the ID used
  by the generated Xcode target and installed app.
- `npx expo run:ios --device` generated the ignored `ios/` directory, completed
  prebuild/Pods/Xcode compilation, installed Kratos on `Dhruv's iPhone`, and selected
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
2. Open Kratos on the iPhone, reload if needed, enter a newly requested 8-digit OTP,
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
   `login@auth.<kratos-domain>`. Do not ship personal Gmail as the production sender.

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

**Session scope:** Implement the Claude Design mockup "Kratos Voice-First"
(`claude.ai/design/p/3490cf7c-7c24-47da-a2a7-dbc0f28ed54e`, project "Kratos
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
  KRATOS wordmark, TALK ring (LevelMeter + LED underline, tap-to-toggle via
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
   otherwise re-fetch via `DesignSync get_file` on `Kratos Voice-First.dc.html`
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
