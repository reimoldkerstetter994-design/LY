/** Background ΛCDM integrator and derived observables. */

export const PLANCK2018 = Object.freeze({
  name: "普朗克 2018",
  H0: 67.36,
  OmegaM: 0.3153,
  OmegaB: 0.0493,
  OmegaR: 0.3153 / 3402,
  OmegaL: 1 - 0.3153 - 0.3153 / 3402,
  ns: 0.9649,
  sigma8: 0.811,
  T0: 2.7255,
  zStar: 1089.92,
  zRe: 7.67,
  flat: true,
});

export const PRESETS = [
  PLANCK2018,
  {
    name: "SH0ES 对照",
    H0: 73.04,
    OmegaM: 0.3,
    OmegaB: 0.049,
    OmegaR: 0.3 / 3402,
    OmegaL: 1 - 0.3 - 0.3 / 3402,
    ns: 0.9649,
    sigma8: 0.811,
    T0: 2.7255,
    zStar: 1089.92,
    zRe: 7.67,
    flat: true,
  },
  {
    name: "爱因斯坦-德西特",
    H0: 67.36,
    OmegaM: 1,
    OmegaB: 0.0493,
    OmegaR: 0,
    OmegaL: 0,
    ns: 0.9649,
    sigma8: 0.811,
    T0: 2.7255,
    zStar: 1089.92,
    zRe: 7.67,
    flat: true,
  },
];

const MPC_IN_M = 3.0856775814913673e22;
const MPC_IN_KM = 3.0856775814913673e19;
const SEC_PER_YEAR = 365.25 * 24 * 3600;
const G_SI = 6.6743e-11;
const MSUN_KG = 1.98847e30;
const K_B_EV = 8.617333262145e-5;

export function hubbleTimeGyr(H0) {
  return MPC_IN_KM / SEC_PER_YEAR / 1e9 / H0;
}

