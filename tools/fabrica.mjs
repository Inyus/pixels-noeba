// La Fàbrica: generates the daily-puzzle queue for pixels.noeba.
// Parametric pixel-art families -> quality filter (solver uniqueness, density,
// connectivity, dedupe) -> encoded pack written to site/js/puzzles.js.
// Usage: node tools/fabrica.mjs [targetQueueLength]
import { HAND_DRAWN } from './hand-drawn.mjs';
import { countSolutions } from '../test/solver.mjs';
import { writeFileSync } from 'node:fs';

const TARGET = Math.max(366, parseInt(process.argv[2] || '400', 10));

/* ---------- rng ---------- */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

/* ---------- grid helpers ---------- */
const blank = () => Array.from({ length: 10 }, () => new Array(10).fill('.'));
const px = (g, x, y, c) => { if (x >= 0 && x < 10 && y >= 0 && y < 10) g[y][x] = 'M'; };
const det = (g, x, y, c) => { if (x >= 0 && x < 10 && y >= 0 && y < 10) g[y][x] = c; }; // detail color char
const sym = (g, x, y) => { px(g, x, y); px(g, 9 - x, y); };
const srow = (g, y, x0, x1) => { for (let x = x0; x <= x1; x++) { px(g, x, y); px(g, 9 - x, y); } };
const rows = (g, y0, y1, x0, x1) => { for (let y = y0; y <= y1; y++) srow(g, y, x0, x1); };

/* Colorize: 'M' border cells -> 'k' outline, interior -> main char. Detail chars pass through. */
function colorize(g, mainChar) {
  const out = blank();
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const v = g[y][x];
    if (v === '.') continue;
    if (v !== 'M') { out[y][x] = v; continue; }
    const border = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => (g[y+dy]?.[x+dx] ?? '.') === '.');
    out[y][x] = border ? 'k' : mainChar;
  }
  return out.map(r => r.join(''));
}

/* ---------- semantic detail colors (fixed) ---------- */
const C = { e: '#f5f0e8', w: '#f5f0e8', g: '#58b368', n: '#9a6a45', y: '#f5d742', r: '#e5484d', o: '#f0922e', b: '#77b7ff', c: '#a8d8ff', p: '#b47fe0', i: '#f2a0c0', t: '#72e2c4' };
const K = '#525b70';

/* main-color themes: [hex, adjective key] */
const MAIN_COLORS = [
  ['#f0922e', 'taronja'], ['#e5484d', 'vermell'], ['#f5d742', 'groc'], ['#58b368', 'verd'],
  ['#77b7ff', 'blau'], ['#b47fe0', 'lila'], ['#f2a0c0', 'rosa'], ['#9a6a45', 'marro'],
  ['#72e2c4', 'menta'], ['#a8d8ff', 'cel'], ['#8b93a5', 'gris'], ['#f5f0e8', 'blanc'],
];
const ADJ = {
  taronja: { ca: ['taronja', 'taronja'], en: 'orange', es: ['naranja', 'naranja'] },
  vermell: { ca: ['vermell', 'vermella'], en: 'red', es: ['rojo', 'roja'] },
  groc:    { ca: ['groc', 'groga'], en: 'yellow', es: ['amarillo', 'amarilla'] },
  verd:    { ca: ['verd', 'verda'], en: 'green', es: ['verde', 'verde'] },
  blau:    { ca: ['blau', 'blava'], en: 'blue', es: ['azul', 'azul'] },
  lila:    { ca: ['lila', 'lila'], en: 'purple', es: ['morado', 'morada'] },
  rosa:    { ca: ['rosa', 'rosa'], en: 'pink', es: ['rosa', 'rosa'] },
  marro:   { ca: ['marró', 'marró'], en: 'brown', es: ['marrón', 'marrón'] },
  menta:   { ca: ['menta', 'menta'], en: 'mint', es: ['menta', 'menta'] },
  cel:     { ca: ['cel', 'cel'], en: 'sky-blue', es: ['celeste', 'celeste'] },
  gris:    { ca: ['gris', 'grisa'], en: 'gray', es: ['gris', 'gris'] },
  blanc:   { ca: ['blanc', 'blanca'], en: 'white', es: ['blanco', 'blanca'] },
};
/* noun: [caArticle, ca, gender m/f, en, esArticle, es] */
function name3(noun, adjKey) {
  const [caArt, caNoun, g, enNoun, esArt, esNoun] = noun;
  const a = ADJ[adjKey];
  const enArt = /^[aeiou]/.test(a.en) ? 'An' : 'A';
  return [`${caArt} ${caNoun} ${a.ca[g === 'm' ? 0 : 1]}`, `${enArt} ${a.en} ${enNoun}`, `${esArt} ${esNoun} ${a.es[g === 'm' ? 0 : 1]}`];
}

