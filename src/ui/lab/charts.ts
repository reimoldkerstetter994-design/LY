import { GYR_S, MPC_GLY } from '../../physics/constants';
import type { Cosmology } from '../../physics/cosmology';
import { matterPower, sigma8 } from '../../physics/powerSpectrum';
import type { IonizationHistory } from '../../physics/recombination';
import { starFormationRateDensity, stellarMassDensity, thermalState } from '../../physics/timeline';
import type { Lang } from '../../utils/format';
import type { LineChartProps, Marker, Series } from '../charts/LineChart';

export type ChartId =
  | 'expansion'
  | 'hubble'
  | 'omega'
  | 'distance'
  | 'spacetime'
  | 'growth'
  | 'power'
  | 'ionization'
  | 'temperature'
  | 'sfr';

export type SpacetimeView = 'proper' | 'comoving' | 'conformal';

export interface ChartSpec extends LineChartProps {
  note?: string;
}

const L = (lang: Lang, zh: string, en: string) => (lang === 'zh' ? zh : en);
const C = {
  cur: '#6ee7ff',
  ref: 'rgba(255,255,255,0.45)',
  r: '#ff9f68',
  m: '#6ee7ff',
  de: '#a78bfa',
  k: '#ffcf7d',
};

function logspace(a: number, b: number, n: number): number[] {
  const out: number[] = [];
  const la = Math.log10(a);
  const lb = Math.log10(b);
  for (let i = 0; i < n; i++) out.push(Math.pow(10, la + ((lb - la) * i) / (n - 1)));
  return out;
}

function plotEnd(c: Cosmology): number {
  const f = c.fate;
  if (f.kind === 'crunch') return f.tCrunchGyr * 1.01;
  if (f.kind === 'rip') return Math.min(f.tRipGyr * 1.01, 400);
  return Math.max(4 * c.age0, 45);
}

export function expansionChart(c: Cosmology, ref: Cosmology, lang: Lang): ChartSpec {
  const tMax = Math.max(plotEnd(c), Math.min(plotEnd(ref), 60));
  const ts: number[] = [];
  for (let i = 0; i <= 500; i++) ts.push((tMax * i) / 500);
  const a = ts.map((t) => c.aAtAge(t));
  const ar = ts.map((t) => ref.aAtAge(t));
  const yMax = Math.min(6, Math.max(2.5, ...a.filter(Number.isFinite).slice(0, 501)));
  const markers: Marker[] = [{ x: c.age0, label: L(lang, '现在', 'now'), color: 'rgba(110,231,255,0.7)' }];
  const f = c.fate;
  if (f.kind === 'crunch') markers.push({ x: f.tCrunchGyr, label: L(lang, '大挤压', 'Big Crunch'), color: '#ff7a90' });
  if (f.kind === 'rip') markers.push({ x: f.tRipGyr, label: L(lang, '大撕裂', 'Big Rip'), color: '#ff7a90' });
  return {
    series: [
      { label: L(lang, '当前参数', 'current'), color: C.cur, x: ts, y: a, width: 2.2 },
      { label: 'Planck 2018', color: C.ref, x: ts, y: ar, dash: [6, 5] },
    ],
    xDomain: [0, tMax],
    yDomain: [0, yMax],
    xLabel: L(lang, '宇宙时间 t（10 亿年）', 'cosmic time t (Gyr)'),
    yLabel: L(lang, '尺度因子 a(t)', 'scale factor a(t)'),
    markers,
    note: L(
      lang,
      '尺度因子 a 描述宇宙“尺子”的伸缩：今天 a = 1。曲线早期向下弯曲（引力减速），约 60 亿年前开始向上弯曲（暗能量加速）。',
      'The scale factor a measures the stretching of cosmic rulers (a = 1 today). The curve bends down early on (gravity decelerates) and up in the last ~6 Gyr (dark energy accelerates).',
    ),
  };
}

export function hubbleChart(c: Cosmology, ref: Cosmology, lang: Lang): ChartSpec {
  const zs = logspace(0.01, 3000, 400);
  return {
    series: [
      { label: L(lang, '当前参数', 'current'), color: C.cur, x: zs, y: zs.map((z) => c.Hz(z)), width: 2.2 },
      { label: 'Planck 2018', color: C.ref, x: zs, y: zs.map((z) => ref.Hz(z)), dash: [6, 5] },
    ],
    xLog: true,
    yLog: true,
    xLabel: L(lang, '红移 z', 'redshift z'),
    yLabel: 'H(z)  [km/s/Mpc]',
    markers: [{ x: c.zEq, label: L(lang, '物质—辐射相等', 'equality'), color: C.r }],
    note: L(lang, `今天 H₀ = ${c.p.H0} km/s/Mpc：每远 1 Mpc（326 万光年），退行速度增加 ${c.p.H0} km/s。`, `Today H₀ = ${c.p.H0} km/s/Mpc: recession speed grows by ${c.p.H0} km/s per megaparsec.`),
  };
}

