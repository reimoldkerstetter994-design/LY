/** Equatorial J2000 → Galactic → Supergalactic, matching Astropy's IAU matrices. */

const DEG = Math.PI / 180;

function rotZ(deg) {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ];
}

function rotY(deg) {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [
    [c, 0, -s],
    [0, 1, 0],
    [s, 0, c],
  ];
}

function mul(a, b) {
  const o = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      o[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return o;
}

function apply(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

const NGP_RA = 192.8594812065348;
const NGP_DEC = 27.12825118085622;
const LON0 = 122.9319185680026;
const NSGP_L = 47.37;
const NSGP_B = 6.32;

const EQ_TO_GAL = mul(rotZ(180 - LON0), mul(rotY(90 - NGP_DEC), rotZ(NGP_RA)));
const GAL_TO_SG = mul(rotZ(90), mul(rotY(90 - NSGP_B), rotZ(NSGP_L)));

export function equatorialCartesian(raDeg, decDeg, dist) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const c = Math.cos(dec);
  return [dist * c * Math.cos(ra), dist * c * Math.sin(ra), dist * Math.sin(dec)];
}

export function galacticCartesian(lDeg, bDeg, dist) {
  const l = lDeg * DEG;
  const b = bDeg * DEG;
  const c = Math.cos(b);
  return [dist * c * Math.cos(l), dist * c * Math.sin(l), dist * Math.sin(b)];
}

export function equatorialToSupergalactic(raDeg, decDeg, dist) {
  return apply(GAL_TO_SG, apply(EQ_TO_GAL, equatorialCartesian(raDeg, decDeg, dist)));
}

export function galacticToSupergalactic(lDeg, bDeg, dist) {
  return apply(GAL_TO_SG, galacticCartesian(lDeg, bDeg, dist));
}

export function galacticVectorToSupergalactic(v) {
  return apply(GAL_TO_SG, v);
}

export function sphericalFromCartesian(v) {
  const [x, y, z] = v;
  const r = Math.hypot(x, y, z);
  return {
    r,
    lon: (Math.atan2(y, x) * 180) / Math.PI,
    lat: (Math.asin(Math.max(-1, Math.min(1, z / (r || 1)))) * 180) / Math.PI,
  };
}
