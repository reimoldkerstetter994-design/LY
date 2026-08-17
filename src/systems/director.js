/**
 * The Director: sanity, dread, and the pacing of scares.
 *
 * Horror falls apart if it is constant, so this system tracks how long the
 * player has been left alone and spends that quiet on an escalating menu of
 * events — from a distant clang, to a figure at the end of the corridor, to a
 * face two feet from yours.
 *
 * It also owns the sanity value, which is the game's second health bar: the
 * dark eats it, light restores it, and once it bottoms out you can no longer
 * trust anything you see.
 */

import { Vector3 } from 'three';
import { STATE } from '../entities/monster.js';
import { clamp, clamp01, damp, lerp } from '../core/utils.js';

const SCARES = {
  clang: { weight: 1.0, cost: 0.1, minSanity: 0 },
  whisper: { weight: 0.9, cost: 0.15, minSanity: 0 },
  lightsOut: { weight: 0.75, cost: 0.3, minSanity: 0 },
  gurney: { weight: 0.7, cost: 0.2, minSanity: 0 },
  breathBehind: { weight: 0.6, cost: 0.4, minSanity: 0 },
  phantom: { weight: 0.9, cost: 0.6, maxSanity: 0.85 },
  shoulder: { weight: 0.5, cost: 0.7, maxSanity: 0.7 },
  faceFlash: { weight: 0.55, cost: 1.0, maxSanity: 0.6 },
};

export class Director {
  constructor({ level, audio, settings, bus, rng, spawnPhantom }) {
    this.level = level;
    this.audio = audio;
    this.settings = settings;
    this.bus = bus;
    this.rng = rng;
    this.spawnPhantom = spawnPhantom;

    this.sanity = 1;
    this.tension = 0;
    this.dread = 0;
    this.quiet = 0;
    this.scareCooldown = 14;
    this.phantoms = [];

    // Post-processing state the game reads each frame.
    this.fx = { glitch: 0, warpBoost: 0, exposure: 1, blackout: 0, pulse: 0, damage: 0 };
    this._faceTimer = 0;
    this._lightsOutTimer = 0;
    this._savedLamps = null;
    this._whisperTimer = 8;
    this._shoulderPending = 0;

    bus.on('phantom-expire', (p) => this.removePhantom(p));
  }

  /* ------------------------------------------------------------- sanity */

  _updateSanity(dt, ctx) {
    const { player, monsters } = ctx;
    const diff = this.settings.diff;
    const lamp = this.level.lightAt(player.pos);
    const torch = player.flashOn ? player.flashHealth : 0;

    // Standing in real light heals; the dark eats you.
    let rate = 0;
    if (lamp > 0.25) rate += lamp * 0.075;
    else if (torch > 0.3) rate += 0.012;
    else rate -= 0.021 * diff.sanityDrain;

    // Proximity terror: seeing it, or it hunting you, costs a lot.
    for (const m of monsters) {
      if (m.phantom) continue;
      const d = m.distanceToPlayer;
      if (d < 16) {
        const near = clamp01(1 - d / 16);
        rate -= near * near * 0.075 * diff.sanityDrain;
        if (m.visible) rate -= near * 0.1 * diff.sanityDrain;
      }
    }
    // Hiding is a relief, even if it isn't safe.
    if (player.hiding) rate += 0.02;

    this.sanity = clamp01(this.sanity + rate * dt);
  }

  /* ------------------------------------------------------------ tension */

  _updateTension(dt, ctx) {
    const { monsters, player } = ctx;
    let worst = 0;
    for (const m of monsters) {
      if (m.phantom) continue;
      const d = m.distanceToPlayer;
      const prox = clamp01(1 - d / 30);
      let t = prox * 0.55;
      if (m.state === STATE.INVESTIGATE) t += 0.12;
      if (m.state === STATE.SEARCH) t += 0.1;
      if (m.state === STATE.INSPECT) t += 0.35;
      if (m.state === STATE.STALK) t += 0.2;
      if (m.state === STATE.HUNT) t += 0.55;
      if (m.state === STATE.ATTACK) t += 0.85;
      if (m.visible) t += 0.22;
      t += m.awareness * 0.18;
      worst = Math.max(worst, t);
    }
    worst += (1 - this.sanity) * 0.22;
    if (player.hiding) worst *= 0.9;
    this.tension = damp(this.tension, clamp01(worst), 3.2, dt);
    this.dread = damp(this.dread, clamp01(worst * 1.15 - 0.25), 2.4, dt);
    // Fear feeds back into the player's hands and breathing.
    player.fear = damp(player.fear, clamp01(this.tension * 1.1 + (1 - this.sanity) * 0.35), 2.5, dt);
  }

