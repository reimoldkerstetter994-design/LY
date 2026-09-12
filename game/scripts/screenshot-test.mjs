import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const ARTIFACTS = '/opt/cursor/artifacts';
mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.screenshot({ path: join(ARTIFACTS, 'devworld_start_screen.png'), fullPage: false });

await page.click('#start-btn');
await page.waitForFunction(() => {
  const hud = document.getElementById('hud');
  return hud && !hud.classList.contains('hidden');
}, { timeout: 5000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(ARTIFACTS, 'devworld_ingame_world.png'), fullPage: false });

const blockCount = await page.textContent('#block-count');
const canvasVisible = await page.isVisible('#game-canvas');
const hudVisible = await page.evaluate(() => !document.getElementById('hud').classList.contains('hidden'));

console.log(JSON.stringify({ blockCount, canvasVisible, hudVisible, ok: canvasVisible && hudVisible }));

await browser.close();
