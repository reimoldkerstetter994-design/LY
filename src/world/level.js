/**
 * Level assembly: turns a Maze into an actual place.
 *
 *  - merged shell meshes (floor / ceiling / tiled + painted walls)
 *  - instanced props, dressed per room type
 *  - a pooled lighting system: dozens of ceiling fixtures, but only a few
 *    real SpotLights, reassigned to whatever is nearest the player
 *  - objectives: fuses, the breaker panel, the exit door
 *  - hiding lockers, blood decals, wall scrawls, floating dust
 */

import {
  Group,
  Mesh,
  InstancedMesh,
  Matrix4,
  Vector3,
  Euler,
  Quaternion,
  SpotLight,
  PointLight,
  Object3D,
  PlaneGeometry,
  BufferGeometry,
  BufferAttribute,
  InstancedBufferAttribute,
  Points,
  MeshBasicMaterial,
  MeshStandardMaterial,
  AdditiveBlending,
  DoubleSide,
  Color,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, WALL_H, Maze } from './maze.js';
import { buildShellGeometry, TILE_TOP } from './geometry.js';
import {
  PROP_FACTORIES,
  makeLockerBody,
  makeLockerDoor,
  makeBreakerPanel,
  makeExitDoor,
  makeFuse,
  makeBattery,
  makeLampFixture,
  makePipeRun,
} from './props.js';
import { makeBeamCone, makeDustMaterial } from '../gfx/materials.js';
import { bakeGraffiti, GRAFFITI_LINES } from '../gfx/textures.js';
import { clamp, clamp01, lerp, TAU } from '../core/utils.js';

const _m4 = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _one = new Vector3(1, 1, 1);

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

function matrixOf(x, y, z, yaw = 0, scale = 1, pitch = 0) {
  _e.set(pitch, yaw, 0);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  return _m4.compose(_v, _q, _one.clone().multiplyScalar(scale)).clone();
}

export class Level {
  constructor({ scene, materials, textures, settings, rng }) {
    this.scene = scene;
    this.mats = materials;
    this.tex = textures;
    this.settings = settings;
    this.rng = rng;

    const size = settings.q.propDensity > 0.8 ? 29 : 25;
    this.maze = new Maze(size, size, rng);

    this.root = new Group();
    this.root.name = 'level';
    scene.add(this.root);

    /** Extra circular colliders for chunky props. */
    this.colliders = [];
    /** Things the player can look at and press E on. */
    this.interactables = [];
    this.lamps = [];
    this.lockers = [];
    this.fuses = [];
    this.batteries = [];
    this.occupied = new Set();
    this.powered = false;
    this._lampTimer = 0;
    this._time = 0;
  }

  /* ------------------------------------------------------------------ build */

  async build(onProgress) {
    const step = async (frac, label) => {
      onProgress?.(frac, label);
      await new Promise((r) => setTimeout(r, 0));
    };

    this._layout();
    await step(0.1, '浇筑混凝土');
    this._buildShell();
    await step(0.35, '砌墙');
    this._buildProps();
    await step(0.6, '搬进病床');
    this._buildLamps();
    await step(0.72, '接通照明');
    this._buildLockers();
    this._buildObjectives();
    await step(0.85, '藏好保险丝');
    this._buildDressing();
    await step(0.94, '涂上墙面的字');
    this._buildDust();
    this._buildLightPool();
    await step(1, '关灯');
  }

  /** Choose spawn, exit, breaker room and fuse cells. */
  _layout() {
    const maze = this.maze;
    const rng = this.rng;

    // Spawn in a room if we can, so the player starts somewhere legible.
    const spawnRoom = maze.rooms.length ? maze.rooms[0] : null;
    this.spawnCell = spawnRoom
      ? { x: spawnRoom.x + ((spawnRoom.w - 1) >> 1), y: spawnRoom.y + ((spawnRoom.h - 1) >> 1) }
      : { x: 1, y: 1 };
    const spawnWorld = maze.worldOf(this.spawnCell.x, this.spawnCell.y);
    this.spawn = new Vector3(spawnWorld.x, 0, spawnWorld.z);

    const { field } = maze.farthestFrom([this.spawnCell]);
    this.spawnField = field;

    // Exit: a border-adjacent cell as far from spawn as possible.
    let bestExit = null;
    let bestD = -1;
    for (const f of maze.floors) {
      const border =
        f.x === 1 || f.y === 1 || f.x === maze.w - 2 || f.y === maze.h - 2;
      if (!border) continue;
      const d = field[maze.idx(f.x, f.y)];
      if (d > bestD) {
        bestD = d;
        bestExit = f;
      }
    }
    this.exitCell = bestExit ?? maze.floors[maze.floors.length - 1];

    // Which border side is the exit on?
    const ex = this.exitCell.x;
    const ey = this.exitCell.y;
    let dir = [0, -1];
    if (ey === 1) dir = [0, -1];
    else if (ey === maze.h - 2) dir = [0, 1];
    else if (ex === 1) dir = [-1, 0];
    else dir = [1, 0];
    this.exitDir = dir;

    // Breaker panel: a wall in a room that is far from both spawn and exit.
    const exitField = maze.distanceField([this.exitCell]);
    let bestRoom = null;
    let bestScore = -1;
    for (const r of maze.rooms) {
      const c = { x: r.x + ((r.w - 1) >> 1), y: r.y + ((r.h - 1) >> 1) };
      const d1 = field[maze.idx(c.x, c.y)];
      const d2 = exitField[maze.idx(c.x, c.y)];
      if (d1 < 0 || d2 < 0) continue;
      const score = Math.min(d1, d2) + d1 * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestRoom = r;
      }
    }
    this.breakerRoom = bestRoom ?? maze.rooms[maze.rooms.length - 1] ?? null;

