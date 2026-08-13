// Design tokens — the "voice-first / LED-instrument" design system.
//
// This is the design phase that Phases 1–3 deferred (the file used to be an empty
// placeholder). Every value here is lifted 1:1 from the Claude Design mockup
// "RepVoice Manual.dc.html" (lime/quantum-black reskin) so screens read the
// same numbers the mockup did. Rule from that mockup's agent notes: never hardcode a
// value that has a token.
//
// Type option 01 (RepVoice Manual, all 18 screens): Instrument Sans carries every UI
// name/heading, Geist Mono every numeral. Instrument Sans reads heavier than the old
// Space Grotesk, so UI text steps down one weight (titles land on 600, names on 500);
// the mono readouts keep their weight so the numbers still carry.
//
// Font FAMILY NAMES only live here (plain strings) so this file stays cheap to
// import; the actual font *files* are loaded by src/theme/fonts.ts.

export const font = {
  // f-ui — Instrument Sans (UI / labels / headings)
  ui: 'InstrumentSans_400Regular',
  uiMedium: 'InstrumentSans_500Medium',
  uiSemibold: 'InstrumentSans_600SemiBold',
  uiBold: 'InstrumentSans_700Bold',
  // f-num — Geist Mono (every metric / number / mono label)
  num: 'GeistMono_400Regular',
  numMedium: 'GeistMono_500Medium',
  numSemibold: 'GeistMono_600SemiBold',
  numBold: 'GeistMono_700Bold',
} as const;

const darkColor = {
  // Base canvas + surfaces (--s0/s1/s2/sin + body bg)
  bg: '#020609',
  s0: '#070C11',
  s1: '#0C1319',
  s2: '#131E27',
  sin: '#010406', // recessed / inset well
  // Panel / note-card surfaces used in the mockup's annotations + phones
  panel: '#0C1319',
  panelBorder: 'rgba(150,205,255,0.18)',
  sectionLine: 'rgba(150,205,255,0.09)',

  // Hairlines (--line / --line2): cool cyan-tinted off-white at low alpha
  line: 'rgba(150,205,255,0.09)',
  line2: 'rgba(150,205,255,0.18)',
  tick: 'rgba(150,205,255,0.14)',

  // Text ramp (--t1/t2/t3) + a couple of in-between greys the mockup uses
  t1: '#EAF3F9',
  t2: '#8DA2B2',
  t3: '#55636E',
  t2b: '#A0B3C2',
  t1b: '#C7DCE6',

  // Accent = lime LED. Toned down for TURN 3 (#C0F23C → #ACD455 in the design's
  // terms; here #A3E635 → #ACD455) — same hue, less chroma + lightness so it stops
  // glowing at night. Border / underline / glow, and the few deliberate fills (FAB,
  // today's cell, primary CTA on light).
  acc: '#ACD455',
  accHi: '#C2E074',
  accInk: '#0F1A03',
  acc07: 'rgba(172,212,85,0.07)',
  acc14: 'rgba(172,212,85,0.14)',
  acc35: 'rgba(172,212,85,0.35)',
  acc05: 'rgba(172,212,85,0.05)',
  acc06: 'rgba(172,212,85,0.06)',

  // Semantic "primary CTA" triplet + current-set ✓ chip. Dark keeps the mockup's
  // dark-fill / accent-border / accent-text look (a straight token swap would read as
  // disabled on white — see the light handoff's "not a straight swap" rules), so on
  // light these flip to a solid accent fill with white ink. One StyleSheet, both
  // themes: screens read these instead of hardcoding the fill/border/text.
  ctaBg: '#131E27', // = s2
  ctaBorder: 'rgba(172,212,85,0.35)', // = acc35
  ctaFg: '#ACD455', // = acc
  checkBg: 'transparent', // pending ✓ has no fill in dark (accent border only)
  checkFg: '#ACD455', // = acc

  ok: '#5FE3B0',
  warn: '#FF5647',

  // Heat — PR moment only, never used elsewhere in the system.
  hot: '#FF8A3C',
  hot2: '#FF5647',
  hotGlow: 'rgba(255,138,60,0.5)',

  // Level-meter segment ramp (cold → hot-cyan) from the mockup's meterBars data.
  meterCold: '#17222B',
  meterMid: '#1E2C36',
  meterHigh: '#2B3A45',
  meterHot: '#ACD455',

  // Tag chip borders used in the annotation cards.
  tagOkBorder: '#2B3A45',
  tagNeutralBorder: 'rgba(150,205,255,0.18)',
  // NB: no `as const` — values stay `string` so the light palette (same keys,
  // different values) can satisfy `typeof darkColor`. Keys are still fixed.
};

