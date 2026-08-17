/**
 * Torch brightness ladder: same corridor, same frame, several light multipliers.
 * Used to pick the flashlight intensity by eye instead of by arithmetic.
 *
 *   node tools/lightcheck.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, 'light');
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
  defaultViewport: { width: 1024, height: 576 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  PAGEERROR', e.message));

await page.goto(process.env.URL ?? 'http://127.0.0.1:4173/', {
  waitUntil: 'networkidle2',
  timeout: 60000,
});
await page.waitForFunction(() => !document.getElementById('menu').classList.contains('hidden'), {
  timeout: 120000,
});
await page.click('#btn-play');
await page.waitForFunction(
  () => !document.getElementById('click-to-play').classList.contains('hidden'),
  { timeout: 120000 },
);
await page.click('#click-to-play');

await page.evaluate(() => {
  const g = window.__hollow.game;
  g.mode = 'playing';
  g.input.enabled = true;
  g.input.locked = true;
  g.director.update = () => {};
  document.getElementById('hud').classList.add('hidden');

  // Longest straight corridor, standing at one end looking down it.
  const maze = g.level.maze;
  let best = null;
  let bestLen = 0;
  for (const c of maze.floors) {
    if (maze.roomId[maze.idx(c.x, c.y)] >= 0) continue;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      let n = 0;
      while (maze.isFloor(c.x + dx * (n + 1), c.y + dy * (n + 1))) n++;
      if (n > bestLen) {
        bestLen = n;
        best = { c, dx, dy };
      }
    }
  }
  window.__best = { cx: best.c.x, cy: best.c.y, dx: best.dx, dy: best.dy };
  const w = maze.worldOf(best.c.x, best.c.y);
  g.player.pos.set(w.x, 0, w.z);
  g.player.yaw = Math.atan2(-best.dx, -best.dy);
  g.player.pitch = -0.02;
  g.player.flashOn = true;
  g.player.battery = 1;
  // Kill lamps so we are only judging the torch.
  for (const l of g.level.lamps) l.alive = false;
  window.__corridor = bestLen;
});
console.log('corridor length (cells):', await page.evaluate(() => window.__corridor));

const settle = (n = 22) =>
  page.evaluate(
    (k) =>
      new Promise((done) => {
        let i = 0;
        const tick = () => (++i >= k ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );

/** Two compositions: down a long corridor, and two metres from a tiled wall. */
const setShot = (which) =>
  page.evaluate((w) => {
    const g = window.__hollow.game;
    const maze = g.level.maze;
    if (w === 'corridor') {
      const c = window.__best;
      const p = maze.worldOf(c.cx, c.cy);
      g.player.pos.set(p.x, 0, p.z);
      g.player.yaw = Math.atan2(-c.dx, -c.dy);
      g.player.pitch = -0.02;
      return;
    }
    for (const c of maze.floors) {
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (!maze.isSolid(c.x + dx, c.y + dy)) continue;
        const p = maze.worldOf(c.x, c.y);
        g.player.pos.set(p.x - dx * 0.6, 0, p.z - dy * 0.6);
        g.player.yaw = Math.atan2(dx, dy) + Math.PI;
        g.player.pitch = 0.0;
        return;
      }
    }
  }, which);

for (const mult of [0.8, 1, 1.3]) {
  await page.evaluate((m) => {
    window.__hollow.game.player.lightScale = m;
  }, mult);
  for (const which of ['corridor', 'wall']) {
    await setShot(which);
    await settle();
    const name = `${which}-${String(mult).replace('.', 'p')}x`;
    await page.screenshot({ path: resolve(outDir, `${name}.png`) });
    console.log(`  → light/${name}.png`);
  }
}

await browser.close();
