// Design tokens — the "voice-first / LED-instrument" design system.
//
// This is the design phase that Phases 1–3 deferred (the file used to be an empty
// placeholder). Every value here is lifted 1:1 from the Claude Design mockup
// "RepVoice Voice-First.dc.html" so screens read the same numbers the mockup did.
// Rule from that mockup's agent notes: never hardcode a value that has a token.
//
// Font FAMILY NAMES only live here (plain strings) so this file stays cheap to
// import; the actual font *files* are loaded by src/theme/fonts.ts.

export const font = {
  // f-ui — Space Grotesk (UI / labels / headings)
  ui: 'SpaceGrotesk_400Regular',
  uiMedium: 'SpaceGrotesk_500Medium',
  uiSemibold: 'SpaceGrotesk_600SemiBold',
  uiBold: 'SpaceGrotesk_700Bold',
  // f-num — IBM Plex Mono (every metric / number / mono label)
  num: 'IBMPlexMono_400Regular',
  numMedium: 'IBMPlexMono_500Medium',
  numSemibold: 'IBMPlexMono_600SemiBold',
  numBold: 'IBMPlexMono_700Bold',
} as const;

export const color = {
  // Base canvas + surfaces (--s0/s1/s2/sin + body bg)
  bg: '#100E0C',
  s0: '#151210',
  s1: '#1E1A16',
  s2: '#282219',
  sin: '#0D0B09', // recessed / inset well
  // Panel / note-card surfaces used in the mockup's annotations + phones
  panel: '#17140F',
  panelBorder: '#35302A',
  sectionLine: '#2A2520',

  // Hairlines (--line / --line2): warm off-white at low alpha
  line: 'rgba(255,235,205,0.08)',
  line2: 'rgba(255,235,205,0.16)',
  tick: 'rgba(255,235,205,0.10)',

  // Text ramp (--t1/t2/t3) + a couple of in-between greys the mockup uses
  t1: '#F3EDE3',
  t2: '#A79D8D',
  t3: '#6E6558',
  t2b: '#8C8375',
  t1b: '#C9BFAF',

  // Accent = amber LED (--acc + derivatives). Accent is only ever border /
  // underline / glow — never a fill (agent-notes hard rule).
  acc: '#FFAB1F',
  accHi: '#FFC45C',
  accInk: '#1A1305',
  acc07: 'rgba(255,171,31,0.07)',
  acc14: 'rgba(255,171,31,0.14)',
  acc35: 'rgba(255,171,31,0.35)',
  acc05: 'rgba(255,171,31,0.05)',
  acc06: 'rgba(255,171,31,0.06)',

  ok: '#8FC97E',
  warn: '#E06A45',

  // Level-meter segment ramp (cold → warm) from the mockup's meterBars data.
  meterCold: '#3A342C',
  meterMid: '#5E574D',
  meterHot: '#FFAB1F',

  // Tag chip borders used in the annotation cards.
  tagOkBorder: '#3E4A38',
  tagNeutralBorder: '#4A443C',
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
