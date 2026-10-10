import { describe, expect, it } from 'vitest';
import { approachLimit, focusZoomedToward, pickRadiusPx } from './interact';

describe('zoom toward a point', () => {
  it('keeps the anchor fixed when the distance is scaled', () => {
    const focus: [number, number, number] = [0, 0, 0];
    const anchor: [number, number, number] = [10, 0, 0];
    const next = focusZoomedToward(focus, anchor, 0.5, 1e9);
    expect(next[0]).toBeCloseTo(5);
    expect(next[1]).toBeCloseTo(0);
    expect(focusZoomedToward(focus, anchor, 1, 1e9)[0]).toBeCloseTo(0);
  });

  it('does not move the focus when the anchor is the focus', () => {
    const focus: [number, number, number] = [3, -4, 5];
    const next = focusZoomedToward(focus, focus, 0.1, 1e9);
    expect(next).toEqual(focus);
  });

  it('caps a single step so a far anchor cannot fling the camera', () => {
    const focus: [number, number, number] = [0, 0, 0];
    const anchor: [number, number, number] = [100, 0, 0];
    const next = focusZoomedToward(focus, anchor, 0, 12);
    expect(Math.hypot(next[0], next[1], next[2])).toBeCloseTo(12);
    expect(next[0]).toBeCloseTo(12);
  });
});

describe('what a click can grab', () => {
  it('gives planets a disc and horizons only a point', () => {
    expect(pickRadiusPx('planet', 400, 800)).toBeGreaterThan(100);
    expect(pickRadiusPx('horizon', 5000, 800)).toBe(18);
    expect(pickRadiusPx('supercluster', 2000, 800)).toBe(56);
    expect(pickRadiusPx('star', 2, 800)).toBe(18);
  });

  it('stops at a planet’s surface and lets you enter a galaxy', () => {
    expect(approachLimit('planet', 6.4e6)).toBeCloseTo(6.4e6 * 1.12);
    expect(approachLimit('galaxy', 1e21)).toBeCloseTo(1e21 * 0.012);
    expect(approachLimit('black-hole', 1e10)).toBeCloseTo(2.4e10);
  });
});