/* ---------- families: each returns {art, name:[ca,en,es], palette} ---------- */
export const FAMILIES = [
  function cara(rng) { // animal face: ears x headW x headH x snout
    const ears = pick(rng, ['point', 'round', 'long', 'flop']);
    const [hex, adj] = pick(rng, MAIN_COLORS);
    const w = pick(rng, [1, 2]);      // half-width inset of the head
    const top = pick(rng, [2, 3]);    // head start row
    const bot = pick(rng, [7, 8]);    // head end row
    const snout = rng() > 0.4;
    const g = blank();
    if (ears === 'point') { det(g, 2, 0, 'M'); det(g, 7, 0, 'M'); sym(g, 2, 1); sym(g, 3, 1); }
    if (ears === 'round') { sym(g, 1, 0); sym(g, 2, 0); sym(g, 1, 1); }
    if (ears === 'long') { sym(g, 2, 0); sym(g, 2, 1); sym(g, 3, 0); }
    rows(g, top, bot, w, 9 - 5 + 4 - (9 - 5)); // placeholder, replaced below
    // head block (real):
    for (let y = top; y <= bot; y++) srow(g, y, w, 9 - w >= 5 ? 9 - w : 5);
    if (ears === 'flop') { for (let y = top + 1; y <= Math.min(bot, top + 3); y++) { px(g, w - 1, y); px(g, 10 - w, y); } }
    srow(g, bot + 1 > 9 ? 9 : bot + 1, w + 1, 8 - w > 5 ? 8 - w : 5);
    const eyeY = Math.min(top + 2, 6);
    det(g, 2, eyeY, 'e'); det(g, 7, eyeY, 'e');
    if (snout) { const sy = Math.min(eyeY + 1, 7); det(g, 4, sy, 'w'); det(g, 5, sy, 'w'); det(g, 4, sy + 1 > 9 ? 9 : sy + 1, 'w'); det(g, 5, sy + 1 > 9 ? 9 : sy + 1, 'w'); }
    const nounMap = { point: ['Un', 'gat', 'm', 'cat', 'Un', 'gato'], round: ['Un', 'ós', 'm', 'bear', 'Un', 'oso'], long: ['Un', 'conill', 'm', 'rabbit', 'Un', 'conejo'], flop: ['Un', 'gos', 'm', 'dog', 'Un', 'perro'] };
    return { art: colorize(g, 'm'), name: name3(nounMap[ears], adj), palette: { k: K, m: hex, e: C.e, w: C.w } };
  },

  function fruit(rng) {
    const kind = pick(rng, ['apple', 'pear', 'strawberry', 'orange', 'lemon']);
    const g = blank();
    let name, hex, adj;
    if (kind === 'apple') {
      [hex, adj] = pick(rng, [['#e5484d', 'vermell'], ['#58b368', 'verd'], ['#f5d742', 'groc']]);
      const w = pick(rng, [1, 2]), top = pick(rng, [3, 4]);
      srow(g, top, w + 1, 8 - w); rows(g, top + 1, 7, w, 9 - w - 5 + 5); for (let y = top + 1; y <= 7; y++) srow(g, y, w, 9 - w);
      srow(g, 8, w + 1, 8 - w);
      det(g, 4, top - 2, 'n'); det(g, 4, top - 1, 'n'); det(g, 5, top - 2, 'n'); det(g, 6, top - 1, 'g');
      name = name3(['Una', 'poma', 'f', 'apple', 'Una', 'manzana'], adj);
    } else if (kind === 'pear') {
      [hex, adj] = pick(rng, [['#58b368', 'verd'], ['#f5d742', 'groc']]);
      const w = pick(rng, [1, 2]);
      rows(g, 3, 4, 3, 6); rows(g, 5, 5, 2, 7); rows(g, 6, 8, w, 9 - w);
      det(g, 4, 1, 'n'); det(g, 4, 2, 'n'); det(g, 6, 2, 'g');
      name = name3(['Una', 'pera', 'f', 'pear', 'Una', 'pera'], adj);
    } else if (kind === 'strawberry') {
      [hex, adj] = pick(rng, [['#e5484d', 'vermell'], ['#f2a0c0', 'rosa']]);
      const w = pick(rng, [0, 1]);
      srow(g, 3, 2 - w, 7 + w); rows(g, 4, 4, 1 - w, 8 + w); rows(g, 5, 5, 1 - w, 8 + w); rows(g, 6, 6, 2 - w, 7 + w); srow(g, 7, 3 - w, 6 + w); srow(g, 8, 4, 5);
      det(g, 3, 2, 'g'); det(g, 4, 2, 'g'); det(g, 5, 2, 'g'); det(g, 6, 2, 'g'); det(g, 4, 1, 'g'); det(g, 5, 1, 'g');
      det(g, 3, 4, 'y'); det(g, 6, 4, 'y'); det(g, 4, 5, 'y'); det(g, 5, 6, 'y');
      name = name3(['Una', 'maduixa', 'f', 'strawberry', 'Una', 'fresa'], adj);
    } else {
      [hex, adj] = kind === 'orange' ? ['#f0922e', 'taronja'] : ['#f5d742', 'groc'];
      const w = pick(rng, [1, 2]), top = pick(rng, [2, 3]), bot = 10 - top;
      srow(g, top, w + 1, 8 - w); rows(g, top + 1, bot - 1, w, 9 - w); srow(g, bot, w + 1, 8 - w);
      det(g, 4, top - 1, 'g'); det(g, 5, top - 1, 'g');
      name = name3(kind === 'orange' ? ['Una', 'taronja', 'f', 'orange', 'Una', 'naranja'] : ['Una', 'llimona', 'f', 'lemon', 'Un', 'limón'], adj);
    }
    return { art: colorize(g, 'm'), name, palette: { k: K, m: hex, g: C.g, n: C.n, y: C.y } };
  },

  function bolet(rng) {
    const [hex, adj] = pick(rng, [['#e5484d', 'vermell'], ['#9a6a45', 'marro'], ['#b47fe0', 'lila'], ['#f0922e', 'taronja'], ['#77b7ff', 'blau']]);
    const capW = pick(rng, [1, 2]), capH = pick(rng, [3, 4]), stemW = pick(rng, [3, 2]);
    const g = blank();
    srow(g, 2, capW + 1, 8 - capW); rows(g, 3, capH, capW, 9 - capW); srow(g, capH + 1, capW + 1, 8 - capW);
    rows(g, capH + 2, 8, stemW, 9 - stemW); srow(g, 9, stemW - 1, 10 - stemW);
    det(g, 2, 3, 'w'); det(g, 7, 3, 'w'); det(g, 4, 4, 'w'); det(g, 5, 4, 'w');
    if (rng() > 0.5) { det(g, 3, 2, 'w'); det(g, 6, 2, 'w'); }
    const art = colorize(g, 'm');
    for (let y = capH + 2; y <= 9; y++) for (let x = 0; x < 10; x++) if (art[y][x] === 'm') art[y] = art[y].substring(0, x) + 'w' + art[y].substring(x + 1);
    return { art, name: name3(['Un', 'bolet', 'm', 'mushroom', 'Un', 'champiñón'], adj), palette: { k: K, m: hex, w: C.w } };
  },

  function arbre(rng) {
    const kind = pick(rng, ['round', 'pine']);
    const g = blank();
    const trunkTop = pick(rng, [7, 8]);
    rows(g, trunkTop, 9, 4, 5);
    if (kind === 'round') {
      const w = pick(rng, [1, 2]);
      srow(g, 1, w + 2, 7 - w); rows(g, 2, 5, w, 9 - w); srow(g, 6, w + 1, 8 - w);
      if (rng() > 0.4) { det(g, 2, 3, 'r'); det(g, 7, 3, 'r'); det(g, 4, 5, 'r'); det(g, 6, 4, 'r'); }
    } else {
      rows(g, 0, 1, 4, 5); rows(g, 2, 3, 3, 6); rows(g, 4, 5, 2, 7); rows(g, 6, 6, 1, 8);
      det(g, 4, 0, 'y'); det(g, 5, 0, 'y');
    }
    const art = colorize(g, 'm');
    for (let y = trunkTop; y <= 9; y++) for (let x = 4; x <= 5; x++) art[y] = art[y].substring(0, x) + 'n' + art[y].substring(x + 1);
    const name = kind === 'pine' ? ['Un', 'pi', 'm', 'pine tree', 'Un', 'pino'] : ['Un', 'arbre', 'm', 'tree', 'Un', 'árbol'];
    return { art, name: name3(name, 'verd'), palette: { k: K, m: '#58b368', n: C.n, r: C.r, y: C.y } };
  },

  function casa(rng) {
    const [hex, adj] = pick(rng, [['#e5484d', 'vermell'], ['#9a6a45', 'marro'], ['#77b7ff', 'blau'], ['#f0922e', 'taronja']]);
    const bodyW = pick(rng, [1, 2]), bodyTop = pick(rng, [5, 6]), chim = rng() > 0.5;
    const g = blank();
    rows(g, bodyTop, 9, bodyW, 9 - bodyW);
    srow(g, bodyTop - 1, bodyW + 1, 8 - bodyW); srow(g, bodyTop - 2, bodyW + 2, 7 - bodyW); srow(g, bodyTop - 3, bodyW + 3, 6 - bodyW);
    det(g, bodyW + 1, bodyTop + 1, 'b'); det(g, bodyW + 2, bodyTop + 1, 'b'); det(g, 8 - bodyW - 1, bodyTop + 1, 'b'); det(g, 8 - bodyW, bodyTop + 1, 'b');
    rows(g, bodyTop + 2, 9, 4, 5);
    if (chim) { det(g, 2, bodyTop - 4, 'M'); det(g, 2, bodyTop - 3, 'M'); }
    const art = colorize(g, 'm');
    for (let y = bodyTop - 3; y < bodyTop; y++) for (let x = 0; x < 10; x++) if (art[y][x] === 'm') art[y] = art[y].substring(0, x) + 'r' + art[y].substring(x + 1);
    for (let y = bodyTop + 2; y <= 9; y++) for (let x = 4; x <= 5; x++) art[y] = art[y].substring(0, x) + 'n' + art[y].substring(x + 1);
    return { art, name: name3(['Una', 'casa', 'f', 'house', 'Una', 'casa'], adj), palette: { k: K, m: hex, r: C.r, n: C.n, b: C.b } };
  },

  function coet(rng) {
    const [hex, adj] = pick(rng, MAIN_COLORS.filter(([h]) => h !== '#f5d742'));
    const bodyW = pick(rng, [3, 2]), bodyBot = pick(rng, [6, 7]);
    const g = blank();
    rows(g, 0, 1, 4, 5); rows(g, 2, bodyBot, bodyW, 9 - bodyW);
    srow(g, bodyBot - 1, bodyW - 1, 10 - bodyW); srow(g, bodyBot, bodyW - 1, 10 - bodyW);
    det(g, 4, 3, 'c'); det(g, 5, 3, 'c'); det(g, 4, 4, 'c'); det(g, 5, 4, 'c');
    det(g, 4, bodyBot + 1, 'o'); det(g, 5, bodyBot + 1, 'o');
    det(g, 4, bodyBot + 2 > 9 ? 9 : bodyBot + 2, 'r'); det(g, 5, bodyBot + 2 > 9 ? 9 : bodyBot + 2, 'r');
    return { art: colorize(g, 'm'), name: name3(['Un', 'coet', 'm', 'rocket', 'Un', 'cohete'], adj), palette: { k: K, m: hex, c: C.c, o: C.o, r: C.r } };
  },

  function peix(rng) {
    const [hex, adj] = pick(rng, MAIN_COLORS.filter(([h]) => !['#f5f0e8', '#8b93a5'].includes(h)));
    const bodyW = pick(rng, [1, 2]), big = rng() > 0.5;
    const g = blank();
    srow(g, 3, bodyW + 1, 6); rows(g, 4, 5, bodyW, 7); srow(g, 6, bodyW + 1, 6);
    if (big) { px(g, 8, 2); px(g, 8, 3); px(g, 8, 4); px(g, 8, 5); px(g, 8, 6); px(g, 8, 7); px(g, 7, 3); px(g, 7, 6); }
    else { px(g, 8, 3); px(g, 8, 4); px(g, 8, 5); px(g, 8, 6); px(g, 7, 4); px(g, 7, 5); }
    det(g, bodyW + 1, 4, 'e');
    const art = colorize(g, 'm');
    return { art, name: name3(['Un', 'peix', 'm', 'fish', 'Un', 'pez'], adj), palette: { k: K, m: hex, e: C.e } };
  },

  function fantasma(rng) {
    const [hex, adj] = pick(rng, [['#f5f0e8', 'blanc'], ['#72e2c4', 'menta'], ['#a8d8ff', 'cel'], ['#f2a0c0', 'rosa'], ['#b47fe0', 'lila']]);
    const w = pick(rng, [1, 2]), bot = pick(rng, [7, 8]);
    const g = blank();
    srow(g, 2, w + 2, 7 - w); rows(g, 3, bot, w, 9 - w);
    if (bot === 7) { px(g, w, 8); px(g, w + 2, 8); px(g, 4, 8); px(g, 5, 8); px(g, 7 - w, 8); px(g, 9 - w, 8); }
    else { px(g, w, 9); px(g, w + 2, 9); px(g, 4, 9); px(g, 5, 9); px(g, 7 - w, 9); px(g, 9 - w, 9); }
    det(g, 3, 4, 'k'); det(g, 6, 4, 'k');
    if (rng() > 0.5) { det(g, 4, 6, 'k'); det(g, 5, 6, 'k'); }
    return { art: colorize(g, 'm'), name: name3(['Un', 'fantasma', 'm', 'ghost', 'Un', 'fantasma'], adj), palette: { k: K, m: hex } };
  },

  function cor(rng) {
    const [hex, adj] = pick(rng, [['#e5484d', 'vermell'], ['#f2a0c0', 'rosa'], ['#72e2c4', 'menta'], ['#b47fe0', 'lila'], ['#f5d742', 'groc']]);
    const top = pick(rng, [1, 2]);
    const g = blank();
    srow(g, top, 1, 2); srow(g, top, 6, 7); // bumps (sym covers both)
    rows(g, top + 1, top + 2, 0, 9); rows(g, top + 3, top + 3, 1, 8); rows(g, top + 4, top + 4, 2, 7); rows(g, top + 5, top + 5, 3, 6); rows(g, top + 6 > 9 ? 9 : top + 6, 9, 4, 5);
    return { art: colorize(g, 'm'), name: name3(['Un', 'cor', 'm', 'heart', 'Un', 'corazón'], adj), palette: { k: K, m: hex } };
  },

  function estrella(rng) {
    const [hex, adj] = pick(rng, [['#f5d742', 'groc'], ['#f0922e', 'taronja'], ['#f5f0e8', 'blanc'], ['#77b7ff', 'blau']]);
    const armRow = pick(rng, [3, 4]);
    const g = blank();
    rows(g, 0, armRow - 2, 4, 5); srow(g, armRow - 1, 3, 6); rows(g, armRow, armRow, 0, 9);
    rows(g, armRow + 1, armRow + 1, 1, 8); rows(g, armRow + 2, armRow + 3 > 8 ? 8 : armRow + 3, 2, 7);
    srow(g, 9, 1, 2); srow(g, 8, 1, 2); px(g, 4, 8); px(g, 5, 8);
    return { art: colorize(g, 'm'), name: name3(['Una', 'estrella', 'f', 'star', 'Una', 'estrella'], adj), palette: { k: K, m: hex } };
  },

  function gemma(rng) {
    const [hex, adj] = pick(rng, [['#77b7ff', 'blau'], ['#72e2c4', 'menta'], ['#b47fe0', 'lila'], ['#e5484d', 'vermell'], ['#f5d742', 'groc']]);
    const w = pick(rng, [1, 2]);
    const g = blank();
    srow(g, 1, w + 2, 7 - w); srow(g, 2, w + 1, 8 - w); rows(g, 3, 4, w, 9 - w); srow(g, 5, w + 1, 8 - w); srow(g, 6, w + 2, 7 - w); rows(g, 7, 8, 4, 5);
    det(g, 4, 2, 'w'); det(g, 3, 3, 'w');
    return { art: colorize(g, 'm'), name: name3(['Una', 'gemma', 'f', 'gem', 'Una', 'gema'], adj), palette: { k: K, m: hex, w: C.w } };
  },

  function tassa(rng) {
    const [hex, adj] = pick(rng, MAIN_COLORS.filter(([h]) => h !== '#f5d742'));
    const w = pick(rng, [2, 1]), top = pick(rng, [4, 3]), steam = rng() > 0.35;
    const g = blank();
    rows(g, top, 8, w, 9 - w - 2); rows(g, 9, 9, w - 1, 9 - w - 1);
    px(g, 9 - w - 1, top + 1); px(g, 9 - w, top + 1); px(g, 9 - w, top + 2); px(g, 9 - w - 1, top + 2); // nansa
    if (steam) { det(g, 3, top - 2, 'w'); det(g, 4, top - 3 > 0 ? top - 3 : 0, 'w'); det(g, 5, top - 2, 'w'); }
    return { art: colorize(g, 'm'), name: name3(['Una', 'tassa', 'f', 'mug', 'Una', 'taza'], adj), palette: { k: K, m: hex, w: C.w } };
  },

  function cactus(rng) {
    const armL = rng() > 0.3, armR = rng() > 0.3, flower = rng() > 0.5;
    const top = pick(rng, [1, 2]);
    const g = blank();
    rows(g, top, 9, 4, 5);
    if (armL) { px(g, 2, top + 2); px(g, 2, top + 3); px(g, 2, top + 4); px(g, 3, top + 4); }
    if (armR) { px(g, 7, top + 1); px(g, 7, top + 2); px(g, 7, top + 3); px(g, 6, top + 3); }
    if (flower) { det(g, 4, top - 1, 'r'); det(g, 5, top - 1, 'r'); }
    return { art: colorize(g, 'm'), name: name3(['Un', 'cactus', 'm', 'cactus', 'Un', 'cactus'], 'verd'), palette: { k: K, m: '#58b368', r: C.r } };
  },

  function marieta(rng) {
    const bee = rng() > 0.5;
    const w = pick(rng, [1, 2]);
    const g = blank();
    srow(g, 3, w + 2, 7 - w); rows(g, 4, 6, w, 9 - w); srow(g, 7, w + 1, 8 - w);
    det(g, 4, 2, 'k'); det(g, 5, 2, 'k');
    det(g, w + 1, 1, 'k'); det(g, 8 - w, 1, 'k');
    if (bee) {
      det(g, 2, 4, 'c'); det(g, 7, 4, 'c'); det(g, 2, 3, 'c'); det(g, 7, 3, 'c');
      const art = colorize(g, 'm');
      for (let x = 0; x < 10; x++) if (art[5][x] === 'm') art[5] = art[5].substring(0, x) + 'y' + art[5].substring(x + 1);
      return { art, name: name3(['Una', 'abella', 'f', 'bee', 'Una', 'abeja'], 'groc'), palette: { k: K, m: '#f5d742', c: C.c, y: '#f5d742' } };
    }
    det(g, 2, 4, 'k'); det(g, 7, 4, 'k'); det(g, 3, 6, 'k'); det(g, 6, 6, 'k');
    return { art: colorize(g, 'm'), name: name3(['Una', 'marieta', 'f', 'ladybug', 'Una', 'mariquita'], 'vermell'), palette: { k: K, m: '#e5484d' } };
  },

  function papallona(rng) {
    const [hex, adj] = pick(rng, MAIN_COLORS.filter(([h]) => !['#9a6a45', '#8b93a5'].includes(h)));
    const big = rng() > 0.5, spots = rng() > 0.4;
    const g = blank();
    if (big) { rows(g, 1, 4, 1, 3); rows(g, 5, 7, 2, 3); }
    else { rows(g, 2, 4, 1, 3); rows(g, 5, 6, 2, 3); }
    rows(g, 2, 7, 4, 5);
    det(g, 4, 1, 'k'); det(g, 5, 1, 'k');
    if (spots) { det(g, 2, 3, 'w'); det(g, 7, 3, 'w'); }
    const art = colorize(g, 'm');
    for (let y = 2; y <= 7; y++) for (let x = 4; x <= 5; x++) if (art[y][x] === 'm' || art[y][x] === 'k') art[y] = art[y].substring(0, x) + 'n' + art[y].substring(x + 1);
    return { art, name: name3(['Una', 'papallona', 'f', 'butterfly', 'Una', 'mariposa'], adj), palette: { k: K, m: hex, n: C.n, w: C.w } };
  },

  function barca(rng) {
    const [hex, adj] = pick(rng, [['#f5f0e8', 'blanc'], ['#72e2c4', 'menta'], ['#f5d742', 'groc'], ['#f2a0c0', 'rosa'], ['#77b7ff', 'blau']]);
    const sailH = pick(rng, [4, 5]), hullW = pick(rng, [1, 2]);
    const g = blank();
    rows(g, 7, 7, hullW, 9 - hullW); rows(g, 8, 8, hullW + 1, 8 - hullW);
    for (let y = 7 - sailH; y <= 6; y++) px(g, 4, y); // pal
    for (let y = 7 - sailH + 1; y <= 6; y++) for (let x = 5; x <= 5 + (y - (7 - sailH)); x++) px(g, x, y); // vela
    const art = colorize(g, 'm');
    for (let y = 7; y <= 8; y++) for (let x = 0; x < 10; x++) if (art[y][x] === 'm') art[y] = art[y].substring(0, x) + 'n' + art[y].substring(x + 1);
    for (let y = 7 - sailH; y <= 6; y++) if (art[y][4] === 'm') art[y] = art[y].substring(0, 4) + 'n' + art[y].substring(5);
    return { art, name: name3(['Una', 'barca', 'f', 'boat', 'Una', 'barca'], adj), palette: { k: K, m: hex, n: C.n } };
  },
];