export function omegaChart(c: Cosmology, lang: Lang): ChartSpec {
  const as = logspace(1e-6, Math.min(100, Number.isFinite(c.aMax) ? c.aMax * 0.999 : 100), 500);
  const om = as.map((a) => c.omegas(a));
  const series: Series[] = [
    { label: L(lang, '辐射 Ωr', 'radiation Ωr'), color: C.r, x: as, y: om.map((o) => o.r), width: 2 },
    { label: L(lang, '物质 Ωm', 'matter Ωm'), color: C.m, x: as, y: om.map((o) => o.m), width: 2 },
    { label: L(lang, '暗能量 ΩΛ', 'dark energy ΩΛ'), color: C.de, x: as, y: om.map((o) => o.de), width: 2 },
  ];
  if (Math.abs(c.Ok) > 1e-4) series.push({ label: L(lang, '曲率 Ωk', 'curvature Ωk'), color: C.k, x: as, y: om.map((o) => o.k), width: 2 });
  const markers: Marker[] = [
    { x: c.aEq, label: L(lang, '物质—辐射相等', 'matter–radiation'), color: 'rgba(255,159,104,0.7)' },
    { x: 1, label: L(lang, '现在', 'now'), color: 'rgba(110,231,255,0.7)' },
  ];
  const aDE = c.aMatterDE;
  if (aDE) markers.push({ x: aDE, label: L(lang, '物质—暗能量相等', 'matter–DE'), color: 'rgba(167,139,250,0.8)' });
  return {
    series,
    xLog: true,
    yDomain: [Math.min(0, ...om.map((o) => o.k)) - 0.02, 1.04],
    xLabel: L(lang, '尺度因子 a（今天 = 1）', 'scale factor a (today = 1)'),
    yLabel: L(lang, '能量密度占比 Ωᵢ(a)', 'density fraction Ωᵢ(a)'),
    markers,
    legend: 'tr',
    note: L(lang, '宇宙先后经历辐射主导、物质主导和暗能量主导三个时代。', 'The universe passes through radiation-, matter- and dark-energy-dominated eras.'),
  };
}

export function distanceChart(c: Cosmology, lang: Lang): ChartSpec {
  const zs = logspace(0.01, 1100, 400);
  const gly = (mpc: number) => mpc * MPC_GLY;
  const dc = zs.map((z) => gly(c.comovingDistance(z)));
  const dl = zs.map((z) => gly(c.luminosityDistance(z)));
  const da = zs.map((z) => gly(c.angularDiameterDistance(z)));
  const dlt = zs.map((z) => c.lookbackTime(z));
  let zMaxDA = 0;
  let best = 0;
  zs.forEach((z, i) => {
    if (da[i] > best) {
      best = da[i];
      zMaxDA = z;
    }
  });
  return {
    series: [
      { label: L(lang, '光度距离 D_L', 'luminosity distance D_L'), color: '#ffcf7d', x: zs, y: dl, width: 2 },
      { label: L(lang, '共动距离 D_C（今天的距离）', 'comoving distance D_C'), color: C.cur, x: zs, y: dc, width: 2.2 },
      { label: L(lang, '光行距离（回溯时间 × c）', 'light-travel distance'), color: '#7dffb0', x: zs, y: dlt, width: 2 },
      { label: L(lang, '角直径距离 D_A', 'angular-diameter distance D_A'), color: '#ff8fab', x: zs, y: da, width: 2 },
      { label: L(lang, '哈勃定律 cz/H₀', 'Hubble law cz/H₀'), color: 'rgba(255,255,255,0.35)', x: zs, y: zs.map((z) => gly((z * 299792.458) / c.p.H0)), dash: [4, 4] },
    ],
    xLog: true,
    yLog: true,
    yDomain: [0.05, 2e5],
    xLabel: L(lang, '红移 z', 'redshift z'),
    yLabel: L(lang, '距离（10 亿光年）', 'distance (Gly)'),
    markers: [{ x: zMaxDA, label: L(lang, 'D_A 最大', 'max D_A'), color: 'rgba(255,143,171,0.7)' }],
    legend: 'tl',
    note: L(
      lang,
      `“距离”在膨胀宇宙中有多种定义。角直径距离在 z ≈ ${zMaxDA.toFixed(2)} 处达到最大：更远的天体反而看起来更大。`,
      `“Distance” has several meanings in an expanding universe. The angular-diameter distance peaks at z ≈ ${zMaxDA.toFixed(2)}: farther objects then look larger.`,
    ),
  };
}

