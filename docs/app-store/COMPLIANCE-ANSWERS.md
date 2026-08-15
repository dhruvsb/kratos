# App Store Connect — Compliance Answers (Kratos)

**Purpose:** copy-paste-ready answers for every compliance/questionnaire screen you hit when
submitting Kratos for the first time. You have never submitted an app before, so each section
tells you *where* the screen is in App Store Connect, *what Apple asks*, and *exactly what to
click / type*.

**App facts these answers are based on** (all verified in the repo):
- iOS-only, free, requires an account.
- Sign-in = email one-time-code (OTP), no password. (`src/data/auth.ts`)
- Fitness/health content (workouts, sets, PRs, streaks) stored in Supabase Postgres, isolated per
  user by row-level security.
- Voice logging records the mic, base64-encodes the clip, and sends it through a Supabase Edge
  Function to **OpenAI** for speech-to-text + parsing. (`src/data/transcribe.ts`)
- Apple Health: **read-only**, optional, backfills forgotten workout days.
- Third parties: **Supabase** (auth + DB + edge functions) and **OpenAI** (speech-to-text +
  parsing). No analytics / ads / crash-reporting / tracking SDKs. No IDFA. No data sold.
- `ITSAppUsesNonExemptEncryption` is already set to `false` in `app.config.ts`.

> Rule of thumb Apple applies: if data **leaves the device**, it counts as "collected." All of
> Kratos's account, fitness, audio, and user-content data leaves the device (it goes to
> Supabase / OpenAI), so it is **Collected**. The AsyncStorage cache and CSV backups stay on
> device and are **not** collected.

---

## 1. App Privacy ("Nutrition Labels")

**Where:** App Store Connect → your app → **App Privacy** → **Get Started** / **Edit**.

**The two framing questions Apple asks first:**
1. *"Do you or your third-party partners collect data from this app?"* → **Yes.**
   (Supabase and OpenAI are your third-party partners. Even though *you* run the servers, the data
   is processed by these companies, so you must answer Yes and declare the types below.)
2. For each data type you'll be asked: **Is it collected?** → **Linked to the user's identity?** →
   **Used for tracking?** → **What purposes?**

**"Used for Tracking" is No everywhere.** Apple's definition of tracking = linking your data with
data from *other companies'* apps/websites for ads, or sharing it with data brokers. Kratos does
neither — no ad SDK, no analytics SDK, no IDFA, no data sold. Everything is first-party app
functionality. So every single data type below is **Tracking: No**.

**"Linked to identity" is Yes** for the data types Kratos stores, because every row is tied to
the user's account (their `user_id` / email).

### Data types to declare as COLLECTED

| Apple Category → Type | Collected? | Linked to identity? | Used for tracking? | Purpose(s) to check |
|---|---|---|---|---|
| **Contact Info → Email Address** | Yes | Yes | No | **App Functionality**, **Account Management** (email is the login identifier / OTP) |
| **Health & Fitness → Fitness** | Yes | Yes | No | **App Functionality** (workouts, sets, reps, weight, PRs, streaks; plus optional Apple Health import) |
| **Health & Fitness → Health** | Yes | Yes | No | **App Functionality** — check this only because the Apple Health import reads strength-workout summaries. If you'd rather scope tightly, "Fitness" alone is defensible; declaring both is the safe choice. |
| **User Content → Audio Data** | Yes | Yes | No | **App Functionality** (voice recording sent to OpenAI for speech-to-text so the user can log sets by voice) |
| **User Content → Other User Content** | Yes | Yes | No | **App Functionality** (routine names, exercise notes, the parsed transcript text stored in `voice_logs`) |
| **Identifiers → User ID** | Yes | Yes | No | **App Functionality**, **Account Management** (the Supabase account `user_id` that owns every row) |

> Apple has no separate "workout" checkbox — **Health & Fitness → Fitness** is the correct bucket
> for weight/reps/sets/PRs. Add **Health** only for the Apple Health read.

### How the third-party (OpenAI + Supabase) mapping works

When Apple asks *"Do you or your third-party partners collect this data?"* answer **Yes** for the
types above. Concretely:
- **Supabase** stores Email, Fitness/Health, User Content, and the User ID (it hosts your auth +
  database + edge functions). All of it is declared above.
- **OpenAI** receives the **Audio Data** and the transcript text (User Content) to perform
  speech-to-text and parsing. That is exactly why **Audio Data** and **Other User Content** are
  declared as collected. OpenAI uses it only to return the transcription — not for ads or tracking
  — which is why **Tracking: No** still holds.

Apple does **not** ask you to name Supabase/OpenAI inside the label UI, but your **privacy policy
must name them** (see §6). The labels and the policy must agree.

### Data types to declare as NOT COLLECTED

On each of these, leave the box unchecked / choose "Not Collected":