/* ---------- quality filter ---------- */
function maskOf(art) { return art.map(r => r.split('').map(c => c === '.' ? 0 : 1)); }
function density(m) { return m.flat().filter(Boolean).length / 100; }
function largestComponent(m) {
  const seen = Array.from({ length: 10 }, () => new Array(10).fill(false));
  let best = 0;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    if (!m[y][x] || seen[y][x]) continue;
    let size = 0; const q = [[x, y]]; seen[y][x] = true;
    while (q.length) { const [cx, cy] = q.pop(); size++;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10 && m[ny][nx] && !seen[ny][nx]) { seen[ny][nx] = true; q.push([nx, ny]); }
      } }
    best = Math.max(best, size);
  }
  return best;
}
function shiftArt(art, dx, dy) {
  const out = Array.from({ length: 10 }, () => '..........');
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const ch = art[y][x];
    if (ch === '.') continue;
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx > 9 || ny < 0 || ny > 9) return null;
    out[ny] = out[ny].substring(0, nx) + ch + out[ny].substring(nx + 1);
  }
  return out;
}
const SHIFTS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [0, 2], [-2, 0], [0, -2]];
const REASONS = {};
function accept(art, seenHashes) {
  const rej = (r) => { REASONS[r] = (REASONS[r] || 0) + 1; return false; };
  const m = maskOf(art);
  const hash = m.map(r => r.join('')).join('');
  if (seenHashes.has(hash)) return rej('dupe');
  const d = density(m);
  if (d < 0.25 || d > 0.75) return rej('density');
  const rowUsed = m.filter(r => r.some(Boolean)).length;
  const colUsed = m[0].map((_, x) => m.some(r => r[x])).filter(Boolean).length;
  if (rowUsed < 6 || colUsed < 6) return rej('spread');
  if (largestComponent(m) < m.flat().filter(Boolean).length * 0.6) return rej('connectivity');
  if (countSolutions(m) !== 1) return rej('solver');
  seenHashes.add(hash);
  return true;
}

