import type { Cosmology } from './cosmology';

/** Pivot scale of the primordial spectrum, 1/Mpc. */
export const K_PIVOT = 0.05;

/**
 * Eisenstein & Hu (1998) "no-wiggle" matter transfer function (baryon suppression without
 * acoustic oscillations). k in 1/Mpc.
 */
export function transferNoWiggle(cosmo: Cosmology, k: number): number {
  const h = cosmo.h;
  const om = cosmo.Om * h * h;
  const ob = cosmo.Ob * h * h;
  const fb = cosmo.Ob / cosmo.Om;
  const theta = cosmo.p.Tcmb / 2.7;
  const s = (44.5 * Math.log(9.83 / om)) / Math.sqrt(1 + 10 * Math.pow(ob, 0.75));
  const alphaG = 1 - 0.328 * Math.log(431 * om) * fb + 0.38 * Math.log(22.3 * om) * fb * fb;
  const gammaEff = cosmo.Om * h * (alphaG + (1 - alphaG) / (1 + Math.pow(0.43 * k * s, 4)));
  const q = ((k / h) * theta * theta) / gammaEff;
  const L0 = Math.log(2 * Math.E + 1.8 * q);
  const C0 = 14.2 + 731 / (1 + 62.5 * q);
  return L0 / (L0 + C0 * q * q);
}

/** Dimensionless primordial curvature power spectrum Δ²_ζ(k). */
export function primordialPower(cosmo: Cosmology, k: number): number {
  return cosmo.p.As * Math.pow(k / K_PIVOT, cosmo.p.ns - 1);
}

/** Dimensionless linear matter power Δ²(k, z) = k³P/(2π²). */
export function matterDelta2(cosmo: Cosmology, k: number, z = 0): number {
  const a = 1 / (1 + z);
  const T = transferNoWiggle(cosmo, k);
  const kd = k * cosmo.dH;
  const g = cosmo.growthMD(a) / cosmo.Om;
  return (4 / 25) * primordialPower(cosmo, k) * kd ** 4 * g * g * T * T;
}

/** Linear matter power spectrum P(k, z) in Mpc³ (k in 1/Mpc). */
export function matterPower(cosmo: Cosmology, k: number, z = 0): number {
  return (2 * Math.PI * Math.PI * matterDelta2(cosmo, k, z)) / (k * k * k);
}

function tophat(x: number): number {
  if (x < 1e-3) return 1 - (x * x) / 10;
  return (3 * (Math.sin(x) - x * Math.cos(x))) / (x * x * x);
}

/** RMS linear density fluctuation in spheres of radius R (Mpc). */
export function sigmaR(cosmo: Cosmology, R: number, z = 0): number {
  const lnkMin = Math.log(1e-5);
  const lnkMax = Math.log(50 / Math.max(R, 1e-3) + 10);
  const n = 2000;
  const dl = (lnkMax - lnkMin) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const k = Math.exp(lnkMin + i * dl);
    const w = tophat(k * R);
    const f = matterDelta2(cosmo, k, z) * w * w;
    sum += (i === 0 || i === n ? 0.5 : 1) * f;
  }
  return Math.sqrt(sum * dl);
}

export function sigma8(cosmo: Cosmology, z = 0): number {
  return sigmaR(cosmo, 8 / cosmo.h, z);
}
