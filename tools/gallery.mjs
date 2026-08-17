/**
 * Composition gallery.
 *
 * Boots the built game, then teleports the camera to deliberately chosen spots
 * so the lighting, the creature and the set dressing can actually be reviewed
 * instead of hoping a random wander points somewhere interesting.
 *
 *   node tools/gallery.mjs [--url http://127.0.0.1:4173] [--seed 12345]
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const url = argOf('url', 'http://127.0.0.1:4173/');
const outDir = resolve(__dirname, 'gallery');
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
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  PAGEERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  ERROR', m.text());
});

await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(
  () => !document.getElementById('menu').classList.contains('hidden'),
  { timeout: 120000 },
);
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
});

/**
 * Point the player at a world position. Forward is (-sin(yaw), -cos(yaw)),
 * so the yaw that looks from P toward T is atan2(-(Tx-Px), -(Tz-Pz)).
 */
const lookAt = (tx, tz) =>
  page.evaluate(
    (x, z) => {
      const p = window.__hollow.game.player;
      p.yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z));
    },
    tx,
    tz,
  );

/** Let the render loop run long enough to settle springs and light pools. */
const settle = async (frames = 26) => {
  await page.evaluate(
    (n) =>
      new Promise((done) => {
        let i = 0;
        const tick = () => (++i >= n ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    frames,
  );
};

const shot = async (name) => {
  await settle();
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  console.log(`  → gallery/${name}.png`);
};

/* ------------------------------------------------------------------ scenes */

console.log('01 corridor');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const maze = g.level.maze;
  // A straight corridor cell with a long unbroken sightline.
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
  if (best) {
    const w = maze.worldOf(best.c.x, best.c.y);
    g.player.pos.set(w.x, 0, w.z);
    g.player.yaw = Math.atan2(-best.dx, -best.dy);
    g.player.pitch = -0.05;
    g.player.flashOn = true;
    g.player.battery = 1;
  }
});
await shot('01-corridor');

console.log('02 wall detail');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const maze = g.level.maze;
  for (const c of maze.floors) {
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      if (!maze.isSolid(c.x + dx, c.y + dy)) continue;
      const w = maze.worldOf(c.x, c.y);
      g.player.pos.set(w.x - dx * 1.1, 0, w.z - dy * 1.1);
      g.player.yaw = Math.atan2(dx, dy) + Math.PI;
      g.player.pitch = 0.02;
      return;
    }
  }
});
await shot('02-wall');

console.log('03 the creature, upright');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const m = g.monsters.find((x) => !x.phantom);
  const fwd = g.player.forward();
  // Back off from the wall and put it in the open, five metres out.
  m.pos.set(g.player.pos.x + fwd.x * 5, 0, g.player.pos.z + fwd.z * 5);
  m.yaw = m.yawToward(g.player.pos.x, g.player.pos.z);
  m.speed = 0;
  m.gait = 0;
  m.state = 'patrol';
  g.player.pitch = 0.06;
});
await shot('03-creature');

console.log('04 the creature, charging');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const m = g.monsters.find((x) => !x.phantom);
  const fwd = g.player.forward();
  m.pos.set(g.player.pos.x + fwd.x * 3.4, 0, g.player.pos.z + fwd.z * 3.4);
  m.yaw = m.yawToward(g.player.pos.x, g.player.pos.z);
  m.awareness = 1;
  m.state = 'hunt';
  m.speed = 3.4;
  m.gait = 1;
  m.jaw = 1;
  g.director.tension = 0.95;
});
await shot('04-charging');

console.log('05 lit room');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const lamp = g.level.lamps.find((l) => l.alive);
  if (lamp) {
    lamp.brownout = 1;
    lamp.flickerDepth = 0.1;
    const dir = g.level.maze.isFloor(lamp.cell.x, lamp.cell.y + 2) ? [0, 1] : [1, 0];
    g.player.pos.set(lamp.pos.x - dir[0] * 5, 0, lamp.pos.z - dir[1] * 5);
    g.player.yaw = Math.atan2(dir[0], dir[1]);
    g.player.pitch = 0.1;
  }
  const m = g.monsters.find((x) => !x.phantom);
  m.teleportNear(g.player.pos, 20, 40);
  g.director.tension = 0.1;
});
await shot('05-lamp');

console.log('06 breaker panel');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const it = g.level.interactables.find((i) => i.kind === 'breaker');
  if (it) {
    const room = g.level.breakerRoom;
    const c = g.level.maze.worldOf(room.x + ((room.w - 1) >> 1), room.y + ((room.h - 1) >> 1));
    g.player.pos.set(c.x, 0, c.z);
    const dx = it.pos.x - c.x;
    const dz = it.pos.z - c.z;
    g.player.yaw = Math.atan2(-dx, -dz);
    g.player.pitch = -0.02;
  }
});
await shot('06-breaker');

console.log('07 exit door');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const it = g.level.interactables.find((i) => i.kind === 'exit');
  const ec = g.level.exitPos;
  g.player.pos.set(ec.x, 0, ec.z);
  const dx = it.pos.x - ec.x;
  const dz = it.pos.z - ec.z;
  const len = Math.hypot(dx, dz) || 1;
  g.player.pos.set(ec.x - (dx / len) * 2.2, 0, ec.z - (dz / len) * 2.2);
  g.player.yaw = Math.atan2(-dx / len, -dz / len);
  g.player.pitch = 0.05;
});
await shot('07-exit');

console.log('08 fuse pickup');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const f = g.level.fuses.find((x) => !x.taken);
  if (f) {
    const p = f.group.position;
    g.player.pos.set(p.x + 1.4, 0, p.z + 1.4);
    g.player.yaw = Math.atan2(-(p.x - g.player.pos.x), -(p.z - g.player.pos.z));
    g.player.pitch = -0.2;
  }
});
await shot('08-fuse');

console.log('09 inside the locker');
await page.evaluate(() => {
  const g = window.__hollow.game;
  const l = g.level.lockers[0];
  const m = g.monsters.find((x) => !x.phantom);
  // Snap dark adaption instead of waiting the realistic few seconds for it.
  g.adaptRate = 30;
  if (l) {
    g.player.enterLocker(l);
    // Something is out there, and it is close.
    m.pos.set(l.pos.x + Math.sin(l.yaw) * 3.2, 0, l.pos.z + Math.cos(l.yaw) * 3.2);
    m.yaw = m.yawToward(l.pos.x, l.pos.z);
    m.state = 'inspect';
    m.gait = 0;
    m.speed = 0;
  }
});
await shot('09-locker');

console.log('10 face flash');
await page.evaluate(() => {
  const g = window.__hollow.game;
  g.adaptRate = 0.3;
  g.player.exitLocker();
  g.player.flashOn = true;
  g.director._fire('faceFlash', { player: g.player, camera: g.camera });
});
await settle(6);
await page.screenshot({ path: resolve(outDir, '10-faceflash.png') });
console.log('  → gallery/10-faceflash.png');

console.log('11 powered up');
await page.evaluate(() => {
  const g = window.__hollow.game;
  g.run.fuses = g.run.fusesNeeded;
  const it = g.level.interactables.find((i) => i.kind === 'breaker');
  g.player.pos.set(it.pos.x, 0, it.pos.z);
  g._use(it);
  const lamp = g.level.lamps.find((l) => l.alive);
  if (lamp) {
    g.player.pos.set(lamp.pos.x - 4, 0, lamp.pos.z);
    g.player.yaw = -Math.PI / 2;
    g.player.pitch = 0.05;
  }
});
await shot('11-powered');

await browser.close();
console.log('\ndone.');
