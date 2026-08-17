/**
 * The thing in the ward.
 *
 * Built from primitives into a hand-rigged hierarchy and animated entirely in
 * code (no skinning, no assets): a hunched, over-long humanoid that walks with
 * a broken gait, drops onto all fours to sprint, and unhinges its jaw when it
 * commits to a chase.
 *
 * The AI is a state machine over an A* path with separate hearing and sight
 * senses, a short memory of where you were last, and a stalking behaviour that
 * exists purely to be glimpsed at the end of a corridor.
 */

import {
  Group,
  Mesh,
  Object3D,
  CapsuleGeometry,
  SphereGeometry,
  BoxGeometry,
  Vector3,
  MathUtils,
} from 'three';
import { clamp, clamp01, damp, lerp, shortestAngle, TAU } from '../core/utils.js';
import { CELL } from '../world/maze.js';

/* Rig proportions. The leg chain is deliberately only just long enough to
 * reach the floor from the standing hip height, which produces the stiff,
 * over-extended gait without any inverse kinematics. */
const THIGH = 0.62;
const SHIN = 0.56;
const HIP_STAND = 1.22;
const HIP_CRAWL = 1.14;

export const STATE = {
  DORMANT: 'dormant',
  PATROL: 'patrol',
  INVESTIGATE: 'investigate',
  SEARCH: 'search',
  STALK: 'stalk',
  HUNT: 'hunt',
  ATTACK: 'attack',
  RETREAT: 'retreat',
  INSPECT: 'inspect',
};

export class Monster {
  constructor({ scene, level, audio, settings, bus, rng, phantom = false }) {
    this.scene = scene;
    this.level = level;
    this.audio = audio;
    this.settings = settings;
    this.bus = bus;
    this.rng = rng;
    /** A phantom is a hallucination: visible, silent, harmless, vanishes. */
    this.phantom = phantom;

    const c = level.monsterSpawnCell;
    const w = level.maze.worldOf(c.x, c.y);
    this.pos = new Vector3(w.x, 0, w.z);
    this.yaw = rng.range(0, TAU);
    this.speed = 0;
    this.state = phantom ? STATE.STALK : STATE.PATROL;
    this.stateTime = 0;

    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.target = new Vector3().copy(this.pos);
    this.lastKnown = null;
    this.awareness = 0;
    this.rage = 0;
    this.gait = 0; // 0 = upright walk, 1 = quadruped sprint
    this.stepPhase = 0;
    this.visible = false;
    this.distanceToPlayer = 999;
    this.grabbing = 0;
    this.stalkCooldown = rng.range(18, 40);
    this.lookedAt = 0;
    this.inspectLocker = null;
    this.alive = true;
    this.headTurn = 0;
    this.jaw = 0;
    this.twitch = 0;

    this._build();
    this._unsub = [bus.on('noise', (e) => this.hear(e))];
  }

  /* ----------------------------------------------------------------- rig */

