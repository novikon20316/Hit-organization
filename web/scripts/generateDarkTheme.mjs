// scripts/generateDarkTheme.mjs
//
// Generates app/dark-theme.css — the dark variant of every color token in
// app/globals.css (all role palettes) plus the hard-coded `bg-[#…]` /
// `text-[#…]` / `border-[#…]` utility classes used across app/ and
// components/. Applied when <html data-theme="dark"> (see
// components/ThemeToggle.tsx; default is light).
//
// Each color keeps its hue and (gamut-clipped) chroma and gets its OKLab
// lightness mirrored into a dark range: page backgrounds become near-black,
// text becomes near-white, and every token pair that was readable on light
// (e.g. primary / on-primary) stays readable, because both sides of the
// pair move together. Re-run after changing any color:
//
//   node scripts/generateDarkTheme.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '..');
const globalsPath = path.join(webDir, 'app', 'globals.css');
const outPath = path.join(webDir, 'app', 'dark-theme.css');

// ─── Color math (sRGB ↔ OKLab) ─────────────────────────────────────────────
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function rgbToOklab([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGamma);
}

const inGamut = (rgb) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);

function rgbToHex(rgb) {
  return '#' + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
}

// Neutral lightness mirror (OKLab L): white page → near-black, near-black
// text → near-white, with mid-greys pushed apart so muted text and borders
// keep their contrast. Piecewise-linear through these anchors.
const NEUTRAL_ANCHORS = [[0, 0.95], [0.26, 0.9], [0.55, 0.72], [0.75, 0.47], [0.9, 0.3], [0.97, 0.2], [1, 0.17]];

function mirrorNeutral(L) {
  for (let i = 1; i < NEUTRAL_ANCHORS.length; i++) {
    const [x0, y0] = NEUTRAL_ANCHORS[i - 1];
    const [x1, y1] = NEUTRAL_ANCHORS[i];
    if (L <= x1) return y0 + ((L - x0) / (x1 - x0)) * (y1 - y0);
  }
  return NEUTRAL_ANCHORS[NEUTRAL_ANCHORS.length - 1][1];
}

function build(L, C, h) {
  let c = C;
  let rgb = oklabToRgb([L, c * Math.cos(h), c * Math.sin(h)]);
  for (let i = 0; i < 40 && !inGamut(rgb); i++) {
    c *= 0.92;
    rgb = oklabToRgb([L, c * Math.cos(h), c * Math.sin(h)]);
  }
  return rgbToHex(rgb);
}

function lab(hex) {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  return { L, C: Math.hypot(a, b), h: Math.atan2(b, a) };
}

const CHROMATIC = 0.04;

/** A color used as a background (page, card, container, tint). */
function asBackground(hex) {
  const { L, C, h } = lab(hex);
  if (C < CHROMATIC) return build(mirrorNeutral(L), C, h);
  // Light tints become dark tints; solid colors become a deep version.
  return build(L > 0.8 ? mirrorNeutral(L) + 0.05 : 0.32, C * 0.6, h);
}

/** A color used for text/icons sitting on backgrounds. */
function asForeground(hex) {
  const { L, C, h } = lab(hex);
  if (C < CHROMATIC) return build(mirrorNeutral(L), C, h);
  return build(Math.max(L, 0.8), C, h);
}

/** A solid accent (primary, danger, success…): used both as a button fill
 *  (with its on-color on top) and as colored text on the page — so it is
 *  lifted into a mid-light range that works for both on a dark page. */
function asAccent(hex) {
  const { L, C, h } = lab(hex);
  if (C < CHROMATIC) return build(mirrorNeutral(L), C, h);
  return build(Math.min(Math.max(L, 0.68), 0.8), C, h);
}

/** Text on a solid accent: dark, so it stays readable on the lifted accent. */
function asOnAccent(hex) {
  const { C, h } = lab(hex);
  return build(0.2, Math.min(C, 0.03), h);
}

