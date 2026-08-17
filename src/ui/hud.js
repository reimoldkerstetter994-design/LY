/**
 * All DOM-side presentation: meters, prompts, subtitles, toasts, overlays.
 * Values are written only when they actually change so we are not thrashing
 * layout every frame.
 */

import { clamp01 } from '../core/utils.js';

const $ = (id) => document.getElementById(id);

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
    bus.on('toast', (text) => this.toast(text));
    bus.on('subtitle', (text) => this.subtitle(text));
  }

  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  toast(text) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.el.toasts.appendChild(div);
    setTimeout(() => div.remove(), 3400);
  }

  subtitle(text, seconds = 4.5) {
    this.el.subtitle.textContent = text;
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

  update(dt, s) {
    this.setMeter('battery', s.battery, 0.2);
    this.setMeter('stamina', s.stamina, 0.25);
    this.setMeter('sanity', s.sanity, 0.3);

    this.setText('objective', s.objectiveText);
    this.setText('have', String(s.fuses));
    this.setText('need', String(s.fusesNeeded));
    this.el.count.classList.toggle('done', s.fuses >= s.fusesNeeded);
    this.el.batteryCount.innerHTML = `备用电池 <b>${s.spareBatteries}</b>`;
    this.setText('stance', s.hiding ? '躲藏中' : s.crouching ? '蹲伏' : s.sprinting ? '奔跑' : '站立');

    // Interaction prompt.
    if (s.prompt) {
      this.el.prompt.classList.remove('hidden');
      this.setText('promptText', s.prompt);
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
