export class HeightField {
  constructor(map) {
    this.res = map.res;
    this.originX = map.originX;
    this.originZ = map.originZ;
    this.cell = map.cell;
    this.unit = map.unit ?? 0.01;
    this.heights = map.heights;
  }

  sample(x, z) {
    const fx = (x - this.originX) / this.cell;
    const fz = (z - this.originZ) / this.cell;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const h00 = this.at(x0, z0);
    const h10 = this.at(x0 + 1, z0);
    const h01 = this.at(x0, z0 + 1);
    const h11 = this.at(x0 + 1, z0 + 1);
    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;
    return h0 * (1 - tz) + h1 * tz;
  }

  at(ix, iz) {
    const x = Math.max(0, Math.min(this.res - 1, ix));
    const z = Math.max(0, Math.min(this.res - 1, iz));
    return this.heights[z * this.res + x] * this.unit;
  }

  normal(x, z, eps = 0.6) {
    const hL = this.sample(x - eps, z);
    const hR = this.sample(x + eps, z);
    const hD = this.sample(x, z - eps);
    const hU = this.sample(x, z + eps);
    const nx = hL - hR;
    const nz = hD - hU;
    const ny = eps * 2;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }
}

export function resolveAabb(px, pz, radius, colliders) {
  let x = px;
  let z = pz;
  for (const c of colliders) {
    const minX = c.min[0] - radius;
    const maxX = c.max[0] + radius;
    const minZ = c.min[2] - radius;
    const maxZ = c.max[2] + radius;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    const left = x - minX;
    const right = maxX - x;
    const down = z - minZ;
    const up = maxZ - z;
    const m = Math.min(left, right, down, up);
    if (m === left) x = minX;
    else if (m === right) x = maxX;
    else if (m === down) z = minZ;
    else z = maxZ;
  }
  return { x, z };
}

export function colliderHeight(px, pz, radius, colliders, feetY) {
  let top = -Infinity;
  for (const c of colliders) {
    if (feetY + 1.2 < c.min[1] || feetY > c.max[1] + 0.2) continue;
    const minX = c.min[0] - radius * 0.7;
    const maxX = c.max[0] + radius * 0.7;
    const minZ = c.min[2] - radius * 0.7;
    const maxZ = c.max[2] + radius * 0.7;
    if (px >= minX && px <= maxX && pz >= minZ && pz <= maxZ) {
      top = Math.max(top, c.max[1]);
    }
  }
  return top;
}
