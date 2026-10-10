import { Rng } from '../../utils/random';

export interface WebOptions {
  seed: number;
  count: number;
  /** Radius of the populated sphere (layer units). */
  radius: number;
  /** Mean void (Voronoi cell) diameter. */
  cellSize: number;
  /** Optional radial acceptance probability for sampling Lagrangian positions. */
  accept?: (r: number) => number;
  fractions?: { node: number; filament: number; wall: number };
  /** Use a cube of half-size `radius` instead of a sphere. */
  cube?: boolean;
}

export const ENV_FIELD = 0;
export const ENV_WALL = 1;
export const ENV_FILAMENT = 2;
export const ENV_NODE = 3;

export interface WebResult {
  /** Final (present-day) positions. */
  positions: Float32Array;
  /** Initial, nearly uniform Lagrangian positions. */
  initial: Float32Array;
  env: Uint8Array;
  count: number;
}

type V = [number, number, number];

function solve2(a11: number, a12: number, a22: number, b1: number, b2: number): [number, number] | null {
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12 * (Math.abs(a11 * a22) + 1e-30)) return null;
  return [(b1 * a22 - b2 * a12) / det, (a11 * b2 - a12 * b1) / det];
}

function solve3(m: number[], b: number[]): V | null {
  const det =
    m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    inv * (b[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (b[1] * m[8] - m[5] * b[2]) + m[2] * (b[1] * m[7] - m[4] * b[2])),
    inv * (m[0] * (b[1] * m[8] - m[5] * b[2]) - b[0] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * b[2] - b[1] * m[6])),
    inv * (m[0] * (m[4] * b[2] - b[1] * m[7]) - m[1] * (m[3] * b[2] - b[1] * m[6]) + b[0] * (m[3] * m[7] - m[4] * m[6])),
  ];
}

/**
 * Voronoi kinematic model of the cosmic web (Icke & van de Weygaert): galaxies stream away from
 * void centres and settle on the Voronoi walls, filaments (edges) and nodes (vertices).
 */
