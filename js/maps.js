/**
 * 地图与玩法配置
 * # 墙  . 空地  S 出生  E 出口  K 钥匙/遗物  B 电池  H 藏身处  N 纸条
 */

export const MODES = {
  escape: {
    id: 'escape',
    name: '逃离',
    tagline: '收集钥匙，打开大门',
    desc: '在怪物的夹击下找到全部钥匙并逃出出口。安静移动，善用藏身处。',
  },
  survive: {
    id: 'survive',
    name: '生存',
    tagline: '在倒计时结束前活下来',
    desc: '坚持指定时间。怪物会越来越多，藏好、省电、别被包围。',
    duration: 150,
  },
  hunt: {
    id: 'hunt',
    name: '猎杀',
    tagline: '夺取遗物，代价是更多追逐者',
    desc: '每拿到一件遗物就会再唤醒一只怪物。拿齐后冲向出口。',
  },
};

export const MAPS = {
  hospital: {
    id: 'hospital',
    name: '废弃医院',
    subtitle: '三号病房从未被清空',
    fog: 0x0a0808,
    fogDensity: 0.028,
    ambient: 0x2a1a22,
    wallColor: '#6a5f54',
    floorColor: '#4a4338',
    ceilColor: '#2a2620',
    lightTint: 0xffeedd,
    writings: [
      { text: '救救我', },
      { text: '不要看它的眼睛' },
      { text: '三号病房' },
      { text: '它还在呼吸' },
    ],
    notes: [
      '夜班记录：走廊尽头的灯自己灭了。有人在墙后抓挠。',
      '患者自述：它会学我走路的声音。',
    ],
    enemies: { escape: ['stalker', 'crawler', 'whisperer'], survive: ['stalker', 'crawler'], hunt: ['stalker', 'crawler'] },
    layout: [
      '#####################',
      '#S#.........#...H...#',
      '#.#######.#.#######.#',
      '#.........#....N....#',
      '###################.#',
      '#.#.....#.......#B..#',
      '#.#.###.#K###...#.###',
      '#.#.#.#...#.#K#.#...#',
      '#.#.#.#####.#.#.###.#',
      '#.#.....#...#.#.#.#.#',
      '#.#.#.#.##..#.#.#...#',
      '#.#.#.#.....#.#H..#.#',
      '#.#.#.#.#####.#####.#',
      '#.#.#.#.#.....#...#.#',
      '#.#.#.###.#####.#.#.#',
      '#.#.#...#.......#...#',
      '#...###.#####..######',
      '#.......K........E..#',
      '#####################',
    ],
  },

  school: {
    id: 'school',
    name: '废弃学校',
    subtitle: '放学铃响了，但没有人离开',
    fog: 0x0c0c10,
    fogDensity: 0.024,
    ambient: 0x1a2230,
    wallColor: '#4a5260',
    floorColor: '#5a5040',
    ceilColor: '#242830',
    lightTint: 0xc8d8ff,
    writings: [
      { text: '不要进音乐室' },
      { text: '老师还在' },
      { text: '铃响就跑' },
      { text: '它坐在后排' },
    ],
    notes: [
      '值日生日记：厕所隔间里有第三双脚。',
      '广播稿：今日放学取消。请待在教室。永远待着。',
    ],
    enemies: { escape: ['watcher', 'whisperer', 'crawler'], survive: ['crawler', 'whisperer'], hunt: ['watcher', 'crawler'] },
    layout: [
      '#######################',
      '#S..#.........#...#...#',
      '###.###.#####.#.#.#.#.#',
      '#.#.#...#...#.#.#.#.#K#',
      '#.#.#.###.###...###.#.#',
      '#.....#.#...#.#..B..#.#',
      '#.##.##.#...#.###.#.#.#',
      '#.........#.#.#...#.#.#',
      '#.###.#.###.#.#.#.###.#',
      '#.#.#...#..K#.#.#...#.#',
      '#.#.#####..##.#.###.#.#',
      '#.#...#N#...#..H#.#...#',
      '#.#K#.#..##.#####.###.#',
      '#.#.#.....#.#...#...#E#',
      '#.#.#####.#.#.#.#.#.#.#',
      '#.H.#.....#...#...#...#',
      '#######################',
    ],
  },

  catacombs: {
    id: 'catacombs',
    name: '地下墓穴',
    subtitle: '火把灭了之后，名字会被念出来',
    fog: 0x080604,
    fogDensity: 0.038,
    ambient: 0x201408,
    wallColor: '#5a4a38',
    floorColor: '#3a3228',
    ceilColor: '#221c16',
    lightTint: 0xffaa66,
    writings: [
      { text: '更深' },
      { text: '不要应声' },
      { text: '墙在听' },
      { text: '回头就留下' },
    ],
    notes: [
      '墓志铭残片：我们把门封上了。它从里面把门拆开。',
      '探险笔记：回声比我的脚步多一步。',
    ],
    enemies: { escape: ['whisperer', 'stalker', 'crawler', 'watcher'], survive: ['whisperer', 'crawler', 'stalker'], hunt: ['stalker', 'whisperer'] },
    layout: [
      '#####################',
      '#S#...#.............#',
      '#.#.#.#.#######.#####',
      '#.#.......#...#.#...#',
      '#.#######.#.#.#.#.#.#',
      '#.......#...#.#...#.#',
      '###.###.##..######..#',
      '#...#...#...........#',
      '#.###.###.#####B###H#',
      '#...#.....#.#.......#',
      '#.#.#..####.#.#######',
      '#.#..K#...K.#...#...#',
      '#.###.#N###.###.#...#',
      '#.#.......#...#...#.#',
      '###.#.###.###.#.###.#',
      '#..H#...#.#.#.....#.#',
      '#.#######.#.###.###E#',
      '#.#......K#.#...#...#',
      '#.#.#######.#.###.###',
      '#...........#.......#',
      '#####################',
    ],
  },

  manor: {
    id: 'manor',
    name: '荒废庄园',
    subtitle: '宴会从未结束，宾客只是换了一副面孔',
    fog: 0x0a0a12,
    fogDensity: 0.022,
    ambient: 0x221828,
    wallColor: '#6a4a46',
    floorColor: '#4a3830',
    ceilColor: '#2a1c1e',
    lightTint: 0xffccaa,
    writings: [
      { text: '舞会在地下室' },
      { text: '主人在镜子里' },
      { text: '请入座' },
      { text: '不要打开衣柜' },
    ],
    notes: [
      '管家日志：客人数量对不上。多了一位没有脸的。',
      '请柬背面：午夜后，谁也不能离开餐厅。',
    ],
    enemies: { escape: ['watcher', 'stalker', 'whisperer'], survive: ['watcher', 'crawler', 'stalker'], hunt: ['watcher', 'stalker', 'crawler'] },
    layout: [
      '#######################',
      '#S#.....#.....K.#.....#',
      '#...###.#.##.##.###K#.#',
      '#.#.#.#.#.#...#.#...#.#',
      '#.#.#.#.#.#.#.#.#.###.#',
      '#...#.#.#.#.#.#...#...#',
      '#####.#.#.#.#N###B#.###',
      '#.#...#...#H#.#...#...#',
      '#.#.#.#####.#.#.#.###.#',
      '#...#.......#.........#',
      '#.#########.###.#####.#',
      '#.....#...#...#.#.....#',
      '#####.###.###.###.#####',
      '#...#...#...#K#...#...#',
      '#.#.###.#.###.#.#####.#',
      '#.#...#.#.....#.#...#.#',
      '#.#.###.#.#.##..#.#.#.#',
      '#.#.......#H......#E..#',
      '#######################',
    ],
  },
};

export function normalizeLayout(layout) {
  const width = Math.max(...layout.map(row => row.length));
  return layout.map((row, i) => {
    let cells = row.padEnd(width, '#').slice(0, width).split('');
    if (i === 0 || i === layout.length - 1) {
      cells = cells.map(() => '#');
    } else {
      cells[0] = '#';
      cells[width - 1] = '#';
    }
    return cells.join('');
  });
}

export function getMap(id) {
  const map = MAPS[id] || MAPS.hospital;
  return { ...map, layout: normalizeLayout(map.layout) };
}

export function getMode(id) {
  return MODES[id] || MODES.escape;
}

export const MAP_LIST = Object.values(MAPS);
export const MODE_LIST = Object.values(MODES);
