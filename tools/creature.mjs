/**
 * Creature inspector: puts the thing in a big open room, measures whether its
 * feet actually touch the floor, and shoots it from a few angles and gaits.
 *
 *   node tools/creature.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, 'creature');
mkdirSync(outDir, { recursive: true });
const url = process.env.URL ?? 'http://127.0.0.1:4173/';

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
  defaultViewport: { width: 900, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  PAGEERROR', e.message));

await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
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
  // Studio lighting: this is an inspection, not a mood shot.
  g.ambient.intensity = 0.9;
  document.getElementById('hud').classList.add('hidden');
  // Freeze the Director too, otherwise it keeps restoring torch brightness.
  g.director.update = () => {};
  // Freeze the AI so a pose stays the pose we asked for.
  const m = g.monsters.find((x) => !x.phantom);
  m.update = function frozen(dt, ctx) {
    this.distanceToPlayer = this.pos.distanceTo(ctx.player.pos);
    this._animate(dt, ctx);
  };
});

const settle = (n = 20) =>
  page.evaluate(
    (k) =>
      new Promise((done) => {
        let i = 0;
        const tick = () => (++i >= k ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );

/** Stand the player in the middle of the largest room, monster `dist` ahead. */
const pose = (opts) =>
  page.evaluate((o) => {
    const g = window.__hollow.game;
    const maze = g.level.maze;
    const room = [...maze.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
    const c = maze.worldOf(room.x + ((room.w - 1) >> 1), room.y + ((room.h - 1) >> 1));
    const m = g.monsters.find((x) => !x.phantom);

    m.pos.set(c.x, 0, c.z);
    m.path = [];
    m.speed = o.speed;
    m.gait = o.gait;
    m.state = o.state;
    m.awareness = o.state === 'hunt' ? 1 : 0;
    m.repathTimer = 999;
    // Face the camera position we are about to move to.
    m.yaw = o.angle + Math.PI;

    // Player forward is (-sin(yaw), -cos(yaw)), so standing at +dir and facing
    // the origin of that offset means yaw === angle.
    const a = o.angle;
    g.player.pos.set(c.x + Math.sin(a) * o.dist, 0, c.z + Math.cos(a) * o.dist);
    g.player.yaw = a;
    g.player.pitch = o.pitch;
    g.player.flashOn = true;
    g.player.battery = 1;
    g.player.lightScale = 0.45;
    g.director.tension = 0.2;
    g.director.sanity = 1;
  }, opts);

const measure = () =>
  page.evaluate(() => {
    const g = window.__hollow.game;
    const m = g.monsters.find((x) => !x.phantom);
    const v = new (Object.getPrototypeOf(m.pos).constructor)();
    const yOf = (obj) => {
      obj.updateWorldMatrix(true, false);
      return v.setFromMatrixPosition(obj.matrixWorld).y;
    };
    const feet = m.legs.map((l) => yOf(l.ankle));
    let lowest = Infinity;
    let top = -Infinity;
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone();
      o.updateWorldMatrix(true, false);
      bb.applyMatrix4(o.matrixWorld);
      lowest = Math.min(lowest, bb.min.y);
      top = Math.max(top, bb.max.y);
    });
    return {
      gait: +m.gait.toFixed(2),
      ankleY: feet.map((f) => +f.toFixed(3)),
      lowestMeshY: +lowest.toFixed(3),
      topMeshY: +top.toFixed(3),
      height: +(top - lowest).toFixed(2),
    };
  });

const shots = [
  { name: '01-idle-front', dist: 3.2, angle: 0, pitch: 0.05, gait: 0, speed: 0, state: 'patrol' },
  { name: '02-idle-side', dist: 3.2, angle: Math.PI / 2, pitch: 0.05, gait: 0, speed: 0, state: 'patrol' },
  { name: '03-walk', dist: 3.6, angle: 0.4, pitch: 0.05, gait: 0, speed: 1.5, state: 'patrol' },
  { name: '04-sprint', dist: 3.6, angle: 0.4, pitch: 0.1, gait: 1, speed: 3.4, state: 'hunt' },
  { name: '05-attack-close', dist: 1.6, angle: 0, pitch: 0.18, gait: 0.4, speed: 2.0, state: 'attack' },
  { name: '06-head', dist: 1.15, angle: 0, pitch: 0.3, gait: 0, speed: 0, state: 'patrol' },
];

for (const s of shots) {
  await pose(s);
  await settle(24);
  const m = await measure();
  await page.screenshot({ path: resolve(outDir, `${s.name}.png`) });
  console.log(`${s.name}`, JSON.stringify(m));
}

await browser.close();
