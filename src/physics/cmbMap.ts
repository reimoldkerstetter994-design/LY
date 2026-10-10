import { Rng, fft } from '../utils/random';

export interface CmbMapOptions {
  /** Pixels in longitude (power of two). */
  width: number;
  /** Pixel rings in colatitude. */
  height: number;
  lmax: number;
  seed: number;
  /** Optional band-pass to visualise individual angular scales. */
  lFilterMin?: number;
  lFilterMax?: number;
  /** Gaussian beam FWHM in arcminutes. */
  beamArcmin?: number;
  /** Include the kinematic dipole from the Sun's motion relative to the CMB. */
  dipole?: boolean;
}

export interface CmbMap {
  width: number;
  height: number;
  /** ΔT in μK; row 0 is the north Galactic pole, column i is Galactic longitude 2πi/width. */
  data: Float32Array;
  rms: number;
  min: number;
  max: number;
  /** D_ℓ (μK²) of this particular random sky (cosmic variance around the model), indexed by ℓ. */
  realizedDl: Float64Array;
}

/** CMB dipole: amplitude (μK) and direction (Galactic l, b in degrees), Planck 2018. */
export const CMB_DIPOLE = { amplitude: 3362.08, l: 264.021, b: 48.253 };

/**
 * Draws Gaussian a_ℓm with variance C_ℓ and synthesises an equirectangular temperature map by
 * spherical-harmonic synthesis: normalised associated Legendre recursion on each ring (north/south
 * pairs share work through parity) followed by an FFT along longitude.
 */
