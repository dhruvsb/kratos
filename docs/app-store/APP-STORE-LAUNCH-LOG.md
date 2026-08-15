# Kratos — App Store Launch Log & Remaining-Steps Guide

**Date:** 2026-08-15 · **Goal:** get Kratos submitted to the App Store with full compliance
and the best possible chance of a clean, fast approval.

This one file is the record of the pre-launch compliance pass: **(A)** what was done for you in the
code/docs, **(B)** the decisions taken and why, and **(C)** a beginner-friendly, step-by-step guide
to everything only *you* can finish (the parts that need your Apple, Supabase, and hosting logins).

Companion files (ready to copy-paste when you reach those screens):
- [`LISTING.md`](./LISTING.md) — every text field for the App Store product page (name, subtitle,
  description, keywords, categories, screenshots spec).
- [`COMPLIANCE-ANSWERS.md`](./COMPLIANCE-ANSWERS.md) — every questionnaire answer (privacy labels,
  age rating, export compliance, review notes, demo-account recipe).

---

## A. What was done for you this session (no action needed)

| # | Change | File | Status |
|---|---|---|---|
| 1 | **Export-compliance flag** added so every upload auto-answers the encryption question (standard HTTPS only → exempt). No more manual prompt per build. | `app.config.ts` (`ITSAppUsesNonExemptEncryption: false`) | ✅ done, `tsc` green |
| 2 | **Privacy policy rewritten to be truthful** — now discloses that voice audio is sent to **OpenAI** for transcription, names **both** processors (Supabase + OpenAI), and describes the optional **Apple Health** read. The old version wrongly said "no audio" and "Supabase is the only third party" — that mismatch would have failed review. | `docs/legal/privacy-policy.html` | ✅ done (rendered-checked) |
| 3 | **App Store listing copy** drafted and fitted to Apple's character limits. | `docs/app-store/LISTING.md` | ✅ done |
| 4 | **All compliance-questionnaire answers** drafted (privacy labels, age rating, export, content rights, review notes, demo-account recipe). | `docs/app-store/COMPLIANCE-ANSWERS.md` | ✅ done |

**Verification run:** `tsc --noEmit` → exit 0 (clean) after the config change. Privacy policy
rendered in a browser to confirm the new sections read correctly.

---

## B. Decisions taken (and why)

1. **Kept the microphone permission / `expo-speech-recognition` in the build.** An earlier read of
   the docs suggested voice was "unwired" and the mic permission was unused (a rejection risk). That
   was **wrong**: the code has `MOCK_VOICE = false` and the Home mic button drives a **real,
   reviewer-reachable** voice-logging flow (`record.tsx` → `expo-audio` → transcribe edge function →
   OpenAI). Removing the permission would have **broken a shipping feature**. → No change; the mic
   permission is legitimate and its purpose string is clear.

2. **Declared audio + OpenAI everywhere.** Because voice ships live and sends audio off-device to a
   third party, the privacy policy and the App Privacy labels must say so. This is the single most
   important correctness fix in this pass.

3. **Export compliance = exempt** (`ITSAppUsesNonExemptEncryption: false`). The app uses only
   standard platform HTTPS/TLS — no custom cryptography — which is exempt. No CCATS/ERN filing needed.

4. **Category:** Health & Fitness (primary) + Sports (secondary).

5. **Age rating:** 4+ (no objectionable content; data is private to the user, no social feed, no web
   browser).

6. **App name stays `Kratos`; subtitle "Speak your sets. Log faster."** — short name reads best;
   the subtitle carries the "what it does." Alternatives are listed in `LISTING.md`.

7. **Reviewer access via a real email + password demo account.** The app now uses email + password
   sign-in (a one-time email code exists only for password recovery), so the reviewer just needs a
   dedicated demo account's email + password, entered in App Store Connect's App Review Information.
   Still a **hard blocker** — the app requires login — but simpler than the earlier test-OTP
   workaround. (Updated 2026-08-15 when auth switched from code-only to email + password.)

---

## C. Remaining steps — YOUR to-do list (beginner-friendly)

These need your Apple Developer / App Store Connect / Supabase / web-hosting logins, so they can't be
automated. Do them roughly in this order. **Bold = a hard blocker** (submission fails without it).

### Step 1 — Host the privacy policy + a support page (≈20 min) **[BLOCKER]**
Apple requires two *live, public* web pages: a **Privacy Policy URL** and a **Support URL**. A 404 =
rejection. Easiest free route:
1. Create a free **GitHub Pages** site (or a public Notion page).
   - GitHub: make a public repo, put `privacy-policy.html` (from `docs/legal/`) in it, enable
     Settings → Pages. Your URL becomes something like
     `https://dhruvsb.github.io/kratos/privacy-policy.html`.
