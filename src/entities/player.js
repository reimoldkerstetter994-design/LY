/**
 * First-person player: movement, collision, stance, stamina, the flashlight
 * (light + view model + volumetric beam), hiding, and all the camera motion
 * that makes the world feel like it is being seen through a body.
 */

import {
  Group,
  Mesh,
  Object3D,
  SpotLight,
  PointLight,
  HemisphereLight,
  CylinderGeometry,
  SphereGeometry,
  BoxGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Vector3,
  Euler,
  MathUtils,
} from 'three';
import { makeBeamCone } from '../gfx/materials.js';
import { clamp, clamp01, damp, lerp, Spring, TAU } from '../core/utils.js';

const EYE_STAND = 1.66;
const EYE_CROUCH = 0.98;
const RADIUS = 0.34;

const SPEED = { walk: 2.45, sprint: 4.55, crouch: 1.15 };
const NOISE = { walk: 0.5, sprint: 1, crouch: 0.12, still: 0.02 };

/** Render layer reserved for the first-person view model. */
export const VIEW_LAYER = 1;

export class Player {
  constructor({ camera, scene, level, audio, input, settings, bus }) {
    this.camera = camera;
    this.scene = scene;
    this.level = level;
    this.audio = audio;
    this.input = input;
    this.settings = settings;
    this.bus = bus;

    this.pos = new Vector3().copy(level.spawn);
    this.vel = new Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eye = EYE_STAND;

    this.crouching = false;
    this.sprinting = false;
    this.stamina = 1;
    this.exhausted = false;

    this.battery = 1;
    this.spareBatteries = 1;
    this.flashOn = true;
    this.flashHealth = 1; // dips when the bulb browns out
    /** External multiplier — the Director dims the torch during scares. */
    this.lightScale = 1;

    this.hiding = false;
    this.hideLocker = null;
    this.holdingBreath = false;
    this.breathHold = 1;

    this.alive = true;
    this.noise = 0;
    this.moveSpeed = 0;
    this.distance = 0;
    this.stepPhase = 0;
    this.fear = 0;

    this._bobT = 0;
    this._breathT = 0;
    this._shake = 0;
    this._shakeDecay = 1;
    this.camera.rotation.order = 'YXZ';

    this.swayX = new Spring(70, 12);
    this.swayY = new Spring(70, 12);
    this.beamYaw = new Spring(55, 11);
    this.beamPitch = new Spring(55, 11);
    this.rollSpring = new Spring(60, 11);
    this.eyeSpring = new Spring(90, 15, EYE_STAND);
    this.fovSpring = new Spring(50, 12, settings.get('fov'));

    this._buildFlashlight();

    // Face the most open direction at spawn so the player isn't staring at a wall.
    this.yaw = this._bestSpawnYaw();
  }

