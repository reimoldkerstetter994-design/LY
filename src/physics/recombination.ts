import { C_M_S, EV_J, H_PLANCK, K_B, M_E, M_H, MPC_M, RHO_CRIT_H2, SIGMA_T } from './constants';
import type { Cosmology } from './cosmology';

/** Hydrogen ionization energy (J). */
const B1 = 13.605693 * EV_J;
/** Lyman-α energy (n=2 → n=1), J. */
const E_LYA = 0.75 * B1;
/** Binding energy of the n=2 level, J. */
const B2 = 0.25 * B1;
const LAMBDA_2S = 8.2245809;
const LAMBDA_LYA = 1.215668e-7;
/** RECFAST fudge factor that mimics the multi-level atom. */
const FUDGE = 1.14;

export interface IonizationHistory {
  /** Redshift grid, descending from zMax to 0. */
  z: Float64Array;
  /** Free electrons per hydrogen nucleus, including reionization. */
  xe: Float64Array;
  /** Recombination-only free-electron fraction. */
  xeRec: Float64Array;
  /** Thomson optical depth from z = 0 to z (recombination only). */
  tau: Float64Array;
  /** Visibility function g(z) = e^{-τ} dτ/dz (recombination only). */
  visibility: Float64Array;
  /** Redshift where the recombination optical depth reaches 1. */
  zStar: number;
  /** Peak of the visibility function. */
  zVisPeak: number;
  /** Redshift where the baryon-drag optical depth reaches 1. */
  zDrag: number;
  /** Mid-point of hydrogen reionization matching the requested optical depth. */
  zReion: number;
  /** Residual ionization fraction after recombination (z = 200). */
  xeFreeze: number;
  /** Present-day hydrogen number density, m^-3. */
  nH0: number;
  /** Helium-to-hydrogen number ratio. */
  fHe: number;
}

/** α_B case-B recombination coefficient (m³/s), Pequignot et al. 1991 fit. */
export function alphaB(T: number): number {
  const t = T / 1e4;
  return (FUDGE * 1e-19 * 4.309 * Math.pow(t, -0.6166)) / (1 + 0.6703 * Math.pow(t, 0.53));
}

/** Saha ionization fraction of hydrogen. */
export function sahaXe(T: number, nH: number): number {
  const s = Math.pow((2 * Math.PI * M_E * K_B * T) / (H_PLANCK * H_PLANCK), 1.5) * Math.exp(-B1 / (K_B * T)) / nH;
  if (s > 1e8) return 1;
  return (-s + Math.sqrt(s * s + 4 * s)) / 2;
}

function reionXe(z: number, zRe: number, fHe: number): number {
  const dz = 0.5;
  const y = Math.pow(1 + z, 1.5);
  const yRe = Math.pow(1 + zRe, 1.5);
  const dy = 1.5 * Math.sqrt(1 + zRe) * dz;
  const hydrogen = ((1 + fHe) / 2) * (1 + Math.tanh((yRe - y) / dy));
  const heliumII = (fHe / 2) * (1 + Math.tanh((3.5 - z) / 0.5));
  return hydrogen + heliumII;
}

/**
 * Solves the Peebles three-level-atom equation for hydrogen recombination (Saha at early times,
 * implicit integration afterwards) and adds a tanh reionization history whose mid-point redshift
 * reproduces the requested optical depth τ.
 */
