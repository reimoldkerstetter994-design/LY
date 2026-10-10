import type { Bilingual } from './types';

export interface StarData {
  id: string;
  name: Bilingual;
  ra: string;
  dec: string;
  distLy: number;
  spectral: string;
  vmag: number;
  /** Radius in solar radii. */
  radius?: number;
  desc?: Bilingual;
  kind?: 'star' | 'nebula' | 'star-cluster' | 'black-hole';
  /** Physical size for extended objects, light-years. */
  sizeLy?: number;
}

export const STARS: StarData[] = [
  {
    id: 'proxima', name: { zh: '比邻星', en: 'Proxima Centauri' }, ra: '14 29 42.9', dec: '-62 40 46', distLy: 4.2465, spectral: 'M5.5V', vmag: 11.13, radius: 0.154,
    desc: { zh: '离太阳最近的恒星，是一颗暗弱的红矮星，宜居带内至少有一颗类地行星比邻星 b。', en: 'The nearest star to the Sun, a faint red dwarf hosting at least one Earth-mass planet, Proxima b, in its habitable zone.' },
  },
  {
    id: 'alpha-cen-a', name: { zh: '南门二 A', en: 'Alpha Centauri A' }, ra: '14 39 36.5', dec: '-60 50 02', distLy: 4.344, spectral: 'G2V', vmag: 0.01, radius: 1.22,
    desc: { zh: '与太阳非常相似的恒星，和南门二 B、比邻星组成离我们最近的三合星系统，是夜空中第三亮的恒星。', en: 'A Sun-like star that, with Alpha Cen B and Proxima, forms the nearest triple system; the third-brightest star in the night sky.' },
  },
  { id: 'alpha-cen-b', name: { zh: '南门二 B', en: 'Alpha Centauri B' }, ra: '14 39 35.1', dec: '-60 50 14', distLy: 4.344, spectral: 'K1V', vmag: 1.33, radius: 0.86 },
  {
    id: 'barnard', name: { zh: '巴纳德星', en: "Barnard's Star" }, ra: '17 57 48.5', dec: '+04 41 36', distLy: 5.963, spectral: 'M4V', vmag: 9.51, radius: 0.187,
    desc: { zh: '自行最快的恒星，每年在天空中移动 10.3 角秒；2024 年确认拥有多颗小型行星。', en: 'The star with the largest proper motion (10.3″ per year); several small planets were confirmed around it in 2024.' },
  },
  { id: 'wolf359', name: { zh: '沃夫 359', en: 'Wolf 359' }, ra: '10 56 29.2', dec: '+07 00 53', distLy: 7.86, spectral: 'M6V', vmag: 13.51, radius: 0.144 },
  { id: 'lalande21185', name: { zh: '拉兰德 21185', en: 'Lalande 21185' }, ra: '11 03 20.2', dec: '+35 58 12', distLy: 8.31, spectral: 'M2V', vmag: 7.52, radius: 0.39 },
  {
    id: 'sirius', name: { zh: '天狼星', en: 'Sirius' }, ra: '06 45 08.9', dec: '-16 42 58', distLy: 8.6, spectral: 'A1V', vmag: -1.46, radius: 1.71,
    desc: { zh: '夜空中最亮的恒星，亮度是太阳的 25 倍，还有一颗白矮星伴星天狼星 B。', en: 'The brightest star in the night sky, 25 times as luminous as the Sun, with a white-dwarf companion, Sirius B.' },
  },
  { id: 'uv-ceti', name: { zh: '鲸鱼座 UV', en: 'Luyten 726-8 (UV Ceti)' }, ra: '01 39 01.3', dec: '-17 57 01', distLy: 8.73, spectral: 'M5.5V', vmag: 12.5, radius: 0.14 },
  { id: 'ross154', name: { zh: '罗斯 154', en: 'Ross 154' }, ra: '18 49 49.4', dec: '-23 50 10', distLy: 9.7, spectral: 'M3.5V', vmag: 10.43, radius: 0.24 },
  { id: 'ross248', name: { zh: '罗斯 248', en: 'Ross 248' }, ra: '23 41 54.7', dec: '+44 10 30', distLy: 10.3, spectral: 'M5.5V', vmag: 12.29, radius: 0.16 },
  {
    id: 'eps-eri', name: { zh: '天苑四', en: 'Epsilon Eridani' }, ra: '03 32 55.8', dec: '-09 27 30', distLy: 10.5, spectral: 'K2V', vmag: 3.73, radius: 0.74,
    desc: { zh: '年轻的类太阳恒星，周围有尘埃盘和一颗类木行星。', en: 'A young Sun-like star with debris discs and a Jupiter-like planet.' },
  },
  { id: 'lacaille9352', name: { zh: '拉卡伊 9352', en: 'Lacaille 9352' }, ra: '23 05 52.0', dec: '-35 51 11', distLy: 10.7, spectral: 'M0.5V', vmag: 7.34, radius: 0.47 },
  { id: 'ross128', name: { zh: '罗斯 128', en: 'Ross 128' }, ra: '11 47 44.4', dec: '+00 48 16', distLy: 11.0, spectral: 'M4V', vmag: 11.13, radius: 0.2 },
  {
    id: 'procyon', name: { zh: '南河三', en: 'Procyon' }, ra: '07 39 18.1', dec: '+05 13 30', distLy: 11.46, spectral: 'F5IV', vmag: 0.34, radius: 2.05,
    desc: { zh: '小犬座最亮星，冬季大三角的一角，也有一颗白矮星伴星。', en: 'The brightest star in Canis Minor, a corner of the Winter Triangle, also with a white-dwarf companion.' },
  },
  {
    id: '61cyg', name: { zh: '天鹅座 61', en: '61 Cygni' }, ra: '21 06 53.9', dec: '+38 44 58', distLy: 11.4, spectral: 'K5V', vmag: 5.21, radius: 0.67,
    desc: { zh: '1838 年贝塞尔首次用视差法测出距离的恒星，人类第一次知道恒星有多远。', en: 'The first star whose distance was measured by parallax (Bessel, 1838) — humanity’s first stellar distance.' },
  },
  { id: 'eps-indi', name: { zh: '印第安座 ε', en: 'Epsilon Indi' }, ra: '22 03 21.7', dec: '-56 47 10', distLy: 11.9, spectral: 'K5V', vmag: 4.69, radius: 0.71 },
  {
    id: 'tau-ceti', name: { zh: '天仓五', en: 'Tau Ceti' }, ra: '01 44 04.1', dec: '-15 56 15', distLy: 11.9, spectral: 'G8V', vmag: 3.5, radius: 0.79,
    desc: { zh: '离我们最近的单颗类太阳恒星之一，是搜寻地外文明的经典目标。', en: 'One of the nearest single Sun-like stars and a classic SETI target.' },
  },
  { id: 'luyten', name: { zh: '鲁坦星', en: "Luyten's Star" }, ra: '07 27 24.5', dec: '+05 13 33', distLy: 12.3, spectral: 'M3.5V', vmag: 9.87, radius: 0.29 },
  { id: 'teegarden', name: { zh: '蒂加登星', en: "Teegarden's Star" }, ra: '02 53 00.9', dec: '+16 52 53', distLy: 12.5, spectral: 'M7V', vmag: 15.13, radius: 0.11 },
  { id: 'kapteyn', name: { zh: '卡普坦星', en: "Kapteyn's Star" }, ra: '05 11 40.6', dec: '-45 01 06', distLy: 12.8, spectral: 'M1V', vmag: 8.85, radius: 0.29 },
  { id: 'van-maanen', name: { zh: '范玛宁星', en: "Van Maanen's Star" }, ra: '00 49 09.9', dec: '+05 23 19', distLy: 14.1, spectral: 'DZ7', vmag: 12.38, radius: 0.011, desc: { zh: '离太阳最近的孤立白矮星。', en: 'The nearest solitary white dwarf.' } },
  {
    id: 'altair', name: { zh: '牛郎星（河鼓二）', en: 'Altair' }, ra: '19 50 47.0', dec: '+08 52 06', distLy: 16.73, spectral: 'A7V', vmag: 0.76, radius: 1.8,
    desc: { zh: '夏季大三角之一，自转极快（约 9 小时一周），因此呈明显的扁球形。', en: 'Part of the Summer Triangle; it spins so fast (≈9 h) that it is visibly flattened.' },
  },
  {
    id: 'vega', name: { zh: '织女星（织女一）', en: 'Vega' }, ra: '18 36 56.3', dec: '+38 47 01', distLy: 25.04, spectral: 'A0V', vmag: 0.03, radius: 2.36,
    desc: { zh: '天文测光的零等星标准，约 1.2 万年后将成为北极星。', en: 'The traditional zero point of stellar magnitudes; in ~12 000 years it will be the pole star.' },
  },
  { id: 'fomalhaut', name: { zh: '北落师门', en: 'Fomalhaut' }, ra: '22 57 39.0', dec: '-29 37 20', distLy: 25.13, spectral: 'A3V', vmag: 1.16, radius: 1.84 },
  {
    id: 'trappist1', name: { zh: 'TRAPPIST-1', en: 'TRAPPIST-1' }, ra: '23 06 29.3', dec: '-05 02 29', distLy: 40.66, spectral: 'M8V', vmag: 18.8, radius: 0.12,
    desc: { zh: '超冷红矮星，拥有 7 颗岩质行星，其中 3 颗位于宜居带。', en: 'An ultracool red dwarf with seven rocky planets, three of them in the habitable zone.' },
  },
  { id: 'pollux', name: { zh: '北河三', en: 'Pollux' }, ra: '07 45 18.9', dec: '+28 01 34', distLy: 33.78, spectral: 'K0III', vmag: 1.14, radius: 9.06 },
  {
    id: 'arcturus', name: { zh: '大角星', en: 'Arcturus' }, ra: '14 15 39.7', dec: '+19 10 57', distLy: 36.7, spectral: 'K1.5III', vmag: -0.05, radius: 25.4,
    desc: { zh: '北天最亮的恒星，一颗年老的橙色巨星。', en: 'The brightest star of the northern sky, an old orange giant.' },
  },
  { id: 'capella', name: { zh: '五车二', en: 'Capella' }, ra: '05 16 41.4', dec: '+45 59 53', distLy: 42.9, spectral: 'G3III', vmag: 0.08, radius: 11.98 },
  { id: 'castor', name: { zh: '北河二', en: 'Castor' }, ra: '07 34 35.9', dec: '+31 53 18', distLy: 51, spectral: 'A1V', vmag: 1.58, radius: 2.4 },
  { id: 'aldebaran', name: { zh: '毕宿五', en: 'Aldebaran' }, ra: '04 35 55.2', dec: '+16 30 33', distLy: 65.3, spectral: 'K5III', vmag: 0.86, radius: 45.1, desc: { zh: '金牛座的“牛眼”，一颗橙色巨星。', en: 'The orange-giant “eye of the Bull” in Taurus.' } },
  { id: 'regulus', name: { zh: '轩辕十四', en: 'Regulus' }, ra: '10 08 22.3', dec: '+11 58 02', distLy: 79.3, spectral: 'B8IV', vmag: 1.36, radius: 4.35 },
  { id: 'mizar', name: { zh: '开阳', en: 'Mizar' }, ra: '13 23 55.5', dec: '+54 55 31', distLy: 82.9, spectral: 'A2V', vmag: 2.23, radius: 2.4, desc: { zh: '北斗七星之一，著名的目视双星。', en: 'A star of the Big Dipper and a famous visual double.' } },
  { id: 'alioth', name: { zh: '玉衡', en: 'Alioth' }, ra: '12 54 01.7', dec: '+55 57 35', distLy: 82.6, spectral: 'A1III', vmag: 1.77, radius: 4.14 },
  { id: 'dubhe', name: { zh: '天枢', en: 'Dubhe' }, ra: '11 03 43.7', dec: '+61 45 03', distLy: 123, spectral: 'K0III', vmag: 1.79, radius: 17 },
  { id: 'merak', name: { zh: '天璇', en: 'Merak' }, ra: '11 01 50.5', dec: '+56 22 57', distLy: 79.7, spectral: 'A1V', vmag: 2.37, radius: 3.0 },
  { id: 'phecda', name: { zh: '天玑', en: 'Phecda' }, ra: '11 53 49.8', dec: '+53 41 41', distLy: 83.2, spectral: 'A0V', vmag: 2.44, radius: 3.0 },
  { id: 'megrez', name: { zh: '天权', en: 'Megrez' }, ra: '12 15 25.6', dec: '+57 01 57', distLy: 80.5, spectral: 'A3V', vmag: 3.31, radius: 1.4 },
  { id: 'alkaid', name: { zh: '摇光', en: 'Alkaid' }, ra: '13 47 32.4', dec: '+49 18 48', distLy: 104, spectral: 'B3V', vmag: 1.86, radius: 3.4 },
  { id: 'gacrux', name: { zh: '十字架一', en: 'Gacrux' }, ra: '12 31 09.9', dec: '-57 06 47', distLy: 88.6, spectral: 'M3.5III', vmag: 1.64, radius: 73 },
  { id: 'algol', name: { zh: '大陵五', en: 'Algol' }, ra: '03 08 10.1', dec: '+40 57 20', distLy: 90, spectral: 'B8V', vmag: 2.12, radius: 2.73, desc: { zh: '著名的食双星，每 2.87 天亮度明显变暗一次，古称“魔星”。', en: 'The famous eclipsing binary that dims every 2.87 days — the “Demon Star”.' } },
  { id: 'achernar', name: { zh: '水委一', en: 'Achernar' }, ra: '01 37 42.8', dec: '-57 14 12', distLy: 139, spectral: 'B6Vep', vmag: 0.46, radius: 7.3 },
  { id: 'spica', name: { zh: '角宿一', en: 'Spica' }, ra: '13 25 11.6', dec: '-11 09 41', distLy: 250, spectral: 'B1V', vmag: 0.97, radius: 7.47 },
  { id: 'bellatrix', name: { zh: '参宿五', en: 'Bellatrix' }, ra: '05 25 07.9', dec: '+06 20 59', distLy: 250, spectral: 'B2III', vmag: 1.64, radius: 5.75 },
  { id: 'mimosa', name: { zh: '十字架三', en: 'Mimosa' }, ra: '12 47 43.3', dec: '-59 41 19', distLy: 280, spectral: 'B0.5III', vmag: 1.25, radius: 8.4 },
  { id: 'mira', name: { zh: '蒭藁增二', en: 'Mira' }, ra: '02 19 20.8', dec: '-02 58 39', distLy: 300, spectral: 'M7IIIe', vmag: 3.04, radius: 332, desc: { zh: '第一颗被发现的周期性变星（约 332 天），是一颗脉动的红巨星。', en: 'The first periodic variable discovered (~332 days), a pulsating red giant.' } },
  { id: 'canopus', name: { zh: '老人星', en: 'Canopus' }, ra: '06 23 57.1', dec: '-52 41 45', distLy: 310, spectral: 'A9II', vmag: -0.74, radius: 71, desc: { zh: '全天第二亮星，常被航天器用于姿态导航。', en: 'The second-brightest star, often used by spacecraft for attitude navigation.' } },
  { id: 'acrux', name: { zh: '十字架二', en: 'Acrux' }, ra: '12 26 35.9', dec: '-63 05 57', distLy: 320, spectral: 'B0.5IV', vmag: 0.76, radius: 7.8 },
  { id: 'hadar', name: { zh: '马腹一', en: 'Hadar' }, ra: '14 03 49.4', dec: '-60 22 23', distLy: 390, spectral: 'B1III', vmag: 0.61, radius: 8.6 },
  {
    id: 'polaris', name: { zh: '北极星（勾陈一）', en: 'Polaris' }, ra: '02 31 49.1', dec: '+89 15 51', distLy: 433, spectral: 'F7Ib', vmag: 1.98, radius: 37.5,
    desc: { zh: '距北天极不到 1°，是一颗造父变星（黄超巨星），自古以来用于导航。', en: 'Less than 1° from the north celestial pole; a Cepheid supergiant used for navigation since antiquity.' },
  },
  {
    id: 'betelgeuse', name: { zh: '参宿四', en: 'Betelgeuse' }, ra: '05 55 10.3', dec: '+07 24 25', distLy: 548, spectral: 'M1Ia', vmag: 0.5, radius: 764,
    desc: { zh: '猎户座的红超巨星，若放在太阳的位置，其表面将超出火星轨道。它将在未来约 10 万年内以超新星爆发结束一生。', en: 'Orion’s red supergiant: placed at the Sun, its surface would extend beyond Mars’ orbit. It will explode as a supernova within ~100 000 years.' },
  },
  { id: 'antares', name: { zh: '心宿二', en: 'Antares' }, ra: '16 29 24.5', dec: '-26 25 55', distLy: 550, spectral: 'M1.5Iab', vmag: 0.96, radius: 680, desc: { zh: '天蝎座的“心脏”，一颗巨大的红超巨星，中国古称“大火”。', en: 'The red-supergiant “heart of the Scorpion”.' } },
  { id: 'shaula', name: { zh: '尾宿八', en: 'Shaula' }, ra: '17 33 36.5', dec: '-37 06 13', distLy: 570, spectral: 'B2IV', vmag: 1.62, radius: 8.8 },
  { id: 'saiph', name: { zh: '参宿六', en: 'Saiph' }, ra: '05 47 45.4', dec: '-09 40 11', distLy: 650, spectral: 'B0.5Ia', vmag: 2.09, radius: 22 },
  {
    id: 'rigel', name: { zh: '参宿七', en: 'Rigel' }, ra: '05 14 32.3', dec: '-08 12 06', distLy: 860, spectral: 'B8Ia', vmag: 0.13, radius: 78.9,
    desc: { zh: '猎户座最亮的星，一颗蓝白色超巨星，光度约为太阳的 12 万倍。', en: 'Orion’s brightest star, a blue-white supergiant ~120 000 times as luminous as the Sun.' },
  },
  { id: 'mintaka', name: { zh: '参宿三', en: 'Mintaka' }, ra: '05 32 00.4', dec: '-00 17 57', distLy: 1200, spectral: 'O9.5II', vmag: 2.23, radius: 16.5 },
  { id: 'alnitak', name: { zh: '参宿一', en: 'Alnitak' }, ra: '05 40 45.5', dec: '-01 56 34', distLy: 1260, spectral: 'O9.5Iab', vmag: 1.77, radius: 20 },
  { id: 'alnilam', name: { zh: '参宿二', en: 'Alnilam' }, ra: '05 36 12.8', dec: '-01 12 07', distLy: 2000, spectral: 'B0Ia', vmag: 1.69, radius: 42 },
  { id: 'deneb', name: { zh: '天津四', en: 'Deneb' }, ra: '20 41 25.9', dec: '+45 16 49', distLy: 2600, spectral: 'A2Ia', vmag: 1.25, radius: 203, desc: { zh: '夏季大三角中最远的一颗，是已知最明亮的恒星之一，光度约为太阳的 20 万倍。', en: 'The most distant star of the Summer Triangle and one of the most luminous known, ~200 000 Suns.' } },
  { id: 'vy-cma', name: { zh: '大犬座 VY', en: 'VY Canis Majoris' }, ra: '07 22 58.3', dec: '-25 46 03', distLy: 3900, spectral: 'M3Ia', vmag: 7.95, radius: 1420, desc: { zh: '已知体积最大的恒星之一，半径约为太阳的 1400 倍。', en: 'One of the largest known stars, about 1400 times the Sun’s radius.' } },
  { id: 'uy-scuti', name: { zh: '盾牌座 UY', en: 'UY Scuti' }, ra: '18 27 36.5', dec: '-12 27 59', distLy: 5900, spectral: 'M4Ia', vmag: 9.0, radius: 909 },
  { id: 'eta-car', name: { zh: '海山二', en: 'Eta Carinae' }, ra: '10 45 03.6', dec: '-59 41 04', distLy: 7500, spectral: 'LBV', vmag: 4.5, radius: 240, desc: { zh: '质量超过 100 倍太阳的不稳定双星系统，1843 年曾发生“大爆发”，短暂成为全天第二亮星。', en: 'An unstable binary of >100 solar masses whose 1843 “Great Eruption” briefly made it the second-brightest star.' } },
  { id: 'kepler452', name: { zh: '开普勒-452', en: 'Kepler-452' }, ra: '19 44 00.9', dec: '+44 16 39', distLy: 1800, spectral: 'G2V', vmag: 13.4, radius: 1.11, desc: { zh: '拥有“地球表亲”开普勒-452b 的类太阳恒星，该行星位于宜居带内。', en: 'A Sun-like star hosting Kepler-452b, an “Earth cousin” in the habitable zone.' } },
  {
    id: 'pleiades', kind: 'star-cluster', name: { zh: '昴星团（M45）', en: 'Pleiades (M45)' }, ra: '03 47 24', dec: '+24 07 00', distLy: 444, spectral: 'B6III', vmag: 1.6, sizeLy: 43,
    desc: { zh: '约 1 亿岁的年轻疏散星团，肉眼可见 6–7 颗亮星，被称为“七姐妹”。', en: 'A ~100-million-year-old open cluster; six or seven stars are visible to the naked eye — the “Seven Sisters”.' },
  },
  { id: 'hyades', kind: 'star-cluster', name: { zh: '毕星团', en: 'Hyades' }, ra: '04 27 00', dec: '+15 52 00', distLy: 153, spectral: 'K0III', vmag: 0.5, sizeLy: 30, desc: { zh: '离太阳最近的疏散星团，构成金牛座的“V”字形牛头。', en: 'The nearest open cluster, forming the V-shaped face of Taurus.' } },
  {
    id: 'orion-nebula', kind: 'nebula', name: { zh: '猎户座大星云（M42）', en: 'Orion Nebula (M42)' }, ra: '05 35 17.3', dec: '-05 23 28', distLy: 1344, spectral: 'HII', vmag: 4.0, sizeLy: 24,
    desc: { zh: '离地球最近的大质量恒星形成区，肉眼可见，内部的四边形星团照亮了整个星云。', en: 'The nearest region of massive star formation, visible to the naked eye and lit by the Trapezium cluster.' },
  },
  { id: 'crab', kind: 'nebula', name: { zh: '蟹状星云（M1）', en: 'Crab Nebula (M1)' }, ra: '05 34 31.9', dec: '+22 00 52', distLy: 6500, spectral: 'SNR', vmag: 8.4, sizeLy: 11, desc: { zh: '公元 1054 年中国宋代天文学家记录的“天关客星”超新星遗迹，中心是一颗每秒自转 30 次的脉冲星。', en: 'Remnant of the supernova of 1054 recorded by Song-dynasty astronomers; a pulsar spinning 30 times a second sits at its heart.' } },
  { id: 'eagle', kind: 'nebula', name: { zh: '鹰状星云（M16）', en: 'Eagle Nebula (M16)' }, ra: '18 18 48', dec: '-13 49 00', distLy: 5700, spectral: 'HII', vmag: 6.0, sizeLy: 70, desc: { zh: '著名的“创生之柱”所在地，高耸的气体尘埃柱中正在孕育新的恒星。', en: 'Home of the “Pillars of Creation”, towering columns of gas and dust where new stars are forming.' } },
  { id: 'carina-nebula', kind: 'nebula', name: { zh: '船底座星云', en: 'Carina Nebula' }, ra: '10 45 08.5', dec: '-59 52 04', distLy: 8500, spectral: 'HII', vmag: 1.0, sizeLy: 230 },
  { id: 'ring-nebula', kind: 'nebula', name: { zh: '环状星云（M57）', en: 'Ring Nebula (M57)' }, ra: '18 53 35.1', dec: '+33 01 45', distLy: 2570, spectral: 'PN', vmag: 8.8, sizeLy: 1.3, desc: { zh: '类太阳恒星死亡时抛出的行星状星云，预示着太阳约 70 亿年后的命运。', en: 'A planetary nebula ejected by a dying Sun-like star — a preview of the Sun’s fate in ~7 billion years.' } },
  { id: 'gaia-bh1', kind: 'black-hole', name: { zh: 'Gaia BH1', en: 'Gaia BH1' }, ra: '17 28 41.1', dec: '-00 34 52', distLy: 1560, spectral: 'BH', vmag: 13.8, radius: 0, desc: { zh: '目前已知离地球最近的黑洞，质量约为 9.6 倍太阳质量，有一颗类太阳伴星。', en: 'The nearest known black hole, ~9.6 solar masses, orbited by a Sun-like companion.' } },
  { id: 'cyg-x1', kind: 'black-hole', name: { zh: '天鹅座 X-1', en: 'Cygnus X-1' }, ra: '19 58 21.7', dec: '+35 12 06', distLy: 7200, spectral: 'BH', vmag: 8.9, radius: 0, desc: { zh: '第一个被广泛认定的恒星级黑洞（约 21 倍太阳质量），正在吞噬一颗蓝超巨星伴星的物质。', en: 'The first widely accepted stellar black hole (~21 M☉), feeding on a blue-supergiant companion.' } },
  { id: 'omega-cen', kind: 'star-cluster', name: { zh: '半人马座 ω 球状星团', en: 'Omega Centauri' }, ra: '13 26 47.3', dec: '-47 28 46', distLy: 17090, spectral: 'GC', vmag: 3.9, sizeLy: 150, desc: { zh: '银河系最大的球状星团，约含 1000 万颗恒星，可能是被吞噬矮星系的残核。', en: 'The Milky Way’s largest globular cluster (~10 million stars), possibly the core of a devoured dwarf galaxy.' } },
  { id: 'm13', kind: 'star-cluster', name: { zh: '武仙座球状星团（M13）', en: 'Hercules Cluster (M13)' }, ra: '16 41 41.2', dec: '+36 27 35', distLy: 22200, spectral: 'GC', vmag: 5.8, sizeLy: 145, desc: { zh: '1974 年阿雷西博信息发射的目标，含数十万颗古老恒星。', en: 'Target of the 1974 Arecibo message, containing several hundred thousand ancient stars.' } },
];

/** Approximate blackbody colours by spectral class (Mitchell Charity). */
export function spectralColor(spectral: string): string {
  const c = spectral.trim().charAt(0).toUpperCase();
  switch (c) {
    case 'O':
      return '#9bb0ff';
    case 'B':
      return '#aabfff';
    case 'A':
      return '#cad7ff';
    case 'F':
      return '#f8f7ff';
    case 'G':
      return '#fff4ea';
    case 'K':
      return '#ffd2a1';
    case 'M':
      return '#ffb56c';
    case 'D':
      return '#e8eeff';
    case 'L':
      return '#ff9d7a';
    default:
      return '#ffffff';
  }
}