  _bestSpawnYaw() {
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      let score = 0;
      for (let d = 1; d < 8; d++) {
        const x = this.pos.x + Math.sin(a) * d * 1.2;
        const z = this.pos.z + Math.cos(a) * d * 1.2;
        if (this.level.maze.solidAtWorld(x, z)) break;
        score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------ flashlight */

  _buildFlashlight() {
    const cam = this.camera;

    // The beam holder lags behind head rotation so the light swings.
    this.beamHolder = new Group();
    cam.add(this.beamHolder);

    // A real torch is a tight hot core inside a much softer spill, so this is
    // built from two lights: only the core pays for shadows.
    const q = this.settings.q;
    // Both cones are seated well behind the lens. Inverse-square falloff is
    // brutal in the first metre: with the emitter at the hand, walking up to a
    // door blows it to flat white. Backing the virtual origin off by ~1.4 m
    // costs almost nothing down the corridor and keeps close surfaces readable.
    this.spot = new SpotLight(0xfff1d8, 0, 36, 0.34, 0.5, 1.15);
    this.spot.position.set(0.14, -0.14, 1.4);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    this.spot.shadow.camera.near = 0.2;
    this.spot.shadow.camera.far = 34;
    this.spot.shadow.bias = -0.0014;
    this.spot.shadow.normalBias = 0.024;
    this.spot.shadow.focus = 1;
    this.beamHolder.add(this.spot);

    // Aimed a few degrees below the crosshair, the way a person actually
    // carries a torch — it keeps the ground ahead readable.
    this.spotTarget = new Object3D();
    this.spotTarget.position.set(0.14, -0.5, -6);
    this.beamHolder.add(this.spotTarget);
    this.spot.target = this.spotTarget;

    this.flood = new SpotLight(0xffeccd, 0, 22, 1.15, 0.8, 1.25);
    this.flood.position.set(0.14, -0.14, 0.9);
    this.flood.castShadow = false;
    this.flood.target = this.spotTarget;
    this.beamHolder.add(this.flood);

    // Omnidirectional near-field fill. Physically this stands in for the light
    // bouncing off the floor: without it, corridor side walls sit at a grazing
    // angle to the beam and read as pure black, which makes the place unreadable.
    this.bounce = new PointLight(0xffeacb, 0, 9, 1.55);
    this.bounce.position.set(0.1, -0.35, 0.15);
    this.beamHolder.add(this.bounce);

    // Volumetric cone: local -Y is rotated onto the camera's -Z.
    if (q.volumetricSteps > 0) {
      this.beam = makeBeamCone({
        length: 11,
        angle: 0.38,
        color: 0xffeccd,
        intensity: 0.15,
        layers: q.volumetricSteps > 30 ? 3 : 2,
      });
      this.beam.rotation.x = Math.PI / 2;
      this.beam.position.set(0.14, -0.14, -0.3);
      this.beamHolder.add(this.beam);
    }

    /* --------------------------------------------------------- view model */
    this.viewModel = new Group();
    this.viewModel.position.set(0.34, -0.32, -0.62);
    this.viewModel.rotation.set(-0.06, 0.26, 0.06);
    this.viewModel.scale.setScalar(0.86);
    cam.add(this.viewModel);

    const bodyMat = new MeshStandardMaterial({ color: 0x22232a, roughness: 0.4, metalness: 0.7 });
    const gripMat = new MeshStandardMaterial({ color: 0x101012, roughness: 0.88, metalness: 0.08 });
    // Deliberately dark: a hand this close to the lens clips to white otherwise.
    const skinMat = new MeshStandardMaterial({ color: 0x4a3428, roughness: 0.78, metalness: 0.02 });
    this.lensMat = new MeshBasicMaterial({ color: 0xfff3d8, toneMapped: false });

    const body = new Mesh(new CylinderGeometry(0.032, 0.036, 0.2, 14), bodyMat);
    body.rotation.x = Math.PI / 2;
    this.viewModel.add(body);

    const head = new Mesh(new CylinderGeometry(0.05, 0.036, 0.07, 16), bodyMat);
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.13;
    this.viewModel.add(head);

    const lens = new Mesh(new SphereGeometry(0.045, 14, 8), this.lensMat);
    lens.scale.set(1, 1, 0.42);
    lens.position.z = -0.16;
    this.viewModel.add(lens);

    const grip = new Mesh(new CylinderGeometry(0.038, 0.038, 0.09, 12), gripMat);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.03;
    this.viewModel.add(grip);

    // Suggestion of a hand: palm + four fingers curled around the grip.
    const palm = new Mesh(new BoxGeometry(0.062, 0.085, 0.095), skinMat);
    palm.position.set(0.006, -0.042, 0.052);
    palm.rotation.z = 0.12;
    this.viewModel.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new Mesh(new CylinderGeometry(0.0105, 0.0105, 0.062, 8), skinMat);
      f.position.set(-0.008, -0.016, 0.012 - i * 0.024);
      f.rotation.set(0, 0, Math.PI / 2 + 0.16 + i * 0.02);
      this.viewModel.add(f);
    }
    const thumb = new Mesh(new CylinderGeometry(0.012, 0.011, 0.055, 8), skinMat);
    thumb.position.set(0.03, -0.028, 0.03);
    thumb.rotation.set(-0.9, 0.2, -0.5);
    this.viewModel.add(thumb);

    // The view model lives on its own render layer with its own two lights.
    // World lights sit only a few centimetres from the hand, so without this
    // isolation the torch blows its own hand out to pure white.
    this.viewModel.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
      o.layers.set(VIEW_LAYER);
    });

    this.vmKey = new PointLight(0xffe4bc, 0, 2.2, 1.1);
    this.vmKey.position.set(0.55, 0.1, -0.15);
    this.vmKey.layers.set(VIEW_LAYER);
    cam.add(this.vmKey);

