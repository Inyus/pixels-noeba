// Nonogram uniqueness solver (line-propagation + search). Shared by validate.mjs and tools/fabrica.mjs.
export function solverCluesOf(line) {
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
export function countSolutions(grid, cap = 2) {
  const h = grid.length, w = grid[0].length;
  const rowClues = grid.map(solverCluesOf);
  const colClues = []; for (let x = 0; x < w; x++) colClues.push(solverCluesOf(grid.map(r => r[x])));
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


