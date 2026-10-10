import { GYR_S, G_SI, PLANCK_TIME_S, YEAR_S } from './constants';
import type { Cosmology, DensityFractions } from './cosmology';
import type { IonizationHistory } from './recombination';

export interface Bilingual {
  zh: string;
  en: string;
}

const MEV_K = 1.160452e10;
/** Before this time the thermal history uses the relativistic-plasma formulae with g*(T). */
const EARLY_SWITCH_S = 1e4;
const INFLATION_START_S = 1e-36;
const INFLATION_END_S = 1e-32;
const INFLATION_EFOLDS = 60;

/** Effective relativistic degrees of freedom for energy density (Standard Model), T in MeV. */
export function gStar(TMeV: number): number {
  if (TMeV > 173_000) return 106.75;
  if (TMeV > 80_000) return 96.25;
  if (TMeV > 4_200) return 86.25;
  if (TMeV > 1_300) return 75.75;
  if (TMeV > 150) return 61.75;
  if (TMeV > 100) return 17.25;
  if (TMeV > 0.5) return 10.75;
  if (TMeV > 0.02) {
    const f = Math.log(TMeV / 0.02) / Math.log(0.5 / 0.02);
    return 3.36 + (10.75 - 3.36) * f;
  }
  return 3.36;
}

function gStarS(TMeV: number): number {
  if (TMeV > 0.5) return gStar(TMeV);
  if (TMeV > 0.02) {
    const f = Math.log(TMeV / 0.02) / Math.log(0.5 / 0.02);
    return 3.91 + (10.75 - 3.91) * f;
  }
  return 3.91;
}

/** Radiation-era temperature (MeV) at time t (s): t = 2.42 g*^-1/2 (T/MeV)^-2 s. */
function radiationTemperatureMeV(tSec: number): number {
  let T = 1.556 * Math.pow(10.75, -0.25) / Math.sqrt(tSec);
  for (let i = 0; i < 8; i++) T = (1.556 * Math.pow(gStar(T), -0.25)) / Math.sqrt(tSec);
  return T;
}

export interface ThermalState {
  tSec: number;
  a: number;
  z: number;
  /** Photon temperature, K. */
  T: number;
  /** Hubble rate, 1/s. */
  H: number;
  /** Total energy density divided by c², kg/m³. */
  rho: number;
  gStar: number;
  omegas: DensityFractions;
  /** Whether the scale factor is inflating at this moment. */
  inflating: boolean;
}

/** Physical state of the universe at cosmic time t (seconds after the Big Bang). */
export function thermalState(cosmo: Cosmology, tSec: number): ThermalState {
  const rad: DensityFractions = { r: 1, m: 0, de: 0, k: 0 };
  if (tSec < EARLY_SWITCH_S) {
    const Tend = radiationTemperatureMeV(INFLATION_END_S);
    const aOf = (TMeV: number) => ((cosmo.p.Tcmb / (TMeV * MEV_K)) * Math.cbrt(3.91 / gStarS(TMeV)));
    if (tSec < INFLATION_END_S) {
      const aEnd = aOf(Tend);
      const Hinf = INFLATION_EFOLDS / (INFLATION_END_S - INFLATION_START_S);
      const inflating = tSec >= INFLATION_START_S;
      const a = inflating
        ? aEnd * Math.exp(-Hinf * (INFLATION_END_S - tSec))
        : aEnd * Math.exp(-INFLATION_EFOLDS) * Math.sqrt(tSec / INFLATION_START_S);
      // Before inflation: hot pre-inflationary state; during inflation the plasma supercools.
      const TMeV = inflating ? Tend * Math.exp(-Hinf * (tSec - INFLATION_START_S)) : radiationTemperatureMeV(tSec);
      const H = inflating ? Hinf : 1 / (2 * tSec);
      return {
        tSec,
        a,
        z: 1 / a - 1,
        T: TMeV * MEV_K,
        H,
        rho: (3 * H * H) / (8 * Math.PI * G_SI),
        gStar: 106.75,
        omegas: inflating ? { r: 0, m: 0, de: 1, k: 0 } : rad,
        inflating,
      };
    }
    const TMeV = radiationTemperatureMeV(tSec);
    const a = aOf(TMeV);
    const H = 1 / (2 * tSec);
    return {
      tSec,
      a,
      z: 1 / a - 1,
      T: TMeV * MEV_K,
      H,
      rho: (3 * H * H) / (8 * Math.PI * G_SI),
      gStar: gStar(TMeV),
      omegas: rad,
      inflating: false,
    };
  }
  const a = cosmo.aAtAge(tSec / GYR_S);
  const H = cosmo.H0SI * cosmo.E(a);
  return {
    tSec,
    a,
    z: 1 / a - 1,
    T: cosmo.temperature(a),
    H,
    rho: (3 * H * H) / (8 * Math.PI * G_SI),
    gStar: 3.36,
    omegas: cosmo.omegas(a),
    inflating: false,
  };
}

