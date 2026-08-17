/**
 * Builds the level shell (floor / ceiling / two-tone walls) as a handful of
 * merged buffer geometries so the whole corridor system draws in ~4 calls.
 *
 * Vertex colours carry a cheap baked ambient-occlusion term: corners, wall
 * bases and ceiling seams get darker. It costs nothing at runtime and does
 * most of the work of making the place look grounded and filthy.
 */

import { BufferGeometry, BufferAttribute } from 'three';
import { CELL, WALL_H } from './maze.js';

const TILE_TOP = 1.55; // where the wall tiles stop and painted plaster starts

class QuadSoup {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
  }

  /**
   * Add a quad. Corners must be in counter-clockwise order when viewed from
   * the front (the side the normal points to).
   */
  quad(a, b, c, d, normal, uvs, aos) {
    const base = this.count;
    const verts = [a, b, c, d];
    for (let i = 0; i < 4; i++) {
      this.pos.push(verts[i][0], verts[i][1], verts[i][2]);
      this.nrm.push(normal[0], normal[1], normal[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      const ao = aos[i];
      this.col.push(ao, ao, ao);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.count += 4;
  }

  toGeometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * @param {import('./maze.js').Maze} maze
 * @returns {{floor:BufferGeometry, ceiling:BufferGeometry, tile:BufferGeometry, paint:BufferGeometry}}
 */
export function buildShellGeometry(maze) {
  const floorS = new QuadSoup();
  const ceilS = new QuadSoup();
  const tileS = new QuadSoup();
  const paintS = new QuadSoup();

  const SF = 1 / 2.9; // floor texture metres → uv
  const SC = 1 / 3.2; // ceiling
  const ST = 1 / 1.75; // wall tiles
  const SP = 1 / 2.5; // painted plaster

  const solid = (x, y) => maze.isSolid(x, y);

  // Corner occlusion for a floor/ceiling vertex: how many of the three
  // diagonal-adjacent cells are solid.
  const cornerAO = (x, y, sx, sy, strength) => {
    let n = 0;
    if (solid(x + sx, y)) n++;
    if (solid(x, y + sy)) n++;
    if (solid(x + sx, y + sy)) n++;
    return 1 - (n / 3) * strength;
  };

  for (const { x, y } of maze.floors) {
    const c = maze.worldOf(x, y);
    const x0 = c.x - CELL / 2;
    const x1 = c.x + CELL / 2;
    const z0 = c.z - CELL / 2;
    const z1 = c.z + CELL / 2;

    /* ---------------------------------------------------------- floor */
    floorS.quad(
      [x0, 0, z1],
      [x1, 0, z1],
      [x1, 0, z0],
      [x0, 0, z0],
      [0, 1, 0],
      [
        [x0 * SF, z1 * SF],
        [x1 * SF, z1 * SF],
        [x1 * SF, z0 * SF],
        [x0 * SF, z0 * SF],
      ],
      [
        cornerAO(x, y, -1, 1, 0.55),
        cornerAO(x, y, 1, 1, 0.55),
        cornerAO(x, y, 1, -1, 0.55),
        cornerAO(x, y, -1, -1, 0.55),
      ],
    );

    /* -------------------------------------------------------- ceiling */
    ceilS.quad(
      [x0, WALL_H, z0],
      [x1, WALL_H, z0],
      [x1, WALL_H, z1],
      [x0, WALL_H, z1],
      [0, -1, 0],
      [
        [x0 * SC, z0 * SC],
        [x1 * SC, z0 * SC],
        [x1 * SC, z1 * SC],
        [x0 * SC, z1 * SC],
      ],
      [
        cornerAO(x, y, -1, -1, 0.7),
        cornerAO(x, y, 1, -1, 0.7),
        cornerAO(x, y, 1, 1, 0.7),
        cornerAO(x, y, -1, 1, 0.7),
      ],
    );

    /* ---------------------------------------------------------- walls */
    // dir: [dx, dy], quad spans the shared edge, normal faces into this cell.
    const dirs = [
      { d: [0, -1], n: [0, 0, 1] },
      { d: [1, 0], n: [-1, 0, 0] },
      { d: [0, 1], n: [0, 0, -1] },
      { d: [-1, 0], n: [1, 0, 0] },
    ];

    for (const { d, n } of dirs) {
      if (!solid(x + d[0], y + d[1])) continue;

      // Edge endpoints p → q, ordered so that (p_bottom, q_bottom, q_top)
      // winds counter-clockwise when viewed from the normal's side. Get this
      // backwards and every wall is back-face culled from inside the corridor,
      // which reads as "the room has no walls, just blackness".
      let p;
      let q;
      if (d[1] === -1) {
        p = [x0, z0];
        q = [x1, z0];
      } else if (d[0] === 1) {
        p = [x1, z0];
        q = [x1, z1];
      } else if (d[1] === 1) {
        p = [x1, z1];
        q = [x0, z1];
      } else {
        p = [x0, z1];
        q = [x0, z0];
      }

      // Darken the ends of a wall segment that butt into another wall.
      const perp = d[0] === 0 ? [1, 0] : [0, 1];
      const endA = solid(x + perp[0], y + perp[1]) ? 0.62 : 1;
      const endB = solid(x - perp[0], y - perp[1]) ? 0.62 : 1;
      // p/q ordering vs. perp differs per direction; approximate with min().
      const eA = Math.min(endA, 1);
      const eB = Math.min(endB, 1);

      const uAt = (pt) => (d[0] === 0 ? pt[0] : pt[1]);

      // Lower band: tiles.
      tileS.quad(
        [p[0], 0, p[1]],
        [q[0], 0, q[1]],
        [q[0], TILE_TOP, q[1]],
        [p[0], TILE_TOP, p[1]],
        n,
        [
          [uAt(p) * ST, 0],
          [uAt(q) * ST, 0],
          [uAt(q) * ST, TILE_TOP * ST],
          [uAt(p) * ST, TILE_TOP * ST],
        ],
        [0.42 * eA, 0.42 * eB, 0.95 * eB, 0.95 * eA],
      );

      // Upper band: painted plaster.
      paintS.quad(
        [p[0], TILE_TOP, p[1]],
        [q[0], TILE_TOP, q[1]],
        [q[0], WALL_H, q[1]],
        [p[0], WALL_H, p[1]],
        n,
        [
          [uAt(p) * SP, TILE_TOP * SP],
          [uAt(q) * SP, TILE_TOP * SP],
          [uAt(q) * SP, WALL_H * SP],
          [uAt(p) * SP, WALL_H * SP],
        ],
        [1 * eA, 1 * eB, 0.5 * eB, 0.5 * eA],
      );
    }
  }

  return {
    floor: floorS.toGeometry(),
    ceiling: ceilS.toGeometry(),
    tile: tileS.toGeometry(),
    paint: paintS.toGeometry(),
  };
}

export { TILE_TOP };
