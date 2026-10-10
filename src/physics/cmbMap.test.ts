import { describe, expect, it } from 'vitest';
import { synthesizeCmbMap } from './cmbMap';

function areaWeightedVariance(data: Float32Array, W: number, H: number): number {
  let sum = 0;
  let wsum = 0;
  for (let j = 0; j < H; j++) {
    const w = Math.sin((Math.PI * (j + 0.5)) / H);
    for (let k = 0; k < W; k++) {
      const v = data[j * W + k];
      sum += w * v * v;
      wsum += w;
    }
  }
  return sum / wsum;
}

describe('CMB map synthesis', () => {
  it('conserves power (Parseval on the sphere)', () => {
    const lmax = 96;
    const Cl = new Float64Array(lmax + 1).fill(1);
    const map = synthesizeCmbMap(Cl, { width: 256, height: 128, lmax, seed: 7 });
    let expected = 0;
    for (let l = 2; l <= lmax; l++) {
      const cl = (2 * Math.PI * map.realizedDl[l]) / (l * (l + 1));
      expected += ((2 * l + 1) * cl) / (4 * Math.PI);
    }
    const variance = areaWeightedVariance(map.data, 256, 128);
    expect(variance / expected).toBeGreaterThan(0.97);
    expect(variance / expected).toBeLessThan(1.03);
  });

  it('is reproducible for a seed and keeps large scales when lmax grows', () => {
    const Cl = new Float64Array(200).fill(0);
    for (let l = 2; l < 200; l++) Cl[l] = 1 / (l * (l + 1));
    const a = synthesizeCmbMap(Cl, { width: 128, height: 64, lmax: 40, seed: 3 });
    const b = synthesizeCmbMap(Cl, { width: 128, height: 64, lmax: 40, seed: 3 });
    expect(Array.from(a.data.slice(0, 50))).toEqual(Array.from(b.data.slice(0, 50)));
    const c = synthesizeCmbMap(Cl, { width: 256, height: 128, lmax: 120, seed: 3 });
    expect(c.realizedDl[10]).toBeCloseTo(a.realizedDl[10], 10);
  });

  it('adds a dipole of the right amplitude', () => {
    const Cl = new Float64Array(10).fill(0);
    const map = synthesizeCmbMap(Cl, { width: 128, height: 64, lmax: 8, seed: 1, dipole: true });
    expect(map.max).toBeGreaterThan(3300);
    expect(map.min).toBeLessThan(-3300);
  });
});
