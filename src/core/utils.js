/**
 * Small math / random helpers shared across the game.
 * Everything is deterministic when driven by a seeded RNG so a level can be replayed.
 */

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (t) => {
  t = clamp01(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Frame-rate independent exponential approach. `rate` ~ how fast per second. */
export const damp = (current, target, rate, dt) => lerp(current, target, 1 - Math.exp(-rate * dt));

export const shortestAngle = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/** Mulberry32 — tiny, fast, good enough for level generation. */
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.seed = seed;
  rng.range = (a, b) => a + rng() * (b - a);
  rng.int = (a, b) => Math.floor(a + rng() * (b - a + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  rng.gauss = (mean = 0, sd = 1) => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  return rng;
}

/**
 * Critically-dampable spring, used for hands / flashlight / camera lag so
 * everything feels weighty instead of glued to the camera.
 */
export class Spring {
  constructor(stiffness = 120, damping = 18, value = 0) {
    this.k = stiffness;
    this.d = damping;
    this.value = value;
    this.vel = 0;
  }

  update(target, dt) {
    // Sub-step for stability on long frames.
    const steps = Math.min(4, Math.max(1, Math.ceil(dt / 0.016)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const accel = (target - this.value) * this.k - this.vel * this.d;
      this.vel += accel * h;
      this.value += this.vel * h;
    }
    return this.value;
  }

  kick(v) {
    this.vel += v;
  }
}

/** Deterministic 2D value noise with fBm, used for procedural textures. */
export function makeNoise2D(seed = 1337) {
  const rng = makeRng(seed);
  const size = 256;
  const mask = size - 1;
  const perm = new Uint8Array(size);
  for (let i = 0; i < size; i++) perm[i] = i;
  rng.shuffle(perm);
  const grad = new Float32Array(size * 2);
  for (let i = 0; i < size; i++) {
    const a = rng() * TAU;
    grad[i * 2] = Math.cos(a);
    grad[i * 2 + 1] = Math.sin(a);
  }

  const hash = (x, y) => perm[(perm[x & mask] + y) & mask];

  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = smootherstep(xf);
    const v = smootherstep(yf);
    const dot = (ix, iy) => {
      const h = hash(ix, iy) * 2;
      return grad[h] * (x - ix) + grad[h + 1] * (y - iy);
    };
    const x1 = lerp(dot(xi, yi), dot(xi + 1, yi), u);
    const x2 = lerp(dot(xi, yi + 1), dot(xi + 1, yi + 1), u);
    return lerp(x1, x2, v);
  };

  noise.fbm = (x, y, octaves = 5, lacunarity = 2.03, gain = 0.5) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };

  /** Worley/cellular noise — great for cracks, tiles, dried fluid edges. */
  noise.worley = (x, y, freq = 1) => {
    const px = x * freq;
    const py = y * freq;
    const xi = Math.floor(px);
    const yi = Math.floor(py);
    let d1 = Infinity;
    let d2 = Infinity;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox;
        const cy = yi + oy;
        const h = hash(cx, cy) * 2;
        const fx = cx + 0.5 + grad[h] * 0.5;
        const fy = cy + 0.5 + grad[h + 1] * 0.5;
        const dx = fx - px;
        const dy = fy - py;
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    return { f1: Math.sqrt(d1), f2: Math.sqrt(d2) };
  };

  return noise;
}

/** A tiny event bus so systems can talk without importing each other. */
export class Bus {
  constructor() {
    this.map = new Map();
  }

  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }

  off(evt, fn) {
    this.map.get(evt)?.delete(fn);
  }

  emit(evt, ...payload) {
    const set = this.map.get(evt);
    if (!set) return;
    for (const fn of set) fn(...payload);
  }
}
