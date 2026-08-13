// 迷宫式楼层布局生成 + 网格工具(寻路、视线)

export const WALL = 0;
export const FLOOR = 1;

// 递归回溯生成迷宫,再打通一部分墙形成环路(更像建筑走廊)
export function generateMaze(w, h) {
  const grid = Array.from({ length: h }, () => new Array(w).fill(WALL));

  const carve = (x, y) => {
    grid[y][x] = FLOOR;
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].sort(() => Math.random() - 0.5);
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][nx] === WALL) {
        grid[y + dy / 2][x + dx / 2] = FLOOR;
        carve(nx, ny);
      }
    }
  };
  carve(1, 1);

  // 打通约 12% 的内部墙形成环路,并开出几个"房间"
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y][x] === WALL && Math.random() < 0.12) {
        const horiz = grid[y][x - 1] === FLOOR && grid[y][x + 1] === FLOOR;
        const vert = grid[y - 1][x] === FLOOR && grid[y + 1][x] === FLOOR;
        if (horiz || vert) grid[y][x] = FLOOR;
      }
    }
  }

  // 挖出 4~6 个小房间(病房)
  const roomCount = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < roomCount; i++) {
    const rw = 3 + Math.floor(Math.random() * 2) * 2;
    const rh = 3 + Math.floor(Math.random() * 2) * 2;
    const rx = 1 + 2 * Math.floor(Math.random() * ((w - rw - 2) / 2));
    const ry = 1 + 2 * Math.floor(Math.random() * ((h - rh - 2) / 2));
    for (let y = ry; y < ry + rh && y < h - 1; y++) {
      for (let x = rx; x < rx + rw && x < w - 1; x++) {
        grid[y][x] = FLOOR;
      }
    }
  }

  return grid;
}

export function floorCells(grid) {
  const cells = [];
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[0].length; x++)
      if (grid[y][x] === FLOOR) cells.push([x, y]);
  return cells;
}

// 死胡同(只有一个通路方向)——用于藏保险丝
export function deadEnds(grid) {
  const ends = [];
  for (let y = 1; y < grid.length - 1; y++) {
    for (let x = 1; x < grid[0].length - 1; x++) {
      if (grid[y][x] !== FLOOR) continue;
      let open = 0;
      if (grid[y][x + 1] === FLOOR) open++;
      if (grid[y][x - 1] === FLOOR) open++;
      if (grid[y + 1][x] === FLOOR) open++;
      if (grid[y - 1][x] === FLOOR) open++;
      if (open === 1) ends.push([x, y]);
    }
  }
  return ends;
}

// BFS 寻路,返回格子路径(含起点和终点)
export function findPath(grid, sx, sy, tx, ty) {
  const w = grid[0].length, h = grid.length;
  if (grid[ty]?.[tx] !== FLOOR || grid[sy]?.[sx] !== FLOOR) return null;
  const prev = new Int32Array(w * h).fill(-1);
  const visited = new Uint8Array(w * h);
  const queue = [sy * w + sx];
  visited[sy * w + sx] = 1;
  let qi = 0;
  const target = ty * w + tx;
  while (qi < queue.length) {
    const cur = queue[qi++];
    if (cur === target) break;
    const cx = cur % w, cy = (cur / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni] || grid[ny][nx] !== FLOOR) continue;
      visited[ni] = 1;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (!visited[target]) return null;
  const path = [];
  let cur = target;
  while (cur !== -1) {
    path.push([cur % w, (cur / w) | 0]);
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

// 网格 DDA 视线检测(两点之间是否无墙)
export function lineOfSight(grid, x0, y0, x1, y1) {
  // 输入为"格子坐标系"下的连续坐标
  let dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.0001) return true;
  const steps = Math.ceil(dist * 4);
  dx /= steps; dy /= steps;
  let x = x0, y = y0;
  for (let i = 0; i < steps; i++) {
    x += dx; y += dy;
    const gx = Math.floor(x), gy = Math.floor(y);
    if (grid[gy]?.[gx] !== FLOOR) return false;
  }
  return true;
}
