/** Flat or curved ΛCDM background. Distances follow Hogg (1999). */

export const T_CMB = 2.72548;

const KM_PER_MPC = 3.0856775814913673e19;
export const SEC_PER_GYR = 365.25 * 24 * 3600 * 1e9;

/** Gigayears per (km/s/Mpc)^-1, i.e. 1/H0 in Gyr when H0 is in km/s/Mpc. */
export const GYR_PER_HUBBLE = KM_PER_MPC / SEC_PER_GYR;
export const C_KM_S = 299792.458;
export const C_MPC_PER_GYR = C_KM_S / GYR_PER_HUBBLE;
export const MPC_TO_GLY = 3.261563777e-3;

export const PLANCK = Object.freeze({
  H0: 67.36,
  Om: 0.3153,
  Ob: 0.0493,
  w: -1,
  flat: true,
});

export function radiationDensity(H0, temperature = T_CMB) {
  const h2 = (H0 / 100) ** 2;
  const photon = 2.472e-5 * (temperature / 2.725) ** 4;
  const Neff = 3.046;
  return (photon * (1 + 0.2271 * Neff)) / h2;
}

export function normalizeParams(input = {}) {
  const H0 = Number(input.H0);
  if (!Number.isFinite(H0) || H0 <= 0) {
    throw new Error("H0 must be positive");
  }
  const Or = input.Or == null ? radiationDensity(H0) : Number(input.Or);
  let Om = Number(input.Om ?? 0.3153);
  let Ol = Number(input.Ol ?? 0.6847);
  if (input.matterOnly) {
    Om = 1 - Or;
    Ol = 0;
  } else if (input.flat !== false) {
    Ol = 1 - Om - Or;
  }
  const Ok = 1 - Om - Ol - Or;
  const Ob = Math.min(Math.max(Number(input.Ob ?? 0.049), 0), Math.max(Om, 0));
  const w = Number(input.w ?? -1);
  return { H0, Om, Ol, Or, Ok, Ob, w, T: T_CMB };
}

export function EofA(a, p) {
  const zPlus = 1 / a;
  const dark = p.Ol * zPlus ** (3 * (1 + p.w));
  const inside = p.Or * zPlus ** 4 + p.Om * zPlus ** 3 + p.Ok * zPlus ** 2 + dark;
  return Math.sqrt(Math.max(inside, 0));
}

/** H in Gyr^-1. */
export function HofA(a, p) {
  return (p.H0 / GYR_PER_HUBBLE) * EofA(a, p);
}

/**
 * Carroll, Press & Turner growth-factor approximation, normalized later by D(1).
 * Radiation is ignored; this is a late-time visual aid, not a Boltzmann solve.
 */
export function growthFactor(a, p) {
  const scale = Math.max(a, 1e-4);
  const e = Math.sqrt(
    Math.max(p.Om / scale ** 3 + p.Ok / scale ** 2 + p.Ol * scale ** (-3 * (1 + p.w)), 0),
  );
  const e2 = e * e || 1e-12;
  const Oma = p.Om / scale ** 3 / e2;
  const Ola = (p.Ol * scale ** (-3 * (1 + p.w))) / e2;
  const g =
    (2.5 * Oma) /
    (Oma ** (4 / 7) - Ola + (1 + Oma / 2) * (1 + Ola / 70) + 1e-8);
  return scale * g;
}

function integrate(p) {
  const steps = 3600;
  const lnMin = Math.log(1e-14);
  const lnMax = Math.log(1e4);
  const a = new Float64Array(steps);
  const t = new Float64Array(steps);
  const chi = new Float64Array(steps);
  let time = 0;
  let comoving = 0;
  let stalled = false;

  for (let i = 0; i < steps; i += 1) {
    const lnA = lnMin + ((lnMax - lnMin) * i) / (steps - 1);
    const scale = Math.exp(lnA);
    if (i > 0) {
      const prev = a[i - 1];
      const dln = Math.log(scale / prev);
      const hPrev = HofA(prev, p);
      const hNow = HofA(scale, p);
      if (hPrev < 1e-10 || hNow < 1e-10) {
        stalled = true;
        a[i] = scale;
        t[i] = time;
        chi[i] = comoving;
        for (let j = i + 1; j < steps; j += 1) {
          a[j] = scale;
          t[j] = time;
          chi[j] = comoving;
        }
        return { a, t, chi, stalled, last: i };
      }
      time += 0.5 * dln * (1 / hPrev + 1 / hNow);
      const fPrev = C_MPC_PER_GYR / (prev * hPrev);
      const fNow = C_MPC_PER_GYR / (scale * hNow);
      comoving += 0.5 * dln * (fPrev + fNow);
    }
    a[i] = scale;
    t[i] = time;
    chi[i] = comoving;
  }
  return { a, t, chi, stalled, last: steps - 1 };
}

