/**
 * Procedural prop library.
 *
 * Each factory returns a map of `materialKey → merged BufferGeometry` in local
 * space (origin at the floor, facing +Z). The level builder turns those into
 * InstancedMeshes, so hundreds of props cost only a couple of dozen draw calls.
 */

import {
  BoxGeometry,
  CylinderGeometry,
  Matrix4,
  Euler,
  Quaternion,
  Vector3,
  TorusGeometry,
  SphereGeometry,
  PlaneGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new Matrix4();
const _e = new Euler();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3(1, 1, 1);

/** Transform a geometry in place; every primitive below goes through this. */
function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _m.compose(_v, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

const box = (w, h, d, x, y, z, rx, ry, rz) =>
  place(new BoxGeometry(w, h, d), x, y, z, rx, ry, rz);

const cyl = (rt, rb, h, seg, x, y, z, rx, ry, rz) =>
  place(new CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz);

const tube = (r, len, seg, x, y, z, rx, ry, rz) =>
  place(new CylinderGeometry(r, r, len, seg), x, y, z, rx, ry, rz);

const sph = (r, seg, x, y, z) => place(new SphereGeometry(r, seg, Math.max(4, seg >> 1)), x, y, z);

const torus = (r, tr, seg, x, y, z, rx, ry, rz) =>
  place(new TorusGeometry(r, tr, Math.max(4, seg >> 1), seg), x, y, z, rx, ry, rz);

function pack(groups) {
  const out = {};
  for (const [key, list] of Object.entries(groups)) {
    const clean = list.filter(Boolean);
    if (!clean.length) continue;
    out[key] = clean.length === 1 ? clean[0] : mergeGeometries(clean, false);
  }
  return out;
}

/* ------------------------------------------------------------------ props */

/** Hospital gurney, optionally with a shape under the sheet. */
export function makeGurney(rng, { occupied = false } = {}) {
  const h = 0.72;
  const w = 0.86;
  const l = 2.06;
  const metal = [
    box(w, 0.07, l, 0, h, 0),
    box(0.06, h, 0.06, -w / 2 + 0.06, h / 2, -l / 2 + 0.1),
    box(0.06, h, 0.06, w / 2 - 0.06, h / 2, -l / 2 + 0.1),
    box(0.06, h, 0.06, -w / 2 + 0.06, h / 2, l / 2 - 0.1),
    box(0.06, h, 0.06, w / 2 - 0.06, h / 2, l / 2 - 0.1),
    box(w - 0.1, 0.05, l - 0.3, 0, 0.28, 0),
    // Side rails.
    box(0.04, 0.34, l * 0.5, -w / 2, h + 0.2, -l * 0.2),
    box(0.04, 0.34, l * 0.5, w / 2, h + 0.2, -l * 0.2),
    box(0.04, 0.04, l * 0.5, -w / 2, h + 0.37, -l * 0.2),
    box(0.04, 0.04, l * 0.5, w / 2, h + 0.37, -l * 0.2),
  ];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    metal.push(
      cyl(0.075, 0.075, 0.035, 10, sx * (w / 2 - 0.08), 0.075, sz * (l / 2 - 0.14), 0, 0, Math.PI / 2),
    );
  }

  const fabric = [box(w - 0.14, 0.15, l - 0.34, 0, h + 0.1, 0)];
  if (occupied) {
    // A body-sized lump beneath a sheet, and a suggestion of a head.
    fabric.push(box(w - 0.2, 0.26, l * 0.62, 0, h + 0.24, l * 0.06));
    fabric.push(sph(0.16, 10, 0, h + 0.3, -l * 0.34));
    fabric.push(box(w - 0.1, 0.03, l - 0.2, 0, h + 0.19, 0));
  }
  const wobble = rng.range(-0.02, 0.02);
  return pack({ metal, fabric: fabric.map((g) => place(g, 0, 0, 0, 0, wobble, 0)) });
}

export function makeWheelchair() {
  const metal = [
    box(0.5, 0.05, 0.46, 0, 0.5, 0),
    box(0.5, 0.5, 0.05, 0, 0.75, -0.22),
    box(0.05, 0.5, 0.05, -0.25, 0.25, 0.2),
    box(0.05, 0.5, 0.05, 0.25, 0.25, 0.2),
    box(0.05, 0.34, 0.05, -0.25, 1.15, -0.26),
    box(0.05, 0.34, 0.05, 0.25, 1.15, -0.26),
    box(0.34, 0.05, 0.28, 0, 0.24, 0.28),
    torus(0.3, 0.028, 14, -0.3, 0.32, -0.05, 0, Math.PI / 2, 0),
    torus(0.3, 0.028, 14, 0.3, 0.32, -0.05, 0, Math.PI / 2, 0),
    cyl(0.05, 0.05, 0.04, 8, -0.3, 0.32, -0.05, 0, 0, Math.PI / 2),
    cyl(0.05, 0.05, 0.04, 8, 0.3, 0.32, -0.05, 0, 0, Math.PI / 2),
    torus(0.09, 0.02, 10, -0.22, 0.1, 0.3, 0, Math.PI / 2, 0),
    torus(0.09, 0.02, 10, 0.22, 0.1, 0.3, 0, Math.PI / 2, 0),
  ];
  const fabric = [box(0.44, 0.06, 0.42, 0, 0.53, 0), box(0.44, 0.44, 0.05, 0, 0.76, -0.19)];
  return pack({ metal, fabric });
}

export function makeIVStand(rng) {
  const h = rng.range(1.5, 1.85);
  const metal = [
    tube(0.018, h, 8, 0, h / 2, 0),
    tube(0.014, 0.34, 6, 0.09, h - 0.06, 0, 0, 0, Math.PI / 2),
    torus(0.16, 0.016, 12, 0, 0.06, 0, Math.PI / 2, 0, 0),
    cyl(0.03, 0.03, 0.03, 8, 0.16, 0.03, 0, 0, 0, 0),
    cyl(0.03, 0.03, 0.03, 8, -0.11, 0.03, 0.11, 0, 0, 0),
    cyl(0.03, 0.03, 0.03, 8, -0.11, 0.03, -0.11, 0, 0, 0),
  ];
  const fabric = [box(0.14, 0.26, 0.07, 0.22, h - 0.22, 0)];
  return pack({ metal, fabric });
}

export function makeChair(rng) {
  const broken = rng.chance(0.35);
  const wood = [
    box(0.44, 0.05, 0.44, 0, 0.45, 0),
    box(0.44, 0.5, 0.05, 0, 0.72, -0.2),
    box(0.05, 0.45, 0.05, -0.19, 0.22, -0.19),
    box(0.05, 0.45, 0.05, 0.19, 0.22, -0.19),
    box(0.05, 0.45, 0.05, -0.19, 0.22, 0.19),
    broken ? null : box(0.05, 0.45, 0.05, 0.19, 0.22, 0.19),
  ];
  return pack({ wood });
}

export function makeDesk() {
  const wood = [
    box(1.5, 0.06, 0.72, 0, 0.74, 0),
    box(0.06, 0.74, 0.66, -0.7, 0.37, 0),
    box(0.06, 0.74, 0.66, 0.7, 0.37, 0),
    box(1.36, 0.5, 0.05, 0, 0.46, -0.3),
    box(0.62, 0.2, 0.6, -0.34, 0.6, 0.03),
    box(0.62, 0.2, 0.6, 0.34, 0.6, 0.03),
  ];
  const metal = [
    box(0.16, 0.03, 0.03, -0.34, 0.6, 0.34),
    box(0.16, 0.03, 0.03, 0.34, 0.6, 0.34),
  ];
  return pack({ wood, metal });
}

export function makeShelf(rng) {
  const h = 1.95;
  const w = 1.1;
  const d = 0.42;
  const metal = [
    box(0.05, h, d, -w / 2, h / 2, 0),
    box(0.05, h, d, w / 2, h / 2, 0),
    box(w, 0.04, d, 0, 0.08, 0),
    box(w, 0.04, d, 0, 0.62, 0),
    box(w, 0.04, d, 0, 1.18, 0),
    box(w, 0.04, d, 0, 1.74, 0),
    box(w, h, 0.03, 0, h / 2, -d / 2),
  ];
  // Random junk on the shelves.
  for (let i = 0; i < 7; i++) {
    const y = rng.pick([0.2, 0.74, 1.3, 1.86]);
    metal.push(
      box(rng.range(0.1, 0.26), rng.range(0.1, 0.22), rng.range(0.1, 0.26), rng.range(-0.4, 0.4), y, rng.range(-0.1, 0.1)),
    );
  }
  return pack({ metal });
}

export function makeCabinet(rng) {
  const h = 1.32;
  const metal = [
    box(0.9, h, 0.44, 0, h / 2, 0),
    box(0.42, 0.28, 0.03, -0.22, h - 0.24, 0.23),
    box(0.42, 0.28, 0.03, 0.22, h - 0.24, 0.23),
    box(0.42, 0.28, 0.03, -0.22, h - 0.6, 0.23),
    box(0.42, 0.28, 0.03, 0.22, h - 0.6, 0.23),
    box(0.1, 0.02, 0.03, -0.22, h - 0.36, 0.25),
    box(0.1, 0.02, 0.03, 0.22, h - 0.36, 0.25),
  ];
  if (rng.chance(0.4)) {
    // A drawer left hanging open.
    metal.push(box(0.4, 0.24, 0.4, -0.22, h - 0.6, 0.42));
  }
  return pack({ metal });
}

export function makeBarrel(rng) {
  const h = 0.92;
  const metal = [
    cyl(0.3, 0.3, h, 16, 0, h / 2, 0),
    torus(0.305, 0.022, 14, 0, h * 0.28, 0, Math.PI / 2, 0, 0),
    torus(0.305, 0.022, 14, 0, h * 0.72, 0, Math.PI / 2, 0, 0),
    rng.chance(0.5) ? cyl(0.28, 0.28, 0.03, 14, 0, h + 0.02, 0) : null,
  ];
  return pack({ metal });
}

export function makeCrate(rng) {
  const s = rng.range(0.5, 0.78);
  const wood = [
    box(s, s, s, 0, s / 2, 0),
    box(s + 0.02, 0.05, 0.05, 0, s * 0.25, s / 2),
    box(s + 0.02, 0.05, 0.05, 0, s * 0.75, s / 2),
    box(0.05, 0.05, s + 0.02, s / 2, s * 0.25, 0),
  ];
  return pack({ wood });
}

export function makeMattress(rng) {
  const fabric = [
    box(0.9, 0.18, 1.9, 0, 0.09, 0, rng.range(-0.05, 0.05), 0, rng.range(-0.04, 0.04)),
  ];
  return pack({ fabric });
}

export function makeBucket() {
  const metal = [cyl(0.17, 0.13, 0.28, 12, 0, 0.14, 0), torus(0.17, 0.012, 10, 0, 0.27, 0, Math.PI / 2, 0, 0)];
  return pack({ metal });
}

export function makeRubble(rng) {
  const concrete = [];
  const n = 5 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    concrete.push(
      box(
        rng.range(0.1, 0.4),
        rng.range(0.05, 0.16),
        rng.range(0.1, 0.4),
        rng.range(-0.6, 0.6),
        rng.range(0.02, 0.09),
        rng.range(-0.6, 0.6),
        rng.range(-0.3, 0.3),
        rng.range(0, 3.14),
        rng.range(-0.3, 0.3),
      ),
    );
  }
  return pack({ concrete });
}

