import { Color } from 'three';
import { Rng } from '../../utils/random';

export interface ParticleCloud {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
}

export interface GalaxyPalette {
  core: string;
  disk: string;
  arm: string;
  hii: string;
  halo: string;
}

export interface SpiralOptions {
  seed: number;
  count: number;
  /** Disc truncation radius (layer units). */
  radius: number;
  scaleLength: number;
  thickness: number;
  arms: number;
  pitchDeg: number;
  /** Angular spread of arm particles (radians). */
  armSpread: number;
  /** Radius at which arm k=0 crosses azimuth `armPhase`. */
  armRef: number;
  armPhase: number;
  /** Relative weights per arm (major/minor arms). */
  armWeights?: number[];
  armStart: number;
  bulgeFraction: number;
  bulgeRadius: number;
  barLength: number;
  barAngle: number;
  haloFraction: number;
  armFraction: number;
  particleSize: number;
  brightness: number;
  palette: GalaxyPalette;
  /** Optional extra short arm segment (e.g. the Orion Spur), in polar coordinates. */
  spur?: { r: number; phi: number; length: number; fraction: number };
}

const tmp = new Color();
function rgb(hex: string, k: number, jitter: number, rng: Rng): [number, number, number] {
  tmp.set(hex);
  const j = 1 + (rng.next() - 0.5) * jitter;
  return [tmp.r * k * j, tmp.g * k * j, tmp.b * k * (1 + (rng.next() - 0.5) * jitter)];
}

class Builder {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  n = 0;
  constructor(cap: number) {
    this.positions = new Float32Array(cap * 3);
    this.colors = new Float32Array(cap * 3);
    this.sizes = new Float32Array(cap);
  }
  push(x: number, y: number, z: number, c: [number, number, number], s: number) {
    if (this.n * 3 >= this.positions.length) return;
    const i = this.n++;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = z;
    this.colors[i * 3] = c[0];
    this.colors[i * 3 + 1] = c[1];
    this.colors[i * 3 + 2] = c[2];
    this.sizes[i] = s;
  }
  done(): ParticleCloud {
    return {
      positions: this.positions.subarray(0, this.n * 3),
      colors: this.colors.subarray(0, this.n * 3),
      sizes: this.sizes.subarray(0, this.n),
      count: this.n,
    };
  }
}

function sampleExpDisc(rng: Rng, scale: number, rMin: number, rMax: number): number {
  // Surface density ∝ exp(-r/h): radius pdf ∝ r exp(-r/h) (gamma k=2).
  for (let i = 0; i < 50; i++) {
    const r = scale * (-Math.log(rng.next() * rng.next() + 1e-12));
    if (r >= rMin && r <= rMax) return r;
  }
  return rMin + rng.next() * (rMax - rMin);
}

/**
 * Procedural barred/spiral galaxy in its own frame (disc in the x–y plane, +z = north). Arms are
 * logarithmic spirals φ(r) = φ_k + ln(r/r_ref)/tan(pitch) that trail a clockwise rotation.
 */
