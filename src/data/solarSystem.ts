import type { PlanetKey } from '../physics/kepler';
import type { Bilingual, Fact } from './types';

export interface BodyAppearance {
  /** 0 sun, 1 rocky, 2 earth, 3 gas giant, 4 ice giant, 5 cloudy (Venus) */
  kind: 0 | 1 | 2 | 3 | 4 | 5;
  colors: [string, string, string];
  bands?: number;
  seed: number;
  atmosphere?: string;
  atmosphereStrength?: number;
  ring?: { inner: number; outer: number };
  spot?: boolean;
}

export interface SolarBody {
  id: string;
  name: Bilingual;
  kind: 'star' | 'planet' | 'dwarf-planet' | 'moon';
  radiusKm: number;
  orbitKey?: PlanetKey;
  parent?: string;
  moonOrbit?: { aKm: number; periodDays: number; phaseDeg: number };
  /** Sidereal rotation period in hours (negative = retrograde). */
  rotationHours: number;
  /** IAU north pole, equatorial J2000 degrees. */
  pole: { ra: number; dec: number };
  appearance: BodyAppearance;
  color: string;
  desc: Bilingual;
  facts: Fact[];
}

const f = (zh: string, en: string, value: string | Bilingual): Fact => ({ label: { zh, en }, value });
const radius = (km: string) => f('半径', 'Radius', `${km} km`);
const mass = (kg: string) => f('质量', 'Mass', `${kg} kg`);
const period = (zh: string, en: string) => f('公转周期', 'Orbital period', { zh, en });
const spin = (zh: string, en: string) => f('自转周期', 'Rotation period', { zh, en });
const moons = (n: string) => f('已知卫星', 'Known moons', n);

