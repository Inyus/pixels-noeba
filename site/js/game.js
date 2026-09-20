// pixels.noeba - game engine. Daily nonogram with hearts, streaks, share grid, archive.
import { I18N } from './i18n.js';
import { PACK, PRACTICE, decodePuzzle } from './puzzles.js';
import {
  LAUNCH_DAY, localDayKey, dailyPuzzle, puzzleClues, isWon, lineComplete,
  fmtTime, shareText, gridOf,
} from './core.js';

// The daily queue: hand-drawn originals first, then factory-generated puzzles.
// Future dailies ship base64-encoded in PACK and are decoded here on load.
const PUZZLES = PACK.map(decodePuzzle);
const PRACTICE_PUZZLES = PRACTICE.map(decodePuzzle);

function keyForIndex(idx) {
  const d = new Date(Date.parse(LAUNCH_DAY + 'T00:00:00') + idx * 86400000);
  return localDayKey(d);
}

const $ = (s) => document.querySelector(s);
const canvas = $('#board');
const ctx = canvas.getContext('2d');

/* ---------------- i18n ---------------- */
const urlParams = new URLSearchParams(location.search);
let lang = urlParams.get('lang') || localStorage.getItem('pixels:lang') || 'ca';
if (!I18N[lang]) lang = 'ca';
if (urlParams.get('lang') && I18N[urlParams.get('lang')]) localStorage.setItem('pixels:lang', lang);
const t = (k, vars) => {
  let s = I18N[lang][k] || I18N.ca[k] || k;
  if (vars) for (const [kk, vv] of Object.entries(vars)) s = s.replace('{' + kk + '}', vv);
  return s;
};
function applyI18n() {
  document.documentElement.lang = lang;
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]').setAttribute('content', t('meta.description'));
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  canvas.setAttribute('aria-label', t('a11y.board'));
  document.querySelectorAll('.langs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  if (game.puzzle) {
    $('#puzzleLabel').textContent = game.isDaily ? `${t('game.daily')} #${game.number}` : `${t('game.practice')} #${game.number}`;
    $('#puzzleDate').textContent = game.isDaily ? dayLabel() : '';
  }
}
document.querySelectorAll('.langs button').forEach(b => b.addEventListener('click', () => {
  lang = b.dataset.lang; localStorage.setItem('pixels:lang', lang); applyI18n(); renderHearts();
}));

