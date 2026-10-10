import type { Vec3 } from '../physics/coords';
import { ECLIPTIC_UP, GALACTIC_UP, SUPERGALACTIC_UP } from './catalog';
import type { Bilingual } from './types';

export interface ScalePreset {
  id: string;
  name: Bilingual;
  /** Catalog object to centre on. */
  focusId: string;
  /** log10 of the camera distance in metres. */
  log: number;
  up: Vec3;
  /** Short caption used by the guided tour. */
  caption: Bilingual;
}

export const SCALE_PRESETS: ScalePreset[] = [
  {
    id: 'earth', name: { zh: '地球', en: 'Earth' }, focusId: 'earth', log: 7.55, up: ECLIPTIC_UP,
    caption: { zh: '一切从这里开始：直径 1.27 万千米的地球，宇宙中我们唯一的家园。', en: 'It all starts here: Earth, 12 700 km across, our only home in the cosmos.' },
  },
  {
    id: 'earth-moon', name: { zh: '地月系统', en: 'Earth–Moon' }, focusId: 'earth', log: 9.05, up: ECLIPTIC_UP,
    caption: { zh: '月球距地球约 38 万千米，光要走 1.3 秒。', en: 'The Moon is ~384 000 km away — 1.3 light-seconds.' },
  },
  {
    id: 'inner', name: { zh: '内太阳系', en: 'Inner Solar System' }, focusId: 'sun', log: 11.75, up: ECLIPTIC_UP,
    caption: { zh: '水星、金星、地球、火星：四颗岩质行星挤在离太阳 1.5 天文单位的范围内。', en: 'Mercury, Venus, Earth and Mars huddle within 1.5 au of the Sun.' },
  },
  {
    id: 'solar', name: { zh: '太阳系', en: 'Solar System' }, focusId: 'sun', log: 12.95, up: ECLIPTIC_UP,
    caption: { zh: '八大行星的轨道跨越约 60 天文单位，阳光到达海王星需要 4 小时。', en: 'The planets span ~60 au; sunlight takes four hours to reach Neptune.' },
  },
  {
    id: 'heliosphere', name: { zh: '日球层', en: 'Heliosphere' }, focusId: 'sun', log: 13.75, up: ECLIPTIC_UP,
    caption: { zh: '太阳风吹出的“气泡”——旅行者号已越过它的边界进入星际空间。', en: 'The bubble blown by the solar wind — the Voyagers have crossed its edge into interstellar space.' },
  },
  {
    id: 'oort', name: { zh: '奥尔特云', en: 'Oort Cloud' }, focusId: 'sun', log: 16.7, up: ECLIPTIC_UP,
    caption: { zh: '数万亿颗冰质天体组成的球壳，可能延伸到 1–2 光年，是太阳引力的势力边界。', en: 'A shell of trillions of icy bodies reaching 1–2 light-years: the edge of the Sun’s gravitational realm.' },
  },
  {
    id: 'neighbors', name: { zh: '恒星近邻', en: 'Nearest stars' }, focusId: 'sun', log: 17.35, up: ECLIPTIC_UP,
    caption: { zh: '最近的恒星比邻星远在 4.2 光年外，比太阳系大上万倍的空旷。', en: 'The nearest star, Proxima, is 4.2 light-years away — emptiness thousands of times larger than the Solar System.' },
  },
  {
    id: 'neighborhood', name: { zh: '太阳邻域', en: 'Solar neighbourhood' }, focusId: 'sun', log: 19.05, up: GALACTIC_UP,
    caption: { zh: '方圆上千光年内的恒星：参宿四、天津四、猎户座大星云都在这里。', en: 'Stars within a thousand light-years: Betelgeuse, Deneb and the Orion Nebula live here.' },
  },
  {
    id: 'milky-way', name: { zh: '银河系', en: 'Milky Way' }, focusId: 'milky-way', log: 21.25, up: GALACTIC_UP,
    caption: { zh: '银河系：直径约 10 万光年、包含数千亿颗恒星的棒旋星系。太阳只是猎户臂上的一个小点。', en: 'The Milky Way: a barred spiral ~100 000 light-years across with hundreds of billions of stars. The Sun is a speck on the Orion Arm.' },
  },
  {
    id: 'local-group', name: { zh: '本星系群', en: 'Local Group' }, focusId: 'local-group', log: 23.15, up: GALACTIC_UP,
    caption: { zh: '本星系群：银河系、仙女座星系、三角座星系和几十个矮星系，彼此由引力束缚。', en: 'The Local Group: the Milky Way, Andromeda, Triangulum and dozens of dwarfs, bound by gravity.' },
  },
  {
    id: 'virgo', name: { zh: '本超星系团', en: 'Virgo Supercluster' }, focusId: 'virgo-supercluster', log: 24.45, up: SUPERGALACTIC_UP,
    caption: { zh: '数千个星系环绕着 5400 万光年外的室女座星系团。', en: 'Thousands of galaxies gather around the Virgo Cluster, 54 million light-years away.' },
  },
  {
    id: 'laniakea', name: { zh: '拉尼亚凯亚', en: 'Laniakea' }, focusId: 'laniakea', log: 25.1, up: SUPERGALACTIC_UP,
    caption: { zh: '拉尼亚凯亚超星系团：约 10 万个星系一起流向“巨引源”，跨度 5.2 亿光年。', en: 'Laniakea: some 100 000 galaxies flowing towards the Great Attractor across 520 million light-years.' },
  },
  {
    id: 'web', name: { zh: '宇宙网', en: 'Cosmic web' }, focusId: 'you-are-here', log: 25.85, up: GALACTIC_UP,
    caption: { zh: '星系沿着纤维与墙状结构排列，包围着巨大的空洞——这就是宇宙网。', en: 'Galaxies line up along filaments and walls around vast voids: the cosmic web.' },
  },
  {
    id: 'observable', name: { zh: '可观测宇宙', en: 'Observable Universe' }, focusId: 'observable-universe', log: 27.25, up: GALACTIC_UP,
    caption: { zh: '可观测宇宙：直径约 930 亿光年，边界之外是宇宙微波背景——大爆炸 38 万年后的“第一缕光”。', en: 'The observable universe, ~93 billion light-years across, walled by the cosmic microwave background — the first light, 380 000 years after the Big Bang.' },
  },
];
