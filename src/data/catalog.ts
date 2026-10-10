import { AU_M, KLY_M, LY_M, MLY_M, MPC_M, SOLAR_RADIUS_M } from '../physics/constants';
import {
  galacticToWorld,
  galaxyDiscNormal,
  galLBToWorld,
  parseDec,
  parseRA,
  raDecToWorld,
  scale,
  supergalacticToGalactic,
  type Vec3,
} from '../physics/coords';
import type { Cosmology } from '../physics/cosmology';
import { LOCAL_GROUP, NOTABLE_GALAXIES, type GalaxyData } from './galaxies';
import { PROBES, SOLAR_BODIES, SOLAR_REGIONS } from './solarSystem';
import { STARS, spectralColor } from './stars';
import { STRUCTURES } from './structures';
import type { Bilingual, CatalogObject, Fact } from './types';

/** Galactocentric distance of the Sun (GRAVITY 2019), light-years. */
export const R0_LY = 26_670;
/** Height of the Sun above the Galactic mid-plane, light-years. */
export const Z_SUN_LY = 68;

export const ECLIPTIC_UP: Vec3 = [0, 1, 0];
export const GALACTIC_UP: Vec3 = galacticToWorld([0, 0, 1]);
export const SUPERGALACTIC_UP: Vec3 = galacticToWorld(supergalacticToGalactic([0, 0, 1]));
/** The Galactic mid-plane lies Z_SUN below the Sun, so the centre sits slightly south of b = 0. */
export const GALACTIC_CENTER: Vec3 = scale(galacticToWorld([R0_LY, 0, -Z_SUN_LY]), LY_M);

const fact = (zh: string, en: string, value: string | Bilingual): Fact => ({ label: { zh, en }, value });

function fmtNum(x: number, digits = 3): string {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-2) {
    const e = Math.floor(Math.log10(a));
    const m = x / 10 ** e;
    return `${m.toFixed(2)}×10${superscript(e)}`;
  }
  return Number(x.toPrecision(digits)).toLocaleString('en-US');
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const superscript = (n: number): string => String(n).split('').map((c) => SUP[c] ?? c).join('');

/** Human-friendly bilingual distance in light-years. */
export function lyText(ly: number): Bilingual {
  if (ly < 0.1) return { zh: `${fmtNum(ly * 63241.1)} 天文单位`, en: `${fmtNum(ly * 63241.1)} au` };
  if (ly < 1e4) return { zh: `${fmtNum(ly)} 光年`, en: `${fmtNum(ly)} ly` };
  if (ly < 1e8) return { zh: `${fmtNum(ly / 1e4)} 万光年`, en: `${fmtNum(ly / 1e6)} million ly` };
  return { zh: `${fmtNum(ly / 1e8)} 亿光年`, en: `${fmtNum(ly / 1e9)} billion ly` };
}

export interface Catalog {
  objects: CatalogObject[];
  byId: Map<string, CatalogObject>;
}

function galaxyObject(g: GalaxyData, cosmo: Cosmology, group: CatalogObject['group']): CatalogObject {
  const ra = parseRA(g.ra);
  const dec = parseDec(g.dec);
  const dir = raDecToWorld(ra, dec);
  const distM = g.z !== undefined ? cosmo.comovingDistance(g.z) * MPC_M : (g.distKly ?? 0) * KLY_M;
  const radius = (g.diameterKly / 2) * KLY_M;
  const isSpiral = g.model === 'spiral' || g.model === 'barred';
  const up = isSpiral && g.incl !== undefined && g.pa !== undefined ? galaxyDiscNormal(ra, dec, g.incl, g.pa) : GALACTIC_UP;
  const big = g.diameterKly > 25;
  const facts: Fact[] = [
    fact('距离', 'Distance', lyText(distM / LY_M)),
    fact('类型', 'Type', g.type),
    fact('直径', 'Diameter', lyText(g.diameterKly * 1000)),
  ];
  if (g.z !== undefined) {
    facts.push(fact('红移', 'Redshift', `z = ${g.z}`));
    facts.push(fact('光行时间', 'Light-travel time', { zh: `${(cosmo.lookbackTime(g.z) * 10).toFixed(1)} 亿年`, en: `${cosmo.lookbackTime(g.z).toFixed(2)} billion years` }));
  }
  facts.push(fact('赤经 / 赤纬', 'RA / Dec', `${g.ra} / ${g.dec}`));
  return {
    id: g.id,
    name: g.name,
    kind: g.kind ?? 'galaxy',
    group,
    position: scale(dir, distM),
    radius,
    distance: distM,
    z: g.z,
    desc: g.desc ?? {
      zh: `${g.name.zh}是一个${g.type}型星系，距离我们约${lyText(distM / LY_M).zh}。`,
      en: `${g.name.en} is a ${g.type} galaxy about ${lyText(distM / LY_M).en} away.`,
    },
    facts,
    labelMaxDist: g.z !== undefined ? 9e26 : group === 'local-group' ? (big ? 4e23 : 4e22) : 4e24,
    labelMinView: g.z !== undefined ? 5e24 : group === 'local-group' ? 2e20 : 5e21,
    priority: g.z !== undefined ? 3 : big ? 6 : 3,
    up,
    viewDistance: Math.max(radius * 3.2, 2e20),
    color: g.kind === 'quasar' ? '#9fd8ff' : '#ffe2b8',
  };
}