  _build() {
    const mat = this.level.mats.skin;
    const eyeMat = this.level.mats.eye;
    const root = new Group();
    this.root = root;
    root.position.copy(this.pos);
    this.scene.add(root);

    const bone = (parent, x, y, z) => {
      const b = new Object3D();
      b.position.set(x, y, z);
      parent.add(b);
      return b;
    };
    /** Capsule that grows from the joint along -Y (bone-local down). */
    const limb = (parent, radius, length, taper = 1) => {
      const g = new CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 5, 8);
      g.translate(0, -length / 2, 0);
      const m = new Mesh(g, mat);
      m.scale.set(1, 1, taper);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    // Hips carry the legs and nothing else — the hunch lives on the spine, so
    // leaning the torso never lifts the feet off the floor.
    this.hips = bone(root, 0, HIP_STAND, 0);
    this.hips.name = 'pelvis';
    this.spine = bone(this.hips, 0, 0, 0);
    limb(this.spine, 0.15, 0.48, 0.72).rotation.x = Math.PI; // torso grows up
    // Pelvic mass, so the hip joints read as a body rather than two sockets.
    const pelvis = new Mesh(new SphereGeometry(0.118, 12, 10), mat);
    pelvis.scale.set(1.2, 0.85, 0.7);
    pelvis.castShadow = true;
    this.hips.add(pelvis);
    // A distended, sagging belly.
    const belly = new Mesh(new SphereGeometry(0.115, 12, 10), mat);
    belly.position.set(0, 0.22, -0.02);
    belly.scale.set(1.0, 1.5, 0.85);
    belly.castShadow = true;
    this.spine.add(belly);

    this.chest = bone(this.spine, 0, 0.46, 0);
    const ribs = limb(this.chest, 0.17, 0.42, 0.62);
    ribs.rotation.x = Math.PI;
    // Ribs pressing through the skin.
    for (let i = 0; i < 5; i++) {
      const w = 0.31 - i * 0.028;
      const r = new Mesh(new BoxGeometry(w, 0.02, 0.14), mat);
      r.position.set(0, 0.05 + i * 0.082, -0.075);
      r.rotation.x = -0.12 - i * 0.02;
      r.castShadow = false;
      this.chest.add(r);
    }
    // Shoulder mass + protruding scapulae.
    for (const sx of [-1, 1]) {
      const cap = new Mesh(new SphereGeometry(0.085, 10, 8), mat);
      cap.position.set(sx * 0.2, 0.34, 0);
      cap.castShadow = true;
      this.chest.add(cap);
      const blade = new Mesh(new BoxGeometry(0.15, 0.19, 0.035), mat);
      blade.position.set(sx * 0.13, 0.26, 0.1);
      blade.rotation.z = sx * 0.28;
      blade.castShadow = false;
      this.chest.add(blade);
    }

    this.neck = bone(this.chest, 0, 0.38, 0.02);
    limb(this.neck, 0.055, 0.19, 1).rotation.x = Math.PI;
    this.head = bone(this.neck, 0, 0.19, 0);
    // A long, narrow, backward-swept skull.
    const skull = new Mesh(new SphereGeometry(0.135, 14, 12), mat);
    skull.scale.set(0.74, 1.42, 0.92);
    skull.position.set(0, 0.09, 0.015);
    skull.rotation.x = -0.16;
    skull.castShadow = true;
    this.head.add(skull);
    // Brow ridge: the thing that turns a sphere into a face.
    const brow = new Mesh(new BoxGeometry(0.17, 0.035, 0.06), mat);
    brow.position.set(0, 0.13, -0.09);
    brow.rotation.x = 0.2;
    brow.castShadow = false;
    this.head.add(brow);
    // Sunken cheeks.
    for (const sx of [-1, 1]) {
      const cheek = new Mesh(new SphereGeometry(0.045, 8, 6), mat);
      cheek.position.set(sx * 0.075, 0.035, -0.055);
      cheek.scale.set(0.9, 1.5, 0.7);
      cheek.castShadow = false;
      this.head.add(cheek);
    }
    // Not eyes. Two wet slits that throw the torchlight back at you.
    for (const sx of [-1, 1]) {
      const socket = new Mesh(new SphereGeometry(0.038, 8, 6), mat);
      socket.position.set(sx * 0.055, 0.095, -0.075);
      socket.scale.set(1, 0.8, 0.5);
      socket.castShadow = false;
      this.head.add(socket);
      const e = new Mesh(new SphereGeometry(0.022, 8, 6), eyeMat);
      e.position.set(sx * 0.055, 0.093, -0.1);
      e.scale.set(1.15, 0.42, 0.5);
      this.head.add(e);
    }
    this.jawBone = bone(this.head, 0, -0.01, -0.02);
    const jawMesh = new Mesh(new BoxGeometry(0.115, 0.15, 0.15), mat);
    jawMesh.position.set(0, -0.075, -0.055);
    jawMesh.castShadow = true;
    this.jawBone.add(jawMesh);
    // Teeth along the jaw line.
    for (let i = 0; i < 6; i++) {
      const tooth = new Mesh(new BoxGeometry(0.014, 0.03, 0.014), mat);
      tooth.position.set(-0.04 + i * 0.016, 0.005, -0.115);
      tooth.castShadow = false;
      this.jawBone.add(tooth);
    }
    // The mouth interior: a dark hole rather than a lit surface.
    const maw = new Mesh(new SphereGeometry(0.058, 10, 8), this.level.mats.maw);
    maw.position.set(0, -0.03, -0.095);
    maw.scale.set(1, 0.85, 0.6);
    this.head.add(maw);

    // Arms — far too long, hanging well past the knees. One is slightly longer
    // than the other, which the eye reads as "wrong" before it reads as "long".
    this.arms = [];
    for (const sx of [-1, 1]) {
      const upper = 0.6 + (sx > 0 ? 0.03 : 0);
      const fore = 0.56 + (sx > 0 ? 0.025 : 0);
      const shoulder = bone(this.chest, sx * 0.21, 0.33, 0);
      limb(shoulder, 0.05, upper, 0.88);
      const elbow = bone(shoulder, 0, -upper, 0);
      limb(elbow, 0.04, fore, 0.88);
      const wrist = bone(elbow, 0, -fore, 0);
      const hand = limb(wrist, 0.038, 0.17, 0.55);
      // Long fingers.
      for (let f = 0; f < 4; f++) {
        const fg = new Mesh(new CapsuleGeometry(0.013, 0.15, 3, 5), mat);
        fg.position.set((f - 1.5) * 0.03, -0.26, 0);
        fg.rotation.z = (f - 1.5) * 0.14;
        fg.rotation.x = -0.12;
        fg.castShadow = false;
        wrist.add(fg);
      }
      this.arms.push({ shoulder, elbow, wrist, hand, side: sx });
    }

    // Legs — long, thin, and only just long enough to reach the floor, which
    // is what forces the stiff-kneed walk.
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = bone(this.hips, sx * 0.13, -0.04, 0);
      limb(hip, 0.072, THIGH, 0.9);
      const knee = bone(hip, 0, -THIGH, 0);
      limb(knee, 0.055, SHIN, 0.9);
      const ankle = bone(knee, 0, -SHIN, 0);
      const foot = new Mesh(new BoxGeometry(0.11, 0.06, 0.3), mat);
      foot.position.set(0, -0.03, -0.07);
      foot.castShadow = true;
      ankle.add(foot);
      this.legs.push({ hip, knee, ankle, foot, side: sx });
    }