export function computeIonizationHistory(cosmo: Cosmology, tauReion: number, zMax = 2500, dz = 0.5): IonizationHistory {
  const { p } = cosmo;
  const h2 = cosmo.h * cosmo.h;
  const obh2 = cosmo.Ob * h2;
  const nH0 = ((1 - p.Yp) * obh2 * RHO_CRIT_H2) / M_H;
  const fHe = p.Yp / (3.9715 * (1 - p.Yp));
  const H0si = cosmo.H0SI;
  const Hsi = (z: number) => H0si * cosmo.E(1 / (1 + z));

  const N = Math.floor(zMax / dz) + 1;
  const zArr = new Float64Array(N);
  const xeRec = new Float64Array(N);
  for (let i = 0; i < N; i++) zArr[i] = zMax - i * dz;

  const rate = (x: number, z: number): number => {
    const T = p.Tcmb * (1 + z);
    const nH = nH0 * (1 + z) ** 3;
    const aB = alphaB(T);
    const bB = aB * Math.pow((2 * Math.PI * M_E * K_B * T) / (H_PLANCK * H_PLANCK), 1.5) * Math.exp(-B2 / (K_B * T));
    const H = Hsi(z);
    const K = LAMBDA_LYA ** 3 / (8 * Math.PI * H);
    const n1s = nH * Math.max(1 - x, 0);
    const C = (1 + K * LAMBDA_2S * n1s) / (1 + K * (LAMBDA_2S + bB) * n1s);
    const net = aB * nH * x * x - bB * Math.max(1 - x, 0) * Math.exp(-E_LYA / (K_B * T));
    return (C * net) / ((1 + z) * H);
  };

  let i = 0;
  let x = 1;
  for (; i < N; i++) {
    const z = zArr[i];
    const xs = sahaXe(p.Tcmb * (1 + z), nH0 * (1 + z) ** 3);
    if (xs < 0.985) break;
    xeRec[i] = xs;
    x = xs;
  }
  for (; i < N; i++) {
    const z = zArr[i];
    // Backward Euler step from z + dz to z, solved with Newton iterations (the equation is stiff).
    const xPrev = x;
    let xn = xPrev;
    for (let it = 0; it < 30; it++) {
      const g = xn - xPrev + dz * rate(xn, z);
      const eps = Math.max(1e-9, xn * 1e-6);
      const dg = 1 + (dz * (rate(xn + eps, z) - rate(xn - eps, z))) / (2 * eps);
      const step = g / dg;
      xn = Math.min(1, Math.max(1e-10, xn - step));
      if (Math.abs(step) < 1e-12 * Math.max(xn, 1e-6)) break;
    }
    x = xn;
    xeRec[i] = x;
  }

  // Optical depth (recombination only) integrated from z = 0 upwards.
  const dtaudz = (xe: number, z: number) => (xe * nH0 * (1 + z) ** 2 * SIGMA_T * C_M_S) / Hsi(z);
  const tau = new Float64Array(N);
  const tauDrag = new Float64Array(N);
  const Rfac = (3 * obh2) / (4 * cosmo.Ogamma * h2);
  for (let k = N - 2; k >= 0; k--) {
    const z0 = zArr[k + 1];
    const z1 = zArr[k];
    const d0 = dtaudz(xeRec[k + 1], z0);
    const d1 = dtaudz(xeRec[k], z1);
    tau[k] = tau[k + 1] + 0.5 * dz * (d0 + d1);
    tauDrag[k] = tauDrag[k + 1] + 0.5 * dz * (d0 / (Rfac / (1 + z0)) + d1 / (Rfac / (1 + z1)));
  }
  const visibility = new Float64Array(N);
  let zVisPeak = 0;
  let gMax = 0;
  for (let k = 0; k < N; k++) {
    const g = Math.exp(-tau[k]) * dtaudz(xeRec[k], zArr[k]);
    visibility[k] = g;
    if (g > gMax) {
      gMax = g;
      zVisPeak = zArr[k];
    }
  }
  const crossing = (arr: Float64Array, level: number): number => {
    for (let k = N - 2; k >= 0; k--) {
      if (arr[k] >= level) {
        const f = (level - arr[k + 1]) / (arr[k] - arr[k + 1]);
        return zArr[k + 1] + f * (zArr[k] - zArr[k + 1]);
      }
    }
    return zMax;
  };
  const zStar = crossing(tau, 1);
  const zDrag = crossing(tauDrag, 1);
  const xeFreeze = xeRec[Math.min(N - 1, Math.round((zMax - 200) / dz))];

  // Reionization: find the mid-point redshift that yields the requested optical depth.
  const tauOf = (zRe: number): number => {
    let sum = 0;
    const step = 0.05;
    for (let z = 0; z < 50; z += step) {
      const zm = z + step / 2;
      sum += dtaudz(Math.max(reionXe(zm, zRe, fHe), 0), zm) * step;
    }
    return sum;
  };
  let lo = 0.5;
  let hi = 40;
  let zReion: number;
  if (tauReion <= tauOf(lo)) zReion = lo;
  else if (tauReion >= tauOf(hi)) zReion = hi;
  else {
    for (let it = 0; it < 50; it++) {
      const mid = 0.5 * (lo + hi);
      if (tauOf(mid) < tauReion) lo = mid;
      else hi = mid;
    }
    zReion = 0.5 * (lo + hi);
  }

  const xe = new Float64Array(N);
  for (let k = 0; k < N; k++) xe[k] = Math.max(xeRec[k], reionXe(zArr[k], zReion, fHe));

  return { z: zArr, xe, xeRec, tau, visibility, zStar, zVisPeak, zDrag, zReion, xeFreeze, nH0, fHe };
}

/** Comoving photon-diffusion (Silk) damping wavenumber at redshift z, 1/Mpc. */
export function dampingWavenumber(cosmo: Cosmology, hist: IonizationHistory, zTarget: number): number {
  const h2 = cosmo.h * cosmo.h;
  const Rfac = (3 * cosmo.Ob * h2) / (4 * cosmo.Ogamma * h2);
  const H0si = cosmo.H0SI;
  // k_D^-2 = ∫ dη / (6 (1+R) n_e σ_T a) · [R²/(1+R) + 16/15],  dη = c dz / H.
  let sum = 0;
  const { z, xeRec } = hist;
  for (let k = 0; k < z.length - 1; k++) {
    const za = z[k];
    const zb = z[k + 1];
    if (zb < zTarget) break;
    const zm = 0.5 * (za + zb);
    const xe = Math.max(0.5 * (xeRec[k] + xeRec[k + 1]), 1e-8);
    const ne = xe * hist.nH0 * (1 + zm) ** 3;
    const R = Rfac / (1 + zm);
    const H = H0si * cosmo.E(1 / (1 + zm));
    const dEta = (C_M_S * (za - zb)) / H;
    sum += (dEta * (1 + zm)) / (6 * (1 + R) * ne * SIGMA_T) * ((R * R) / (1 + R) + 16 / 15);
  }
  const kD = 1 / Math.sqrt(sum); // 1/m
  return kD * MPC_M;
}
