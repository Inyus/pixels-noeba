// Pixels Noeba - repo validator: puzzle bank integrity + nonogram uniqueness solver.
import { PACK, PRACTICE, decodePuzzle } from '../site/js/puzzles.js';
const PUZZLES = PACK.map(decodePuzzle);
const PRACTICE_PUZZLES = PRACTICE.map(decodePuzzle);
import { I18N } from '../site/js/i18n.js';
import { readFileSync, existsSync } from 'node:fs';

let errors = [], warnings = [];

// solver lives in test/solver.mjs (shared with tools/fabrica.mjs)
import { countSolutions } from './solver.mjs';

// ---------- puzzle bank checks ----------
if (PUZZLES.length < 365) errors.push(`queue too short: ${PUZZLES.length} dailies (< 365)`);
const practiceIds = new Set(PRACTICE_PUZZLES.map(p => p.id));
for (const p of PUZZLES) if (practiceIds.has(p.id)) errors.push(`${p.id}: practice puzzle also in the daily queue`);
const packBitmaps = new Set();
for (const p of [...PUZZLES, ...PRACTICE_PUZZLES]) {
  const bm = p.art.map(r => r.split('').map(c => c === '.' ? 0 : 1).join('')).join('');
  if (packBitmaps.has(bm)) errors.push(`${p.id}: duplicate bitmap in pack`);
  packBitmaps.add(bm);
}
if (PRACTICE_PUZZLES.length < 6) errors.push(`practice set too small: ${PRACTICE_PUZZLES.length}`);
for (const d of [1, 2, 3]) if (!PRACTICE_PUZZLES.some(p => p.difficulty === d)) errors.push(`practice set missing difficulty ${d}`);
const ids = new Set();
let t0 = Date.now();
for (const p of [...PUZZLES, ...PRACTICE_PUZZLES]) {
  const tag = p.id;
  if (ids.has(p.id)) errors.push(`${tag}: duplicate id`);
  ids.add(p.id);
  for (const lang of ['ca', 'en', 'es']) if (!p.name?.[lang]) errors.push(`${tag}: missing name.${lang}`);
  const n = p.size;
  if (![10, 12, 15].includes(n)) errors.push(`${tag}: unusual size ${n}`);
  if (p.art.length !== n) errors.push(`${tag}: art has ${p.art.length} rows, size says ${n}`);
  p.art.forEach((row, i) => { if (row.length !== n) errors.push(`${tag}: row ${i} length ${row.length}`); });
  const chars = new Set(p.art.join('').split(''));
  chars.delete('.');
  for (const c of chars) if (!p.palette[c]) errors.push(`${tag}: char '${c}' not in palette`);
  for (const [c, hex] of Object.entries(p.palette)) if (!/^#[0-9a-fA-F]{6}$/.test(hex)) errors.push(`${tag}: palette '${c}' bad hex ${hex}`);
  if (!chars.size) errors.push(`${tag}: empty sprite`);
  const grid = p.art.map(r => r.split('').map(c => c === '.' ? 0 : 1));
  const sols = countSolutions(grid);
  if (sols === 0) errors.push(`${tag}: NO solution (broken clues)`);
  else if (sols > 1) errors.push(`${tag}: ${sols}+ solutions (ambiguous, unfair for hearts mode)`);
  const filled = grid.flat().filter(Boolean).length;
  const density = filled / (n * n);
  if (density < 0.2 || density > 0.75) warnings.push(`${tag}: density ${(density * 100).toFixed(0)}% unusual`);
}

// ---------- i18n parity ----------
const langs = Object.keys(I18N);
const baseKeys = Object.keys(I18N[langs[0]]).sort();
for (const lang of langs) {
  const keys = Object.keys(I18N[lang]).sort();
  const missing = baseKeys.filter(k => !I18N[lang][k]);
  const extra = keys.filter(k => !I18N[langs[0]][k]);
  if (missing.length) errors.push(`i18n ${lang}: missing keys ${missing.join(',')}`);
  if (extra.length) errors.push(`i18n ${lang}: extra keys ${extra.join(',')}`);
}
for (const lang of langs) for (const [k, v] of Object.entries(I18N[lang])) {
  if (typeof v !== 'string' || !v.trim()) errors.push(`i18n ${lang}.${k}: empty`);
  if (/TODO|FIXME|undefined/.test(v)) errors.push(`i18n ${lang}.${k}: placeholder text`);
}

// ---------- html references ----------
let html=''; try { html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8'); } catch {}
if (html) {
for (const ref of ['css/style.css', 'js/game.js', 'assets/avatar-david.png', 'assets/favicon.png', 'assets/og-image.png']) {
  if (!html.includes(ref)) errors.push(`index.html does not reference ${ref}`);
}
const gameJs = readFileSync(new URL('../site/js/game.js', import.meta.url), 'utf8');
for (const imp of ['./i18n.js', './puzzles.js', './core.js']) {
  if (!gameJs.includes(`from '${imp}'`)) errors.push(`game.js does not import ${imp}`);
}
for (const f of ['site/css/style.css', 'site/js/i18n.js', 'site/js/puzzles.js', 'site/js/core.js', 'site/js/game.js', 'site/assets/avatar-david.png', 'site/assets/favicon.png', 'site/assets/og-image.png']) {
  if (!existsSync(new URL('../' + f, import.meta.url))) errors.push(`missing file: ${f}`);
}
// i18n keys used in HTML data-i18n attributes exist
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) {
  for (const lang of langs) if (!I18N[lang][m[1]]) errors.push(`index.html data-i18n key '${m[1]}' missing in ${lang}`);
}
}

console.log(`Validated ${PUZZLES.length} puzzles, ${langs.length} languages, solver time ${Date.now() - t0}ms`);
for (const w of warnings) console.log('WARN: ' + w);
if (errors.length) { for (const e of errors) console.log('ERROR: ' + e); process.exit(1); }
console.log('ALL CHECKS PASSED');
