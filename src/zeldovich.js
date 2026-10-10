/** Gaussian random field + Zel'dovich displacement on a periodic grid. */

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

function fft1d(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function fft3d(re, im, n, inverse) {
  const rowRe = new Float64Array(n);
  const rowIm = new Float64Array(n);
  const sweep = (fixedA, fixedB, vary, indexOf) => {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        for (let c = 0; c < n; c++) {
          const idx = indexOf(a, b, c);
          rowRe[c] = re[idx];
          rowIm[c] = im[idx];
        }
        fft1d(rowRe, rowIm, inverse);
        for (let c = 0; c < n; c++) {
          const idx = indexOf(a, b, c);
          re[idx] = rowRe[c];
          im[idx] = rowIm[c];
        }
      }
    }
    void fixedA;
    void fixedB;
    void vary;
  };
  sweep(0, 0, "x", (y, z, x) => (x * n + y) * n + z);
  sweep(0, 0, "y", (x, z, y) => (x * n + y) * n + z);
  sweep(0, 0, "z", (x, y, z) => (x * n + y) * n + z);
}

function bbks(kH, omegaM, h) {
  const q = kH / Math.max(omegaM * h, 1e-4);
  if (q < 1e-4) return 1;
  const num = Math.log(1 + 2.34 * q) / (2.34 * q);
  const den = (1 + 3.89 * q + (16.1 * q) ** 2 + (5.46 * q) ** 3 + (6.71 * q) ** 4) ** 0.25;
  return num / den;
}

function wave(i, n) {
  return i <= n / 2 ? i : i - n;
}

/**
 * @param {{ H0:number, OmegaM:number, ns:number, sigma8:number, seed?:number, n?:number, boxMpch?:number }} params
 */
export function buildZeldovich(params) {
  const n = params.n ?? 32;
  const box = params.boxMpch ?? 256;
  const h = params.H0 / 100;
  const rand = mulberry32(params.seed ?? 42);
  const size = n * n * n;
  const dRe = new Float64Array(size);
  const dIm = new Float64Array(size);
  const pxRe = new Float64Array(size);
  const pxIm = new Float64Array(size);
  const pyRe = new Float64Array(size);
  const pyIm = new Float64Array(size);
  const pzRe = new Float64Array(size);
  const pzIm = new Float64Array(size);

  const at = (x, y, z) => (x * n + y) * n + z;

  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      for (let z = 0; z < n; z++) {
        const kx = wave(x, n);
        const ky = wave(y, n);
        const kz = wave(z, n);
        const k2i = kx * kx + ky * ky + kz * kz;
        if (k2i === 0) continue;
        const partner =
          ((n - x) % n) * n * n + ((n - y) % n) * n + ((n - z) % n);
        const self = at(x, y, z);
        if (partner < self) continue;
        const kPhys = ((2 * Math.PI) / box) * Math.sqrt(k2i);
        const t = bbks(kPhys, params.OmegaM, h);
        const shape = kPhys ** params.ns * t * t;
        const nyquist = ((2 * Math.PI) / box) * (n / 2);
        const soften = Math.exp(-((kPhys / nyquist) ** 2));
        let re = 0;
        let im = 0;
        if (partner === self) {
          re = randGaussian(rand) * Math.sqrt(shape) * soften;
        } else {
          const amp = Math.sqrt(shape) * soften;
          const phase = rand() * Math.PI * 2;
          const ray = Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12)));
          re = ray * amp * Math.cos(phase);
          im = ray * amp * Math.sin(phase);
          dRe[partner] = re;
          dIm[partner] = -im;
        }
        dRe[self] = re;
        dIm[self] = im;
        const k2 = kPhys * kPhys;
        const kxP = ((2 * Math.PI) / box) * kx;
        const kyP = ((2 * Math.PI) / box) * ky;
        const kzP = ((2 * Math.PI) / box) * kz;
        writePsi(pxRe, pxIm, self, partner, kxP, re, im, k2);
        writePsi(pyRe, pyIm, self, partner, kyP, re, im, k2);
        writePsi(pzRe, pzIm, self, partner, kzP, re, im, k2);
      }
    }
  }

  fft3d(dRe, dIm, n, true);
  fft3d(pxRe, pxIm, n, true);
  fft3d(pyRe, pyIm, n, true);
  fft3d(pzRe, pzIm, n, true);

  let mean = 0;
  let m2 = 0;
  for (let i = 0; i < size; i++) mean += dRe[i];
  mean /= size;
  for (let i = 0; i < size; i++) {
    const d = dRe[i] - mean;
    m2 += d * d;
  }
  const std = Math.sqrt(m2 / size) || 1;
  const scale = params.sigma8 / std;

  const q = new Float32Array(size * 3);
  const psi = new Float32Array(size * 3);
  const delta = new Float32Array(size);
  const cell = box / n;
  let p = 0;
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      for (let z = 0; z < n; z++) {
        const i = at(x, y, z);
        q[p] = (x + 0.5) * cell;
        q[p + 1] = (y + 0.5) * cell;
        q[p + 2] = (z + 0.5) * cell;
        psi[p] = pxRe[i] * scale;
        psi[p + 1] = pyRe[i] * scale;
        psi[p + 2] = pzRe[i] * scale;
        delta[i] = (dRe[i] - mean) * scale;
        p += 3;
      }
    }
  }

  let dMax = 0;
  for (let i = 0; i < size; i++) dMax = Math.max(dMax, delta[i]);

  return { n, box, q, psi, delta, dMax, cell, h };
}

function writePsi(reA, imA, self, partner, kComp, re, im, k2) {
  const pr = (-kComp * im) / k2;
  const pi = (kComp * re) / k2;
  reA[self] = pr;
  imA[self] = pi;
  if (partner !== self) {
    reA[partner] = pr;
    imA[partner] = -pi;
  }
}

function randGaussian(rand) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function displace(sim, growth, out) {
  const { q, psi, box } = sim;
  const n = q.length;
  for (let i = 0; i < n; i += 3) {
    let x = q[i] + growth * psi[i];
    let y = q[i + 1] + growth * psi[i + 1];
    let z = q[i + 2] + growth * psi[i + 2];
    x = ((x % box) + box) % box;
    y = ((y % box) + box) % box;
    z = ((z % box) + box) % box;
    out[i] = x - box / 2;
    out[i + 1] = y - box / 2;
    out[i + 2] = z - box / 2;
  }
  return out;
}
