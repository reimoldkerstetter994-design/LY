import { clamp } from "./format.js";

export const A_RECOMBINATION = 1 / 1089.9;

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 1 while the baryons are still locked in the plasma, 0 after transparency. */
export function plasmaFraction(a) {
  if (a <= A_RECOMBINATION) return 1;
  const decades = Math.log10(a / A_RECOMBINATION);
  return 1 - smoothstep(0, 0.5, decades);
}

/**
 * Visual clustering weight. Linear growth is compressed with γ = 0.45 so the
 * cosmic web is readable by cosmic noon; this is not an N-body integration.
 */
export function clusteringWeight(a, cosmo) {
  const aEq = cosmo.params.Or / Math.max(cosmo.params.Om, 1e-6);
  if (a <= aEq) return 0;
  const linear = clamp(cosmo.growth(Math.max(a, aEq)), 0, 1);
  return linear ** 0.45;
}

export function thermalColor(kelvin) {
  const t = Math.log10(Math.max(kelvin, 3));
  const stops = [
    { t: 0.4, c: [0.35, 0.12, 0.08] },
    { t: 3.2, c: [0.85, 0.22, 0.1] },
    { t: 3.55, c: [1, 0.45, 0.16] },
    { t: 4.2, c: [1, 0.82, 0.55] },
    { t: 5.1, c: [0.92, 0.95, 1] },
    { t: 6.4, c: [0.62, 0.78, 1] },
    { t: 9, c: [0.45, 0.62, 1] },
  ];
  if (t <= stops[0].t) return stops[0].c;
  for (let i = 1; i < stops.length; i += 1) {
    if (t <= stops[i].t) {
      const f = (t - stops[i - 1].t) / (stops[i].t - stops[i - 1].t);
      return stops[i - 1].c.map((channel, index) => channel + (stops[i].c[index] - channel) * f);
    }
  }
  return stops[stops.length - 1].c;
}

export function mixColor(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