// Light-theme palette — "Greige + Moss" (option 2a, design_handoff_light_mode).
// A warm off-white ground with a moss-green accent. This is a theme swap, not a
// redesign: every key maps 1:1 onto darkColor's role. Values marked "handoff" are
// verbatim from the handoff's token table; the rest (surfaces the handoff folds
// together, the PR heat, the level-meter ramp) are toned to the same greige/moss
// system. The accent is only ever a border/mark/mono-readout EXCEPT the semantic
// ctaBg/checkBg, which the handoff makes a solid fill on light (rules 1 & 2).
const lightColor: typeof darkColor = {
  // Base canvas + surfaces
  bg: '#EBE8E1', // handoff --bg: page ground behind cards
  s0: '#FBF7F0', // handoff --s0: primary card / screen background
  s1: '#F5F1E9', // handoff --s1: raised block (up-next, rest bar, sheets)
  s2: '#FFFFFF', // brightest surface — accent-bordered fields / keycaps
  sin: '#F6F3EC', // handoff --sin: inset well (the set grid)
  panel: '#F5F1E9',
  panelBorder: 'rgba(60,50,38,0.20)',
  sectionLine: 'rgba(60,50,38,0.11)',

  // Hairlines — warm brown-black alphas (handoff rule 3), never blue-white.
  line: 'rgba(60,50,38,0.11)', // handoff --line
  line2: 'rgba(60,50,38,0.20)', // handoff --line2
  tick: 'rgba(60,50,38,0.14)',

  // Text ramp
  t1: '#2A2118', // handoff --t1: primary text, entered values
  t2: '#6B6156', // handoff --t2: secondary text, completed values
  t3: '#A29A8E', // handoff --t3: labels, meta, upcoming values
  t2b: '#574E44', // one notch darker than t2 (dark's t2b sat brighter than t2)
  t1b: '#453B30', // one notch lighter than t1 (dark's t1b sat dimmer than t1)

  // Accent = moss LED (handoff --acc). Border / mark / mono readout only.
  acc: '#3F6B3B', // handoff --acc
  accHi: '#4E8248',
  accInk: '#FFFFFF', // handoff --on-acc: ink on a solid accent fill
  acc07: 'rgba(63,107,59,0.07)', // handoff --acc-06 (current-set wash)
  acc14: 'rgba(63,107,59,0.16)', // handoff --acc-14 (active chip fill)
  acc35: 'rgba(63,107,59,0.34)', // handoff --acc-30 (accent hairlines/marks)
  acc05: 'rgba(63,107,59,0.05)',
  acc06: 'rgba(63,107,59,0.07)', // handoff --acc-06 (current-set row wash)

  ok: '#3F6B3B', // handoff --ok: completed ✓, same hue as accent by design
  warn: '#B23A2A', // handoff --warn: destructive

  // Heat — PR moment only. Warm terracotta toned for the light ground.
  hot: '#C2571F',
  hot2: '#B23A2A',
  hotGlow: 'rgba(194,87,31,0.35)',

  // Level-meter ramp (cold greige → moss). Inverted from dark: cold is now a light
  // tick, hot is the accent.
  meterCold: '#E6E1D8',
  meterMid: '#D8D2C6',
  meterHigh: '#C6D4C4', // handoff --acc-30 opaque equivalent
  meterHot: '#3F6B3B',

  tagOkBorder: 'rgba(63,107,59,0.34)',
  tagNeutralBorder: 'rgba(60,50,38,0.20)',

  // Semantic CTA + ✓ chip — solid accent fill on light (handoff rules 1 & 2).
  ctaBg: '#3F6B3B', // = acc
  ctaBorder: 'transparent', // no border on a filled CTA
  ctaFg: '#FFFFFF', // = on-acc
  checkBg: '#3F6B3B', // filled accent chip for the current ✓
  checkFg: '#FFFFFF', // = on-acc
};