function dayLabel() {
  const d = new Date();
  const names = ['day.sun', 'day.mon', 'day.tue', 'day.wed', 'day.thu', 'day.fri', 'day.sat'];
  return t(names[d.getDay()]) + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

/* ---------------- persistence ---------------- */
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let stats = store.get('pixels:stats', { played: 0, won: 0, streak: 0, best: 0, lastDailyKey: '', totalSec: 0, wonIds: [] });

/* ---------------- game state ---------------- */
const game = {
  puzzle: null, clues: null, isDaily: true, number: 0, key: '',
  cells: [], hearts: 3, seconds: 0, status: 'idle', // idle|playing|revealing|won|failed
  drag: null, cursor: { x: -1, y: -1 }, flashes: new Map(), revealAt: new Map(),
};

function storageKey() { return game.isDaily ? 'pixels:game:' + game.key : 'pixels:practice:' + game.puzzle.id; }

function startGame(puzzle, isDaily, number, key) {
  stopTimer();
  const saved = store.get(storageKeyFor(isDaily, key, puzzle), null);
  game.puzzle = puzzle; game.clues = puzzleClues(puzzle);
  game.isDaily = isDaily; game.number = number; game.key = key;
  game.cells = saved?.cells || Array.from({ length: puzzle.size }, () => new Array(puzzle.size).fill(0));
  game.hearts = saved?.hearts ?? 3;
  game.seconds = saved?.seconds || 0;
  game.status = saved?.status === 'won' ? 'won' : 'idle';
  game.drag = null; game.flashes.clear(); game.revealAt.clear();
  if (game.status === 'won') markRevealed(0);
  $('#puzzleLabel').textContent = isDaily ? `${t('game.daily')} #${number}` : `${t('game.practice')} · ${t('diff.' + (puzzle.difficulty || 2))}`;
  $('#puzzleLabel').classList.toggle('practice', !isDaily);
  $('#puzzleDate').textContent = isDaily ? dayLabel() : '';
  layout(); renderClues(); renderHearts(); updateTimerText(); draw();
}
function storageKeyFor(isDaily, key, puzzle) { return isDaily ? 'pixels:game:' + key : 'pixels:practice:' + puzzle.id; }
function persist() {
  store.set(storageKey(), { cells: game.cells, hearts: game.hearts, seconds: game.seconds, status: game.status });
}

/* ---------------- hearts ---------------- */
const HEART_MAP = [
  '.XX.XX.',
  'XXXXXXX',
  'XXXXXXX',
 '.XXXXX.',
  '..XXX..',
  '...X...',
];
function heartSvg(full) {
  const color = full ? '#e5484d' : '#23313d';
  let rects = '';
  HEART_MAP.forEach((row, y) => row.split('').forEach((c, x) => { if (c === 'X') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return `<svg viewBox="0 0 7 6" shape-rendering="crispEdges" fill="${color}" aria-hidden="true">${rects}</svg>`;
}
function renderHearts() {
  $('#hearts').innerHTML = [0, 1, 2].map(i => heartSvg(i < game.hearts)).join('');
  $('#hearts').setAttribute('aria-label', `${game.hearts}/3 ${t('game.hearts')}`);
}

/* ---------------- timer ---------------- */
let timerId = null;
function startTimer() {
  if (timerId) return;
  timerId = setInterval(() => { game.seconds++; updateTimerText(); if (game.seconds % 5 === 0) persist(); }, 1000);
}
function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
function updateTimerText() { $('#timer').textContent = fmtTime(game.seconds); }

/* ---------------- layout + clues ---------------- */
let cell = 40, rowClueW = 90, colClueH = 80;
function layout() {
  const wrapW = $('.board-wrap').clientWidth;
  const n = game.puzzle.size;
  const maxCluesRow = Math.max(...game.clues.rows.map(c => c.length));
  const maxCluesCol = Math.max(...game.clues.cols.map(c => c.length));
  const avail = Math.min(wrapW, 560);
  rowClueW = Math.max(56, Math.min(avail * 0.26, 24 * maxCluesRow + 22));
  cell = Math.max(22, Math.floor((avail - rowClueW) / n));
  const boardPx = cell * n;
  rowClueW = avail - boardPx > 56 ? avail - boardPx : rowClueW;
  colClueH = maxCluesCol * Math.max(15, Math.round(cell * 0.42)) + 8;
  const grid = $('#boardGrid');
  grid.style.gridTemplateColumns = rowClueW + 'px ' + boardPx + 'px';
  grid.style.gridTemplateRows = colClueH + 'px ' + boardPx + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = boardPx + 'px'; canvas.style.height = boardPx + 'px';
  canvas.width = Math.round(boardPx * dpr); canvas.height = Math.round(boardPx * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function renderClues() {
  const n = game.puzzle.size;
  const fs = Math.max(11, Math.round(cell * 0.36));
  const cc = $('#colClues'), rc = $('#rowClues');
  cc.innerHTML = ''; rc.innerHTML = '';
  game.clues.cols.forEach((cl, x) => {
    const d = document.createElement('div');
    d.className = 'clue-col'; d.style.width = cell + 'px'; d.style.height = colClueH + 'px'; d.dataset.i = x;
    d.innerHTML = cl.map(v => `<span style="font-size:${fs}px">${v}</span>`).join('');
    cc.appendChild(d);
  });
  game.clues.rows.forEach((cl, y) => {
    const d = document.createElement('div');
    d.className = 'clue-row'; d.style.height = cell + 'px'; d.style.width = rowClueW + 'px'; d.dataset.i = y;
    d.innerHTML = cl.map(v => `<span style="font-size:${fs}px">${v}</span>`).join('');
    rc.appendChild(d);
  });
  refreshClueState();
}
function refreshClueState(hotX = -1, hotY = -1) {
  const won = game.status === 'won' || game.status === 'revealing';
  document.querySelectorAll('.clue-col').forEach(d => {
    const i = +d.dataset.i;
    d.classList.toggle('done', won || lineComplete(game.puzzle, game.cells, 'col', i));
    d.classList.toggle('hot', i === hotX);
  });
  document.querySelectorAll('.clue-row').forEach(d => {
    const i = +d.dataset.i;
    d.classList.toggle('done', won || lineComplete(game.puzzle, game.cells, 'row', i));
    d.classList.toggle('hot', i === hotY);
  });
}

/* ---------------- drawing ---------------- */
const C = { bg: '#101720', cell: '#131d27', line: '#23313d', line5: '#31424f', fill: '#72e2c4', cross: '#91a3ad', hot: 'rgba(114,226,196,.055)', cur: '#f0b429', err: '#e5484d' };
function draw() {
  const n = game.puzzle.size;
  ctx.clearRect(0, 0, cell * n, cell * n);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, cell * n, cell * n);
  const hx = game.cursor.x, hy = game.cursor.y;
  if (hx >= 0 && game.status === 'playing') {
    ctx.fillStyle = C.hot;
    ctx.fillRect(hx * cell, 0, cell, cell * n);
    ctx.fillRect(0, hy * cell, cell * n, cell);
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = x * cell, py = y * cell;
    ctx.fillStyle = C.cell; ctx.fillRect(px, py, cell, cell);
    const v = game.cells[y][x];
    const revealK = game.revealAt.get(y * n + x);
    if (revealK != null) {
      const now = performance.now();
      const pr = Math.min(1, Math.max(0, (now - revealK) / 220));
      const col = game.puzzle.palette[game.puzzle.art[y][x]];
      const inset = (1 - pr) * cell * 0.3;
      ctx.fillStyle = col;
      ctx.fillRect(px + 1 + inset, py + 1 + inset, cell - 2 - inset * 2, cell - 2 - inset * 2);
    } else if (v === 1) {
      ctx.fillStyle = C.fill; ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
    } else if (v === 2) {
      ctx.strokeStyle = C.cross; ctx.lineWidth = Math.max(1.5, cell * 0.06);
      const m = cell * 0.28;
      ctx.beginPath(); ctx.moveTo(px + m, py + m); ctx.lineTo(px + cell - m, py + cell - m);
      ctx.moveTo(px + cell - m, py + m); ctx.lineTo(px + m, py + cell - m); ctx.stroke();
    }
    const fl = game.flashes.get(y * n + x);
    if (fl && performance.now() - fl < 550) {
      ctx.fillStyle = 'rgba(229,72,77,.75)'; ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
    } else if (fl) game.flashes.delete(y * n + x);
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell + .5, 0); ctx.lineTo(i * cell + .5, cell * n); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell + .5); ctx.lineTo(cell * n, i * cell + .5); ctx.stroke();
  }
  ctx.strokeStyle = C.line5; ctx.lineWidth = 2;
  for (let i = 5; i < n; i += 5) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, cell * n); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(cell * n, i * cell); ctx.stroke();
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(1, 1, cell * n - 2, cell * n - 2);
  if (hx >= 0 && game.status === 'playing') {
    ctx.strokeStyle = C.cur; ctx.lineWidth = 2;
    ctx.strokeRect(hx * cell + 1, hy * cell + 1, cell - 2, cell - 2);
  }
}

/* ---------------- input ---------------- */
function canvasCell(e) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell);
  if (x < 0 || y < 0 || x >= game.puzzle.size || y >= game.puzzle.size) return null;
  return { x, y };
}
function beginIfIdle() { if (game.status === 'idle') { game.status = 'playing'; startTimer(); } }
function applyCell(x, y, action) {
  const n = game.puzzle.size, v = game.cells[y][x], sol = gridOf(game.puzzle)[y][x] === 1;
  if (action === 'fill' && v === 0) {
    if (sol) { game.cells[y][x] = 1; }
    else {
      game.cells[y][x] = 2;
      game.flashes.set(y * n + x, performance.now());
      game.hearts = Math.max(0, game.hearts - 1);
      renderHearts();
      setTimeout(draw, 30);
      if (game.hearts === 0) { failGame(); return; }
    }
  } else if (action === 'erase' && v === 1) game.cells[y][x] = 0;
  else if (action === 'cross' && v === 0) game.cells[y][x] = 2;
  else if (action === 'uncross' && v === 2) game.cells[y][x] = 0;
  else return;
  game.cursor = { x, y };
  refreshClueState(x, y); draw();
  if (isWon(game.puzzle, game.cells)) winGame(); else persist();
}
function actionFor(x, y, crossMode) {
  const v = game.cells[y][x];
  if (!crossMode) return v === 1 ? 'erase' : 'fill';
  return v === 2 ? 'uncross' : 'cross';
}
let crossMode = false;
function setMode(cross) {
  crossMode = cross;
  $('#modeFill').setAttribute('aria-pressed', String(!cross));
  $('#modeCross').setAttribute('aria-pressed', String(cross));
}
$('#modeFill').addEventListener('click', () => setMode(false));
$('#modeCross').addEventListener('click', () => setMode(true));

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (game.status === 'won' || game.status === 'revealing' || game.status === 'failed') return;
  const c = canvasCell(e); if (!c) return;
  e.preventDefault(); canvas.setPointerCapture(e.pointerId); canvas.focus();
  beginIfIdle();
  const cross = e.button === 2 || (e.pointerType === 'touch' && crossMode) || (e.pointerType === 'mouse' && crossMode);
  const action = actionFor(c.x, c.y, cross);
  game.drag = { action, last: c };
  applyCell(c.x, c.y, action);
});
canvas.addEventListener('pointermove', e => {
  if (!game.drag || game.status !== 'playing') return;
  const c = canvasCell(e); if (!c) return;
  if (c.x === game.drag.last.x && c.y === game.drag.last.y) return;
  game.drag.last = c;
  applyCell(c.x, c.y, game.drag.action);
});
const endDrag = () => { game.drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', e => { if (!game.drag) { game.cursor = { x: -1, y: -1 }; refreshClueState(); draw(); } });

canvas.addEventListener('keydown', e => {
  if (game.status !== 'playing' && game.status !== 'idle') return;
  const n = game.puzzle.size;
  let { x, y } = game.cursor;
  if (x < 0) { x = Math.floor(n / 2); y = Math.floor(n / 2); }
  const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (moves[e.key]) {
    e.preventDefault();
    x = (x + moves[e.key][0] + n) % n; y = (y + moves[e.key][1] + n) % n;
    game.cursor = { x, y }; refreshClueState(x, y); draw();
  } else if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'f') {
    e.preventDefault(); beginIfIdle(); applyCell(x, y, actionFor(x, y, false));
  } else if (e.key.toLowerCase() === 'x') {
    e.preventDefault(); beginIfIdle(); applyCell(x, y, actionFor(x, y, true));
  }
});

