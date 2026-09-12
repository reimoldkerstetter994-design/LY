// Simple 2D Perlin-like noise for terrain generation
class SimplexNoise {
  constructor(seed = 42) {
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647;
      const j = s % (i + 1);
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const a = this.p[X] + Y;
    const b = this.p[X + 1] + Y;
    return this.lerp(
      v,
      this.lerp(u, this.grad(this.p[a], x, y), this.grad(this.p[b], x - 1, y)),
      this.lerp(u, this.grad(this.p[a + 1], x, y - 1), this.grad(this.p[b + 1], x - 1, y - 1))
    );
  }

  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(t, a, b) { return a + t * (b - a); }
  grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
}

const noise = new SimplexNoise(12345);

export function getTerrainHeight(x, z) {
  const scale1 = 0.02;
  const scale2 = 0.05;
  const scale3 = 0.1;
  const h =
    noise.noise2D(x * scale1, z * scale1) * 12 +
    noise.noise2D(x * scale2, z * scale2) * 5 +
    noise.noise2D(x * scale3, z * scale3) * 2;
  return Math.floor(8 + h);
}

export function getBiome(x, z) {
  const temp = noise.noise2D(x * 0.008, z * 0.008);
  if (temp > 0.3) return 'desert';
  if (temp < -0.2) return 'forest';
  return 'plains';
}