/** A run of ceiling pipes + conduit. Local +Z is along the run. */
export function makePipeRun(rng, length = 3.4) {
  const metal = [];
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const off = -0.45 + i * 0.34 + rng.range(-0.04, 0.04);
    const r = rng.range(0.045, 0.085);
    metal.push(tube(r, length + 0.02, 8, off, -r - 0.06, 0, Math.PI / 2, 0, 0));
    // Hanger brackets.
    metal.push(box(0.03, 0.14, 0.03, off, -0.05, length * 0.3));
    metal.push(box(0.03, 0.14, 0.03, off, -0.05, -length * 0.3));
  }
  return pack({ metal });
}

/** Broken fluorescent ceiling fixture (the emissive tube is separate). */
export function makeLampFixture() {
  const metal = [
    box(0.24, 0.09, 1.24, 0, -0.055, 0),
    box(0.3, 0.02, 1.3, 0, -0.005, 0),
    box(0.02, 0.16, 0.02, -0.06, 0.08, 0.4),
    box(0.02, 0.16, 0.02, 0.06, 0.08, -0.4),
  ];
  const glass = [box(0.17, 0.03, 1.12, 0, -0.1, 0)];
  return pack({ metal, glass });
}

export function makeSink() {
  const ceramic = [
    box(0.56, 0.18, 0.42, 0, 0.82, 0),
    box(0.42, 0.1, 0.3, 0, 0.8, 0.02),
    cyl(0.06, 0.09, 0.55, 10, 0, 0.4, -0.05),
  ];
  const metal = [
    tube(0.02, 0.22, 8, 0, 0.98, -0.16),
    tube(0.018, 0.13, 8, 0, 1.08, -0.1, Math.PI / 2, 0, 0),
  ];
  return pack({ ceramic, metal });
}

