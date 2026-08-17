/**
 * Entry point: boots the game, wires every screen, and owns the transitions
 * between menu, play, pause, death and escape.
 */

import { Game, MODE } from './game.js';
import { Settings, QUALITY, DIFFICULTY } from './core/settings.js';

const $ = (id) => document.getElementById(id);

const screens = {
  loading: $('loading'),
  menu: $('menu'),
  settings: $('settings'),
  howto: $('howto'),
  pause: $('pause'),
  death: $('death'),
  win: $('win'),
  ctp: $('click-to-play'),
};

function show(name) {
  for (const [key, el] of Object.entries(screens)) {
    if (key === 'loading') continue;
    el.classList.toggle('hidden', key !== name);
  }
}

function hideAll() {
  for (const [key, el] of Object.entries(screens)) {
    if (key === 'loading') continue;
    el.classList.add('hidden');
  }
}

const settings = new Settings();
const game = new Game({ canvas: $('scene'), settings });

/* ------------------------------------------------------------------ loading */

function setLoading(frac, label) {
  $('loading-fill').style.width = `${Math.round(frac * 100)}%`;
  if (label) $('loading-status').textContent = label;
}

function showLoading(on) {
  if (on) {
    screens.loading.classList.remove('hidden', 'fade');
  } else {
    screens.loading.classList.add('fade');
    setTimeout(() => screens.loading.classList.add('hidden'), 750);
  }
}

/* ----------------------------------------------------------------- settings */

function syncSettingsUI() {
  for (const btn of document.querySelectorAll('#quality-seg button')) {
    btn.classList.toggle('active', btn.dataset.q === settings.get('quality'));
  }
  for (const btn of document.querySelectorAll('#difficulty-seg button')) {
    btn.classList.toggle('active', btn.dataset.diff === settings.get('difficulty'));
  }
  $('sens-range').value = settings.get('sensitivity');
  $('sens-val').textContent = Number(settings.get('sensitivity')).toFixed(2);
  $('vol-range').value = settings.get('volume');
  $('vol-val').textContent = `${Math.round(settings.get('volume') * 100)}%`;
  $('fov-range').value = settings.get('fov');
  $('fov-val').textContent = settings.get('fov');
  $('chk-bob').checked = settings.get('headBob');
  $('chk-flash').checked = settings.get('flashes');
  $('chk-stats').checked = settings.get('showStats');
}

function wireSettings() {
  document.querySelectorAll('#quality-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.set('quality', btn.dataset.q);
      syncSettingsUI();
      game.applySettings();
      game.rebuildPostFX();
      game.hud.toast(`画质：${QUALITY[btn.dataset.q].label}（部分设置下一局生效）`);
    });
  });

  document.querySelectorAll('#difficulty-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings.set('difficulty', btn.dataset.diff);
      syncSettingsUI();
    });
  });

  $('sens-range').addEventListener('input', (e) => {
    settings.set('sensitivity', Number(e.target.value));
    $('sens-val').textContent = Number(e.target.value).toFixed(2);
  });
  $('vol-range').addEventListener('input', (e) => {
    settings.set('volume', Number(e.target.value));
    $('vol-val').textContent = `${Math.round(e.target.value * 100)}%`;
    game.audio.setVolume(Number(e.target.value));
  });
  $('fov-range').addEventListener('input', (e) => {
    settings.set('fov', Number(e.target.value));
    $('fov-val').textContent = e.target.value;
    game.applySettings();
  });
  $('chk-bob').addEventListener('change', (e) => settings.set('headBob', e.target.checked));
  $('chk-flash').addEventListener('change', (e) => settings.set('flashes', e.target.checked));
  $('chk-stats').addEventListener('change', (e) => settings.set('showStats', e.target.checked));
}

/* -------------------------------------------------------------------- flow */

let settingsReturn = 'menu';

async function beginRun() {
  hideAll();
  game.hud.show(false);
  showLoading(true);
  setLoading(0.02, '正在建造病院…');
  // Let the loading screen paint before the heavy synchronous work starts.
  await new Promise((r) => requestAnimationFrame(() => r()));
  await game.startRun((frac, label) => setLoading(0.05 + frac * 0.95, label ?? '建造中…'));
  showLoading(false);
  // Pointer lock has to come from a user gesture, so ask for one click.
  show('ctp');
}

function wireFlow() {
  $('btn-play').addEventListener('click', () => {
    game.audio.resume();
    beginRun();
  });

  $('btn-settings').addEventListener('click', () => {
    settingsReturn = 'menu';
    show('settings');
  });
  $('btn-pause-settings').addEventListener('click', () => {
    settingsReturn = 'pause';
    show('settings');
  });
  $('btn-settings-back').addEventListener('click', () => show(settingsReturn));
  $('btn-howto').addEventListener('click', () => show('howto'));
  $('btn-howto-back').addEventListener('click', () => show('menu'));

  $('btn-resume').addEventListener('click', async () => {
    hideAll();
    await game.resume();
  });
  $('btn-quit').addEventListener('click', () => {
    game.quitToMenu();
    show('menu');
  });

  $('btn-retry').addEventListener('click', () => beginRun());
  $('btn-death-menu').addEventListener('click', () => {
    game.quitToMenu();
    show('menu');
  });
  $('btn-again').addEventListener('click', () => beginRun());
  $('btn-win-menu').addEventListener('click', () => {
    game.quitToMenu();
    show('menu');
  });

  screens.ctp.addEventListener('click', async () => {
    hideAll();
    await game.resume();
  });

  // Escape from a menu-less state should not be swallowed by the browser.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (game.mode === MODE.PLAYING) game.pause();
  });

  game.bus.on('paused', () => {
    const r = game.run;
    $('pause-objective').textContent = r
      ? `保险丝 ${r.fuses}/${r.fusesNeeded} · ${r.powered ? '电已恢复，去安全门' : '尚未供电'}`
      : '';
    show('pause');
  });

  game.bus.on('death', ({ reason, stats }) => {
    $('death-reason').textContent = reason;
    $('death-stats').textContent = stats;
    show('death');
  });

  game.bus.on('win', ({ stats }) => {
    $('win-stats').textContent = stats;
    show('win');
  });
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  syncSettingsUI();
  wireSettings();
  wireFlow();

  game.applySettings();
  game.start();

  try {
    await game.preload(setLoading);
  } catch (err) {
    console.error(err);
    setLoading(1, `载入失败：${err?.message ?? err}`);
    return;
  }
  showLoading(false);
  show('menu');

  // The audio context can only start after the first interaction.
  const unlock = () => {
    game.audio.init();
    game.audio.setVolume(settings.get('volume'));
    game.audio.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

boot();

// Handy for debugging from the console.
window.__hollow = { game, settings, DIFFICULTY, QUALITY };
