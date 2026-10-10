import { DEG } from './constants';
import type { Vec3 } from './coords';

export const J2000_JD = 2451545.0;

export interface OrbitalElements {
  /** Semi-major axis (au), eccentricity, inclination (deg), mean longitude (deg),
   * longitude of perihelion (deg), longitude of ascending node (deg) at J2000 ... */
  a: number;
  e: number;
  I: number;
  L: number;
  varpi: number;
  Omega: number;
  /** ... and their rates per Julian century. */
  da: number;
  de: number;
  dI: number;
  dL: number;
  dvarpi: number;
  dOmega: number;
}

const el = (a: number[], d: number[]): OrbitalElements => ({
  a: a[0], e: a[1], I: a[2], L: a[3], varpi: a[4], Omega: a[5],
  da: d[0], de: d[1], dI: d[2], dL: d[3], dvarpi: d[4], dOmega: d[5],
});

/** JPL "Approximate Positions of the Planets" (Standish), Table 1, valid 1800–2050. */
export const PLANET_ELEMENTS = {
  mercury: el(
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  ),
  venus: el(
    [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  ),
  earth: el(
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  ),
  mars: el(
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ),
  jupiter: el(
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  ),
  saturn: el(
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  ),
  uranus: el(
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  ),
  neptune: el(
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  ),
  pluto: el(
    [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  ),
} as const;

export type PlanetKey = keyof typeof PLANET_ELEMENTS;

export const julianDate = (date: Date): number => date.getTime() / 86_400_000 + 2440587.5;
export const dateFromJulian = (jd: number): Date => new Date((jd - 2440587.5) * 86_400_000);

/** Solves Kepler's equation E − e sin E = M (radians). */
export function solveKepler(M: number, e: number): number {
  let m = M % (2 * Math.PI);
  if (m > Math.PI) m -= 2 * Math.PI;
  if (m < -Math.PI) m += 2 * Math.PI;
  let E = e < 0.8 ? m : Math.PI * Math.sign(m || 1);
  for (let i = 0; i < 30; i++) {
    const f = E - e * Math.sin(E) - m;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

function rotateToEcliptic(xp: number, yp: number, omega: number, Om: number, I: number): Vec3 {
  const co = Math.cos(omega);
  const so = Math.sin(omega);
  const cO = Math.cos(Om);
  const sO = Math.sin(Om);
  const cI = Math.cos(I);
  const sI = Math.sin(I);
  return [
    (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    so * sI * xp + co * sI * yp,
  ];
}

/** Heliocentric J2000 ecliptic position (au) of a planet at Julian date jd. */
export function planetPosition(key: PlanetKey, jd: number): Vec3 {
  const o = PLANET_ELEMENTS[key];
  const T = (jd - J2000_JD) / 36525;
  const a = o.a + o.da * T;
  const e = o.e + o.de * T;
  const I = (o.I + o.dI * T) * DEG;
  const L = o.L + o.dL * T;
  const varpi = o.varpi + o.dvarpi * T;
  const Om = (o.Omega + o.dOmega * T) * DEG;
  const omega = varpi * DEG - Om;
  const E = solveKepler((L - varpi) * DEG, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return rotateToEcliptic(xp, yp, omega, Om, I);
}

/** Samples the full osculating orbit (au) at epoch jd for drawing. */
export function orbitPath(key: PlanetKey, jd: number, segments = 256): Vec3[] {
  const o = PLANET_ELEMENTS[key];
  const T = (jd - J2000_JD) / 36525;
  const a = o.a + o.da * T;
  const e = o.e + o.de * T;
  const I = (o.I + o.dI * T) * DEG;
  const varpi = o.varpi + o.dvarpi * T;
  const Om = (o.Omega + o.dOmega * T) * DEG;
  const omega = varpi * DEG - Om;
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * 2 * Math.PI;
    pts.push(rotateToEcliptic(a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), omega, Om, I));
  }
  return pts;
}

/** Orbital period in days from the mean-longitude rate. */
export function orbitalPeriodDays(key: PlanetKey): number {
  return (360 / PLANET_ELEMENTS[key].dL) * 36525;
}

const sinD = (x: number) => Math.sin(x * DEG);
const cosD = (x: number) => Math.cos(x * DEG);

/**
 * Geocentric ecliptic position of the Moon (km), Astronomical Almanac low-precision formulae
 * (≈0.3° in longitude, ≈0.2° in latitude).
 */
export function moonPosition(jd: number): Vec3 {
  const T = (jd - J2000_JD) / 36525;
  const lon =
    218.32 +
    481267.881 * T +
    6.29 * sinD(135.0 + 477198.87 * T) -
    1.27 * sinD(259.3 - 413335.36 * T) +
    0.66 * sinD(235.7 + 890534.22 * T) +
    0.21 * sinD(269.9 + 954397.74 * T) -
    0.19 * sinD(357.5 + 35999.05 * T) -
    0.11 * sinD(186.5 + 966404.03 * T);
  const lat =
    5.13 * sinD(93.3 + 483202.02 * T) +
    0.28 * sinD(228.2 + 960400.89 * T) -
    0.28 * sinD(318.3 + 6003.15 * T) -
    0.17 * sinD(217.6 - 407332.21 * T);
  const par =
    0.9508 +
    0.0518 * cosD(135.0 + 477198.87 * T) +
    0.0095 * cosD(259.3 - 413335.36 * T) +
    0.0078 * cosD(235.7 + 890534.22 * T) +
    0.0028 * cosD(269.9 + 954397.74 * T);
  const r = 6378.14 / sinD(par);
  return [r * cosD(lat) * cosD(lon), r * cosD(lat) * sinD(lon), r * sinD(lat)];
}
