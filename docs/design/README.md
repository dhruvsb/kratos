# Design canvases (imported from Claude Design)

Reference mockups pulled from the Claude Design project **"Kratos voice-first design"**
(`claude.ai/design/p/638a7d3a-eb58-480e-97ce-09dad5cde661`) so the repo doesn't depend on
the cloud project. These are **design canvases**, not app code — open them in a browser to
view; the RN implementation lives in `src/`.

| File | What it is | Status |
|---|---|---|
| `Kratos-Manual.dc.html` | The **manual-first** design — 11 screens: Home, New Routine, Exercise Picker, Active Workout (set grid), Set Entry Keypad, Rest, Finish Summary, History, Past Workout, Exercise Progress, Library. | **Implemented** (2026-07-30). This is the current app. |
| `Kratos-VoiceFirst-v3.dc.html` | The voice-first design (mic-driven console, correction drawer, floor mode). | **Kept for Phase 2.** Not implemented in the manual-first build; do not delete. |
| `support.js` | The design-canvas runtime both `.dc.html` files load (`<script src="./support.js">`). Generic renderer, not app logic. | Needed for the canvases to render standalone. |

**Theme tokens** used by the implementation are lifted from these canvases into
`src/theme/tokens.ts` (the single source of truth in code). If a design value and a token
ever disagree, the token wins — update the token deliberately, don't hardcode.

Colors (for reference): bg `#05080A`/`#020609`, surfaces `#080C10`/`#0D1318`, text ramp
`#E7EFF4`/`#8798A5`/`#4E5A64`, accent cyan `#4FD8FF`, ok `#5FE3B0`, warn `#FF5647`, heat
`#FF8A3C`. Fonts: Space Grotesk (UI), IBM Plex Mono (numbers).