export function makeToilet() {
  const ceramic = [
    cyl(0.19, 0.22, 0.36, 14, 0, 0.18, 0),
    torus(0.2, 0.055, 14, 0, 0.38, 0, Math.PI / 2, 0, 0),
    box(0.38, 0.5, 0.19, 0, 0.42, -0.28),
    box(0.4, 0.05, 0.22, 0, 0.68, -0.28),
  ];
  return pack({ ceramic });
}

/** Hanging privacy curtain, slightly wavy. */
export function makeCurtain(rng) {
  const w = 1.9;
  const h = 2.1;
  const geo = new PlaneGeometry(w, h, 12, 4);
  const pos = geo.attributes.position;
  const phase = rng.range(0, 6.28);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const fold = Math.sin(x * 6 + phase) * 0.075 + Math.sin(x * 13 + phase * 2) * 0.03;
    pos.setZ(i, fold * (0.4 + (y + h / 2) / h));
  }
  geo.computeVertexNormals();
  const fabric = [place(geo, 0, h / 2 + 0.35, 0)];
  const metal = [tube(0.014, w + 0.2, 6, 0, h + 0.35, 0, 0, 0, Math.PI / 2)];
  return pack({ fabric, metal });
}

/** Wall-mounted electrical breaker panel — the level's win condition. */
export function makeBreakerPanel() {
  const metal = [
    box(0.72, 0.96, 0.16, 0, 0, 0),
    box(0.64, 0.86, 0.03, 0, 0, 0.09),
    box(0.06, 0.02, 0.03, 0.26, 0, 0.11),
  ];
  const levers = [];
  for (let i = 0; i < 6; i++) {
    const x = -0.2 + (i % 3) * 0.2;
    const y = 0.16 - Math.floor(i / 3) * 0.32;
    levers.push(box(0.07, 0.14, 0.05, x, y, 0.12));
  }
  return pack({ metal, wood: levers });
}