export function spacetimeChart(c: Cosmology, view: SpacetimeView, lang: Lang): ChartSpec {
  const tEnd = Math.min(plotEnd(c), 60);
  const aEnd = c.aAtAge(tEnd);
  const as = logspace(1e-5, Math.min(Number.isFinite(aEnd) ? aEnd : 50, 60), 700);
  const eta0 = c.conformalAge0;
  const etaEnd = c.conformalTimeEnd;
  const rows = as.map((a) => {
    const t = c.ageAtA(a);
    const eta = c.conformalTime(a);
    const lc = Math.max(0, eta0 - eta);
    const ph = eta;
    const eh = Number.isFinite(etaEnd) ? Math.max(0, etaEnd - eta) : NaN;
    const hs = (c.hubbleRadius(a) * MPC_GLY) / a;
    return { a, t, eta, lc, ph, eh, hs };
  }).filter((r) => r.t <= tEnd + 1e-6);
  const y = (r: (typeof rows)[number]) => (view === 'conformal' ? r.eta : r.t);
  const xs = (r: (typeof rows)[number], comoving: number) => (view === 'proper' ? r.a * comoving : comoving);
  const mirror = (label: string, color: string, f: (r: (typeof rows)[number]) => number, opts: Partial<Series> = {}): Series[] => {
    const pts = rows.filter((r) => Number.isFinite(f(r)) && (view !== 'conformal' || r.a <= 1 || f(r) >= 0));
    const X = pts.map((r) => xs(r, f(r)));
    const Y = pts.map(y);
    return [
      { label, color, x: X, y: Y, noHover: true, ...opts },
      { label: '', color, x: X.map((v) => -v), y: Y, noHover: true, legend: false, ...opts },
    ];
  };
  const pastCone = rows.filter((r) => r.a <= 1);
  const series: Series[] = [];
  for (const chi of [10, 20, 30, 40]) {
    const pts = rows.map((r) => xs(r, chi));
    series.push({ label: '', color: 'rgba(160,180,230,0.22)', x: pts, y: rows.map(y), width: 1, legend: false, noHover: true });
    series.push({ label: '', color: 'rgba(160,180,230,0.22)', x: pts.map((v) => -v), y: rows.map(y), width: 1, legend: false, noHover: true });
  }
  series.push(...mirror(L(lang, '哈勃球', 'Hubble sphere'), '#7dffcf', (r) => r.hs, { width: 1.8 }));
  if (Number.isFinite(etaEnd)) series.push(...mirror(L(lang, '事件视界', 'event horizon'), '#ff8fab', (r) => r.eh, { width: 1.8, dash: [6, 4] }));
  series.push(...mirror(L(lang, '粒子视界', 'particle horizon'), '#9ecbff', (r) => r.ph, { width: 1.8 }));
  const coneX = pastCone.map((r) => xs(r, r.lc));
  const coneY = pastCone.map(y);
  series.push({ label: L(lang, '我们的过去光锥', 'our past light cone'), color: '#ffd27a', x: coneX, y: coneY, width: 2.6, noHover: true });
  series.push({ label: '', color: '#ffd27a', x: coneX.map((v) => -v), y: coneY, width: 2.6, legend: false, noHover: true });
  const now = view === 'conformal' ? eta0 : c.age0;
  const xMax = view === 'proper' ? 65 : view === 'comoving' ? 70 : 70;
  return {
    series,
    xDomain: [-xMax, xMax],
    yDomain: [0, view === 'conformal' ? Math.min(Number.isFinite(etaEnd) ? etaEnd * 1.02 : 80, 80) : tEnd],
    xLabel: view === 'proper' ? L(lang, '固有距离（10 亿光年）', 'proper distance (Gly)') : L(lang, '共动距离（10 亿光年）', 'comoving distance (Gly)'),
    yLabel: view === 'conformal' ? L(lang, '共形时间 η（10 亿年）', 'conformal time η (Gyr)') : L(lang, '宇宙时间（10 亿年）', 'cosmic time (Gyr)'),
    markers: [{ y: now, label: L(lang, '现在', 'now'), color: 'rgba(110,231,255,0.7)' }],
    hover: false,
    legend: 'tl',
    note: L(
      lang,
      '仿 Davis & Lineweaver (2004)。黄色泪滴形曲线是我们的过去光锥：今天看到的光，都来自这条线上。灰线是随宇宙膨胀运动的星系世界线。粒子视界之外的区域从未与我们发生过因果联系；事件视界之外今天发出的光永远到不了我们。',
      'After Davis & Lineweaver (2004). The yellow teardrop is our past light cone: all light we see today was emitted on it. Grey lines are worldlines of comoving galaxies. Regions beyond the particle horizon have never been in causal contact with us; light emitted today beyond the event horizon will never reach us.',
    ),
  };
}

