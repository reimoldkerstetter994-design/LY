import { describe, expect, it } from 'vitest';
import { Cosmology, PLANCK18, type CosmoParams } from './cosmology';
import { MPC_GLY } from './constants';

const noRadiation = (p: Partial<CosmoParams>): CosmoParams => ({ ...PLANCK18, Tcmb: 1e-4, Neff: 0, ...p });

describe('Planck 2018 ΛCDM', () => {
  const c = new Cosmology(PLANCK18);

  it('has the right age', () => {
    expect(c.age0).toBeGreaterThan(13.76);
    expect(c.age0).toBeLessThan(13.83);
  });

  it('places matter–radiation equality near z ≈ 3400', () => {
    expect(c.zEq).toBeGreaterThan(3330);
    expect(c.zEq).toBeLessThan(3470);
  });

  it('puts the last-scattering surface ~13.9 Gpc away and the particle horizon ~46 Gly', () => {
    const dStar = c.comovingDistance(1090);
    expect(dStar).toBeGreaterThan(13_700);
    expect(dStar).toBeLessThan(14_050);
    const horizonGly = c.particleHorizon(1) * MPC_GLY;
    expect(horizonGly).toBeGreaterThan(45.5);
    expect(horizonGly).toBeLessThan(47.5);
  });

  it('has a finite event horizon of ~16–17 Gly', () => {
    const ehGly = c.eventHorizon(1) * MPC_GLY;
    expect(ehGly).toBeGreaterThan(15.5);
    expect(ehGly).toBeLessThan(17.5);
  });

  it('satisfies distance-duality and inverts distances', () => {
    for (const z of [0.01, 0.5, 1, 3, 10]) {
      expect(c.luminosityDistance(z)).toBeCloseTo(c.angularDiameterDistance(z) * (1 + z) ** 2, 6);
      expect(c.zAtComovingDistance(c.comovingDistance(z))).toBeCloseTo(z, 5);
    }
  });

  it('inverts age ↔ scale factor', () => {
    for (const a of [1e-6, 1e-3, 0.1, 0.5, 1, 2, 10]) {
      expect(c.aAtAge(c.ageAtA(a)) / a).toBeCloseTo(1, 6);
    }
  });

  it('starts accelerating near z ≈ 0.63 and becomes Λ-dominated near z ≈ 0.3', () => {
    const zAcc = 1 / c.aAcceleration! - 1;
    expect(zAcc).toBeGreaterThan(0.58);
    expect(zAcc).toBeLessThan(0.68);
    const zDE = 1 / c.aMatterDE! - 1;
    expect(zDE).toBeGreaterThan(0.26);
    expect(zDE).toBeLessThan(0.34);
  });

  it('has the expected linear growth suppression and heat-death fate', () => {
    expect(c.growth(1)).toBeCloseTo(1, 10);
    expect(c.growthMD(1)).toBeGreaterThan(0.76);
    expect(c.growthMD(1)).toBeLessThan(0.8);
    expect(c.growthRate(1)).toBeGreaterThan(0.5);
    expect(c.growthRate(1)).toBeLessThan(0.56);
    expect(c.fate.kind).toBe('freeze');
  });
});

describe('analytic limits', () => {
  it('Einstein–de Sitter: t0 = 2/(3H0), D_C = 2 c/H0 (1 - 1/√(1+z)), D ∝ a', () => {
    const c = new Cosmology(noRadiation({ Om: 1, Ob: 0.05, flat: true }));
    expect(c.age0 / c.tH).toBeCloseTo(2 / 3, 5);
    for (const z of [0.5, 2, 9]) {
      expect(c.comovingDistance(z) / c.dH).toBeCloseTo(2 * (1 - 1 / Math.sqrt(1 + z)), 5);
    }
    expect(c.growth(0.5)).toBeCloseTo(0.5, 3);
    expect(c.eventHorizon(1)).toBe(Infinity);
  });

  it('Milne (empty) universe: t0 = 1/H0, D_L = c/H0 · z(1 + z/2)', () => {
    const c = new Cosmology(noRadiation({ Om: 1e-9, Ob: 1e-10, Ode: 0, flat: false }));
    expect(c.age0 / c.tH).toBeCloseTo(1, 4);
    for (const z of [0.3, 1, 4]) {
      expect(c.luminosityDistance(z) / c.dH).toBeCloseTo(z * (1 + z / 2), 4);
    }
  });

  it('de Sitter: D_C = c/H0 · z', () => {
    const c = new Cosmology(noRadiation({ Om: 1e-9, Ob: 1e-10, flat: true }));
    for (const z of [0.5, 3]) expect(c.comovingDistance(z) / c.dH).toBeCloseTo(z, 5);
  });

  it('flat ΛCDM age matches the closed-form solution', () => {
    const Om = 0.3;
    const c = new Cosmology(noRadiation({ Om, Ob: 0.05, flat: true }));
    const OL = 1 - Om;
    const exact = (2 / (3 * Math.sqrt(OL))) * Math.asinh(Math.sqrt(OL / Om));
    expect(c.age0 / c.tH).toBeCloseTo(exact, 5);
  });

  it('closed matter universe recollapses on the cycloid: t_crunch = 2π/H0 for Ωm = 2', () => {
    const c = new Cosmology(noRadiation({ Om: 2, Ob: 0.1, Ode: 0, flat: false }));
    const fate = c.fate;
    expect(fate.kind).toBe('crunch');
    if (fate.kind !== 'crunch') return;
    expect(fate.aMax).toBeCloseTo(2, 4);
    expect(fate.tCrunchGyr / c.tH).toBeCloseTo(2 * Math.PI, 2);
    expect(c.aAtAge(fate.tMaxGyr * 1.5)).toBeCloseTo(c.aAtAge(fate.tMaxGyr * 0.5), 6);
  });

  it('phantom dark energy ends in a Big Rip roughly 2/(3|1+w|H0√(1-Ωm)) from now', () => {
    const c = new Cosmology(noRadiation({ Om: 0.3, Ob: 0.05, flat: true, w0: -1.5 }));
    const fate = c.fate;
    expect(fate.kind).toBe('rip');
    if (fate.kind !== 'rip') return;
    const approx = (2 / 3 / 0.5 / Math.sqrt(0.7)) * c.tH;
    expect((fate.tRipGyr - c.age0) / approx).toBeGreaterThan(0.93);
    expect((fate.tRipGyr - c.age0) / approx).toBeLessThan(1.07);
  });

  it('detects a bounce when Λ is too large for a Big Bang', () => {
    const c = new Cosmology(noRadiation({ Om: 0.3, Ob: 0.05, Ode: 2.5, flat: false }));
    expect(c.fate.kind).toBe('bounce');
  });
});