/** Steel locker the player can hide inside. Body and door are separate. */
export function makeLockerBody() {
  const w = 0.82;
  const h = 2.0;
  const d = 0.62;
  const t = 0.035;
  const metal = [
    box(w, t, d, 0, t / 2, 0),
    box(w, t, d, 0, h - t / 2, 0),
    box(t, h, d, -w / 2 + t / 2, h / 2, 0),
    box(t, h, d, w / 2 - t / 2, h / 2, 0),
    box(w, h, t, 0, h / 2, -d / 2 + t / 2),
    box(w, 0.1, d, 0, h * 0.52, 0),
    box(w + 0.04, 0.05, d + 0.04, 0, h + 0.02, 0),
  ];
  return pack({ metal });
}

export function makeLockerDoor() {
  const w = 0.78;
  const h = 1.94;
  const metal = [box(w, h, 0.03, w / 2, 0, 0)];
  // Ventilation slats.
  for (let i = 0; i < 5; i++) {
    metal.push(box(w * 0.5, 0.02, 0.05, w / 2, h * 0.34 - i * 0.07, 0.02));
  }
  metal.push(box(0.05, 0.16, 0.05, w - 0.08, 0, 0.04));
  return pack({ metal });
}

/** Heavy steel exit door with a frame. */
export function makeExitDoor() {
  const metal = [
    box(1.24, 2.22, 0.09, 0, 1.11, 0),
    box(0.1, 0.44, 0.06, 0.44, 1.05, 0.07),
  ];
  const frame = [
    box(0.14, 2.34, 0.2, -0.68, 1.17, 0),
    box(0.14, 2.34, 0.2, 0.68, 1.17, 0),
    box(1.5, 0.14, 0.2, 0, 2.28, 0),
  ];
  return pack({ metal, concrete: frame });
}

