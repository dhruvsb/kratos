# RepVoice — Session Context (start here)

**This is the fast-start dashboard. Read this first in any new chat**, then open the
deeper docs only as needed. It holds the current state, what's pending, and the open
issue backlog — so a fresh session can get productive without re-reading the whole
codebase or a huge prior conversation.

> **Maintenance rule:** at the end of any session that changes what's built/decided,
> update the three live sections here (**Current state**, **Pending actions**, **Open
> issues**) *and* append a dated entry to [`WORK-LOG.md`](./WORK-LOG.md). This file is the
> snapshot; `WORK-LOG.md` is the full history. Keep this file short.

**Last updated:** 2026-08-08 — **Light theme (#17) COMPLETE — Phases 2 + 3 done; the toggle works
app-wide.** The real light palette ("Greige + Moss", option 2a from `design_handoff_light_mode/`) is in
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

RepVoice = a workout logger (Expo/React Native + Supabase), built as a **portfolio /
showcase piece** (judged on screenshots, demo recordings, and a stranger trying it cold).
Weight is always stored in kg. **Current focus: manual-first.** The whole manual loop
(routine → start → pick exercises → log weight×reps×sets → per-exercise weight history)
is now implemented on the dark "LED-instrument" theme per the `RepVoice Manual` design.
Voice logging (Phase 2) is built but **unwired from the manual screens** and returns
later on top of the same set grid. Three phases: **1** manual tracker, **2** voice
logging via an LLM pipeline, **3** TBD (PRs/charts).

> **Where the designs live:** [`docs/design/`](./design/) holds the imported Claude Design
> canvases — `RepVoice-Manual.dc.html` (what's implemented) and
> `RepVoice-VoiceFirst-v3.dc.html` (kept for the later voice phase), plus `support.js` so
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
| Phase 1 backbone (schema, RLS, repos) | ✅ Built; backend verified live (**150 curated exercises** / 156 aliases seeded; RLS test passed) |
| **Local-first cache (persisted React Query)** | ✅ **Built 2026-07-31** — cold start hydrates last-known data from AsyncStorage (`src/lib/queryClient.ts`), revalidates in background; `staleTime` tiered; cache wiped on sign-out/account-switch. Warm-relaunch hydration **proven live 2026-08-06** (instant paint from disk even offline). |
| **Offline-first logging (write while disconnected + sync)** | ✅ **Built + verified on-device 2026-08-06** — start→pick→log/edit/delete sets→finish all work offline and sync on reconnect, surviving app kill. NetInfo→`onlineManager` (writes pause, not roll back); replay-safe writes (client `set_number`/`position`/ids in mutation *variables*); persisted+resumable queue (`src/data/offlineSync.ts`, `resumePausedMutations`); offline picker (`useExerciseDirectory` + local filter); `OfflineBanner`. History/calendar/progress/voice stay online-only. `npm run test:offline` **8/8** on live DB **and the full loop proven on the simulator** (offline log → kill → relaunch → reconnect → rows verified in Supabase). **QA'd 2026-08-06 (6 fixes)**: banner cold-start seed, SYNCING-pill latch, offline cold-cache START alert, **serial resume** (`SerialResumeQueryClient` — RQ 5.101's own resume is concurrent `Promise.all`), foreground re-seed + 10s poll, and an **authoritative reachability probe** (HEAD `/auth/v1/health` — NetInfo can lie in both directions; a stale "online" makes writes fire→fail→roll back). Deep scenarios verified vs the live DB: offline edit/delete of unsynced sets, offline discard (net no-trace), stuck-queue recovery; harness `test:offline` **11/11**. |
| **Instant interactions (navigate-first + prefetch)** | ✅ **Built 2026-07-31** — start/finish/discard/add-exercise are optimistic (client-chosen ids via `src/lib/ids.ts`, FK-ordering guard, snapshot rollback); routine + last-session prefetch serve the 80%-repeat case from cache; 1s clock isolated in `LiveClock`. Live-DB RLS harness green (10/10). On-device optimistic-feel smoke pending. |
| **Exercise directory — curated + rich metadata** | ✅ **Rebuilt this session**: replaced the 873 free-exercise-db import with a curated 150-set carrying `primary_muscles[]`, `secondary_muscles[]`, `body_region[]` rollup, `mechanic`, `modality`. Source of truth: `scripts/data/exercises-curated.json` (regen via `scripts/build-curated-exercises.py`). Muscle taxonomy in `src/lib/muscles.ts`. |
| **Manual-first UI — all 12 `RepVoice Manual` screens** | ✅ Built (dark LED theme); **now renders on the iOS simulator** (first run 2026-07-31 — Home, History, routines all render; full manual-loop walkthrough still pending) |
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
| Migration `0005_delete_own_account.sql` | ✅ **Applied live 2026-08-08** |
| Migration `0004_exercise_metadata.sql` | ✅ Applied — exercises table restructured (muscle arrays + body_region + mechanic + modality; dropped `primary_muscle`/`category`) |

Static checks currently green: `tsc --noEmit` clean; `expo export --platform web` bundles all 15 routes;
`xcodebuild -allowProvisioningUpdates` builds + installs Release to physical hardware.
**Feedback pass (`FEEDBACK-LOG.md`): 18 of 30 done** — ✅ #1 #2 #3 #4 #6 #7 #9 #10 #11 #13 #14 #15 #16
#17 #18 #20 #21 #26 (#12 dissolved by #13) · 🟡 #5 (fix applied — keyboard-avoidance; device-confirm
pending) · ⬜ #8 #19 #22 #23 #24 #25 #27 #28 #30 #31 (#29 withdrawn — superseded by #31).
**#17 light theme: DONE** (full Greige+Moss light mode + System·Light·Dark toggle; device-confirm pending).

