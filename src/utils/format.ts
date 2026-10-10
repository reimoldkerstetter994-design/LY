import { AU_M, LY_M, YEAR_S } from '../physics/constants';

export type Lang = 'zh' | 'en';

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const sup = (n: number): string => String(n).split('').map((c) => SUP[c] ?? c).join('');

/** Number with a sensible number of significant digits and thousands separators. */
export function num(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-3) return sci(x, sig);
  const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
  return x.toLocaleString('en-US', { maximumFractionDigits: Math.min(digits, 6), minimumFractionDigits: 0 });
}

/** Scientific notation with superscript exponent, e.g. 1.23×10⁴⁵. */
export function sci(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '—';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / 10 ** e;
  const ms = Number(m.toPrecision(sig));
  if (Math.abs(ms) === 10) return `${Math.sign(ms) < 0 ? '−' : ''}10${sup(e + 1)}`;
  if (Math.abs(ms - 1) < 1e-9) return `10${sup(e)}`;
  return `${ms}×10${sup(e)}`;
}

/** Chinese large-number units 万 (10⁴) and 亿 (10⁸). */
function zhBig(x: number, unit: string, sig = 3): string {
  if (x >= 1e16) return `${sci(x, sig)} ${unit}`;
  if (x >= 1e8) return `${num(x / 1e8, sig)} 亿${unit}`;
  if (x >= 1e4) return `${num(x / 1e4, sig)} 万${unit}`;
  return `${num(x, sig)} ${unit}`;
}

function enBig(x: number, unit: string, sig = 3): string {
  if (x >= 1e15) return `${sci(x, sig)} ${unit}`;
  if (x >= 1e12) return `${num(x / 1e12, sig)} trillion ${unit}`;
  if (x >= 1e9) return `${num(x / 1e9, sig)} billion ${unit}`;
  if (x >= 1e6) return `${num(x / 1e6, sig)} million ${unit}`;
  return `${num(x, sig)} ${unit}`;
}

/** Distance in metres → human-readable text. */
export function distance(m: number, lang: Lang, sig = 3): string {
  if (!Number.isFinite(m)) return '∞';
  const a = Math.abs(m);
  if (a < 1e3) return lang === 'zh' ? `${num(a, sig)} 米` : `${num(a, sig)} m`;
  if (a < 0.05 * AU_M) {
    const km = a / 1e3;
    return lang === 'zh' ? zhBig(km, '千米', sig) : `${num(km, sig)} km`;
  }
  if (a < 0.2 * LY_M) {
    const au = a / AU_M;
    return lang === 'zh' ? `${num(au, sig)} 天文单位` : `${num(au, sig)} au`;
  }
  const ly = a / LY_M;
  return lang === 'zh' ? zhBig(ly, '光年', sig) : enBig(ly, 'ly', sig);
}

/** Distance given in light-years. */
export const distanceLy = (ly: number, lang: Lang, sig = 3) => distance(ly * LY_M, lang, sig);

/** Duration given in years. */
export function years(y: number, lang: Lang, sig = 3): string {
  if (!Number.isFinite(y)) return '∞';
  if (y < 1) return duration(y * YEAR_S, lang, sig);
  return lang === 'zh' ? zhBig(y, '年', sig) : enBig(y, y === 1 ? 'year' : 'years', sig);
}

/** Duration given in seconds (spans 10⁻⁴⁴ s … 10¹⁰⁰ yr). */
export function duration(s: number, lang: Lang, sig = 3): string {
  if (!Number.isFinite(s)) return '∞';
  const zh = lang === 'zh';
  if (s < 1e-3) return zh ? `${sci(s, sig)} 秒` : `${sci(s, sig)} s`;
  if (s < 60) return zh ? `${num(s, sig)} 秒` : `${num(s, sig)} s`;
  if (s < 3600) return zh ? `${num(s / 60, sig)} 分钟` : `${num(s / 60, sig)} min`;
  if (s < 86400) return zh ? `${num(s / 3600, sig)} 小时` : `${num(s / 3600, sig)} h`;
  if (s < YEAR_S) return zh ? `${num(s / 86400, sig)} 天` : `${num(s / 86400, sig)} days`;
  return years(s / YEAR_S, lang, sig);
}

export const gyr = (g: number, lang: Lang, sig = 3) => years(g * 1e9, lang, sig);

export function temperature(K: number): string {
  if (!Number.isFinite(K)) return '—';
  if (K >= 1e6 || K < 0.01) return `${sci(K, 3)} K`;
  return `${num(K, K < 10 ? 4 : 3)} K`;
}

export function percent(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

/** Formats a Julian date as an ISO-like calendar date in UTC. */
export function calendarDate(jd: number): string {
  const d = new Date((jd - 2440587.5) * 86_400_000);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getUTCFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ys = y < 0 ? `−${String(-y).padStart(4, '0')}` : String(y).padStart(4, '0');
  return `${ys}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