/** Small collectable: a ceramic-bodied cartridge fuse. */
export function makeFuse() {
  const ceramic = [cyl(0.045, 0.045, 0.19, 10, 0, 0, 0, 0, 0, Math.PI / 2)];
  const metal = [
    cyl(0.05, 0.05, 0.04, 10, -0.1, 0, 0, 0, 0, Math.PI / 2),
    cyl(0.05, 0.05, 0.04, 10, 0.1, 0, 0, 0, 0, Math.PI / 2),
  ];
  return pack({ ceramic, metal });
}

export function makeBattery() {
  const metal = [cyl(0.026, 0.026, 0.1, 10, 0, 0.05, 0), cyl(0.012, 0.012, 0.012, 8, 0, 0.106, 0)];
  return pack({ metal });
}

/** Wall clock, permanently stopped. */
export function makeClock() {
  const metal = [cyl(0.19, 0.19, 0.06, 16, 0, 0, 0, Math.PI / 2, 0, 0)];
  const glass = [cyl(0.17, 0.17, 0.01, 16, 0, 0, 0.035, Math.PI / 2, 0, 0)];
  const wood = [box(0.012, 0.13, 0.008, 0, 0.05, 0.04), box(0.09, 0.012, 0.008, 0.03, 0, 0.04)];
  return pack({ metal, glass, wood });
}

/** Hanging chain with a meat hook — pure set dressing, very effective. */
export function makeHook(rng) {
  const len = rng.range(0.7, 1.6);
  const metal = [];
  const links = Math.max(3, Math.floor(len / 0.11));
  for (let i = 0; i < links; i++) {
    metal.push(torus(0.045, 0.012, 8, 0, -i * 0.09, 0, i % 2 ? Math.PI / 2 : 0, i % 2 ? 0 : Math.PI / 2, 0));
  }
  metal.push(torus(0.09, 0.018, 10, 0, -len - 0.08, 0.02, 0, 0, 0));
  return pack({ metal });
}

export const PROP_FACTORIES = {
  gurney: makeGurney,
  wheelchair: makeWheelchair,
  ivStand: makeIVStand,
  chair: makeChair,
  desk: makeDesk,
  shelf: makeShelf,
  cabinet: makeCabinet,
  barrel: makeBarrel,
  crate: makeCrate,
  mattress: makeMattress,
  bucket: makeBucket,
  rubble: makeRubble,
  sink: makeSink,
  toilet: makeToilet,
  curtain: makeCurtain,
  clock: makeClock,
  hook: makeHook,
};