export const SOLAR_BODIES: SolarBody[] = [
  {
    id: 'sun',
    name: { zh: '太阳', en: 'Sun' },
    kind: 'star',
    radiusKm: 695_700,
    rotationHours: 609.12,
    pole: { ra: 286.13, dec: 63.87 },
    appearance: { kind: 0, colors: ['#fff2c6', '#ffb347', '#ff7a1a'], seed: 1 },
    color: '#ffd27a',
    desc: {
      zh: '太阳是一颗约 46 亿岁的 G2V 型主序星，占太阳系总质量的 99.86%。核心温度约 1570 万 K，每秒通过核聚变把约 400 万吨物质转化为能量，照亮并温暖着整个太阳系。',
      en: 'The Sun is a ~4.6-billion-year-old G2V main-sequence star holding 99.86 % of the Solar System’s mass. Its 15.7-million-K core converts about four million tonnes of matter into energy every second.',
    },
    facts: [
      radius('695,700'),
      mass('1.989×10³⁰'),
      f('表面温度', 'Surface temperature', '5,772 K'),
      f('光度', 'Luminosity', '3.828×10²⁶ W'),
      spin('约 25.4 天（赤道）', '≈25.4 days (equator)'),
      f('距银心', 'Distance to Galactic centre', { zh: '约 2.67 万光年', en: '≈26,700 ly' }),
    ],
  },
  {
    id: 'mercury',
    name: { zh: '水星', en: 'Mercury' },
    kind: 'planet',
    radiusKm: 2439.7,
    orbitKey: 'mercury',
    rotationHours: 1407.6,
    pole: { ra: 281.01, dec: 61.41 },
    appearance: { kind: 1, colors: ['#8c8680', '#5f5b57', '#b9b3ad'], seed: 11 },
    color: '#b5b0aa',
    desc: {
      zh: '离太阳最近、也是最小的行星。几乎没有大气，昼夜温差极大：白天约 430 °C，夜晚降到约 −180 °C。一个水星“太阳日”长达 176 个地球日。',
      en: 'The smallest planet and the closest to the Sun. With almost no atmosphere its surface swings from about 430 °C by day to −180 °C at night; one solar day lasts 176 Earth days.',
    },
    facts: [radius('2,440'), mass('3.30×10²³'), period('88.0 天', '88.0 days'), spin('58.6 天', '58.6 days'), moons('0')],
  },
  {
    id: 'venus',
    name: { zh: '金星', en: 'Venus' },
    kind: 'planet',
    radiusKm: 6051.8,
    orbitKey: 'venus',
    rotationHours: -5832.5,
    pole: { ra: 272.76, dec: 67.16 },
    appearance: { kind: 5, colors: ['#f0dcae', '#d9b36e', '#fff1cf'], seed: 12, atmosphere: '#ffe7b0', atmosphereStrength: 0.9 },
    color: '#e8c98b',
    desc: {
      zh: '大小与地球相近，却被浓密的二氧化碳大气笼罩，地表气压约为地球的 92 倍。失控的温室效应使地表温度高达约 465 °C，是太阳系最热的行星。它逆向自转，一天比一年还长。',
      en: 'Earth’s near-twin in size, smothered by a CO₂ atmosphere 92 times denser than ours. A runaway greenhouse effect makes it the hottest planet (~465 °C). It spins backwards and its day is longer than its year.',
    },
    facts: [radius('6,052'), mass('4.87×10²⁴'), period('224.7 天', '224.7 days'), spin('243 天（逆向）', '243 days (retrograde)'), moons('0')],
  },
  {
    id: 'earth',
    name: { zh: '地球', en: 'Earth' },
    kind: 'planet',
    radiusKm: 6371,
    orbitKey: 'earth',
    rotationHours: 23.9345,
    pole: { ra: 0, dec: 90 },
    appearance: { kind: 2, colors: ['#1d4f91', '#3f7a3a', '#c9b27c'], seed: 13, atmosphere: '#6fb6ff', atmosphereStrength: 1 },
    color: '#5aa9ff',
    desc: {
      zh: '我们的家园，也是目前已知唯一存在生命的天体。表面约 71% 被海洋覆盖，磁场和臭氧层为生命撑起保护伞。从远方回望，地球只是一颗“暗淡蓝点”。',
      en: 'Our home and the only world known to harbour life. Oceans cover ~71 % of its surface while a magnetic field and ozone layer shield the biosphere — a “pale blue dot” when seen from afar.',
    },
    facts: [
      radius('6,371'),
      mass('5.97×10²⁴'),
      period('365.256 天', '365.256 days'),
      spin('23 时 56 分', '23 h 56 min'),
      f('轴倾角', 'Axial tilt', '23.44°'),
      moons('1'),
    ],
  },
  {
    id: 'moon',
    name: { zh: '月球', en: 'Moon' },
    kind: 'moon',
    radiusKm: 1737.4,
    parent: 'earth',
    rotationHours: 655.72,
    pole: { ra: 269.99, dec: 66.54 },
    appearance: { kind: 1, colors: ['#9b9b9b', '#5d5d5d', '#d0d0d0'], seed: 14 },
    color: '#d6d6d6',
    desc: {
      zh: '地球唯一的天然卫星，很可能形成于约 45 亿年前的一次巨大撞击。它被潮汐锁定，始终以同一面朝向地球，并帮助稳定地球的自转轴。',
      en: 'Earth’s only natural satellite, probably born from a giant impact 4.5 billion years ago. Tidally locked, it always shows us the same face and helps stabilise Earth’s axial tilt.',
    },
    facts: [radius('1,737'), mass('7.35×10²²'), f('平均距离', 'Mean distance', '384,400 km'), period('27.32 天', '27.32 days')],
  },
  {
    id: 'mars',
    name: { zh: '火星', en: 'Mars' },
    kind: 'planet',
    radiusKm: 3389.5,
    orbitKey: 'mars',
    rotationHours: 24.6229,
    pole: { ra: 317.68, dec: 52.89 },
    appearance: { kind: 1, colors: ['#b5532f', '#7a3320', '#d98b5f'], seed: 15, atmosphere: '#ff9e7a', atmosphereStrength: 0.35 },
    color: '#d2694a',
    desc: {
      zh: '“红色星球”的颜色来自富含氧化铁的尘土。这里有太阳系最高的火山奥林帕斯山（约 22 km）和绵延 4000 km 的水手号峡谷。远古时期曾有液态水流淌，是寻找地外生命的重点目标。',
      en: 'The red planet owes its colour to iron-oxide dust. It hosts Olympus Mons (~22 km), the tallest volcano in the Solar System, and the 4000-km Valles Marineris. Liquid water once flowed here, making it a prime target in the search for life.',
    },
    facts: [radius('3,390'), mass('6.42×10²³'), period('687 天', '687 days'), spin('24 时 37 分', '24 h 37 min'), moons('2')],
  },
  {
    id: 'phobos',
    name: { zh: '火卫一', en: 'Phobos' },
    kind: 'moon',
    radiusKm: 11.27,
    parent: 'mars',
    moonOrbit: { aKm: 9376, periodDays: 0.31891, phaseDeg: 40 },
    rotationHours: 7.65,
    pole: { ra: 317.68, dec: 52.89 },
    appearance: { kind: 1, colors: ['#7d6e64', '#4f4540', '#a2938a'], seed: 16 },
    color: '#a2938a',
    desc: {
      zh: '形状不规则的小卫星，正缓慢地螺旋靠近火星，约 5000 万年后将被潮汐力撕碎，可能形成一道火星环。',
      en: 'An irregular little moon spiralling inwards; in ~50 million years tides will tear it apart, perhaps forming a ring around Mars.',
    },
    facts: [radius('11.3'), f('轨道半径', 'Orbital radius', '9,376 km'), period('7 时 39 分', '7 h 39 min')],
  },
  {
    id: 'deimos',
    name: { zh: '火卫二', en: 'Deimos' },
    kind: 'moon',
    radiusKm: 6.2,
    parent: 'mars',
    moonOrbit: { aKm: 23463, periodDays: 1.263, phaseDeg: 200 },
    rotationHours: 30.3,
    pole: { ra: 317.68, dec: 52.89 },
    appearance: { kind: 1, colors: ['#8a7b70', '#5a4f48', '#ab9c90'], seed: 17 },
    color: '#ab9c90',
    desc: {
      zh: '火星较小、较远的卫星，直径只有约 12 公里，很可能是被俘获的小行星。',
      en: 'Mars’ smaller, outer moon — only about 12 km across and probably a captured asteroid.',
    },
    facts: [radius('6.2'), f('轨道半径', 'Orbital radius', '23,463 km'), period('30.3 时', '30.3 h')],
  },
  {
    id: 'jupiter',
    name: { zh: '木星', en: 'Jupiter' },
    kind: 'planet',
    radiusKm: 69911,
    orbitKey: 'jupiter',
    rotationHours: 9.925,
    pole: { ra: 268.06, dec: 64.5 },
    appearance: { kind: 3, colors: ['#d9c7a5', '#a8754a', '#f4ead6'], bands: 15, seed: 18, spot: true, atmosphere: '#f6deb4', atmosphereStrength: 0.4 },
    color: '#d8b48a',
    desc: {
      zh: '太阳系最大的行星，质量是其他所有行星总和的 2.5 倍。大红斑是一个比地球还大、已持续数百年的风暴。木星的强大引力深刻影响着整个太阳系小天体的轨道。',
      en: 'The largest planet, 2.5 times as massive as all the others combined. The Great Red Spot is a storm larger than Earth that has raged for centuries, and Jupiter’s gravity shapes the orbits of small bodies throughout the Solar System.',
    },
    facts: [radius('69,911'), mass('1.90×10²⁷'), period('11.86 年', '11.86 years'), spin('9 时 56 分', '9 h 56 min'), moons('97')],
  },
  {
    id: 'io',
    name: { zh: '木卫一 · 伊奥', en: 'Io' },
    kind: 'moon',
    radiusKm: 1821.6,
    parent: 'jupiter',
    moonOrbit: { aKm: 421700, periodDays: 1.769, phaseDeg: 10 },
    rotationHours: 42.46,
    pole: { ra: 268.06, dec: 64.5 },
    appearance: { kind: 1, colors: ['#e8d36a', '#b5772f', '#f6f0c0'], seed: 19 },
    color: '#e8d36a',
    desc: {
      zh: '太阳系火山活动最剧烈的天体。木星与其他卫星的潮汐拉扯不断加热它的内部，驱动着数百座活火山。',
      en: 'The most volcanically active body in the Solar System; tidal flexing by Jupiter and its sister moons powers hundreds of active volcanoes.',
    },
    facts: [radius('1,822'), f('轨道半径', 'Orbital radius', '421,700 km'), period('1.77 天', '1.77 days')],
  },
  {
    id: 'europa',
    name: { zh: '木卫二 · 欧罗巴', en: 'Europa' },
    kind: 'moon',
    radiusKm: 1560.8,
    parent: 'jupiter',
    moonOrbit: { aKm: 671034, periodDays: 3.551, phaseDeg: 120 },
    rotationHours: 85.2,
    pole: { ra: 268.06, dec: 64.5 },
    appearance: { kind: 1, colors: ['#e6dccb', '#a0785a', '#fbf7ef'], seed: 20 },
    color: '#e6dccb',
    desc: {
      zh: '冰壳之下隐藏着全球性的液态水海洋，水量可能是地球海洋的两倍，是寻找地外生命的热门目标。',
      en: 'Beneath its ice shell lies a global ocean holding perhaps twice the water of Earth’s seas — a prime place to look for life.',
    },
    facts: [radius('1,561'), f('轨道半径', 'Orbital radius', '671,034 km'), period('3.55 天', '3.55 days')],
  },
  {
    id: 'ganymede',
    name: { zh: '木卫三 · 盖尼米德', en: 'Ganymede' },
    kind: 'moon',
    radiusKm: 2634.1,
    parent: 'jupiter',
    moonOrbit: { aKm: 1070412, periodDays: 7.155, phaseDeg: 250 },
    rotationHours: 171.7,
    pole: { ra: 268.06, dec: 64.5 },
    appearance: { kind: 1, colors: ['#9c8f80', '#5e554b', '#cfc4b6'], seed: 21 },
    color: '#b7aa9a',
    desc: {
      zh: '太阳系最大的卫星，直径比水星还大，也是唯一拥有自身磁场的卫星。',
      en: 'The largest moon in the Solar System — bigger than Mercury — and the only moon with its own magnetic field.',
    },
    facts: [radius('2,634'), f('轨道半径', 'Orbital radius', '1,070,412 km'), period('7.15 天', '7.15 days')],
  },
  {
    id: 'callisto',
    name: { zh: '木卫四 · 卡利斯托', en: 'Callisto' },
    kind: 'moon',
    radiusKm: 2410.3,
    parent: 'jupiter',
    moonOrbit: { aKm: 1882709, periodDays: 16.689, phaseDeg: 300 },
    rotationHours: 400.5,
    pole: { ra: 268.06, dec: 64.5 },
    appearance: { kind: 1, colors: ['#6f665d', '#3c3631', '#a0968b'], seed: 22 },
    color: '#8f857b',
    desc: {
      zh: '表面布满陨石坑，是太阳系中最古老、撞击最密集的地表之一。',
      en: 'One of the oldest and most heavily cratered surfaces in the Solar System.',
    },
    facts: [radius('2,410'), f('轨道半径', 'Orbital radius', '1,882,709 km'), period('16.7 天', '16.7 days')],
  },
  {
    id: 'saturn',
    name: { zh: '土星', en: 'Saturn' },
    kind: 'planet',
    radiusKm: 58232,
    orbitKey: 'saturn',
    rotationHours: 10.656,
    pole: { ra: 40.59, dec: 83.54 },
    appearance: { kind: 3, colors: ['#e3cf9e', '#b8935a', '#f6ecd0'], bands: 20, seed: 23, ring: { inner: 1.24, outer: 2.35 }, atmosphere: '#f3e2b5', atmosphereStrength: 0.35 },
    color: '#e3cf9e',
    desc: {
      zh: '以壮观的光环闻名。光环主要由冰块和岩石碎片组成，宽约 28 万公里，但厚度通常只有约 10 米。土星的平均密度比水还低。',
      en: 'Famous for its spectacular rings of ice and rock — about 280 000 km across yet typically only ~10 m thick. Saturn’s mean density is lower than water’s.',
    },
    facts: [radius('58,232'), mass('5.68×10²⁶'), period('29.46 年', '29.46 years'), spin('10 时 34 分', '10 h 34 min'), moons('274')],
  },
  {
    id: 'enceladus',
    name: { zh: '土卫二 · 恩克拉多斯', en: 'Enceladus' },
    kind: 'moon',
    radiusKm: 252.1,
    parent: 'saturn',
    moonOrbit: { aKm: 237948, periodDays: 1.37, phaseDeg: 70 },
    rotationHours: 32.9,
    pole: { ra: 40.59, dec: 83.54 },
    appearance: { kind: 1, colors: ['#f2f5f7', '#b9c4cc', '#ffffff'], seed: 24 },
    color: '#f2f5f7',
    desc: {
      zh: '南极的冰裂缝向太空喷射水蒸气羽流，冰壳下是含盐的液态海洋。',
      en: 'Plumes of water vapour erupt from cracks near its south pole, fed by a salty subsurface ocean.',
    },
    facts: [radius('252'), f('轨道半径', 'Orbital radius', '237,948 km'), period('1.37 天', '1.37 days')],
  },
  {
    id: 'titan',
    name: { zh: '土卫六 · 泰坦', en: 'Titan' },
    kind: 'moon',
    radiusKm: 2574.7,
    parent: 'saturn',
    moonOrbit: { aKm: 1221870, periodDays: 15.945, phaseDeg: 160 },
    rotationHours: 382.7,
    pole: { ra: 40.59, dec: 83.54 },
    appearance: { kind: 5, colors: ['#d9a54e', '#a8722c', '#f0c875'], seed: 25, atmosphere: '#f2b65a', atmosphereStrength: 0.8 },
    color: '#e0a94f',
    desc: {
      zh: '拥有浓厚的氮气大气，地表分布着由液态甲烷和乙烷构成的湖泊与河流，是除地球外唯一表面有稳定液体的天体。',
      en: 'Wrapped in a thick nitrogen atmosphere, with lakes and rivers of liquid methane and ethane — the only world besides Earth with stable surface liquids.',
    },
    facts: [radius('2,575'), f('轨道半径', 'Orbital radius', '1,221,870 km'), period('15.9 天', '15.9 days')],
  },
  {
    id: 'uranus',
    name: { zh: '天王星', en: 'Uranus' },
    kind: 'planet',
    radiusKm: 25362,
    orbitKey: 'uranus',
    rotationHours: -17.24,
    pole: { ra: 257.31, dec: -15.18 },
    appearance: { kind: 4, colors: ['#a6e6ea', '#7cc4cf', '#d4f6f7'], bands: 6, seed: 26, atmosphere: '#bff6ff', atmosphereStrength: 0.6 },
    color: '#9fe3e8',
    desc: {
      zh: '冰巨星，自转轴倾斜约 98°，几乎“躺着”绕太阳公转，因此两极各要经历 42 年的极昼与 42 年的极夜。大气中的甲烷使它呈现淡青色。',
      en: 'An ice giant tilted by ~98°, it essentially rolls around the Sun on its side, giving each pole 42 years of daylight then 42 years of night. Methane gives it a pale cyan hue.',
    },
    facts: [radius('25,362'), mass('8.68×10²⁵'), period('84.0 年', '84.0 years'), spin('17 时 14 分（逆向）', '17 h 14 min (retrograde)'), moons('29')],
  },
  {
    id: 'titania',
    name: { zh: '天卫三 · 泰坦尼亚', en: 'Titania' },
    kind: 'moon',
    radiusKm: 788.4,
    parent: 'uranus',
    moonOrbit: { aKm: 435910, periodDays: 8.706, phaseDeg: 30 },
    rotationHours: 208.9,
    pole: { ra: 257.31, dec: -15.18 },
    appearance: { kind: 1, colors: ['#a59a92', '#6c625c', '#cfc5bd'], seed: 27 },
    color: '#b9aea5',
    desc: {
      zh: '天王星最大的卫星，表面布满巨大的断层峡谷。',
      en: 'Uranus’ largest moon, scarred by enormous fault canyons.',
    },
    facts: [radius('788'), f('轨道半径', 'Orbital radius', '435,910 km'), period('8.71 天', '8.71 days')],
  },
  {
    id: 'neptune',
    name: { zh: '海王星', en: 'Neptune' },
    kind: 'planet',
    radiusKm: 24622,
    orbitKey: 'neptune',
    rotationHours: 16.11,
    pole: { ra: 299.36, dec: 43.46 },
    appearance: { kind: 4, colors: ['#3d63d6', '#253f9e', '#7da2ff'], bands: 9, seed: 28, spot: true, atmosphere: '#7aa0ff', atmosphereStrength: 0.7 },
    color: '#5b86f0',
    desc: {
      zh: '离太阳最远的行星，1846 年先由数学计算预言、后被望远镜发现。它拥有太阳系最猛烈的风暴，风速可超过 2000 km/h。',
      en: 'The most distant planet, predicted mathematically before it was found by telescope in 1846. Its winds are the fastest in the Solar System, exceeding 2000 km/h.',
    },
    facts: [radius('24,622'), mass('1.02×10²⁶'), period('164.8 年', '164.8 years'), spin('16 时 7 分', '16 h 7 min'), moons('16')],
  },
  {
    id: 'triton',
    name: { zh: '海卫一 · 特里同', en: 'Triton' },
    kind: 'moon',
    radiusKm: 1353.4,
    parent: 'neptune',
    moonOrbit: { aKm: 354759, periodDays: -5.877, phaseDeg: 90 },
    rotationHours: 141.0,
    pole: { ra: 299.36, dec: 43.46 },
    appearance: { kind: 1, colors: ['#d8c9c0', '#9c8a82', '#f4ece6'], seed: 29 },
    color: '#e0d3cb',
    desc: {
      zh: '沿逆行轨道公转的大卫星，很可能是被海王星俘获的柯伊伯带天体，表面有活跃的氮气间歇泉。',
      en: 'A large moon on a retrograde orbit — probably a captured Kuiper-belt object — with active nitrogen geysers.',
    },
    facts: [radius('1,353'), f('轨道半径', 'Orbital radius', '354,759 km'), period('5.88 天（逆行）', '5.88 days (retrograde)')],
  },
  {
    id: 'pluto',
    name: { zh: '冥王星', en: 'Pluto' },
    kind: 'dwarf-planet',
    radiusKm: 1188.3,
    orbitKey: 'pluto',
    rotationHours: -153.29,
    pole: { ra: 132.99, dec: -6.16 },
    appearance: { kind: 1, colors: ['#c9b49b', '#7e5a44', '#f2e7d8'], seed: 30 },
    color: '#c9b49b',
    desc: {
      zh: '柯伊伯带中最著名的矮行星，2006 年被重新归类。2015 年新视野号飞掠时，发现了巨大的心形氮冰平原“斯普特尼克平原”。',
      en: 'The best-known dwarf planet of the Kuiper belt, reclassified in 2006. New Horizons’ 2015 flyby revealed Sputnik Planitia, a vast heart-shaped plain of nitrogen ice.',
    },
    facts: [radius('1,188'), mass('1.30×10²²'), period('248 年', '248 years'), spin('6.4 天（逆向）', '6.4 days (retrograde)'), moons('5')],
  },
  {
    id: 'charon',
    name: { zh: '冥卫一 · 卡戎', en: 'Charon' },
    kind: 'moon',
    radiusKm: 606,
    parent: 'pluto',
    moonOrbit: { aKm: 19591, periodDays: 6.387, phaseDeg: 0 },
    rotationHours: 153.29,
    pole: { ra: 132.99, dec: -6.16 },
    appearance: { kind: 1, colors: ['#9d9893', '#5f5a56', '#c7c1bb'], seed: 31 },
    color: '#b3ada7',
    desc: {
      zh: '与冥王星相互潮汐锁定，两者围绕位于冥王星之外的共同质心旋转，常被视为“双矮行星”系统。',
      en: 'Mutually tidally locked with Pluto; the pair orbit a barycentre outside Pluto and are often called a double dwarf planet.',
    },
    facts: [radius('606'), f('轨道半径', 'Orbital radius', '19,591 km'), period('6.39 天', '6.39 days')],
  },
];

