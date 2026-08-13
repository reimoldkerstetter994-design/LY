const AU = 14;

const BODIES = [
  {
    id: "sun",
    name: "太阳",
    nameEn: "Sun",
    kind: "star",
    color: 0xffb347,
    radius: 5.4,
    orbitAU: 0,
    periodDays: 0,
    eccentricity: 0,
    inclination: 0,
    rotationDays: 25.4,
    tilt: 7.25,
    summary: "太阳系的中心恒星，一颗由氢氦聚变驱动的黄矮星，为所有行星提供光和热。",
    facts: [
      ["类型", "G2V 黄矮星"],
      ["直径", "139.2 万千米"],
      ["质量", "33 万倍地球"],
      ["表面温度", "约 5500°C"],
      ["自转周期", "25.4 天"],
      ["年龄", "约 46 亿年"]
    ]
  },
  {
    id: "mercury",
    name: "水星",
    nameEn: "Mercury",
    kind: "planet",
    color: 0xb7b3aa,
    radius: 0.42,
    orbitAU: 0.39,
    periodDays: 88,
    eccentricity: 0.206,
    inclination: 7.0,
    rotationDays: 58.6,
    tilt: 0.03,
    summary: "最靠近太阳的岩石行星，几乎没有大气，昼夜温差极大，表面布满撞击坑。",
    facts: [
      ["与太阳距离", "0.39 AU"],
      ["公转周期", "88 天"],
      ["自转周期", "58.6 天"],
      ["直径", "4879 千米"],
      ["卫星", "无"],
      ["表面重力", "0.38 g"]
    ]
  },
  {
    id: "venus",
    name: "金星",
    nameEn: "Venus",
    kind: "planet",
    color: 0xe8c37a,
    radius: 0.72,
    orbitAU: 0.72,
    periodDays: 224.7,
    eccentricity: 0.007,
    inclination: 3.4,
    rotationDays: -243,
    tilt: 177.4,
    summary: "被厚重硫酸云层包裹的灼热世界，逆向自转，表面气压约为地球的 90 倍。",
    facts: [
      ["与太阳距离", "0.72 AU"],
      ["公转周期", "225 天"],
      ["自转周期", "243 天（逆向）"],
      ["直径", "12104 千米"],
      ["大气", "二氧化碳为主"],
      ["表面温度", "约 465°C"]
    ]
  },
  {
    id: "earth",
    name: "地球",
    nameEn: "Earth",
    kind: "planet",
    color: 0x3f8cff,
    radius: 0.76,
    orbitAU: 1,
    periodDays: 365.25,
    eccentricity: 0.017,
    inclination: 0,
    rotationDays: 1,
    tilt: 23.4,
    summary: "目前已知唯一存在生命的行星，拥有液态水海洋、氧气大气和一颗稳定的卫星。",
    facts: [
      ["与太阳距离", "1.00 AU"],
      ["公转周期", "365.25 天"],
      ["自转周期", "23 小时 56 分"],
      ["直径", "12742 千米"],
      ["卫星", "月球"],
      ["轴倾角", "23.4°"]
    ],
    moons: [
      { name: "月球", color: 0xcfd3d8, radius: 0.2, distance: 2.05, periodDays: 27.3 }
    ]
  },
  {
    id: "mars",
    name: "火星",
    nameEn: "Mars",
    kind: "planet",
    color: 0xd36a3e,
    radius: 0.5,
    orbitAU: 1.52,
    periodDays: 687,
    eccentricity: 0.093,
    inclination: 1.85,
    rotationDays: 1.03,
    tilt: 25.2,
    summary: "干燥的红色沙漠行星，有巨大峡谷、盾状火山，以及冻结的极冠。",
    facts: [
      ["与太阳距离", "1.52 AU"],
      ["公转周期", "687 天"],
      ["自转周期", "24.6 小时"],
      ["直径", "6779 千米"],
      ["卫星", "火卫一、火卫二"],
      ["别称", "红色星球"]
    ]
  },
  {
    id: "jupiter",
    name: "木星",
    nameEn: "Jupiter",
    kind: "planet",
    color: 0xd8b48a,
    radius: 2.35,
    orbitAU: 3.2,
    periodDays: 4333,
    eccentricity: 0.049,
    inclination: 1.3,
    rotationDays: 0.41,
    tilt: 3.1,
    summary: "太阳系最大的气态巨行星，拥有著名的大红斑和数十颗卫星，磁场极为强大。",
    facts: [
      ["与太阳距离", "5.20 AU（已压缩显示）"],
      ["公转周期", "11.86 年"],
      ["自转周期", "9.9 小时"],
      ["直径", "139820 千米"],
      ["卫星", "95+"],
      ["大红斑", "持续数百年的风暴"]
    ],
    moons: [
      { name: "木卫一", color: 0xe8d39a, radius: 0.12, distance: 3.3, periodDays: 1.77 },
      { name: "木卫二", color: 0xcfe4f2, radius: 0.11, distance: 4.0, periodDays: 3.55 },
      { name: "木卫三", color: 0xb7c0b0, radius: 0.16, distance: 4.8, periodDays: 7.15 },
      { name: "木卫四", color: 0x8f7b68, radius: 0.14, distance: 5.7, periodDays: 16.7 }
    ]
  },
  {
    id: "saturn",
    name: "土星",
    nameEn: "Saturn",
    kind: "planet",
    color: 0xe6d3a3,
    radius: 1.95,
    orbitAU: 4.55,
    periodDays: 10759,
    eccentricity: 0.057,
    inclination: 2.49,
    rotationDays: 0.45,
    tilt: 26.7,
    hasRings: true,
    summary: "以壮丽光环闻名的气态巨行星，密度低于水，光环主要由冰粒与岩石碎屑组成。",
    facts: [
      ["与太阳距离", "9.58 AU（已压缩显示）"],
      ["公转周期", "29.45 年"],
      ["自转周期", "10.7 小时"],
      ["直径", "116460 千米"],
      ["光环", "主要冰质环系"],
      ["卫星", "土卫六等 140+"]
    ],
    moons: [
      { name: "土卫六", color: 0xc48a3a, radius: 0.18, distance: 4.4, periodDays: 15.9 }
    ]
  },
  {
    id: "uranus",
    name: "天王星",
    nameEn: "Uranus",
    kind: "planet",
    color: 0x7fe3e0,
    radius: 1.15,
    orbitAU: 6.05,
    periodDays: 30687,
    eccentricity: 0.046,
    inclination: 0.77,
    rotationDays: -0.72,
    tilt: 97.8,
    hasRings: true,
    ringColor: 0x9ad7e0,
    summary: "侧躺着公转的冰巨星，轴倾角接近 98 度，外观呈淡青色，由甲烷吸收红光造成。",
    facts: [
      ["与太阳距离", "19.2 AU（已压缩显示）"],
      ["公转周期", "84 年"],
      ["自转周期", "17.2 小时（逆向）"],
      ["直径", "50724 千米"],
      ["轴倾角", "97.8°"],
      ["大气", "氢、氦、甲烷"]
    ]
  },
  {
    id: "neptune",
    name: "海王星",
    nameEn: "Neptune",
    kind: "planet",
    color: 0x3b6cff,
    radius: 1.1,
    orbitAU: 7.45,
    periodDays: 60190,
    eccentricity: 0.009,
    inclination: 1.77,
    rotationDays: 0.67,
    tilt: 28.3,
    summary: "最外侧的冰巨星，风速可达超音速，呈现深邃的海蓝色，由数学预言后被发现。",
    facts: [
      ["与太阳距离", "30.1 AU（已压缩显示）"],
      ["公转周期", "164.8 年"],
      ["自转周期", "16.1 小时"],
      ["直径", "49244 千米"],
      ["发现", "1846 年"],
      ["卫星", "海卫一等"]
    ]
  }
];