- **Financial Info** (no payments — the app is free)
- **Location** (precise or coarse — none collected)
- **Sensitive Info**
- **Contacts** (the address-book type — not collected; note "Email Address" above is a different type)
- **Browsing History**
- **Search History**
- **User Content → Photos or Videos**, **Customer Support**, **Gameplay Content**, **Emails or Text Messages**
- **Identifiers → Device ID** (no IDFA / advertising identifier)
- **Purchases**
- **Usage Data** (no analytics SDK, so no product-interaction or advertising data)
- **Diagnostics** (Crash Data / Performance Data / Other Diagnostic Data — no crash-reporting SDK)
- **Other Data**

### Click-by-click checklist (beginner version)

1. App Privacy → **Edit** next to "Data Types."
2. "Do you or your third-party partners collect data from this app?" → **Yes, we collect data...**
3. Check exactly these six boxes: **Email Address**, **Fitness**, **Health**, **Audio Data**,
   **Other User Content**, **User ID**. Leave everything else unchecked.
4. For **each** of the six, on the next screens:
   - Purposes → check **App Functionality** (and also **Account Management / Other** for Email &
     User ID). Do **not** check Analytics, Advertising, Product Personalization, or Developer's
     Advertising/Marketing.
   - "Is this data linked to the user's identity?" → **Yes.**
   - "Is this data used to track the user?" → **No.**
5. **Publish** the label. It must match your privacy policy (§6).

---

## 2. Age Rating Questionnaire

