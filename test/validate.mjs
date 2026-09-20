// Pixels Noeba - repo validator: puzzle bank integrity + nonogram uniqueness solver.
import { PUZZLES } from '../site/js/puzzles.js';
import { I18N } from '../site/js/i18n.js';
import { readFileSync, existsSync } from 'node:fs';

let errors = [], warnings = [];

// ---------- nonogram logic ----------
function cluesOf(line) {
  const clues = []; let run = 0;
  for (const c of line) { if (c) run++; else if (run) { clues.push(run); run = 0; } }
  if (run) clues.push(run);
  return clues.length ? clues : [0];
}
const possCache = new Map();
function linePossibilities(len, clues, known) {
  const key = len + '|' + clues.join(',') + '|' + known.join('');
  if (possCache.has(key)) return possCache.get(key);
  const out = [];
  const place = (ci, pos, arr) => {
    if (ci === clues.length) {
      for (let i = pos; i < len; i++) { if (known[i] === 1) return; arr[i] = 0; }
      out.push(arr.slice()); return;
    }
    const run = clues[ci];
    const remaining = clues.slice(ci + 1).reduce((a, b) => a + b, 0) + (clues.length - ci - 1);
    for (let start = pos; start + run + remaining <= len; start++) {
      const a = arr.slice();
      let ok = true;
      for (let i = pos; i < start; i++) { if (known[i] === 1) { ok = false; break; } a[i] = 0; }
      if (!ok) break;
      for (let i = start; i < start + run; i++) { if (known[i] === 0) { ok = false; break; } a[i] = 1; }
      if (!ok) continue;
      if (start + run < len) { if (known[start + run] === 1) continue; a[start + run] = 0; }
      place(ci + 1, start + run + 1, a);
    }
  };
  if (clues.length === 1 && clues[0] === 0) {
    const a = new Array(len).fill(0);
    if (!known.some(k => k === 1)) out.push(a);
  } else place(0, 0, new Array(len).fill(-1));
  possCache.set(key, out);
  return out;
}
function countSolutions(grid, cap = 2) {
  const h = grid.length, w = grid[0].length;
  const rowClues = grid.map(cluesOf);
  const colClues = []; for (let x = 0; x < w; x++) colClues.push(cluesOf(grid.map(r => r[x])));
  const known = Array.from({ length: h }, () => new Array(w).fill(-1));
  let count = 0;
  function propagate() {
    let changed = true;
    while (changed) {
      changed = false;
      for (let y = 0; y < h; y++) {
        const poss = linePossibilities(w, rowClues[y], known[y]);
        if (poss.length === 0) return false;
        for (let x = 0; x < w; x++) if (known[y][x] === -1) {
          const v = poss[0][x];
          if (poss.every(p => p[x] === v)) { known[y][x] = v; changed = true; }
        }
      }
      for (let x = 0; x < w; x++) {
        const col = known.map(r => r[x]);
        const poss = linePossibilities(h, colClues[x], col);
        if (poss.length === 0) return false;
        for (let y = 0; y < h; y++) if (known[y][x] === -1) {
          const v = poss[0][y];
          if (poss.every(p => p[y] === v)) { known[y][x] = v; changed = true; }
        }
      }
    }
    return true;
  }
  function search() {
    if (count >= cap) return;
    // snapshot
    const snap = known.map(r => r.slice());
    if (!propagate()) { restore(snap); return; }
    let bx = -1, by = -1;
    outer: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (known[y][x] === -1) { by = y; bx = x; break outer; }
    if (bx === -1) { count++; restore(snap); return; }
    for (const v of [1, 0]) {
      const snap2 = known.map(r => r.slice());
      known[by][bx] = v;
      search();
      restore(snap2);
      if (count >= cap) { restore(snap); return; }
    }
    restore(snap);
  }
  function restore(snap) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) known[y][x] = snap[y][x]; }
  search();
  return count;
}

// ---------- puzzle bank checks ----------
const ids = new Set();
let t0 = Date.now();
for (const p of PUZZLES) {
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