/* ---------- build the queue ---------- */
const seenHashes = new Set();
const queue = [];
for (const p of HAND_DRAWN) {
  const m = maskOf(p.art);
  seenHashes.add(m.map(r => r.join('')).join(''));
  queue.push({ i: p.id, n: [p.name.ca, p.name.en, p.name.es], p: p.palette, art: p.art });
}

const rng = mulberry32(20260920);
const perFamily = Math.ceil((TARGET - queue.length) / FAMILIES.length) + 12;
const slugCounts = {};
/* practice set: 9 generated extras (not in the queue), 3 per difficulty band */
function diffOf(art) { const d = density(maskOf(art)); return d < 0.4 ? 1 : d < 0.55 ? 2 : 3; }
const practice = [];
{
  const byDiff = { 1: [], 2: [], 3: [] };
  let tries = 0;
  while (tries < 3000 && practice.length < 9) {
    tries++;
    const fam = pick(rng, FAMILIES);
    let cand;
    try { cand = fam(rng); } catch { continue; }
    if (!cand || !cand.art || cand.art.length !== 10) continue;
    let okArt = null;
    for (const [dx, dy] of SHIFTS) {
      const a2 = (dx || dy) ? shiftArt(cand.art, dx, dy) : cand.art;
      if (a2 && accept(a2, seenHashes)) { okArt = a2; break; }
    }
    if (!okArt) continue;
    const d = diffOf(okArt);
    if (byDiff[d].length >= 3) { for (const [dx, dy] of SHIFTS) { /* keep looking */ } seenHashes.delete(maskOf(okArt).map(r => r.join('')).join('')); continue; }
    cand.art = okArt;
    const base = 'practica-' + cand.name[1].toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
    slugCounts[base] = (slugCounts[base] || 0) + 1;
    const entry = { i: `${base}-${slugCounts[base]}`, n: cand.name, p: cand.palette, art: cand.art, d };
    byDiff[d].push(entry); practice.push(entry);
  }
}


