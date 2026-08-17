/**
 * Game orchestration: renderer, world, entities, systems, loop and the
 * win/lose flow.
 */

import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  FogExp2,
  HemisphereLight,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  PCFShadowMap,
  Vector3,
  Frustum,
  Matrix4,
} from 'three';

import { Bus, clamp, clamp01, damp, shortestAngle, makeRng } from './core/utils.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { bakeTextureLibrary } from './gfx/textures.js';
import { buildMaterials } from './gfx/materials.js';
import { PostFX } from './gfx/postfx.js';
import { Level } from './world/level.js';
import { Player, VIEW_LAYER } from './entities/player.js';
import { Monster, STATE } from './entities/monster.js';
import { Director } from './systems/director.js';
import { HUD } from './ui/hud.js';

const MODE = {
  BOOT: 'boot',
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',
  DYING: 'dying',
  ESCAPING: 'escaping',
  DEAD: 'dead',
  WON: 'won',
};

export class Game {
  constructor({ canvas, settings }) {
    this.canvas = canvas;
    this.settings = settings;
    this.bus = new Bus();
    this.mode = MODE.BOOT;
    this.time = 0;
    this.textures = null;
    this.level = null;
    this.monsters = [];
    this.run = null;

    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.hud = new HUD(this.bus);

    this._initRenderer();
    this._bindEvents();
  }

  /* ---------------------------------------------------------------- setup */

  _initRenderer() {
    const q = this.settings.q;
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Manual reset: the composer calls render() once per pass, and autoReset
    // would leave us reading the stats of a fullscreen quad.
    this.renderer.info.autoReset = false;

    this.scene = new Scene();
    this.scene.fog = new FogExp2(0x04050a, q.fogDensity);

    this.camera = new PerspectiveCamera(
      this.settings.get('fov'),
      window.innerWidth / window.innerHeight,
      0.055,
      70,
    );
    this.camera.rotation.order = 'YXZ';
    // Layer 1 holds the first-person view model, lit separately (see Player).
    this.camera.layers.enable(VIEW_LAYER);
    this.scene.add(this.camera);

    // Just enough bounce light that pitch-black rooms keep their silhouettes.
    this.ambient = new HemisphereLight(0x1b2430, 0x0a0b10, 0.8);
    this.scene.add(this.ambient);

    // Dark adaptation. Stay in the black — or shut yourself in a locker — and
    // the eye slowly opens up: a murky, colourless view of shapes. Any real
    // light snaps it shut again.
    this.darkAdapt = new HemisphereLight(0x55657c, 0x161b24, 0);
    this.scene.add(this.darkAdapt);
    this._adapt = 0;
    /** How fast the eye opens up, in units per second. */
    this.adaptRate = 0.3;

    this.postfx = new PostFX(this.renderer, this.scene, this.camera, q);

    this._frustum = new Frustum();
    this._projScreen = new Matrix4();

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.postfx.setSize(w, h);
  }

  _bindEvents() {
    this.input.onLockChange = (locked) => {
      if (!locked && this.mode === MODE.PLAYING) this.pause();
    };

    this.bus.on('caught', (m) => this._onCaught(m));
    this.bus.on('near-miss', () => {
      this.bus.emit('subtitle', '它走了。你的手还在抖。', "It's gone. Your hands are still shaking.");
      this.run.nearMisses++;
    });
    this.bus.on('hunt-begin', () => {
      this.run.chases++;
      this.bus.emit('subtitle', '它看见你了。跑。', 'It has seen you. Run.');
    });
    this.bus.on('despawn', (p) => this._despawn(p));
    this.bus.on('hide', (on) => {
      if (on && this.run) this.run.hides++;
    });
  }

  /* ----------------------------------------------------------- asset load */

