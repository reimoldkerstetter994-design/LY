import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.PLAYTEST_OUT || "/tmp/kernel-ridge-playtest";
fs.mkdirSync(OUT, { recursive: true });

const chrome =
  process.env.CHROME_PATH ||
  ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].find(
    (p) => fs.existsSync(p)
  );

function log(msg) {
  console.log(`[playtest] ${msg}`);
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  log(`shot ${file}`);
  return file;
}

async function waitTitle(page) {
  await page.waitForFunction(
    () => {
      const t = document.getElementById("title");
      const load = document.getElementById("loading");
      const loadtxt = document.getElementById("loadtxt")?.textContent || "";
      if (loadtxt.includes("失败")) return "error:" + loadtxt;
      if (t && !t.classList.contains("hidden")) return "ready";
      return false;
    },
    { timeout: 45000 }
  );
}

async function walkTo(page, x, z, radius = 2.2, timeout = 25000) {
  try {
    await page.waitForFunction(
      (tx, tz, radius) => {
        const g = window.game;
        if (!g?.playing) return false;
        if (g.hp <= 0) {
          g.respawn();
        }
        if (g.dialogOpen) {
          g.advanceDialog();
          return false;
        }
        const dx = tx - g.playerPos.x;
        const dz = tz - g.playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d < radius) {
          g.input.keys.delete("KeyW");
          g.input.keys.delete("ShiftLeft");
          return true;
        }
        g.input.yaw = Math.atan2(-dx, -dz);
        g.input.keys.add("KeyW");
        if (g.stamina > 20) g.input.keys.add("ShiftLeft");
        else g.input.keys.delete("ShiftLeft");
        if (g.attackCd <= 0) g.input.consumeAttack = true;
        return false;
      },
      { timeout },
      x,
      z,
      radius
    );
    return true;
  } catch (err) {
    await page.evaluate(() => {
      window.game?.input.keys.delete("KeyW");
      window.game?.input.keys.delete("ShiftLeft");
    });
    log(`walk timeout toward ${x.toFixed(1)},${z.toFixed(1)}`);
    return false;
  }
}

async function interact(page) {
  await page.evaluate(() => {
    window.game.input.interact = true;
  });
}

async function dismissDialog(page) {
  const opened = await page.evaluate(() => window.game.dialogOpen);
  if (!opened) {
    const visible = await page.$eval("#dialog", (n) => !n.classList.contains("hidden")).catch(() => false);
    if (!visible) return false;
  }
  await page.evaluate(() => {
    let guard = 0;
    while (window.game.dialogOpen && guard++ < 8) window.game.advanceDialog();
  });
  return true;
}

async function respawnIfDead(page) {
  const dead = await page.evaluate(() => window.game.hp <= 0);
  if (!dead) return false;
  log("respawn");
  await page.click("#respawnBtn").catch(() => {});
  await page.waitForFunction(() => window.game.hp > 0 && !window.game.paused, { timeout: 5000 });
  return true;
}

async function worldPos(page, name) {
  return page.evaluate((name) => {
    const obj = window.game.named.get(name);
    if (!obj) return null;
    const v = obj.getWorldPosition(window.game.playerPos.clone());
    return { x: v.x, y: v.y, z: v.z };
  }, name);
}

