import { YEAR_S } from '../physics/constants';
import type { Cosmology } from '../physics/cosmology';
import type { IonizationHistory } from '../physics/recombination';
import { stellarMassDensity, thermalState, type ThermalState } from '../physics/timeline';

export interface EvoVisual {
  state: ThermalState;
  /** Fraction of the present-day displacement field (linear growth, Zel'dovich). */
  growth: number;
  /** Opacity of the ionized plasma (photons trapped). */
  plasma: number;
  plasmaColor: [number, number, number];
  /** Brightness of the background glow (plasma or freshly released CMB). */
  glow: number;
  /** Luminosity of galaxies (integrated star formation), 0–1. */
  lum: number;
  /** Sparkle of the first stars in dense nodes. */
  dawn: number;
  /** Reionization: fraction of the volume ionized (0–1). */
  ionized: number;
  /** Visibility of dark matter tracers during the Dark Ages. */
  dm: number;
  /** 0 = young blue populations, 1 = old red populations. */
  age: number;
  /** Fading of stars in the far future. */
  starsAlive: number;
  /** Quantum jitter during inflation. */
  jitter: number;
  /** Box scale for the physical-size view (a, clamped for display). */
  scaleView: number;
}

/** Approximate sRGB colour (0–1) of a blackbody at temperature T (Tanner Helland's fit). */
export function blackbodyColor(T: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, T)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (x: number) => Math.min(255, Math.max(0, x)) / 255;
  return [c(r), c(g), c(b)];
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Free-electron fraction at redshift z from a computed ionization history. */
export function xeAt(hist: IonizationHistory, z: number): number {
  const z0 = hist.z[0];
  if (z >= z0) return 1;
  const dz = hist.z[0] - hist.z[1];
  const x = (z0 - z) / dz;
  const i = Math.min(hist.z.length - 2, Math.max(0, Math.floor(x)));
  const f = x - i;
  return hist.xe[i] * (1 - f) + hist.xe[i + 1] * f;
}

export function evolutionVisual(cosmo: Cosmology, hist: IonizationHistory, logT: number, physical: boolean): EvoVisual {
  const tSec = Math.pow(10, logT);
  const state = thermalState(cosmo, tSec);
  const { a, z, T } = state;
  const years = tSec / YEAR_S;
  const growth = a > 0 && Number.isFinite(a) ? Math.min(1, Math.max(0, cosmo.growth(Math.min(a, 1e3)))) : 0;
  const xe = z > hist.z[0] ? 1 : xeAt(hist, z);
  const fHe = hist.fHe;
  // Before reionization the residual ionization is tiny; plasma opacity tracks hydrogen recombination.
  const plasma = z > 300 ? smooth(0.08, 0.6, Math.min(1, xe)) : 0;
  const glow = z > 300 ? Math.min(1, plasma + smooth(150, 1100, z) * 0.35) : 0;
  const rhoNow = stellarMassDensity(cosmo, 0);
  const lumRaw = z < 30 ? stellarMassDensity(cosmo, Math.max(z, 0)) / rhoNow : 0;
  const starsAlive = 1 - smooth(Math.log10(1e12), Math.log10(1e14), Math.log10(Math.max(years, 1)));
  const lum = Math.min(1, Math.pow(Math.max(lumRaw, 0), 0.33)) * starsAlive;
  const dawn = smooth(32, 22, z) * (1 - smooth(9, 4, z));
  const ionized = z < 25 ? Math.min(1, Math.max(0, (xe - 0.001) / (1 + fHe))) : 0;
  const dm = smooth(1500, 800, z) * (0.35 + 0.65 * (1 - lum));
  const age = Math.min(1, Math.max(0, smooth(4, 0, z) * 0.55 + smooth(10, 12, Math.log10(Math.max(years, 1))) * 0.45));
  const jitter = logT < -32 ? 1 - smooth(-33, -32, logT) : 0;
  const scaleView = physical ? Math.min(4, Math.max(0.04, Number.isFinite(a) ? a : 4)) : 1;
  return {
    state,
    growth,
    plasma,
    plasmaColor: blackbodyColor(T),
    glow,
    lum,
    dawn,
    ionized,
    dm,
    age,
    starsAlive,
    jitter,
    scaleView,
  };
}
