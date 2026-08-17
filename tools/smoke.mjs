/**
 * Headless smoke test.
 *
 * Boots the built game in Chrome (SwiftShader software GL), clicks through the
 * menu into an actual round, simulates a few seconds of play, and reports any
 * console errors, WebGL warnings, or dropped frames. Screenshots land in
 * tools/shots/.
 *
 *   node tools/smoke.mjs [--url http://127.0.0.1:4173] [--seconds 12]
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const url = argOf('url', 'http://127.0.0.1:4173/');
const seconds = Number(argOf('seconds', 12));
const shotDir = resolve(__dirname, 'shots');
mkdirSync(shotDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
    '--autoplay-policy=no-user-gesture-required',
  ],
  defaultViewport: { width: 1280, height: 720 },
});

const page = await browser.newPage();
const errors = [];
const warnings = [];

page.on('console', (msg) => {
  const type = msg.type();
  const text = msg.text();
  if (type === 'error') errors.push(text);
  else if (type === 'warning' || type === 'warn') warnings.push(text);
  else console.log(`  [${type}] ${text}`);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}\n${err.stack ?? ''}`));
page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()}`));
page.on('response', (res) => {
  if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`);
});

const shot = async (name) => {
  await page.screenshot({ path: resolve(shotDir, `${name}.png`) });
  console.log(`  shot → tools/shots/${name}.png`);
};

console.log(`→ opening ${url}`);
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

console.log('→ waiting for the main menu (texture bake)');
await page.waitForFunction(
  () => document.getElementById('menu') && !document.getElementById('menu').classList.contains('hidden'),
  { timeout: 120000 },
);
await shot('01-menu');

console.log('→ entering the ward');
await page.click('#btn-play');
await page.waitForFunction(
  () => !document.getElementById('click-to-play').classList.contains('hidden'),
  { timeout: 120000 },
);
await shot('02-built');

await page.click('#click-to-play');
// Pointer lock is unavailable in headless, so drive the game state directly.
await page.evaluate(() => {
  const g = window.__hollow.game;
  g.mode = 'playing';
  g.input.enabled = true;
  g.input.locked = true;
  g.settings.set('showStats', true);
});
await new Promise((r) => setTimeout(r, 1500));
await shot('03-spawn');

console.log(`→ simulating ${seconds}s of play`);
const samples = [];
const keys = ['KeyW', 'KeyW', 'KeyW', 'KeyD', 'KeyW', 'KeyA', 'KeyW', 'ShiftLeft'];
for (let i = 0; i < seconds; i++) {
  await page.evaluate(
    (code, turn) => {
      const g = window.__hollow.game;
      g.input.keys.clear();
      g.input.keys.add(code);
      if (code === 'ShiftLeft') g.input.keys.add('KeyW');
      g.input.mouseDX += turn;
    },
    keys[i % keys.length],
    (i % 4 - 1.5) * 60,
  );
  await new Promise((r) => setTimeout(r, 1000));
  const s = await page.evaluate(() => {
    const g = window.__hollow.game;
    const m = g.monsters.find((x) => !x.phantom);
    return {
      fps: Math.round(1 / Math.max(0.0001, g._smoothDt ?? 0.016)),
      calls: g._renderInfo?.calls ?? 0,
      tris: g._renderInfo?.triangles ?? 0,
      mode: g.mode,
      sanity: +(g.director?.sanity ?? 1).toFixed(2),
      tension: +(g.director?.tension ?? 0).toFixed(2),
      state: m?.state,
      mdist: +(m?.distanceToPlayer ?? 0).toFixed(1),
      px: +g.player.pos.x.toFixed(1),
      pz: +g.player.pos.z.toFixed(1),
      battery: +g.player.battery.toFixed(3),
    };
  });
  samples.push(s);
  console.log(`  t=${i + 1}s`, JSON.stringify(s));
}
await shot('04-play');

// Force-exercise the parts a wander won't reach: a scare, the breaker, the exit.
console.log('→ forcing a face-flash scare');
await page.evaluate(() => {
  const g = window.__hollow.game;
  g.director._fire('faceFlash', { player: g.player, camera: g.camera });
});
await new Promise((r) => setTimeout(r, 120));
await shot('05-scare');

console.log('→ forcing hunt + hiding');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const m = g.monsters.find((x) => !x.phantom);
  m.teleportNear(g.player.pos, 4, 9);
  m.awareness = 1;
  m._setState('hunt');
  const l = g.level.lockers[0];
  if (l) g.player.enterLocker(l);
});
await new Promise((r) => setTimeout(r, 2500));
await shot('06-hiding');

console.log('→ forcing power restore');
await page.evaluate(() => {
  const g = window.__hollow.game;
  g.player.exitLocker();
  g.run.fuses = g.run.fusesNeeded;
  const it = g.level.interactables.find((i) => i.kind === 'breaker');
  if (it) g.player.pos.set(it.pos.x, 0, it.pos.z);
  if (it) g._use(it);
});
await new Promise((r) => setTimeout(r, 2000));
await shot('07-powered');

console.log('→ forcing escape');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const it = g.level.interactables.find((i) => i.kind === 'exit');
  if (it) g._use(it);
});
// The escape sequence runs on game time, which crawls under software GL.
await page.waitForFunction(
  () => !document.getElementById('win').classList.contains('hidden'),
  { timeout: 120000 },
);
await shot('08-win');

const avgFps = Math.round(samples.reduce((a, s) => a + s.fps, 0) / Math.max(1, samples.length));
const maxCalls = Math.max(...samples.map((s) => s.calls));
const maxTris = Math.max(...samples.map((s) => s.tris));

console.log('\n================ RESULT ================');
console.log(`avg fps (software GL): ${avgFps}`);
console.log(`max draw calls:        ${maxCalls}`);
console.log(`max triangles:         ${(maxTris / 1000).toFixed(1)}k`);
console.log(`console errors:        ${errors.length}`);
console.log(`console warnings:      ${warnings.length}`);
if (warnings.length) console.log('\n--- warnings ---\n' + warnings.slice(0, 25).join('\n'));
if (errors.length) console.log('\n--- errors ---\n' + errors.slice(0, 25).join('\n'));

await browser.close();
process.exit(errors.length ? 1 : 0);
