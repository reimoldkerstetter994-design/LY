import { AU_M, DEG } from '../physics/constants';
import {
  add,
  cross,
  eclipticToWorld,
  normalize,
  raDecToWorld,
  scale,
  type Vec3,
} from '../physics/coords';
import { J2000_JD, moonPosition, planetPosition } from '../physics/kepler';
import { PROBES, SOLAR_BODIES, type SolarBody } from '../data/solarSystem';

export const BODY_BY_ID = new Map<string, SolarBody>(SOLAR_BODIES.map((b) => [b.id, b]));

/** World-frame unit vector of a body's north pole. */
export function poleVector(body: SolarBody): Vec3 {
  return raDecToWorld(body.pole.ra, body.pole.dec);
}

const poleCache = new Map<string, [Vec3, Vec3, Vec3]>();
/** Orthonormal basis (u, v, pole) of a body's equatorial plane in world coordinates. */
export function equatorBasis(body: SolarBody): [Vec3, Vec3, Vec3] {
  const hit = poleCache.get(body.id);
  if (hit) return hit;
  const n = poleVector(body);
  const ref: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(ref, n));
  const v = cross(n, u);
  const basis: [Vec3, Vec3, Vec3] = [u, v, n];
  poleCache.set(body.id, basis);
  return basis;
}

const ZERO: Vec3 = [0, 0, 0];

/** Heliocentric world-frame position (metres) of a Solar System body or probe at Julian date jd. */
export function bodyPosition(id: string, jd: number): Vec3 {
  if (id === 'sun') return ZERO;
  const body = BODY_BY_ID.get(id);
  if (body) {
    if (body.orbitKey) return scale(eclipticToWorld(planetPosition(body.orbitKey, jd)), AU_M);
    if (id === 'moon') {
      return add(bodyPosition('earth', jd), scale(eclipticToWorld(moonPosition(jd)), 1000));
    }
    if (body.parent && body.moonOrbit) {
      const parent = BODY_BY_ID.get(body.parent)!;
      const [u, v] = equatorBasis(parent);
      const { aKm, periodDays, phaseDeg } = body.moonOrbit;
      const th = phaseDeg * DEG + (2 * Math.PI * (jd - J2000_JD)) / periodDays;
      const r = aKm * 1000;
      return add(bodyPosition(body.parent, jd), add(scale(u, r * Math.cos(th)), scale(v, r * Math.sin(th))));
    }
  }
  const probe = PROBES.find((p) => p.id === id);
  if (probe) {
    const years = (jd - 2460310.5) / 365.25;
    return scale(raDecToWorld(probe.ra, probe.dec), (probe.d2024 + probe.speed * years) * AU_M);
  }
  return ZERO;
}

export function isDynamic(id: string): boolean {
  return BODY_BY_ID.has(id) || PROBES.some((p) => p.id === id);
}
