# Runbook — Build & upload Kratos to App Store Connect (local Xcode)

**Hand this whole file to the executing agent.** It is self-contained. The agent has computer-use
access to this Mac and its apps (Xcode, browser). The human owner (Apple ID `dhruvsb@icloud.com`) is
present to type any password when prompted — the agent must **never** type Apple/App-Store passwords
itself; pause and let the human enter them.

## Goal
Produce an App Store distribution build of the app and upload it to App Store Connect so it can be
attached to the existing **1.0** version and submitted for review. Screenshots and all metadata are
already done — this runbook is **only** the build + upload.

## Fixed facts (do not re-derive)
- Project root: `/Users/dhruvshahm1/voice_app`
- Xcode workspace: `ios/Kratos.xcworkspace`  · Scheme: `Kratos`  · Config: `Release`
- Bundle identifier: `com.dhruvshah.kratos`
- App in App Store Connect: **Kratos - Voice Workout Logging**, Apple ID **6801877279**, version **1.0** ("Prepare for Submission")
- Marketing version: `1.0` · Build number (CURRENT_PROJECT_VERSION): `1` (fine for the first upload)
- Apple ID / owner: `dhruvsb@icloud.com` — has a **paid** Apple Developer Program membership.

## Known snag #1 — signing team (MUST fix before archiving)
The Xcode project currently signs with `DEVELOPMENT_TEAM = TUR974K866`, which is the **free Personal
Team**. A free team **cannot** create App Store builds. Switch the target to the **paid** team
(the one in Xcode's Team dropdown that does NOT say "(Personal Team)").

## Known snag #2 — Supabase env vars must be embedded (verify, don't assume)
The app reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` from the project-root `.env` at build time
(`app.config.ts` → `extra`). If they aren't embedded, the shipped app has empty credentials and
**no one can sign in**. A Release build has been observed to embed them correctly, but you MUST
verify after archiving (see Step 5). Do not skip this check.

## Known snag #3 — the committed `ios/` folder is STALE (MUST regenerate before archiving)
A separate compliance audit (`PRE-SUBMISSION-AUDIT.md`, same session date) fixed four native
Info.plist issues purely in config (`app.config.ts` + `plugins/withIosPrivacyCleanup.js`): removed
an unused `UIBackgroundModes: [audio]` entry (2.5.4 risk), a HealthKit **write** permission string
on a read-only feature (5.1.3 risk), a dead speech-recognition permission string, and a dead motion
permission string. **None of these fixes are in the committed `ios/` folder** — it's gitignored and
was generated before the fixes existed. Archiving directly from `ios/Kratos.xcworkspace` as-is (Step
1 below) would silently re-ship all four already-fixed problems.
**Fix: before opening Xcode (Step 1), regenerate the native project from the current config:**
```bash
cd /Users/dhruvshahm1/voice_app
LANG=en_US.UTF-8 npx expo prebuild -p ios --clean
```
Only proceed to Step 1 after this completes without error. (The audit's own preferred path is an
EAS cloud build instead of local Xcode archiving, since EAS always prebuilds fresh — if EAS is
available and preferred, use `eas build -p ios --profile production` instead of Steps 1–6 entirely.
Steps 1–6 below are the local-Xcode fallback and are safe **only** with this prebuild step first.)

---

## Step 0 — Preconditions (agent runs these, reports results)
```bash
cd /Users/dhruvshahm1/voice_app
test -f .env && grep -q '^SUPABASE_URL=' .env && grep -q '^SUPABASE_ANON_KEY=' .env && echo "ENV OK" || echo "ENV MISSING — STOP"
ls -d ios/Kratos.xcworkspace && echo "WORKSPACE OK"
```
If either check fails, STOP and report.

## Step 1 — Confirm the paid team in Xcode
1. Open Xcode: `open /Users/dhruvshahm1/voice_app/ios/Kratos.xcworkspace`
2. **Xcode ▸ Settings ▸ Accounts**. Ensure `dhruvsb@icloud.com` is listed. If not, click **+ ▸ Apple ID**
   and let the **human** sign in (agent must not type the password).
3. Select the account; in the right-hand **Team** list, identify the team **without** "(Personal Team)".
   Record its name/Team ID. This is the paid team.

## Step 2 — Set signing to the paid team
1. Project navigator ▸ blue **Kratos** project ▸ **TARGETS ▸ Kratos** ▸ **Signing & Capabilities** tab.
2. Ensure **Automatically manage signing** is checked.
3. In **Team**, choose the paid team from Step 1.
4. Wait for Xcode to create the "Apple Distribution" cert + provisioning profile. If a red error
   appears, capture the exact text and STOP.

## Step 3 — Select the archive destination
Top toolbar destination selector ▸ **Any iOS Device (arm64)** (NOT a simulator — Archive is disabled
for simulators).

## Step 4 — Archive
**Product ▸ Archive.** Wait for completion (~3–8 min). The **Organizer** opens with the new archive.
If the build fails, capture the first red error and STOP.

## Step 5 — VERIFY embedded Supabase config (critical)
Before uploading, confirm the archived app actually contains the Supabase URL + anon key:
```bash
ARCH=$(ls -td ~/Library/Developer/Xcode/Archives/*/*.xcarchive 2>/dev/null | head -1)
APP="$ARCH/Products/Applications/Kratos.app"
grep -aoE "amonovkkjohvlkjlfsit|supabaseUrl|supabaseAnonKey" "$APP/EXConstants.bundle/app.config" | sort -u
```
Expect to see the host (`amonovkkjohvlkjlfsit`) and both keys. If the host is MISSING, the build shipped
without credentials — STOP, do not upload; the fix is to ensure `.env` is present and re-archive
(if needed, prefix the build with the env exported: rebuild via
`set -a; source .env; set +a` in the shell that launches Xcode, or bake the values into `eas`/CI env).

## Step 6 — Distribute to App Store Connect (needs Apple auth — human types passwords)
In the Organizer:
1. Select the archive ▸ **Distribute App**.
2. Choose **App Store Connect** ▸ **Next**.
3. Choose **Upload** ▸ **Next**.
4. Keep default options (Automatically manage signing / include symbols) ▸ **Next**.
5. Review ▸ **Upload**. If prompted to authenticate to App Store Connect, let the **human** complete it.
6. Wait for "Upload Successful."

## Step 7 — Confirm it landed
The build takes ~5–15 min to finish processing on Apple's side. Verify at
`https://appstoreconnect.apple.com` ▸ Apps ▸ Kratos - Voice Workout Logging ▸ (version 1.0) ▸
**Build** section — the new build (1.0 (1)) should appear once processed (may first show
"Processing"). No further action in this runbook.

---

## Guardrails for the agent
- Never type Apple ID / App Store Connect / app-specific passwords — pause and let the human owner type them.
- Do not change the bundle identifier, version, or metadata.
- Do not submit for review (do not click "Add for Review") — this runbook stops at "build uploaded."
- If any step errors, capture the exact message and stop rather than guessing.
- Screenshots (11 PNGs) exist locally in `/Users/dhruvshahm1/voice_app/app-store-screenshots/` but are
  **not yet uploaded to App Store Connect** as of this writing — uploading them is not this runbook's
  job (it's a metadata/media task, not a build task), but don't assume they're already there.

## If the GUI path stalls (optional CLI fallback, advanced)
Only if Xcode GUI archiving is blocked. Requires the paid team's 10-char Team ID (`<TEAMID>`) and an
App Store Connect **API key** (`.p8` + Key ID + Issuer ID) created by the human at
App Store Connect ▸ Users and Access ▸ Integrations ▸ App Store Connect API.
```bash
cd /Users/dhruvshahm1/voice_app/ios
xcodebuild -workspace Kratos.xcworkspace -scheme Kratos -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Kratos.xcarchive \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=<TEAMID> archive
# then create an ExportOptions.plist (method: app-store-connect) and:
xcodebuild -exportArchive -archivePath build/Kratos.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export -allowProvisioningUpdates
# then upload the .ipa:
xcrun altool --upload-app -f build/export/Kratos.ipa -t ios \
  --apiKey <KEYID> --apiIssuer <ISSUERID>
```
Prefer the GUI path (Steps 1–6) unless it is genuinely blocked. This CLI path also builds from the
local `ios/` folder — Known snag #3's `expo prebuild --clean` step is required here too, before
running `xcodebuild archive`.