export function growthChart(c: Cosmology, ref: Cosmology, lang: Lang): ChartSpec {
  const as = logspace(1e-3, Math.min(10, Number.isFinite(c.aMax) ? c.aMax * 0.99 : 10), 300);
  return {
    series: [
      { label: L(lang, '增长因子 D(a)', 'growth factor D(a)'), color: C.cur, x: as, y: as.map((a) => c.growth(a)), width: 2.2 },
      { label: L(lang, 'Planck 2018 D(a)', 'Planck 2018 D(a)'), color: C.ref, x: as, y: as.map((a) => ref.growth(a)), dash: [6, 5] },
      { label: L(lang, '增长率 f = dlnD/dlna', 'growth rate f = dlnD/dlna'), color: '#ffcf7d', x: as, y: as.map((a) => c.growthRate(a)), width: 2 },
      { label: L(lang, '纯物质宇宙 D ∝ a', 'matter-only D ∝ a'), color: 'rgba(125,255,176,0.5)', x: as, y: as.map((a) => a / c.growthMD(1)), dash: [3, 4] },
    ],
    xLog: true,
    yLog: true,
    yDomain: [1e-3, 4],
    xLabel: L(lang, '尺度因子 a', 'scale factor a'),
    yLabel: 'D(a), f(a)',
    markers: [{ x: 1, label: L(lang, '现在', 'now'), color: 'rgba(110,231,255,0.7)' }],
    legend: 'br',
    note: L(lang, '密度涨落在物质主导时期与 a 成正比增长；暗能量主导后增长逐渐停滞，宇宙结构“冻结”。', 'Density fluctuations grow ∝ a during matter domination; once dark energy dominates, growth stalls and structure freezes.'),
  };
}

export function powerChart(c: Cosmology, ref: Cosmology, lang: Lang): ChartSpec {
  const ks = logspace(1e-4, 10, 300);
  const h = c.h;
  const hr = ref.h;
  const s8 = sigma8(c);
  return {
    series: [
      { label: `z = 0  (σ₈ = ${s8.toFixed(3)})`, color: C.cur, x: ks, y: ks.map((k) => matterPower(c, k * h, 0) * h * h * h), width: 2.2 },
      { label: 'z = 2', color: '#a78bfa', x: ks, y: ks.map((k) => matterPower(c, k * h, 2) * h * h * h), width: 1.8 },
      { label: 'Planck 2018 z = 0', color: C.ref, x: ks, y: ks.map((k) => matterPower(ref, k * hr, 0) * hr * hr * hr), dash: [6, 5] },
    ],
    xLog: true,
    yLog: true,
    yDomain: [1e-1, 1e5],
    xLabel: 'k  [h / Mpc]',
    yLabel: 'P(k)  [(Mpc/h)³]',
    markers: [{ x: (c.aEq * c.E(c.aEq)) / c.dH / h, label: 'k_eq', color: 'rgba(255,159,104,0.7)' }],
    legend: 'bl',
    note: L(
      lang,
      '线性物质功率谱（Eisenstein & Hu 1998 拟合）。峰值对应物质—辐射相等时进入视界的尺度；更小尺度的涨落在辐射时期被抑制。',
      'Linear matter power spectrum (Eisenstein & Hu 1998 fit). The turnover marks the horizon scale at matter–radiation equality; smaller scales were suppressed during radiation domination.',
    ),
  };
}