export interface ProbeData {
  id: string;
  name: Bilingual;
  /** Distance from the Sun (au) at 2024-01-01 and radial speed (au/yr). */
  d2024: number;
  speed: number;
  ra: number;
  dec: number;
  desc: Bilingual;
  launched: string;
}

export const PROBES: ProbeData[] = [
  {
    id: 'voyager1',
    name: { zh: '旅行者 1 号', en: 'Voyager 1' },
    d2024: 162.7,
    speed: 3.58,
    ra: 258.2,
    dec: 12.0,
    launched: '1977-09-05',
    desc: {
      zh: '1977 年发射，是距离地球最远的人造物体。2012 年成为首个进入星际空间的探测器，携带着记录地球声音与图像的“金唱片”。',
      en: 'Launched in 1977, the most distant human-made object. In 2012 it became the first spacecraft to enter interstellar space, carrying the Golden Record of Earth’s sounds and images.',
    },
  },
  {
    id: 'voyager2',
    name: { zh: '旅行者 2 号', en: 'Voyager 2' },
    d2024: 135.6,
    speed: 3.25,
    ra: 300.8,
    dec: -59.5,
    launched: '1977-08-20',
    desc: {
      zh: '唯一造访过天王星和海王星的探测器，2018 年穿越日球层顶进入星际空间。',
      en: 'The only spacecraft to have visited Uranus and Neptune; it crossed the heliopause into interstellar space in 2018.',
    },
  },
  {
    id: 'newhorizons',
    name: { zh: '新视野号', en: 'New Horizons' },
    d2024: 58.6,
    speed: 2.9,
    ra: 292.5,
    dec: -20.5,
    launched: '2006-01-19',
    desc: {
      zh: '2015 年首次飞掠冥王星，2019 年又飞掠了柯伊伯带天体“阿罗科斯”，目前仍在飞离太阳系。',
      en: 'Made the first flyby of Pluto in 2015 and of the Kuiper-belt object Arrokoth in 2019; it is still heading out of the Solar System.',
    },
  },
];