const PERFAM = {};
for (const fam of FAMILIES) {
  let accepted = 0, tries = 0;
  while (accepted < perFamily && tries < 3000) {
    tries++;
    let cand;
    try { cand = fam(rng); } catch { continue; }
    if (!cand || !cand.art || cand.art.length !== 10 || cand.art.some(r => r.length !== 10)) continue;
    let okArt = null;
    for (const [dx, dy] of SHIFTS) {
      const a2 = (dx || dy) ? shiftArt(cand.art, dx, dy) : cand.art;
      if (a2 && accept(a2, seenHashes)) { okArt = a2; break; }
    }
    if (!okArt) continue;
    const base = cand.name[1].toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
    slugCounts[base] = (slugCounts[base] || 0) + 1;
    queue.push({ i: `g-${base}-${slugCounts[base]}`, n: cand.name, p: cand.palette, art: okArt });
    accepted++;
  }
  PERFAM[fam.name] = accepted;
}

const generated = queue.slice(HAND_DRAWN.length);

/* ---------- encode + emit ---------- */
const b64 = (art) => Buffer.from(art.join('\n'), 'utf8').toString('base64');
const enc = (e) => {
  const o = { i: e.i, n: e.n, p: e.p, a: b64(e.art) };
  if (e.d) o.d = e.d;
  return JSON.stringify(o);
};
const out = `// GENERATED by tools/fabrica.mjs - do not edit by hand. Regenerate: node tools/fabrica.mjs
// PACK: daily queue, in order. The first ${HAND_DRAWN.length} are the hand-drawn originals.
// Entries are base64-encoded art so future dailies are not readable at a glance.
export const PACK = [
${queue.map(e => '  ' + enc(e)).join(',\n')}
];

// PRACTICE: small practice set at 3 difficulty levels (1 easy, 2 medium, 3 hard). Never in the daily queue.
export const PRACTICE = [
${practice.map(e => '  ' + enc(e)).join(',\n')}
];

export function decodePuzzle(e) {
  const art = atob(e.a).split('\\n');
  return { id: e.i, size: art.length, name: { ca: e.n[0], en: e.n[1], es: e.n[2] }, palette: e.p, art, difficulty: e.d || 0 };
}
`;
writeFileSync(new URL('../site/js/puzzles.js', import.meta.url), out);
console.log('per-family made:', JSON.stringify(PERFAM));
console.log('rejection reasons:', JSON.stringify(REASONS));
console.log(`queue: ${queue.length} puzzles (${HAND_DRAWN.length} hand-drawn + ${generated.length} generated), practice: ${practice.length}`);
console.log('difficulty spread of generated:', JSON.stringify(generated.reduce((acc, e) => { const d = diffOf(e.art); acc[d] = (acc[d] || 0) + 1; return acc; }, {})));
