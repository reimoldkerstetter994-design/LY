import type { Bilingual } from './types';

export interface StructureData {
  id: string;
  name: Bilingual;
  kind: 'group' | 'cluster' | 'supercluster' | 'void' | 'structure';
  ra?: string;
  dec?: string;
  /** Galactic coordinates (degrees) when RA/Dec is not given. */
  l?: number;
  b?: number;
  distMly?: number;
  z?: number;
  /** Characteristic diameter in Mly. */
  sizeMly: number;
  /** Relative galaxy richness used to populate the procedural local universe. */
  richness: number;
  desc: Bilingual;
}

export const STRUCTURES: StructureData[] = [
  {
    id: 'local-group', kind: 'group', name: { zh: '本星系群', en: 'Local Group' }, l: 121, b: -22, distMly: 1.2, sizeMly: 10, richness: 0,
    desc: { zh: '银河系所在的星系群，包含仙女座星系、银河系、三角座星系三大旋涡星系及 80 多个矮星系，直径约 1000 万光年。', en: 'Our home group: three large spirals — Andromeda, the Milky Way and Triangulum — plus more than 80 dwarfs, about 10 million light-years across.' },
  },
  { id: 'm81-group', kind: 'group', name: { zh: 'M81 星系群', en: 'M81 Group' }, ra: '09 55 33', dec: '+69 03 55', distMly: 11.8, sizeMly: 3, richness: 6, desc: { zh: '离本星系群最近的星系群之一，以 M81 和 M82 为核心。', en: 'One of the nearest groups to ours, centred on M81 and M82.' } },
  { id: 'cen-a-group', kind: 'group', name: { zh: '半人马座 A / M83 星系群', en: 'Centaurus A / M83 Group' }, ra: '13 25 27', dec: '-43 01 09', distMly: 12.4, sizeMly: 4, richness: 8, desc: { zh: '以活动星系半人马座 A 和南风车星系为中心的近邻星系群。', en: 'A nearby group around the active galaxy Centaurus A and the Southern Pinwheel.' } },
  { id: 'sculptor-group', kind: 'group', name: { zh: '玉夫座星系群', en: 'Sculptor Group' }, ra: '00 47 33', dec: '-25 17 18', distMly: 11.4, sizeMly: 4, richness: 5, desc: { zh: '离本星系群最近的星系群，沿视线方向拉长。', en: 'The nearest group to the Local Group, elongated along our line of sight.' } },
  { id: 'maffei-group', kind: 'group', name: { zh: '马菲星系群', en: 'Maffei Group' }, ra: '02 36 35', dec: '+59 39 19', distMly: 9.8, sizeMly: 3, richness: 4, desc: { zh: '隐藏在银河“隐带”后面的近邻星系群。', en: 'A nearby group hidden behind the Milky Way’s zone of avoidance.' } },
  { id: 'm101-group', kind: 'group', name: { zh: 'M101 星系群', en: 'M101 Group' }, ra: '14 03 12', dec: '+54 20 57', distMly: 21, sizeMly: 3, richness: 4, desc: { zh: '以风车星系 M101 为主的星系群。', en: 'A group dominated by the Pinwheel Galaxy, M101.' } },
  { id: 'leo-triplet', kind: 'group', name: { zh: '狮子座三重星系', en: 'Leo Triplet' }, ra: '11 19 00', dec: '+13 25 00', distMly: 35, sizeMly: 1, richness: 3, desc: { zh: 'M65、M66 与 NGC 3628 组成的相互作用星系群。', en: 'An interacting trio of M65, M66 and NGC 3628.' } },
  {
    id: 'virgo-cluster', kind: 'cluster', name: { zh: '室女座星系团', en: 'Virgo Cluster' }, ra: '12 27 00', dec: '+12 43 00', distMly: 53.8, sizeMly: 15, richness: 60,
    desc: { zh: '离我们最近的大型星系团，包含 1300–2000 个星系，总质量约 1.2×10¹⁵ 倍太阳质量，是本超星系团的引力中心，本星系群正被它缓慢吸引。', en: 'The nearest large cluster, with 1300–2000 galaxies and ~1.2×10¹⁵ M☉. It anchors the Local Supercluster and is slowly pulling the Local Group towards it.' },
  },
  { id: 'fornax-cluster', kind: 'cluster', name: { zh: '天炉座星系团', en: 'Fornax Cluster' }, ra: '03 38 29', dec: '-35 27 03', distMly: 62, sizeMly: 8, richness: 18, desc: { zh: '南天第二近的星系团，结构致密，以椭圆星系 NGC 1399 为中心。', en: 'The second-nearest cluster in the southern sky, compact and centred on the elliptical NGC 1399.' } },
  { id: 'eridanus-cluster', kind: 'cluster', name: { zh: '波江座星系团', en: 'Eridanus Cluster' }, ra: '03 40 12', dec: '-18 34 49', distMly: 75, sizeMly: 7, richness: 12, desc: { zh: '与天炉座星系团相邻、正在形成中的星系团。', en: 'A forming cluster neighbouring Fornax.' } },
  { id: 'ursa-major-cluster', kind: 'cluster', name: { zh: '大熊座星系团', en: 'Ursa Major Cluster' }, ra: '11 56 00', dec: '+49 00 00', distMly: 61, sizeMly: 10, richness: 14, desc: { zh: '以旋涡星系为主、结构松散的星系团。', en: 'A loose cluster dominated by spiral galaxies.' } },
  { id: 'hydra-cluster', kind: 'cluster', name: { zh: '长蛇座星系团（Abell 1060）', en: 'Hydra Cluster (Abell 1060)' }, ra: '10 36 42.8', dec: '-27 31 42', distMly: 158, sizeMly: 10, richness: 30, desc: { zh: '长蛇—半人马超星系团的成员，含约 150 个明亮星系。', en: 'A member of the Hydra–Centaurus Supercluster with ~150 bright galaxies.' } },
  { id: 'centaurus-cluster', kind: 'cluster', name: { zh: '半人马座星系团（Abell 3526）', en: 'Centaurus Cluster (Abell 3526)' }, ra: '12 48 49.3', dec: '-41 18 40', distMly: 170, sizeMly: 12, richness: 40, desc: { zh: '富星系团，中心的 NGC 4696 周围环绕着高温 X 射线气体。', en: 'A rich cluster whose central galaxy NGC 4696 sits in hot X-ray-emitting gas.' } },
  {
    id: 'norma-cluster', kind: 'cluster', name: { zh: '矩尺座星系团（Abell 3627）', en: 'Norma Cluster (Abell 3627)' }, ra: '16 15 03', dec: '-60 54 26', distMly: 222, sizeMly: 12, richness: 55,
    desc: { zh: '位于“巨引源”中心附近的大质量星系团，但被银河系盘面遮挡，长期难以观测。', en: 'A massive cluster near the centre of the Great Attractor, long hidden behind the Milky Way’s disc.' },
  },
  {
    id: 'great-attractor', kind: 'structure', name: { zh: '巨引源', en: 'Great Attractor' }, l: 307.8, b: 9.3, distMly: 220, sizeMly: 300, richness: 0,
    desc: { zh: '拉尼亚凯亚超星系团的引力中心附近的质量集中区，数万个星系（包括银河系）都在朝它的方向运动，速度约 600 km/s。', en: 'A mass concentration near the gravitational centre of Laniakea; tens of thousands of galaxies, including ours, stream towards it at ~600 km/s.' },
  },
  { id: 'perseus-cluster', kind: 'cluster', name: { zh: '英仙座星系团（Abell 426）', en: 'Perseus Cluster (Abell 426)' }, ra: '03 19 47.2', dec: '+41 30 47', distMly: 240, sizeMly: 15, richness: 70, desc: { zh: 'X 射线最亮的星系团。中心黑洞产生的声波使高温气体“哼”出了比钢琴中央 C 低 57 个八度的音。', en: 'The brightest cluster in X-rays; pressure waves from its central black hole “hum” 57 octaves below middle C.' } },
  { id: 'pisces-cluster', kind: 'cluster', name: { zh: '双鱼座星系团（Abell 262）', en: 'Pisces Cluster (Abell 262)' }, ra: '01 52 46', dec: '+36 09 06', distMly: 220, sizeMly: 8, richness: 25, desc: { zh: '英仙—双鱼超星系团链条上的星系团。', en: 'A cluster on the Perseus–Pisces supercluster chain.' } },
  {
    id: 'coma-cluster', kind: 'cluster', name: { zh: '后发座星系团（Abell 1656）', en: 'Coma Cluster (Abell 1656)' }, ra: '12 59 48.7', dec: '+27 58 50', distMly: 321, sizeMly: 20, richness: 90,
    desc: { zh: '包含 1000 多个星系的富星系团。1933 年兹威基发现其星系运动过快、可见物质不足以束缚，首次提出了“暗物质”。', en: 'A rich cluster of more than 1000 galaxies. In 1933 Zwicky found its galaxies moving too fast for the visible mass to hold them — the first case for dark matter.' },
  },
  { id: 'leo-cluster', kind: 'cluster', name: { zh: '狮子座星系团（Abell 1367）', en: 'Leo Cluster (Abell 1367)' }, ra: '11 44 02', dec: '+19 50 00', distMly: 330, sizeMly: 12, richness: 45, desc: { zh: '与后发座星系团一起构成后发超星系团。', en: 'With the Coma Cluster it forms the Coma Supercluster.' } },
  { id: 'hercules-cluster', kind: 'cluster', name: { zh: '武仙座星系团（Abell 2151）', en: 'Hercules Cluster (Abell 2151)' }, ra: '16 05 15', dec: '+17 44 55', distMly: 500, sizeMly: 12, richness: 45, desc: { zh: '富含旋涡星系和相互作用星系的年轻星系团。', en: 'A young cluster rich in spirals and interacting galaxies.' } },
  {
    id: 'shapley', kind: 'supercluster', name: { zh: '沙普利超星系团', en: 'Shapley Supercluster' }, ra: '13 27 57.5', dec: '-31 29 44', distMly: 650, sizeMly: 400, richness: 160,
    desc: { zh: '近邻宇宙中质量最大的超星系团，约 10¹⁶ 倍太阳质量，对本星系群的运动也有可观的引力贡献。', en: 'The most massive supercluster in the nearby universe (~10¹⁶ M☉), contributing noticeably to the Local Group’s motion.' },
  },
  { id: 'horologium', kind: 'supercluster', name: { zh: '时钟—网罟超星系团', en: 'Horologium–Reticulum Supercluster' }, ra: '03 19 00', dec: '-50 02 00', distMly: 700, sizeMly: 550, richness: 120, desc: { zh: '南天巨大的超星系团，跨度约 5.5 亿光年。', en: 'A huge southern supercluster spanning ~550 million light-years.' } },
  { id: 'corona-borealis', kind: 'supercluster', name: { zh: '北冕座超星系团', en: 'Corona Borealis Supercluster' }, ra: '15 22 42', dec: '+31 02 59', distMly: 946, sizeMly: 330, richness: 90, desc: { zh: '北天最致密的超星系团之一，包含多个 Abell 富星系团。', en: 'One of the densest northern superclusters, containing several rich Abell clusters.' } },
  {
    id: 'laniakea', kind: 'supercluster', name: { zh: '拉尼亚凯亚超星系团', en: 'Laniakea Supercluster' }, l: 307, b: 9, distMly: 160, sizeMly: 520, richness: 0,
    desc: { zh: '我们的“宇宙家园”：2014 年根据星系运动流划定的超星系团，直径约 5.2 亿光年，含约 10 万个星系，夏威夷语意为“无尽的天堂”。', en: 'Our cosmic home: a supercluster defined in 2014 from galaxy flows, ~520 million light-years across with ~100 000 galaxies. Its Hawaiian name means “immense heaven”.' },
  },
  {
    id: 'virgo-supercluster', kind: 'supercluster', name: { zh: '本超星系团（室女座超星系团）', en: 'Local (Virgo) Supercluster' }, ra: '12 27 00', dec: '+12 43 00', distMly: 40, sizeMly: 110, richness: 0,
    desc: { zh: '以室女座星系团为中心、包含本星系群在内的扁平星系集合，现被视为拉尼亚凯亚的一个分支。', en: 'The flattened assembly around the Virgo Cluster that includes the Local Group, now considered a lobe of Laniakea.' },
  },
  { id: 'perseus-pisces', kind: 'supercluster', name: { zh: '英仙—双鱼超星系团', en: 'Perseus–Pisces Supercluster' }, ra: '02 30 00', dec: '+38 00 00', distMly: 250, sizeMly: 300, richness: 0, desc: { zh: '近邻宇宙中最显著的星系链之一，与拉尼亚凯亚隔着本地空洞相望。', en: 'One of the most prominent galaxy chains nearby, facing Laniakea across the Local Void.' } },
  { id: 'local-void', kind: 'void', name: { zh: '本地空洞', en: 'Local Void' }, ra: '19 00 00', dec: '+15 00 00', distMly: 75, sizeMly: 150, richness: 0, desc: { zh: '紧邻本星系群的巨大空洞，几乎没有星系，本星系群正以约 260 km/s 的速度远离它。', en: 'A vast, nearly empty region next to the Local Group; we are moving away from it at ~260 km/s.' } },
  { id: 'bootes-void', kind: 'void', name: { zh: '牧夫座空洞', en: 'Boötes Void' }, ra: '14 50 00', dec: '+46 00 00', distMly: 700, sizeMly: 330, richness: 0, desc: { zh: '著名的“巨洞”，直径约 3.3 亿光年，内部只发现了约 60 个星系。', en: 'The famous “Great Nothing”, ~330 million light-years across with only ~60 galaxies found inside.' } },
  { id: 'cfa2-wall', kind: 'structure', name: { zh: 'CfA2 巨壁', en: 'CfA2 Great Wall' }, ra: '12 30 00', dec: '+29 00 00', distMly: 300, sizeMly: 500, richness: 0, desc: { zh: '1989 年发现的星系“长城”，长约 5 亿光年、厚仅约 1500 万光年，后发座星系团位于其中。', en: 'A sheet of galaxies discovered in 1989, ~500 million light-years long but only ~15 million thick, containing the Coma Cluster.' } },
  { id: 'sloan-wall', kind: 'structure', name: { zh: '斯隆长城', en: 'Sloan Great Wall' }, ra: '13 00 00', dec: '+04 00 00', distMly: 1000, sizeMly: 1380, richness: 0, desc: { zh: '斯隆数字巡天发现的巨大星系壁，长约 13.8 亿光年。', en: 'A giant wall of galaxies found by the Sloan Digital Sky Survey, ~1.38 billion light-years long.' } },
  { id: 'eridanus-supervoid', kind: 'void', name: { zh: '波江座超空洞（CMB 冷斑）', en: 'Eridanus Supervoid (CMB Cold Spot)' }, l: 209, b: -57, z: 0.15, sizeMly: 1000, richness: 0, desc: { zh: '与宇宙微波背景“冷斑”方向重合的超大空洞，二者是否存在因果联系仍有争议。', en: 'A huge void aligned with the CMB Cold Spot; whether the two are causally linked is still debated.' } },
  { id: 'giant-arc', kind: 'structure', name: { zh: '巨弧', en: 'Giant Arc' }, ra: '14 40 00', dec: '+22 00 00', z: 0.802, sizeMly: 3300, richness: 0, desc: { zh: '2021 年发现的约 33 亿光年长的弧形星系结构，对宇宙学原理提出了挑战。', en: 'A ~3.3-billion-light-year arc of galaxies found in 2021, challenging the cosmological principle.' } },
  { id: 'huge-lqg', kind: 'structure', name: { zh: '巨型大类星体群', en: 'Huge-LQG' }, ra: '10 49 47', dec: '+14 20 00', z: 1.27, sizeMly: 4000, richness: 0, desc: { zh: '由 73 个类星体组成、跨度约 40 亿光年的结构。', en: 'A structure of 73 quasars spanning ~4 billion light-years.' } },
  {
    id: 'hercb-wall', kind: 'structure', name: { zh: '武仙—北冕座长城', en: 'Hercules–Corona Borealis Great Wall' }, ra: '16 30 00', dec: '+27 00 00', z: 1.8, sizeMly: 10000, richness: 0,
    desc: { zh: '由伽马射线暴分布推断出的、可能是已知最大的宇宙结构，长约 100 亿光年（存在争议）。', en: 'Inferred from gamma-ray-burst clustering, possibly the largest known structure at ~10 billion light-years (debated).' },
  },
  { id: 'bullet-cluster', kind: 'cluster', name: { zh: '子弹星系团', en: 'Bullet Cluster' }, ra: '06 58 37.9', dec: '-55 57 00', z: 0.296, sizeMly: 10, richness: 0, desc: { zh: '两个正在碰撞的星系团。引力透镜显示的质量分布与高温气体分离，被视为暗物质存在的直接证据。', en: 'Two colliding clusters whose lensing mass is offset from their hot gas — direct evidence for dark matter.' } },
  { id: 'el-gordo', kind: 'cluster', name: { zh: '“胖子”星系团', en: 'El Gordo' }, ra: '01 02 52.5', dec: '-49 14 58', z: 0.87, sizeMly: 12, richness: 0, desc: { zh: '遥远宇宙中质量最大的碰撞星系团，约 3×10¹⁵ 倍太阳质量。', en: 'The most massive colliding cluster in the distant universe, ~3×10¹⁵ M☉.' } },
  { id: 'hudf', kind: 'structure', name: { zh: '哈勃超深场', en: 'Hubble Ultra Deep Field' }, ra: '03 32 39.0', dec: '-27 47 29', z: 4, sizeMly: 200, richness: 0, desc: { zh: '天炉座中一小块仅约满月 1/100 面积的天区，却包含约 1 万个星系，最远的光来自 130 多亿年前。', en: 'A patch of Fornax about 1/100 of the full Moon’s area containing ~10 000 galaxies, the faintest seen as they were over 13 billion years ago.' } },
];
