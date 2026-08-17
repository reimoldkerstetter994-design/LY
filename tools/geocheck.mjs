/**
 * Geometry sanity check, run in Node without a browser.
 *
 * Verifies that every quad in the level shell has triangle winding consistent
 * with its declared normal — the bug class that makes walls invisible from the
 * side you are standing on.
 *
 *   node tools/geocheck.mjs
 */

import { Maze } from '../src/world/maze.js';
import { buildShellGeometry } from '../src/world/geometry.js';
import { makeRng } from '../src/core/utils.js';

// Minimal DOM stubs: geometry.js only touches three.js, but maze.js does not
// need anything, so nothing else is required here.

let failures = 0;
let checked = 0;

for (const seed of [1, 7, 42, 1337, 99991]) {
  const maze = new Maze(21, 21, makeRng(seed));
  const shell = buildShellGeometry(maze);

  for (const [name, geo] of Object.entries(shell)) {
    const pos = geo.attributes.position.array;
    const nrm = geo.attributes.normal.array;
    const idx = geo.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
      const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
      const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      // u × v
      const wx = uy * vz - uz * vy;
      const wy = uz * vx - ux * vz;
      const wz = ux * vy - uy * vx;
      const len = Math.hypot(wx, wy, wz);
      if (len < 1e-9) continue;
      const dot =
        (wx / len) * nrm[a * 3] + (wy / len) * nrm[a * 3 + 1] + (wz / len) * nrm[a * 3 + 2];
      checked++;
      if (dot < 0.9) {
        failures++;
        if (failures <= 5) {
          console.log(
            `  ${name}: triangle ${t / 3} winding dot=${dot.toFixed(3)} ` +
              `normal=(${nrm[a * 3]},${nrm[a * 3 + 1]},${nrm[a * 3 + 2]})`,
          );
        }
      }
    }
  }
}

console.log(`checked ${checked} triangles across 5 seeds`);
if (failures) {
  console.log(`FAIL: ${failures} triangles wound against their normal`);
  process.exit(1);
}
console.log('PASS: all shell triangles wind consistently with their normals');
