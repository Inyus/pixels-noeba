// Pixels Noeba - pure game logic (no DOM). Imported by game.js and test/validate.mjs.

export const LAUNCH_DAY = '2026-09-20'; // puzzle #1

export function localDayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayIndex(key = localDayKey()) {
  const ms = Date.parse(key + 'T00:00:00') - Date.parse(LAUNCH_DAY + 'T00:00:00');
  return Math.max(0, Math.round(ms / 86400000));
}

export function dailyPuzzle(puzzles, key) {
  const idx = dayIndex(key);
  return { number: idx + 1, puzzle: puzzles[idx % puzzles.length] };
}

export function gridOf(puzzle) {
  return puzzle.art.map(r => r.split('').map(c => c === '.' ? 0 : 1));
}

export function cluesOf(line) {
  const clues = []; let run = 0;
  for (const c of line) { if (c) run++; else if (run) { clues.push(run); run = 0; } }
  if (run) clues.push(run);
  return clues.length ? clues : [0];
}

export function puzzleClues(puzzle) {
  const g = gridOf(puzzle);
  const rows = g.map(cluesOf);
  const cols = [];
  for (let x = 0; x < puzzle.size; x++) cols.push(cluesOf(g.map(r => r[x])));
  return { rows, cols };
}

// cells: 0 unknown, 1 filled, 2 crossed
export function isWon(puzzle, cells) {
  const g = gridOf(puzzle);
  for (let y = 0; y < puzzle.size; y++)
    for (let x = 0; x < puzzle.size; x++)
      if ((g[y][x] === 1) !== (cells[y][x] === 1)) return false;
  return true;
}

export function lineComplete(puzzle, cells, axis, i) {
  const g = gridOf(puzzle);
  for (let j = 0; j < puzzle.size; j++) {
    const sol = axis === 'row' ? g[i][j] : g[j][i];
    const cur = axis === 'row' ? cells[i][j] : cells[j][i];
    if (sol === 1 && cur !== 1) return false;
    if (sol === 0 && cur === 1) return false;
  }
  return true;
}

const CHAR_EMOJI = {
  k: '⬛', w: '⬜', e: '⬜', r: '🟥', o: '🟧', y: '🟨',
  g: '🟩', t: '🟩', b: '🟦', c: '🟦', p: '🟪', i: '🟪', n: '🟫',
};

export function artEmoji(puzzle) {
  return puzzle.art.map(row =>
    row.split('').map(c => c === '.' ? '⬛' : (CHAR_EMOJI[c] || '⬜')).join('')
  ).join('\n');
}

// Monochrome Wordle-style share grid: filled vs empty, always readable.
export function gridEmoji(puzzle) {
  return gridOf(puzzle).map(row => row.map(c => (c ? '🟩' : '⬛')).join('')).join('\n');
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function shareText({ number, seconds, heartsLeft, puzzle }) {
  const hearts = '❤️'.repeat(heartsLeft) + '🖤'.repeat(Math.max(0, 3 - heartsLeft));
  const head = number ? `Pixels #${number} · ${fmtTime(seconds)} · ${hearts}` : `Pixels · ${fmtTime(seconds)} · ${hearts}`;
  return `${head}\n${gridEmoji(puzzle)}\nhttps://pixels.noeba.cat`;
}
