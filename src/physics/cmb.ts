import type { Cosmology } from './cosmology';
import { K_PIVOT, transferNoWiggle } from './powerSpectrum';
import { dampingWavenumber, type IonizationHistory } from './recombination';

/**
 * Phenomenological constants of the semi-analytic acoustic model (Hu & Sugiyama-style tight
 * coupling solution with radiation driving, baryon loading, Doppler term, Silk damping and a
 * finite-thickness last-scattering surface). They were calibrated once against the Planck 2018
 * best-fit TT spectrum; every physical scale (r_s, D_*, R_*, k_eq, k_D, z_*) is computed from the
 * cosmological parameters, so the spectrum responds to them physically.
 */
export interface CmbTuning {
  drive: number;
  offset: number;
  doppler: number;
  phase: number;
  phaseK: number;
  isw: number;
  dampScale: number;
  eisw: number;
  eiswPos: number;
  driveK: number;
  driveN: number;
}

export const CMB_TUNING: CmbTuning = {
  drive: 4.092,
  offset: 1.053,
  doppler: 0.919,
  phase: 0.399,
  phaseK: 1.591,
  isw: 2,
  dampScale: 1.054,
  eisw: 0.679,
  eiswPos: 0.532,
  driveK: 3.841,
  driveN: 4.141,
};

export interface CmbDerived {
  /** Redshift of last scattering (τ = 1). */
  zStar: number;
  /** Comoving sound horizon at z*, Mpc. */
  rsStar: number;
  /** Comoving angular-diameter distance to z*, Mpc. */
  dStar: number;
  /** Angular size of the sound horizon, radians. */
  thetaStar: number;
  /** Acoustic scale ℓ_A = π/θ*. */
  ellA: number;
  /** Baryon-to-photon momentum ratio at z*. */
  Rstar: number;
  /** Wavenumber entering the horizon at matter–radiation equality, 1/Mpc. */
  kEq: number;
  /** Silk damping wavenumber at z*, 1/Mpc. */
  kD: number;
  zDrag: number;
  /** Sound horizon at the baryon drag epoch (BAO ruler), Mpc. */
  rsDrag: number;
  zReion: number;
  /** Sachs–Wolfe plateau amplitude T0² A_s / 25, μK². */
  dSW: number;
}

export interface CmbPeak {
  ell: number;
  Dl: number;
}

export interface CmbSpectrum {
  lmax: number;
  /** D_ℓ = ℓ(ℓ+1) C_ℓ / 2π in μK², indexed by ℓ. */
  Dl: Float64Array;
  /** C_ℓ in μK², indexed by ℓ. */
  Cl: Float64Array;
  derived: CmbDerived;
  peaks: CmbPeak[];
  troughs: CmbPeak[];
}

/** Comoving sound horizon r_s(z) in Mpc. */
export function soundHorizon(cosmo: Cosmology, z: number): number {
  const Rfac = (3 * cosmo.Ob) / (4 * cosmo.Ogamma);
  const lnaEnd = -Math.log1p(z);
  const lnaStart = -30;
  const n = 3000;
  const dl = (lnaEnd - lnaStart) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const a = Math.exp(lnaStart + i * dl);
    const cs = 1 / Math.sqrt(3 * (1 + Rfac * a));
    sum += ((i === 0 || i === n ? 0.5 : 1) * cs) / (a * cosmo.E(a));
  }
  return sum * dl * cosmo.dH;
}

function findExtrema(Dl: Float64Array, lmin: number, maxima: boolean): CmbPeak[] {
  const out: CmbPeak[] = [];
  const w = 6;
  for (let l = lmin + w; l < Dl.length - w; l++) {
    let ok = true;
    for (let d = 1; d <= w && ok; d++) {
      if (maxima ? Dl[l] < Dl[l - d] || Dl[l] < Dl[l + d] : Dl[l] > Dl[l - d] || Dl[l] > Dl[l + d]) ok = false;
    }
    if (ok && (out.length === 0 || l - out[out.length - 1].ell > 40)) out.push({ ell: l, Dl: Dl[l] });
  }
  return out;
}

