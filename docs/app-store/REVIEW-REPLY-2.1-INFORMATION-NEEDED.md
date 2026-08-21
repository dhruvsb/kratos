# Reply to Apple — Guideline 2.1 (Information Needed), build 1.0.0 (2)

**How to use:** In App Store Connect → **Resolution Center**, reply to the rejection and paste the
block below. Also paste the same text into **App Review Information → Notes** so it persists on
future submissions. Attach the screen recording (item 1) to the Resolution Center reply.

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
Hi, and thanks for taking the time to review Kratos. I'm the developer (it's just me on
this one), so happy to answer anything further. Here's everything you asked for, in order.

1. SCREEN RECORDING
I've attached a screen recording (a little over 3 minutes) captured on a physical iPhone.
It starts by launching the app and then walks through the typical flow:
  - Signing in with the demo account
  - The Calendar / history page
  - The workout routines and settings pages
  - Starting a workout from an existing routine, logging weight, reps and sets, saving
    the workout, and then viewing that workout's history
  - Using voice to create a new workout routine (I speak the routine name and three
    exercises, and it's parsed into a routine)
  - The "Sync from Apple Health" feature, including the Health permission prompt
  - The toggle to enable / disable voice logging
  - Logging with voice via an AI prompt
So the microphone prompt and the Apple Health prompt both appear in the recording.

2. DEVICES / OS TESTED BEFORE SUBMISSION
- iPhone 15, iOS 26.6 (physical device)
- iPhone 16, iOS 26.6 (physical device)
- iPhone 16 Pro Max simulator, iOS 26.x
- iPhone 17 Pro simulator, iOS 26.x
The app is iOS-only, built with Expo SDK 57 / React Native.

3. WHAT THE APP DOES + TARGET AUDIENCE
Kratos is a workout logger for people who lift weights (strength / gym training). The
problem it solves: logging sets during a workout is slow and fiddly, so people either
skip it or lose track of their training history. Kratos makes logging fast in two ways,
a tap-based set grid with an on-screen keypad, and optional voice logging (for example,
say "bench press 80 kilos for 8 reps" and it gets parsed into a set). It also keeps
routines, a curated exercise library, workout history, per-exercise weight progress,
streaks and a calendar. It's aimed at adults who train with weights and want a quick,
private personal log. The app is free, has no in-app purchases, and shows no ads.

4. HOW TO SET UP AND ACCESS THE MAIN FEATURES
Sign-in is a standard email + password. The demo credentials are in the App Review
Information fields, and repeated here for convenience:
  User name: appreview@kratos.app
  Password:  KratosReview2026!
Steps:
  a. On the sign-in screen, enter the demo email + password and tap Sign In. (There's
     also a "Forgot password?" option that emails a one-time recovery code, but you
     won't need it, the password is provided.)
  b. Core loop: from Home, tap Start or pick a routine, add exercises, log weight x
     reps x sets using the set grid and on-screen keypad, then tap Finish for the
     summary. Finished workouts appear on the Home tab (a calendar plus a dated
     history list); tapping one opens it, and tapping an exercise inside it shows
     that lift's weight history over time.
  c. Voice logging (optional): on the logging screen, tap the microphone button and say
     a set out loud. iOS prompts for microphone permission; the clip is sent over HTTPS
     to our server, transcribed to text, and parsed into a set. Microphone access is
     used only for this feature, and it can be turned off in Settings.
  d. Apple Health (optional): the app can read (read-only) recent strength-workout
     summaries to fill in days you forgot to log. Declining Health doesn't block anything.
No sample files are needed. Weights show in kg by default and can be switched to lb in
Settings.

5. EXTERNAL SERVICES USED FOR CORE FUNCTIONALITY
- Supabase, for authentication, the Postgres database, and serverless Edge Functions
  (it hosts the account, all workout data, and the server-side voice endpoint). Data is
  isolated per user with row-level security.
- OpenAI, for speech-to-text and parsing of the spoken set. Recorded audio and the
  resulting transcript are sent to OpenAI through our Supabase Edge Function purely to
  return the transcription / parse, not for advertising or tracking.
There are no analytics, ads, crash-reporting or tracking SDKs, and no advertising
identifier (IDFA). No data is sold. Both services are named in the privacy policy:
https://dhruvsb.github.io/kratos/legal/privacy-policy.html

6. REGIONAL DIFFERENCES
The app works the same everywhere. Same features and content in all regions, no
region-gated functionality, no regional pricing (it's free worldwide), and no
location-based behavior. The only user-facing regional variation is the default weight
unit (kg / lb), which the user can change in Settings at any time.

7. REGULATED INDUSTRY / THIRD-PARTY PROTECTED MATERIAL
Kratos is a personal fitness self-tracking app. It isn't a medical device, gives no
medical advice or treatment, and doesn't operate in a regulated industry (this is
already declared as "not a regulated medical device" in App Information). There's no
protected third-party material: the exercise library is my own curated content, and
everything else is the user's own workout data. No third-party media, music or licensed
content is shown.

Thanks again for the review. If anything here needs more detail, just let me know and
I'll get it to you quickly.
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