/** Madau & Dickinson (2014) cosmic star-formation-rate density, M☉ / yr / Mpc³. */
export function starFormationRateDensity(z: number): number {
  return (0.015 * Math.pow(1 + z, 2.7)) / (1 + Math.pow((1 + z) / 2.9, 5.6));
}

/** Stellar mass density (M☉/Mpc³) formed by redshift z, with a 27 % return fraction. */
export function stellarMassDensity(cosmo: Cosmology, z: number): number {
  const zMax = 30;
  if (z >= zMax) return 0;
  const n = 400;
  const l0 = Math.log1p(z);
  const l1 = Math.log1p(zMax);
  const dl = (l1 - l0) / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const zz = Math.expm1(l0 + i * dl);
    // dt/dln(1+z) = 1/H(z) in years
    const dt = 1 / (cosmo.H0SI * cosmo.E(1 / (1 + zz))) / YEAR_S;
    sum += (i === 0 || i === n ? 0.5 : 1) * starFormationRateDensity(zz) * dt;
  }
  return 0.73 * sum * dl;
}

export interface Epoch {
  id: string;
  name: Bilingual;
  /** log10 of start / end time in seconds. */
  start: number;
  end: number;
  color: string;
  summary: Bilingual;
}

export interface CosmicEvent {
  id: string;
  name: Bilingual;
  /** log10 time in seconds. */
  logT: number;
  desc: Bilingual;
  /** Also mark on the redshift axis. */
  z?: number;
}

const log = Math.log10;
const yr = (years: number) => log(years * YEAR_S);

export interface Timeline {
  epochs: Epoch[];
  events: CosmicEvent[];
  /** log10 seconds where the timeline ends (heat death, crunch or rip). */
  end: number;
  /** log10 seconds of "now". */
  now: number;
}

