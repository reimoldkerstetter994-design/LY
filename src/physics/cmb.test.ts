import { describe, expect, it } from 'vitest';
import { Cosmology, PLANCK18, type CosmoParams } from './cosmology';
import { computeIonizationHistory } from './recombination';
import { computeCmbSpectrum } from './cmb';
import { sigma8 } from './powerSpectrum';

const spectrum = (p: CosmoParams) => {
  const c = new Cosmology(p);
  const h = computeIonizationHistory(c, p.tau);
  return { c, h, s: computeCmbSpectrum(c, h, 2000) };
};

describe('recombination history', () => {
  const { h } = spectrum(PLANCK18);

  it('finds last scattering, baryon drag and reionization at the Planck values', () => {
    expect(h.zStar).toBeGreaterThan(1080);
    expect(h.zStar).toBeLessThan(1100);
    expect(h.zDrag).toBeGreaterThan(1050);
    expect(h.zDrag).toBeLessThan(1070);
    expect(h.zReion).toBeGreaterThan(7.2);
    expect(h.zReion).toBeLessThan(8.2);
  });

  it('freezes out with a small residual ionization', () => {
    expect(h.xeFreeze).toBeGreaterThan(1e-4);
    expect(h.xeFreeze).toBeLessThan(1e-3);
  });
});

describe('CMB temperature spectrum', () => {
  const { s, c } = spectrum(PLANCK18);

  it('reproduces the acoustic scale θ* and the sound horizon', () => {
    expect(100 * s.derived.thetaStar).toBeGreaterThan(1.035);
    expect(100 * s.derived.thetaStar).toBeLessThan(1.047);
    expect(s.derived.rsStar).toBeGreaterThan(142);
    expect(s.derived.rsStar).toBeLessThan(147);
    expect(s.derived.rsDrag).toBeGreaterThan(145);
    expect(s.derived.rsDrag).toBeLessThan(149);
  });

  it('places the first acoustic peak near ℓ ≈ 220 with the right height ordering', () => {
    const [p1, p2, p3, p4, p5] = s.peaks;
    expect(p1.ell).toBeGreaterThan(205);
    expect(p1.ell).toBeLessThan(235);
    expect(p1.Dl).toBeGreaterThan(5000);
    expect(p1.Dl).toBeLessThan(7000);
    expect(p2.ell).toBeGreaterThan(500);
    expect(p2.ell).toBeLessThan(560);
    expect(p3.ell).toBeGreaterThan(790);
    expect(p3.ell).toBeLessThan(840);
    expect(p1.Dl).toBeGreaterThan(p2.Dl);
    expect(p3.Dl).toBeGreaterThan(p4.Dl);
    expect(p4.Dl).toBeGreaterThan(p5.Dl);
  });

  it('has a Sachs–Wolfe plateau of roughly 600–1100 μK²', () => {
    for (const l of [2, 5, 10]) {
      expect(s.Dl[l]).toBeGreaterThan(600);
      expect(s.Dl[l]).toBeLessThan(1100);
    }
  });

  it('gives σ8 close to the Planck value', () => {
    const s8 = sigma8(c);
    expect(s8).toBeGreaterThan(0.77);
    expect(s8).toBeLessThan(0.86);
  });

  it('responds physically to parameters', () => {
    const rich = spectrum({ ...PLANCK18, Ob: 0.065 }).s;
    expect(rich.peaks[0].Dl / rich.peaks[1].Dl).toBeGreaterThan(s.peaks[0].Dl / s.peaks[1].Dl);
    const closed = spectrum({ ...PLANCK18, flat: false, Ode: 0.7347 }).s;
    expect(closed.peaks[0].ell).toBeLessThan(s.peaks[0].ell);
    const reion = spectrum({ ...PLANCK18, tau: 0.12 }).s;
    expect(reion.Dl[1000]).toBeLessThan(s.Dl[1000]);
  });
});