// Dark palette as a plain export. Every screen now themes through useTheme()
// (#17 Phase 2 complete), so nothing in the app imports this anymore; it's kept as
// the canonical dark reference and is what `themes.dark` / the glow-shadow colors
// below resolve against.
export const color = darkColor;

export const radius = {
  ctl: 10, // --rad-ctl
  card: 16, // --rad-card
  key: 8,
  keySm: 7,
  chip: 6,
  phone: 34, // phone-frame corner
  sheet: 22, // bottom sheet top corners
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

// Elevation recipes. RN can't express inset shadows, so "recessed" wells are
// approximated with a dark inset-tinted background + hairline; the raised keycap
// look is a real (outer) shadow. Spread as {...shadow.key} onto a style.
const darkShadow = {
  // Raised physical keycap (--key-shadow ≈ top highlight + bottom drop)
  key: {
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  // Accent glow (LED bloom) — used behind lit digits / rings
  glowSm: {
    shadowColor: color.acc,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  glowLg: {
    shadowColor: color.acc,
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  // Thermal glow for the PR moment — the one place shadow color goes warm.
  glowHot: {
    shadowColor: color.hot,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  // Primary-CTA elevation. On dark this IS the accent glow (glowSm) behind the
  // button; screens spread {...shadow.cta} so light can swap it for a soft drop.
  cta: {
    shadowColor: color.acc,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  // NB: no `as const` — numeric values stay `number` so lightShadow satisfies
  // `typeof darkShadow` with its own opacities/radii.
};

// Light-theme shadows. On a warm-white ground the LED "glow" bloom reads wrong, so
// the accent glows go flat (opacity 0 — the accent marks render as solid fills, per
// the handoff), the raised keycap softens to a warm low-opacity drop, and the CTA
// gets a soft warm elevation (handoff --sh). PR heat keeps a muted warm bloom.
const lightShadow: typeof darkShadow = {
  key: {
    shadowColor: '#463A28',
    shadowOpacity: 0.18,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  glowSm: {
    shadowColor: lightColor.acc,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  glowLg: {
    shadowColor: lightColor.acc,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  glowHot: {
    shadowColor: lightColor.hot,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  // Soft warm card/CTA elevation (handoff --sh: warm, low opacity, wide blur).
  cta: {
    shadowColor: '#463A28',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
};

export const shadow = darkShadow;

// The theme registry. `color` + `shadow` are per-mode; radius/space/font/tracking/
// timing are shared (not theme-dependent). useTheme() resolves { color, shadow } for
// the active mode — see src/theme/ThemeProvider.tsx.
export const themes = {
  dark: { color: darkColor, shadow: darkShadow },
  light: { color: lightColor, shadow: lightShadow },
} as const;

export type ThemeName = keyof typeof themes;
export type Theme = { color: typeof darkColor; shadow: typeof darkShadow };

// Letter-spacing presets (the mockup leans on wide tracking for LED labels).
export const tracking = {
  tight: -0.5,
  normal: 0,
  label: 1.2,
  wide: 2.4,
  wider: 3.6,
  widest: 4.5,
} as const;

// Behavioral timing / thresholds — the commit state machine's config tokens
// (agent notes 2h). Change cadence here, never inline in the state machine.
export const timing = {
  commitHoldMs: 1200, // --commit-hold: confidence hold before auto-commit
  undoWindowMs: 6000, // --undo-window: spoken/tap "undo" grace after commit
  confFloor: 0.9, // --conf-floor: below this ⇒ CLARIFY instead of commit
  restDefaultSec: 120, // default rest timer
  commitAppendMs: 180, // tape row slide-in
  drawerOpenMs: 160, // correction drawer slide (the one allowed sheet)
  echoEarconMs: 160, // earcon max length
  floorEnterMs: 2000, // face-up + stationary hold before floor mode
  floorGyroThreshold: 0.6, // |gravity.z| above this ≈ lying flat, face up
  prMomentMs: 6000, // how long the PR floor-mode screen holds before resting
} as const;

// Back-compat shape for any code importing the old `tokens` object.
export const tokens = {
  colors: color,
  spacing: space,
  typography: font,
  radius,
  shadow,
  timing,
} as const;

export type Tokens = typeof tokens;