  async preload(onProgress) {
    const q = this.settings.q;
    onProgress?.(0.02, ['正在唤醒黑暗…', 'Waking the dark...']);
    this.textures = await bakeTextureLibrary({
      size: q.textureSize,
      aniso: Math.min(q.anisotropy, this.renderer.capabilities.getMaxAnisotropy()),
      onProgress: (f, label) => onProgress?.(0.05 + f * 0.85, [`烘制材质 · ${label}`, `Baking materials · ${label}`]),
    });
    this.materials = buildMaterials(this.textures);
    onProgress?.(0.98, ['准备就绪', 'Ready']);
    this.mode = MODE.MENU;
  }

  /* ------------------------------------------------------------ new round */

  async startRun(onProgress) {
    this.disposeRun();
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this.rng = makeRng(seed);
    this.run = {
      seed,
      startedAt: performance.now(),
      fuses: 0,
      fusesNeeded: this.settings.diff.fuses,
      powered: false,
      chases: 0,
      nearMisses: 0,
      hides: 0,
      distance: 0,
    };

    this.level = new Level({
      scene: this.scene,
      materials: this.materials,
      textures: this.textures,
      settings: this.settings,
      rng: this.rng,
    });
    await this.level.build(onProgress);

    this.player = new Player({
      camera: this.camera,
      scene: this.scene,
      level: this.level,
      audio: this.audio,
      input: this.input,
      settings: this.settings,
      bus: this.bus,
    });

    this.monsters = [
      new Monster({
        scene: this.scene,
        level: this.level,
        audio: this.audio,
        settings: this.settings,
        bus: this.bus,
        rng: this.rng,
      }),
    ];

    this.director = new Director({
      level: this.level,
      audio: this.audio,
      settings: this.settings,
      bus: this.bus,
      rng: this.rng,
      spawnPhantom: () => this._spawnPhantom(),
    });

    this.mode = MODE.PLAYING;
    this.time = 0;
    this._deathT = 0;
    this._winT = 0;
    this._adapt = 0;
    this.darkAdapt.intensity = 0;
    this.hud.show(true);
    this.audio.resume();
    this.audio.setMuffled(0);
    this.bus.emit('subtitle', '门在你身后合上了。', 'The door has closed behind you.');
    this.hud.toast(`收集 ${this.run.fusesNeeded} 枚保险丝`, `Collect ${this.run.fusesNeeded} fuses`);
  }

  _spawnPhantom() {
    if (this.monsters.length > 4) return null;
    const p = new Monster({
      scene: this.scene,
      level: this.level,
      audio: this.audio,
      settings: this.settings,
      bus: this.bus,
      rng: this.rng,
      phantom: true,
    });
    this.monsters.push(p);
    return p;
  }

  _despawn(m) {
    const i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
    m.dispose();
  }

  disposeRun() {
    if (this.monsters) for (const m of this.monsters) m.dispose();
    this.monsters = [];
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    if (this.level) {
      this.level.dispose();
      this.level = null;
    }
    this.director = null;
  }

  /* ------------------------------------------------------------ lifecycle */

  async resume() {
    this.mode = MODE.PLAYING;
    this.audio.resume();
    await this.input.requestLock();
    this.input.enabled = true;
    this.hud.show(true);
  }

  pause() {
    if (this.mode !== MODE.PLAYING) return;
    this.mode = MODE.PAUSED;
    this.input.enabled = false;
    this.input.releaseLock();
    this.bus.emit('paused');
  }

  quitToMenu() {
    this.disposeRun();
    this.mode = MODE.MENU;
    this.input.enabled = false;
    this.input.releaseLock();
    this.hud.show(false);
    this.audio.setMuffled(0);
  }

  /* ---------------------------------------------------------- interaction */

