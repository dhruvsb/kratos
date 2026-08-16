# Kratos — Pre-Submission Codebase Audit (App Store)

**Date:** 2026-08-16 · **App:** Kratos (`com.dhruvshah.kratos`) v1.0.0 · **First-ever App Store submission**

This is a full pre-submission risk audit: the **current Apple guidelines** and **real-world
rejection trends (2025–2026)** cross-referenced against the actual codebase, native config, and
hosted pages. It records everything found, everything **already fixed in this session** (with
verification), and the **actions only you can take** before hitting *Add for Review*.

> **How to read this:** §1 is the bottom line. §2 is what I changed and proved. §3 is the ranked
> risk register (what could still get you rejected + what to do). §4 is your manual checklist.
> §5 is the research basis. Severity: **BLOCKER** (will reject) · **HIGH** · **MEDIUM** · **LOW**.

---

## 1. Bottom line

Kratos is in **good shape** for a first submission — the hard structural requirements (in-app
account deletion, privacy policy, privacy manifest, export-compliance flag, minimal HealthKit
scope, no client-side secrets, graceful empty/offline states) are already met. The submission
scaffolding in App Store Connect (privacy labels, age rating 4+, listing, demo account, DSA
non-trader) is done per [`APP-STORE-CONNECT-SUBMISSION-REPORT.md`](./APP-STORE-CONNECT-SUBMISSION-REPORT.md).

The audit found **one broken-link blocker** and **one missing new-rule feature**, both now **fixed
in code**:

1. **Broken in-app Privacy Policy link** (would read as a missing policy → 5.1.1 auto-reject). Fixed.
2. **No in-app AI-consent gate** before audio is sent to OpenAI — required by the **Nov-2025 update
   to Guideline 5.1.2(i)**. Built.

Plus four native/plist compliance fixes (background-audio mode, read-only Health string, dead
speech-recognition permission, dev screen) — all applied and **verified with a real clean-room
`expo prebuild`**.

**The remaining rejection risks are yours to close manually** — they can't be done in code: verify
the demo account signs in on a clean install, keep the transcription backend funded during review,
upload real screenshots, and **build via EAS** so these native fixes actually ship (see §3.0 and §4).

---

## 2. Fixed this session (in code, verified)

All changes are `tsc`-clean. The native ones were verified by moving `ios/` aside and running a real
`expo prebuild -p ios` (exactly what EAS does on a cloud build) and inspecting the generated
`Info.plist` / entitlements, then restoring the original `ios/`.

| # | Fix | File(s) | Why | Verified |
|---|---|---|---|---|
| 1 | **Privacy Policy URL corrected** `…/kratos/privacy-policy.html` → `…/kratos/legal/privacy-policy.html` | `src/app/settings.tsx`, new `src/lib/urls.ts` | The in-app link was missing the `/legal/` path segment and **404'd**, while App Store Connect's URL was correct. A broken in-app policy = missing policy (5.1.1) = auto-reject. URL now centralized in one module so it can't drift again. | Hosted page confirmed live (200) at the corrected URL. |
| 2 | **AI-consent gate before first audio upload** + revocable Settings toggle | new `src/components/voice/VoiceConsentGate.tsx`, `src/app/voice/record.tsx`, `src/data/settings.ts`, `src/app/settings.tsx` | **Guideline 5.1.2(i)** (tightened Nov 13 2025) requires explicit in-app consent naming the specific third-party AI **before** personal data is shared. A privacy-policy mention alone is insufficient. The recorder now shows a consent screen (names **OpenAI**, the **audio recording**, the **purpose**) and won't open the mic until the user taps *Allow*; the choice persists (`voiceAiConsent`) and is revocable in **Settings → PRIVACY**. | `tsc` clean; gate logic gated on persisted flag, mic start deferred behind consent. |
| 3 | **Removed unnecessary `UIBackgroundModes: [audio]`** | new `plugins/withIosPrivacyCleanup.js`, `app.config.ts` | expo-audio's plugin unconditionally declares the `audio` background mode, but Kratos records **foreground-only** (no `staysActiveInBackground`). Declaring a background mode you don't use is a **Guideline 2.5.4** rejection. A trailing config plugin strips it. | Clean-room prebuild: `UIBackgroundModes` **absent** from generated `Info.plist`. |
| 4 | **Removed read-only-violating `NSHealthUpdateUsageDescription`** | `app.config.ts` | Kratos never writes to Apple Health, but the HealthKit plugin injects a generic *"…wants to update your health data"* write string by default. A write permission string for a read-only app is a **5.1.3** risk. Passed `NSHealthUpdateUsageDescription: false`. | Clean-room prebuild: key **absent**; `NSHealthShareUsageDescription` (read) intact. |
| 5 | **Dropped dead `expo-speech-recognition` permission** (`NSSpeechRecognitionUsageDescription`) | `app.config.ts` | The on-device speech path (`src/lib/stt.ts`) is unreachable dead code; the live path is cloud transcription. A usage string for a feature that never runs is a **5.1.1** rejection risk. Removed the plugin (mic string still supplied by expo-audio). | Clean-room prebuild: key **absent**; `NSMicrophoneUsageDescription` intact. |
| 6 | **Dev telemetry screen gated out of production** | `src/app/dev/telemetry.tsx` | `kratos://dev/telemetry` was a deep-link-reachable raw-data "beta/test" surface (bare white screen showing cost/latency/transcripts) — the kind of dev artifact Apple rejects. Now redirects home unless `__DEV__`. | `tsc` clean; hook-free gate wrapper. |
| 7 | **Fixed contradictory Settings copy** — removed *"Voice logging arrives in a later build"* | `src/app/settings.tsx` | Voice logging is the **primary Home action** and fully shipping; the footer told reviewers it didn't exist yet. Removed the stale sentence. | — |
| 8 | **Unused motion string** defensively stripped | `plugins/withIosPrivacyCleanup.js` | `expo-sensors` (FloorMode/floorSensor) is dead code; the generic `NSMotionUsageDescription` is removed if ever present. | Clean-room prebuild: key **absent**. |