export function normalizeParams(input) {
  const p = { ...PLANCK2018, ...input };
  p.H0 = clamp(p.H0, 40, 100);
  p.OmegaM = clamp(p.OmegaM, 0.01, 1.5);
  p.OmegaB = clamp(Math.min(p.OmegaB, p.OmegaM * 0.5), 0.001, p.OmegaM);
  p.OmegaR = clamp(p.OmegaR, 0, 0.01);
  if (p.flat) p.OmegaL = 1 - p.OmegaM - p.OmegaR;
  p.OmegaL = clamp(p.OmegaL, -0.5, 1.5);
  p.OmegaK = 1 - p.OmegaM - p.OmegaR - p.OmegaL;
  p.ns = clamp(p.ns ?? 0.9649, 0.8, 1.2);
  p.sigma8 = clamp(p.sigma8 ?? 0.811, 0.3, 1.5);
  p.T0 = p.T0 ?? 2.7255;
  p.zStar = p.zStar ?? 1089.92;
  p.zRe = p.zRe ?? 7.67;
  return p;
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

export function expansionE(a, p) {
  const aa = Math.max(a, 1e-30);
  const e2 =
    p.OmegaM * aa ** -3 +
    p.OmegaR * aa ** -4 +
    p.OmegaK * aa ** -2 +
    p.OmegaL;
  return Math.sqrt(Math.max(e2, 0));
}

/**
 * Integrate the Friedmann equation on a uniform log-a grid.
 * Time is ∫ dln(a) / H. Growth raw is H(a) ∫ da' / (a' H)^3.
 * Horizon is the comoving particle horizon ∫ c dt / a.
 */
export function createCosmos(input) {
  const p = normalizeParams(input);
  const n = 3600;
  const uMin = Math.log(1e-30);
  const uMax = 0;
  const a = new Float64Array(n + 1);
  const t = new Float64Array(n + 1);
  const horizon = new Float64Array(n + 1);
  const growthInt = new Float64Array(n + 1);
  const eArr = new Float64Array(n + 1);
  const h0 = 1 / hubbleTimeGyr(p.H0);
  const cOverH0 = 299792.458 / p.H0;

  let time = 0;
  let grow = 0;
  let chi = 0;
  for (let i = 0; i <= n; i++) {
    const u = uMin + ((uMax - uMin) * i) / n;
    const ai = Math.exp(u);
    const ei = expansionE(ai, p);
    if (i > 0) {
      const u0 = uMin + ((uMax - uMin) * (i - 1)) / n;
      const du = u - u0;
      const am = Math.exp((u + u0) / 2);
      const em = expansionE(am, p);
      const hMid = em * h0;
      time += du / hMid;
      grow += du / (am * am * hMid ** 3);
      chi += (cOverH0 * du) / (am * em);
    }
    a[i] = ai;
    t[i] = time;
    eArr[i] = ei;
    growthInt[i] = grow;
    horizon[i] = chi;
  }

  const growthRaw = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) growthRaw[i] = eArr[i] * h0 * growthInt[i];
  const d0 = growthRaw[n] || 1;

  function bracket(arr, x) {
    if (x <= arr[0]) return 0;
    if (x >= arr[n]) return n - 1;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= x) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  function sampleRaw(x, arr) {
    const i = bracket(arr, x);
    const span = arr[i + 1] - arr[i];
    const f = span === 0 ? 0 : clamp((x - arr[i]) / span, 0, 1);
    return {
      a: a[i] + (a[i + 1] - a[i]) * f,
      tGyr: t[i] + (t[i + 1] - t[i]) * f,
      E: eArr[i] + (eArr[i + 1] - eArr[i]) * f,
      horizonMpc: horizon[i] + (horizon[i + 1] - horizon[i]) * f,
      D: (growthRaw[i] + (growthRaw[i + 1] - growthRaw[i]) * f) / d0,
    };
  }

  const aStar = 1 / (1 + p.zStar);
  const aRe = 1 / (1 + p.zRe);
  const aEq = p.OmegaR > 0 ? p.OmegaR / p.OmegaM : 1e-8;
  const rec = sampleRaw(aStar, a);
  const reion = sampleRaw(aRe, a);
  const eq = sampleRaw(Math.min(aEq, 1), a);
  const chiStar = Math.max(horizon[n] - rec.horizonMpc, 0);

  function pack(row) {
    const ai = row.a;
    const ei = row.E;
    const H = ei * p.H0;
    const omega = densityFractions(ai, ei, p);
    const visible = row.tGyr >= rec.tGyr;
    return {
      a: ai,
      tGyr: row.tGyr,
      z: 1 / ai - 1,
      E: ei,
      H,
      T: p.T0 / ai,
      horizonMpc: row.horizonMpc,
      hubbleComovingMpc: 299792.458 / Math.max(ai * H, 1e-30),
      D: Math.max(row.D, 0),
      omega,
      q: 0.5 * omega.m + omega.r - omega.l,
      cmbRadiusMpc: visible ? Math.max(row.horizonMpc - rec.horizonMpc, 0) : 0,
      cmbVisible: visible,
      chiStarToday: chiStar,
    };
  }

  function sampleTime(tGyr) {
    return pack(sampleRaw(clamp(tGyr, t[0], t[n]), t));
  }

  function sampleA(ai) {
    return pack(sampleRaw(clamp(ai, a[0], 1), a));
  }

  function comovingDistance(zEmit) {
    const ae = 1 / (1 + Math.max(zEmit, 0));
    const row = sampleA(ae);
    return Math.max(horizon[n] - row.horizonMpc, 0);
  }

  const aLambda =
    p.OmegaL > 0 && p.OmegaM > 0 ? (p.OmegaM / p.OmegaL) ** (1 / 3) : Infinity;

  return {
    params: p,
    ageGyr: t[n],
    tEqGyr: eq.tGyr,
    tRecGyr: rec.tGyr,
    tReGyr: reion.tGyr,
    aEq,
    aStar,
    aRe,
    aLambda,
    zEq: 1 / aEq - 1,
    chiStarMpc: chiStar,
    horizonNowMpc: horizon[n],
    sampleTime,
    sampleA,
    comovingDistance,
    series(count = 240) {
      const rows = [];
      for (let i = 0; i < count; i++) {
        const u = uMin + ((uMax - uMin) * (i + 1)) / count;
        rows.push(sampleA(Math.exp(u)));
      }
      return rows;
    },
  };
}

function densityFractions(a, e, p) {
  const e2 = Math.max(e * e, 1e-30);
  const m = (p.OmegaM * a ** -3) / e2;
  const r = (p.OmegaR * a ** -4) / e2;
  const l = p.OmegaL / e2;
  const k = (p.OmegaK * a ** -2) / e2;
  const b = (p.OmegaB * a ** -3) / e2;
  return { m, r, l, k, b, c: Math.max(m - b, 0) };
}

export function criticalDensityKgM3(H) {
  const hsi = (H * 1000) / MPC_IN_M;
  return (3 * hsi * hsi) / (8 * Math.PI * G_SI);
}

export function criticalDensityMsunMpc3(H) {
  const kg = criticalDensityKgM3(H);
  const mpc3 = MPC_IN_M ** 3;
  return (kg * mpc3) / MSUN_KG;
}

export function temperatureEnergyEv(T) {
  return T * K_B_EV;
}

export function mpcToGly(mpc) {
  return mpc * 3.261563777e-3;
}

export function recessionOverC(H, a, chiMpc) {
  const v = (H * a * chiMpc) / 299792.458;
  return v;
}
