const SEC_PER_YEAR = 365.25 * 24 * 3600;

export function formatCosmicTime(tGyr) {
  if (!Number.isFinite(tGyr)) return "—";
  const years = tGyr * 1e9;
  const sec = years * SEC_PER_YEAR;
  if (sec < 1e-6) return `${sig(sec * 1e9)} 纳秒`;
  if (sec < 1e-3) return `${sig(sec * 1e6)} 微秒`;
  if (sec < 1) return `${sig(sec * (sec < 0.01 ? 1000 : 1))}${sec < 0.01 ? " 毫秒" : " 秒"}`;
  if (sec < 60) return `${sig(sec)} 秒`;
  if (sec < 3600) return `${sig(sec / 60)} 分钟`;
  if (sec < 86400) return `${sig(sec / 3600)} 小时`;
  if (years < 1) return `${sig(sec / 86400)} 天`;
  if (years < 1e4) return `${sig(years)} 年`;
  if (years < 1e8) return `${sig(years / 1e4)} 万年`;
  return `${sig(years / 1e8)} 亿年`;
}

function sig(n) {
  const a = Math.abs(n);
  if (a >= 100) return n.toFixed(0);
  if (a >= 10) return n.toFixed(1);
  if (a >= 1) return n.toFixed(2);
  if (a >= 0.01) return n.toFixed(2);
  return n.toExponential(1);
}

export function formatTemp(kelvin) {
  if (!Number.isFinite(kelvin)) return "—";
  const ev = kelvin * 8.617333262145e-5;
  let main;
  if (kelvin >= 1e6) main = `${sig(kelvin)} K`;
  else if (kelvin >= 100) main = `${kelvin.toFixed(0)} K`;
  else main = `${kelvin.toFixed(2)} K`;
  if (ev >= 1e9) return `${main} · ${sig(ev / 1e9)} GeV`;
  if (ev >= 1e6) return `${main} · ${sig(ev / 1e6)} MeV`;
  if (ev >= 1) return `${main} · ${sig(ev)} eV`;
  return main;
}

export function formatMpc(mpc, digits) {
  if (!Number.isFinite(mpc)) return "—";
  const a = Math.abs(mpc);
  if (a < 1e-7) return "原点";
  if (a < 0.001) return `${(mpc * 1e6).toFixed(0)} pc`;
  if (a < 0.1) return `${trim(mpc * 1000, digits ?? 1)} kpc`;
  if (a < 1000) return `${trim(mpc, digits ?? (a < 10 ? 2 : 1))} Mpc`;
  return `${trim(mpc / 1000, 2)} Gpc`;
}

export function formatLight(mpc) {
  if (!Number.isFinite(mpc) || Math.abs(mpc) < 1e-7) return "";
  const ly = mpc * 3.261563777e6;
  const a = Math.abs(ly);
  if (a < 1e5) return `${trim(ly, 0)} 光年`;
  if (a < 1e8) return `${trim(ly / 1e4, 1)} 万光年`;
  return `${trim(ly / 1e8, a < 1e10 ? 2 : 0)} 亿光年`;
}

export function formatH(H) {
  if (!Number.isFinite(H)) return "—";
  if (H < 1000) return `${H.toFixed(H < 100 ? 2 : 1)} km/s/Mpc`;
  return `${H.toExponential(2)} km/s/Mpc`;
}

export function formatMass(mass) {
  if (!mass || !Number.isFinite(mass)) return "—";
  const exp = Math.floor(Math.log10(mass));
  const man = mass / 10 ** exp;
  return `${man.toFixed(2)}×10${sup(exp)} M☉`;
}

export function formatSci(value, unit = "", digits = 2) {
  if (!Number.isFinite(value)) return "—";
  const a = Math.abs(value);
  if (a !== 0 && (a < 0.01 || a >= 1e5)) {
    return `${value.toExponential(digits)}${unit ? " " + unit : ""}`;
  }
  return `${value.toFixed(a >= 100 ? 1 : digits)}${unit ? " " + unit : ""}`;
}

export function formatFraction(x) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(Math.abs(x) >= 0.1 ? 1 : 2)}%`;
}

export function formatRedshift(z) {
  if (!Number.isFinite(z)) return "—";
  if (Math.abs(z) < 0.001) return "0";
  if (Math.abs(z) < 10) return z.toFixed(2);
  if (Math.abs(z) < 1000) return z.toFixed(1);
  return z.toExponential(2);
}

export function formatRecession(vOverC) {
  if (!Number.isFinite(vOverC)) return "—";
  const a = Math.abs(vOverC);
  if (a < 0.01) return `${(vOverC * 299792.458).toFixed(0)} km/s`;
  return `${vOverC.toFixed(a >= 10 ? 1 : 2)} c`;
}

function trim(n, d) {
  const v = n.toFixed(d);
  return d > 0 ? v.replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m)) || "0" : v;
}

function sup(exp) {
  const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return String(exp)
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("");
}

export const KIND_LABEL = {
  star: "恒星",
  nucleus: "星系核",
  satellite: "卫星星系",
  galaxy: "星系",
  group: "星系群",
  cluster: "星系团",
  attractor: "流域吸引子",
  void: "空洞 / 排斥子",
  wall: "大尺度长城",
  cmb: "最后散射面",
  horizon: "粒子视界",
  hubble: "哈勃球",
};