**Confirmed already-correct (no change needed):** no client-side secrets (only the Supabase anon
key reaches the bundle; service-role + OpenAI keys stay in edge functions); `ITSAppUsesNonExemptEncryption:
false`; privacy manifest present with required-reason APIs (UserDefaults/BootTime/FileTimestamp);
in-app account deletion hard-deletes via `delete_own_account` RPC; `MOCK_VOICE = false`; empty-account
screens don't crash; network errors degrade gracefully; HealthKit entitlement minimal (no
background-delivery).

---

## 3. Risk register — what could still get you rejected

### 3.0 — BLOCKER (process): build via EAS, or re-run prebuild locally

The native fixes (#3–#5, #8) live in `app.config.ts` + `plugins/`. They take effect when the iOS
project is **generated from config**. The **committed `ios/` folder is gitignored and still holds the
old (pre-fix) `Info.plist`.** Two safe outcomes:

- ✅ **Submit via EAS** (`eas build -p ios --profile production`) — the cloud build runs a fresh
  prebuild from `app.config.ts`, so **all fixes ship automatically**. This is the planned path.
- ⚠️ If you instead archive from the **local** `ios/` in Xcode, you must first run
  `npx expo prebuild -p ios --clean` (with `LANG=en_US.UTF-8`) to regenerate the plist, or you'll
  ship the stale one (background-audio mode, health-write string, speech string all back).

**Action:** use the EAS production build (recommended). Don't hand-archive the current local `ios/`.

### 3.1 — HIGH: Demo account must sign in on a clean install (Guideline 2.1)

~40% of unresolved rejections are 2.1, and the #1 cause for login-walled apps is *"couldn't sign in
with the demo credentials."* Your creds are set (`appreview@kratos.app`) and Supabase email
confirmation is OFF (good — a Supabase-specific trap). **But it has never been verified end-to-end
on a fresh install.**

**Action:** on a clean install of the exact build you'll submit, sign in with the demo creds, and
confirm the account already contains sample workouts (run `npm run seed:demo` against it if not) so
the app never looks empty. No 2FA on that account.

### 3.2 — HIGH: Voice backend must be live + funded during the entire review window (2.1)

Voice logging is the **first thing a reviewer taps** (Home mic FAB) and it round-trips to your
Supabase Edge Function → OpenAI. If the function is down, rate-limited, region-gated, or the OpenAI
key is out of credit **when the reviewer tests**, the headline feature fails → 2.1 rejection. (The
code degrades gracefully to an inline error, but a non-functional advertised feature still fails.)

**Action:** confirm `transcribe` + `parse-utterance` edge functions are deployed and the OpenAI key
is funded; keep them up through review. The review notes already explain the mic→OpenAI flow (good).

### 3.3 — HIGH (verify): the two hosted pages must stay live (5.1.1)

Both `…/legal/privacy-policy.html` and `…/legal/support.html` were confirmed live (200) during this
audit, name OpenAI + Supabase + Apple Health, and match the App Privacy labels. A 404 at review time
is an instant reject.

**Action:** re-confirm both URLs load in a browser the day you submit. The in-app link now matches (#1).

### 3.4 — MEDIUM: Minimum-functionality / "AI-scaffold" scrutiny (Guideline 4.2 / 4.3)

A free, first-submission, AI-assisted fitness tracker fits the exact profile reviewers now scrutinize
for "thin AI-scaffold" apps. Your **defenses are strong and native** (voice logging + HealthKit read
+ a distinctive LED design + offline sync), which is precisely what signals depth — **but only if the
reviewer sees them without an empty first screen.** Day-zero state (`HomeDayZero`) exists.

**Action:** (a) make sure the demo account is pre-seeded so nothing looks empty (same as §3.1);
(b) lead the screenshots + description with voice logging and HealthKit; (c) prep a ~30–60s **App
Preview / demo video** — it's the standard fast unlock if you ever get a 4.2/4.3 first-pass reject.

### 3.5 — MEDIUM: Screenshots (blocker to submit at all) must be real & iOS-only (2.3)

0 of 10 screenshots are uploaded (per the submission report) — you can't submit without them. When
you make them: use the actual current app UI (no mockups), 6.9" iPhone frames only, **no Android/web
chrome**, and don't show any feature that isn't in the shipping build.

**Action:** capture on a 6.9" simulator (iPhone 16 Pro Max) with `seed:demo` data; include a
voice-logging shot **only because voice actually ships** now.

### 3.6 — LOW: "Hevy" competitor name in Import/Export copy (2.3.10-adjacent)

`src/app/import.tsx` and `src/app/export.tsx` name "Hevy" (a competing app) in on-screen text. This
is **low actual risk** — Hevy is referenced as a *data format* for a genuine interop feature, not as a
platform, and the phrasing is functional ("import from Hevy", "Hevy-compatible CSV"). Left as-is
because softening it would reduce the feature's clarity for users migrating in.

**Optional:** if you want zero risk, generalize to "import from a CSV export." Not required.

### 3.7 — LOW / cleanup (not submission-blocking)

- **Dead code still bundled:** `expo-speech-recognition` + `src/lib/stt.ts` (+ `VoiceMicButton`,
  `useVoiceSession`), and `expo-sensors` + `FloorMode.tsx`/`floorSensor.ts`. Their permission strings
  are now stripped from the binary, so they're harmless — but removing the deps + files is cleaner and
  shrinks the bundle. Deferred (touches `package.json`/lockfile; do as a separate task).
- **Legacy Android/web scaffolding** in `app.config.ts` (android/web blocks, `react-native-web`) —
  harmless for an iOS build; pre-existing backlog item, not a submission risk.

---

## 4. Your pre-submission checklist (manual — I can't do these)

- [ ] **Build via EAS production** (`eas build -p ios --profile production`) so the native fixes ship
      (§3.0). Don't hand-archive the local `ios/` without `expo prebuild --clean` first.
- [ ] Confirm the `SUPABASE_URL` / `SUPABASE_ANON_KEY` EAS env vars are set for `production` (else the
      cloud build ships credential-less and can't sign in).
- [ ] **Verify the demo account** (`appreview@kratos.app`) signs in on a clean install and is
      pre-seeded with sample workouts (§3.1).
- [ ] Confirm **`transcribe` + `parse-utterance` edge functions are deployed and OpenAI-funded**, and
      keep them up through review (§3.2).
- [ ] Re-confirm both **hosted URLs load** (privacy + support) the day you submit (§3.3).
- [ ] **Upload screenshots** — real UI, 6.9" iPhone, iOS-only, voice-logging shot included (§3.5).
- [ ] Smoke-test on the **actual submitted build**: full logging loop + one **real spoken voice log**
      (grant consent → speak → transcript → sets). This is the one flow never tested on-device.
- [ ] Then **Add for Review**. (Everything in App Store Connect §1–6 is already saved per the
      submission report.)

**Already done / no action:** paid Apple Developer account (Apple ID 6801877279 active), App Privacy
labels published, age rating 4+, export compliance flag, DSA non-trader, account deletion, privacy
manifest, in-app privacy-policy link (fixed), AI-consent gate (built).

---

## 5. Research basis (current guidelines + 2025–2026 rejection trends)

Sourced from Apple's live guidelines/support pages and first-hand developer reports (Apple Developer
Forums, indie write-ups). The changes that actually bind this app:

- **5.1.2(i) — third-party AI disclosure (added Nov 13 2025):** *"clearly disclose where personal data
  will be shared with third parties, including with third-party AI, and obtain explicit permission
  before doing so."* → drove the consent gate (§2 #2). Voice/audio flows are named as high-scrutiny.
- **5.1.1(v) — account deletion:** must be in-app, a true delete (not deactivate/sign-out), not a
  support-email path. ✔ Kratos satisfies this.
- **5.1.1(i) / 5.1.3 — privacy policy + HealthKit:** policy reachable in-app **and** in metadata, must
  name health data + third parties, health data not for ads, no health data in iCloud, read-only ⇒ no
  write string. ✔ after fixes #1, #4.
- **2.5.4 — background modes:** declaring `audio` background without background playback/recording is
  rejected. ✔ after fix #3.
- **2.1 — completeness:** working demo account + live backend are the top login-app rejection causes.
  → §3.1, §3.2.
- **4.2 / 4.3 — minimum functionality / AI-scaffold spam:** native depth (HealthKit, voice) must be
  visible on first launch; keep a demo video ready. → §3.4.
- **2.3 — metadata:** real iOS-only screenshots, no other-platform references. → §3.5, §3.6.
- **Age ratings (2025 overhaul) / export compliance / privacy manifest / iOS-26 SDK gate (Apr 28
  2026):** age rating 4+ done; `ITSAppUsesNonExemptEncryption: false` set; `PrivacyInfo.xcprivacy`
  present with required-reason APIs; Expo SDK 57 builds on a current Xcode/SDK via EAS.
- **3.1.x — payments:** N/A (free, no IAP, no external purchase links). **4.8 — Sign in with Apple:**
  N/A (email+password is your own auth system; only triggers if you add social login later).

---

*Generated by an automated pre-submission audit. The code fixes in §2 are applied and verified; the
§4 items require your Mac/terminal/device and Apple account and are yours to complete.*