function locate(samples, target, key) {
  const arr = samples[key];
  let lo = 0;
  let hi = samples.last;
  const clamped = Math.min(Math.max(target, arr[0]), arr[hi]);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < clamped) lo = mid;
    else hi = mid;
  }
  const span = arr[hi] - arr[lo] || 1;
  const f = Math.min(Math.max((clamped - arr[lo]) / span, 0), 1);
  return { lo, hi, f };
}

function mix(samples, loc, key) {
  return samples[key][loc.lo] * (1 - loc.f) + samples[key][loc.hi] * loc.f;
}

export function transverseComoving(chi, p) {
  const dH = C_KM_S / p.H0;
  const ok = p.Ok;
  if (Math.abs(ok) < 1e-6) return chi;
  const root = Math.sqrt(Math.abs(ok));
  const x = (root * chi) / dH;
  if (ok > 0) return (dH / root) * Math.sinh(x);
  return (dH / root) * Math.sin(x);
}

export function createCosmology(input = PLANCK) {
  const params = normalizeParams(input);
  const samples = integrate(params);
  const nowLoc = locate(samples, 1, "a");
  const ageGyr = mix(samples, nowLoc, "t");
  const chiNow = mix(samples, nowLoc, "chi");
  const future = samples.chi[samples.last];
  const reachesToday = !samples.stalled || samples.a[samples.last] >= 1 - 1e-6;

  function atScale(scale) {
    const a = Math.min(Math.max(scale, samples.a[0]), samples.a[samples.last]);
    const loc = locate(samples, a, "a");
    return {
      a,
      t: mix(samples, loc, "t"),
      chi: mix(samples, loc, "chi"),
    };
  }

  function timeAtA(scale) {
    return atScale(scale).t;
  }

  function aAtTime(time) {
    const loc = locate(samples, Math.max(time, 0), "t");
    return samples.a[loc.lo] * (1 - loc.f) + samples.a[loc.hi] * loc.f;
  }

  function chiBetween(aEmit, aObserve = 1) {
    const early = atScale(Math.min(aEmit, aObserve));
    const late = atScale(Math.max(aEmit, aObserve));
    return Math.max(late.chi - early.chi, 0);
  }

  function distancesAtZ(z) {
    const redshift = Math.max(z, 0);
    const aEmit = 1 / (1 + redshift);
    const chi = chiBetween(aEmit, 1);
    const dM = transverseComoving(chi, params);
    return {
      z: redshift,
      a: aEmit,
      chi,
      dM,
      dL: (1 + redshift) * dM,
      dA: redshift === 0 ? dM : dM / (1 + redshift),
      lookback: Math.max(ageGyr - timeAtA(aEmit), 0),
      ageAtEmission: timeAtA(aEmit),
    };
  }

  function deceleration(scale) {
    const e2 = EofA(scale, params) ** 2 || 1e-12;
    const OmA = params.Om / scale ** 3 / e2;
    const OrA = params.Or / scale ** 4 / e2;
    const OdA = (params.Ol * scale ** (-3 * (1 + params.w))) / e2;
    return 0.5 * OmA + OrA + 0.5 * (1 + 3 * params.w) * OdA;
  }

  let accel = null;
  if (reachesToday) {
    let prev = deceleration(0.05);
    for (let i = 0; i <= 240; i += 1) {
      const scale = 0.05 + (0.95 * i) / 240;
      const q = deceleration(scale);
      if (prev > 0 && q <= 0) {
        const span = prev - q || 1;
        const a = scale - (0.95 / 240) * (1 - prev / span);
        accel = { a, z: 1 / a - 1, t: timeAtA(a), q: 0 };
        break;
      }
      prev = q;
    }
  }

  const temperature = (scale) => params.T / scale;
  const hubbleRadius = C_KM_S / params.H0;
  const eventHorizon = Math.max(future - chiNow, 0);

  return {
    params,
    valid: reachesToday && ageGyr > 0,
    stalled: samples.stalled,
    ageGyr,
    horizonMpc: chiNow,
    horizonGly: chiNow * MPC_TO_GLY,
    eventHorizonMpc: eventHorizon,
    hubbleRadiusMpc: hubbleRadius,
    accel,
    atScale,
    timeAtA,
    aAtTime,
    chiBetween,
    chiOfZ: (z) => distancesAtZ(z).chi,
    distancesAtZ,
    temperature,
    deceleration,
    redshiftOfA: (scale) => 1 / scale - 1,
    H0AtA: (scale) => params.H0 * EofA(scale, params),
    growth: (scale) => growthFactor(scale, params) / Math.max(growthFactor(1, params), 1e-8),
  };
}

export function mpcToGly(mpc) {
  return mpc * MPC_TO_GLY;
}

export function lightTravelGyr(mpc) {
  return mpc / C_MPC_PER_GYR;
}