**Where:** App Store Connect → your app → **Age Rating** → **Edit** (or in the version's General
tab). Apple's current questionnaire asks you to rate the *frequency/intensity* of each content
type. For Kratos the answer is **None / No** to everything.

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | **None** |
| Realistic Violence | **None** |
| Prolonged Graphic or Sadistic Realistic Violence | **None** |
| Profanity or Crude Humor | **None** |
| Mature/Suggestive Themes | **None** |
| Horror/Fear Themes | **None** |
| Medical/Treatment Information | **None** (workout logging is fitness self-tracking, not medical advice/treatment info) |
| Alcohol, Tobacco, or Drug Use or References | **None** |
| Sexual Content or Nudity | **None** |
| Graphic Sexual Content and Nudity | **None** |
| Gambling (simulated) | **None** |
| Contests | **None** |
| Unrestricted Web Access | **No** (the app has no in-app browser) |
| Gambling and Contests / Real gambling | **No** |
| Does your app make it possible for users to interact / share content with the public? (user-generated content, social) | **No** (data is private to the user's own account; no social feed) |
| Age Assurance / Kids Category | Do **not** enroll in the Kids Category. |

**Resulting rating: 4+.**

---

## 3. Export Compliance (Encryption)

**Where:** Asked at **build upload** time and/or in App Store Connect → your version →
**Export Compliance**. Because `ITSAppUsesNonExemptEncryption` is already declared, the manual
prompt is normally auto-answered — but here's what to say if you're ever asked.

- **"Does your app use encryption?"** → **Yes** (the app uses HTTPS/TLS to talk to Supabase and
  OpenAI).
- **"Does your app qualify for the exemptions in Category 5, Part 2?"** → **Yes.** Kratos only
  uses **standard encryption**: HTTPS/TLS provided by iOS and the platform, plus Apple/OS-level
  data protection. It implements **no proprietary or non-standard cryptography**.
- Because it's standard/exempt encryption, you do **not** need a **CCATS** classification or a
  self-classification report (ERN) filing with BIS. The exemption covers it.

**Already handled in code:** `app.config.ts` sets `ITSAppUsesNonExemptEncryption: false`, which
Expo writes into `Info.plist`. This makes every upload auto-answer the encryption question as
"exempt," so you should not see the interactive prompt at all. If Apple's UI still asks, answer
as above. Do **not** change this flag to `true` unless you add custom (non-standard) cryptography.

---

## 4. Content Rights

**Where:** App Store Connect → your version → **App Review Information** → **Content Rights**
(also appears as a checkbox during submission).

- **"Does your app contain, show, or access third-party content?"** → **No.**
- Kratos's content is the user's own workout data plus your own curated exercise list. It does
  not display third-party media, music, video, or licensed content. Check the box confirming you
  have all necessary rights to the content in the app.

---

## 5. App Review Information

**Where:** App Store Connect → your version → **App Review Information**.

### 5a. Demo account / Sign-In (required — the app requires login)

Kratos uses **email OTP with no password**, so a reviewer *cannot* receive a code sent to your
inbox. You must give them credentials that work without checking any mailbox. Do this:

**Set up a test OTP in Supabase** (one-time, before you submit):
1. Supabase Dashboard → **Authentication** → **Providers / Email** (or **Auth → Settings**).
2. Find **Test OTP** / **Test phone/email numbers** and add a fixed pair, e.g.:
   - Email: `appreview@kratos.app`
   - OTP code: `123456`
   This makes that exact email always accept that exact 6-digit code, with **no email actually
   sent**. Make sure the user record exists (sign in once yourself, or let `shouldCreateUser`
   create it) and, ideally, seed it with a couple of sample workouts so the reviewer sees content.

**Then, in App Store Connect App Review Information, turn ON "Sign-In required" and fill:**

| Field | Value |
|---|---|
| Sign-in required | **Yes** (toggle on) |
| User name | `appreview@kratos.app` |
| Password | `123456` |

> App Store Connect only gives you "User name" and "Password" fields, so we reuse them: put the
> **test email** in User name and the **fixed OTP code** in Password. Then explain it in the notes
> (below) so the reviewer knows to *type the "password" as the one-time code on the OTP screen*,
> not on a password field.

### 5b. Review Notes (ready to paste)

```
Kratos is a workout logger. Sign-in uses a one-time email code (OTP) — there is NO
password field.

HOW TO SIGN IN (a test account is pre-configured, no email inbox needed):
1. On the sign-in screen, enter the email:  appreview@kratos.app
2. Tap "Send code."
3. On the code screen, enter this fixed 6-digit code:  123456
   (This is a Supabase test OTP that always works for this email — no real email is sent.
   The "Password" field in App Review Information contains this same code.)

CORE LOOP TO REVIEW:
- From Home, tap "Start" (or pick a routine) → add exercises → log weight × reps × sets using
  the set grid and on-screen keypad → tap "Finish" for the summary. History and per-exercise
  weight trends are in the History tab.

VOICE LOGGING (microphone use):
- On the logging screen, the mic button records a short voice clip (e.g. "bench press 80 kilos
  for 8 reps"). The recording is sent over HTTPS through our Supabase Edge Function to OpenAI,
  which transcribes the speech to text and parses it into sets. This is the only reason the app
  requests microphone access, and audio is used solely to provide this feature.

OTHER NOTES:
- No special hardware is required; everything works on a standard iPhone / simulator.
- Apple Health is OPTIONAL. If you allow it, the app reads (read-only) your recent
  strength-workout summaries to fill in days you forgot to log. Declining Health does not
  block any feature.
- Weights are shown in kg by default (changeable in Settings).
- The app is free with no in-app purchases.
```

### 5c. Contact info (fill these in)

| Field | Value |
|---|---|
| First name | `__________` |
| Last name | `__________` |
| Phone number | `__________` |
| Email address | `__________` (a monitored inbox — Apple uses this to reach you about the review) |

---

## 6. Callout: Privacy Policy MUST disclose OpenAI (and match the labels)

**✅ Policy content already fixed (2026-08-15).** `docs/legal/privacy-policy.html` was updated in
this session to name **OpenAI** as a processor, disclose that recorded audio is transmitted to it
for transcription, and describe the optional Apple Health read. The only remaining step is to
**host the file at a public URL** and paste that URL into App Store Connect → App Information →
Privacy Policy URL (a privacy-policy URL is required to submit). The rationale below is kept for
reference — it is *why* the fix mattered:

- Apple requires your privacy policy to disclose all third-party **sub-processors** that receive
  user data. Audio and transcripts leave your servers and go to **OpenAI** — that has to be stated.
- Your App Privacy labels (§1) declare **Audio Data** and **User Content** as collected; the policy
  has to explain *who* processes them. Labels and policy must agree, or review can reject you.

**Make sure the hosted policy explicitly:**
1. Names **Supabase** (auth, database, edge-function hosting) as a processor.
2. Names **OpenAI** as a processor for **speech-to-text and transcript parsing**, and states that
   **recorded audio is transmitted to OpenAI** to provide voice logging, used only to deliver the
   feature (not for ads/tracking), and that a transcript may be stored.
3. States there is **no analytics/ads/tracking SDK**, no IDFA, and no sale of data.
4. Confirms account deletion is available in-app (the app already ships
   `delete_own_account`), which also satisfies Guideline 5.1.1(v).

Then re-host the updated policy and confirm the URL loads publicly before you hit **Submit**.

---

### Quick pre-submit checklist

- [x] Privacy policy updated to name **OpenAI** + Supabase and describe audio handling (done 2026-08-15). — [ ] still to do: **host it** and confirm the URL loads publicly.
- [ ] App Privacy labels published: Email, Fitness, Health, Audio Data, Other User Content, User
      ID — all *Linked = Yes, Tracking = No, Purpose = App Functionality* (+ Account Mgmt for
      Email/User ID).
- [ ] Age rating completed → **4+**.
- [ ] Export compliance = exempt (already set via `ITSAppUsesNonExemptEncryption: false`).
- [ ] Content Rights = No third-party content.
- [ ] Supabase test OTP configured (`appreview@kratos.app` / `123456`) and seeded with sample data.
- [ ] App Review Information: Sign-In required ON, username/password + notes filled, contact info filled.
```
