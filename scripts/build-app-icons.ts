/**
 * Derive every app-icon / splash asset from ONE checked-in master image —
 * `assets/icon-source/app-icon-1024.png` is the single source of truth.
 *
 * The master is the "Reps" blueprint-barbell icon (loaded bar end — red + two steel
 * plates, spring collar, end cap — on a graphite grid, 1024² opaque). It is pure CSS
 * boxes + gradients; the exact source is `assets/icon-source/app-icon-source.html`.
 * Reproduce the master by rendering that file at a true 1024²:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --force-device-scale-factor=1 --window-size=1024,1024 \
 *     --screenshot=assets/icon-source/app-icon-1024.png \
 *     "file://$PWD/assets/icon-source/app-icon-source.html"
 *
 * This script no longer draws anything; it just resizes/insets the master into each
 * output size, so re-running it reproduces the current icon instead of clobbering it.
 * To change the app icon, replace the master (or its source html) and re-run.
 *
 * Outputs (all referenced from app.config.ts):
 *   assets/images/icon.png                    1024² — copied byte-for-byte from the master
 *                                             (keeps the App Store artwork pristine, no re-encode)
 *   assets/images/splash-icon.png             512²  — master, shown ~104pt on the dark splash
 *   assets/images/favicon.png                 48²   — master, downscaled (web, legacy)
 *   assets/images/android-icon-foreground.png 1024² — master inset to the ~62% safe zone, transparent
 *   assets/images/android-icon-background.png 1024² — flat #020609 (Android, legacy)
 *
 * Android is non-shipping legacy (iOS-only app); its adaptive layers are kept only
 * so the config still resolves. There is no monochrome layer — a photographic icon
 * has no meaningful single-color themed form.
 *
 * Run:  npx tsx scripts/build-app-icons.ts   (npm run build:icons)
 */
import { Resvg } from '@resvg/resvg-js';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BG = '#020609'; // color.bg — mirrors src/theme/tokens.ts

const assets = join(__dirname, '..', 'assets');
const out = join(assets, 'images');
const masterPath = join(assets, 'icon-source', 'app-icon-1024.png');
mkdirSync(out, { recursive: true });

// Embed the master as a data URI so Resvg can rescale it (resvg renders <image>).
const masterHref = `data:image/png;base64,${readFileSync(masterPath).toString('base64')}`;

/** An SVG that paints the 1024² master, optionally inset and/or on a flat fill. */
function doc(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${inner}</svg>`;
}
const fullImage = `<image href="${masterHref}" x="0" y="0" width="1024" height="1024"/>`;
const inset = (scale: number) =>
  `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${fullImage}</g>`;

function render(svg: string, px: number): Buffer {
  return new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng() as Buffer;
}

const write = (name: string, buf: Buffer) => {
  writeFileSync(join(out, name), buf);
  console.log(`wrote ${name} (${(buf.length / 1024).toFixed(1)} KB)`);
};

// iOS app icon: exact master bytes — never re-encode the App Store artwork.
copyFileSync(masterPath, join(out, 'icon.png'));
console.log('wrote icon.png (copied from master)');

// Splash logo — the plugin centers it on backgroundColor (#020609); the master's
// own near-black field blends into the splash so the plates read as floating.
write('splash-icon.png', render(doc(fullImage), 512));

// Favicon (web, legacy).
write('favicon.png', render(doc(fullImage), 48));

// Android adaptive layers (legacy, non-shipping).
write('android-icon-foreground.png', render(doc(inset(0.62)), 1024));
write('android-icon-background.png', render(doc(`<rect width="1024" height="1024" fill="${BG}"/>`), 1024));

console.log('done.');
