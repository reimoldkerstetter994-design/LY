/**
 * All DOM-side presentation: meters, prompts, subtitles, toasts, overlays.
 * Values are written only when they actually change so we are not thrashing
 * layout every frame.
 */

import { clamp01 } from '../core/utils.js';

const $ = (id) => document.getElementById(id);

/** Escape, because a few of these strings are assembled from run state. */
const esc = (s) =>
  String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/**
 * Chinese primary, English gloss underneath. Every player-facing string in the
 * game goes through here so the UI is readable in both languages.
 */
const bilingual = (zh, en) => (en ? `${esc(zh)}<span class="en">${esc(en)}</span>` : esc(zh));

export class HUD {
  constructor(bus) {
    this.bus = bus;
    this.el = {
      hud: $('hud'),
      objective: $('objective-text'),
      have: $('fuse-have'),
      need: $('fuse-need'),
      count: $('objective-count'),
      battery: $('battery-fill'),
      stamina: $('stamina-fill'),
      sanity: $('sanity-fill'),
      batteryCount: $('battery-count'),
      stance: $('stance-text'),
      crosshair: $('crosshair'),
      prompt: $('prompt'),
      promptText: $('prompt-text'),
      subtitle: $('subtitle'),
      toasts: $('toast-stack'),
      stats: $('stats'),
      vignette: $('vignette-pulse'),
      damage: $('damage-flash'),
      hide: $('hide-overlay'),
      breath: $('breath-fill'),
    };
    this._last = {};
    this._subtitleTimer = 0;
    bus.on('toast', (zh, en) => this.toast(zh, en));
    bus.on('subtitle', (zh, en) => this.subtitle(zh, en));
  }

  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  toast(zh, en) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.innerHTML = bilingual(zh, en);
    this.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), 3400);
  }

  /** Spoken lines are shown in Chinese with an English gloss underneath. */
  subtitle(zh, en, seconds = 4.5) {
    this.el.subtitle.textContent = '';
    const top = document.createElement('div');
    top.className = 'sub-zh';
    top.textContent = zh;
    this.el.subtitle.appendChild(top);
    if (en) {
      const bottom = document.createElement('div');
      bottom.className = 'sub-en';
      bottom.textContent = en;
      this.el.subtitle.appendChild(bottom);
    }
    this.el.subtitle.classList.add('show');
    this._subtitleTimer = seconds;
  }

  hit() {
    this.el.damage.classList.remove('hit');
    // Force a reflow so the animation restarts.
    void this.el.damage.offsetWidth;
    this.el.damage.classList.add('hit');
  }

  setMeter(key, value, lowThreshold = 0.22) {
    const el = this.el[key];
    if (!el) return;
    const v = clamp01(value);
    const pct = `${(v * 100).toFixed(1)}%`;
    if (this._last[key] !== pct) {
      el.style.width = pct;
      this._last[key] = pct;
    }
    const low = v <= lowThreshold;
    if (this._last[`${key}:low`] !== low) {
      el.classList.toggle('low', low);
      this._last[`${key}:low`] = low;
    }
  }

  setText(key, text) {
    if (this._last[`t:${key}`] === text) return;
    this._last[`t:${key}`] = text;
    const el = this.el[key];
    if (el) el.textContent = text;
  }

  /** As `setText`, but the value is a [chinese, english] pair. */
  setBi(key, pair) {
    const [zh, en] = pair;
    const sig = `${zh}\u0000${en ?? ''}`;
    if (this._last[`b:${key}`] === sig) return;
    this._last[`b:${key}`] = sig;
    const el = this.el[key];
    if (el) el.innerHTML = bilingual(zh, en);
  }

  update(dt, s) {
    this.setMeter('battery', s.battery, 0.2);
    this.setMeter('stamina', s.stamina, 0.25);
    this.setMeter('sanity', s.sanity, 0.3);

    this.setBi('objective', s.objectiveText);
    this.setText('have', String(s.fuses));
    this.setText('need', String(s.fusesNeeded));
    this.el.count.classList.toggle('done', s.fuses >= s.fusesNeeded);
    this.setBi('batteryCount', [`备用电池 ${s.spareBatteries}`, `Spare batteries ${s.spareBatteries}`]);
    this.setBi(
      'stance',
      s.hiding
        ? ['躲藏中', 'Hiding']
        : s.crouching
          ? ['蹲伏', 'Crouching']
          : s.sprinting
            ? ['奔跑', 'Running']
            : ['站立', 'Standing'],
    );

    // Interaction prompt.
    if (s.prompt) {
      this.el.prompt.classList.remove('hidden');
      this.setBi('promptText', s.prompt);
      this.el.crosshair.classList.add('active');
    } else {
      this.el.prompt.classList.add('hidden');
      this.el.crosshair.classList.remove('active');
    }

    // Hiding overlay.
    this.el.hide.classList.toggle('hidden', !s.hiding);
    if (s.hiding) this.el.breath.style.width = `${clamp01(s.breathHold) * 100}%`;

    // Red rim that pulses with how close it is — a rim, not a wash.
    const dread = clamp01(s.dread);
    const shadow = `inset 0 0 ${120 + dread * 110}px ${10 + dread * 34}px rgba(${
      Math.round(80 + dread * 70)
    }, 0, 0, ${(dread * 0.34).toFixed(3)})`;
    if (this._last.shadow !== shadow) {
      this.el.vignette.style.boxShadow = shadow;
      this._last.shadow = shadow;
    }

    if (this._subtitleTimer > 0) {
      this._subtitleTimer -= dt;
      if (this._subtitleTimer <= 0) this.el.subtitle.classList.remove('show');
    }

    if (s.stats) {
      this.el.stats.classList.remove('hidden');
      this.el.stats.textContent = s.stats;
    } else {
      this.el.stats.classList.add('hidden');
    }
  }
}
