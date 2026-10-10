import { clamp } from "./format.js";

/** Piecewise map so early epochs and the galaxy era are both scrubbable. */
const K1 = 0.34;
const K2 = 0.6;

export function uToA(u) {
  const x = clamp(u, 0, 1);
  if (x < K1) {
    const logA = -9 + (x / K1) * 6;
    return 10 ** logA;
  }
  if (x < K2) {
    const f = (x - K1) / (K2 - K1);
    return 10 ** (-3 + f * 2);
  }
  const f = (x - K2) / (1 - K2);
  return 0.1 + f * 0.9;
}

export function aToU(a) {
  const scale = Math.max(a, 1e-9);
  const logA = Math.log10(scale);
  if (logA <= -3) return K1 * clamp((logA + 9) / 6, 0, 1);
  if (scale <= 0.1) return K1 + (K2 - K1) * clamp((logA + 3) / 2, 0, 1);
  return K2 + (1 - K2) * clamp((scale - 0.1) / 0.9, 0, 1);
}

export function epochMarkers(cosmo) {
  const eq = cosmo.params.Or / Math.max(cosmo.params.Om, 1e-8);
  const markers = [
    { id: "bbn", name: "核合成", a: 2.7e-9 },
    { id: "eq", name: "辐射·物质相等", a: eq },
    { id: "rec", name: "复合", a: 1 / 1089.9 },
    { id: "dark", name: "黑暗时代", a: 1 / 30 },
    { id: "reion", name: "再电离", a: 1 / 8 },
    { id: "noon", name: "宇宙正午", a: 1 / 2.9 },
    { id: "accel", name: "开始加速", a: cosmo.accel?.a ?? 0.6 },
    { id: "now", name: "今天", a: 1 },
  ];
  return markers
    .filter((marker) => marker.a > 1e-10 && marker.a <= 1)
    .map((marker) => ({ ...marker, u: aToU(marker.a) }));
}

export function epochName(a, cosmo) {
  const eq = cosmo.params.Or / Math.max(cosmo.params.Om, 1e-8);
  if (a < 2.7e-9) return "原初核合成之前";
  if (a < eq) return "辐射主导";
  if (a < 1 / 1089.9) return "复合之前";
  if (a < 1 / 15) return "黑暗时代";
  if (a < 1 / 6) return "再电离";
  if (cosmo.accel && a < cosmo.accel.a) return "结构生长";
  if (a < 0.999) return "加速膨胀";
  return "今天";
}