function darkenToken(name, hex) {
  const n = name.replace(/^--/, '');
  if (/(^|-)on-(primary|secondary|tertiary|error)$/.test(n) || /-(ink|on-primary)$/.test(n) && !/^ink$/.test(n)) return asOnAccent(hex);
  if (/(^|-)on-/.test(n)) return asForeground(hex);
  if (/(container|surface|fixed|variant|-bg|^paper|^surface|^line|outline)/.test(n)) {
    return /outline|^line/.test(n) ? asBackground(hex) : asBackground(hex);
  }
  if (/(^|-)(ink|muted|text)$/.test(n)) return asForeground(hex);
  return asAccent(hex);
}

/** Hard-coded utilities: only light backgrounds/borders are darkened and
 *  only dark text is lightened — a dark `bg-[#…]` button with `text-white`
 *  on it is left as it is, since it already reads fine on a dark page. */
function darkenUtility(kind, hex) {
  const { L } = lab(hex);
  if (kind === 'text') return L < 0.6 ? asForeground(hex) : null;
  return L > 0.75 ? asBackground(hex) : null;
}

// ─── 1. Token overrides ────────────────────────────────────────────────────
const css = fs.readFileSync(globalsPath, 'utf8');
const tokens = new Map();
for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
  for (const decl of block[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\s*;/g)) {
    tokens.set(decl[1], darkenToken(decl[1], decl[2]));
  }
}

// ─── 2. Hard-coded color utilities ─────────────────────────────────────────
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = [...walk(path.join(webDir, 'app'), []), ...walk(path.join(webDir, 'components'), [])];
const PROP = { bg: 'background-color', text: 'color', border: 'border-color' };
const classes = new Set();
for (const f of files) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?<![\w-])((?:hover:|focus:)?)(bg|text|border)-\[(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\](?![\w/-])/g)) {
    classes.add(`${m[1]}|${m[2]}|${m[3]}`);
  }
}
const esc = (s) => s.replace(/[:[\]#]/g, (ch) => `\\${ch}`);
const utilityRules = [...classes].sort().flatMap((key) => {
  const [variant, kind, hex] = key.split('|');
  const value = darkenUtility(kind, hex);
  if (!value) return [];
  const className = `${variant}${kind}-[${hex}]`;
  const pseudo = variant === 'hover:' ? ':hover' : variant === 'focus:' ? ':focus' : '';
  return [`:root[data-theme="dark"] .${esc(className)}${pseudo} { ${PROP[kind]}: ${value}; }`];
});

// ─── 3. White text on a lifted accent fill ─────────────────────────────────
// Accents are lifted to a mid-light tone in dark mode (asAccent), so a
// `bg-success text-white` button would turn into white-on-light-green —
// switch that text to the dark on-accent color instead.
const accentFills = [...tokens.keys()]
  .map((name) => name.replace(/^--/, ''))
  .filter((n) => !/(^|-)on-|container|surface|fixed|variant|-bg$|^paper$|^line$|outline|ink$|muted$|-radius|^radius/.test(n));
const onAccent = asOnAccent('#ffffff');
const accentTextRules = accentFills.map((n) => `:root[data-theme="dark"] .bg-${n}.text-white, :root[data-theme="dark"] .bg-${n} .text-white { color: ${onAccent}; }`);

// ─── Write ─────────────────────────────────────────────────────────────────
const out = [
  '/* GENERATED by scripts/generateDarkTheme.mjs — do not edit by hand. */',
  '',
  ':root[data-theme="dark"] {',
  '  color-scheme: dark;',
  ...[...tokens].map(([name, value]) => `  ${name}: ${value};`),
  '}',
  '',
  '/* Plain white/black utilities used for cards and panels. */',
  ':root[data-theme="dark"] .bg-white { background-color: var(--surface); }',
  ':root[data-theme="dark"] .border-white { border-color: var(--line); }',
  '',
  '/* Hard-coded colors in components (see the header comment). */',
  ...utilityRules,
  '',
  '/* White text on accent fills (section 3 of the generator). */',
  ...accentTextRules,
  '',
].join('\n');
fs.writeFileSync(outPath, out);
console.log(`dark-theme.css: ${tokens.size} tokens, ${utilityRules.length} utility classes`);
