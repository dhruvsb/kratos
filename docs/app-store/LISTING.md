# Kratos — App Store Connect Listing Copy

Ready-to-paste metadata for the Kratos 1.0 submission. Every field notes Apple's
character limit and stays inside it. Nothing here claims a feature the app can't back up
(see `docs/CONTEXT.md` / the phase summaries). Pick the **primary** option unless a
reviewer or A/B test says otherwise; alternatives are listed for quick swaps.

Bundle id: `com.dhruvshah.kratos` · iPhone only · Requires an account (email one-time-code sign-in).

---

## 1. App Name  (max 30 characters)

- **Primary:** `Kratos`  *(6)*
- Alt A: `Kratos: Workout Logger`  *(22)*
- Alt B: `Kratos — Lift Tracker`  *(21)*

> Keep the bare `Kratos` as the display name and let the **subtitle** carry the "what it
> does" — a short, clean name reads best on the Home screen and in search.

## 2. Subtitle  (max 30 characters)

- **Primary:** `Speak your sets. Log faster.`  *(28)*
- Alt A: `Voice-first workout log`  *(23)*
- Alt B: `Lift. Log. Repeat.`  *(18)*

## 3. Promotional Text  (max 170 characters)

> Editable any time without a new build — use it for seasonal/feature notes.

`Say your set out loud and it's logged. Kratos is the sleek, offline-first strength tracker that keeps you lifting, not typing.`  *(126)*

## 4. Description  (max 4000 characters — this copy is ~1,510)

```
Log every set at the speed of thought. Kratos is a strength-training tracker built for one thing: getting your workout down and getting back to the bar.

Just say it. Tap the mic, speak your set — "bench press, 80 kilos, 8 reps" — and Kratos transcribes and logs it. No typing between sets.

Or tap it in. A fast set-grid and number keypad log weight, reps, and sets in a couple of taps. Every field pre-fills from your last session, so a repeat workout is mostly confirmation.

BUILT FOR LIFTERS
• Create routines once, start them in a tap
• Weight × reps, bodyweight, weighted-bodyweight, timed holds, and cardio distance — every lift logged in its own terms
• A curated library of 156 exercises with muscle-group tags
• Personal-record tracking, so you always know your best

SEE YOUR PROGRESS
• Per-exercise progress charts
• Day-streak counter with a rolling-weeks heatmap
• A calendar of every session
• Muscle-split breakdowns on each finished workout

DESIGNED TO BE SEEN
• A sleek dark "LED-instrument" theme, plus a warm light theme
• System, light, or dark — your call
• kg or lb on screen, your data stored consistently

YOURS, EVERYWHERE
• Works offline — log without a signal, it syncs when you're back
• Apple Health sync backfills days you trained but forgot to log
• Import and export your history via Hevy CSV — nothing is locked in

Kratos keeps the logging invisible so the training stays front and center. Start your next session in seconds.
```

## 5. Keywords  (max 100 characters, comma-separated, NO spaces after commas)

`gym,workout,fitness,strength,lifting,weight,training,exercise,routine,tracker,voice,reps,muscle,PR`  *(98)*

> No word here repeats the app name or subtitle (Apple already indexes those), and no
> competitor brand names are used (e.g. no "Hevy" — that's a supported import format, not a
> keyword we're allowed to bid on).

## 6. Categories

- **Primary category: Health & Fitness** — it's a workout logger; this is where lifters browse and where fitness-search ranking applies.
- **Secondary category: Sports** — strength training reads as a sport; a reasonable spillover surface with far less "meditation/diet" noise than the alternatives.

## 7. Support URL  (required)

App Store Connect **requires a reachable web page** (not `mailto:`, not a placeholder) where a
user can get help or contact you — Apple rejects listings whose Support URL 404s or is empty.
It does **not** have to be fancy; a single static page with a one-line description and a
contact email is enough.

**Suggested minimal option (you don't have one yet):** publish a one-page site for free via
**GitHub Pages** (e.g. `https://dhruvsb.github.io/kratos/`) or a public **Notion** page.
Minimum content: app name, one sentence on what it does, a support contact
(`dsooseven@gmail.com` or a dedicated alias), and a link to the privacy policy. You already
have `docs/legal/privacy-policy.html` written — host it at the same place and this doubles as
your privacy-policy URL (also required in App Store Connect, and needs a live link).

## 8. Marketing URL  (optional)

Optional — leave blank for 1.0, or point it at the same GitHub Pages / Notion page as Support
if you want a "developer website" link on the product page. No penalty for omitting it.

## 9. Copyright

`2026 Dhruv Shah`

## 10. What's New / Version 1.0 Release Notes

```
Welcome to Kratos 1.0.

Log your lifts by voice or by tap, on a sleek dark or light theme:
• Voice logging — speak a set, it's transcribed and logged
• Fast set-grid + keypad, pre-filled from your last session
• Routines, a 156-exercise library, and personal-record tracking
• Progress charts, a streak heatmap, and a session calendar
• Works offline and syncs later; Apple Health sync; Hevy CSV import/export

Thanks for lifting with us. Feedback is always welcome.
```

## 11. Screenshots

**Current requirement (App Store Connect, 2026).** For a new iPhone-only app you must upload
**one iPhone 6.9-inch display set**; a 6.5-inch set is optional (App Store Connect auto-scales
the 6.9" images down to the smaller devices if you don't provide it). The older 5.5" and 6.7"
required slots have been retired — 6.9" is the single mandatory size.

| Display class | Devices | Portrait pixels | Required? |
|---|---|---|---|
| **6.9"** | iPhone 16 Pro Max / 16 Plus | **1320 × 2868** | ✅ Required (1290 × 2796 also accepted) |
| 6.5" | iPhone 11 Pro Max / XS Max | 1242 × 2688 | Optional (auto-scaled from 6.9" if omitted) |

- **Count:** up to **10** screenshots per display size; ship **4–6** strong ones.
- **Orientation:** portrait (the whole app is portrait).
- **iPad:** **not needed** — Kratos is iPhone-only, so no iPad (12.9"/13") screenshots are required or should be uploaded.
- Capture on the **6.9" simulator or device**, dark theme, with a locked/clean status bar (full battery + signal, consistent time) so the frames look deliberate. Seed showcase data first (`npm run seed:demo`) so no screen is empty.

**Suggested 5-shot sequence** (each with a short overlaid caption idea):

1. **Home / streak** — streak hero + rolling-weeks heatmap + recent history. *Caption: "Your streak, at a glance."*
2. **Active workout logging** — the set-grid mid-session with the keypad, a set being logged. *Caption: "Log a set in two taps."*
3. **Voice logging** — the full-screen recorder / voice preview with parsed sets. *Caption: "Just say your set."*
4. **Progress** — a per-exercise progress chart (or the finish summary with NEW BESTS). *Caption: "Watch every lift climb."*
5. **Calendar** — the month grid / week card of sessions. *Caption: "Every session, on the calendar."*

Optional 6th: **Themes** — a light/dark split or the Settings → Appearance toggle. *Caption: "Dark or light. Your call."*
