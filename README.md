# pixels.noeba

**A free daily nonogram with a full-color pixel-art reveal.** One new puzzle every day, three hearts, a streak to keep, and a share grid made of emoji. No signup, no ads, no server — the whole game runs in your browser.

Play it: **https://pixels.noeba.cat**

## What it is

- A date-seeded **daily puzzle** (like the daily word games everyone plays, but visual): solve the nonogram, reveal the pixel-art picture in color.
- **46 hand-drawn puzzles** (10x10), every one machine-verified to have exactly one logical solution, so a wrong fill is always a real mistake.
- **3 hearts** per attempt, unlimited retries, timer, win screen with the revealed art.
- **Streak + stats** stored locally (nothing leaves your device).
- **Share card**: day number, time, hearts left, and the picture as an emoji grid — safe to paste anywhere.
- **Archive**: every puzzle playable any time as practice.
- **Three complete languages**: Catalan (default), English, Spanish.
- Keyboard play (arrows + space/X), touch drag with fill/cross modes, right-click to cross on desktop.

## Tech

Plain HTML/CSS/JS. No build step, no dependencies, no backend, no tracking. State lives in `localStorage`. Deployed as static assets on Cloudflare.

```
site/            the whole app (served as-is)
  js/core.js     pure logic: clues, win check, daily seed, share text
  js/puzzles.js  the puzzle bank (each sprite is both puzzle and reveal)
  js/game.js     engine: canvas board, input, modals, persistence
  js/i18n.js     CA/EN/ES strings
test/validate.mjs  bank integrity + nonogram uniqueness solver + i18n parity
```

## Validate

```
node test/validate.mjs
```

Checks every puzzle has exactly one solution, row lengths, palette coverage, names in all three languages, i18n key parity, and that `index.html` references every asset and existing i18n keys.

## License

MIT — see [LICENSE](LICENSE).