  /* ------------------------------------------------------------- scares */

  _pick(ctx) {
    const entries = Object.entries(SCARES).filter(([, cfg]) => {
      if (cfg.minSanity !== undefined && this.sanity < cfg.minSanity) return false;
      if (cfg.maxSanity !== undefined && this.sanity > cfg.maxSanity) return false;
      return true;
    });
    // Bigger budget when the player has been left alone for a long time.
    const budget = clamp01(this.quiet / 55) * 1.1;
    const usable = entries.filter(([, cfg]) => cfg.cost <= budget + 0.15);
    const pool = usable.length ? usable : entries.slice(0, 2);
    let total = 0;
    for (const [, cfg] of pool) total += cfg.weight;
    let r = this.rng() * total;
    for (const [name, cfg] of pool) {
      r -= cfg.weight;
      if (r <= 0) return name;
    }
    return pool[0][0];
  }

  _fire(name, ctx) {
    const { player, camera } = ctx;
    const rng = this.rng;
    const pan = rng.range(-1, 1);

    switch (name) {
      case 'clang': {
        this.audio.clang({ pan, distance: rng.range(6, 20), intensity: 1.1 });
        if (rng.chance(0.4)) this.bus.emit('subtitle', '远处有东西倒了。');
        break;
      }
      case 'whisper': {
        this.audio.whisper(pan * 0.8, 0.9);
        this.bus.emit('subtitle', rng.pick(['…别开灯……', '…它就在你后面……', '…第七间……', '…出不去的……']));
        break;
      }
      case 'lightsOut': {
        this._lightsOutTimer = rng.range(1.4, 3.2);
        this._savedLamps = this.level.lamps.map((l) => l.brownout);
        for (const l of this.level.lamps) l.brownout = 0;
        this.audio.clang({ pan: 0, distance: 3, intensity: 0.7 });
        this.audio.stinger(0.5);
        player.shake(0.12, 3);
        break;
      }
      case 'gurney': {
        this.audio.creak({ pan, duration: rng.range(1.4, 2.6), intensity: 1.2 });
        setTimeout(() => this.audio.clang({ pan, distance: 8, intensity: 0.8 }), 900);
        break;
      }
      case 'breathBehind': {
        this.audio.breath('in', 1.6);
        setTimeout(() => this.audio.breath('out', 1.7), 420);
        this.bus.emit('subtitle', '有人贴着你的后颈呼吸。');
        this.fx.warpBoost = 0.4;
        player.shake(0.06, 2);
        break;
      }
      case 'shoulder': {
        // Something turns your head for you.
        player.yaw += rng.sign() * rng.range(0.5, 0.9);
        player.shake(0.5, 3);
        this.audio.stinger(0.8);
        this.audio.whisper(0, 1.2);
        break;
      }
      case 'phantom': {
        const p = this.spawnPhantom();
        if (p) {
          p.teleportNear(player.pos, 9, 17);
          this.phantoms.push(p);
          this.audio.whisper(pan * 0.5, 0.6);
        }
        break;
      }
      case 'faceFlash': {
        const p = this.spawnPhantom();
        if (p) {
          // Right in your face, for a third of a second. The torch is choked
          // back so you actually register a face instead of a white flash.
          const fwd = player.forward();
          p.pos.set(player.pos.x + fwd.x * 2.0, 0, player.pos.z + fwd.z * 2.0);
          p.yaw = p.yawToward(player.pos.x, player.pos.z);
          p.jaw = 1;
          p.gait = 0;
          this.phantoms.push(p);
          this._faceTimer = 0.34;
          player.lightScale = 0.3;
          this.audio.stinger(1.15);
          this.audio.scream(0.7, 0);
          player.shake(0.85, 2.2);
          this.fx.exposure = 1.3;
          this.fx.glitch = 1;
          this.sanity = clamp01(this.sanity - 0.12);
        }
        break;
      }
      default:
        break;
    }
    this.bus.emit('scare', name);
  }