async function main() {
  log(`chrome ${chrome}`);
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=1400,900",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--ignore-gpu-blocklist",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(String(e));
    log(`pageerror ${e}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") log(`console.error ${msg.text()}`);
  });

  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0", timeout: 60000 });
  await page.bringToFront();
  const loadState = await waitTitle(page).catch((e) => e.message);
  const loadtxt = await page.$eval("#loadtxt", (n) => n.textContent);
  log(`loadtxt=${loadtxt} state=${loadState}`);
  await shot(page, "01_title.png");

  if (String(loadState).startsWith("error") || String(loadState).includes("Waiting failed")) {
    const html = await page.$eval("#loading", (n) => n.innerText);
    throw new Error(`did not reach title: ${loadState} ${html}`);
  }

  await page.click("#startBtn");
  await page.waitForFunction(() => window.game?.playing === true, { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 800));
  await shot(page, "02_ingame.png");

  const spawn = await page.evaluate(() => ({
    x: window.game.playerPos.x,
    y: window.game.playerPos.y,
    z: window.game.playerPos.z,
    hp: window.game.hp,
    walkable: window.game.walkable.length,
    obstacles: window.game.obstacles.length,
    interactables: window.game.interactables.map((o) => o.name),
    quest: document.getElementById("quest")?.textContent,
  }));
  log(`spawn ${JSON.stringify(spawn)}`);

  const mentor = await worldPos(page, "NPC_mentor");
  log(`mentor ${JSON.stringify(mentor)}`);
  if (mentor) await walkTo(page, mentor.x, mentor.z, 1.8, 20000);
  await interact(page);
  await new Promise((r) => setTimeout(r, 300));
  await shot(page, "03_dialog.png");
  const talkedOk = await dismissDialog(page);
  log(`dialog dismissed=${talkedOk}`);

  const afterTalk = await page.evaluate(() => ({
    talked: window.game.talked,
    quest: document.getElementById("quest")?.textContent,
    hp: window.game.hp,
  }));
  log(`afterTalk ${JSON.stringify(afterTalk)}`);
  if (!afterTalk.talked && mentor) {
    await walkTo(page, mentor.x, mentor.z, 1.6, 12000);
    await interact(page);
    await dismissDialog(page);
  }

  async function tryCollect(name) {
    const p = await worldPos(page, name);
    if (!p) {
      log(`missing ${name}`);
      return;
    }
    log(`goto ${name} ${JSON.stringify(p)}`);
    await walkTo(page, p.x, p.z, 2.0, 40000);
    await respawnIfDead(page);
    for (let i = 0; i < 4; i++) {
      await interact(page);
      await new Promise((r) => setTimeout(r, 180));
      const dialogOpen = await page.evaluate(() => window.game.dialogOpen);
      if (dialogOpen) await dismissDialog(page);
      const got = await page.evaluate((name) => {
        if (name.startsWith("FRAG_")) return window.game.fragments.has(name);
        if (name.startsWith("CHEST_")) return window.game.chests.has(name);
        return true;
      }, name);
      if (got) break;
    }
  }

  await tryCollect("CHEST_boot");
  await tryCollect("FRAG_syntax");
  await shot(page, "04_explore.png");

  const mid = await page.evaluate(() => ({
    pos: { x: window.game.playerPos.x, y: window.game.playerPos.y, z: window.game.playerPos.z },
    hp: window.game.hp,
    fragments: [...window.game.fragments],
    stars: window.game.stars.size,
    chests: [...window.game.chests],
    quest: document.getElementById("quest")?.textContent,
    toast: document.getElementById("toast")?.textContent,
  }));
  log(`mid ${JSON.stringify(mid)}`);

  for (const name of ["FRAG_memory", "FRAG_runtime", "FRAG_graph", "FRAG_kernel"]) {
    await tryCollect(name);
    await respawnIfDead(page);
  }
  await shot(page, "05_cores.png");

  const missing = await page.evaluate(() =>
    window.game.meta.fragments.map((f) => f.object).filter((id) => !window.game.fragments.has(id))
  );
  log(`missing ${JSON.stringify(missing)}`);
  for (const name of missing) await tryCollect(name);

  await tryCollect("TERM_spire");
  await shot(page, "06_end.png");

  const fin = await page.evaluate(() => ({
    won: window.game.won,
    fragments: [...window.game.fragments],
    hp: window.game.hp,
    stars: window.game.stars.size,
    pos: { x: window.game.playerPos.x, y: window.game.playerPos.y, z: window.game.playerPos.z },
    winVisible: !document.getElementById("win").classList.contains("hidden"),
    canvasPixels: (() => {
      const c = document.getElementById("view");
      return { w: c.width, h: c.height };
    })(),
  }));
  log(`fin ${JSON.stringify(fin)}`);
  log(`errors ${JSON.stringify(errors)}`);

  fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify({ spawn, afterTalk, mid, fin, errors }, null, 2));
  await browser.close();
  if (!mid.pos || mid.hp <= 0 && !fin.won) {
    // still allow exit 0 if we explored; fail if never moved / never started
  }
  if (errors.length) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