  _findInteractable() {
    if (!this.level) return null;
    const player = this.player;
    if (player.hiding) {
      return { kind: 'leave', label: '出来', radius: 0, pos: player.pos, data: player.hideLocker };
    }
    const eye = player.eyePosition;
    const fwd = player.forward();
    let best = null;
    let bestScore = -Infinity;
    for (const it of this.level.interactables) {
      if (it.data?.taken) continue;
      if (it.kind === 'exit' && it.data.open) continue;
      const to = new Vector3().subVectors(it.pos, eye);
      const dist = to.length();
      if (dist > it.radius) continue;
      to.normalize();
      const facing = fwd.dot(to);
      if (facing < 0.42) continue;
      const score = facing * 2 - dist * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  _use(it) {
    const player = this.player;
    switch (it.kind) {
      case 'leave':
        player.exitLocker();
        break;
      case 'locker':
        player.enterLocker(it.data);
        this.bus.emit('subtitle', '铁皮很冷。你能听见自己的心跳。', 'The steel is cold. You can hear your own heartbeat.');
        break;
      case 'fuse': {
        it.data.taken = true;
        it.data.group.visible = false;
        this.run.fuses++;
        this.audio.pickup();
        this.bus.emit('noise', { pos: player.pos.clone(), level: 0.3 });
        const left = this.run.fusesNeeded - this.run.fuses;
        this.hud.toast(
          left > 0 ? `保险丝 ${this.run.fuses}/${this.run.fusesNeeded}` : '保险丝已集齐',
          left > 0 ? `Fuses ${this.run.fuses}/${this.run.fusesNeeded}` : 'All fuses collected',
        );
        if (left === 0) this.bus.emit('subtitle', '够了。去配电盘。', "That's enough. Get to the breaker panel.");
        break;
      }
      case 'battery': {
        it.data.taken = true;
        it.data.group.visible = false;
        player.spareBatteries++;
        this.audio.pickup();
        this.hud.toast('拾取电池', 'Battery collected');
        break;
      }
      case 'breaker': {
        if (this.run.fuses < this.run.fusesNeeded) {
          this.hud.toast(
            `还缺 ${this.run.fusesNeeded - this.run.fuses} 枚保险丝`,
            `${this.run.fusesNeeded - this.run.fuses} fuses still missing`,
          );
          this.audio.click({ pitch: 0.6, intensity: 0.6 });
          return;
        }
        if (this.run.powered) return;
        this.run.powered = true;
        it.data.used = true;
        this.level.restorePower();
        this.audio.powerUp();
        this.director.onPowerRestored({ monsters: this.monsters, player });
        this.bus.emit('noise', { pos: player.pos.clone(), level: 1 });
        this.hud.toast('配电盘合闸 — 安全门已解锁', 'Breaker closed — the fire door is unlocked');
        this._spawnExtraMonster();
        break;
      }
      case 'exit': {
        if (!this.run.powered) {
          this.hud.toast('门是锁死的 — 需要先恢复供电', 'The door is dead-locked — restore power first');
          this.audio.click({ pitch: 0.5, intensity: 0.7 });
          this.bus.emit('subtitle', '推不动。得先把电闸合上。', "It won't budge. The power has to be back on first.");
          return;
        }
        it.data.open = true;
        this.audio.creak({ duration: 1.6, intensity: 1.4 });
        this._startEscape();
        break;
      }
      default:
        break;
    }
  }

  _spawnExtraMonster() {
    const after = this.settings.diff.extraMonsterAfter;
    if (!Number.isFinite(after)) return;
    const real = this.monsters.filter((m) => !m.phantom).length;
    if (real >= 2) return;
    const m = new Monster({
      scene: this.scene,
      level: this.level,
      audio: this.audio,
      settings: this.settings,
      bus: this.bus,
      rng: this.rng,
    });
    m.teleportNear(this.player.pos, 16, 30);
    m.enrage(0.5);
    this.monsters.push(m);
  }

  /* ------------------------------------------------------------- end game */

  _onCaught(monster) {
    if (this.mode !== MODE.PLAYING) return;
    this.mode = MODE.DYING;
    this._deathT = 0;
    this._killer = monster;
    this.input.enabled = false;
    this.input.releaseLock();
    this.audio.impact(1);
    this.audio.scream(1.2, 0);
    this.audio.stinger(1.2);
    this.hud.hit();
    this.player.shake(1.6, 1.2);
  }

  _startEscape() {
    this.mode = MODE.ESCAPING;
    this._winT = 0;
    this.input.enabled = false;
    this.input.releaseLock();
    this.audio.setMuffled(0);
  }

  runStats() {
    const secs = (performance.now() - this.run.startedAt) / 1000;
    const mm = Math.floor(secs / 60);
    const ss = Math.floor(secs % 60);
    return [
      `存活时间   ${mm}:${String(ss).padStart(2, '0')}`,
      `保险丝     ${this.run.fuses}/${this.run.fusesNeeded}`,
      `被追猎     ${this.run.chases} 次`,
      `惊险逃脱   ${this.run.nearMisses} 次`,
      `行走距离   ${Math.round(this.player?.distance ?? 0)} m`,
      `病院编号   #${this.run.seed.toString(16).toUpperCase().slice(0, 6)}`,
    ].join('\n');
  }

  /* ----------------------------------------------------------------- loop */

  isMonsterVisible(m) {
    if (!this.level) return false;
    this._projScreen.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    this._frustum.setFromProjectionMatrix(this._projScreen);
    const head = new Vector3(m.pos.x, 1.5, m.pos.z);
    if (!this._frustum.containsPoint(head)) return false;
    if (!this.level.hasLineOfSight(this.player.pos, m.pos)) return false;
    // You have to be able to see it, not just have it in frame.
    const lit =
      this.level.lightAt(m.pos) +
      (this.player.flashOn ? clamp01(1 - m.distanceToPlayer / 22) * this.player.flashHealth : 0);
    return lit > 0.12;
  }

  frame(dtRaw) {
    const dt = Math.min(0.05, dtRaw);
    this.time += dt;

    if (this.mode === MODE.PLAYING) this._stepPlaying(dt);
    else if (this.mode === MODE.DYING) this._stepDying(dt);
    else if (this.mode === MODE.ESCAPING) this._stepEscaping(dt);
    else if (this.mode === MODE.PAUSED) this._stepPaused(dt);

    if (this.level) this.level.faceCamera(this.camera.quaternion);
    this.renderer.info.reset();
    this.postfx.render(dt);
    const info = this.renderer.info.render;
    this._renderInfo = { calls: info.calls, triangles: info.triangles };
    this.input.endFrame();
  }

  _audioState(extra = {}) {
    const player = this.player;
    let nearest = null;
    let nd = Infinity;
    for (const m of this.monsters) {
      if (m.phantom) continue;
      if (m.distanceToPlayer < nd) {
        nd = m.distanceToPlayer;
        nearest = m;
      }
    }
    let pan = 0;
    if (nearest) {
      const right = new Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      const to = new Vector3().subVectors(nearest.pos, player.pos).normalize();
      pan = clamp(right.dot(to) * 1.15, -1, 1);
    }
    return {
      tension: this.director?.tension ?? 0,
      sanity: this.director?.sanity ?? 1,
      stamina: player?.stamina ?? 1,
      holdingBreath: player?.holdingBreath ?? false,
      monsterDistance: nd,
      monsterPan: pan,
      monsterHunting: nearest
        ? nearest.state === STATE.HUNT || nearest.state === STATE.ATTACK
        : false,
      monsterVisible: nearest?.visible ?? false,
      ...extra,
    };
  }

  _stepPlaying(dt) {
    const player = this.player;
    const input = this.input;

    /* ------------------------------------------------------------ input */
    if (input.justPressed('KeyF')) player.toggleFlash();
    if (input.justPressed('KeyR')) player.swapBattery();

    player.update(dt, { time: this.time });

    const it = this._findInteractable();
    if (it && input.justPressed('KeyE')) this._use(it);

    /* --------------------------------------------------------- monsters */
    const nearestReal = this.monsters.find((m) => !m.phantom);
    const pan = (() => {
      if (!nearestReal) return 0;
      const right = new Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
      const to = new Vector3().subVectors(nearestReal.pos, player.pos).normalize();
      return clamp(right.dot(to) * 1.15, -1, 1);
    })();

    for (const m of [...this.monsters]) {
      const fwd = player.forward();
      const to = new Vector3().subVectors(m.pos, player.pos).normalize();
      m.update(dt, {
        time: this.time,
        player,
        pan,
        playerLookingAt: fwd.dot(to) > 0.9 && this.level.hasLineOfSight(player.pos, m.pos),
        isVisible: (mm) => this.isMonsterVisible(mm),
      });
    }

    this.level.update(dt, player.pos);
    this.director.update(dt, { player, monsters: this.monsters, camera: this.camera });

    /* ------------------------------------------------------ dark adaption */
    const litness = clamp01(
      this.level.lightAt(player.pos) + (player.flashOn ? player.flashHealth : 0),
    );
    const wantAdapt = player.hiding ? 1 : clamp01(1 - litness * 3);
    // Opens slowly, shuts fast — the same asymmetry your own eyes have.
    this._adapt = damp(this._adapt, wantAdapt, wantAdapt > this._adapt ? this.adaptRate : 4, dt);
    // Hiding gets a much bigger lift: a locker is enclosed, so without it the
    // player is staring at an unreadable black rectangle while the thing that
    // is about to kill them walks past the slats.
    this.darkAdapt.intensity = this._adapt * (player.hiding ? 4.6 : 1.45);

    /* -------------------------------------------------------- fx + audio */
    const fx = this.director.fx;
    this.postfx.update(dt, {
      sanity: this.director.sanity,
      tension: this.director.tension,
      hiding: player.hiding,
      ...fx,
      exposure: fx.exposure * (1 + this._adapt * (player.hiding ? 0.5 : 0.3)),
      // Adapted vision is grainy and washed out.
      grainBoost: this._adapt * 0.05,
      desaturate: this._adapt * 0.42,
    });
    this.audio.update(dt, this._audioState());

    /* --------------------------------------------------------------- HUD */
    const objective = !this.run.powered
      ? this.run.fuses < this.run.fusesNeeded
        ? ['寻找保险丝，重启配电盘', 'Find the fuses and restart the breaker panel']
        : ['回到配电盘，合上闸刀', 'Return to the breaker panel and throw the switch']
      : ['逃到安全门', 'Escape through the fire door'];
    this.hud.update(dt, {
      battery: player.battery,
      stamina: player.stamina,
      sanity: this.director.sanity,
      spareBatteries: player.spareBatteries,
      crouching: player.crouching,
      sprinting: player.sprinting,
      hiding: player.hiding,
      breathHold: player.breathHold,
      fuses: this.run.fuses,
      fusesNeeded: this.run.fusesNeeded,
      objectiveText: objective,
      prompt: it ? it.label : null,
      dread: this.director.dread,
      stats: this.settings.get('showStats') ? this._statsText() : null,
    });
  }

  _statsText() {
    const info = this._renderInfo ?? { calls: 0, triangles: 0 };
    const m = this.monsters.find((x) => !x.phantom);
    return [
      `fps      ${(1 / Math.max(0.0001, this._smoothDt ?? 0.016)).toFixed(0)}`,
      `calls    ${info.calls}`,
      `tris     ${(info.triangles / 1000).toFixed(1)}k`,
      `state    ${m?.state ?? '-'}`,
      `aware    ${((m?.awareness ?? 0) * 100).toFixed(0)}%`,
      `dist     ${(m?.distanceToPlayer ?? 0).toFixed(1)}m`,
      `sanity   ${(this.director.sanity * 100).toFixed(0)}%`,
      `tension  ${(this.director.tension * 100).toFixed(0)}%`,
    ].join('\n');
  }

  _stepPaused(dt) {
    // Keep the world breathing behind the pause panel, but freeze the AI.
    this.postfx.update(dt, { sanity: 1, tension: 0.1, blackout: 0.35 });
  }

  _stepDying(dt) {
    this._deathT += dt;
    const t = this._deathT;
    const player = this.player;
    const m = this._killer;

    // Forced to look at it.
    if (m) {
      const to = new Vector3().subVectors(m.pos, player.pos);
      const wantYaw = Math.atan2(-to.x, -to.z);
      player.yaw += damp(0, shortestAngle(player.yaw, wantYaw), 6, dt);
      player.pitch = damp(player.pitch, 0.1, 4, dt);
      // It leans in.
      const want = new Vector3(player.pos.x, 0, player.pos.z).addScaledVector(
        new Vector3().subVectors(m.pos, player.pos).normalize(),
        0.85,
      );
      m.pos.lerp(want, clamp01(dt * 3));
      m.state = STATE.ATTACK;
      m.grabbing = 0.2;
      m.update(dt, {
        time: this.time,
        player,
        pan: 0,
        playerLookingAt: true,
        isVisible: () => true,
      });
    }
    player.shake(0.9 - clamp01(t / 1.6) * 0.5, 1);
    player.update(dt, { time: this.time });
    this.level.update(dt, player.pos);

    const blackout = clamp01((t - 0.75) / 1.15);
    this.postfx.update(dt, {
      sanity: 0.12,
      tension: 1,
      damage: clamp01(0.5 + t),
      glitch: clamp01(1.2 - t * 0.5),
      pulse: 1,
      exposure: 1 + Math.max(0, 0.7 - t) * 2,
      blackout,
    });
    this.audio.update(dt, this._audioState({ tension: 1, monsterHunting: true }));

    if (t > 2.1) {
      this.mode = MODE.DEAD;
      this.hud.show(false);
      this.bus.emit('death', {
        reason: this.run.powered
          ? ['它在灯光下追上了你。', 'It ran you down in the light.']
          : ['你在黑暗里被抓住了。', 'It took you in the dark.'],
        stats: this.runStats(),
      });
    }
  }

  _stepEscaping(dt) {
    this._winT += dt;
    const t = this._winT;
    const player = this.player;
    // Walk out through the door on rails.
    const fwd = player.forward();
    player.pos.x += fwd.x * dt * 1.6;
    player.pos.z += fwd.z * dt * 1.6;
    player.update(dt, { time: this.time });
    this.level.update(dt, player.pos);
    this.postfx.update(dt, {
      sanity: clamp01(0.4 + t * 0.4),
      tension: clamp01(0.8 - t * 0.4),
      exposure: 1 + t * 2.4,
      blackout: 0,
    });
    this.audio.update(dt, this._audioState({ tension: clamp01(0.6 - t * 0.3) }));
    if (t > 2.4) {
      this.mode = MODE.WON;
      this.hud.show(false);
      this.bus.emit('win', { stats: this.runStats() });
    }
  }

  /** Quality changes need a fresh composer (different passes / targets). */
  rebuildPostFX() {
    const old = this.postfx;
    this.postfx = new PostFX(this.renderer, this.scene, this.camera, this.settings.q);
    this.postfx.setSize(window.innerWidth, window.innerHeight);
    old?.dispose();
  }

  applySettings() {
    const q = this.settings.q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.scene.fog.density = q.fogDensity;
    this.audio.setVolume(this.settings.get('volume'));
    this.camera.fov = this.settings.get('fov');
    this.camera.updateProjectionMatrix();
    if (this.player) {
      this.player.fovSpring.value = this.settings.get('fov');
      this.player.spot.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    }
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      this._smoothDt = this._smoothDt ? this._smoothDt * 0.9 + dt * 0.1 : dt;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

export { MODE };
