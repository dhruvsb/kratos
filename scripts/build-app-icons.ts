/**
 * Generate the app's icon + splash art from one parametric SVG glyph — the
 * LED-instrument barbell: cyan bar + plates with a soft LED glow over the app's
 * near-black canvas, and a 5-tick meter row with one lit tick (the same visual
 * signature as the in-app level meters). Pure geometry — no fonts — so the
 * render is deterministic on any machine.
 *
 * Outputs (all referenced from app.config.ts):
 *   assets/images/icon.png                    1024² full-bleed dark (iOS masks its own corners)
 *   assets/images/android-icon-foreground.png 1024² glyph on transparent (66% safe zone)
 *   assets/images/android-icon-background.png 1024² flat #020609
 *   assets/images/android-icon-monochrome.png 1024² white glyph on transparent
 *   assets/images/splash-icon.png             512² glyph on transparent (shown ~100pt wide)
 *   assets/images/favicon.png                 48² barbell only (ticks don't survive 48px)
 *
 * Run:  npx tsx scripts/build-app-icons.ts   (npm run build:icons)
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Palette — mirrors src/theme/tokens.ts (scripts can't import RN modules).
const BG = '#020609'; // color.bg
const BG_LIFT = '#070C11'; // color.s0 — subtle center lift
const ACC = '#4FD8FF'; // color.acc
const TICK_DIM = '#16222B'; // between meterCold/meterMid

/** The barbell + meter glyph, drawn in a 1024-unit space centered on (512, 512). */
function glyph(color: string, { ticks = true, glow = true } = {}): string {
  // Barbell: center bar + inner/outer plate pair per side, all rounded rects.
  const bar = `<rect x="232" y="466" width="560" height="28" rx="14" fill="${color}"/>`;
  const plate = (cx: number, w: number, h: number) =>
    `<rect x="${cx - w / 2}" y="${480 - h / 2}" width="${w}" height="${h}" rx="${Math.min(16, w / 2.6)}" fill="${color}"/>`;
  const plates = [
    plate(332, 48, 210),
    plate(692, 48, 210),
    plate(274, 38, 150),
    plate(750, 38, 150),
  ].join('');

  // 5-tick meter row under the bar — last tick lit in the accent, rest dim.
  // In the monochrome variant everything is one color (dim ticks would vanish).
  const mono = color !== ACC;
  const tickRow = ticks
    ? Array.from({ length: 5 }, (_, i) => {
        const x = 379 + i * 58; // 34 wide + 24 gap
        const lit = i === 4;
        const fill = mono ? color : lit ? ACC : TICK_DIM;
        const op = mono && !lit ? 0.35 : 1;
        return `<rect x="${x}" y="666" width="34" height="12" rx="6" fill="${fill}" opacity="${op}"/>`;
      }).join('')
    : '';

  const art = `${bar}${plates}${tickRow}`;
  if (!glow) return art;
  // LED bloom: two blurred copies underneath (tight + wide), like shadow.glowSm/Lg.
  return `
    <g filter="url(#glowTight)" opacity="0.55">${art}</g>
    <g filter="url(#glowWide)" opacity="0.25">${art}</g>
    ${art}`;
}

const GLOW_DEFS = `
  <defs>
    <filter id="glowTight" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="16"/>
    </filter>
    <filter id="glowWide" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="44"/>
    </filter>
    <radialGradient id="lift" cx="50%" cy="46%" r="62%">
      <stop offset="0%" stop-color="${BG_LIFT}"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
  </defs>`;

function svgDoc(inner: string, { size = 1024 } = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${GLOW_DEFS}${inner}</svg>`;
}

/** Wrap the glyph with a scale about the canvas center (safe zones / splash fill). */
function scaled(inner: string, scale: number): string {
  return `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${inner}</g>`;
}

function render(svg: string, px: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng() as Buffer;
}

const out = join(__dirname, '..', 'assets', 'images');
mkdirSync(out, { recursive: true });

const write = (name: string, buf: Buffer) => {
  writeFileSync(join(out, name), buf);
  console.log(`wrote ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
};

// App icon: dark canvas with a faint center lift, full glyph (scaled up a touch
// so it still reads at springboard sizes).
write(
  'icon.png',
  render(
    svgDoc(`<rect width="1024" height="1024" fill="url(#lift)"/>${scaled(glyph(ACC), 1.15)}`),
    1024
  )
);

// Android adaptive: foreground glyph inside the ~66% safe zone; flat background;
// monochrome variant for themed icons.
write(
  'android-icon-foreground.png',
  render(svgDoc(scaled(glyph(ACC), 0.62)), 1024)
);
write(
  'android-icon-background.png',
  render(svgDoc(`<rect width="1024" height="1024" fill="${BG}"/>`), 1024)
);
write(
  'android-icon-monochrome.png',
  render(svgDoc(scaled(glyph('#FFFFFF', { glow: false }), 0.62)), 1024)
);

// Splash logo: glyph on transparent — the plugin centers it on backgroundColor.
write('splash-icon.png', render(svgDoc(scaled(glyph(ACC), 1.12)), 512));

// Favicon: barbell only (the tick row is soup at 48px), tiny dark tile.
write(
  'favicon.png',
  render(
    svgDoc(`<rect width="1024" height="1024" rx="180" fill="${BG}"/>${scaled(glyph(ACC, { ticks: false, glow: false }), 1.2)}`),
    48
  )
);

console.log('done.');