/**
 * Semi-analytic CMB temperature power spectrum. The acoustic source is evaluated across the
 * visibility function and projected onto multipoles with the asymptotic Bessel-function kernel
 *   D_ℓ ∝ ∫ dw [ S₀² (1+w²)^-3/2 + S₁² w² (1+w²)^-5/2 ],  k = (ℓ+½)√(1+w²)/D*.
 */
export function computeCmbSpectrum(
  cosmo: Cosmology,
  hist: IonizationHistory,
  lmax = 2500,
  tuning: CmbTuning = CMB_TUNING,
): CmbSpectrum {
  const T0uK = cosmo.p.Tcmb * 1e6;
  const dSW = (T0uK * T0uK * cosmo.p.As) / 25;
  const zStar = hist.zStar;
  const dStar = cosmo.transverseComovingDistance(zStar);
  const rsStar = soundHorizon(cosmo, zStar);
  const thetaStar = rsStar / dStar;
  const Rfac = (3 * cosmo.Ob) / (4 * cosmo.Ogamma);
  const kEq = (cosmo.aEq * cosmo.E(cosmo.aEq)) / cosmo.dH;
  const kDStar = dampingWavenumber(cosmo, hist, zStar);

  // Silk damping envelope averaged over the visibility function (diffusion keeps acting while the
  // last-scattering shell is crossed).
  const { z, visibility } = hist;
  let gMax = 0;
  for (let i = 0; i < z.length; i++) gMax = Math.max(gMax, visibility[i]);
  let zHi = zStar;
  let zLo = zStar;
  for (let i = 0; i < z.length; i++) {
    if (visibility[i] > 0.01 * gMax && z[i] > 300) {
      zHi = Math.max(zHi, z[i]);
      zLo = Math.min(zLo, z[i]);
    }
  }
  const J = 16;
  const shell: { w: number; kD: number }[] = [];
  let wSum = 0;
  for (let j = 0; j < J; j++) {
    const zj = zHi - ((j + 0.5) / J) * (zHi - zLo);
    const idx = Math.round((z[0] - zj) / (z[0] - z[1]));
    const wj = visibility[Math.max(0, Math.min(z.length - 1, idx))];
    shell.push({ w: wj, kD: dampingWavenumber(cosmo, hist, zj) * tuning.dampScale });
    wSum += wj;
  }
  for (const s of shell) s.w /= wSum;
  const Rstar = Rfac / (1 + zStar);

  // Acoustic source on a fine k grid, stored as tilted squared amplitudes.
  const kMax = 1.2;
  const nk = 12000;
  const dk = kMax / nk;
  const P0 = new Float64Array(nk + 1);
  const P1 = new Float64Array(nk + 1);
  // Phase shift from radiation driving / early ISW, concentrated on modes near the first acoustic
  // scale (q ~ 1); it vanishes on super-horizon scales so the Sachs–Wolfe limit is preserved.
  const kPhi = (tuning.phaseK * Math.PI) / rsStar;
  const driveR = tuning.drive * Math.pow(1 + Rstar, -0.25);
  const dopR = tuning.doppler * Math.sqrt(3 / (1 + Rstar));
  const nsm1 = cosmo.p.ns - 1;
  for (let i = 0; i <= nk; i++) {
    const k = Math.max(i * dk, 1e-6);
    const T = transferNoWiggle(cosmo, k);
    const q2 = (k / kPhi) ** 2;
    const phase = (Math.PI * tuning.phase * q2) / (1 + q2 * q2);
    let damp = 0;
    for (const s of shell) damp += s.w * Math.exp(-((k / s.kD) ** 2));
    // Modes entering the horizon well after equality oscillate with the matter-era, baryon-loaded
    // amplitude; earlier modes are boosted by radiation driving as their potentials decay.
    const blend = 1 / (1 + Math.pow(k / (tuning.driveK * kEq), tuning.driveN));
    const amp = ((1 + 3 * Rstar) * blend + driveR * (1 - blend)) * damp;
    const th = k * rsStar + phase;
    const m = amp * Math.cos(th) - 3 * Rstar * T * tuning.offset;
    const v = dopR * amp * Math.sin(th);
    const tilt = Math.pow(k / K_PIVOT, nsm1);
    P0[i] = m * m * tilt;
    P1[i] = v * v * tilt;
  }

  const sample = (k: number): [number, number] => {
    if (k >= kMax) {
      const m = -3 * Rstar * transferNoWiggle(cosmo, k) * tuning.offset;
      return [m * m * Math.pow(k / K_PIVOT, nsm1), 0];
    }
    const x = k / dk;
    const i = Math.floor(x);
    const f = x - i;
    return [P0[i] * (1 - f) + P0[i + 1] * f, P1[i] * (1 - f) + P1[i + 1] * f];
  };

  // Projection quadrature in s with w = sinh(s).
  const nS = 160;
  const sMax = Math.asinh(60);
  const ds = sMax / nS;
  const qW: number[] = [];
  const qA: number[] = [];
  const qB: number[] = [];
  const qU: number[] = [];
  for (let i = 0; i <= nS; i++) {
    const s = i * ds;
    const w = Math.sinh(s);
    const u2 = 1 + w * w;
    const jac = Math.cosh(s) * ds * (i === 0 || i === nS ? 0.5 : 1);
    qW.push(jac);
    qA.push(Math.pow(u2, -1.5));
    qB.push(w * w * Math.pow(u2, -2.5));
    qU.push(Math.sqrt(u2));
  }

  const growthDeficit = Math.max(0, 1 - cosmo.growthMD(1));
  // Early ISW: potentials keep decaying after z* while radiation is still dynamically relevant.
  const radToMatter = cosmo.Or / (cosmo.Om / (1 + zStar));
  const ellA = Math.PI / thetaStar;
  const tau = cosmo.p.tau;
  const reionSupp = Math.exp(-2 * tau);
  const dRe = cosmo.comovingDistance(hist.zReion);
  const etaRe = cosmo.particleHorizon(1 / (1 + hist.zReion));
  const ellRe = Math.max(4, (2 * dRe) / Math.max(etaRe, 1));

  const Dl = new Float64Array(lmax + 1);
  const Cl = new Float64Array(lmax + 1);
  for (let l = 2; l <= lmax; l++) {
    const nu = l + 0.5;
    let sum = 0;
    for (let i = 0; i <= nS; i++) {
      const [m2, v2] = sample((nu * qU[i]) / dStar);
      sum += (m2 * qA[i] + v2 * qB[i]) * qW[i];
    }
    let d = dSW * ((l * (l + 1)) / (nu * nu)) * sum;
    d += (dSW * tuning.isw * growthDeficit) / (1 + (l / 8) ** 2);
    const xe = (l / ellA - tuning.eiswPos) / 0.22;
    d += dSW * tuning.eisw * radToMatter * Math.exp(-0.5 * xe * xe);
    d *= reionSupp + (1 - reionSupp) / (1 + (l / ellRe) ** 2);
    // Universes without a hot Big Bang (bounces) have no acoustic source at all.
    if (!Number.isFinite(d)) d = 0;
    Dl[l] = d;
    Cl[l] = (2 * Math.PI * d) / (l * (l + 1));
  }

  const derived: CmbDerived = {
    zStar,
    rsStar,
    dStar,
    thetaStar,
    ellA,
    Rstar,
    kEq,
    kD: kDStar,
    zDrag: hist.zDrag,
    rsDrag: soundHorizon(cosmo, hist.zDrag),
    zReion: hist.zReion,
    dSW,
  };
  return {
    lmax,
    Dl,
    Cl,
    derived,
    peaks: findExtrema(Dl, 100, true).slice(0, 7),
    troughs: findExtrema(Dl, 300, false).slice(0, 6),
  };
}