export function generateSpiral(o: SpiralOptions): { stars: ParticleCloud; dust: ParticleCloud } {
  const rng = new Rng(o.seed);
  const stars = new Builder(o.count);
  const dustCount = Math.floor(o.count * 0.12);
  const dust = new Builder(dustCount);
  const tanP = Math.tan((o.pitchDeg * Math.PI) / 180);
  const weights = o.armWeights ?? new Array(o.arms).fill(1);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const pickArm = () => {
    let x = rng.next() * wSum;
    for (let k = 0; k < weights.length; k++) {
      x -= weights[k];
      if (x <= 0) return k;
    }
    return weights.length - 1;
  };
  const armPhi = (k: number, r: number) => o.armPhase + (k * 2 * Math.PI) / o.arms + Math.log(r / o.armRef) / tanP;
  const s0 = o.particleSize;
  const B = o.brightness;

  const nBulge = Math.floor(o.count * o.bulgeFraction);
  const nHalo = Math.floor(o.count * o.haloFraction);
  const nSpur = o.spur ? Math.floor(o.count * o.spur.fraction) : 0;
  const nDisc = o.count - nBulge - nHalo - nSpur;

  for (let i = 0; i < nBulge; i++) {
    let x: number;
    let y: number;
    let z: number;
    if (o.barLength > 0 && rng.next() < 0.55) {
      const bx = rng.gauss() * o.barLength * 0.42;
      const by = rng.gauss() * o.barLength * 0.13;
      z = rng.gauss() * o.barLength * 0.1;
      const c = Math.cos(o.barAngle);
      const s = Math.sin(o.barAngle);
      x = bx * c - by * s;
      y = bx * s + by * c;
    } else {
      const r = o.bulgeRadius * Math.pow(rng.next(), 1.6) * 1.3;
      const [dx, dy, dz] = rng.direction();
      x = dx * r;
      y = dy * r;
      z = dz * r * 0.7;
    }
    const rr = Math.hypot(x, y, z) / o.bulgeRadius;
    stars.push(x, y, z, rgb(o.palette.core, B * (1.6 - Math.min(rr, 1) * 0.8), 0.25, rng), s0 * (0.7 + rng.next() * 0.6));
  }

  for (let i = 0; i < nHalo; i++) {
    const r = rng.exp(o.radius * 0.35) + o.bulgeRadius * 0.5;
    const [dx, dy, dz] = rng.direction();
    stars.push(dx * r, dy * r, dz * r * 0.8, rgb(o.palette.halo, B * 0.35, 0.3, rng), s0 * 0.6);
  }

  for (let i = 0; i < nDisc; i++) {
    const inArm = rng.next() < o.armFraction;
    const r = sampleExpDisc(rng, o.scaleLength, o.bulgeRadius * 0.4, o.radius);
    let phi: number;
    let young = false;
    if (inArm && r > o.armStart * 0.7) {
      const k = pickArm();
      const spread = o.armSpread * (0.6 + 0.6 * rng.next());
      phi = armPhi(k, r) + rng.gauss() * spread;
      young = true;
    } else {
      phi = rng.next() * Math.PI * 2;
    }
    const thick = rng.next() < 0.12 ? 3.2 : 1;
    const z = rng.gauss() * o.thickness * thick * (young ? 0.6 : 1);
    const x = r * Math.cos(phi);
    const y = r * Math.sin(phi);
    const fade = 1 - Math.min(1, r / o.radius) * 0.4;
    if (young && rng.next() < 0.035) {
      stars.push(x, y, z, rgb(o.palette.hii, B * 2.2, 0.3, rng), s0 * (1.4 + rng.next() * 1.6));
    } else if (young) {
      stars.push(x, y, z, rgb(o.palette.arm, B * 1.15 * fade, 0.35, rng), s0 * (0.8 + rng.next() * 0.7));
    } else {
      stars.push(x, y, z, rgb(o.palette.disk, B * 0.7 * fade, 0.3, rng), s0 * (0.8 + rng.next() * 0.5));
    }
  }

  if (o.spur) {
    const { r: rs, phi: ps, length, fraction } = o.spur;
    void fraction;
    for (let i = 0; i < nSpur; i++) {
      const t = (rng.next() - 0.5) * length;
      const r = rs * Math.exp(t * Math.tan((10 * Math.PI) / 180));
      const phi = ps + t + rng.gauss() * 0.05;
      const z = rng.gauss() * o.thickness * 0.6;
      stars.push(r * Math.cos(phi), r * Math.sin(phi), z, rgb(o.palette.arm, B * 0.9, 0.3, rng), s0 * 0.9);
    }
  }

  // Dust lanes on the concave edge of the trailing arms (larger azimuth at fixed radius).
  for (let i = 0; i < dustCount; i++) {
    const r = sampleExpDisc(rng, o.scaleLength * 1.1, Math.max(o.armStart * 0.6, o.bulgeRadius * 0.3), o.radius * 0.9);
    const k = pickArm();
    const phi = armPhi(k, r) + 0.1 + rng.gauss() * o.armSpread * 0.45;
    const z = rng.gauss() * o.thickness * 0.35;
    const a = 0.55 + rng.next() * 0.35;
    dust.push(r * Math.cos(phi), r * Math.sin(phi), z, [a, a, a], s0 * (1.6 + rng.next() * 1.4));
  }
  return { stars: stars.done(), dust: dust.done() };
}

/** Irregular / Magellanic-type galaxy: an off-centre bar plus star-forming clumps. */
export function generateIrregular(seed: number, count: number, radius: number, size: number, brightness: number): ParticleCloud {
  const rng = new Rng(seed);
  const b = new Builder(count);
  const clumps = Array.from({ length: 7 }, () => {
    const r = rng.next() * radius * 0.7;
    const a = rng.next() * Math.PI * 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, s: radius * (0.12 + rng.next() * 0.2) };
  });
  for (let i = 0; i < count; i++) {
    const u = rng.next();
    let x: number;
    let y: number;
    let z: number;
    let col: [number, number, number];
    if (u < 0.35) {
      x = rng.gauss() * radius * 0.35 + radius * 0.1;
      y = rng.gauss() * radius * 0.1;
      z = rng.gauss() * radius * 0.08;
      col = rgb('#ffe2b5', brightness * 1.2, 0.3, rng);
    } else if (u < 0.75) {
      const c = rng.pick(clumps);
      x = c.x + rng.gauss() * c.s;
      y = c.y + rng.gauss() * c.s;
      z = rng.gauss() * radius * 0.06;
      col = rng.next() < 0.08 ? rgb('#ff7aa8', brightness * 2, 0.3, rng) : rgb('#bcd4ff', brightness, 0.35, rng);
    } else {
      const r = sampleExpDisc(rng, radius * 0.35, 0, radius);
      const a = rng.next() * Math.PI * 2;
      x = Math.cos(a) * r;
      y = Math.sin(a) * r * 0.8;
      z = rng.gauss() * radius * 0.1;
      col = rgb('#ffeccc', brightness * 0.6, 0.3, rng);
    }
    b.push(x, y, z, col, size * (0.7 + rng.next() * 0.8));
  }
  return b.done();
}

/** Elliptical / spheroidal galaxy with a de Vaucouleurs-like concentrated profile. */
export function generateElliptical(
  seed: number,
  count: number,
  radius: number,
  size: number,
  brightness: number,
  flatten = 0.75,
  color = '#ffd9a8',
): ParticleCloud {
  const rng = new Rng(seed);
  const b = new Builder(count);
  for (let i = 0; i < count; i++) {
    const r = radius * Math.pow(rng.next(), 2.6) * 1.1;
    const [dx, dy, dz] = rng.direction();
    const k = brightness * (1.4 - Math.min(r / radius, 1));
    b.push(dx * r, dy * r * flatten, dz * r * (flatten * 0.9 + 0.1), rgb(color, k, 0.25, rng), size * (0.7 + rng.next() * 0.6));
  }
  return b.done();
}
