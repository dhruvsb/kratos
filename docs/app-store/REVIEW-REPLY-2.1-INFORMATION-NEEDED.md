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
Hi, thanks for looking at Kratos. I'm the only person working on it, so I can
answer anything else you need. Here are the seven items you asked for.

1. SCREEN RECORDING
Attached, captured on a physical iPhone 15 running iOS 26.6, starting at app
launch. It covers creating an account, signing in with the demo account,
the calendar and history view, routines and settings,
starting a workout from a routine and logging weight, reps and sets, saving and
reopening it in history, voice logging with the microphone permission
prompt, Sync from Apple Health with the Health permission prompt, the voice
logging switch, and deleting an account. The app is free with no in-app
purchases, so there is no paid content.

2. DEVICES AND OS VERSIONS TESTED
iPhone 15 and iPhone 16 on iOS 26.6 as physical devices, plus the iPhone 16 Pro
Max and iPhone 17 Pro simulators on iOS 26. The app is iOS only, built with Expo
SDK 57 and React Native.

3. WHAT THE APP DOES AND WHO IT IS FOR
Kratos is a workout logger for people who lift weights. Logging sets while you
train is slow and fiddly, so people either stop doing it or lose track
of what they lifted last time. Kratos handles that two ways: a set grid with a
keypad, and optional voice logging, where you say something like "bench press 80
kilos for 8 reps" and it becomes a logged set. It also keeps
routines, an exercise library, workout history, weight progress per exercise,
streaks and a calendar. It is for adults who lift and want a fast, private
record.

4. SETTING UP AND REACHING THE MAIN FEATURES
Sign-in is email and password. The demo account is in the App Review Information
fields and here: appreview@kratos.app / KratosReview2026!
a. Enter the demo email and password on the sign-in screen and tap Sign In.
b. Main loop: from Home, tap Start or choose a routine, add exercises, log
   weight, reps and sets with the grid and keypad, then tap Finish for the
   summary. Finished workouts appear on Home in the calendar and history list.
   Tap one to open it, and tap an exercise inside it for that lift's weight
   history.
c. Voice logging is optional. Tap the microphone and say a set out loud. iOS
   asks for microphone permission first. The clip goes over HTTPS to our server,
   is transcribed and parsed into a set. The microphone is used for nothing else
   and can be turned off in Settings.
d. Apple Health is optional and read-only. It reads recent strength workout
   summaries so days you forgot to log still appear. Declining blocks nothing.
No sample files needed. Weights are in kg by default, switchable to lb.

5. EXTERNAL SERVICES
Supabase handles authentication, the Postgres database and the Edge Functions.
It holds the account, all workout data and the server-side voice endpoint, with
row-level security so each user only reads their own rows.
OpenAI handles speech to text and parsing of the spoken set. The audio and the
resulting text go through that Edge Function only to return the transcription
and the parse, never for advertising or tracking, and the user has to agree in
the app before the first upload.
No analytics, advertising, crash reporting or tracking SDKs, no IDFA, and no
data is sold. Both are named in the privacy policy:
https://dhruvsb.github.io/kratos/legal/privacy-policy.html

6. REGIONAL DIFFERENCES
None. Features and content are the same in every region, nothing is
region-gated, the app is free worldwide, and nothing depends on location. The
only difference a user sees is the weight unit, kg or lb, set in Settings.

7. REGULATED INDUSTRY AND THIRD-PARTY MATERIAL
Neither applies. Kratos is a personal fitness tracker, not a medical device, and
gives no medical advice. That is already declared as not a regulated medical
device in App Information. There is no protected third-party material in it: the
exercise library is my own and everything else is the user's own data.

Thanks again. If you need anything else, just ask and I will send it over.
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
