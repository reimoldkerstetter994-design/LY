#!/usr/bin/env node
/**
 * Headless playtest with Chrome + SwiftShader (no GPU required).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";

const URL = process.env.GAME_URL || "http://localhost:5173/?autostart=1";
const OUT = process.env.OUT || "/tmp/devworld-playtest";
const CHROME = process.env.CHROME || "/opt/google/chrome/chrome";

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  dumpio: false,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--window-size=1280,720",
    `--user-data-dir=${OUT}/chrome-profile`,
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => window.game && window.game.player, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/01_spawn.png` });

await page.keyboard.down("KeyW");
await new Promise((r) => setTimeout(r, 1800));
await page.keyboard.up("KeyW");
await page.screenshot({ path: `${OUT}/02_walk.png` });

await page.evaluate(() => {
  const ada = window.game.world.interactables.find((m) => m.id === "ada");
  window.game.player.pos.set(ada.pos[0] + 0.8, ada.pos[1] + 0.2, ada.pos[2] + 0.8);
});
await new Promise((r) => setTimeout(r, 500));
await page.keyboard.press("KeyE");
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/03_talk_ada.png` });

const bugCount = await page.evaluate(() => window.game.bugs.length);
for (let i = 0; i < bugCount; i++) {
  await page.evaluate((i) => {
    const b = window.game.bugs[i];
    if (b) window.game.player.pos.copy(b.position);
  }, i);
  await new Promise((r) => setTimeout(r, 350));
}

const marks = await page.evaluate(() => window.game.world.interactables);
for (const mark of marks) {
  if (!["token", "beacon", "console", "note"].includes(mark.kind)) continue;
  await page.evaluate((m) => {
    window.game.player.pos.set(m.pos[0], m.pos[1] + 0.2, m.pos[2] + 0.15);
  }, mark);
  await new Promise((r) => setTimeout(r, 400));
  await page.keyboard.press("KeyE");
  await new Promise((r) => setTimeout(r, 250));
}

const compile = marks.find((m) => m.kind === "compile");
await page.evaluate((m) => {
  window.game.player.pos.set(m.pos[0], m.pos[1] + 0.2, m.pos[2]);
}, compile);
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.press("KeyE");
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/04_compile.png` });

const after = await page.evaluate(() => {
  const g = window.game;
  const p = g.player.pos;
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    running: g.running,
    talkedAda: g.quest.talkedAda,
    tokens: { ...g.quest.tokens },
    bugs: g.quest.bugsSquashed,
    beacons: [...g.quest.beacons],
    consoles: [...g.quest.consoles],
    compiled: g.quest.compiled,
    quest: g.quest.current(),
    prompt: document.getElementById("prompt").textContent,
    winHidden: document.getElementById("win").classList.contains("hidden"),
  };
});

writeFileSync(`${OUT}/report.json`, JSON.stringify({ after, logs: logs.slice(-50) }, null, 2));
console.log(JSON.stringify(after, null, 2));
await browser.close();

if (!after.talkedAda || after.bugs < 5 || !after.tokens.git || after.winHidden) {
  console.error("playtest incomplete");
  process.exit(1);
}