export function generateCosmicWeb(o: WebOptions): WebResult {
  const rng = new Rng(o.seed);
  const R = o.radius;
  const cell = o.cellSize;
  const half = R + cell * 1.5;
  const gN = Math.max(1, Math.ceil((2 * half) / cell));
  const nSeeds = gN * gN * gN;
  const seeds = new Float64Array(nSeeds * 3);
  for (let i = 0; i < nSeeds; i++) {
    seeds[i * 3] = (rng.next() * 2 - 1) * half;
    seeds[i * 3 + 1] = (rng.next() * 2 - 1) * half;
    seeds[i * 3 + 2] = (rng.next() * 2 - 1) * half;
  }
  const cellOf = (x: number) => Math.min(gN - 1, Math.max(0, Math.floor((x + half) / cell)));
  const counts = new Int32Array(gN * gN * gN + 1);
  const key = (i: number, j: number, k: number) => (i * gN + j) * gN + k;
  for (let s = 0; s < nSeeds; s++) {
    counts[key(cellOf(seeds[s * 3]), cellOf(seeds[s * 3 + 1]), cellOf(seeds[s * 3 + 2])) + 1]++;
  }
  for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
  const fill = counts.slice();
  const order = new Int32Array(nSeeds);
  for (let s = 0; s < nSeeds; s++) {
    const kk = key(cellOf(seeds[s * 3]), cellOf(seeds[s * 3 + 1]), cellOf(seeds[s * 3 + 2]));
    order[fill[kk]++] = s;
  }

  const fr = o.fractions ?? { node: 0.24, filament: 0.38, wall: 0.24 };
  const positions = new Float32Array(o.count * 3);
  const initial = new Float32Array(o.count * 3);
  const env = new Uint8Array(o.count);
  const best = [-1, -1, -1, -1];
  const bestD = [Infinity, Infinity, Infinity, Infinity];

  const nearest4 = (x: number, y: number, z: number) => {
    best.fill(-1);
    bestD.fill(Infinity);
    const ci = cellOf(x);
    const cj = cellOf(y);
    const ck = cellOf(z);
    for (let reach = 1; reach <= 2; reach++) {
      for (let i = Math.max(0, ci - reach); i <= Math.min(gN - 1, ci + reach); i++) {
        for (let j = Math.max(0, cj - reach); j <= Math.min(gN - 1, cj + reach); j++) {
          for (let k = Math.max(0, ck - reach); k <= Math.min(gN - 1, ck + reach); k++) {
            if (reach === 2 && Math.abs(i - ci) < 2 && Math.abs(j - cj) < 2 && Math.abs(k - ck) < 2) continue;
            const kk = key(i, j, k);
            for (let p = counts[kk]; p < counts[kk + 1]; p++) {
              const s = order[p];
              const dx = seeds[s * 3] - x;
              const dy = seeds[s * 3 + 1] - y;
              const dz = seeds[s * 3 + 2] - z;
              const d = dx * dx + dy * dy + dz * dz;
              if (d < bestD[3]) {
                let t = 3;
                while (t > 0 && d < bestD[t - 1]) {
                  bestD[t] = bestD[t - 1];
                  best[t] = best[t - 1];
                  t--;
                }
                bestD[t] = d;
                best[t] = s;
              }
            }
          }
        }
      }
      if (best[3] >= 0 && bestD[3] < (reach * cell) ** 2) break;
    }
  };

  const S = (s: number): V => [seeds[s * 3], seeds[s * 3 + 1], seeds[s * 3 + 2]];
  const sq = (v: V) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const subV = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

  let n = 0;
  let guard = 0;
  while (n < o.count && guard < o.count * 50) {
    guard++;
    let q: V;
    if (o.cube) {
      q = [(rng.next() * 2 - 1) * R, (rng.next() * 2 - 1) * R, (rng.next() * 2 - 1) * R];
    } else {
      const r = R * Math.cbrt(rng.next());
      const d = rng.direction();
      q = [d[0] * r, d[1] * r, d[2] * r];
    }
    if (o.accept && rng.next() > o.accept(Math.hypot(q[0], q[1], q[2]))) continue;
    nearest4(q[0], q[1], q[2]);
    if (best[3] < 0) continue;
    const s1 = S(best[0]);
    const s2 = S(best[1]);
    const s3 = S(best[2]);
    const s4 = S(best[3]);
    const u = rng.next();
    let x: V = q;
    let e = ENV_FIELD;
    const a = subV(s2, s1);
    const b = subV(s3, s1);
    const ca = (sq(s2) - sq(s1)) / 2;
    const cb = (sq(s3) - sq(s1)) / 2;
    let target = u < fr.node ? ENV_NODE : u < fr.node + fr.filament ? ENV_FILAMENT : u < fr.node + fr.filament + fr.wall ? ENV_WALL : ENV_FIELD;
    if (target === ENV_NODE) {
      const c = subV(s4, s1);
      const cc = (sq(s4) - sq(s1)) / 2;
      const v = solve3([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]], [ca, cb, cc]);
      if (v && sq(subV(v, q)) < (1.2 * cell) ** 2) {
        const sg = cell * 0.045;
        x = [v[0] + rng.gauss() * sg, v[1] + rng.gauss() * sg, v[2] + rng.gauss() * sg];
        e = ENV_NODE;
      } else {
        target = ENV_FILAMENT;
      }
    }
    if (target === ENV_FILAMENT) {
      const sol = solve2(dot(a, a), dot(a, b), dot(b, b), ca - dot(a, q), cb - dot(b, q));
      if (sol) {
        const [al, be] = sol;
        const v: V = [q[0] + al * a[0] + be * b[0], q[1] + al * a[1] + be * b[1], q[2] + al * a[2] + be * b[2]];
        if (sq(subV(v, q)) < (1.0 * cell) ** 2) {
          const sg = cell * 0.03;
          x = [v[0] + rng.gauss() * sg, v[1] + rng.gauss() * sg, v[2] + rng.gauss() * sg];
          e = ENV_FILAMENT;
        } else {
          target = ENV_WALL;
        }
      } else {
        target = ENV_WALL;
      }
    }
    if (target === ENV_WALL) {
      const len = Math.sqrt(sq(a)) || 1;
      const nrm: V = [a[0] / len, a[1] / len, a[2] / len];
      const mid: V = [(s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2, (s1[2] + s2[2]) / 2];
      const dd = dot(subV(q, mid), nrm) - rng.gauss() * cell * 0.022;
      x = [q[0] - dd * nrm[0], q[1] - dd * nrm[1], q[2] - dd * nrm[2]];
      e = ENV_WALL;
    }
    if (target === ENV_FIELD) {
      // Void galaxies drift towards the nearest wall but stay inside the void.
      const len = Math.sqrt(sq(a)) || 1;
      const nrm: V = [a[0] / len, a[1] / len, a[2] / len];
      const mid: V = [(s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2, (s1[2] + s2[2]) / 2];
      const dd = dot(subV(q, mid), nrm) * 0.35;
      x = [q[0] - dd * nrm[0], q[1] - dd * nrm[1], q[2] - dd * nrm[2]];
    }
    positions[n * 3] = x[0];
    positions[n * 3 + 1] = x[1];
    positions[n * 3 + 2] = x[2];
    initial[n * 3] = q[0];
    initial[n * 3 + 1] = q[1];
    initial[n * 3 + 2] = q[2];
    env[n] = e;
    n++;
  }
  return {
    positions: positions.subarray(0, n * 3),
    initial: initial.subarray(0, n * 3),
    env: env.subarray(0, n),
    count: n,
  };
}
