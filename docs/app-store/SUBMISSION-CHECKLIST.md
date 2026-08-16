# Runbook — Final pre-submission checklist for Kratos (App Store Connect, browser)

**Hand this whole file to the executing agent.** It has browser access to App Store Connect and the
human owner (`dhruvsb@icloud.com`) is present. The build is already uploaded, processed, and attached.
This runbook **verifies every field, fixes gaps, and stops for human confirmation before the final
"Add for Review".** It does NOT change the app binary.

## Context (do not re-derive)
- App: **Kratos - Voice Workout Logging** · Apple ID **6801877279** · Bundle `com.dhruvshah.kratos`
- Version: **1.0.0** ("Prepare for Submission") · Build attached: **1.0.0 (2)**
- Start at: https://appstoreconnect.apple.com → **Apps** → **Kratos - Voice Workout Logging**
- Everything below was reportedly completed in earlier sessions — your job is to **confirm it's still
  true**, not assume. Where a value is given, verify it matches exactly.

## Guardrails
- **Never type the human's Apple ID / App Store Connect password.** If re-auth is needed, pause.
- **Do not change** the app name, bundle ID, version number, or the uploaded build.
- **Do NOT click "Add for Review" on your own.** Complete all checks, present a PASS/FAIL summary, and
  **ask the human to confirm**. Only click it if the human explicitly says "submit".
- If any item FAILS and you can't fix it confidently, STOP and report the exact screen text.

---

## The checklist (verify each; ✅ = expected)

### 1. Build attached
**Distribution** tab → the **1.0.0** version → **Build** section.
- ✅ Shows **1.0.0 (2)** (not the empty "Upload your builds…" placeholder). If empty, click **+ / Add
  Build** → select **1.0.0 (2)** → Done, then **Save** (top-right).

### 2. Privacy Policy URL (App-wide)
Left sidebar → **App Information** → General Information → **Privacy Policy URL**.
- ✅ Exactly: `https://dhruvsb.github.io/kratos/legal/privacy-policy.html`
- Open it in a new tab — it must load a real "Kratos — Privacy Policy" page (NOT a 404). If it 404s or
  is blank, STOP (do not submit — 5.1.1(i) rejection).

### 3. Support URL (per-version)
**Distribution** → the 1.0.0 version → scroll to **General Information** → **Support URL**.
- ✅ Exactly: `https://dhruvsb.github.io/kratos/legal/support.html` — open it; must load "Kratos —
  Support" with a contact email (NOT a 404). Marketing URL may be the same URL or blank (optional).

### 4. Screenshots (6.9")
**Distribution** → the 1.0.0 version → **App Previews and Screenshots** (top of the version page).
- ✅ The **6.9" Display** (iPhone) set has **at least 3** screenshots (there should be ~10). No iPad
  screenshots are required (iPhone-only app). If the set is empty, STOP.

### 5. Promotional text / Description / Keywords
Same version page, main metadata area.
- ✅ Description is present (~1,400 chars, describes voice logging, manual logging, routines, library,
  progress, Apple Health import, Hevy import). Keywords present. Promotional text present. Copyright =
  `2026 Dhruv Shah`.

### 6. App Review Information — MOST IMPORTANT (this is what the reviewer uses)
Left sidebar → **App Review** (under General). Verify ALL of:
- ✅ **Sign-In required** is CHECKED.
- ✅ **User name:** `appreview@kratos.app`
- ✅ **Password:** `KratosReview2026!`
  (These credentials were verified working against the backend on 2026-08-16. If the password field is
  blank or different, set it to exactly `KratosReview2026!` and Save.)
- ✅ **Contact:** First `Dhruv`, Last `Shah`, Phone `+91 7874227770`, Email `dhruvsb@icloud.com`.
- ✅ **Notes** are present and explain: (a) sign in with the demo account, (b) the core log loop, and
  (c) that **voice logging records a short clip and sends it to OpenAI** (via a Supabase Edge Function)
  for transcription — so the mic permission is expected. If Notes are empty, add a short version of that.
  - *Optional but helpful:* add one line — "Some iOS permission strings (Photo Library, Speech
    Recognition) are declared because linked SDKs reference those APIs; the shipping features are voice
    logging (OpenAI), manual logging, and read-only Apple Health import."

### 7. App Privacy
Left sidebar → **App Privacy**.
- ✅ Status shows **Published** (not "Get Started"/draft). Data types declared; **nothing marked as used
  for tracking**. If it's still a draft, STOP and tell the human (it must be published to submit).

### 8. Age Rating
**App Information** → **Age Rating**.
- ✅ Shows **4+** (or the questionnaire is completed). If it says "Edit"/incomplete, complete it with all
  "None" answers (no objectionable content) → 4+.

### 9. Pricing & Availability
Left sidebar → **Pricing and Availability**.
- ✅ Price = **Free**. Availability = all / 175 countries.

### 10. Content Rights & EU trader status
- **App Information** → Content Rights: ✅ "does not contain, show, or access third-party content."
- **App Information** (or a banner) → ✅ "identified itself as a **non-trader**" / DSA requirements
  complete. If a DSA/trader banner is unresolved, STOP and tell the human.

### 11. Export compliance
This is usually auto-answered because the binary declares `ITSAppUsesNonExemptEncryption = false`.
- If, when adding the build or submitting, App Store Connect asks **"Does your app use encryption?"** →
  the app uses only standard HTTPS/TLS, which is **exempt**. Answer so that it does **not** require
  documentation (i.e., "uses standard/exempt encryption" → effectively **No** to non-exempt encryption).
  Do not upload any encryption docs.

### 12. Release option
Version page → **Version Release** (bottom).
- ✅ Confirm the human's intent. Default on file: **"Automatically release this version after App Review."**
  If the human wants to release manually, switch to "Manually release." (Either is fine — just confirm.)

---

## Final step — Submit (HUMAN CONFIRMS)
1. Make sure **Save** (top-right) has been clicked if any field was edited (button greys out when saved).
2. Produce a summary: list each of the 12 items as **PASS** or **FAIL/fixed**.
3. **Ask the human: "All 12 checks pass. Shall I click 'Add for Review' to submit for review?"**
4. Only on an explicit "yes": click **Add for Review** (top-right), then complete any final
   questionnaire (Advertising Identifier/IDFA → **No**, since the app has no ads/tracking; export
   compliance as in item 11). Confirm the status changes to **"Waiting for Review."**
5. Report the final status. Done — Apple review typically takes ~24–48h.

## If anything blocks
Capture the exact on-screen text and stop. The most likely blockers and their meaning:
- Build not appearing → still processing; wait and refresh.
- App Privacy still "draft" → must be published first.
- A URL 404s → the hosted page is down; do not submit until it loads.
- Missing purpose-string / binary error → that's a *build* problem, not fixable here; needs a new binary
  (see `BUILD-AND-UPLOAD-RUNBOOK.md`).
