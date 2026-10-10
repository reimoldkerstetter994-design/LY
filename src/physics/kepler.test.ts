import { describe, expect, it } from 'vitest';
import { J2000_JD, julianDate, moonPosition, planetPosition } from './kepler';
import {
  equatorialToGalactic,
  galacticToEquatorial,
  parseDec,
  parseRA,
  sphericalToVec,
  vecToSpherical,
} from './coords';

const lonOf = (v: number[]) => ((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360;
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('planetary ephemeris', () => {
  it('puts the Earth at heliocentric longitude ≈ 100.38° at J2000', () => {
    expect(angDiff(lonOf(planetPosition('earth', J2000_JD)), 100.38)).toBeLessThan(0.1);
  });

  it('reproduces perihelion and aphelion distances in 2024', () => {
    const peri = Math.hypot(...planetPosition('earth', julianDate(new Date('2024-01-03T00:39Z'))));
    const aph = Math.hypot(...planetPosition('earth', julianDate(new Date('2024-07-05T05:06Z'))));
    expect(peri).toBeCloseTo(0.98331, 3);
    expect(aph).toBeCloseTo(1.01673, 3);
  });

  it('aligns Earth and Mars at the 2020 opposition', () => {
    const jd = julianDate(new Date('2020-10-13T23:00Z'));
    expect(angDiff(lonOf(planetPosition('earth', jd)), lonOf(planetPosition('mars', jd)))).toBeLessThan(1.5);
  });

  it('places the full Moon opposite the Sun', () => {
    const jd = julianDate(new Date('2024-01-25T17:54Z'));
    expect(angDiff(lonOf(moonPosition(jd)), lonOf(planetPosition('earth', jd)))).toBeLessThan(1.5);
    const r = Math.hypot(...moonPosition(jd));
    expect(r).toBeGreaterThan(356_000);
    expect(r).toBeLessThan(407_000);
  });
});

describe('coordinate transforms', () => {
  it('maps the Galactic centre and pole correctly', () => {
    const gc = vecToSpherical(equatorialToGalactic(sphericalToVec(266.40499, -28.93617)));
    expect(angDiff(gc.lon, 0)).toBeLessThan(0.01);
    expect(Math.abs(gc.lat)).toBeLessThan(0.01);
    const ngp = vecToSpherical(equatorialToGalactic(sphericalToVec(192.85948, 27.12825)));
    expect(ngp.lat).toBeGreaterThan(89.99);
  });

  it('round-trips equatorial ↔ Galactic', () => {
    const v = sphericalToVec(10.68, 41.27);
    const back = galacticToEquatorial(equatorialToGalactic(v));
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(v[i], 12);
  });

  it('parses sexagesimal coordinates', () => {
    expect(parseRA('00 42 44.3')).toBeCloseTo(10.68458, 4);
    expect(parseDec('+41 16 09')).toBeCloseTo(41.26917, 4);
    expect(parseDec('-69 45 22')).toBeCloseTo(-69.75611, 4);
  });
});
