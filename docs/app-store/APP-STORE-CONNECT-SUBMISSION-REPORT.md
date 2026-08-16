# Kratos — App Store Connect Submission Report

**Generated:** 2026-08-16 · **App:** Kratos - Voice Workout Logging · **Apple ID:** 6801877279 · **Bundle ID:** `com.dhruvshah.kratos` · **Version:** 1.0 · **Status:** Prepare for Submission

This report documents every field entered and option selected in App Store Connect this session, re-verified live (fresh page loads, not cached) immediately before writing this report. **Nothing has been submitted — "Add for Review" was never clicked.** Review this, then submit yourself whenever you're ready.

---

## 1. App Information

| Field | Value |
|---|---|
| Name | `Kratos - Voice Workout Logging` (kept as-is, per your explicit choice — not changed to "Kratos" + subtitle) |
| Subtitle | *(blank, per your explicit choice)* |
| Bundle ID | `com.dhruvshah.kratos` |
| SKU | `kratos-ios-01` |
| Primary Category | Health & Fitness |
| Secondary Category | Sports |
| Content Rights | "No, this app does not contain, show, or access third-party content." |
| License Agreement | Apple's Standard License Agreement (default) |
| **Regulated Medical Devices** | **Already declared: "not a regulated medical device in any country or region."** (This banner appeared transiently in an earlier check but is fully resolved — no action needed.) |
| Age Rating | **4+** in 172 countries/regions, with regional-label variants: Brazil = AL, Korea = ALL, Vietnam = 00+ (these are Apple's local display equivalents of the same 4+ rating, not different ratings) |

## 2. Version 1.0 — Product Page Metadata

| Field | Value |
|---|---|
| Promotional Text | "Say your set out loud and it's logged. Kratos is the sleek, offline-first strength tracker that keeps you lifting, not typing." (126 chars) |
| Description | Full ~1,460-character description as drafted in `LISTING.md` — voice logging, tap logging, routines, exercise library, progress charts, streaks, calendar, themes, offline sync, Apple Health, Hevy CSV import/export. Verified intact and unchanged. |
| Keywords | `gym,workout,fitness,strength,lifting,weight,training,exercise,routine,tracker,voice,reps,muscle,PR` (98 chars) |
| Support URL | `https://dhruvsb.github.io/kratos/legal/support.html` |
| Marketing URL | `https://dhruvsb.github.io/kratos/legal/support.html` (same as Support URL — optional field, pointed at the same page) |
| Copyright | `2026 Dhruv Shah` |
| Version String | `1.0` |
| Screenshots | **0 of 10 uploaded — not started** (see Pending below) |
| Release Type | "Automatically release this version after approval" selected |

## 3. App Review Information

| Field | Value |
|---|---|
| Sign-in required | ✅ Checked |
| Demo account email | `appreview@kratos.app` |
| Demo account password | `KratosReview2026!` |
| Contact first/last name | Dhruv Shah |
| Contact phone | `+91 7874227770` |
| Contact email | `dhruvsb@icloud.com` |
| Review Notes | Full instructions saved (1,365 characters): how to sign in, the core logging loop to test, how voice logging works and why the mic permission is requested (HTTPS → Supabase Edge Function → OpenAI transcription), plus additional reviewer notes. Verified intact. |

## 4. App Privacy

**Status: Published** (11 hours ago, by Dhruv Shah). Privacy Policy URL: `https://dhruvsb.github.io/kratos/legal/privacy-policy.html`.

6 data types declared, all **Linked to the user's identity = Yes**, and **none** marked for tracking:

| Data Type | Purpose(s) |
|---|---|
| Email Address | Other Purposes, App Functionality |
| Health | App Functionality |
| Fitness | App Functionality |
| Audio Data | App Functionality |
| Other User Content | App Functionality |
| User ID | Other Purposes, App Functionality |

## 5. Pricing and Availability

| Field | Value |
|---|---|
| Price | Free ($0.00) — Base country United States (USD) |
| Availability | All 175 countries/regions |

## 6. Business / EU Digital Services Act (DSA)

**Status: Complete.** Declared **non-trader** for this app. Confirmed on the Business → Agreements page: "Digital Services Act Compliance — You have completed all regulatory requirements at this time," Active across 27 EU countries/regions. Also independently confirmed on the App Information page: "This developer has identified itself as a non-trader for this app."

---

## Re-verification method

Every value above was pulled directly from App Store Connect on a **fresh page load** in this session (not relying on memory or a stale tab), via direct DOM reads of the actual form field values — not just visual screenshots — so what's listed here is exactly what's stored on Apple's servers. The global "Save" button was greyed out (no pending unsaved changes) on every page checked.

---

## Pending — still needs you before you can submit

1. **Screenshots (blocker).** 0 of 10 uploaded for the required 6.9"/6.5" iPhone display set. Needs the app running on a 6.9" simulator (iPhone 16 Pro Max) with demo data seeded (`npm run seed:demo`), per the 5-shot sequence in `LISTING.md` §11.
2. **EAS build & upload (blocker).** No build has been created/uploaded yet — Step 3 in `APP-STORE-LAUNCH-LOG.md` (`eas build -p ios --profile production && eas submit -p ios --latest`), needs your terminal + Apple Developer login. Without a build attached, there's nothing for "Add for Review" to actually submit.
3. **Device testing (strongly recommended, not a blocker).** No real end-to-end pass yet — sign-in from scratch, the full logging loop, and especially a **real spoken voice-logging test** (the eval for this was never run, per the launch log's loose ends). Worth confirming before submission since the listing advertises voice logging prominently.
4. **App Encryption Documentation** — not required to act on now; `ITSAppUsesNonExemptEncryption: false` is already baked into `app.config.ts`, so this should auto-resolve on build upload. Just flagging it's the one remaining item on the App Information page that shows an "Upload" prompt (it's optional/conditional, not a hard blocker).
5. **Submit.** Once the build is uploaded and screenshots are in, everything else above is already saved and ready — you just need to review it yourself and click **Add for Review**.

Nothing in sections 1–6 needs further action from either of us — it's all saved and verified. Items 1–3 above are the real remaining work, and they all require your Mac/terminal/device, which I can't do through the browser.
