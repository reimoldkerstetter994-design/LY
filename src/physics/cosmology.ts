import {
  MPC_M,
  NU_PER_GAMMA,
  RHO_CRIT_H2,
  hubbleDistanceMpc,
  hubbleTimeGyr,
  omegaGammaH2,
} from './constants';

/**
 * Parameters of a Friedmann–Lemaître–Robertson–Walker cosmology with a CPL dark-energy
 * equation of state w(a) = w0 + wa (1 - a).
 */
export interface CosmoParams {
  /** Hubble constant, km/s/Mpc. */
  H0: number;
  /** Total matter density parameter today (cold dark matter + baryons). */
  Om: number;
  /** Baryon density parameter today. */
  Ob: number;
  /** Dark-energy density parameter today (only used when `flat` is false). */
  Ode: number;
  /** Force spatial flatness by setting Ode = 1 - Om - Or. */
  flat: boolean;
  w0: number;
  wa: number;
  /** CMB temperature today, K. */
  Tcmb: number;
  /** Effective number of relativistic neutrino species. */
  Neff: number;
  /** Scalar spectral index. */
  ns: number;
  /** Primordial curvature power amplitude at k = 0.05 / Mpc. */
  As: number;
  /** Thomson optical depth to reionization. */
  tau: number;
  /** Primordial helium mass fraction. */
  Yp: number;
}

export const PLANCK18: CosmoParams = {
  H0: 67.36,
  Om: 0.3153,
  Ob: 0.0493,
  Ode: 0.6847,
  flat: true,
  w0: -1,
  wa: 0,
  Tcmb: 2.7255,
  Neff: 3.046,
  ns: 0.9649,
  As: 2.1e-9,
  tau: 0.0544,
  Yp: 0.2454,
};

export type Fate =
  | { kind: 'freeze'; accelerating: boolean }
  | { kind: 'crunch'; tCrunchGyr: number; aMax: number; tMaxGyr: number }
  | { kind: 'rip'; tRipGyr: number }
  | { kind: 'bounce'; aMin: number };

export interface DensityFractions {
  r: number;
  m: number;
  de: number;
  k: number;
}

const LNA_MIN = -40;
const LNA_MAX = 12;
const DLNA = 0.004;