    if (this.phantom) {
      // Hallucinations render slightly wrong: darker and shadowless.
      this.root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
    }
  }

  /**
   * The rig is modelled facing local -Z (eyes, jaw and toes all point that
   * way), so "forward" for this creature is the opposite of the usual +Z.
   */
  forward(out = new Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Yaw that makes the creature face a world position. */
  yawToward(x, z) {
    return Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
  }

  /* ---------------------------------------------------------------- senses */

  hear(evt) {
    if (this.phantom || !this.alive) return;
    const diff = this.settings.diff;
    const d = this.pos.distanceTo(evt.pos);
    const range = diff.hearingRange * (0.35 + evt.level * 1.15) * (1 + this.rage * 0.4);
    if (d > range) return;
    // Closer + louder = more certain.
    const cert = clamp01((1 - d / range) * (0.35 + evt.level));
    this.awareness = clamp01(this.awareness + cert * 0.85);
    this.lastKnown = evt.pos.clone();
    if (this.state === STATE.PATROL || this.state === STATE.SEARCH || this.state === STATE.STALK) {
      if (this.awareness > 0.35) this._setState(STATE.INVESTIGATE);
    }
  }

  /** Sight check against the player. */
  _look(player) {
    const eye = new Vector3(this.pos.x, 1.7, this.pos.z);
    const to = new Vector3().subVectors(player.eyePosition, eye);
    const dist = to.length();
    this.distanceToPlayer = dist;
    const diff = this.settings.diff;
    if (dist > diff.sightRange * (1 + this.rage * 0.3)) return 0;
    if (!this.level.hasLineOfSight(this.pos, player.pos)) return 0;

    to.normalize();
    const fwd = this.forward();
    const facing = fwd.dot(new Vector3(to.x, 0, to.z).normalize());
    // ~150° cone, and it notices motion in the periphery.
    if (facing < -0.25) return 0;

    // How visible is the player right now?
    let exposure = 0.16;
    exposure += this.level.lightAt(player.pos) * 0.9;
    if (player.flashOn && player.flashHealth > 0.2) {
      // A lit torch is a beacon; pointing it at the monster is worse.
      const playerFwd = player.forward();
      const towardMonster = playerFwd.dot(new Vector3(-to.x, 0, -to.z).normalize());
      exposure += 0.55 + clamp01(towardMonster) * 0.55;
    }
    if (player.crouching) exposure *= 0.55;
    if (player.moveSpeed > 3) exposure *= 1.45;
    if (player.hiding) exposure *= 0.05;

    const proximity = clamp01(1 - dist / (diff.sightRange + 4));
    return clamp01(exposure * (0.35 + proximity) * clamp01(facing + 0.5));
  }

  /* ----------------------------------------------------------------- paths */

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    if (s === STATE.HUNT && !this.phantom) {
      this.audio.scream(0.85, clamp(this._pan ?? 0, -1, 1));
      this.bus.emit('hunt-begin', this);
      this.jaw = 1;
    }
    if (s === STATE.SEARCH) this.path = [];
  }

  _pathTo(worldTarget) {
    const maze = this.level.maze;
    const a = maze.cellOf(this.pos.x, this.pos.z);
    const b = maze.cellOf(worldTarget.x, worldTarget.z);
    if (!maze.isFloor(b.x, b.y)) {
      // Snap to the nearest walkable cell.
      let best = null;
      let bd = Infinity;
      for (const f of maze.floors) {
        const d = (f.x - b.x) ** 2 + (f.y - b.y) ** 2;
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (!best) return;
      b.x = best.x;
      b.y = best.y;
    }
    const cells = maze.findPath(a.x, a.y, b.x, b.y);
    this.path = cells.map((c) => {
      const w = maze.worldOf(c.x, c.y);
      return new Vector3(w.x, 0, w.z);
    });
    this.pathIndex = 0;
  }

  _wanderTarget(playerPos) {
    const maze = this.level.maze;
    // Prefer somewhere far from where it already is, loosely toward the player
    // so it never fully abandons the map region you are in.
    const candidates = [];
    for (let i = 0; i < 26; i++) {
      const f = this.rng.pick(maze.floors);
      const w = maze.worldOf(f.x, f.y);
      const p = new Vector3(w.x, 0, w.z);
      const dSelf = p.distanceTo(this.pos);
      const dPlayer = playerPos ? p.distanceTo(playerPos) : 30;
      if (dSelf < 8) continue;
      candidates.push({ p, score: dSelf * 0.4 - Math.abs(dPlayer - 18) * 0.6 });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.length ? candidates[0].p : this.pos.clone();
  }

  /** Somewhere the player can see, at the end of a corridor, far enough away. */
  _stalkSpot(player) {
    const maze = this.level.maze;
    const pc = maze.cellOf(player.pos.x, player.pos.z);
    const best = [];
    for (let i = 0; i < 90; i++) {
      const f = this.rng.pick(maze.floors);
      const w = maze.worldOf(f.x, f.y);
      const p = new Vector3(w.x, 0, w.z);
      const d = p.distanceTo(player.pos);
      if (d < 9 || d > 22) continue;
      if (!maze.lineOfSight(pc.x, pc.y, f.x, f.y)) continue;
      // Prefer spots roughly in front of the player.
      const fwd = player.forward();
      const to = new Vector3().subVectors(p, player.pos).normalize();
      const infront = fwd.dot(to);
      best.push({ p, score: infront * 2 + (1 - Math.abs(d - 15) / 15) });
    }
    best.sort((a, b) => b.score - a.score);
    return best.length ? best[0].p : null;
  }

  /* ---------------------------------------------------------------- update */

  update(dt, ctx) {
    if (!this.alive) return;
    const player = ctx.player;
    const diff = this.settings.diff;
    this.stateTime += dt;
    this._pan = ctx.pan ?? 0;

    const seeing = this.phantom ? 0 : this._look(player);
    this.distanceToPlayer = this.pos.distanceTo(player.pos);

    /* ------------------------------------------------------- awareness */
    if (seeing > 0.02) {
      this.awareness = clamp01(this.awareness + seeing * dt * 2.1 * (1 + this.rage * 0.5));
      this.lastKnown = player.pos.clone();
    } else {
      this.awareness = clamp01(this.awareness - dt * 0.16);
    }

    /* ------------------------------------------------------ transitions */
    if (!this.phantom) {
      if (this.awareness >= 1 && this.state !== STATE.HUNT && this.state !== STATE.ATTACK) {
        this._setState(STATE.HUNT);
      }
      switch (this.state) {
        case STATE.PATROL:
          this.stalkCooldown -= dt;
          if (
            this.stalkCooldown <= 0 &&
            this.rng.chance(diff.stalkChance * dt * 0.8) &&
            this.distanceToPlayer > 10
          ) {
            const spot = this._stalkSpot(player);
            if (spot) {
              this.pos.copy(spot);
              this.path = [];
              this.stalkCooldown = this.rng.range(28, 55);
              this._setState(STATE.STALK);
            }
          }
          break;

        case STATE.STALK:
          // It stands perfectly still and watches. If you stare back, or come
          // too close, the illusion breaks.
          this.yaw += shortestAngle(this.yaw, this.yawToward(player.pos.x, player.pos.z)) * clamp01(4 * dt);
          if (ctx.playerLookingAt) this.lookedAt += dt;
          else this.lookedAt = Math.max(0, this.lookedAt - dt * 0.5);
          if (this.lookedAt > 1.4 || this.distanceToPlayer < 7 || this.stateTime > 14) {
            this.lookedAt = 0;
            if (this.distanceToPlayer < 9 || this.rng.chance(0.3)) {
              this._setState(STATE.HUNT);
            } else {
              this.audio.clang({ pan: this._pan, distance: this.distanceToPlayer, intensity: 0.9 });
              this.bus.emit('stalk-vanish', this);
              const t = this._wanderTarget(player.pos);
              this.pos.copy(t);
              this._setState(STATE.PATROL);
            }
          }
          break;

        case STATE.INVESTIGATE:
          if (this.lastKnown && this.pos.distanceTo(this.lastKnown) < 1.6) this._setState(STATE.SEARCH);
          if (this.stateTime > 22) this._setState(STATE.PATROL);
          break;

        case STATE.SEARCH: {
          // Sweep the area, and check any locker nearby — it knows the trick.
          if (this.stateTime > 9) {
            this._setState(STATE.PATROL);
          } else if (!this.inspectLocker && this.stateTime > 1.2) {
            const near = this.level.lockers
              .map((l) => ({ l, d: l.pos.distanceTo(this.pos) }))
              .filter((o) => o.d < 6.5)
              .sort((a, b) => a.d - b.d)[0];
            if (near && this.rng.chance(0.5)) {
              this.inspectLocker = near.l;
              this._setState(STATE.INSPECT);
            }
          }
          break;
        }

        case STATE.INSPECT: {
          const l = this.inspectLocker;
          if (!l) {
            this._setState(STATE.SEARCH);
            break;
          }
          const standoff = new Vector3(
            l.pos.x + Math.sin(l.yaw) * 1.1,
            0,
            l.pos.z + Math.cos(l.yaw) * 1.1,
          );
          if (this.pos.distanceTo(standoff) > 1.2) {
            this.target.copy(standoff);
          } else {
            this.target.copy(this.pos);
            // Standing right outside, breathing. Then it either rips the door
            // open or loses interest.
            if (this.stateTime > 3.4) {
              const playerInside = player.hiding && player.hideLocker === l;
              if (playerInside && (this.awareness > 0.5 || this.rng.chance(0.55))) {
                l.targetOpen = 1;
                this.audio.creak({ pan: this._pan, duration: 0.5, intensity: 1.4 });
                this.bus.emit('locker-opened', l);
                this._setState(STATE.ATTACK);
              } else {
                if (playerInside) this.bus.emit('near-miss', l);
                this.inspectLocker = null;
                this._setState(STATE.PATROL);
              }
            }
          }
          break;
        }

        case STATE.HUNT:
          if (this.distanceToPlayer < 1.85 && (this.level.hasLineOfSight(this.pos, player.pos) || player.hiding)) {
            this._setState(STATE.ATTACK);
          } else if (this.awareness < 0.25 && this.stateTime > 4) {
            this._setState(STATE.SEARCH);
          }
          break;

        case STATE.ATTACK:
          if (this.distanceToPlayer > 2.9) this._setState(STATE.HUNT);
          break;

        case STATE.RETREAT:
          if (this.stateTime > 8) this._setState(STATE.PATROL);
          break;

        default:
          break;
      }
    } else if (this.stateTime > 6) {
      // Phantoms never last long.
      this.bus.emit('phantom-expire', this);
    }

    /* ------------------------------------------------------------ goals */
    let moveSpeed = 0;
    switch (this.state) {
      case STATE.PATROL:
        moveSpeed = 1.42 + this.rage * 0.4;
        this.repathTimer -= dt;
        if (!this.path.length || this.pathIndex >= this.path.length || this.repathTimer <= 0) {
          this.repathTimer = 6;
          this._pathTo(this._wanderTarget(player.pos));
        }
        break;
      case STATE.INVESTIGATE:
        moveSpeed = 2.15 + this.rage * 0.5;
        this.repathTimer -= dt;
        if (this.repathTimer <= 0 && this.lastKnown) {
          this.repathTimer = 1.2;
          this._pathTo(this.lastKnown);
        }
        break;
      case STATE.SEARCH:
        moveSpeed = 1.15;
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 2.6;
          const around = this.lastKnown ?? this.pos;
          const jitter = new Vector3(
            around.x + this.rng.range(-CELL * 2, CELL * 2),
            0,
            around.z + this.rng.range(-CELL * 2, CELL * 2),
          );
          this._pathTo(jitter);
        }
        break;
      case STATE.INSPECT:
        moveSpeed = 1.7;
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 1.5;
          this._pathTo(this.target);
        }
        break;
      case STATE.HUNT:
        moveSpeed = diff.monsterSpeed * (1 + this.rage * 0.16);
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 0.32;
          this._pathTo(this.lastKnown ?? player.pos);
        }
        break;
      case STATE.ATTACK:
        moveSpeed = diff.monsterSpeed * 1.12;
        this.path = [];
        break;
      case STATE.RETREAT:
        moveSpeed = 1.9;
        this.repathTimer -= dt;
        if (this.repathTimer <= 0) {
          this.repathTimer = 3;
          this._pathTo(this._wanderTarget(player.pos));
        }
        break;
      case STATE.STALK:
      default:
        moveSpeed = 0;
        break;
    }

    /* --------------------------------------------------------- steering */
    let desired = null;
    if (this.state === STATE.ATTACK) {
      desired = new Vector3(player.pos.x, 0, player.pos.z);
    } else if (this.path.length && this.pathIndex < this.path.length) {
      const wp = this.path[this.pathIndex];
      if (this.pos.distanceTo(wp) < 0.75) this.pathIndex++;
      desired = this.path[Math.min(this.pathIndex, this.path.length - 1)];
    }

    if (desired && moveSpeed > 0) {
      const to = new Vector3().subVectors(desired, this.pos);
      to.y = 0;
      const dist = to.length();
      if (dist > 0.02) {
        to.normalize();
        const wantYaw = this.yawToward(desired.x, desired.z);
        const turnRate = this.state === STATE.HUNT || this.state === STATE.ATTACK ? 7.5 : 3.4;
        this.yaw += shortestAngle(this.yaw, wantYaw) * clamp01(turnRate * dt);
        // It only accelerates once it is roughly facing the way it wants to go.
        const align = clamp01(1 - Math.abs(shortestAngle(this.yaw, wantYaw)) / 1.6);
        const step = moveSpeed * (0.35 + align * 0.65) * dt;
        const nx = this.pos.x - Math.sin(this.yaw) * step;
        const nz = this.pos.z - Math.cos(this.yaw) * step;
        const res = this.level.resolveCircle(nx, nz, 0.42);
        this.speed = damp(this.speed, moveSpeed * align, 8, dt);
        this.pos.x = res.x;
        this.pos.z = res.z;
        if (res.hit) this.repathTimer = Math.min(this.repathTimer, 0.15);
      }
    } else {
      this.speed = damp(this.speed, 0, 8, dt);
    }

    /* --------------------------------------------------------- the grab */
    if (this.state === STATE.ATTACK && !this.phantom) {
      const reach = player.hiding ? 1.6 : 1.35;
      if (this.distanceToPlayer < reach) {
        this.grabbing += dt;
        this.jaw = 1;
        player.shake(0.6, 2);
        if (this.grabbing > diff.grabTime) {
          this.bus.emit('caught', this);
          this.grabbing = 0;
        }
      } else {
        this.grabbing = Math.max(0, this.grabbing - dt * 0.6);
      }
    } else {
      this.grabbing = Math.max(0, this.grabbing - dt);
    }

    /* ---------------------------------------------------------- animate */
    this._animate(dt, ctx);

    /* ------------------------------------------------- monster footsteps */
    if (!this.phantom && this.speed > 0.4) {
      const stride = this.gait > 0.5 ? 1.05 : 1.45;
      this.stepPhase += (this.speed / stride) * dt * Math.PI;
      if (this.stepPhase >= Math.PI) {
        this.stepPhase -= Math.PI;
        const att = clamp01(1 - this.distanceToPlayer / 24);
        if (att > 0.02) {
          this.audio.footstep({
            intensity: 0.35 + att * 1.15,
            surface: this.rng.chance(0.25) ? 'metal' : 'concrete',
            pan: this._pan,
          });
        }
      }
    }
  }

  _animate(dt, ctx) {
    const t = ctx.time;
    const running = this.state === STATE.HUNT || this.state === STATE.ATTACK;
    this.gait = damp(this.gait, running && this.speed > 2.2 ? 1 : 0, 3.2, dt);
    const g = this.gait;

    // Stride phase advances with actual movement so feet don't skate.
    this._animPhase = (this._animPhase ?? 0) + this.speed * dt * (g > 0.5 ? 3.4 : 2.5);
    const p = this._animPhase;
    const moving = clamp01(this.speed / 2);

    // Idle: shoulders rise and fall, head twitches.
    this.twitch -= dt;
    if (this.twitch <= 0 && this.rng.chance(dt * 0.6)) {
      this.twitch = this.rng.range(0.08, 0.22);
      this.headTurn = this.rng.range(-0.7, 0.7);
    }
    const breath = Math.sin(t * (running ? 4.4 : 1.35)) * (running ? 0.05 : 0.022);

    /* --------------------------------------------------------- posture */
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.yaw;

    // The pelvis only bobs and rolls; the fold lives on the spine so the legs
    // always hang straight down from under the body.
    this.hips.position.y =
      lerp(HIP_STAND, HIP_CRAWL, g) + breath * 0.5 - Math.abs(Math.sin(p)) * 0.03 * moving;
    this.hips.rotation.x = 0;
    this.hips.rotation.z = Math.sin(p) * 0.05 * moving;
    this.hips.rotation.y = Math.sin(p) * 0.09 * moving;

    // Hunched when walking, folded almost horizontal when it goes to all fours.
    this.spine.rotation.x = lerp(0.24, 1.12, g) + breath;
    this.spine.rotation.z = Math.sin(p + 0.6) * 0.06 * moving;
    this.chest.rotation.x = lerp(-0.06, -0.24, g);
    this.chest.rotation.y = Math.sin(p) * 0.12 * moving;

    // Head: cranes forward on the walk, thrust out level when it charges.
    const wantHeadTurn = running ? 0 : this.headTurn;
    this.neck.rotation.x = lerp(-0.22, -0.78, g) + Math.sin(t * 2.1) * 0.03;
    this.neck.rotation.y = damp(this.neck.rotation.y, wantHeadTurn, 8, dt);
    this.head.rotation.x = lerp(0.12, -0.15, g) + (running ? Math.sin(t * 9) * 0.05 : 0);
    this.head.rotation.z = Math.sin(t * 1.7) * 0.06;

    // Jaw hangs open, wider when it is hunting.
    const jawTarget = running ? 0.55 + Math.sin(t * 7) * 0.18 : 0.12 + Math.sin(t * 1.1) * 0.06;
    this.jaw = damp(this.jaw, jawTarget, 6, dt);
    this.jawBone.rotation.x = this.jaw;

    /* ------------------------------------------------------------ legs */
    // Base angles are chosen so the near-straight support leg exactly reaches
    // the floor; the swing leg folds up and over.
    const thighBase = lerp(0.13, 0.3, g);
    const kneeBase = lerp(0.23, 0.42, g);
    this.legs.forEach((leg, i) => {
      const ph = p + (i === 0 ? 0 : Math.PI);
      const swing = Math.sin(ph) * moving;
      const lift = Math.max(0, Math.sin(ph)) * moving;
      const a = thighBase + swing * lerp(0.5, 0.72, g);
      const b = kneeBase + lift * lerp(0.55, 0.95, g);
      leg.hip.rotation.x = a;
      leg.knee.rotation.x = b;
      // Keep the sole roughly parallel to the floor.
      leg.ankle.rotation.x = -(a + b) * 0.85 + lerp(0.05, 0.24, g) - lift * 0.18;
      leg.hip.rotation.z = leg.side * lerp(0.05, 0.14, g);
    });

    /* ------------------------------------------------------------ arms */
    // Upright: they dangle past the knees and swing out of phase with the legs.
    // Quadruped: they plant ahead of the body and take the weight.
    this.arms.forEach((arm, i) => {
      const ph = p + (i === 0 ? Math.PI : 0);
      const swing = Math.sin(ph) * moving;
      const walkShoulder = -0.08 + swing * -0.4;
      const walkElbow = 0.3 + Math.abs(swing) * 0.22;
      // -spine pitch points the arm back down at the floor.
      const runShoulder = -0.9 + swing * 0.45;
      const runElbow = 0.3 + Math.max(0, swing) * 0.55;
      arm.shoulder.rotation.x = lerp(walkShoulder, runShoulder, g);
      arm.shoulder.rotation.z = arm.side * lerp(0.14, 0.3, g);
      arm.elbow.rotation.x = lerp(walkElbow, runElbow, g);
      arm.wrist.rotation.x = lerp(0.12, -0.2, g);

      if (this.state === STATE.ATTACK) {
        const reach = clamp01(this.grabbing / 0.4 + 0.35);
        arm.shoulder.rotation.x = lerp(arm.shoulder.rotation.x, -1.5 - reach * 0.35, 0.8);
        arm.elbow.rotation.x = lerp(arm.elbow.rotation.x, 0.2, 0.8);
        arm.shoulder.rotation.z = arm.side * (0.45 - reach * 0.3);
        arm.wrist.rotation.x = -0.5;
      }
    });

    // Visibility for the audio mix and the director.
    this.visible = ctx.isVisible?.(this) ?? false;
  }

  /** Called when the level's power comes back on. */
  enrage(amount = 1) {
    this.rage = clamp01(this.rage + amount);
    this.awareness = clamp01(this.awareness + 0.5);
    if (!this.phantom) this.audio.scream(1, this._pan ?? 0);
  }

  teleportNear(pos, minDist = 12, maxDist = 20) {
    const maze = this.level.maze;
    const options = [];
    for (let i = 0; i < 80; i++) {
      const f = this.rng.pick(maze.floors);
      const w = maze.worldOf(f.x, f.y);
      const p = new Vector3(w.x, 0, w.z);
      const d = p.distanceTo(pos);
      if (d < minDist || d > maxDist) continue;
      options.push(p);
    }
    if (options.length) {
      this.pos.copy(this.rng.pick(options));
      this.path = [];
      this.pathIndex = 0;
    }
  }

  dispose() {
    this._unsub.forEach((fn) => fn());
    this.alive = false;
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