/** Builds the epochs and milestones of cosmic history for a given cosmology. */
export function buildTimeline(cosmo: Cosmology, hist?: IonizationHistory): Timeline {
  const tz = (z: number) => log(cosmo.ageAtZ(z) * GYR_S);
  const now = log(cosmo.age0 * GYR_S);
  const zStar = hist?.zStar ?? 1090;
  const zRe = hist?.zReion ?? 7.7;
  const fate = cosmo.fate;
  const end =
    fate.kind === 'crunch' ? log(fate.tCrunchGyr * GYR_S) : fate.kind === 'rip' ? log(fate.tRipGyr * GYR_S) : yr(1e110);
  const aDE = cosmo.aMatterDE;
  const tDE = aDE && aDE < 1 ? log(cosmo.ageAtA(aDE) * GYR_S) : Math.min(now, tz(0.3));
  const tRecStart = tz(1400);
  const tRecEnd = tz(1000);

  const epochs: Epoch[] = [
    {
      id: 'planck',
      name: { zh: '普朗克时期', en: 'Planck epoch' },
      start: -46,
      end: log(PLANCK_TIME_S),
      color: '#ffffff',
      summary: {
        zh: '已知物理定律在此失效。四种基本力可能统一为一种，时空本身或许呈“量子泡沫”状。温度高于 10³² K，需要量子引力理论才能描述。',
        en: 'Known physics breaks down. All four forces may have been unified and spacetime itself was probably a “quantum foam”. Above 10³² K, only a theory of quantum gravity could describe it.',
      },
    },
    {
      id: 'gut',
      name: { zh: '大统一时期', en: 'Grand-unification epoch' },
      start: log(PLANCK_TIME_S),
      end: log(INFLATION_START_S),
      color: '#fff3c4',
      summary: {
        zh: '引力率先分离，强力、弱力与电磁力仍然统一为“大统一力”。宇宙是能量极高的均匀等离子体。',
        en: 'Gravity separates first while the strong, weak and electromagnetic forces remain unified. The universe is an extremely energetic, uniform plasma.',
      },
    },
    {
      id: 'inflation',
      name: { zh: '暴胀时期', en: 'Cosmic inflation' },
      start: log(INFLATION_START_S),
      end: log(INFLATION_END_S),
      color: '#ffd166',
      summary: {
        zh: '空间在约 10⁻³² 秒内指数膨胀至少 e⁶⁰ ≈ 10²⁶ 倍，抹平了空间曲率，并把微小的量子涨落拉伸成日后所有星系和星系团的“种子”。',
        en: 'Space expands exponentially by at least e⁶⁰ ≈ 10²⁶ in ~10⁻³² s, flattening curvature and stretching quantum fluctuations into the seeds of every future galaxy and cluster.',
      },
    },
    {
      id: 'electroweak',
      name: { zh: '电弱时期', en: 'Electroweak epoch' },
      start: log(INFLATION_END_S),
      end: -12,
      color: '#ffb35c',
      summary: {
        zh: '暴胀结束后的“再加热”把暴胀场的能量转化为炽热的粒子汤。强力已分离，电磁力与弱力仍统一，W、Z 与希格斯玻色子大量存在。',
        en: 'Reheating converts the inflaton’s energy into a hot particle soup. The strong force has split off; electromagnetism and the weak force are still unified, with abundant W, Z and Higgs bosons.',
      },
    },
    {
      id: 'quark',
      name: { zh: '夸克时期', en: 'Quark epoch' },
      start: -12,
      end: log(2e-5),
      color: '#ff8c42',
      summary: {
        zh: '温度降到约 160 GeV，希格斯机制使电弱对称性破缺，粒子获得质量。宇宙充满夸克—胶子等离子体，夸克还无法结合成质子和中子。',
        en: 'At ~160 GeV the Higgs mechanism breaks electroweak symmetry and particles acquire mass. The universe is a quark–gluon plasma; quarks cannot yet bind into protons and neutrons.',
      },
    },
    {
      id: 'hadron',
      name: { zh: '强子时期', en: 'Hadron epoch' },
      start: log(2e-5),
      end: 0,
      color: '#ff6b35',
      summary: {
        zh: '约 150 MeV（≈2 万亿 K）时夸克被禁闭成质子、中子等强子。正反物质大规模湮灭，只留下约十亿分之一的多余物质——构成了今天的一切。',
        en: 'At ~150 MeV (≈2×10¹² K) quarks are confined into hadrons. Matter and antimatter annihilate, leaving a one-in-a-billion excess of matter that makes up everything today.',
      },
    },
    {
      id: 'lepton',
      name: { zh: '轻子时期', en: 'Lepton epoch' },
      start: 0,
      end: 1,
      color: '#f25f5c',
      summary: {
        zh: '约 1 秒时中微子退耦，形成至今仍弥漫宇宙的宇宙中微子背景（今天约 1.95 K）。随后电子与正电子湮灭，把能量交给光子。',
        en: 'Neutrinos decouple at ~1 s, forming the cosmic neutrino background (≈1.95 K today). Electron–positron pairs then annihilate, heating the photons.',
      },
    },
    {
      id: 'bbn',
      name: { zh: '太初核合成', en: 'Big Bang nucleosynthesis' },
      start: 1,
      end: log(1200),
      color: '#e84a5f',
      summary: {
        zh: '质子与中子聚变出氦-4（约占重子质量 25%）、氘、氦-3 和微量锂-7。理论预言的丰度与观测高度吻合，是大爆炸理论的重要支柱。',
        en: 'Protons and neutrons fuse into helium-4 (~25 % of baryon mass), deuterium, helium-3 and traces of lithium-7. The predicted abundances match observations remarkably well.',
      },
    },
    {
      id: 'photon',
      name: { zh: '光子时期', en: 'Photon epoch' },
      start: log(1200),
      end: tRecStart,
      color: '#c94b7c',
      summary: {
        zh: '宇宙是不透明的等离子体：光子被自由电子反复散射，无法自由传播。约 5 万年时物质密度首次超过辐射，结构开始更快地增长。',
        en: 'The universe is an opaque plasma: photons scatter endlessly off free electrons. Around 50 000 years matter overtakes radiation and structure begins to grow faster.',
      },
    },
    {
      id: 'recombination',
      name: { zh: '复合与退耦', en: 'Recombination & decoupling' },
      start: tRecStart,
      end: tRecEnd,
      color: '#ff9f68',
      summary: {
        zh: '温度降到约 3000 K，电子与原子核结合成中性氢原子，光子从此可以自由穿行——这束“第一缕光”就是今天的宇宙微波背景辐射。',
        en: 'At ~3000 K electrons combine with nuclei into neutral hydrogen and photons stream freely for the first time — this “first light” is the cosmic microwave background.',
      },
    },
    {
      id: 'darkages',
      name: { zh: '黑暗时代', en: 'Dark Ages' },
      start: tRecEnd,
      end: tz(30),
      color: '#3a3f58',
      summary: {
        zh: '宇宙透明却一片黑暗：背景光红移到红外，还没有任何恒星。暗物质在引力作用下逐渐聚集成团，为星系形成搭好“脚手架”。',
        en: 'Transparent but dark: the background glow has redshifted into the infrared and no stars exist yet. Dark matter slowly clumps under gravity, building the scaffolding for galaxies.',
      },
    },
    {
      id: 'dawn',
      name: { zh: '宇宙黎明', en: 'Cosmic Dawn' },
      start: tz(30),
      end: tz(15),
      color: '#5e60ce',
      summary: {
        zh: '第一代恒星（星族 III）在暗物质晕中点亮，质量可达太阳的数百倍，寿命极短，以超新星爆发播撒出第一批重元素。',
        en: 'The first (Population III) stars ignite inside dark-matter haloes. Hundreds of times the Sun’s mass and short-lived, they seed the cosmos with the first heavy elements.',
      },
    },
    {
      id: 'reionization',
      name: { zh: '再电离时期', en: 'Epoch of Reionization' },
      start: tz(15),
      end: tz(5.5),
      color: '#4ea8de',
      summary: {
        zh: '早期星系和类星体发出的紫外线把星系际氢重新电离，电离“气泡”不断扩大并连通，约在 z≈6（宇宙约 10 亿岁）时完成。',
        en: 'Ultraviolet light from early galaxies and quasars re-ionizes intergalactic hydrogen; ionized bubbles grow and merge until the process completes near z ≈ 6 (≈1 billion years).',
      },
    },
    {
      id: 'galaxies',
      name: { zh: '星系时代', en: 'Age of galaxies' },
      start: tz(5.5),
      end: tDE,
      color: '#48bfe3',
      summary: {
        zh: '星系通过吸积气体与相互并合不断成长。恒星形成率在 z≈2（宇宙约 35 亿岁）达到峰值，即“宇宙正午”，此后逐渐下降。',
        en: 'Galaxies grow through gas accretion and mergers. Star formation peaks near z ≈ 2 (≈3.5 billion years) — “cosmic noon” — and declines afterwards.',
      },
    },
    {
      id: 'darkenergy',
      name: { zh: '暗能量时代', en: 'Dark-energy era' },
      start: tDE,
      end: Math.max(now, tDE + 0.01),
      color: '#64dfdf',
      summary: {
        zh: '暗能量密度超过物质，宇宙进入加速膨胀阶段，大尺度结构的增长逐渐停滞。约 46 亿年前太阳系诞生，生命在地球上出现。',
        en: 'Dark energy overtakes matter and the expansion accelerates, gradually freezing the growth of large-scale structure. The Solar System forms 4.6 billion years ago and life appears on Earth.',
      },
    },
  ];

  const events: CosmicEvent[] = [
    {
      id: 'planck-time',
      name: { zh: '普朗克时间', en: 'Planck time' },
      logT: log(PLANCK_TIME_S),
      desc: { zh: '5.39×10⁻⁴⁴ 秒，有意义的最短时间尺度。', en: '5.39×10⁻⁴⁴ s, the shortest meaningful time scale.' },
    },
    {
      id: 'inflation-end',
      name: { zh: '暴胀结束 · 再加热', en: 'End of inflation · reheating' },
      logT: log(INFLATION_END_S),
      desc: { zh: '暴胀场衰变为标准模型粒子，“热大爆炸”由此开始。', en: 'The inflaton decays into Standard-Model particles: the hot Big Bang begins.' },
    },
    {
      id: 'ew-breaking',
      name: { zh: '电弱对称性破缺', en: 'Electroweak symmetry breaking' },
      logT: -11.5,
      desc: { zh: '希格斯场获得真空期望值，W/Z 玻色子与费米子获得质量。', en: 'The Higgs field acquires a vacuum expectation value; W/Z bosons and fermions gain mass.' },
    },
    {
      id: 'qcd',
      name: { zh: '夸克禁闭（QCD 相变）', en: 'Quark confinement (QCD transition)' },
      logT: log(2e-5),
      desc: { zh: '夸克—胶子等离子体冷凝为质子和中子。', en: 'The quark–gluon plasma condenses into protons and neutrons.' },
    },
    {
      id: 'nu-decoupling',
      name: { zh: '中微子退耦', en: 'Neutrino decoupling' },
      logT: 0,
      desc: { zh: '中微子停止与物质相互作用，形成宇宙中微子背景。', en: 'Neutrinos stop interacting, forming the cosmic neutrino background.' },
    },
    {
      id: 'bbn-peak',
      name: { zh: '氘瓶颈打破 · 氦合成', en: 'Deuterium bottleneck broken · helium forms' },
      logT: log(200),
      desc: { zh: '约 3 分钟后，几乎所有中子被锁进氦-4 原子核。', en: 'After about 3 minutes nearly all neutrons are locked into helium-4 nuclei.' },
    },
    {
      id: 'equality',
      name: { zh: '物质—辐射相等', en: 'Matter–radiation equality' },
      logT: tz(cosmo.zEq),
      z: cosmo.zEq,
      desc: { zh: '物质能量密度从此超过辐射，暗物质结构开始高效增长。', en: 'Matter now outweighs radiation and dark-matter structures start growing efficiently.' },
    },
    {
      id: 'cmb',
      name: { zh: '最后散射 · CMB 释放', en: 'Last scattering · CMB released' },
      logT: tz(zStar),
      z: zStar,
      desc: { zh: '光子与物质退耦，宇宙微波背景辐射形成，此刻宇宙约 38 万岁。', en: 'Photons decouple from matter, releasing the cosmic microwave background at ~380 000 years.' },
    },
    {
      id: 'first-stars',
      name: { zh: '第一代恒星点亮', en: 'First stars ignite' },
      logT: tz(25),
      z: 25,
      desc: { zh: '星族 III 恒星在约 1 亿年时出现，结束黑暗时代。', en: 'Population III stars appear around 100 million years, ending the Dark Ages.' },
    },
    {
      id: 'jwst',
      name: { zh: 'JWST 观测到的最远星系', en: 'Most distant galaxy seen by JWST' },
      logT: tz(14.44),
      z: 14.44,
      desc: { zh: 'MoM-z14（z≈14.4），宇宙仅约 2.8 亿岁时的星系。', en: 'MoM-z14 (z ≈ 14.4), a galaxy seen when the universe was ~280 million years old.' },
    },
    {
      id: 'reion-mid',
      name: { zh: '再电离中点', en: 'Reionization midpoint' },
      logT: tz(zRe),
      z: zRe,
      desc: { zh: '由 CMB 光深 τ 推算：此时一半的星系际氢已被电离。', en: 'Inferred from the CMB optical depth τ: half of the intergalactic hydrogen is ionized.' },
    },
    {
      id: 'cosmic-noon',
      name: { zh: '宇宙正午（恒星形成高峰）', en: 'Cosmic noon (peak star formation)' },
      logT: tz(1.86),
      z: 1.86,
      desc: { zh: '恒星形成率密度达到峰值，约为今天的 10 倍。', en: 'The star-formation rate density peaks at roughly ten times today’s value.' },
    },
  ];
  const aAcc = cosmo.aAcceleration;
  if (aAcc && aAcc < 1) {
    events.push({
      id: 'acceleration',
      name: { zh: '宇宙开始加速膨胀', en: 'Expansion starts accelerating' },
      logT: log(cosmo.ageAtA(aAcc) * GYR_S),
      z: 1 / aAcc - 1,
      desc: { zh: '减速参数 q 变为负值，暗能量的排斥效应胜过物质引力。', en: 'The deceleration parameter turns negative: dark energy’s repulsion beats matter’s gravity.' },
    });
  }
  const tNowYr = cosmo.age0 * 1e9;
  events.push(
    {
      id: 'solar-system',
      name: { zh: '太阳系形成', en: 'Solar System forms' },
      logT: yr(tNowYr - 4.567e9),
      desc: { zh: '约 45.67 亿年前，分子云坍缩形成太阳与行星。', en: 'About 4.567 billion years ago a molecular cloud collapses into the Sun and planets.' },
    },
    {
      id: 'life',
      name: { zh: '地球上出现生命', en: 'Life appears on Earth' },
      logT: yr(tNowYr - 3.8e9),
      desc: { zh: '最早的生命证据可追溯到约 38 亿年前。', en: 'The earliest evidence of life dates back about 3.8 billion years.' },
    },
    {
      id: 'now',
      name: { zh: '现在', en: 'Today' },
      logT: now,
      z: 0,
      desc: { zh: '宇宙年龄约 138 亿年，CMB 温度 2.7255 K。', en: 'The universe is ~13.8 billion years old; the CMB is at 2.7255 K.' },
    },
  );

  if (fate.kind === 'freeze') {
    epochs.push(
      {
        id: 'stelliferous',
        name: { zh: '恒星时代（未来）', en: 'Stelliferous era (future)' },
        start: now,
        end: yr(1e14),
        color: '#80ffdb',
        summary: {
          zh: '银河系与仙女座星系可能在数十亿年后合并；本星系群之外的星系将逐渐越过宇宙视界而不可见；气体耗尽后，恒星形成在约 100 万亿年后停止。',
          en: 'The Milky Way may merge with Andromeda in a few billion years; galaxies beyond the Local Group slip over the cosmic horizon; once gas runs out star formation stops after ~100 trillion years.',
        },
      },
      {
        id: 'degenerate',
        name: { zh: '简并时代', en: 'Degenerate era' },
        start: yr(1e14),
        end: yr(1e40),
        color: '#9d8df1',
        summary: {
          zh: '只剩白矮星、中子星、褐矮星和黑洞等致密残骸。若质子会衰变，普通物质将在这一时期逐渐消散。',
          en: 'Only compact remnants remain — white dwarfs, neutron stars, brown dwarfs and black holes. If protons decay, ordinary matter dissolves during this era.',
        },
      },
      {
        id: 'blackhole',
        name: { zh: '黑洞时代', en: 'Black-hole era' },
        start: yr(1e40),
        end: yr(1e100),
        color: '#6c5b7b',
        summary: {
          zh: '黑洞成为仅存的大型天体，并通过霍金辐射极其缓慢地蒸发，最大的超大质量黑洞约需 10¹⁰⁰ 年。',
          en: 'Black holes are the last large objects, evaporating extremely slowly through Hawking radiation — up to ~10¹⁰⁰ years for the largest.',
        },
      },
      {
        id: 'heatdeath',
        name: { zh: '热寂', en: 'Heat death' },
        start: yr(1e100),
        end,
        color: '#2b2d42',
        summary: {
          zh: '宇宙只剩下极其稀薄的光子、中微子与基本粒子，温度无限接近绝对零度，不再有任何可利用的能量差——这就是“热寂”。',
          en: 'Only an ultra-dilute gas of photons, neutrinos and elementary particles remains, approaching absolute zero with no usable energy gradients left: the heat death.',
        },
      },
    );
    events.push(
      {
        id: 'andromeda',
        name: { zh: '银河系与仙女座星系相遇', en: 'Milky Way meets Andromeda' },
        logT: yr(tNowYr + 4.5e9),
        desc: { zh: '两大星系可能在数十亿年后碰撞并最终合并为一个椭圆星系（概率约一半）。', en: 'The two galaxies may collide in several billion years and eventually merge into an elliptical (roughly 50 % odds).' },
      },
      {
        id: 'red-giant',
        name: { zh: '太阳膨胀为红巨星', en: 'Sun becomes a red giant' },
        logT: yr(tNowYr + 5.4e9),
        desc: { zh: '太阳耗尽核心氢，外层膨胀到吞没水星和金星。', en: 'The Sun exhausts its core hydrogen and swells to engulf Mercury and Venus.' },
      },
      {
        id: 'horizon-isolation',
        name: { zh: '本星系群之外的星系不可见', en: 'Galaxies beyond the Local Group vanish' },
        logT: yr(1.5e11),
        desc: { zh: '加速膨胀使所有未受引力束缚的星系退出可观测范围。', en: 'Accelerated expansion carries every unbound galaxy beyond our observable reach.' },
      },
      {
        id: 'last-stars',
        name: { zh: '最后的恒星熄灭', en: 'Last stars fade' },
        logT: yr(1e14),
        desc: { zh: '寿命最长的红矮星耗尽燃料，宇宙变暗。', en: 'The longest-lived red dwarfs burn out and the universe goes dark.' },
      },
      {
        id: 'bh-evaporate',
        name: { zh: '超大质量黑洞蒸发', en: 'Supermassive black holes evaporate' },
        logT: yr(1e100),
        desc: { zh: '最后的黑洞通过霍金辐射消失。', en: 'The last black holes disappear via Hawking radiation.' },
      },
    );
  } else if (fate.kind === 'crunch') {
    epochs.push(
      {
        id: 'expansion-future',
        name: { zh: '减速膨胀（未来）', en: 'Decelerating expansion (future)' },
        start: now,
        end: log(fate.tMaxGyr * GYR_S),
        color: '#80ffdb',
        summary: {
          zh: '物质的引力逐渐刹住膨胀，宇宙将达到最大尺度。',
          en: 'Gravity gradually brakes the expansion until the universe reaches its maximum size.',
        },
      },
      {
        id: 'contraction',
        name: { zh: '收缩时代', en: 'Contraction' },
        start: log(fate.tMaxGyr * GYR_S),
        end,
        color: '#ef476f',
        summary: {
          zh: '宇宙开始收缩，星系蓝移并彼此靠近，背景辐射温度不断升高，最终在“大挤压”中回到极高温高密度状态。',
          en: 'The universe contracts: galaxies blueshift and approach, the background radiation heats up, and everything ends in a hot, dense Big Crunch.',
        },
      },
    );
    events.push({
      id: 'crunch',
      name: { zh: '大挤压', en: 'Big Crunch' },
      logT: end,
      desc: { zh: '尺度因子回到零，宇宙终结。', en: 'The scale factor returns to zero and the universe ends.' },
    });
  } else if (fate.kind === 'rip') {
    const w = cosmo.p.w0;
    const k = Math.sqrt(2 * Math.abs(1 + 3 * w)) / (6 * Math.PI * Math.abs(1 + w));
    const tRipYr = fate.tRipGyr * 1e9;
    const before = (periodYr: number) => yr(Math.max(tRipYr - k * periodYr, tNowYr * 1.0001));
    epochs.push({
      id: 'rip-era',
      name: { zh: '幻影能量主导', en: 'Phantom-energy domination' },
      start: now,
      end,
      color: '#ff006e',
      summary: {
        zh: '暗能量密度随膨胀不断增大（w < −1），膨胀率在有限时间内发散，最终把一切束缚结构依次撕碎——“大撕裂”。',
        en: 'Dark-energy density grows as space expands (w < −1); the expansion rate diverges in finite time, tearing apart every bound structure in turn — the Big Rip.',
      },
    });
    events.push(
      {
        id: 'rip-clusters',
        name: { zh: '星系团瓦解', en: 'Galaxy clusters unbound' },
        logT: before(5e9),
        desc: { zh: '最大的引力束缚结构首先被撕开。', en: 'The largest bound structures are torn apart first.' },
      },
      {
        id: 'rip-galaxy',
        name: { zh: '银河系被撕裂', en: 'Milky Way torn apart' },
        logT: before(2.25e8),
        desc: { zh: '恒星不再受星系引力束缚。', en: 'Stars are no longer bound to the Galaxy.' },
      },
      {
        id: 'rip-solar',
        name: { zh: '太阳系瓦解', en: 'Solar System unbound' },
        logT: before(1),
        desc: { zh: '行星脱离太阳的引力束缚。', en: 'Planets escape the Sun’s gravity.' },
      },
      {
        id: 'rip',
        name: { zh: '大撕裂', en: 'Big Rip' },
        logT: end,
        desc: { zh: '连原子与原子核也被撕碎，时空本身走向奇点。', en: 'Even atoms and nuclei are torn apart as spacetime reaches a singularity.' },
      },
    );
  }

  return {
    epochs: epochs.filter((e) => e.end > e.start && e.start < end),
    events: events.filter((e) => e.logT <= end + 1e-9).sort((a, b) => a.logT - b.logT),
    end,
    now,
  };
}

export function epochAt(timeline: Timeline, logT: number): Epoch {
  for (const e of timeline.epochs) if (logT >= e.start && logT <= e.end) return e;
  return logT < timeline.epochs[0].start ? timeline.epochs[0] : timeline.epochs[timeline.epochs.length - 1];
}
