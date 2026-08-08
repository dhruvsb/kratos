# Handoff: RepVoice light mode ("Greige + Moss", option 2a)

## Overview
RepVoice is a thumb-only weightlifting logger. It currently ships a dark theme. This handoff
defines the **light theme** — a warm off-white ("greige") ground with a moss-green accent.

It is a **theme change, not a redesign**: layout, type, spacing, copy and component structure are
unchanged from the existing dark build. The work is (1) replacing the color token values and
(2) applying four component rules that are not a straight token swap (see "Not a straight swap").

## About the design files
The HTML files in this bundle are **design references** — prototypes showing intended look, not
production code to copy. Recreate them in the app's existing environment using its established
patterns. Open `RepVoice Light Options.dc.html` in a browser to see all explorations; the
**top row, option `2a`** is the approved one. `RVHomeLight`, `RVLogLight` and `RVRestLight` open
standalone and are already toned to 2a.

## Fidelity
**High fidelity.** Colors, type and spacing are final. Match them exactly.

## Design tokens — the whole spec

Every screen draws from these. Name them however the codebase names things; the mapping matters,
not the names.

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#EBE8E1` | app/page ground behind cards; also the "surface" the phone sits on |
| `--s0` | `#FBF7F0` | primary card / screen background |
| `--s1` | `#F5F1E9` | raised block (Up-next card, rest bar, bottom sheets) |
| `--sin` | `#F6F3EC` | inset panel (the set grid) |
| `--line` | `rgba(60,50,38,.11)` | hairline dividers, list separators |
| `--line2` | `rgba(60,50,38,.20)` | container borders, inactive control borders |
| `--t1` | `#2A2118` | primary text, entered values |
| `--t2` | `#6B6156` | secondary text, completed set values |
| `--t3` | `#A29A8E` | labels, meta, disabled/upcoming values |
| `--acc` | `#3F6B3B` | accent: current set, CTAs, active tab, timers, PR marks |
| `--on-acc` | `#FFFFFF` | text/icons on a solid accent fill |
| `--acc-06` | `color-mix(in oklab, var(--acc) 7%, transparent)` | current-set row wash |
| `--acc-14` | `color-mix(in oklab, var(--acc) 16%, transparent)` | active chip fill, logged-day cells |
| `--acc-30` | `color-mix(in oklab, var(--acc) 34%, transparent)` | accent hairlines, week-strip marks |
| `--ok` | `#3F6B3B` | completed ✓ (same hue as accent by design) |
| `--warn` | `#B23A2A` | destructive: delete set / delete workout |
| `--sh` | `0 26px 54px -32px rgba(70,58,40,.45)` | card elevation (warm, never black) |

No-JS fallback if `color-mix` is unavailable: `--acc-06 #F0F3EF`, `--acc-14 #E4EBE2`,
`--acc-30 #C6D4C4` (opaque equivalents over `#FBF7F0`).

Typography and radii are unchanged from dark mode: **Instrument Sans** for UI text,
**Geist Mono** for every number, label and status string; radii 40px (phone frame), 16px (cards),
10–12px (buttons/fields), 7–8px (chips).

## Not a straight swap — four rules

1. **Primary CTAs are a solid accent fill.** Dark mode used a dark fill with an accent border and
   accent text; on light that reads as disabled. Light: `background: --acc`, `color: --on-acc`,
   no border. Applies to START WORKOUT, LOG SET, NEXT EXERCISE, SAVE ROUTINE, DONE, RESUME, SKIP.
2. **The current set's ✓ is a filled accent chip** (`background: --acc`, `color: --on-acc`).
   Already-completed sets keep a plain `--ok` glyph on no fill; upcoming sets keep a `--line2`
   outline with a `--t3` glyph. This is the only place three ✓ states coexist — keep them distinct.
3. **Borders and dividers are warm brown-black alphas** (`rgba(60,50,38,…)`), never grey or the
   dark theme's blue-white alphas. Same for shadows: warm, low opacity, wide blur.
4. **Secondary buttons stay outline-only** (`--line2` border, `--t2` text, no fill), so the single
   accent fill per screen remains the only "press me".

Everything else — the current-set row wash, the accent-bordered KG/REPS fields, accent tab
underline, accent PR marks, `--warn` destructives — is a direct token substitution.

## Screens
The three reference screens cover every pattern in the app; the remaining 15 are compositions of
the same parts.

**Home (`RVHomeLight.dc.html`)** — week strip (accent marks on `--line2` rails), Up-next card
(`--s1` on `--acc-30` border) with the solid accent CTA, routine list (`--line` separators, first
row's "START →" in accent), tab bar with accent label + 2px accent underline.

**Active workout (`RVLogLight.dc.html`)** — the core. Exercise chips (active = `--acc` border +
`--acc-14` fill + accent text). Set grid on `--sin` inside a `--line` border, radius 12px:
completed rows plain with `--t2` values and `--ok` ✓; the current row washed `--acc-06` with
`--acc`-bordered fields on `--s0` and the filled ✓ chip; upcoming rows `--line2`-outlined with
`--t3` values. Rest bar on `--s1`, then outline PREV + solid accent NEXT.

**Rest (`RVRestLight.dc.html`)** — 132px mono countdown in `--acc`, 2px accent progress rule on a
`--line` track, ±30s as outlines and SKIP as the solid accent, "just logged" block below.

## Files
- `RepVoice Light Options.dc.html` — all six palette explorations; **`2a` is approved**
- `RVHomeLight.dc.html`, `RVLogLight.dc.html`, `RVRestLight.dc.html` — the approved screens
- `support.js` — runtime needed to open the above in a browser (not for production)

## Assets
None. No images, no icons — every glyph is a text character (`✓ ← → › ▲ ⌫ ⇅ ✕`) in Geist Mono.
