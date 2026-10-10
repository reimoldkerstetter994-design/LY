import type { Bilingual } from './types';

export type GalaxyModel = 'spiral' | 'barred' | 'elliptical' | 'irregular' | 'dwarf';

export interface GalaxyData {
  id: string;
  name: Bilingual;
  ra: string;
  dec: string;
  /** Distance in thousands of light-years (nearby galaxies). */
  distKly?: number;
  /** Redshift (distant galaxies; distance follows from the cosmology). */
  z?: number;
  type: string;
  diameterKly: number;
  model: GalaxyModel;
  incl?: number;
  pa?: number;
  kind?: 'galaxy' | 'quasar';
  desc?: Bilingual;
  /** Rendered as a particle model in the Local Group scene. */
  rendered?: boolean;
}

export const LOCAL_GROUP: GalaxyData[] = [
  {
    id: 'm31', name: { zh: '仙女座星系（M31）', en: 'Andromeda Galaxy (M31)' }, ra: '00 42 44.3', dec: '+41 16 09', distKly: 2500, type: 'SA(s)b', diameterKly: 152, model: 'spiral', incl: 77, pa: 38, rendered: true,
    desc: {
      zh: '本星系群中最大的星系，约有 1 万亿颗恒星，是肉眼可见的最遥远天体之一。它正以约 110 km/s 的速度接近银河系，两者可能在数十亿年后碰撞合并。',
      en: 'The largest galaxy of the Local Group with ~1 trillion stars and one of the most distant naked-eye objects. It approaches the Milky Way at ~110 km/s; the two may merge in a few billion years.',
    },
  },
  {
    id: 'm33', name: { zh: '三角座星系（M33）', en: 'Triangulum Galaxy (M33)' }, ra: '01 33 50.9', dec: '+30 39 37', distKly: 2730, type: 'SA(s)cd', diameterKly: 61, model: 'spiral', incl: 55, pa: 23, rendered: true,
    desc: { zh: '本星系群第三大星系，一个恒星形成活跃的松散旋涡星系，在极暗的夜空下肉眼勉强可见。', en: 'The third-largest Local Group galaxy, a loosely wound spiral rich in star formation, barely visible to the naked eye under dark skies.' },
  },
  {
    id: 'lmc', name: { zh: '大麦哲伦云', en: 'Large Magellanic Cloud' }, ra: '05 23 34.5', dec: '-69 45 22', distKly: 163, type: 'SB(s)m', diameterKly: 32, model: 'irregular', incl: 30, pa: 170, rendered: true,
    desc: { zh: '银河系最大的卫星星系，南半球肉眼可见。1987 年这里爆发的超新星 SN 1987A 是近代最亮的超新星。', en: 'The Milky Way’s largest satellite, visible from the southern hemisphere. SN 1987A, the brightest supernova in modern times, exploded here.' },
  },
  {
    id: 'smc', name: { zh: '小麦哲伦云', en: 'Small Magellanic Cloud' }, ra: '00 52 44.8', dec: '-72 49 43', distKly: 204, type: 'SB(s)m pec', diameterKly: 19, model: 'irregular', incl: 60, pa: 45, rendered: true,
    desc: { zh: '矮不规则星系，与大麦哲伦云一起由麦哲伦船队带回欧洲的记录而得名，两者被“麦哲伦流”气体连接。', en: 'A dwarf irregular named, with its larger sibling, after Magellan’s expedition; the two are linked by the gaseous Magellanic Stream.' },
  },
  { id: 'm32', name: { zh: 'M32', en: 'M32' }, ra: '00 42 41.8', dec: '+40 51 55', distKly: 2490, type: 'cE2', diameterKly: 6.5, model: 'elliptical', desc: { zh: '仙女座星系旁的致密椭圆星系，可能是被剥离外层的旋涡星系残核。', en: 'A compact elliptical beside Andromeda, possibly the stripped core of a former spiral.' } },
  { id: 'm110', name: { zh: 'M110', en: 'M110 (NGC 205)' }, ra: '00 40 22.1', dec: '+41 41 07', distKly: 2690, type: 'dE6p', diameterKly: 17, model: 'elliptical' },
  { id: 'ngc185', name: { zh: 'NGC 185', en: 'NGC 185' }, ra: '00 38 58.0', dec: '+48 20 15', distKly: 2010, type: 'dE3p', diameterKly: 8, model: 'dwarf' },
  { id: 'ngc147', name: { zh: 'NGC 147', en: 'NGC 147' }, ra: '00 33 12.1', dec: '+48 30 32', distKly: 2580, type: 'dE5', diameterKly: 10, model: 'dwarf' },
  { id: 'ic10', name: { zh: 'IC 10', en: 'IC 10' }, ra: '00 20 17.3', dec: '+59 18 14', distKly: 2200, type: 'dIrr', diameterKly: 5, model: 'irregular', desc: { zh: '本星系群中唯一已知的星暴星系。', en: 'The only known starburst galaxy in the Local Group.' } },
  { id: 'ngc6822', name: { zh: '巴纳德星系（NGC 6822）', en: "Barnard's Galaxy (NGC 6822)" }, ra: '19 44 56.6', dec: '-14 47 21', distKly: 1630, type: 'IB(s)m', diameterKly: 7, model: 'irregular' },
  { id: 'ic1613', name: { zh: 'IC 1613', en: 'IC 1613' }, ra: '01 04 47.8', dec: '+02 07 04', distKly: 2380, type: 'IB(s)m', diameterKly: 10, model: 'irregular' },
  { id: 'wlm', name: { zh: 'WLM 星系', en: 'Wolf–Lundmark–Melotte' }, ra: '00 01 58.1', dec: '-15 27 39', distKly: 3040, type: 'IB(s)m', diameterKly: 8, model: 'irregular' },
  { id: 'leo-a', name: { zh: '狮子座 A', en: 'Leo A' }, ra: '09 59 26.5', dec: '+30 44 47', distKly: 2600, type: 'IBm', diameterKly: 4, model: 'irregular' },
  { id: 'sgr-dsph', name: { zh: '人马座矮椭球星系', en: 'Sagittarius Dwarf Spheroidal' }, ra: '18 55 19.5', dec: '-30 32 43', distKly: 65, type: 'dSph', diameterKly: 10, model: 'dwarf', desc: { zh: '正在被银河系潮汐撕裂并吞噬的卫星星系，其恒星流环绕银河系。', en: 'A satellite being torn apart and swallowed by the Milky Way; its stellar stream wraps around our Galaxy.' } },
  { id: 'fornax-dsph', name: { zh: '天炉座矮星系', en: 'Fornax Dwarf' }, ra: '02 39 59.3', dec: '-34 26 57', distKly: 460, type: 'dSph', diameterKly: 3, model: 'dwarf' },
  { id: 'sculptor-dsph', name: { zh: '玉夫座矮星系', en: 'Sculptor Dwarf' }, ra: '01 00 09.4', dec: '-33 42 33', distKly: 290, type: 'dSph', diameterKly: 3, model: 'dwarf' },
  { id: 'draco-dsph', name: { zh: '天龙座矮星系', en: 'Draco Dwarf' }, ra: '17 20 12.4', dec: '+57 54 55', distKly: 260, type: 'dSph', diameterKly: 2, model: 'dwarf', desc: { zh: '暗物质含量极高的矮星系之一，是研究暗物质的天然实验室。', en: 'One of the most dark-matter-dominated dwarfs, a natural laboratory for dark matter.' } },
  { id: 'umi-dsph', name: { zh: '小熊座矮星系', en: 'Ursa Minor Dwarf' }, ra: '15 09 08.5', dec: '+67 13 21', distKly: 225, type: 'dSph', diameterKly: 2, model: 'dwarf' },
  { id: 'carina-dsph', name: { zh: '船底座矮星系', en: 'Carina Dwarf' }, ra: '06 41 36.7', dec: '-50 57 58', distKly: 330, type: 'dSph', diameterKly: 2, model: 'dwarf' },
  { id: 'sextans-dsph', name: { zh: '六分仪座矮星系', en: 'Sextans Dwarf' }, ra: '10 13 03.0', dec: '-01 36 53', distKly: 290, type: 'dSph', diameterKly: 3, model: 'dwarf' },
  { id: 'leo-i', name: { zh: '狮子座 I', en: 'Leo I' }, ra: '10 08 28.1', dec: '+12 18 23', distKly: 820, type: 'dSph', diameterKly: 2, model: 'dwarf' },
  { id: 'leo-ii', name: { zh: '狮子座 II', en: 'Leo II' }, ra: '11 13 28.8', dec: '+22 09 06', distKly: 690, type: 'dSph', diameterKly: 1.5, model: 'dwarf' },
  { id: 'phoenix-dw', name: { zh: '凤凰座矮星系', en: 'Phoenix Dwarf' }, ra: '01 51 06.3', dec: '-44 26 41', distKly: 1440, type: 'dIrr/dSph', diameterKly: 2, model: 'dwarf' },
  { id: 'tucana-dw', name: { zh: '杜鹃座矮星系', en: 'Tucana Dwarf' }, ra: '22 41 49.6', dec: '-64 25 10', distKly: 2870, type: 'dSph', diameterKly: 2, model: 'dwarf' },
  { id: 'pegasus-dirr', name: { zh: '飞马座矮不规则星系', en: 'Pegasus Dwarf Irregular' }, ra: '23 28 36.3', dec: '+14 44 35', distKly: 3000, type: 'dIrr', diameterKly: 2, model: 'irregular' },
  { id: 'aquarius-dw', name: { zh: '宝瓶座矮星系', en: 'Aquarius Dwarf' }, ra: '20 46 51.8', dec: '-12 50 53', distKly: 3200, type: 'dIrr', diameterKly: 2, model: 'irregular' },
  { id: 'cetus-dw', name: { zh: '鲸鱼座矮星系', en: 'Cetus Dwarf' }, ra: '00 26 11.0', dec: '-11 02 40', distKly: 2460, type: 'dSph', diameterKly: 2, model: 'dwarf' },
  { id: 'and-i', name: { zh: '仙女座 I', en: 'Andromeda I' }, ra: '00 45 39.8', dec: '+38 02 28', distKly: 2430, type: 'dSph', diameterKly: 2, model: 'dwarf' },
  { id: 'and-ii', name: { zh: '仙女座 II', en: 'Andromeda II' }, ra: '01 16 29.8', dec: '+33 25 09', distKly: 2130, type: 'dSph', diameterKly: 2, model: 'dwarf' },
  { id: 'ngc3109', name: { zh: 'NGC 3109', en: 'NGC 3109' }, ra: '10 03 06.9', dec: '-26 09 35', distKly: 4340, type: 'SB(s)m', diameterKly: 25, model: 'irregular' },
  { id: 'sextans-a', name: { zh: '六分仪座 A', en: 'Sextans A' }, ra: '10 11 00.8', dec: '-04 41 34', distKly: 4310, type: 'IBm', diameterKly: 5, model: 'irregular' },
  { id: 'sextans-b', name: { zh: '六分仪座 B', en: 'Sextans B' }, ra: '10 00 00.1', dec: '+05 19 56', distKly: 4440, type: 'Im', diameterKly: 5, model: 'irregular' },
];