/* ---------------- win / fail ---------------- */
function markRevealed(stagger) {
  const n = game.puzzle.size;
  const t0 = performance.now();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (game.puzzle.art[y][x] !== '.') game.revealAt.set(y * n + x, t0 + stagger * (x + y) * 55);
  }
}
function winGame() {
  game.status = 'revealing';
  stopTimer(); persist();
  const n = game.puzzle.size;
  markRevealed(1);
  refreshClueState(); 
  const animEnd = (2 * (n - 1)) * 55 + 260;
  const anim = () => { draw(); if (performance.now() < performance.__animEnd) requestAnimationFrame(anim); };
  performance.__animEnd = performance.now() + animEnd;
  requestAnimationFrame(anim);
  setTimeout(() => {
    game.status = 'won'; persist(); draw();
    recordWin();
    openWinModal();
  }, animEnd + 220);
}
function recordWin() {
  const first = !stats.wonIds.includes(game.puzzle.id);
  if (first) { stats.wonIds.push(game.puzzle.id); stats.won++; stats.played++; stats.totalSec += game.seconds; }
  if (game.isDaily) {
    const today = game.key;
    if (stats.lastDailyKey !== today) {
      const yKey = localDayKey(new Date(Date.now() - 86400000));
      stats.streak = stats.lastDailyKey === yKey ? stats.streak + 1 : 1;
      stats.lastDailyKey = today;
      stats.best = Math.max(stats.best, stats.streak);
    }
  }
  store.set('pixels:stats', stats);
}
function failGame() {
  game.status = 'failed'; stopTimer(); persist(); draw();
  openModal(`
    <button class="close-x" data-close>✕</button>
    <h2>${t('fail.title')}</h2>
    <p>${t('fail.text')}</p>
    <div class="btn-row"><button class="btn" id="btnRetry">${t('fail.retry')}</button></div>
  `);
  $('#btnRetry').addEventListener('click', () => {
    closeModal();
    game.cells = Array.from({ length: game.puzzle.size }, () => new Array(game.puzzle.size).fill(0));
    game.hearts = 3; game.seconds = 0; game.status = 'idle';
    persist(); renderHearts(); updateTimerText(); refreshClueState(); draw();
  });
}