    // Fuses: spread out, biased far from spawn, preferring rooms.
    const need = this.settings.diff.fuses;
    const candidates = maze.floors
      .map((f) => ({ ...f, d: field[maze.idx(f.x, f.y)], room: maze.roomId[maze.idx(f.x, f.y)] }))
      .filter((f) => f.d > 6)
      .sort((a, b) => b.d - a.d);

    const picked = [];
    const minSep = 6;
    for (const c of candidates) {
      if (picked.length >= need) break;
      if (c.room < 0 && rng.chance(0.55)) continue; // prefer rooms
      if (picked.some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < minSep)) continue;
      picked.push(c);
    }
    // Top up if the maze was stingy.
    for (const c of candidates) {
      if (picked.length >= need) break;
      if (picked.some((p) => p.x === c.x && p.y === c.y)) continue;
      picked.push(c);
    }
    this.fuseCells = picked.slice(0, need);

    // Batteries: sprinkled everywhere, more of them on easier settings. The
    // cells themselves are chosen after dressing, from whatever is still free.
    this.batteryCount = Math.round(7 * (2 - this.settings.diff.batteryDrain));

    // Monster starts far from the player.
    const far = maze.floors.filter((f) => field[maze.idx(f.x, f.y)] > 12);
    this.monsterSpawnCell = far.length ? rng.pick(far) : this.exitCell;

    // Reserve the objective cells before dressing, so nothing gets buried
    // under a gurney or walled in by a shelf.
    this._mark(this.spawnCell.x, this.spawnCell.y);
    this._mark(this.exitCell.x, this.exitCell.y);
    for (const c of this.fuseCells) this._mark(c.x, c.y);
  }

  _buildShell() {
    const geo = buildShellGeometry(this.maze);
    const add = (g, mat, name, receive = true, cast = false) => {
      const mesh = new Mesh(g, mat);
      mesh.name = name;
      mesh.receiveShadow = receive;
      mesh.castShadow = cast;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
      return mesh;
    };
    this.floorMesh = add(geo.floor, this.mats.floor, 'floor');
    this.ceilMesh = add(geo.ceiling, this.mats.ceiling, 'ceiling');
    this.tileMesh = add(geo.tile, this.mats.tile, 'wallTile', true, true);
    this.paintMesh = add(geo.paint, this.mats.paint, 'wallPaint', true, true);
  }

  /* ------------------------------------------------------------------ props */

  _wallSides(cx, cy) {
    const out = [];
    for (const d of DIRS) if (this.maze.isSolid(cx + d[0], cy + d[1])) out.push(d);
    return out;
  }

  /** Position + yaw for a prop standing with its back against a wall. */
  _wallAnchor(cx, cy, inset = 0.55) {
    const sides = this._wallSides(cx, cy);
    if (!sides.length) return null;
    const d = this.rng.pick(sides);
    const c = this.maze.worldOf(cx, cy);
    const jitter = this.rng.range(-CELL * 0.22, CELL * 0.22);
    const along = d[0] === 0 ? [1, 0] : [0, 1];
    return {
      x: c.x + d[0] * (CELL / 2 - inset) + along[0] * jitter,
      z: c.z + d[1] * (CELL / 2 - inset) + along[1] * jitter,
      yaw: Math.atan2(-d[0], -d[1]),
      dir: d,
    };
  }

  _mark(cx, cy) {
    this.occupied.add(this.maze.idx(cx, cy));
  }

  _isFree(cx, cy) {
    return !this.occupied.has(this.maze.idx(cx, cy));
  }

  _push(type, variant, matrix) {
    this._placements.push({ type, variant, matrix });
  }

  _addCollider(x, z, r) {
    this.colliders.push({ x, z, r });
  }

  _buildProps() {
    const rng = this.rng;
    const density = this.settings.q.propDensity;
    this._placements = [];

    // Three variants of each prop keeps repetition from reading as tiling.
    this.propGeos = {};
    for (const [type, factory] of Object.entries(PROP_FACTORIES)) {
      this.propGeos[type] = [];
      for (let i = 0; i < 3; i++) {
        this.propGeos[type].push(factory(rng, { occupied: type === 'gurney' && i === 1 }));
      }
    }
    this.propGeos.pipes = [makePipeRun(rng, CELL), makePipeRun(rng, CELL)];

    /* ------------------------------------------------------------- rooms */
    for (const room of this.maze.rooms) {
      const cells = [];
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) cells.push({ x, y });
      }
      rng.shuffle(cells);
      const budget = Math.max(2, Math.floor(cells.length * 0.5 * density));
      let used = 0;

      const sets = {
        ward: ['gurney', 'gurney', 'ivStand', 'curtain', 'chair', 'mattress'],
        bath: ['sink', 'toilet', 'bucket', 'rubble', 'sink'],
        morgue: ['gurney', 'hook', 'cabinet', 'gurney', 'bucket'],
        storage: ['shelf', 'crate', 'barrel', 'rubble', 'crate'],
        office: ['desk', 'chair', 'cabinet', 'clock', 'chair'],
      };
      const menu = sets[room.kind] ?? sets.storage;

      for (const cell of cells) {
        if (used >= budget) break;
        if (cell.x === this.spawnCell.x && cell.y === this.spawnCell.y) continue;
        if (!this._isFree(cell.x, cell.y)) continue;
        const type = rng.pick(menu);
        if (!this.propGeos[type]) continue;
        const variant = rng.int(0, 2);
        const c = this.maze.worldOf(cell.x, cell.y);

        if (type === 'hook') {
          // Hooks hang from the ceiling.
          this._push(
            'hook',
            variant,
            matrixOf(c.x + rng.range(-1, 1), WALL_H - 0.06, c.z + rng.range(-1, 1), rng.range(0, TAU)),
          );
          used++;
          continue;
        }
        if (type === 'curtain' || type === 'clock' || type === 'sink' || type === 'toilet') {
          const a = this._wallAnchor(cell.x, cell.y, type === 'curtain' ? 1.1 : 0.34);
          if (!a) continue;
          const y = type === 'clock' ? 2.1 : 0;
          this._push(type, variant, matrixOf(a.x, y, a.z, a.yaw));
          if (type === 'sink' || type === 'toilet') this._addCollider(a.x, a.z, 0.34);
          used++;
          this._mark(cell.x, cell.y);
          continue;
        }

        const anchor = rng.chance(0.7) ? this._wallAnchor(cell.x, cell.y, 0.75) : null;
        const px = anchor ? anchor.x : c.x + rng.range(-0.7, 0.7);
        const pz = anchor ? anchor.z : c.z + rng.range(-0.7, 0.7);
        const yaw = anchor ? anchor.yaw + rng.range(-0.25, 0.25) : rng.range(0, TAU);
        this._push(type, variant, matrixOf(px, 0, pz, yaw, rng.range(0.96, 1.04)));
        const radius =
          type === 'gurney' ? 0.75 : type === 'shelf' || type === 'desk' ? 0.7
            : type === 'cabinet' ? 0.55 : type === 'barrel' || type === 'crate' ? 0.4 : 0;
        if (radius) this._addCollider(px, pz, radius);
        this._mark(cell.x, cell.y);
        used++;
      }
    }

    /* --------------------------------------------------------- corridors */
    for (const cell of this.maze.floors) {
      const inRoom = this.maze.roomId[this.maze.idx(cell.x, cell.y)] >= 0;
      if (inRoom) continue;
      if (cell.x === this.spawnCell.x && cell.y === this.spawnCell.y) continue;

      // Ceiling pipe runs follow straight corridors.
      const openN = this.maze.isFloor(cell.x, cell.y - 1);
      const openS = this.maze.isFloor(cell.x, cell.y + 1);
      const openE = this.maze.isFloor(cell.x + 1, cell.y);
      const openW = this.maze.isFloor(cell.x - 1, cell.y);
      const c = this.maze.worldOf(cell.x, cell.y);
      if (rng.chance(0.5 * density)) {
        if (openN && openS && !openE && !openW) {
          this._push('pipes', rng.int(0, 1), matrixOf(c.x, WALL_H, c.z, 0));
        } else if (openE && openW && !openN && !openS) {
          this._push('pipes', rng.int(0, 1), matrixOf(c.x, WALL_H, c.z, Math.PI / 2));
        }
      }

      if (!this._isFree(cell.x, cell.y)) continue;
      if (!rng.chance(0.3 * density)) continue;

      const type = rng.pick([
        'wheelchair', 'gurney', 'barrel', 'crate', 'rubble', 'bucket',
        'chair', 'mattress', 'rubble', 'cabinet',
      ]);
      const a = this._wallAnchor(cell.x, cell.y, type === 'gurney' ? 0.85 : 0.6);
      if (!a) continue;
      this._push(type, rng.int(0, 2), matrixOf(a.x, 0, a.z, a.yaw + rng.range(-0.4, 0.4)));
      const radius =
        type === 'gurney' ? 0.7 : type === 'cabinet' ? 0.5
          : type === 'barrel' || type === 'crate' ? 0.4 : type === 'wheelchair' ? 0.42 : 0;
      if (radius) this._addCollider(a.x, a.z, radius);
      this._mark(cell.x, cell.y);
    }

    /* -------------------------------------------- bake into InstancedMesh */
    const buckets = new Map();
    for (const p of this._placements) {
      const geos = this.propGeos[p.type]?.[p.variant];
      if (!geos) continue;
      for (const matKey of Object.keys(geos)) {
        const key = `${p.type}|${p.variant}|${matKey}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(p.matrix);
      }
    }

    const noShadow = new Set(['rubble', 'bucket', 'clock', 'hook', 'pipes', 'mattress']);
    this.propMeshes = [];
    for (const [key, mats] of buckets) {
      const [type, variantStr, matKey] = key.split('|');
      const geo = this.propGeos[type][Number(variantStr)][matKey];
      const material = this.mats[matKey] ?? this.mats.metal;
      const mesh = new InstancedMesh(geo, material, mats.length);
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = !noShadow.has(type);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.name = `prop:${key}`;
      this.root.add(mesh);
      this.propMeshes.push(mesh);
    }
  }

  /* ----------------------------------------------------------------- lamps */

  _buildLamps() {
    const rng = this.rng;
    const fixture = makeLampFixture();
    const positions = [];
    const working = [];

    for (const cell of this.maze.floors) {
      const inRoom = this.maze.roomId[this.maze.idx(cell.x, cell.y)] >= 0;
      const chance = inRoom ? 0.3 : 0.42;
      if (!rng.chance(chance)) continue;
      const c = this.maze.worldOf(cell.x, cell.y);
      const openNS = this.maze.isFloor(cell.x, cell.y - 1) || this.maze.isFloor(cell.x, cell.y + 1);
      const yaw = openNS ? 0 : Math.PI / 2;
      const pos = new Vector3(c.x, WALL_H - 0.02, c.z);
      positions.push({ pos, yaw, cell });
      // Only a minority of the fixtures still work, and none of them well.
      const alive = rng.chance(0.34);
      working.push(alive);
    }

    // Fixtures: one instanced mesh per material.
    const bodyMats = [];
    const glassMats = [];
    positions.forEach((p) => {
      bodyMats.push(matrixOf(p.pos.x, p.pos.y, p.pos.z, p.yaw));
      glassMats.push(matrixOf(p.pos.x, p.pos.y, p.pos.z, p.yaw));
    });
    if (bodyMats.length) {
      const body = new InstancedMesh(fixture.metal, this.mats.metal, bodyMats.length);
      bodyMats.forEach((m, i) => body.setMatrixAt(i, m));
      body.instanceMatrix.needsUpdate = true;
      body.castShadow = false;
      body.receiveShadow = true;
      body.computeBoundingSphere();
      this.root.add(body);

      // Emissive tubes get per-instance colour so dead ones look dead.
      const tubeMat = new MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const tubes = new InstancedMesh(fixture.glass, tubeMat, glassMats.length);
      glassMats.forEach((m, i) => tubes.setMatrixAt(i, m));
      tubes.instanceColor = new InstancedBufferAttribute(
        new Float32Array(glassMats.length * 3).fill(0.02),
        3,
      );
      tubes.instanceMatrix.needsUpdate = true;
      tubes.computeBoundingSphere();
      this.root.add(tubes);
      this.tubeMesh = tubes;
    }

    this.lamps = positions.map((p, i) => ({
      pos: p.pos,
      cell: p.cell,
      index: i,
      alive: working[i],
      // Flicker personality per lamp.
      flickerRate: rng.range(0.6, 7.5),
      flickerDepth: rng.range(0.25, 1),
      phase: rng.range(0, TAU),
      brownout: rng.range(0.4, 1),
      out: 0,
      level: 0,
    }));
  }

  _buildLightPool() {
    const q = this.settings.q;
    this.spotPool = [];
    const count = clamp(q.shadowLights + 1, 2, 4);
    for (let i = 0; i < count; i++) {
      const spot = new SpotLight(0xf3e8d0, 0, 14, 1.2, 0.78, 1.3);
      spot.castShadow = q.lampShadows && i < q.shadowLights;
      if (spot.castShadow) {
        spot.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
        spot.shadow.camera.near = 0.35;
        spot.shadow.camera.far = 13;
        spot.shadow.bias = -0.0022;
        spot.shadow.normalBias = 0.028;
      }
      spot.visible = false;
      const target = new Object3D();
      this.root.add(target);
      spot.target = target;
      this.root.add(spot);

      // Bounce fill so the floor under a lamp is not pitch black.
      const fill = new PointLight(0xe8dcc4, 0, 6.5, 1.6);
      fill.visible = false;
      this.root.add(fill);

      // Visible shaft of light hanging under the fixture.
      let shaft = null;
      if (q.volumetricSteps > 0) {
        shaft = makeBeamCone({
          length: WALL_H,
          angle: 0.78,
          color: 0xffeec8,
          intensity: 0.13,
          layers: 2,
        });
        shaft.visible = false;
        this.root.add(shaft);
      }

      this.spotPool.push({ spot, fill, shaft, lamp: null });
    }
  }

  /* --------------------------------------------------------------- lockers */

  _buildLockers() {
    const rng = this.rng;
    const bodyGeo = makeLockerBody();
    const doorGeo = makeLockerDoor();
    const cells = rng.shuffle(
      this.maze.floors.filter((f) => {
        if (!this._isFree(f.x, f.y)) return false;
        if (f.x === this.spawnCell.x && f.y === this.spawnCell.y) return false;
        return this._wallSides(f.x, f.y).length > 0;
      }),
    );

    const target = Math.max(6, Math.round(this.maze.floors.length * 0.035));
    for (const cell of cells) {
      if (this.lockers.length >= target) break;
      const a = this._wallAnchor(cell.x, cell.y, 0.34);
      if (!a) continue;

      const group = new Group();
      group.position.set(a.x, 0, a.z);
      group.rotation.y = a.yaw;

      const body = new Mesh(bodyGeo.metal, this.mats.metal);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const hinge = new Group();
      hinge.position.set(-0.38, 1.0, 0.31);
      const door = new Mesh(doorGeo.metal, this.mats.metal);
      door.castShadow = true;
      door.receiveShadow = true;
      hinge.add(door);
      group.add(hinge);

      this.root.add(group);

      // Stand near the door rather than against the back panel, so there is
      // something to look at through the slats.
      const inside = new Vector3(
        a.x + Math.sin(a.yaw) * 0.12,
        0,
        a.z + Math.cos(a.yaw) * 0.12,
      );
      const locker = {
        group,
        hinge,
        yaw: a.yaw,
        pos: new Vector3(a.x, 0, a.z),
        inside,
        open: 0,
        targetOpen: 0,
        cell,
      };
      this.lockers.push(locker);
      this._addCollider(a.x, a.z, 0.42);
      this._mark(cell.x, cell.y);

      this.interactables.push({
        kind: 'locker',
        pos: new Vector3(a.x, 1.1, a.z).add(
          new Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)).multiplyScalar(0.5),
        ),
        radius: 1.5,
        label: '躲进柜子',
        data: locker,
      });
    }
  }

  /* ------------------------------------------------------------ objectives */

  _buildObjectives() {
    const rng = this.rng;

    /* ------------------------------------------------------------- fuses */
    const fuseGeo = makeFuse();
    const glowGeo = new PlaneGeometry(0.5, 0.5);
    const glowMat = new MeshBasicMaterial({
      map: this.tex.glow,
      color: 0xffd9a0,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });

    for (const cell of this.fuseCells) {
      const a = this._wallAnchor(cell.x, cell.y, 0.5) ?? {
        ...this.maze.worldOf(cell.x, cell.y),
        yaw: 0,
      };
      const group = new Group();
      const height = 0.9;
      group.position.set(a.x, height, a.z);
      group.rotation.y = rng.range(0, TAU);

      for (const [key, geo] of Object.entries(fuseGeo)) {
        const mesh = new Mesh(geo, this.mats[key] ?? this.mats.metal);
        mesh.castShadow = false;
        group.add(mesh);
      }
      const glow = new Mesh(glowGeo, glowMat);
      glow.scale.setScalar(1.4);
      group.add(glow);

      // A shelf-like plinth so the fuse is not floating in mid air.
      const plinth = new Mesh(
        this.propGeos.crate[0].wood ?? new PlaneGeometry(0.1, 0.1),
        this.mats.wood,
      );
      plinth.position.set(a.x, 0, a.z);
      plinth.rotation.y = group.rotation.y;
      plinth.scale.setScalar(1.1);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      this.root.add(plinth);
      this._addCollider(a.x, a.z, 0.42);

      this.root.add(group);
      const item = { group, glow, taken: false, cell, bobPhase: rng.range(0, TAU) };
      this.fuses.push(item);
      this.interactables.push({
        kind: 'fuse',
        pos: group.position.clone(),
        radius: 2.0,
        label: '拾取保险丝',
        data: item,
      });
      this._mark(cell.x, cell.y);
    }

    /* --------------------------------------------------------- batteries */
    const batGeo = makeBattery();
    const batteryCells = rng
      .shuffle(
        this.maze.floors.filter(
          (f) =>
            this._isFree(f.x, f.y) && this.spawnField[this.maze.idx(f.x, f.y)] > 3,
        ),
      )
      .slice(0, this.batteryCount);
    for (const cell of batteryCells) {
      const c = this.maze.worldOf(cell.x, cell.y);
      const px = c.x + rng.range(-1.1, 1.1);
      const pz = c.z + rng.range(-1.1, 1.1);
      const group = new Group();
      group.position.set(px, 0.0, pz);
      group.rotation.set(Math.PI / 2, rng.range(0, TAU), 0);
      for (const [key, geo] of Object.entries(batGeo)) {
        group.add(new Mesh(geo, this.mats[key] ?? this.mats.metal));
      }
      const glow = new Mesh(glowGeo, glowMat.clone());
      glow.material.color = new Color(0x9fd4ff);
      glow.scale.setScalar(0.5);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.05;
      group.add(glow);
      this.root.add(group);
      const item = { group, glow, taken: false };
      this.batteries.push(item);
      this.interactables.push({
        kind: 'battery',
        pos: new Vector3(px, 0.3, pz),
        radius: 1.7,
        label: '拾取电池',
        data: item,
      });
    }

    /* ----------------------------------------------------- breaker panel */
    if (this.breakerRoom) {
      const room = this.breakerRoom;
      let anchor = null;
      const cells = [];
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) cells.push({ x, y });
      }
      for (const cell of this.rng.shuffle(cells)) {
        const sides = this._wallSides(cell.x, cell.y);
        if (!sides.length) continue;
        const d = sides[0];
        const c = this.maze.worldOf(cell.x, cell.y);
        anchor = {
          x: c.x + d[0] * (CELL / 2 - 0.1),
          z: c.z + d[1] * (CELL / 2 - 0.1),
          yaw: Math.atan2(-d[0], -d[1]),
          cell,
        };
        break;
      }
      if (anchor) {
        const panelGeo = makeBreakerPanel();
        const group = new Group();
        group.position.set(anchor.x, 1.45, anchor.z);
        group.rotation.y = anchor.yaw;
        for (const [key, geo] of Object.entries(panelGeo)) {
          const mesh = new Mesh(geo, this.mats[key] ?? this.mats.metal);
          mesh.castShadow = true;
          group.add(mesh);
        }
        // Dead indicator lamps that turn green when the power comes back.
        const led = new Mesh(new PlaneGeometry(0.09, 0.09), this.mats.signRed.clone());
        led.position.set(-0.26, 0.36, 0.1);
        group.add(led);
        this.breakerLed = led;
        this.root.add(group);
        this.breaker = { group, pos: group.position.clone(), used: false };
        this.interactables.push({
          kind: 'breaker',
          pos: group.position.clone(),
          radius: 2.2,
          label: '合上配电盘闸刀',
          data: this.breaker,
        });
        this.breakerPos = group.position.clone();
        this._mark(anchor.cell.x, anchor.cell.y);
      }
    }

    /* ----------------------------------------------------------- exit door */
    const ec = this.maze.worldOf(this.exitCell.x, this.exitCell.y);
    const d = this.exitDir;
    const doorGeo = makeExitDoor();
    const group = new Group();
    group.position.set(ec.x + d[0] * (CELL / 2 - 0.06), 0, ec.z + d[1] * (CELL / 2 - 0.06));
    group.rotation.y = Math.atan2(-d[0], -d[1]);
    for (const [key, geo] of Object.entries(doorGeo)) {
      const mesh = new Mesh(geo, this.mats[key] ?? this.mats.metal);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // EXIT sign above the door.
    const sign = new Mesh(new PlaneGeometry(0.7, 0.22), this.mats.sign.clone());
    sign.material.color = new Color(0x0f4a22);
    sign.position.set(0, 2.5, 0.12);
    group.add(sign);
    this.exitSign = sign;
    this.root.add(group);
    this.exit = { group, pos: group.position.clone(), open: false };
    this.exitPos = new Vector3(ec.x, 0, ec.z);
    this.interactables.push({
      kind: 'exit',
      pos: new Vector3(group.position.x, 1.3, group.position.z),
      radius: 2.6,
      label: '推开安全门',
      data: this.exit,
    });
    this._mark(this.exitCell.x, this.exitCell.y);
  }

  /* --------------------------------------------------------------- dressing */

  _buildDressing() {
    const rng = this.rng;

    /* ------------------------------------------------------ blood decals */
    const decals = [];
    const wallDecals = [];
    const count = Math.round(this.maze.floors.length * 0.22 * this.settings.q.propDensity);
    for (let i = 0; i < count; i++) {
      const cell = rng.pick(this.maze.floors);
      const c = this.maze.worldOf(cell.x, cell.y);
      const g = new PlaneGeometry(1, 1);
      const s = rng.range(0.8, 2.6);
      g.scale(s, s, 1);
      g.rotateX(-Math.PI / 2);
      g.rotateY(rng.range(0, TAU));
      g.translate(c.x + rng.range(-1.2, 1.2), 0.012, c.z + rng.range(-1.2, 1.2));
      decals.push(g);
    }
    if (decals.length) {
      const mesh = new Mesh(mergeGeometries(decals, false), this.mats.blood);
      mesh.name = 'blood-floor';
      mesh.renderOrder = 2;
      mesh.receiveShadow = false;
      this.root.add(mesh);
    }

    // Smears and hand prints on the walls.
    for (let i = 0; i < Math.round(count * 0.35); i++) {
      const cell = rng.pick(this.maze.floors);
      const sides = this._wallSides(cell.x, cell.y);
      if (!sides.length) continue;
      const d = rng.pick(sides);
      const c = this.maze.worldOf(cell.x, cell.y);
      const g = new PlaneGeometry(1, 1);
      const s = rng.range(0.6, 1.7);
      g.scale(s, s * rng.range(0.8, 1.6), 1);
      const yaw = Math.atan2(-d[0], -d[1]);
      g.rotateY(yaw);
      g.translate(
        c.x + d[0] * (CELL / 2 - 0.02),
        rng.range(0.5, 2.1),
        c.z + d[1] * (CELL / 2 - 0.02),
      );
      wallDecals.push(g);
    }
    if (wallDecals.length) {
      const mesh = new Mesh(mergeGeometries(wallDecals, false), this.mats.blood);
      mesh.name = 'blood-wall';
      mesh.renderOrder = 2;
      this.root.add(mesh);
    }

    /* ---------------------------------------------------------- graffiti */
    const lines = rng.shuffle([...GRAFFITI_LINES]).slice(0, 6);
    this.graffitiMats = lines.map(
      (text) =>
        new MeshStandardMaterial({
          map: bakeGraffiti(text, { size: 512 }),
          transparent: true,
          alphaTest: 0.06,
          depthWrite: false,
          roughness: 0.75,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3,
          side: DoubleSide,
        }),
    );
    const shuffled = rng.shuffle([...this.maze.floors]);
    let placed = 0;
    for (const cell of shuffled) {
      if (placed >= lines.length * 2) break;
      const sides = this._wallSides(cell.x, cell.y);
      if (!sides.length) continue;
      if (rng.chance(0.5)) continue;
      const d = rng.pick(sides);
      const c = this.maze.worldOf(cell.x, cell.y);
      const mat = rng.pick(this.graffitiMats);
      const size = rng.range(1.1, 1.9);
      const mesh = new Mesh(new PlaneGeometry(size, size), mat);
      mesh.position.set(
        c.x + d[0] * (CELL / 2 - 0.03),
        rng.range(1.1, 2.2),
        c.z + d[1] * (CELL / 2 - 0.03),
      );
      mesh.rotation.y = Math.atan2(-d[0], -d[1]);
      mesh.renderOrder = 3;
      this.root.add(mesh);
      placed++;
    }
  }

  _buildDust() {
    const n = Math.round(1400 * this.settings.q.propDensity);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const cell = this.rng.pick(this.maze.floors);
      const c = this.maze.worldOf(cell.x, cell.y);
      pos[i * 3] = c.x + this.rng.range(-CELL / 2, CELL / 2);
      pos[i * 3 + 1] = this.rng.range(0.1, WALL_H - 0.2);
      pos[i * 3 + 2] = c.z + this.rng.range(-CELL / 2, CELL / 2);
      seed[i] = this.rng();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    this.dustMat = makeDustMaterial(this.tex.dust);
    this.dust = new Points(geo, this.dustMat);
    this.dust.frustumCulled = false;
    this.root.add(this.dust);
  }

  /* ----------------------------------------------------------------- runtime */

  /** Turn the lights on — the reward, and the moment the hunt gets serious. */
  restorePower() {
    this.powered = true;
    for (const lamp of this.lamps) {
      // Most fixtures come back; the ones that were dead stay dead.
      if (!lamp.alive && this.rng.chance(0.55)) lamp.alive = true;
      lamp.brownout = Math.min(1, lamp.brownout + 0.35);
      lamp.flickerDepth *= 0.45;
    }
    if (this.breakerLed) this.breakerLed.material.color.setHex(0x2ade6a);
    if (this.exitSign) this.exitSign.material.color.setHex(0x2ade6a);
  }

  update(dt, playerPos) {
    this._time += dt;
    const t = this._time;

    /* -------------------------------------------------- lamp flicker state */
    for (const lamp of this.lamps) {
      if (!lamp.alive) {
        lamp.level = 0;
        continue;
      }
      // Layered sines + occasional dropouts read as failing ballast.
      const a = Math.sin(t * lamp.flickerRate + lamp.phase);
      const b = Math.sin(t * lamp.flickerRate * 3.7 + lamp.phase * 2.1);
      const noise = (a * 0.6 + b * 0.4) * 0.5 + 0.5;
      let level = lerp(1, noise, lamp.flickerDepth) * lamp.brownout;
      lamp.out -= dt;
      if (lamp.out > 0) level *= 0.04;
      else if (Math.random() < dt * 0.35 * lamp.flickerDepth) lamp.out = 0.05 + Math.random() * 0.5;
      lamp.level = clamp01(level);
    }

    /* ------------------------------------------------ reassign light pool */
    this._lampTimer -= dt;
    if (this._lampTimer <= 0 && playerPos) {
      this._lampTimer = 0.2;
      const near = this.lamps
        .filter((l) => l.alive && l.pos.distanceToSquared(playerPos) < 26 * 26)
        .sort(
          (a, b) => a.pos.distanceToSquared(playerPos) - b.pos.distanceToSquared(playerPos),
        );
      this.spotPool.forEach((slot, i) => {
        slot.lamp = near[i] ?? null;
      });
    }

    for (const slot of this.spotPool) {
      const lamp = slot.lamp;
      if (!lamp) {
        slot.spot.visible = false;
        slot.fill.visible = false;
        if (slot.shaft) slot.shaft.visible = false;
        continue;
      }
      slot.spot.visible = true;
      slot.spot.position.copy(lamp.pos);
      slot.spot.target.position.set(lamp.pos.x, 0, lamp.pos.z);
      slot.spot.target.updateMatrixWorld();
      slot.spot.intensity = lamp.level * 38;
      slot.fill.visible = lamp.level > 0.02;
      slot.fill.position.set(lamp.pos.x, lamp.pos.y - 1.0, lamp.pos.z);
      slot.fill.intensity = lamp.level * 4.5;
      if (slot.shaft) {
        slot.shaft.visible = lamp.level > 0.05;
        slot.shaft.position.copy(lamp.pos);
        slot.shaft.setTime(t);
        slot.shaft.setFade(lamp.level * 0.8);
      }
    }

    /* -------------------------------------------------- emissive tube glow */
    if (this.tubeMesh) {
      const col = this.tubeMesh.instanceColor;
      for (const lamp of this.lamps) {
        const v = lamp.alive ? 0.06 + lamp.level * 2.6 : 0.012;
        col.setXYZ(lamp.index, v, v * 0.97, v * 0.88);
      }
      col.needsUpdate = true;
    }

    /* -------------------------------------------------------- item motion */
    for (const f of this.fuses) {
      if (f.taken) continue;
      f.group.rotation.y += dt * 0.5;
      const s = 1.3 + Math.sin(t * 2.4 + f.bobPhase) * 0.28;
      f.glow.scale.setScalar(s);
    }

    /* ------------------------------------------------------- locker doors */
    for (const l of this.lockers) {
      l.open = lerp(l.open, l.targetOpen, 1 - Math.exp(-9 * dt));
      l.hinge.rotation.y = -l.open * 1.9;
    }

    if (this.dustMat) this.dustMat.uniforms.uTime.value = t;
  }

  /** Called by the renderer each frame so glows face the camera. */
  faceCamera(quaternion) {
    this._billboard = quaternion;
    for (const f of this.fuses) if (!f.taken) f.glow.quaternion.copy(quaternion);
    for (const b of this.batteries) if (!b.taken) b.glow.quaternion.copy(quaternion);
  }

  /* --------------------------------------------------------------- physics */

  /**
   * Resolve a circle against walls and prop colliders.
   * @returns {{x:number,z:number,hit:boolean}}
   */
  resolveCircle(x, z, radius) {
    const maze = this.maze;
    const c = maze.cellOf(x, z);
    let hit = false;

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = c.x + ox;
        const cy = c.y + oy;
        if (!maze.isSolid(cx, cy)) continue;
        const w = maze.worldOf(cx, cy);
        const minX = w.x - CELL / 2;
        const maxX = w.x + CELL / 2;
        const minZ = w.z - CELL / 2;
        const maxZ = w.z + CELL / 2;
        const nx = clamp(x, minX, maxX);
        const nz = clamp(z, minZ, maxZ);
        let dx = x - nx;
        let dz = z - nz;
        let d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        hit = true;
        if (d < 1e-5) {
          // Deep inside: push out along the shallowest axis.
          const toL = Math.abs(x - minX);
          const toR = Math.abs(maxX - x);
          const toT = Math.abs(z - minZ);
          const toB = Math.abs(maxZ - z);
          const m = Math.min(toL, toR, toT, toB);
          if (m === toL) x = minX - radius;
          else if (m === toR) x = maxX + radius;
          else if (m === toT) z = minZ - radius;
          else z = maxZ + radius;
          continue;
        }
        dx /= d;
        dz /= d;
        const push = radius - d;
        x += dx * push;
        z += dz * push;
      }
    }

    // Prop colliders.
    for (const col of this.colliders) {
      const dx = x - col.x;
      const dz = z - col.z;
      const rr = radius + col.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = rr - d;
      x += (dx / d) * push;
      z += (dz / d) * push;
      hit = true;
    }

    return { x, z, hit };
  }

  /** Is the straight line between two world points unobstructed by walls? */
  hasLineOfSight(a, b) {
    const ca = this.maze.cellOf(a.x, a.z);
    const cb = this.maze.cellOf(b.x, b.z);
    return this.maze.lineOfSight(ca.x, ca.y, cb.x, cb.y);
  }

  /** How lit is this world position? Used for sanity and monster sight. */
  lightAt(pos) {
    let light = 0;
    for (const lamp of this.lamps) {
      if (!lamp.alive || lamp.level < 0.05) continue;
      const d = lamp.pos.distanceTo(pos);
      if (d > 9) continue;
      light += lamp.level * clamp01(1 - d / 9);
    }
    return clamp01(light);
  }

  dispose() {
    const seenGeo = new Set();
    this.root.traverse((o) => {
      if (o.geometry && !seenGeo.has(o.geometry)) {
        seenGeo.add(o.geometry);
        o.geometry.dispose();
      }
    });
    // Only the materials this level owns — the shared library outlives the run.
    const owned = new Set(this.graffitiMats ?? []);
    if (this.dustMat) owned.add(this.dustMat);
    if (this.tubeMesh) owned.add(this.tubeMesh.material);
    for (const slot of this.spotPool ?? []) {
      for (const m of slot.shaft?.userData?.materials ?? []) owned.add(m);
    }
    for (const m of owned) {
      m.map?.dispose();
      m.dispose();
    }
    this.scene.remove(this.root);
  }
}
