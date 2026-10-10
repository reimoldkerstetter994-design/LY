import { galacticVectorToSupergalactic } from "./coords.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function disk(count, radiusMpc, seed, tilt = 0) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < count; i++) {
    const arm = i % 4;
    const u = rand();
    const bulge = rand() < 0.18;
    const r = bulge ? radiusMpc * 0.12 * Math.sqrt(rand()) : radiusMpc * (0.08 + 0.92 * Math.pow(u, 0.62));
    const wind = bulge ? rand() * Math.PI * 2 : Math.log(r / radiusMpc + 0.12) * 3.4 + (arm * Math.PI) / 2;
    const theta = wind + (rand() - 0.5) * (bulge ? 1.4 : 0.28);
    const thick = (bulge ? 0.18 : 0.045) * radiusMpc * (rand() - 0.5) * Math.exp(-r / (radiusMpc * 0.5));
    let x = r * Math.cos(theta);
    let y = r * Math.sin(theta);
    let z = thick;
    const y2 = y * ct - z * st;
    const z2 = y * st + z * ct;
    y = y2;
    z = z2;
    const sg = galacticVectorToSupergalactic([x, y, z]);
    positions[i * 3] = sg[0];
    positions[i * 3 + 1] = sg[1];
    positions[i * 3 + 2] = sg[2];
    const heat = bulge ? 1 : 1 - r / radiusMpc;
    colors[i * 3] = 0.55 + 0.45 * heat;
    colors[i * 3 + 1] = 0.62 + 0.22 * heat;
    colors[i * 3 + 2] = 0.78 + 0.1 * (1 - heat);
  }
  return { positions, colors };
}

export function milkyWayDisk() {
  return heliocentricDisk(7000, 0.016, 8.178 / 1000, 11, 0);
}

function heliocentricDisk(count, radiusMpc, R0, seed, tilt) {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < count; i++) {
    const arm = i % 4;
    const bulge = rand() < 0.16;
    const r = bulge ? radiusMpc * 0.1 * Math.sqrt(rand()) : radiusMpc * (0.05 + 0.95 * Math.pow(rand(), 0.58));
    const theta = bulge
      ? rand() * Math.PI * 2
      : Math.log(r / radiusMpc + 0.15) * 3.6 + (arm * Math.PI) / 2 + (rand() - 0.5) * 0.26;
    const thick = (bulge ? 0.16 : 0.04) * radiusMpc * (rand() - 0.5);
    let x = r * Math.cos(theta);
    let y = r * Math.sin(theta);
    let z = thick;
    const y2 = y * ct - z * st;
    const z2 = y * st + z * ct;
    y = y2;
    z = z2;
    const sg = galacticVectorToSupergalactic([x + R0, y, z]);
    positions[i * 3] = sg[0];
    positions[i * 3 + 1] = sg[1];
    positions[i * 3 + 2] = sg[2];
    const heat = bulge ? 1 : 1 - r / radiusMpc;
    colors[i * 3] = 0.72 + 0.28 * heat;
    colors[i * 3 + 1] = 0.7 + 0.18 * heat;
    colors[i * 3 + 2] = 0.62 + 0.12 * (1 - heat);
  }
  return { positions, colors };
}

export function companionDisk(count, radiusMpc, seed) {
  return disk(count, radiusMpc, seed, 1.15);
}

export { heliocentricDisk };