export function synthesizeCmbMap(Cl: ArrayLike<number>, opts: CmbMapOptions): CmbMap {
  const W = opts.width;
  const H = opts.height;
  const lmax = Math.min(opts.lmax, Cl.length - 1, W / 2 - 1);
  const nAlm = ((lmax + 1) * (lmax + 2)) / 2;
  const offset = new Int32Array(lmax + 2);
  for (let m = 0, o = 0; m <= lmax + 1; m++) {
    offset[m] = o;
    o += lmax - m + 1;
  }
  const idx = (l: number, m: number) => offset[m] + (l - m);

  const aRe = new Float64Array(nAlm);
  const aIm = new Float64Array(nAlm);
  const rng = new Rng(opts.seed);
  const realizedDl = new Float64Array(lmax + 1);
  const sigmaBeam = opts.beamArcmin ? ((opts.beamArcmin / 60) * Math.PI) / 180 / Math.sqrt(8 * Math.LN2) : 0;
  const fMin = opts.lFilterMin ?? 2;
  const fMax = opts.lFilterMax ?? lmax;
  // ℓ-major draw order keeps large scales identical when lmax changes.
  for (let l = 0; l <= lmax; l++) {
    const c = l < 2 ? 0 : Math.max(Cl[l], 0);
    let power = 0;
    const re0 = rng.gauss() * Math.sqrt(c);
    power += re0 * re0;
    const draws: [number, number][] = [[re0, 0]];
    for (let m = 1; m <= l; m++) {
      const re = rng.gauss() * Math.sqrt(c / 2);
      const im = rng.gauss() * Math.sqrt(c / 2);
      power += 2 * (re * re + im * im);
      draws.push([re, im]);
    }
    realizedDl[l] = l < 2 ? 0 : ((l * (l + 1)) / (2 * Math.PI)) * (power / (2 * l + 1));
    const beam = Math.exp(-0.5 * l * (l + 1) * sigmaBeam * sigmaBeam);
    const keep = l >= fMin && l <= fMax ? beam : 0;
    for (let m = 0; m <= l; m++) {
      aRe[idx(l, m)] = draws[m][0] * keep;
      aIm[idx(l, m)] = draws[m][1] * keep;
    }
  }

  // Recursion coefficients.
  const cA = new Float64Array(nAlm);
  const cB = new Float64Array(nAlm);
  for (let m = 0; m <= lmax; m++) {
    for (let l = m + 2; l <= lmax; l++) {
      const i = idx(l, m);
      cA[i] = Math.sqrt((4 * l * l - 1) / (l * l - m * m));
      cB[i] = Math.sqrt(((l - 1) * (l - 1) - m * m) / (4 * (l - 1) * (l - 1) - 1));
    }
  }
  const mmFactor = new Float64Array(lmax + 1);
  for (let m = 1; m <= lmax; m++) mmFactor[m] = -Math.sqrt((2 * m + 1) / (2 * m));
  const m1Factor = new Float64Array(lmax + 1);
  for (let m = 0; m <= lmax; m++) m1Factor[m] = Math.sqrt(2 * m + 3);

  const data = new Float32Array(W * H);
  const reN = new Float64Array(W);
  const imN = new Float64Array(W);
  const reS = new Float64Array(W);
  const imS = new Float64Array(W);
  const halfRings = Math.ceil(H / 2);

  for (let j = 0; j < halfRings; j++) {
    const theta = (Math.PI * (j + 0.5)) / H;
    const x = Math.cos(theta);
    const s = Math.sin(theta);
    reN.fill(0);
    imN.fill(0);
    reS.fill(0);
    imS.fill(0);
    let pmm = Math.sqrt(1 / (4 * Math.PI));
    for (let m = 0; m <= lmax; m++) {
      if (m > 0) pmm *= mmFactor[m] * s;
      if (Math.abs(pmm) < 1e-290) break;
      let eRe = 0;
      let eIm = 0;
      let oRe = 0;
      let oIm = 0;
      let lam0 = pmm;
      let i = idx(m, m);
      eRe += aRe[i] * lam0;
      eIm += aIm[i] * lam0;
      if (m + 1 <= lmax) {
        let lam1 = x * m1Factor[m] * pmm;
        i = idx(m + 1, m);
        oRe += aRe[i] * lam1;
        oIm += aIm[i] * lam1;
        let even = true;
        for (let l = m + 2; l <= lmax; l++) {
          i++;
          const lam2 = cA[i] * (x * lam1 - cB[i] * lam0);
          if (even) {
            eRe += aRe[i] * lam2;
            eIm += aIm[i] * lam2;
          } else {
            oRe += aRe[i] * lam2;
            oIm += aIm[i] * lam2;
          }
          even = !even;
          lam0 = lam1;
          lam1 = lam2;
        }
      }
      const f = m === 0 ? 1 : 2;
      reN[m] = f * (eRe + oRe);
      imN[m] = f * (eIm + oIm);
      reS[m] = f * (eRe - oRe);
      imS[m] = f * (eIm - oIm);
    }
    fft(reN, imN, 1);
    fft(reS, imS, 1);
    const rowN = j * W;
    const rowS = (H - 1 - j) * W;
    for (let k = 0; k < W; k++) {
      data[rowN + k] = reN[k];
      if (rowS !== rowN) data[rowS + k] = reS[k];
    }
  }

  if (opts.dipole) {
    const l0 = (CMB_DIPOLE.l * Math.PI) / 180;
    const b0 = (CMB_DIPOLE.b * Math.PI) / 180;
    const d = [Math.cos(b0) * Math.cos(l0), Math.cos(b0) * Math.sin(l0), Math.sin(b0)];
    for (let j = 0; j < H; j++) {
      const theta = (Math.PI * (j + 0.5)) / H;
      const st = Math.sin(theta);
      const ct = Math.cos(theta);
      for (let k = 0; k < W; k++) {
        const phi = (2 * Math.PI * k) / W;
        const dot = st * Math.cos(phi) * d[0] + st * Math.sin(phi) * d[1] + ct * d[2];
        data[j * W + k] += CMB_DIPOLE.amplitude * dot;
      }
    }
  }

  let sum2 = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    sum2 += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { width: W, height: H, data, rms: Math.sqrt(sum2 / data.length), min, max, realizedDl };
}

const PLANCK_STOPS: [number, number, number, number][] = [
  [0, 0, 0, 255],
  [0.166, 0, 112, 255],
  [0.333, 0, 221, 255],
  [0.5, 255, 237, 217],
  [0.666, 255, 180, 0],
  [0.833, 255, 75, 0],
  [1, 100, 0, 0],
];

/** Planck "parchment"-style diverging colour map, t ∈ [0, 1]. */
export function planckColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < PLANCK_STOPS.length; i++) {
    const [t1, r1, g1, b1] = PLANCK_STOPS[i];
    if (x <= t1) {
      const [t0, r0, g0, b0] = PLANCK_STOPS[i - 1];
      const f = (x - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [100, 0, 0];
}

/** Converts a map to RGBA bytes with a symmetric colour range of ±range μK. */
export function colorizeMap(map: CmbMap, range: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(map.data.length * 4));
  const lut: [number, number, number][] = [];
  for (let i = 0; i < 256; i++) lut.push(planckColor(i / 255));
  for (let i = 0; i < map.data.length; i++) {
    const t = Math.round((0.5 + map.data[i] / (2 * range)) * 255);
    const c = lut[Math.min(255, Math.max(0, t))];
    out[i * 4] = c[0];
    out[i * 4 + 1] = c[1];
    out[i * 4 + 2] = c[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}
