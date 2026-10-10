import { SEC_PER_GYR } from "./cosmology.js";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatDuration(gyr) {
  if (!Number.isFinite(gyr)) return "—";
  const seconds = gyr * SEC_PER_GYR;
  const abs = Math.abs(seconds);
  const sign = gyr < 0 ? "−" : "";
  if (abs < 90) return `${sign}${abs.toFixed(abs < 10 ? 2 : 1)} 秒`;
  if (abs < 5400) return `${sign}${(abs / 60).toFixed(1)} 分钟`;
  if (abs < 172800) return `${sign}${(abs / 3600).toFixed(1)} 小时`;
  const years = Math.abs(gyr) * 1e9;
  if (years < 1e6) return `${sign}${years.toFixed(0)} 年`;
  if (years < 1e9) return `${sign}${(years / 1e6).toFixed(2)} 百万年`;
  return `${sign}${Math.abs(gyr).toFixed(Math.abs(gyr) < 30 ? 3 : 2)} Gyr`;
}

export function formatTemp(kelvin) {
  if (!Number.isFinite(kelvin)) return "—";
  if (kelvin < 10) return `${kelvin.toFixed(3)} K`;
  if (kelvin < 1000) return `${kelvin.toFixed(1)} K`;
  if (kelvin < 1e6) return `${(kelvin / 1e3).toFixed(2)} × 10³ K`;
  return `${kelvin.toExponential(2)} K`;
}

export function formatZ(z) {
  if (!Number.isFinite(z)) return "—";
  if (z < 0.01) return z.toFixed(4);
  if (z < 10) return z.toFixed(3);
  if (z < 100) return z.toFixed(2);
  return z.toFixed(1);
}

export function formatDistance(mpc) {
  if (!Number.isFinite(mpc)) return "—";
  const sign = mpc < 0 ? "−" : "";
  const v = Math.abs(mpc);
  if (v < 1e-4) return `${sign}${(v * 1e9).toFixed(0)} pc`;
  if (v < 0.2) return `${sign}${(v * 1000).toFixed(v < 0.02 ? 2 : 1)} kpc`;
  if (v < 800) return `${sign}${v.toFixed(v < 20 ? 2 : 1)} Mpc`;
  const gly = v * 3.261563777e-3;
  return `${sign}${gly.toFixed(gly < 20 ? 2 : 1)} Gly`;
}

export function formatNumber(value, digits = 3) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatHubble(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 10000) return value.toExponential(2);
  if (value >= 100) return value.toFixed(0);
  return value.toFixed(2);
}

export function formatScale(a) {
  if (!Number.isFinite(a)) return "—";
  if (a < 0.001 || a >= 100) return a.toExponential(2);
  return a.toFixed(a < 0.1 ? 4 : 3);
}