export const NOTABLE_GALAXIES: GalaxyData[] = [
  { id: 'maffei1', name: { zh: '马菲 1', en: 'Maffei 1' }, ra: '02 36 35.4', dec: '+59 39 19', distKly: 9800, type: 'E3', diameterKly: 75, model: 'elliptical', desc: { zh: '离我们最近的大型椭圆星系，因位于银河盘面后方被尘埃遮挡，直到 1968 年才被发现。', en: 'The nearest giant elliptical, hidden behind the Milky Way’s dust until its discovery in 1968.' } },
  { id: 'ngc253', name: { zh: '玉夫座星系（NGC 253）', en: 'Sculptor Galaxy (NGC 253)' }, ra: '00 47 33.1', dec: '-25 17 18', distKly: 11400, type: 'SAB(s)c', diameterKly: 90, model: 'spiral', incl: 76, pa: 52, desc: { zh: '明亮的星暴旋涡星系，也被称为“银币星系”。', en: 'A bright starburst spiral nicknamed the Silver Coin Galaxy.' } },
  { id: 'm81', name: { zh: '波德星系（M81）', en: "Bode's Galaxy (M81)" }, ra: '09 55 33.2', dec: '+69 03 55', distKly: 11800, type: 'SA(s)ab', diameterKly: 96, model: 'spiral', incl: 59, pa: 157, desc: { zh: '结构优美的大型旋涡星系，与雪茄星系 M82 发生着引力相互作用。', en: 'A grand-design spiral interacting gravitationally with the Cigar Galaxy, M82.' } },
  { id: 'm82', name: { zh: '雪茄星系（M82）', en: 'Cigar Galaxy (M82)' }, ra: '09 55 52.7', dec: '+69 40 46', distKly: 11400, type: 'I0', diameterKly: 37, model: 'irregular', desc: { zh: '典型的星暴星系，与 M81 的近距离交会触发了剧烈的恒星形成和壮观的银河风。', en: 'A prototypical starburst; a close encounter with M81 triggered intense star formation and a spectacular galactic wind.' } },
  { id: 'cen-a', name: { zh: '半人马座 A（NGC 5128）', en: 'Centaurus A (NGC 5128)' }, ra: '13 25 27.6', dec: '-43 01 09', distKly: 12400, type: 'S0 pec', diameterKly: 97, model: 'elliptical', desc: { zh: '离我们最近的活动星系之一，中心超大质量黑洞喷出长达百万光年的射电喷流，横贯星系的尘埃带是并合的痕迹。', en: 'One of the nearest active galaxies: its central black hole launches million-light-year radio jets, and its dust lane betrays a past merger.' } },
  { id: 'm83', name: { zh: '南风车星系（M83）', en: 'Southern Pinwheel (M83)' }, ra: '13 37 00.9', dec: '-29 51 57', distKly: 15200, type: 'SAB(s)c', diameterKly: 55, model: 'barred', incl: 24, pa: 45 },
  { id: 'm64', name: { zh: '黑眼星系（M64）', en: 'Black Eye Galaxy (M64)' }, ra: '12 56 43.7', dec: '+21 40 58', distKly: 17300, type: '(R)SA(rs)ab', diameterKly: 54, model: 'spiral', incl: 60, pa: 115 },
  { id: 'm101', name: { zh: '风车星系（M101）', en: 'Pinwheel Galaxy (M101)' }, ra: '14 03 12.6', dec: '+54 20 57', distKly: 20900, type: 'SAB(rs)cd', diameterKly: 170, model: 'spiral', incl: 18, pa: 39, desc: { zh: '正面朝向我们的大型旋涡星系，直径约为银河系的 1.7 倍。', en: 'A face-on giant spiral about 1.7 times the Milky Way’s diameter.' } },
  { id: 'm51', name: { zh: '涡状星系（M51）', en: 'Whirlpool Galaxy (M51)' }, ra: '13 29 52.7', dec: '+47 11 43', distKly: 31000, type: 'SA(s)bc pec', diameterKly: 76, model: 'spiral', incl: 22, pa: 163, desc: { zh: '第一个被发现具有旋涡结构的星系（1845 年），与伴星系 NGC 5195 相互作用。', en: 'The first galaxy recognised as a spiral (1845), interacting with its companion NGC 5195.' } },
  { id: 'm104', name: { zh: '草帽星系（M104）', en: 'Sombrero Galaxy (M104)' }, ra: '12 39 59.4', dec: '-11 37 23', distKly: 31100, type: 'SA(s)a', diameterKly: 49, model: 'spiral', incl: 84, pa: 90, desc: { zh: '侧向我们的星系，明亮的核球和醒目的尘埃带使它形似一顶墨西哥草帽。', en: 'Seen nearly edge-on, its bright bulge and striking dust lane resemble a Mexican hat.' } },
  { id: 'antennae', name: { zh: '触须星系', en: 'Antennae Galaxies' }, ra: '12 01 53.0', dec: '-18 52 10', distKly: 45000, type: 'SB(s)m pec', diameterKly: 500, model: 'irregular', desc: { zh: '一对正在碰撞的星系，潮汐力拉出两条长长的“触须”，并触发了大规模恒星形成。', en: 'A pair of colliding galaxies whose tides have drawn out two long “antennae” and triggered massive star formation.' } },
  { id: 'm87', name: { zh: 'M87（室女座 A）', en: 'M87 (Virgo A)' }, ra: '12 30 49.4', dec: '+12 23 28', distKly: 53500, type: 'E+0-1 pec', diameterKly: 132, model: 'elliptical', desc: { zh: '室女座星系团中心的超巨椭圆星系。2019 年事件视界望远镜在这里拍下了人类第一张黑洞照片（质量 65 亿倍太阳）。', en: 'The supergiant elliptical at the heart of the Virgo Cluster, where the Event Horizon Telescope imaged the first black hole (6.5 billion M☉) in 2019.' } },
  { id: 'ngc1300', name: { zh: 'NGC 1300', en: 'NGC 1300' }, ra: '03 19 41.1', dec: '-19 24 41', distKly: 61000, type: 'SB(rs)bc', diameterKly: 110, model: 'barred', incl: 35, pa: 106, desc: { zh: '教科书级的棒旋星系。', en: 'A textbook barred spiral galaxy.' } },
  { id: 'stephan', name: { zh: '史蒂芬五重星系', en: "Stephan's Quintet" }, ra: '22 35 57.5', dec: '+33 57 36', distKly: 290000, type: 'Compact group', diameterKly: 300, model: 'irregular', desc: { zh: '第一个被发现的致密星系群，也是詹姆斯·韦布太空望远镜的首批图像之一。', en: 'The first compact galaxy group ever discovered and one of JWST’s first images.' } },
  { id: 'cartwheel', name: { zh: '车轮星系', en: 'Cartwheel Galaxy' }, ra: '00 37 41.1', dec: '-33 42 59', distKly: 500000, type: 'S pec (ring)', diameterKly: 150, model: 'irregular', desc: { zh: '一个小星系高速穿过其中心后形成的环状星系。', en: 'A ring galaxy formed after a smaller galaxy plunged through its centre.' } },
  { id: 'hoag', name: { zh: '霍格天体', en: "Hoag's Object" }, ra: '15 17 14.4', dec: '+21 35 08', distKly: 612800, type: 'Ring', diameterKly: 120, model: 'irregular' },
  { id: 'ic1101', name: { zh: 'IC 1101', en: 'IC 1101' }, ra: '15 10 56.1', dec: '+05 44 41', z: 0.0777, type: 'S0 / cD', diameterKly: 1000, model: 'elliptical', desc: { zh: '已知最大的星系之一，弥散的恒星晕可延伸约 400 万光年。', en: 'One of the largest known galaxies, with a diffuse stellar halo extending some 4 million light-years.' } },
  { id: '3c273', kind: 'quasar', name: { zh: '3C 273', en: '3C 273' }, ra: '12 29 06.7', dec: '+02 03 09', z: 0.158, type: 'Quasar', diameterKly: 200, model: 'elliptical', desc: { zh: '第一个被证认的类星体（1963 年），光度是银河系的约 4 万亿倍，由超大质量黑洞吸积驱动。', en: 'The first quasar identified (1963), ~4 trillion times as luminous as the Milky Way, powered by an accreting supermassive black hole.' } },
  { id: 'ton618', kind: 'quasar', name: { zh: 'TON 618', en: 'TON 618' }, ra: '12 28 24.9', dec: '+31 28 38', z: 2.219, type: 'Quasar', diameterKly: 100, model: 'elliptical', desc: { zh: '拥有已知质量最大黑洞之一的类星体，中心黑洞约 400 亿倍太阳质量。', en: 'A quasar hosting one of the most massive known black holes, ~40 billion M☉.' } },
  { id: 'ulas-j1342', kind: 'quasar', name: { zh: 'ULAS J1342+0928', en: 'ULAS J1342+0928' }, ra: '13 42 08.1', dec: '+09 28 38', z: 7.54, type: 'Quasar', diameterKly: 50, model: 'elliptical', desc: { zh: '已知最遥远的类星体之一，宇宙仅 6.9 亿岁时其黑洞就已达 8 亿倍太阳质量。', en: 'One of the most distant quasars: its black hole had reached 800 million M☉ when the universe was only 690 million years old.' } },
  { id: 'gn-z11', name: { zh: 'GN-z11', en: 'GN-z11' }, ra: '12 36 25.5', dec: '+62 14 31', z: 10.6, type: 'Irregular', diameterKly: 2, model: 'irregular', desc: { zh: '哈勃发现、韦布证实的遥远星系，我们看到的是宇宙约 4.3 亿岁时的它。', en: 'Found by Hubble and confirmed by JWST; we see it as it was ~430 million years after the Big Bang.' } },
  { id: 'jades-z14', name: { zh: 'JADES-GS-z14-0', en: 'JADES-GS-z14-0' }, ra: '03 32 19.9', dec: '-27 51 20', z: 14.32, type: 'Irregular', diameterKly: 1.6, model: 'irregular', desc: { zh: '韦布望远镜发现的最遥远星系之一，光线出发时宇宙只有约 2.9 亿岁。', en: 'One of the most distant galaxies known, discovered by JWST; its light left when the universe was ~290 million years old.' } },
];