export function ionizationChart(c: Cosmology, hist: IonizationHistory, lang: Lang): ChartSpec {
  const xs: number[] = [];
  const xe: number[] = [];
  const xr: number[] = [];
  for (let i = hist.z.length - 1; i >= 0; i -= 2) {
    xs.push(1 + hist.z[i]);
    xe.push(hist.xe[i]);
    xr.push(hist.xeRec[i]);
  }
  void c;
  return {
    series: [
      { label: L(lang, '自由电子比例 xₑ', 'free-electron fraction xₑ'), color: C.cur, x: xs, y: xe, width: 2.2 },
      { label: L(lang, '仅复合（无再电离）', 'recombination only'), color: '#ffcf7d', x: xs, y: xr, dash: [5, 4] },
    ],
    xLog: true,
    yLog: true,
    yDomain: [1e-4, 1.4],
    xLabel: '1 + z',
    yLabel: 'xₑ = nₑ / n_H',
    markers: [
      { x: 1 + hist.zStar, label: `z* = ${hist.zStar.toFixed(0)}`, color: '#ff9f68' },
      { x: 1 + hist.zReion, label: `z_re = ${hist.zReion.toFixed(1)}`, color: '#4ea8de' },
    ],
    legend: 'bl',
    note: L(
      lang,
      `Peebles 三能级原子模型数值求解：氢在 z ≈ ${hist.zStar.toFixed(0)} 复合（残余电离 ${(hist.xeFreeze * 1e4).toFixed(1)}×10⁻⁴），随后在 z ≈ ${hist.zReion.toFixed(1)} 被第一代星系再电离（由光深 τ = ${c.p.tau} 推出）。`,
      `Numerical Peebles three-level atom: hydrogen recombines at z ≈ ${hist.zStar.toFixed(0)} (residual ionization ${(hist.xeFreeze * 1e4).toFixed(1)}×10⁻⁴) and is re-ionized by the first galaxies at z ≈ ${hist.zReion.toFixed(1)} (from τ = ${c.p.tau}).`,
    ),
  };
}

export function temperatureChart(c: Cosmology, lang: Lang): ChartSpec {
  const ls: number[] = [];
  for (let l = -43; l <= 17.64; l += 0.08) ls.push(l);
  const ts = ls.map((l) => Math.pow(10, l));
  const T = ts.map((t) => thermalState(c, t).T);
  return {
    series: [{ label: L(lang, '光子温度', 'photon temperature'), color: '#ff9f68', x: ts, y: T, width: 2.2 }],
    xLog: true,
    yLog: true,
    xLabel: L(lang, '宇宙时间（秒）', 'cosmic time (s)'),
    yLabel: L(lang, '温度 T（K）', 'temperature T (K)'),
    markers: [
      { x: 1e-32, label: L(lang, '暴胀结束', 'end of inflation'), color: '#ffd166' },
      { x: 1e-11, label: L(lang, '电弱', 'EW'), color: '#ffb35c' },
      { x: 2e-5, label: 'QCD', color: '#ff8c42' },
      { x: 200, label: L(lang, '核合成', 'BBN'), color: '#e84a5f' },
      { x: c.ageAtZ(1090) * GYR_S, label: L(lang, '复合', 'recombination'), color: '#ff9f68' },
      { x: c.age0 * GYR_S, label: L(lang, '现在', 'now'), color: 'rgba(110,231,255,0.7)' },
    ],
    legend: 'tr',
    note: L(
      lang,
      '辐射时期 T ∝ t^(−1/2)，曲线上的小台阶来自粒子湮灭时有效自由度 g* 的变化；暴胀期间等离子体“超冷”，结束后再加热。',
      'In the radiation era T ∝ t^(−1/2); small steps mark annihilations as the effective degrees of freedom g* change. The plasma supercools during inflation and reheats afterwards.',
    ),
  };
}

export function sfrChart(c: Cosmology, lang: Lang): ChartSpec {
  const zs: number[] = [];
  for (let z = 0; z <= 15; z += 0.05) zs.push(z);
  const rho0 = stellarMassDensity(c, 0);
  return {
    series: [
      { label: L(lang, '恒星形成率密度 ψ(z)', 'SFR density ψ(z)'), color: '#ffcf7d', x: zs, y: zs.map(starFormationRateDensity), width: 2.2 },
      { label: L(lang, '累计恒星质量（今天 = 0.1）', 'stellar mass formed (today = 0.1)'), color: '#a78bfa', x: zs, y: zs.map((z) => (0.1 * stellarMassDensity(c, z)) / rho0), dash: [5, 4] },
    ],
    yLog: true,
    yDomain: [1e-5, 0.3],
    xLabel: L(lang, '红移 z', 'redshift z'),
    yLabel: 'M☉ / yr / Mpc³',
    markers: [{ x: 1.86, label: L(lang, '宇宙正午', 'cosmic noon'), color: '#ffcf7d' }],
    legend: 'tr',
    note: L(lang, 'Madau & Dickinson (2014) 拟合：恒星形成在 z ≈ 2 达到峰值，今天的恒星形成率只有当时的约十分之一。', 'Madau & Dickinson (2014): star formation peaked near z ≈ 2; today’s rate is about ten times lower.'),
  };
}