## Pending actions (owner: user / next session)

- [ ] **Move `DEVELOPMENT_TEAM` into `app.config.ts`** (`ios` plugin config) — right now it's
      hand-edited into the gitignored `ios/RepVoice.xcodeproj/project.pbxproj`, which any
      `expo prebuild` will wipe, re-breaking signing.
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
- [ ] **Push the Supabase vars to EAS** (`eas env:create` for `SUPABASE_URL` + `SUPABASE_ANON_KEY` in
      the `development`/`preview`/`production` environments). `.env` is gitignored, so a cloud build
      without these ships credential-less and can't sign in. Service-role / OpenAI keys stay local.
- [ ] **`eas init`**, then paste the printed id into `app.config.ts` as `extra.eas.projectId` — the
      config is a dynamic `.ts` file, so the CLI can't write it for you.
- [ ] **Decide what to do about the mic/speech permission strings** before submitting: the
      `expo-speech-recognition` plugin puts them in the Info.plist, but Phase 2 voice is unwired, so
      the build declares permissions it never uses — a known review flag. Either drop the plugin from
      `app.config.ts` for the 1.0 submission or be ready to justify it.
- [ ] **See "Delete account" on device** (Settings → ACCOUNT) — the row is static-verified only.
      Don't smoke-test it on the real account; make a throwaway one, or re-run the live-DB check.
- [ ] **Verify a real OTP sign-in from scratch** (sign out → enter email → 8-digit code). This
      session used a persisted session, so the end-to-end auth flow itself is still unconfirmed.
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
      (#19 #22–#25 #27–#30). **#5/#18/#21 fixed 2026-08-08** (code) alongside earlier
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
| **Med** | `sets.set_number` has no `UNIQUE(workout_exercise_id, set_number)`; computed client-side (max+1) → race-prone dupes. **More relevant now** that manual logging is the primary write path. | `0001_init.sql`, `src/data/sets.ts` |
| Med | No way to **remove an exercise** added by mistake mid-workout — `useRemoveWorkoutExercise` exists but isn't wired into the set-grid screen (potential dead-end: add wrong exercise, can't undo) | `src/app/workout/[id].tsx` |
| Med | `db.ts` `z.coerce` numeric guards are dead — repos `return data as X`, never `.parse()`; a numeric-as-string would make `weight_kg` a string | `src/data/*`, `src/types/db.ts` |
| ~~Low~~ | ✅ **Done 2026-07-31** — body-region **muscle filter** chip row added to the picker *and* the library (`exercises.tsx`); `searchExercises(query, region?)` + `listExercisesByRegion()`. (RECENT tab still deferred.) Also new: per-workout **muscle split** on `history/[id].tsx` (`lib/muscleSplit.ts` + `components/MuscleSplit.tsx`). | `ExercisePickerModal.tsx` |
| Low | Routine editor uses ↑/↓ reorder, not drag (= FEEDBACK **#8**, still open) | `src/app/routine/[id].tsx` |
| Low | `addExerciseToWorkout` doesn't dedupe `(workout_id, exercise_id)` | `src/data/workouts.ts` |
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