    this.vmFill = new HemisphereLight(0x2a3444, 0x0d0f14, 0.5);
    this.vmFill.layers.set(VIEW_LAYER);
    cam.add(this.vmFill);
  }

  /* --------------------------------------------------------------- actions */

  toggleFlash() {
    if (this.battery <= 0) {
      this.audio.click({ pitch: 0.7, intensity: 0.6 });
      this.bus.emit('toast', '手电没电了');
      return;
    }
    this.flashOn = !this.flashOn;
    this.audio.click({ pitch: this.flashOn ? 1.2 : 0.9 });
    // A click is a noise, and it carries.
    this.bus.emit('noise', { pos: this.pos.clone(), level: 0.35 });
  }

  swapBattery() {
    if (this.spareBatteries <= 0) {
      this.bus.emit('toast', '没有备用电池了');
      this.audio.click({ pitch: 0.6, intensity: 0.5 });
      return;
    }
    if (this.battery > 0.92) {
      this.bus.emit('toast', '电池还很满');
      return;
    }
    this.spareBatteries--;
    this.battery = 1;
    this.flashHealth = 1;
    this.audio.rustle({ intensity: 0.6, metal: true });
    this.bus.emit('toast', '换上新电池');
    this.bus.emit('noise', { pos: this.pos.clone(), level: 0.45 });
  }

  enterLocker(locker) {
    if (this.hiding) return;
    this.hiding = true;
    this.hideLocker = locker;
    locker.targetOpen = 0;
    // The door would fill the whole frame from in here, so it is hidden and the
    // slatted HUD overlay sells the enclosure instead.
    locker.hinge.visible = false;
    this.pos.set(locker.inside.x, 0, locker.inside.z);
    // The locker's own +Z faces out of the wall; the camera looks down -Z, so
    // facing out of the door means yaw + PI.
    this.hideYaw = locker.yaw + Math.PI;
    this.yaw = this.hideYaw;
    // Nobody hides in a cupboard with the torch on.
    if (this.flashOn) {
      this.flashOn = false;
      this.audio.click({ pitch: 0.9 });
    }
    this.audio.rustle({ intensity: 1, metal: true });
    this.audio.setMuffled(1);
    this.bus.emit('hide', true);
    this.bus.emit('noise', { pos: this.pos.clone(), level: 0.4 });
  }

  exitLocker() {
    if (!this.hiding) return;
    const l = this.hideLocker;
    this.hiding = false;
    this.hideLocker = null;
    this.holdingBreath = false;
    if (l) {
      l.hinge.visible = true;
      // Step out in front of the locker.
      const fx = Math.sin(l.yaw);
      const fz = Math.cos(l.yaw);
      const nx = l.pos.x + fx * 0.85;
      const nz = l.pos.z + fz * 0.85;
      const r = this.level.resolveCircle(nx, nz, RADIUS);
      this.pos.set(r.x, 0, r.z);
    }
    this.audio.rustle({ intensity: 0.9, metal: true });
    this.audio.setMuffled(0);
    this.bus.emit('hide', false);
    this.bus.emit('noise', { pos: this.pos.clone(), level: 0.5 });
  }

  shake(amount, decay = 2.6) {
    this._shake = Math.max(this._shake, amount);
    this._shakeDecay = decay;
  }

  /** Detach everything this player hung off the shared camera. */
  dispose() {
    for (const obj of [this.beamHolder, this.viewModel, this.vmKey, this.vmFill]) {
      if (obj) this.camera.remove(obj);
    }
    const seen = new Set();
    for (const root of [this.beamHolder, this.viewModel]) {
      root?.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) {
          seen.add(o.geometry);
          o.geometry.dispose();
        }
        if (o.material && !seen.has(o.material)) {
          seen.add(o.material);
          o.material.dispose();
        }
      });
    }
  }

  get eyePosition() {
    return new Vector3(this.pos.x, this.eye, this.pos.z);
  }

  forward(out = new Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /* ---------------------------------------------------------------- update */

  update(dt, ctx) {
    const input = this.input;
    const diff = this.settings.diff;

    /* ------------------------------------------------------------- look */
    const md = input.consumeMouse();
    const sens = 0.0022 * this.settings.get('sensitivity');
    this.yaw -= md.x * sens;
    this.pitch = clamp(this.pitch - md.y * sens, -1.45, 1.45);
    if (this.yaw > Math.PI) this.yaw -= TAU;
    if (this.yaw < -Math.PI) this.yaw += TAU;

    if (this.hiding) {
      // Peeking through the slats: limited arc, no movement.
      const rel = MathUtils.euclideanModulo(this.yaw - this.hideYaw + Math.PI, TAU) - Math.PI;
      this.yaw = this.hideYaw + clamp(rel, -0.85, 0.85);
      this.pitch = clamp(this.pitch, -0.5, 0.5);
    }

    /* ---------------------------------------------------------- movement */
    let speed = 0;
    let noiseTarget = NOISE.still;
    if (!this.hiding) {
      const ax = input.axes();
      const wantSprint = input.shift && ax.y > 0.1 && !this.exhausted && this.stamina > 0.02;
      this.crouching = input.ctrl;
      this.sprinting = wantSprint && !this.crouching;

      speed = this.crouching ? SPEED.crouch : this.sprinting ? SPEED.sprint : SPEED.walk;
      // Slower going backwards / sideways.
      if (ax.y < 0) speed *= 0.72;

      const cosY = Math.cos(this.yaw);
      const sinY = Math.sin(this.yaw);
      // Forward is -Z in view space.
      const wishX = ax.x * cosY - ax.y * sinY;
      const wishZ = -ax.x * sinY - ax.y * cosY;
      const wishLen = Math.hypot(wishX, wishZ);

      const accel = wishLen > 0.01 ? 26 : 16;
      const targetVX = wishLen > 0.01 ? (wishX / wishLen) * speed : 0;
      const targetVZ = wishLen > 0.01 ? (wishZ / wishLen) * speed : 0;
      this.vel.x = damp(this.vel.x, targetVX, accel, dt);
      this.vel.z = damp(this.vel.z, targetVZ, accel, dt);

      let nx = this.pos.x + this.vel.x * dt;
      let nz = this.pos.z + this.vel.z * dt;
      const res = this.level.resolveCircle(nx, nz, RADIUS);
      // Running into a wall at speed jolts the camera.
      if (res.hit && this.sprinting && this.moveSpeed > 3.2) {
        this.shake(0.25, 5);
        this.audio.footstep({ intensity: 0.5, surface: 'concrete' });
      }
      this.pos.x = res.x;
      this.pos.z = res.z;

      this.moveSpeed = Math.hypot(this.vel.x, this.vel.z);
      this.distance += this.moveSpeed * dt;

      noiseTarget =
        this.moveSpeed < 0.12
          ? NOISE.still
          : this.crouching
            ? NOISE.crouch
            : this.sprinting
              ? NOISE.sprint
              : NOISE.walk;

      /* ------------------------------------------------------- footsteps */
      const strideLen = this.crouching ? 1.15 : this.sprinting ? 1.62 : 1.3;
      if (this.moveSpeed > 0.35) {
        this.stepPhase += (this.moveSpeed / strideLen) * dt * Math.PI;
        if (this.stepPhase >= Math.PI) {
          this.stepPhase -= Math.PI;
          const inten = this.crouching ? 0.2 : this.sprinting ? 1 : 0.6;
          this.audio.footstep({
            intensity: inten,
            surface: 'concrete',
            pan: (Math.random() - 0.5) * 0.3,
          });
          this.bus.emit('noise', {
            pos: this.pos.clone(),
            level: this.crouching ? 0.14 : this.sprinting ? 1 : 0.5,
          });
          this.shake(this.sprinting ? 0.045 : 0.02, 9);
        }
      }
    } else {
      this.vel.set(0, 0, 0);
      this.moveSpeed = 0;
      noiseTarget = this.holdingBreath ? 0 : 0.05;
    }

    this.noise = damp(this.noise, noiseTarget, 8, dt);

    /* ----------------------------------------------------------- stamina */
    if (this.sprinting && this.moveSpeed > 1.2) {
      this.stamina -= dt * 0.185;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
      }
    } else {
      const regen = this.crouching || this.moveSpeed < 0.2 ? 0.14 : 0.075;
      this.stamina = clamp01(this.stamina + dt * regen);
      if (this.exhausted && this.stamina > 0.32) this.exhausted = false;
    }

    /* ------------------------------------------------------ breath holding */
    if (this.hiding && this.input.down('KeyQ')) {
      this.holdingBreath = true;
      this.breathHold = clamp01(this.breathHold - dt * 0.22);
      if (this.breathHold <= 0) this.holdingBreath = false;
    } else {
      this.holdingBreath = false;
      this.breathHold = clamp01(this.breathHold + dt * 0.16);
    }

    /* ---------------------------------------------------------- flashlight */
    const drainRate = 0.0043 * diff.batteryDrain;
    if (this.flashOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - dt * drainRate);
      if (this.battery === 0) {
        this.flashOn = false;
        this.audio.click({ pitch: 0.55, intensity: 0.7 });
        this.bus.emit('toast', '手电熄灭了');
      }
    }
    // Dying-battery brownout: the last 25% is a nervous, stuttering light.
    const low = clamp01(1 - this.battery / 0.25);
    const flickerNoise =
      1 -
      low *
      (0.35 + 0.65 * Math.abs(Math.sin(ctx.time * 9.1) * Math.sin(ctx.time * 3.3)));
    this.flashHealth = damp(this.flashHealth, this.flashOn ? clamp01(flickerNoise) : 0, 22, dt);
    // Fear makes the hand shake, which makes the beam shake.
    const beamJitter = this.fear * 0.02;

    const lit = (this.flashOn ? this.flashHealth : 0) * this.lightScale;
    this.spot.intensity = lit * 30;
    this.flood.intensity = lit * 9;
    this.bounce.intensity = lit * 3.4;
    this.spot.visible = lit > 0.01;
    this.flood.visible = lit > 0.01;
    this.bounce.visible = lit > 0.01;
    // Kept below 1 so bloom flares instead of clipping to a white blob.
    this.lensMat.color.setRGB(lit * 0.85 + 0.015, lit * 0.8 + 0.015, lit * 0.66 + 0.015);
    // The hand is lit by the spill off the torch body, so it follows the beam.
    this.vmKey.intensity = 0.12 + lit * 0.85;
    this.vmFill.intensity = 0.18 + lit * 0.5;
    if (this.beam) {
      this.beam.visible = lit > 0.02;
      this.beam.setTime(ctx.time);
      this.beam.setFade(lit);
    }

    /* ------------------------------------------------ camera motion & feel */
    // Stance / eye height.
    const targetEye = this.hiding ? 1.32 : this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eye = this.eyeSpring.update(targetEye, dt);

    // Head bob from the stride, breathing sway underneath it.
    this._bobT += this.moveSpeed * dt * 3.1;
    this._breathT += dt * (1.0 + this.fear * 1.6 + (1 - this.stamina) * 1.4);
    const bobAmp = this.settings.get('headBob')
      ? (this.crouching ? 0.018 : this.sprinting ? 0.055 : 0.032) * clamp01(this.moveSpeed / 2.2)
      : 0;
    const bobY = Math.abs(Math.sin(this._bobT)) * bobAmp;
    const bobX = Math.sin(this._bobT * 0.5) * bobAmp * 1.35;
    const breathY = Math.sin(this._breathT * 1.6) * 0.006 * (1 + this.fear);
    const breathX = Math.sin(this._breathT * 0.7) * 0.004;

    // Mouse-driven weapon sway.
    const swayTargetX = clamp(-md.x * 0.0016, -0.06, 0.06);
    const swayTargetY = clamp(md.y * 0.0016, -0.06, 0.06);
    this.swayX.update(swayTargetX, dt);
    this.swayY.update(swayTargetY, dt);
    this.beamYaw.update(swayTargetX * 1.4, dt);
    this.beamPitch.update(swayTargetY * 1.1, dt);

    // Strafe roll.
    const strafe = this.hiding ? 0 : (this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw));
    const rollTarget = clamp(-strafe * 0.012, -0.055, 0.055);
    this.rollSpring.update(rollTarget, dt);

    // Shake decays fast; fear adds a permanent tremor.
    this._shake = Math.max(0, this._shake - dt * this._shakeDecay * this._shake * 6 - dt * 0.02);
    const tremor = this.fear * 0.012;
    const sh = this._shake + tremor;
    const shakeX = (Math.random() - 0.5) * sh;
    const shakeY = (Math.random() - 0.5) * sh;
    const shakeR = (Math.random() - 0.5) * sh * 0.6;

    const cam = this.camera;
    cam.position.set(
      this.pos.x + bobX * 0.5 + breathX + shakeX,
      this.eye + bobY + breathY + shakeY,
      this.pos.z + shakeX * 0.4,
    );
    cam.rotation.set(
      this.pitch + bobY * 0.35 + shakeY * 0.6,
      this.yaw,
      this.rollSpring.value + bobX * 0.2 + shakeR,
    );

    this.beamHolder.rotation.set(
      this.beamPitch.value + (Math.random() - 0.5) * beamJitter,
      this.beamYaw.value + (Math.random() - 0.5) * beamJitter,
      0,
    );

    this.viewModel.position.set(
      0.34 + this.swayX.value * 1.6 - bobX * 0.6,
      -0.32 + this.swayY.value * 1.6 - bobY * 1.4 - (this.sprinting ? 0.03 : 0),
      -0.62 + (this.sprinting ? 0.04 : 0),
    );
    this.viewModel.rotation.set(
      -0.06 + this.swayY.value * 2.4 + bobY * 0.8,
      0.26 + this.swayX.value * 2.8,
      0.06 - this.swayX.value * 1.4,
    );
    // FOV: widens slightly when sprinting, narrows when terrified.
    const fovBase = this.settings.get('fov');
    const targetFov = fovBase + (this.sprinting ? 6 : 0) - this.fear * 5;
    const fov = this.fovSpring.update(targetFov, dt);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