export interface SolarRegion {
  id: string;
  name: Bilingual;
  innerAu: number;
  outerAu: number;
  desc: Bilingual;
}

export const SOLAR_REGIONS: SolarRegion[] = [
  {
    id: 'asteroid-belt',
    name: { zh: '小行星带', en: 'Asteroid belt' },
    innerAu: 2.2,
    outerAu: 3.3,
    desc: {
      zh: '位于火星与木星轨道之间，包含数以百万计的小行星，但总质量只有月球的约 3%。其中最大的谷神星是一颗矮行星。',
      en: 'Between Mars and Jupiter lie millions of asteroids with a combined mass of only ~3 % of the Moon. The largest, Ceres, is a dwarf planet.',
    },
  },
  {
    id: 'kuiper-belt',
    name: { zh: '柯伊伯带', en: 'Kuiper belt' },
    innerAu: 30,
    outerAu: 50,
    desc: {
      zh: '海王星轨道之外的冰质小天体带，是短周期彗星的源头，冥王星、阋神星、妊神星等矮行星都位于这里。',
      en: 'A belt of icy bodies beyond Neptune, source of short-period comets and home to dwarf planets such as Pluto, Eris and Haumea.',
    },
  },
  {
    id: 'heliopause',
    name: { zh: '日球层顶', en: 'Heliopause' },
    innerAu: 120,
    outerAu: 120,
    desc: {
      zh: '太阳风与星际介质压力达到平衡的边界，标志着太阳“势力范围”的尽头。旅行者 1 号和 2 号分别于 2012 年和 2018 年穿越这里。',
      en: 'The boundary where the solar wind is stopped by the interstellar medium — the edge of the Sun’s bubble. Voyager 1 and 2 crossed it in 2012 and 2018.',
    },
  },
  {
    id: 'oort-cloud',
    name: { zh: '奥尔特云', en: 'Oort cloud' },
    innerAu: 2000,
    outerAu: 100000,
    desc: {
      zh: '包围太阳系的巨大球状冰质天体云，可能延伸到 1–2 光年之外，是长周期彗星的故乡。它至今尚未被直接观测到。',
      en: 'A vast spherical cloud of icy bodies, possibly reaching 1–2 light-years out, the reservoir of long-period comets. It has never been observed directly.',
    },
  },
];
