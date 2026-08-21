# Reply to Apple — Guideline 2.1 (Information Needed), build 1.0.0 (2)

**How to use:** App Store Connect → the app → **App Review** → **Resolve** on the submission →
**Reply to App Review** (button sits under the message thread). Paste the block below into the Reply
field — it is **≤ 4,000 characters**, which is that field's hard cap — and attach the screen recording
with **Attach File**. Paste the same text into **App Review Information → Notes** so it persists on
future submissions. Don't touch **Resubmit to App Review** until Apple replies: resubmitting ends the
correspondence.

**Before you send — two things only you can do:**
1. **Record the screen capture on a physical iPhone** (item 1). Shot list is at the bottom of this file.
2. **Verify the device/OS list in item 2 is true** — only claim devices you actually tested on.

> **Describe only what build 1.0.0 (2) does.** The reviewer runs the binary already uploaded, so a step
> in this reply that the build can't perform reads as a broken app. The one trap, fixed above: the
> **Progress / "Key Lifts" board never shipped in build 2** — it was built after submission and then
> reverted (WORK-LOG 2026-08-21). The microphone and Apple Health prompts both work in build 2 as
> described.

---

## Paste this into the Resolution Center reply + the Notes field

```
Hi, and thanks for reviewing Kratos. I'm the sole developer. Everything you
asked for, in order.

1. SCREEN RECORDING
Attached, captured on a physical iPhone 15 (iOS 26.6), beginning at app launch.
It shows: creating an account, signing in with the demo account, the calendar /
history view, routines and settings, starting a workout from a routine, logging
weight, reps and sets, saving it and viewing it in history, voice logging with
the microphone permission prompt, "Sync from Apple Health" with the Health
permission prompt, the voice-logging toggle, and deleting an account. The app is
free: no paid content, in-app purchases or subscriptions.

2. DEVICES / OS TESTED BEFORE SUBMISSION
iPhone 15 and iPhone 16 on iOS 26.6 (physical devices), plus iPhone 16 Pro Max
and iPhone 17 Pro simulators on iOS 26.x. The app is iOS-only, built with Expo
SDK 57 / React Native.

3. WHAT THE APP DOES + TARGET AUDIENCE
Kratos is a workout logger for people who lift weights. Logging sets during a
workout is slow and fiddly, so people either skip it or lose their training
history. Kratos makes it fast two ways: a tap-based set grid with a keypad, and
optional voice logging (say "bench press 80 kilos for 8 reps" and it is parsed
into a set). It also keeps routines, a curated exercise library,
workout history, per-exercise weight progress, streaks and a calendar. It is for
adults who train with weights and want a quick, private log.

4. HOW TO SET UP AND ACCESS THE MAIN FEATURES
Sign-in is a standard email + password. Demo credentials (also in App Review
Information): appreview@kratos.app / KratosReview2026!
a. On the sign-in screen, enter the demo email + password and tap Sign In. (A
   "Forgot password?" option emails a one-time code, but you won't need it.)
b. Core loop: from Home, tap Start or pick a routine, add exercises, log weight
   x reps x sets with the set grid and on-screen keypad, then tap Finish for the
   summary. Finished workouts appear on Home (calendar plus a dated history
   list); tap one to open it, and tap an exercise inside it for that lift's
   weight history.
c. Voice logging (optional): tap the microphone and say a set out loud. iOS
   prompts for microphone permission; the clip is sent over HTTPS to our server,
   transcribed, and parsed into a set. The microphone is used only for this and
   can be turned off in Settings.
d. Apple Health (optional): reads (read-only) recent strength-workout summaries
   to fill in days you forgot to log. Declining blocks nothing.
No sample files needed. Weights show in kg by default, switchable to lb.

5. EXTERNAL SERVICES USED FOR CORE FUNCTIONALITY
- Supabase, for authentication, the Postgres database, and serverless Edge
  Functions (it hosts the account, all workout data, and the voice endpoint).
  Data is isolated per user with row-level security.
- OpenAI, for speech-to-text and parsing of the spoken set. Audio and the
  transcript go to OpenAI through that Edge Function purely to return the
  transcription / parse, never for advertising or tracking, and the user gives
  explicit in-app consent before the first upload.
No analytics, ads, crash-reporting or tracking SDKs, and no IDFA. No data is
sold. Both are named in the privacy policy:
https://dhruvsb.github.io/kratos/legal/privacy-policy.html

6. REGIONAL DIFFERENCES
None. Same features and content in all regions, no region-gated functionality,
no regional pricing (free worldwide), no location-based behavior. The only
variation is the default weight unit (kg / lb), changeable in Settings.

7. REGULATED INDUSTRY / THIRD-PARTY PROTECTED MATERIAL
Neither applies. Kratos is a personal fitness self-tracking app: not a medical
device, no medical advice, already declared as "not a regulated medical device"
in App Information. No protected third-party material, the exercise library is
my own content and everything else is the user's own workout data.

Thanks again. If anything needs more detail, just say and I'll send it.
```

---

## Screen-recording shot list (capture on a physical iPhone, latest iOS)

Apple wants it to **begin at app launch** and show the **typical flow + every permission prompt**.
Use the iOS built-in screen recorder (Control Center). Keep it ~60-90s.

1. **Launch** the app cold (from the Home screen tap, so the splash → sign-in is visible).
2. **Sign in** with `appreview@kratos.app` / `KratosReview2026!` → tap Sign In. Dismiss the iOS
   "Save Password" prompt with **Not Now**.
3. **Start a workout** → add an exercise → **log a set** (type weight, tap a rep chip, Log) → log a
   second set → **Finish** → show the summary.
4. **Home tab** → scroll to the **HISTORY** list → open the workout you just finished → tap one of
   its exercises to show that lift's **weight history** chart → back out.
5. **Voice logging** → tap the mic → let the **microphone permission prompt** appear and Allow →
   speak one set (e.g. "bench press 80 kilos for 8 reps") → show it parsed onto the grid.
6. *(Optional but good)* Settings → the **Apple Health** sync button → let the **Health permission
   prompt** appear (read-only). This shows the sensitive-data prompt Apple asked about.

Save the recording and attach it to the Resolution Center reply.
```
```