  removePhantom(p) {
    const i = this.phantoms.indexOf(p);
    if (i >= 0) this.phantoms.splice(i, 1);
    this.bus.emit('despawn', p);
  }

  /* ------------------------------------------------------------- runtime */

  update(dt, ctx) {
    this._updateSanity(dt, ctx);
    this._updateTension(dt, ctx);

    const hunting = ctx.monsters.some(
      (m) => !m.phantom && (m.state === STATE.HUNT || m.state === STATE.ATTACK),
    );

    // Quiet only accumulates when nothing is actively chasing.
    if (hunting) {
      this.quiet = Math.max(0, this.quiet - dt * 3);
      this.scareCooldown = Math.max(this.scareCooldown, 6);
    } else {
      this.quiet += dt * (1 + (1 - this.sanity) * 0.8);
    }

    this.scareCooldown -= dt;
    if (!hunting && this.scareCooldown <= 0 && this.quiet > 12) {
      const name = this._pick(ctx);
      this._fire(name, ctx);
      const cfg = SCARES[name];
      this.scareCooldown = lerp(9, 26, 1 - cfg.cost) * this.rng.range(0.8, 1.25);
      this.quiet *= 1 - cfg.cost * 0.7;
    }

    // Low sanity keeps whispering at you regardless of the scare schedule.
    this._whisperTimer -= dt;
    if (this._whisperTimer <= 0) {
      this._whisperTimer = lerp(26, 5, 1 - this.sanity) * this.rng.range(0.7, 1.4);
      if (this.sanity < 0.75) this.audio.whisper(this.rng.range(-1, 1), 0.4 + (1 - this.sanity) * 0.8);
    }

    /* -------------------------------------------------- transient effects */
    if (this._faceTimer > 0) {
      this._faceTimer -= dt;
      if (this._faceTimer <= 0) {
        // Vanishes without a sound, which is worse.
        for (const p of [...this.phantoms]) this.removePhantom(p);
      }
    }
    ctx.player.lightScale = damp(ctx.player.lightScale, this._faceTimer > 0 ? 0.3 : 1, 7, dt);

    if (this._lightsOutTimer > 0) {
      this._lightsOutTimer -= dt;
      if (this._lightsOutTimer <= 0 && this._savedLamps) {
        this.level.lamps.forEach((l, i) => {
          l.brownout = this._savedLamps[i];
        });
        this._savedLamps = null;
        this.audio.clang({ pan: 0, distance: 6, intensity: 0.5 });
      }
    }

    // Phantoms that have wandered out of relevance.
    for (const p of [...this.phantoms]) {
      if (p.stateTime > 7 || p.pos.distanceTo(ctx.player.pos) > 30) this.removePhantom(p);
    }

    /* ------------------------------------------------------- fx envelopes */
    this.fx.exposure = damp(this.fx.exposure, 1, 6, dt);
    this.fx.glitch = damp(this.fx.glitch, 0, 5, dt);
    this.fx.warpBoost = damp(this.fx.warpBoost, 0, 2.5, dt);
    this.fx.pulse = clamp01(this.tension * 0.7 + (1 - this.sanity) * 0.3);

    // Being grabbed pushes red into the frame.
    let grab = 0;
    for (const m of ctx.monsters) {
      if (!m.phantom) grab = Math.max(grab, clamp01(m.grabbing / Math.max(0.05, this.settings.diff.grabTime)));
    }
    this.fx.damage = damp(this.fx.damage, grab, 8, dt);
  }

  /** Called when the breaker is thrown: everything gets worse. */
  onPowerRestored(ctx) {
    for (const m of ctx.monsters) if (!m.phantom) m.enrage(0.75);
    this.tension = Math.max(this.tension, 0.7);
    this.quiet = 0;
    this.scareCooldown = 12;
    this.bus.emit('subtitle', '灯亮了。它现在也看得见你了。');
  }
}