const GL8_X = [0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const GL8_W = [0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

function hermite(y0: number, d0: number, y1: number, d1: number, h: number, s: number): number {
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * d0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * d1
  );
}

/**
 * Numerical ΛCDM / wCDM background cosmology. Times are stored internally in units of 1/H0 and
 * comoving distances in units of c/H0; public methods return Gyr and Mpc.
 */
export class Cosmology {
  readonly p: CosmoParams;
  readonly h: number;
  readonly Ogamma: number;
  readonly Onu: number;
  readonly Or: number;
  readonly Om: number;
  readonly Ob: number;
  readonly Oc: number;
  readonly Ode: number;
  readonly Ok: number;
  /** Hubble time 1/H0 in Gyr. */
  readonly tH: number;
  /** Hubble distance c/H0 in Mpc. */
  readonly dH: number;

  readonly bounce: boolean;
  readonly aMin: number;
  readonly aMax: number;

  private readonly lnaStart: number;
  private readonly n: number;
  private readonly tTab: Float64Array;
  private readonly etaTab: Float64Array;
  private readonly eTab: Float64Array;
  private readonly lnaEnd: number;
  private readonly tEndU: number;
  private readonly etaEndU: number;
  private readonly tailP: number;
  private readonly tEndAbsU: number;
  private readonly etaInfU: number;

  /** Age of the universe today in Gyr. */
  readonly age0: number;
  private readonly eta0U: number;

  private readonly gLna0: number;
  private readonly gStep = 0.01;
  private readonly gD: Float64Array;
  private readonly gDp: Float64Array;
  private readonly gNorm: number;
  private readonly gMDNorm: number;

  constructor(params: CosmoParams) {
    this.p = { ...params };
    const p = this.p;
    this.h = p.H0 / 100;
    const h2 = this.h * this.h;
    this.Ogamma = omegaGammaH2(p.Tcmb) / h2;
    this.Onu = this.Ogamma * NU_PER_GAMMA * p.Neff;
    this.Or = this.Ogamma + this.Onu;
    this.Om = p.Om;
    this.Ob = Math.min(p.Ob, p.Om);
    this.Oc = this.Om - this.Ob;
    this.Ode = p.flat ? 1 - this.Om - this.Or : p.Ode;
    this.Ok = p.flat ? 0 : 1 - this.Om - this.Or - this.Ode;
    this.tH = hubbleTimeGyr(p.H0);
    this.dH = hubbleDistanceMpc(p.H0);

    // Locate the valid expansion range (bounce in the past / turnaround in the future).
    const nFull = Math.round((LNA_MAX - LNA_MIN) / DLNA) + 1;
    const i0 = Math.round(-LNA_MIN / DLNA);
    let iStart = 0;
    let bounce = false;
    for (let i = i0; i >= 0; i--) {
      if (this.E2(Math.exp(LNA_MIN + i * DLNA)) <= 0) {
        bounce = true;
        iStart = i + 1;
        break;
      }
    }
    let iEnd = nFull - 1;
    let turnaround = false;
    for (let i = i0; i < nFull; i++) {
      if (this.E2(Math.exp(LNA_MIN + i * DLNA)) <= 0) {
        turnaround = true;
        iEnd = i - 1;
        break;
      }
    }
    this.bounce = bounce;
    this.aMin = bounce ? this.findRoot(Math.exp(LNA_MIN + (iStart - 1) * DLNA), Math.exp(LNA_MIN + iStart * DLNA)) : 0;
    this.aMax = turnaround ? this.findRoot(Math.exp(LNA_MIN + iEnd * DLNA), Math.exp(LNA_MIN + (iEnd + 1) * DLNA)) : Infinity;

    this.lnaStart = LNA_MIN + iStart * DLNA;
    this.n = iEnd - iStart + 1;
    this.tTab = new Float64Array(this.n);
    this.etaTab = new Float64Array(this.n);
    this.eTab = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.eTab[i] = Math.sqrt(Math.max(this.E2(Math.exp(this.lnaStart + i * DLNA)), 1e-300));
    }

    // Initial values: either deep in the radiation era or right after a bounce.
    const a0 = Math.exp(this.lnaStart);
    if (bounce) {
      this.tTab[0] = this.sqrtSubIntegral(this.aMin, a0, this.aMin, 1);
      this.etaTab[0] = this.sqrtSubIntegral(this.aMin, a0, this.aMin, 2);
    } else {
      const E = this.eTab[0];
      // Power-law index of E at the start (≈ -2 for radiation, -1.5 for matter).
      const pw = Math.max(0.5, -this.dlnEdlna(a0));
      this.tTab[0] = 1 / (pw * E);
      this.etaTab[0] = pw > 1 ? 1 / ((pw - 1) * a0 * E) : 0;
    }
    for (let i = 1; i < this.n; i++) {
      const aPrev = Math.exp(this.lnaStart + (i - 1) * DLNA);
      const a = Math.exp(this.lnaStart + i * DLNA);
      // dt = da/(aE) diverges like 1/√|a − a*| at a bounce or turnaround; integrate those
      // intervals in u = √|a − a*| where the integrand is smooth.
      const sing = turnaround && this.aMax - aPrev < 0.25 * this.aMax ? this.aMax
        : bounce && a - this.aMin < 0.25 * this.aMin ? this.aMin : 0;
      if (sing) {
        this.tTab[i] = this.tTab[i - 1] + this.sqrtSubIntegral(aPrev, a, sing, 1);
        this.etaTab[i] = this.etaTab[i - 1] + this.sqrtSubIntegral(aPrev, a, sing, 2);
      } else {
        const f0 = 1 / this.eTab[i - 1];
        const f1 = 1 / this.eTab[i];
        this.tTab[i] = this.tTab[i - 1] + 0.5 * DLNA * (f0 + f1);
        this.etaTab[i] = this.etaTab[i - 1] + 0.5 * DLNA * (f0 / aPrev + f1 / a);
      }
    }
    this.lnaEnd = this.lnaStart + (this.n - 1) * DLNA;
    this.tEndU = this.tTab[this.n - 1];
    this.etaEndU = this.etaTab[this.n - 1];

    const aEnd = Math.exp(this.lnaEnd);
    const eEnd = this.eTab[this.n - 1];
    if (turnaround) {
      this.tailP = NaN;
      // Time and conformal time of maximum expansion; the collapse mirrors the expansion.
      this.tEndAbsU = this.tEndU + this.sqrtSubIntegral(aEnd, this.aMax, this.aMax, 1);
      this.etaInfU = 2 * (this.etaEndU + this.sqrtSubIntegral(aEnd, this.aMax, this.aMax, 2));
    } else {
      const pTail = this.dlnEdlna(aEnd);
      this.tailP = pTail;
      this.tEndAbsU = pTail > 1e-3 ? this.tEndU + 1 / (pTail * eEnd) : Infinity;
      this.etaInfU = pTail > -1 + 1e-6 ? this.etaEndU + 1 / ((1 + pTail) * aEnd * eEnd) : Infinity;
    }

    this.eta0U = this.lnaToEtaU(0);
    this.age0 = this.lnaToTU(0) * this.tH;

    // Linear growth of matter perturbations (sub-horizon, matter clustering only).
    this.gLna0 = Math.max(Math.log(1e-6), this.lnaStart);
    const gN = Math.max(2, Math.floor((this.lnaEnd - this.gLna0) / this.gStep) + 1);
    this.gD = new Float64Array(gN);
    this.gDp = new Float64Array(gN);
    const aEq = this.Or / Math.max(this.Om, 1e-12);
    const y0 = Math.exp(this.gLna0) / aEq;
    let D = y0 + 2 / 3;
    let Dp = y0;
    const deriv = (lna: number, d: number, dp: number): [number, number] => {
      const a = Math.exp(lna);
      const e2 = Math.max(this.E2(a), 1e-300);
      const om = this.Om / (a * a * a) / e2;
      return [dp, -(2 + this.dlnEdlna(a)) * dp + 1.5 * om * d];
    };
    this.gD[0] = D;
    this.gDp[0] = Dp;
    const hs = this.gStep;
    for (let i = 1; i < gN; i++) {
      const x = this.gLna0 + (i - 1) * hs;
      const [k1a, k1b] = deriv(x, D, Dp);
      const [k2a, k2b] = deriv(x + hs / 2, D + (hs / 2) * k1a, Dp + (hs / 2) * k1b);
      const [k3a, k3b] = deriv(x + hs / 2, D + (hs / 2) * k2a, Dp + (hs / 2) * k2b);
      const [k4a, k4b] = deriv(x + hs, D + hs * k3a, Dp + hs * k3b);
      const nD = D + (hs / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
      const nDp = Dp + (hs / 6) * (k1b + 2 * k2b + 2 * k3b + k4b);
      if (!Number.isFinite(nD) || !Number.isFinite(nDp)) {
        // Near a turnaround E → 0 and the equation becomes singular; freeze growth there.
        for (let j = i; j < gN; j++) {
          this.gD[j] = D;
          this.gDp[j] = 0;
        }
        break;
      }
      D = nD;
      Dp = nDp;
      this.gD[i] = D;
      this.gDp[i] = Dp;
    }
    this.gNorm = this.growthRaw(1);
    const aRef = 1 / 41; // z = 40: matter dominated, Λ and radiation negligible
    this.gMDNorm = this.growthRaw(aRef) / aRef;
  }

  /**
   * Dark-energy density evolution relative to today. CPL is only defined for a ≤ 1, so the future
   * is extrapolated with a constant w = w0 (the CPL form diverges super-exponentially for a ≫ 1).
   */
  fde(a: number): number {
    const { w0, wa } = this.p;
    if (w0 === -1 && wa === 0) return 1;
    if (a > 1) return Math.pow(a, -3 * (1 + w0));
    return Math.pow(a, -3 * (1 + w0 + wa)) * Math.exp(-3 * wa * (1 - a));
  }

  /** Dimensionless Hubble rate squared, E^2(a) = H^2(a)/H0^2. */
  E2(a: number): number {
    const a2 = a * a;
    return this.Or / (a2 * a2) + this.Om / (a2 * a) + this.Ok / a2 + this.Ode * this.fde(a);
  }

  E(a: number): number {
    return Math.sqrt(Math.max(this.E2(a), 0));
  }

  /** Equation of state of dark energy at scale factor a. */
  w(a: number): number {
    return a > 1 ? this.p.w0 : this.p.w0 + this.p.wa * (1 - a);
  }

  private dE2dlna(a: number): number {
    const a2 = a * a;
    return (
      (-4 * this.Or) / (a2 * a2) -
      (3 * this.Om) / (a2 * a) -
      (2 * this.Ok) / a2 -
      3 * (1 + this.w(a)) * this.Ode * this.fde(a)
    );
  }

  /**
   * ∫ da / (a^power E(a)) between aLo < aHi, where aSing (one of the endpoints' neighbourhood) is a
   * simple zero of E². Substituting a = aSing ∓ u² removes the 1/√ singularity.
   */
  private sqrtSubIntegral(aLo: number, aHi: number, aSing: number, power: number): number {
    const turn = aSing >= aHi;
    const uA = Math.sqrt(Math.abs(aSing - aLo));
    const uB = Math.sqrt(Math.abs(aSing - aHi));
    const u0 = Math.min(uA, uB);
    const u1 = Math.max(uA, uB);
    const mid = 0.5 * (u0 + u1);
    const half = 0.5 * (u1 - u0);
    let sum = 0;
    for (let k = 0; k < GL8_X.length; k++) {
      for (const sgn of [-1, 1]) {
        const u = mid + sgn * half * GL8_X[k];
        const a = turn ? aSing - u * u : aSing + u * u;
        const e = Math.sqrt(Math.max(this.E2(a), 1e-300));
        sum += (GL8_W[k] * 2 * u) / (Math.pow(a, power) * e);
      }
    }
    return sum * half;
  }

  dlnEdlna(a: number): number {
    return (0.5 * this.dE2dlna(a)) / Math.max(this.E2(a), 1e-300);
  }

  private findRoot(lo: number, hi: number): number {
    let fLo = this.E2(lo);
    for (let k = 0; k < 80; k++) {
      const mid = 0.5 * (lo + hi);
      const fm = this.E2(mid);
      if (fm > 0 === fLo > 0) {
        lo = mid;
        fLo = fm;
      } else {
        hi = mid;
      }
    }
    return 0.5 * (lo + hi);
  }

  /** Hubble parameter in km/s/Mpc. */
  H(a: number): number {
    return this.p.H0 * this.E(a);
  }

  Hz(z: number): number {
    return this.H(1 / (1 + z));
  }

  /** Deceleration parameter q = -a ä / ȧ². */
  q(a: number): number {
    return -1 - this.dlnEdlna(a);
  }

  omegas(a: number): DensityFractions {
    const e2 = Math.max(this.E2(a), 1e-300);
    const a2 = a * a;
    return {
      r: this.Or / (a2 * a2) / e2,
      m: this.Om / (a2 * a) / e2,
      de: (this.Ode * this.fde(a)) / e2,
      k: this.Ok / a2 / e2,
    };
  }

  /** Critical density at scale factor a, kg/m³. */
  rhoCrit(a = 1): number {
    return RHO_CRIT_H2 * this.h * this.h * this.E2(a);
  }

  temperature(a: number): number {
    return this.p.Tcmb / a;
  }

  get aEq(): number {
    return this.Or / this.Om;
  }

  get zEq(): number {
    return this.Om / this.Or - 1;
  }

  // ---- table interpolation -------------------------------------------------------------

  private lnaToTU(lna: number): number {
    if (lna <= this.lnaStart) {
      if (this.bounce) return this.tTab[0];
      return this.tTab[0] * Math.exp(2 * (lna - this.lnaStart));
    }
    if (lna >= this.lnaEnd) return this.extrapolateT(lna);
    const x = (lna - this.lnaStart) / DLNA;
    const i = Math.min(Math.floor(x), this.n - 2);
    const s = x - i;
    return hermite(this.tTab[i], 1 / this.eTab[i], this.tTab[i + 1], 1 / this.eTab[i + 1], DLNA, s);
  }

  private lnaToEtaU(lna: number): number {
    if (lna <= this.lnaStart) {
      if (this.bounce) return this.etaTab[0];
      return this.etaTab[0] * Math.exp(lna - this.lnaStart);
    }
    if (lna >= this.lnaEnd) {
      if (Number.isNaN(this.tailP)) return this.etaEndU;
      const p = this.tailP;
      const aEnd = Math.exp(this.lnaEnd);
      const eEnd = this.eTab[this.n - 1];
      const dl = lna - this.lnaEnd;
      if (Math.abs(1 + p) < 1e-9) return this.etaEndU + dl / (aEnd * eEnd);
      return this.etaEndU + (1 - Math.exp(-(1 + p) * dl)) / ((1 + p) * aEnd * eEnd);
    }
    const x = (lna - this.lnaStart) / DLNA;
    const i = Math.min(Math.floor(x), this.n - 2);
    const s = x - i;
    const a0 = Math.exp(this.lnaStart + i * DLNA);
    const a1 = a0 * Math.exp(DLNA);
    return hermite(
      this.etaTab[i],
      1 / (a0 * this.eTab[i]),
      this.etaTab[i + 1],
      1 / (a1 * this.eTab[i + 1]),
      DLNA,
      s,
    );
  }

  private extrapolateT(lna: number): number {
    if (Number.isNaN(this.tailP)) return this.tEndAbsU;
    const p = this.tailP;
    const eEnd = this.eTab[this.n - 1];
    const dl = lna - this.lnaEnd;
    if (Math.abs(p) < 1e-9) return this.tEndU + dl / eEnd;
    return this.tEndU + (1 - Math.exp(-p * dl)) / (p * eEnd);
  }

  /** Inverse of a monotonic Hermite table: returns ln a for a target value. */
  private invert(target: number, tab: Float64Array, deriv: (i: number) => number): number {
    let lo = 0;
    let hi = this.n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tab[mid] <= target) lo = mid;
      else hi = mid;
    }
    const y0 = tab[lo];
    const y1 = tab[hi];
    const d0 = deriv(lo);
    const d1 = deriv(hi);
    let s = y1 > y0 ? (target - y0) / (y1 - y0) : 0;
    for (let k = 0; k < 6; k++) {
      const f = hermite(y0, d0, y1, d1, DLNA, s) - target;
      const s2 = s * s;
      const df =
        (6 * s2 - 6 * s) * y0 + (3 * s2 - 4 * s + 1) * DLNA * d0 + (-6 * s2 + 6 * s) * y1 + (3 * s2 - 2 * s) * DLNA * d1;
      if (df === 0) break;
      s = Math.min(1, Math.max(0, s - f / df));
    }
    return this.lnaStart + (lo + s) * DLNA;
  }

  // ---- times --------------------------------------------------------------------------

  /** Cosmic time (Gyr) at scale factor a during the expanding phase. */
  ageAtA(a: number): number {
    return this.lnaToTU(Math.log(a)) * this.tH;
  }

  ageAtZ(z: number): number {
    return this.ageAtA(1 / (1 + z));
  }

  lookbackTime(z: number): number {
    return this.age0 - this.ageAtZ(z);
  }

  /** Time of maximum expansion (crunch models) or the end of time (Big Rip), Gyr. */
  get tEndGyr(): number {
    return this.tEndAbsU * this.tH;
  }

  /** Scale factor at cosmic time t (Gyr). Handles recollapse and finite-time singularities. */
  aAtAge(tGyr: number): number {
    const tU = tGyr / this.tH;
    if (tU <= 0) return 0;
    if (Number.isFinite(this.aMax)) {
      const tMax = this.tEndAbsU;
      if (tU >= 2 * tMax) return 0;
      if (tU > tMax) return this.aAtAge((2 * tMax - tU) * this.tH);
      if (tU >= this.tEndU) return this.aMax;
    }
    if (tU <= this.tTab[0]) {
      if (this.bounce) return this.aMin;
      return Math.exp(this.lnaStart + 0.5 * Math.log(tU / this.tTab[0]));
    }
    if (tU >= this.tEndU) {
      const p = this.tailP;
      const eEnd = this.eTab[this.n - 1];
      const dt = tU - this.tEndU;
      if (Math.abs(p) < 1e-9) return Math.exp(this.lnaEnd + eEnd * dt);
      const arg = 1 - p * eEnd * dt;
      if (arg <= 0) return Infinity;
      return Math.exp(this.lnaEnd - Math.log(arg) / p);
    }
    return Math.exp(this.invert(tU, this.tTab, (i) => 1 / this.eTab[i]));
  }

  zAtAge(tGyr: number): number {
    return 1 / this.aAtAge(tGyr) - 1;
  }

  // ---- distances ------------------------------------------------------------------------

  /** Conformal time at scale factor a, in Gyr (equivalently comoving horizon in Gly). */
  conformalTime(a: number): number {
    return this.lnaToEtaU(Math.log(a)) * this.tH;
  }

  get conformalAge0(): number {
    return this.eta0U * this.tH;
  }

  /** Line-of-sight comoving distance to redshift z, Mpc. */
  comovingDistance(z: number): number {
    if (z <= 0) return 0;
    return (this.eta0U - this.lnaToEtaU(-Math.log1p(z))) * this.dH;
  }

  /** Redshift whose line-of-sight comoving distance is dMpc. */
  zAtComovingDistance(dMpc: number): number {
    if (dMpc <= 0) return 0;
    const target = this.eta0U - dMpc / this.dH;
    if (target <= this.etaTab[0]) return Infinity;
    const lna = this.invert(target, this.etaTab, (i) => {
      const a = Math.exp(this.lnaStart + i * DLNA);
      return 1 / (a * this.eTab[i]);
    });
    return Math.exp(-lna) - 1;
  }

  /** Transverse comoving distance D_M, Mpc. */
  transverseComovingDistance(z: number): number {
    const dc = this.comovingDistance(z);
    return this.curvatureTransform(dc);
  }

  curvatureTransform(dcMpc: number): number {
    const ok = this.Ok;
    if (Math.abs(ok) < 1e-8) return dcMpc;
    const s = Math.sqrt(Math.abs(ok));
    const x = (s * dcMpc) / this.dH;
    return ok > 0 ? (this.dH / s) * Math.sinh(x) : (this.dH / s) * Math.sin(x);
  }

  luminosityDistance(z: number): number {
    return (1 + z) * this.transverseComovingDistance(z);
  }

  angularDiameterDistance(z: number): number {
    return this.transverseComovingDistance(z) / (1 + z);
  }

  distanceModulus(z: number): number {
    const dl = this.luminosityDistance(z);
    return 5 * Math.log10(dl * 1e6) - 5;
  }

  /** Proper size (kpc) subtended by one arcsecond at redshift z. */
  kpcPerArcsec(z: number): number {
    return (this.angularDiameterDistance(z) * 1e3 * Math.PI) / (180 * 3600);
  }

  /** Total comoving volume within redshift z, Gpc³. */
  comovingVolume(z: number): number {
    const dm = this.transverseComovingDistance(z) / 1e3;
    const dh = this.dH / 1e3;
    const ok = this.Ok;
    if (Math.abs(ok) < 1e-8) return (4 / 3) * Math.PI * dm ** 3;
    const s = Math.sqrt(Math.abs(ok));
    const x = dm / dh;
    const pre = (4 * Math.PI * dh ** 3) / (2 * ok);
    const term = x * Math.sqrt(1 + ok * x * x);
    return ok > 0 ? pre * (term - Math.asinh(s * x) / s) : pre * (term - Math.asin(s * x) / s);
  }

  /** Comoving particle horizon at scale factor a, Mpc. */
  particleHorizon(a = 1): number {
    return this.lnaToEtaU(Math.log(a)) * this.dH;
  }

  /** Comoving event horizon at scale factor a, Mpc (Infinity when none exists). */
  eventHorizon(a = 1): number {
    if (!Number.isFinite(this.etaInfU)) return Infinity;
    return (this.etaInfU - this.lnaToEtaU(Math.log(a))) * this.dH;
  }

  /** Proper Hubble radius c/H at scale factor a, Mpc. */
  hubbleRadius(a = 1): number {
    return this.dH / this.E(a);
  }

  /** Maximum conformal time (end of the universe's future), in Gyr. */
  get conformalTimeEnd(): number {
    return this.etaInfU * this.tH;
  }

  // ---- milestones ---------------------------------------------------------------------------

  private bisectA(f: (a: number) => number, lo: number, hi: number): number | null {
    let fLo = f(lo);
    const fHi = f(hi);
    if (!(fLo * fHi < 0)) return null;
    for (let k = 0; k < 100; k++) {
      const mid = Math.sqrt(lo * hi);
      const fm = f(mid);
      if (fm * fLo > 0) {
        lo = mid;
        fLo = fm;
      } else {
        hi = mid;
      }
    }
    return Math.sqrt(lo * hi);
  }

  /** Scale factor when the matter and dark-energy densities are equal (null if never after the bounce, if any). */
  get aMatterDE(): number | null {
    return this.bisectA((a) => this.Om / (a * a * a) - this.Ode * this.fde(a), Math.max(1e-3, this.aMin * 1.0001), Math.min(1e3, this.aMax));
  }

  /** Scale factor when the expansion begins to accelerate (q = 0), null if never after the bounce, if any. */
  get aAcceleration(): number | null {
    return this.bisectA((a) => this.q(a), Math.max(1e-2, this.aMin * 1.0001), Math.min(1e2, this.aMax * 0.999));
  }

  get fate(): Fate {
    if (this.bounce) return { kind: 'bounce', aMin: this.aMin };
    if (Number.isFinite(this.aMax)) {
      return {
        kind: 'crunch',
        aMax: this.aMax,
        tMaxGyr: this.tEndAbsU * this.tH,
        tCrunchGyr: 2 * this.tEndAbsU * this.tH,
      };
    }
    if (Number.isFinite(this.tEndAbsU)) return { kind: 'rip', tRipGyr: this.tEndAbsU * this.tH };
    return { kind: 'freeze', accelerating: this.q(Math.exp(this.lnaEnd)) < 0 };
  }

  // ---- linear growth ----------------------------------------------------------------------

  private growthRaw(a: number): number {
    const lna = Math.log(a);
    const x = (lna - this.gLna0) / this.gStep;
    const n = this.gD.length;
    if (x <= 0) return this.gD[0];
    if (x >= n - 1) return this.gD[n - 1];
    const i = Math.floor(x);
    return hermite(this.gD[i], this.gDp[i], this.gD[i + 1], this.gDp[i + 1], this.gStep, x - i);
  }

  /** Linear growth factor normalised to D(a=1) = 1. */
  growth(a: number): number {
    return this.growthRaw(a) / this.gNorm;
  }

  /** Linear growth factor normalised to D ≈ a during matter domination. */
  growthMD(a: number): number {
    return this.growthRaw(a) / this.gMDNorm;
  }

  /** Logarithmic growth rate f = dlnD/dlna. */
  growthRate(a: number): number {
    const lna = Math.log(a);
    const x = (lna - this.gLna0) / this.gStep;
    const n = this.gD.length;
    const i = Math.max(0, Math.min(n - 1, Math.round(x)));
    return this.gDp[i] / this.gD[i];
  }

  // ---- convenience ------------------------------------------------------------------------------

  /** Physical density of total matter today, kg/m³. */
  get rhoMatter0(): number {
    return this.rhoCrit(1) * this.Om;
  }

  /** H0 in SI units (1/s). */
  get H0SI(): number {
    return (this.p.H0 * 1e3) / MPC_M;
  }

  /** Recession velocity (km/s) of a comoving object at line-of-sight comoving distance d (Mpc) today. */
  recessionVelocity(dMpc: number): number {
    return this.p.H0 * dMpc;
  }

  /** Hubble time in Gyr at scale factor a. */
  hubbleTimeAt(a: number): number {
    return this.tH / this.E(a);
  }
}

export function withDerivedFlatness(p: CosmoParams): CosmoParams {
  const c = new Cosmology(p);
  return { ...p, Ode: c.Ode };
}
