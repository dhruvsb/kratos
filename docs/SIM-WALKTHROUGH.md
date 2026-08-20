# Simulator walkthrough runbook (read before "run it on sim")

How to build, launch, **sign in**, and screenshot the app on the iOS Simulator. This exists so a
session never stalls at the login screen or re-derives the same build fixes. Keep it current.

## Demo login (authorized for walkthroughs)

Kratos is **Dhruv's own showcase app**. The App Store **reviewer demo account** is a project test
fixture created for exactly this purpose — use it to walk the app; do **not** stop and ask him to
type it every time:

- **Email:** `appreview@kratos.app`
- **Password:** `KratosReview2026!`

(Source of truth: [`app-store/SUBMISSION-CHECKLIST.md`](./app-store/) / `CONTEXT.md`. It has seeded
history, so BEST/LAST/progress views are populated.) Requires the live Supabase project + OpenAI
billing to be up. The app persists the session, so once signed in a relaunch stays logged in — but a
**fresh install wipes it**, so a login is needed after each `expo run:ios` reinstall.

Typing tip: the sim's `text` injection occasionally **drops a few trailing characters** — screenshot
after typing each field and re-type the missing tail (tap **SHOW** on the password to verify before
SIGN IN).

## Build + run

```bash
LANG=en_US.UTF-8 npx expo run:ios --configuration Release --device "<sim-udid>"
```

**Build Release, not Debug.** On this machine's toolchain (Xcode 26.x) the Debug build fails at link
with `cannot link directly with 'SwiftUICore' … not an allowed client of it` — an Xcode Debug-**dylib**
regression, unrelated to app code. Release doesn't build the debug dylib and links clean. (This is
also how offline logging was tested — see WORK-LOG 2026-08-06.)

## Known build blockers + fixes (all from the repo having moved out of `~/voice_app`)

The project used to live at `/Users/dhruvshahm1/voice_app`; it's now `/Users/dhruvshahm1/Projects/Kratos`.
Stale absolute paths from the old location cause three failures. If a build breaks with a path
containing `voice_app`, this is why:

1. **Stale module cache** — `error: precompiled file … was compiled with module cache path
   /Users/dhruvshahm1/voice_app/…`. Fix: `rm -rf node_modules/*/apple/.DerivedData` (esp.
   `expo-modules-jsi`). Do **not** also delete `ios/build` — that removes generated React codegen and
   triggers blocker #2.
2. **Missing generated codegen** — `Build input file cannot be found: …/ios/build/generated/…-generated.mm`.
   Happens if `ios/build` was deleted. Fix: `cd ios && LANG=en_US.UTF-8 pod install` (regenerates codegen).
3. **Stale hermesc path** — `…/voice_app/node_modules/hermes-compiler/hermesc/osx-bin/hermesc: No such
   file or directory` during "Bundle React Native code and images". `HERMES_CLI_PATH` in the Pods
   xcconfigs is baked from a **cached** CocoaPods hermes spec. Fix (until the CocoaPods cache is
   cleared): rewrite the prefix in
   `ios/Pods/Target Support Files/Pods-Kratos/Pods-Kratos.{debug,release}.xcconfig` (and
   `ios/Pods/Local Podspecs/hermes-engine.podspec.json`) from `/Users/dhruvshahm1/voice_app` →
   `/Users/dhruvshahm1/Projects/Kratos`. A `pod install` can re-stale these from the cache; a durable
   fix is clearing `~/Library/Caches/CocoaPods` + the hermes prebuilt cache and reinstalling.

## Drive it

Use the `mcp__Claude_Code_iOS_Simulator__control` tools: `attach` (open the panel — call before
building), `screenshot`, `tap`/`text`/`swipe`. Coordinates are device **points** (iPhone 17 Pro =
402×874), origin top-left.
