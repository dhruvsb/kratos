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

export const color = {
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

  // Accent = lime LED (--acc + derivatives). Accent is only ever border /
  // underline / glow — never a fill (agent-notes hard rule).
  acc: '#A3E635',
  accHi: '#BEF264',
  accInk: '#0F1A03',
  acc07: 'rgba(163,230,53,0.07)',
  acc14: 'rgba(163,230,53,0.14)',
  acc35: 'rgba(163,230,53,0.35)',
  acc05: 'rgba(163,230,53,0.05)',
  acc06: 'rgba(163,230,53,0.06)',

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
  meterHot: '#A3E635',

  // Tag chip borders used in the annotation cards.
  tagOkBorder: '#2B3A45',
  tagNeutralBorder: 'rgba(150,205,255,0.18)',
} as const;

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
export const shadow = {
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
} as const;

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