2. Add a tiny **support page** on the same site: app name, one line on what it does, and a contact
   email. That page's URL is your **Support URL**.
3. Open both URLs in a browser to confirm they load. Keep them handy for Step 5.

### Step 2 — Create the reviewer demo account (≈10 min) **[BLOCKER]**
Follow `COMPLIANCE-ANSWERS.md` §5a. In the app, tap **Create account** and register a dedicated
demo login (e.g. `appreview@kratos.app` + a strong password). Confirm its email if your Supabase
project requires it, sign in once, and seed it with a few workouts so the reviewer sees content
(`npm run seed:demo` against that account). You'll paste this email + password into App Store
Connect's App Review Information.

### Step 3 — Build the app and upload it to App Store Connect (≈45–60 min first time)
Use the EAS route from our earlier chat (it also creates the app record for you):
```bash
npm install -g eas-cli && eas login
eas build:configure
eas build -p ios --profile production && eas submit -p ios --latest
```
Before this, make sure the Supabase env vars are pushed to EAS (`eas env:create` for `SUPABASE_URL`
and `SUPABASE_ANON_KEY`), or the cloud build ships without credentials and can't sign in. (This is
already on your pending list in `docs/CONTEXT.md`.)

### Step 4 — Take screenshots (≈30 min)
Apple needs **one 6.9-inch iPhone set** (1320 × 2868). See `LISTING.md` §11 for the exact 5-shot
sequence and captions. Run the app on the **6.9" simulator** (iPhone 16 Pro Max), seed demo data
first (`npm run seed:demo`), and capture Home, active logging, voice logging, a progress chart, and
the calendar.

### Step 5 — Fill in App Store Connect (≈45 min) **[BLOCKER for each required field]**
In App Store Connect → your app:
1. **App Information:** paste name, subtitle, categories, and the **Privacy Policy URL** (Step 1).
2. **Pricing:** Free.
3. **Prepare for Submission (the version page):** paste the **Description**, **Keywords**,
   **Promotional Text**, **What's New**, **Support URL**, screenshots (Step 4), **Copyright**.
   → all from `LISTING.md`.
4. **App Privacy:** publish the labels from `COMPLIANCE-ANSWERS.md` §1 (Email, Fitness, Health,
   Audio Data, Other User Content, User ID — all *Linked = Yes, Tracking = No*).
5. **Age Rating:** answer per §2 → 4+.
6. **App Review Information:** turn **Sign-In required ON**, enter the demo email/code, paste the
   **review notes** (§5b), fill your **contact info** (§5c).
7. **Content Rights:** No third-party content (§4).
8. **Export Compliance:** should auto-answer as exempt; if asked, answer per §3.

### Step 6 — Sort out EU trader status (≈10 min)
The banner you saw in App Store Connect: under the EU Digital Services Act you must declare a
**trader status** or the app is removed in the EU. As an individual hobby/showcase developer you can
declare **non-trader**, *or* exclude the EU from distribution. Do this in **App Store Connect →
Business** (or the banner's "Learn More"). Pick one; don't leave it blank.

### Step 7 — Test the whole app on a real device before submitting (≈30 min) **[STRONGLY RECOMMENDED]**
A crash or a broken feature during review = rejection. Your build has never been fully walked on
hardware. Do a clean install and verify:
- **Real sign-in from scratch** (create account → email + password → sign in; and try "Forgot
  password?" → recovery code → set a new password).
- **Full manual loop:** start a routine → log sets → finish → History → a progress chart.
- **Voice logging actually works end-to-end** — this matters a lot now, because your listing
  advertises it and the reviewer *will* test it. ⚠️ `docs/CONTEXT.md` notes the voice model IDs were
  never verified against the real API and the eval was never run. **Confirm a real spoken set gets
  transcribed and logged** before you submit; if the OpenAI pipeline errors, the reviewer sees a
  broken headline feature.
- **Delete account** row (use a throwaway account, not your main one).

### Step 8 — Submit for review
Hit **Add for Review → Submit**. First reviews typically take 24–48h. If rejected, the reason is
usually specific and fixable — send it to me and we'll turn it around.

---

## Notes / loose ends flagged for later
- `docs/CONTEXT.md` still says `MOCK_VOICE=true`; the **code says `false`** (voice is live). The doc
  line is stale — corrected understanding is recorded here.
- iOS-only scaffolding cleanup (Android/web blocks) is **not** required for approval — deferred.
- If you ever add real (non-standard) cryptography, flip `ITSAppUsesNonExemptEncryption` back to
  `true` and file the export paperwork.