/* ---------------- modals ---------------- */
const backdrop = $('#modalBackdrop'), modal = $('#modal');
function openModal(html) {
  modal.innerHTML = html;
  backdrop.hidden = false;
  modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
}
function closeModal() { backdrop.hidden = true; modal.innerHTML = ''; clearInterval(countdownId); }
backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !backdrop.hidden) closeModal(); });

let countdownId = null;
function openWinModal() {
  const name = game.puzzle.name[lang] || game.puzzle.name.ca;
  const avg = stats.won ? fmtTime(Math.round(stats.totalSec / stats.won)) : '—';
  openModal(`
    <button class="close-x" data-close>✕</button>
    <h2>${t('win.title')}</h2>
    <p class="reveal-name">${t('win.revealed', { name })}</p>
    <div class="stats-grid">
      <div class="stat-box"><b>${fmtTime(game.seconds)}</b><span>${t('win.time')}</span></div>
      <div class="stat-box"><b>${'❤️'.repeat(game.hearts) || '🖤'}</b><span>${t('game.hearts')}</span></div>
      <div class="stat-box"><b>${stats.streak}</b><span>${t('win.streak')}</span></div>
    </div>
    <div class="btn-row">
      <button class="btn" id="btnShare">${t('win.share')}</button>
      <button class="btn secondary" id="btnWinArchive">${t('win.archive')}</button>
    </div>
    ${game.isDaily ? '<p class="countdown" id="countdown"></p>' : ''}
  `);
  $('#btnShare').addEventListener('click', async () => {
    const text = shareText({ number: game.isDaily ? game.number : 0, seconds: game.seconds, heartsLeft: game.hearts, puzzle: game.puzzle });
    const btn = $('#btnShare');
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); btn.textContent = t('win.copied'); setTimeout(() => { btn.textContent = t('win.share'); }, 1600); }
    catch { window.prompt('', text); }
  });
  $('#btnWinArchive').addEventListener('click', () => { openArchiveModal(); });
  if (game.isDaily) {
    const cd = $('#countdown');
    const tick = () => {
      const now = new Date(); const next = new Date(now); next.setHours(24, 0, 0, 0);
      const s = Math.max(0, Math.floor((next - now) / 1000));
      const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
      cd.textContent = `${t('win.next')} ${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    };
    tick(); countdownId = setInterval(tick, 1000);
  }
}

$('#btnHowto').addEventListener('click', () => openModal(`
  <button class="close-x" data-close>✕</button>
  <h2>${t('howto.title')}</h2>
  <p>${t('howto.p1')}</p><p>${t('howto.p2')}</p><p>${t('howto.p3')}</p>
  <div class="btn-row"><button class="btn" data-close>${t('howto.close')}</button></div>
`));
$('#btnStats').addEventListener('click', () => {
  const avg = stats.won ? fmtTime(Math.round(stats.totalSec / stats.won)) : '—';
  openModal(`
    <button class="close-x" data-close>✕</button>
    <h2>${t('stats.title')}</h2>
    <div class="stats-grid">
      <div class="stat-box"><b>${stats.played}</b><span>${t('stats.played')}</span></div>
      <div class="stat-box"><b>${stats.won}</b><span>${t('stats.won')}</span></div>
      <div class="stat-box"><b>${stats.streak}</b><span>${t('stats.streak')}</span></div>
      <div class="stat-box"><b>${stats.best}</b><span>${t('stats.best')}</span></div>
      <div class="stat-box"><b>${avg}</b><span>${t('stats.avgtime')}</span></div>
    </div>
    <div class="btn-row"><button class="btn secondary" data-close>${t('stats.close')}</button></div>
  `);
});

function archiveItem(p, num, label, solved) {
  return `<button class="archive-item" data-pid="${p.id}">
    ${solved ? '<span class="tick">✓</span>' : ''}
    <canvas width="${p.size * 8}" height="${p.size * 8}"></canvas>
    <span class="num">${label}</span>
  </button>`;
}

function paintPreview(btn, p) {
  const cv = btn.querySelector('canvas'), cx = cv.getContext('2d');
  p.art.forEach((row, y) => row.split('').forEach((ch, x) => {
    cx.fillStyle = ch === '.' ? '#0d1319' : p.palette[ch];
    cx.fillRect(x * 8, y * 8, 8, 8);
  }));
}

function openArchiveModal() {
  // Only already-released dailies are listed: the future queue stays hidden.
  const { number: todayNum, puzzle: todayPuzzle } = dailyPuzzle(PUZZLES, localDayKey());
  const released = PUZZLES.slice(0, todayNum);
  const dailyItems = released.map((p, i) => {
    const num = i + 1;
    const label = `#${num}${num === todayNum ? ' · ' + t('game.daily') : ''}`;
    return archiveItem(p, num, label, stats.wonIds.includes(p.id));
  }).join('');
  const practiceItems = PRACTICE_PUZZLES.map((p) => {
    const label = `${t('diff.' + (p.difficulty || 2))}`;
    return archiveItem(p, 0, label, stats.wonIds.includes(p.id));
  }).join('');
  openModal(`
    <button class="close-x" data-close>✕</button>
    <h2>${t('archive.title')}</h2>
    <h3 class="archive-h">${t('archive.dailies')}</h3>
    <div class="archive-grid">${dailyItems}</div>
    <h3 class="archive-h">${t('archive.practice')}</h3>
    <div class="archive-grid">${practiceItems}</div>
    <div class="btn-row"><button class="btn secondary" data-close>${t('archive.close')}</button></div>
  `);
  modal.querySelectorAll('.archive-item').forEach(btn => {
    const p = PUZZLES.find(pp => pp.id === btn.dataset.pid) || PRACTICE_PUZZLES.find(pp => pp.id === btn.dataset.pid);
    if (!p) return;
    paintPreview(btn, p);
    btn.addEventListener('click', () => {
      closeModal();
      if (p.id === todayPuzzle.id) { startGame(todayPuzzle, true, todayNum, localDayKey()); return; }
      const idx = PUZZLES.indexOf(p);
      if (idx >= 0) {
        // Replaying a past daily reopens that day's saved game.
        startGame(p, true, idx + 1, keyForIndex(idx));
      } else {
        startGame(p, false, 0, '');
      }
    });
  });
}
$('#btnArchive').addEventListener('click', openArchiveModal);

/* ---------------- boot ---------------- */
window.addEventListener('resize', () => { layout(); renderClues(); draw(); });
const { number: bootNum, puzzle: bootPuzzle } = dailyPuzzle(PUZZLES, localDayKey());
startGame(bootPuzzle, true, bootNum, localDayKey());
applyI18n();
if (!store.get('pixels:howto-seen', false) && !urlParams.has('nointro')) {
  store.set('pixels:howto-seen', true);
  $('#btnHowto').click();
}
