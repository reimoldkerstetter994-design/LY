import { DEG } from './constants';

export type Vec3 = [number, number, number];

/** Mean obliquity of the ecliptic at J2000. */
export const OBLIQUITY_J2000 = 23.4392911 * DEG;

/** Rotation from ICRS/equatorial to Galactic Cartesian coordinates (rows are Galactic axes). */
const EQ_TO_GAL: number[][] = [
  [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];

const mul = (m: number[][], v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const mulT = (m: number[][], v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];

export const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
export const normalize = (v: Vec3): Vec3 => scale(v, 1 / (length(v) || 1));

/** Unit vector for spherical angles (degrees): longitude-like λ and latitude-like β. */
export function sphericalToVec(lonDeg: number, latDeg: number): Vec3 {
  const l = lonDeg * DEG;
  const b = latDeg * DEG;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}

export function vecToSpherical(v: Vec3): { lon: number; lat: number } {
  const r = length(v) || 1;
  let lon = Math.atan2(v[1], v[0]) / DEG;
  if (lon < 0) lon += 360;
  return { lon, lat: Math.asin(Math.max(-1, Math.min(1, v[2] / r))) / DEG };
}

/** Parses "hh mm ss" / "hh:mm:ss" right ascension into degrees. */
export function parseRA(ra: string): number {
  const [h, m = '0', s = '0'] = ra.trim().split(/[\s:hms]+/).filter(Boolean);
  return (Number(h) + Number(m) / 60 + Number(s) / 3600) * 15;
}

/** Parses "±dd mm ss" declination into degrees. */
export function parseDec(dec: string): number {
  const t = dec.trim();
  const sign = t.startsWith('-') || t.startsWith('−') ? -1 : 1;
  const [d, m = '0', s = '0'] = t.replace(/^[+\-−]/, '').split(/[\s:°'"′″dms]+/).filter(Boolean);
  return sign * (Number(d) + Number(m) / 60 + Number(s) / 3600);
}

export function equatorialToEcliptic(v: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY_J2000);
  const s = Math.sin(OBLIQUITY_J2000);
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
}

export function eclipticToEquatorial(v: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY_J2000);
  const s = Math.sin(OBLIQUITY_J2000);
  return [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]];
}

export const equatorialToGalactic = (v: Vec3): Vec3 => mul(EQ_TO_GAL, v);
export const galacticToEquatorial = (v: Vec3): Vec3 => mulT(EQ_TO_GAL, v);

/** Supergalactic frame (de Vaucouleurs): pole at (l, b) = (47.37°, 6.32°), origin at l = 137.37°. */
const SG_Z = sphericalToVec(47.37, 6.32);
const SG_X = sphericalToVec(137.37, 0);
const SG_Y = cross(SG_Z, SG_X);
export function supergalacticToGalactic(v: Vec3): Vec3 {
  return add(add(scale(SG_X, v[0]), scale(SG_Y, v[1])), scale(SG_Z, v[2]));
}

/**
 * The renderer's world frame is the J2000 ecliptic with the north ecliptic pole along +Y:
 * world = (x_ecl, z_ecl, −y_ecl).
 */
export const eclipticToWorld = (v: Vec3): Vec3 => [v[0], v[2], -v[1]];
export const worldToEcliptic = (v: Vec3): Vec3 => [v[0], -v[2], v[1]];
export const equatorialToWorld = (v: Vec3): Vec3 => eclipticToWorld(equatorialToEcliptic(v));
export const galacticToWorld = (v: Vec3): Vec3 => equatorialToWorld(galacticToEquatorial(v));

/** World-frame unit vector of an object at right ascension / declination (degrees). */
export const raDecToWorld = (raDeg: number, decDeg: number): Vec3 => equatorialToWorld(sphericalToVec(raDeg, decDeg));

/** World-frame unit vector for Galactic longitude / latitude (degrees). */
export const galLBToWorld = (lDeg: number, bDeg: number): Vec3 => galacticToWorld(sphericalToVec(lDeg, bDeg));

/** Columns of the rotation that maps Galactic Cartesian axes into the world frame. */
export function galacticBasisWorld(): [Vec3, Vec3, Vec3] {
  return [galacticToWorld([1, 0, 0]), galacticToWorld([0, 1, 0]), galacticToWorld([0, 0, 1])];
}

export function supergalacticBasisWorld(): [Vec3, Vec3, Vec3] {
  return [
    galacticToWorld(supergalacticToGalactic([1, 0, 0])),
    galacticToWorld(supergalacticToGalactic([0, 1, 0])),
    galacticToWorld(supergalacticToGalactic([0, 0, 1])),
  ];
}

/** Disc normal (world frame) of a galaxy given its sky position, inclination and position angle. */
export function galaxyDiscNormal(raDeg: number, decDeg: number, inclDeg: number, paDeg: number): Vec3 {
  const ra = raDeg * DEG;
  const de = decDeg * DEG;
  const los: Vec3 = sphericalToVec(raDeg, decDeg);
  const east: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  const north: Vec3 = [-Math.sin(de) * Math.cos(ra), -Math.sin(de) * Math.sin(ra), Math.cos(de)];
  const pa = paDeg * DEG;
  const minor = add(scale(north, -Math.sin(pa)), scale(east, Math.cos(pa)));
  const i = inclDeg * DEG;
  const nEq = normalize(add(scale(los, -Math.cos(i)), scale(minor, Math.sin(i))));
  return equatorialToWorld(nEq);
}

/** Major-axis direction (world frame) for a galaxy at the given sky position and position angle. */
export function galaxyMajorAxis(raDeg: number, decDeg: number, paDeg: number): Vec3 {
  const ra = raDeg * DEG;
  const de = decDeg * DEG;
  const east: Vec3 = [-Math.sin(ra), Math.cos(ra), 0];
  const north: Vec3 = [-Math.sin(de) * Math.cos(ra), -Math.sin(de) * Math.sin(ra), Math.cos(de)];
  const pa = paDeg * DEG;
  return equatorialToWorld(normalize(add(scale(north, Math.cos(pa)), scale(east, Math.sin(pa)))));
}