/** Builds the full object catalogue; distances of redshift-defined objects follow `cosmo`. */
export function buildCatalog(cosmo: Cosmology): Catalog {
  const objects: CatalogObject[] = [];

  for (const b of SOLAR_BODIES) {
    const isMoon = b.kind === 'moon';
    const radius = b.radiusKm * 1000;
    const orbitM = b.moonOrbit ? b.moonOrbit.aKm * 1000 : b.id === 'moon' ? 3.844e8 : 0;
    objects.push({
      id: b.id,
      name: b.name,
      kind: b.kind,
      group: 'solar',
      position: [0, 0, 0],
      radius,
      distance: 0,
      desc: b.desc,
      facts: b.facts,
      labelMaxDist: b.id === 'sun' ? 3e18 : isMoon ? Math.max(orbitM * 60, radius * 400) : b.kind === 'dwarf-planet' ? 6e13 : 8e13,
      priority: b.id === 'sun' ? 10 : isMoon ? 2 : b.kind === 'planet' ? 7 : 5,
      up: ECLIPTIC_UP,
      viewDistance: radius * (b.id === 'sun' ? 6 : 4.5),
      color: b.color,
      dynamic: true,
      parent: b.parent,
    });
  }

  for (const p of PROBES) {
    objects.push({
      id: p.id,
      name: p.name,
      kind: 'probe',
      group: 'solar',
      position: [0, 0, 0],
      radius: 5,
      distance: 0,
      desc: p.desc,
      facts: [fact('发射日期', 'Launched', p.launched), fact('飞离速度', 'Outbound speed', `${(p.speed * 4.74).toFixed(1)} km/s`)],
      labelMaxDist: 6e13,
      labelMinView: 5e11,
      priority: 4,
      up: ECLIPTIC_UP,
      viewDistance: 3e12,
      color: '#9effc8',
      dynamic: true,
    });
  }

  for (const r of SOLAR_REGIONS) {
    const dirs: Record<string, Vec3> = {
      'asteroid-belt': [0.94, 0, -0.34],
      'kuiper-belt': [-0.5, 0, 0.87],
      heliopause: [0.6, 0.55, 0.58],
      'oort-cloud': [-0.55, 0.45, -0.7],
    };
    const rMid = r.id === 'oort-cloud' ? 30000 : (r.innerAu + r.outerAu) / 2;
    objects.push({
      id: r.id,
      name: r.name,
      kind: 'region',
      group: 'solar',
      position: scale(dirs[r.id], rMid * AU_M),
      radius: r.outerAu * AU_M,
      distance: rMid * AU_M,
      desc: r.desc,
      facts: [fact('范围', 'Extent', r.innerAu === r.outerAu ? `≈${r.innerAu} au` : `${r.innerAu.toLocaleString()}–${r.outerAu.toLocaleString()} au`)],
      labelMaxDist: r.id === 'oort-cloud' ? 2e17 : r.id === 'heliopause' ? 1e14 : r.id === 'kuiper-belt' ? 6e13 : 1.5e12,
      labelMinView: r.id === 'oort-cloud' ? 5e15 : r.id === 'heliopause' ? 6e12 : r.id === 'kuiper-belt' ? 2e12 : 2e11,
      priority: 3,
      up: ECLIPTIC_UP,
      viewDistance: r.outerAu * AU_M * 2.6,
      color: '#9fb6d8',
    });
  }

  for (const s of STARS) {
    const dir = raDecToWorld(parseRA(s.ra), parseDec(s.dec));
    const d = s.distLy * LY_M;
    const kind = s.kind ?? 'star';
    const extended = kind === 'nebula' || kind === 'star-cluster';
    const radius = extended ? ((s.sizeLy ?? 10) / 2) * LY_M : kind === 'black-hole' ? 3e4 : (s.radius ?? 1) * SOLAR_RADIUS_M;
    const facts: Fact[] = [fact('距离', 'Distance', lyText(s.distLy))];
    if (kind === 'star') {
      facts.push(fact('光谱型', 'Spectral type', s.spectral));
      facts.push(fact('视星等', 'Apparent magnitude', s.vmag.toFixed(2)));
      if (s.radius) facts.push(fact('半径', 'Radius', { zh: `${fmtNum(s.radius)} 倍太阳`, en: `${fmtNum(s.radius)} R☉` }));
    } else if (extended) {
      facts.push(fact('尺度', 'Size', lyText(s.sizeLy ?? 10)));
    }
    facts.push(fact('赤经 / 赤纬', 'RA / Dec', `${s.ra} / ${s.dec}`));
    objects.push({
      id: s.id,
      name: s.name,
      kind,
      group: s.distLy > 1000 && kind !== 'star' ? 'galaxy' : 'stars',
      position: scale(dir, d),
      radius,
      distance: d,
      desc: s.desc ?? {
        zh: `${s.name.zh}是一颗 ${s.spectral} 型恒星，距离太阳约 ${lyText(s.distLy).zh}。`,
        en: `${s.name.en} is a ${s.spectral} star about ${lyText(s.distLy).en} from the Sun.`,
      },
      facts,
      labelMaxDist: (extended || kind === 'black-hole' ? Math.max(3 * s.distLy, 3000) : 25 + 1.6 * s.distLy) * LY_M,
      labelMinView: extended || kind === 'black-hole' ? 2e17 : 4e15,
      priority: kind === 'star' ? 6 - s.vmag * 0.8 : 4,
      up: ECLIPTIC_UP,
      viewDistance: extended ? radius * 3 : kind === 'black-hole' ? 3e12 : Math.max(radius * 9, 2e10),
      color: kind === 'star' ? spectralColor(s.spectral) : kind === 'nebula' ? '#ff9ec7' : kind === 'black-hole' ? '#c9a2ff' : '#bcd6ff',
    });
  }

  const gcDist = R0_LY * LY_M;
  objects.push(
    {
      id: 'milky-way',
      name: { zh: '银河系', en: 'Milky Way' },
      kind: 'galaxy',
      group: 'galaxy',
      position: GALACTIC_CENTER,
      radius: 5e4 * LY_M,
      distance: gcDist,
      desc: {
        zh: '我们的家园星系，一个直径约 10 万光年的棒旋星系，包含 1000 亿到 4000 亿颗恒星。太阳位于猎户臂上，距银心约 2.67 万光年，以约 230 km/s 的速度绕银心运行，转一圈约需 2.3 亿年。',
        en: 'Our home galaxy, a barred spiral ~100 000 light-years across with 100–400 billion stars. The Sun sits on the Orion Arm, 26 700 light-years from the centre, orbiting at ~230 km/s once every ~230 million years.',
      },
      facts: [
        fact('类型', 'Type', 'SBbc'),
        fact('直径', 'Diameter', { zh: '约 10 万光年', en: '≈100,000 ly' }),
        fact('恒星数量', 'Stars', { zh: '1000–4000 亿', en: '100–400 billion' }),
        fact('质量', 'Mass', { zh: '约 1.5×10¹² 倍太阳质量（含暗物质）', en: '≈1.5×10¹² M☉ (incl. dark matter)' }),
        fact('太阳到银心', 'Sun to centre', { zh: '2.67 万光年', en: '26,700 ly' }),
      ],
      labelMaxDist: 6e23,
      labelMinDist: 1.4e21,
      priority: 9,
      up: GALACTIC_UP,
      viewDistance: 1.45e21,
      color: '#ffe6b0',
    },
    {
      id: 'sgr-a',
      name: { zh: '人马座 A*', en: 'Sagittarius A*' },
      kind: 'black-hole',
      group: 'galaxy',
      position: GALACTIC_CENTER,
      radius: 1.2e10,
      distance: gcDist,
      desc: {
        zh: '银河系中心的超大质量黑洞，质量约 430 万倍太阳质量。2022 年事件视界望远镜公布了它的第一张照片；2020 年诺贝尔物理学奖表彰了对它周围恒星轨道的观测。',
        en: 'The supermassive black hole at the Galaxy’s centre, ~4.3 million M☉. The Event Horizon Telescope released its first image in 2022; tracking the stars orbiting it earned the 2020 Nobel Prize in Physics.',
      },
      facts: [
        fact('质量', 'Mass', { zh: '约 430 万倍太阳质量', en: '≈4.3×10⁶ M☉' }),
        fact('史瓦西半径', 'Schwarzschild radius', { zh: '约 1270 万千米', en: '≈12.7 million km' }),
        fact('距离', 'Distance', lyText(R0_LY)),
      ],
      labelMaxDist: 2e21,
      labelMinView: 3e19,
      priority: 7,
      up: GALACTIC_UP,
      viewDistance: 2e18,
      color: '#ffb36b',
    },
  );

  objects.push({
    id: 'you-are-here',
    name: { zh: '太阳 · 你在这里', en: 'Sun · You are here' },
    kind: 'star',
    group: 'galaxy',
    position: [0, 0, 0],
    radius: 6.957e8,
    distance: 0,
    desc: {
      zh: '太阳系在银河系中的位置：猎户臂（本地臂）内，距银心约 2.67 万光年，位于银盘中央平面以北约 70 光年。',
      en: 'Where the Solar System sits in the Milky Way: inside the Orion (Local) Arm, ~26 700 ly from the centre and ~70 ly north of the mid-plane.',
    },
    facts: [fact('距银心', 'Distance to centre', lyText(R0_LY)), fact('绕银心周期', 'Galactic year', { zh: '约 2.3 亿年', en: '≈230 million years' })],
    labelMaxDist: 3e22,
    labelMinView: 3e19,
    priority: 8,
    up: GALACTIC_UP,
    viewDistance: 3e20,
    color: '#ffe27a',
  });

  for (const g of LOCAL_GROUP) objects.push(galaxyObject(g, cosmo, 'local-group'));
  for (const g of NOTABLE_GALAXIES) objects.push(galaxyObject(g, cosmo, g.z !== undefined && g.z > 0.05 ? 'deep' : 'local-universe'));

  for (const s of STRUCTURES) {
    const dir = s.ra && s.dec ? raDecToWorld(parseRA(s.ra), parseDec(s.dec)) : galLBToWorld(s.l ?? 0, s.b ?? 0);
    const distM = s.z !== undefined ? cosmo.comovingDistance(s.z) * MPC_M : (s.distMly ?? 0) * MLY_M;
    const radius = (s.sizeMly / 2) * MLY_M;
    const deep = s.z !== undefined && s.z > 0.1;
    const facts: Fact[] = [fact('距离', 'Distance', lyText(distM / LY_M)), fact('尺度', 'Size', lyText(s.sizeMly * 1e6))];
    if (s.z !== undefined) facts.push(fact('红移', 'Redshift', `z = ${s.z}`));
    objects.push({
      id: s.id,
      name: s.name,
      kind: s.kind,
      group: deep ? 'deep' : s.id === 'local-group' ? 'local-group' : 'local-universe',
      position: scale(dir, distM),
      radius,
      distance: distM,
      z: s.z,
      desc: s.desc,
      facts,
      labelMaxDist: deep ? 9e26 : s.kind === 'group' ? 6e24 : s.kind === 'cluster' ? 2e25 : 8e25,
      labelMinView: deep ? 4e24 : s.kind === 'group' ? 2e22 : s.kind === 'cluster' ? 1.5e23 : 6e23,
      priority: s.kind === 'supercluster' ? 7 : s.kind === 'cluster' ? 5 + s.richness / 40 : 4,
      up: SUPERGALACTIC_UP,
      viewDistance: Math.max(radius * 2.6, 5e22),
      color: s.kind === 'void' ? '#8f9bb3' : s.kind === 'supercluster' ? '#ffcf7d' : '#ffd9a0',
    });
  }

  const zStar = 1090;
  const rCmb = cosmo.comovingDistance(zStar) * MPC_M;
  const rObs = cosmo.particleHorizon(1) * MPC_M;
  const rEvent = cosmo.eventHorizon(1) * MPC_M;
  const rHubble = cosmo.hubbleRadius(1) * MPC_M;
  const lyG = (m: number) => lyText(m / LY_M);
  objects.push(
    {
      id: 'observable-universe',
      name: { zh: '可观测宇宙', en: 'Observable Universe' },
      kind: 'horizon',
      group: 'deep',
      position: [0, 0, 0],
      labelOffset: scale(GALACTIC_UP, rObs * 1.02),
      radius: rObs,
      distance: rObs,
      desc: {
        zh: '原则上能够观测到的全部宇宙：自大爆炸以来光所能传播到我们这里的最远距离（粒子视界），今天的共动半径约 460 亿光年。它以我们为中心，但这只是因为光速有限，并不意味着我们处于宇宙中心。',
        en: 'Everything we could ever have observed: the farthest distance light could travel to us since the Big Bang (the particle horizon), ~46 billion light-years today. We are at its centre only because light speed is finite, not because we are special.',
      },
      facts: [
        fact('共动半径', 'Comoving radius', lyG(rObs)),
        fact('直径', 'Diameter', lyG(2 * rObs)),
        fact('星系数量', 'Galaxies', { zh: '约 2000 亿–2 万亿', en: '≈200 billion – 2 trillion' }),
        fact('普通物质质量', 'Ordinary-matter mass', '≈1.5×10⁵³ kg'),
      ],
      labelMaxDist: 1e28,
      labelMinView: 2e26,
      priority: 9,
      up: GALACTIC_UP,
      viewDistance: rObs * 2.6,
      color: '#9ecbff',
    },
    {
      id: 'cmb',
      name: { zh: '宇宙微波背景（最后散射面）', en: 'Cosmic Microwave Background' },
      kind: 'cmb',
      group: 'deep',
      position: [0, 0, 0],
      labelOffset: scale(galLBToWorld(200, -30), rCmb),
      radius: rCmb,
      distance: rCmb,
      z: zStar,
      desc: {
        zh: '宇宙约 38 万岁时释放的“第一缕光”，如今已红移到微波波段，温度 2.7255 K。它构成了可观测宇宙中电磁波所能看到的最远“墙壁”，其微小的温度涨落（约十万分之一）是所有宇宙结构的种子。',
        en: 'The “first light” released when the universe was ~380 000 years old, now redshifted to microwaves at 2.7255 K. It is the farthest electromagnetic “wall” we can see; its tiny 1-in-100 000 temperature ripples seeded all cosmic structure.',
      },
      facts: [
        fact('红移', 'Redshift', `z ≈ ${zStar}`),
        fact('共动距离', 'Comoving distance', lyG(rCmb)),
        fact('温度', 'Temperature', '2.7255 K'),
        fact('涨落幅度', 'Fluctuations', '≈ 18 μK rms (ΔT/T ~ 10⁻⁵)'),
      ],
      labelMaxDist: 1e28,
      labelMinView: 2e26,
      priority: 8,
      up: GALACTIC_UP,
      viewDistance: rCmb * 2.6,
      color: '#ffb46b',
    },
  );
  if (Number.isFinite(rEvent)) {
    objects.push({
      id: 'event-horizon',
      name: { zh: '宇宙事件视界', en: 'Cosmic event horizon' },
      kind: 'horizon',
      group: 'deep',
      position: [0, 0, 0],
      labelOffset: scale(galLBToWorld(90, 20), rEvent),
      radius: rEvent,
      distance: rEvent,
      desc: {
        zh: '由于加速膨胀，今天从比这更远处发出的光将永远无法到达我们。目前我们能看到的许多遥远星系，已经越过了这道视界。',
        en: 'Because the expansion accelerates, light emitted today beyond this distance will never reach us. Many galaxies we can see have already crossed it.',
      },
      facts: [fact('共动半径', 'Comoving radius', lyG(rEvent))],
      labelMaxDist: 1e28,
      labelMinView: 1.2e26,
      priority: 6,
      up: GALACTIC_UP,
      viewDistance: rEvent * 2.6,
      color: '#ff8fab',
    });
  }
  objects.push({
    id: 'hubble-sphere',
    name: { zh: '哈勃球', en: 'Hubble sphere' },
    kind: 'horizon',
    group: 'deep',
    position: [0, 0, 0],
    labelOffset: scale(galLBToWorld(270, -20), rHubble),
    radius: rHubble,
    distance: rHubble,
    desc: {
      zh: '退行速度恰好等于光速的距离 c/H₀。球外的星系正以超过光速的速度远离我们——这并不违反相对论，因为是空间本身在膨胀。',
      en: 'The distance c/H₀ at which recession speed equals the speed of light. Galaxies beyond it recede faster than light — allowed, because it is space itself that expands.',
    },
    facts: [fact('半径', 'Radius', lyG(rHubble))],
    labelMaxDist: 1e28,
    labelMinView: 1.2e26,
    priority: 5,
    up: GALACTIC_UP,
    viewDistance: rHubble * 2.6,
    color: '#a0ffd6',
  });

  const byId = new Map(objects.map((o) => [o.id, o]));
  return { objects, byId };
}
