/**
 * Grid level topology: generation, queries, BFS distance fields and A* pathing.
 *
 * The layout is a braided maze (dead ends mostly removed so chases stay fair)
 * with a handful of carved-out rooms that read as wards, bathrooms, a morgue
 * and storage.
 */

export const CELL = 3.4;
export const WALL_H = 3.25;

export const SOLID = 0;
export const FLOOR = 1;

export const ROOM_KINDS = ['ward', 'bath', 'morgue', 'storage', 'office'];

class MinHeap {
  constructor() {
    this.a = [];
  }

  get size() {
    return this.a.length;
  }

  push(node, prio) {
    const a = this.a;
    a.push({ node, prio });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].prio <= a[i].prio) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < a.length && a[l].prio < a[s].prio) s = l;
        if (r < a.length && a[r].prio < a[s].prio) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top?.node;
  }
}

export class Maze {
  /**
   * @param {number} w odd width in cells
   * @param {number} h odd height in cells
   * @param {ReturnType<import('../core/utils.js').makeRng>} rng
   */
  constructor(w, h, rng) {
    this.w = w % 2 === 0 ? w + 1 : w;
    this.h = h % 2 === 0 ? h + 1 : h;
    this.rng = rng;
    this.grid = new Uint8Array(this.w * this.h); // SOLID by default
    this.roomId = new Int16Array(this.w * this.h).fill(-1);
    this.rooms = [];
    this._generate();
    this.floors = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.grid[y * this.w + x] === FLOOR) this.floors.push({ x, y });
      }
    }
  }

  idx(x, y) {
    return y * this.w + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  isFloor(x, y) {
    return this.inBounds(x, y) && this.grid[y * this.w + x] === FLOOR;
  }

  isSolid(x, y) {
    return !this.isFloor(x, y);
  }

  /** Cell centre in world space. */
  worldOf(x, y) {
    return {
      x: (x - (this.w - 1) / 2) * CELL,
      z: (y - (this.h - 1) / 2) * CELL,
    };
  }

  cellOf(wx, wz) {
    return {
      x: Math.round(wx / CELL + (this.w - 1) / 2),
      y: Math.round(wz / CELL + (this.h - 1) / 2),
    };
  }

  solidAtWorld(wx, wz) {
    const c = this.cellOf(wx, wz);
    return this.isSolid(c.x, c.y);
  }

  /* --------------------------------------------------------- generation */

  _generate() {
    const { w, h, rng, grid } = this;

    // 1) Recursive-backtracker maze over odd cells.
    const start = { x: 1, y: 1 };
    grid[this.idx(start.x, start.y)] = FLOOR;
    const stack = [start];
    const dirs = [
      [0, -2],
      [2, 0],
      [0, 2],
      [-2, 0],
    ];
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const options = [];
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && grid[this.idx(nx, ny)] === SOLID) {
          options.push([nx, ny, dx, dy]);
        }
      }
      if (!options.length) {
        stack.pop();
        continue;
      }
      const [nx, ny, dx, dy] = rng.pick(options);
      grid[this.idx(cur.x + dx / 2, cur.y + dy / 2)] = FLOOR;
      grid[this.idx(nx, ny)] = FLOOR;
      stack.push({ x: nx, y: ny });
    }

    // 2) Braid: knock through walls at dead ends so the player can always run.
    for (let y = 1; y < h - 1; y += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        if (grid[this.idx(x, y)] !== FLOOR) continue;
        const open = [];
        const walls = [];
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ]) {
          const t = this.idx(x + dx, y + dy);
          if (grid[t] === FLOOR) open.push([dx, dy]);
          else if (x + dx * 2 > 0 && y + dy * 2 > 0 && x + dx * 2 < w - 1 && y + dy * 2 < h - 1) {
            walls.push([dx, dy]);
          }
        }
        if (open.length <= 1 && walls.length && rng.chance(0.85)) {
          const [dx, dy] = rng.pick(walls);
          grid[this.idx(x + dx, y + dy)] = FLOOR;
        } else if (rng.chance(0.14) && walls.length) {
          // Extra loops make the layout disorienting in a good way.
          const [dx, dy] = rng.pick(walls);
          grid[this.idx(x + dx, y + dy)] = FLOOR;
        }
      }
    }

    // 3) Carve rooms.
    const roomTarget = Math.max(5, Math.floor((w * h) / 150));
    let attempts = 0;
    while (this.rooms.length < roomTarget && attempts < 400) {
      attempts++;
      const rw = rng.int(2, 4) * 2 + 1;
      const rh = rng.int(2, 4) * 2 + 1;
      const rx = rng.int(1, Math.floor((w - rw - 2) / 2)) * 2 + 1;
      const ry = rng.int(1, Math.floor((h - rh - 2) / 2)) * 2 + 1;
      if (rx + rw >= w - 1 || ry + rh >= h - 1) continue;

      // Keep rooms from overlapping each other.
      let overlaps = false;
      for (const r of this.rooms) {
        if (rx - 2 < r.x + r.w && rx + rw + 2 > r.x && ry - 2 < r.y + r.h && ry + rh + 2 > r.y) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      const kind = rng.pick(ROOM_KINDS);
      const id = this.rooms.length;
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          grid[this.idx(x, y)] = FLOOR;
          this.roomId[this.idx(x, y)] = id;
        }
      }
      const c = this.worldOf(rx + (rw - 1) / 2, ry + (rh - 1) / 2);
      this.rooms.push({ id, x: rx, y: ry, w: rw, h: rh, kind, center: c });
    }

    // 4) Seal the border.
    for (let x = 0; x < w; x++) {
      grid[this.idx(x, 0)] = SOLID;
      grid[this.idx(x, h - 1)] = SOLID;
    }
    for (let y = 0; y < h; y++) {
      grid[this.idx(0, y)] = SOLID;
      grid[this.idx(w - 1, y)] = SOLID;
    }
  }

  /* ------------------------------------------------------------ queries */

  /** BFS distance in cells from a set of sources. Unreachable = -1. */
  distanceField(sources) {
    const dist = new Int32Array(this.w * this.h).fill(-1);
    const queue = [];
    for (const s of sources) {
      if (!this.isFloor(s.x, s.y)) continue;
      dist[this.idx(s.x, s.y)] = 0;
      queue.push(s);
    }
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const d = dist[this.idx(cur.x, cur.y)];
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!this.isFloor(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (dist[ni] !== -1) continue;
        dist[ni] = d + 1;
        queue.push({ x: nx, y: ny });
      }
    }
    return dist;
  }

  /** Straight-line grid raycast used for line of sight. */
  lineOfSight(x0, y0, x1, y1) {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let guard = 0;
    while (guard++ < 4096) {
      if (this.isSolid(x, y)) return false;
      if (x === x1 && y === y1) return true;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    return false;
  }

  /**
   * A* over the 4-connected grid.
   * @returns {{x:number,y:number}[]} cells from start (exclusive) to goal (inclusive)
   */
  findPath(sx, sy, gx, gy, maxNodes = 6000) {
    if (!this.isFloor(sx, sy) || !this.isFloor(gx, gy)) return [];
    const W = this.w;
    const startI = this.idx(sx, sy);
    const goalI = this.idx(gx, gy);
    if (startI === goalI) return [];

    const gScore = new Float32Array(W * this.h).fill(Infinity);
    const came = new Int32Array(W * this.h).fill(-1);
    const closed = new Uint8Array(W * this.h);
    const open = new MinHeap();
    gScore[startI] = 0;
    const hOf = (i) => {
      const x = i % W;
      const y = (i / W) | 0;
      return Math.abs(x - gx) + Math.abs(y - gy);
    };
    open.push(startI, hOf(startI));

    let expanded = 0;
    while (open.size && expanded < maxNodes) {
      const cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      expanded++;
      if (cur === goalI) break;
      const cx = cur % W;
      const cy = (cur / W) | 0;
      const g = gScore[cur];
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.isFloor(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (closed[ni]) continue;
        const ng = g + 1;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          open.push(ni, ng + hOf(ni) * 1.02);
        }
      }
    }

    if (came[goalI] === -1 && goalI !== startI) return [];
    const path = [];
    let cur = goalI;
    let guard = 0;
    while (cur !== startI && cur !== -1 && guard++ < 8192) {
      path.push({ x: cur % W, y: (cur / W) | 0 });
      cur = came[cur];
    }
    path.reverse();
    return path;
  }

  /** Pick the floor cell furthest from every source cell. */
  farthestFrom(sources) {
    const dist = this.distanceField(sources);
    let best = null;
    let bestD = -1;
    for (const f of this.floors) {
      const d = dist[this.idx(f.x, f.y)];
      if (d > bestD) {
        bestD = d;
        best = f;
      }
    }
    return { cell: best, dist: bestD, field: dist };
  }
}
