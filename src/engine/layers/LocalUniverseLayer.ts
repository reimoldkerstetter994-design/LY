import * as THREE from 'three';
import { MLY_M } from '../../physics/constants';
import { galLBToWorld, parseDec, parseRA, raDecToWorld, scale, type Vec3 } from '../../physics/coords';
import { NOTABLE_GALAXIES } from '../../data/galaxies';
import { STRUCTURES, type StructureData } from '../../data/structures';
import { Rng } from '../../utils/random';
import { Layer, band, makePoints, setOpacity, shared, type FrameContext } from '../core';
import { ENV_FIELD, ENV_FILAMENT, ENV_NODE, ENV_WALL, generateCosmicWeb } from '../procedural/cosmicWeb';
import { GLOW_FRAG, GLOW_VERT } from '../shaders';

export const ENV_COLORS: Record<number, [string, number]> = {
  [ENV_NODE]: ['#ffd3a1', 1.25],
  [ENV_FILAMENT]: ['#fff0de', 1.0],
  [ENV_WALL]: ['#dbe5ff', 0.8],
  [ENV_FIELD]: ['#9dbdff', 0.6],
};

const FILAMENTS: [string, string][] = [
  ['virgo-cluster', 'origin'],
  ['virgo-cluster', 'coma-cluster'],
  ['coma-cluster', 'leo-cluster'],
  ['virgo-cluster', 'ursa-major-cluster'],
  ['virgo-cluster', 'centaurus-cluster'],
  ['centaurus-cluster', 'hydra-cluster'],
  ['centaurus-cluster', 'norma-cluster'],
  ['norma-cluster', 'shapley'],
  ['hydra-cluster', 'norma-cluster'],
  ['perseus-cluster', 'pisces-cluster'],
  ['fornax-cluster', 'eridanus-cluster'],
  ['eridanus-cluster', 'origin'],
  ['coma-cluster', 'hercules-cluster'],
  ['hercules-cluster', 'corona-borealis'],
  ['pisces-cluster', 'origin'],
  ['shapley', 'horologium'],
  ['fornax-cluster', 'horologium'],
];

export function structureCenterMly(s: StructureData): Vec3 {
  const dir = s.ra && s.dec ? raDecToWorld(parseRA(s.ra), parseDec(s.dec)) : galLBToWorld(s.l ?? 0, s.b ?? 0);
  return scale(dir, s.distMly ?? 0);
}

/** Nearby universe out to ~1 billion light-years, in units of million light-years. */
export class LocalUniverseLayer extends Layer {
  private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private glows = new THREE.Group();

  constructor(quality: 'low' | 'medium' | 'high') {
    super('local', MLY_M);
    this.extent = 1100;
    const q = quality === 'low' ? 0.35 : quality === 'medium' ? 0.65 : 1;
    const web = generateCosmicWeb({
      seed: 9,
      count: Math.floor(120000 * q),
      radius: 1000,
      cellSize: 80,
      accept: (r) => (r < 6 ? 0 : r > 650 ? Math.max(0, 1 - (r - 650) / 350) ** 1.5 : 1),
    });
    const rng = new Rng(41);
    const extra: { p: Vec3; env: number }[] = [];
    const centers = new Map<string, Vec3>([['origin', [0, 0, 0]]]);
    for (const s of STRUCTURES) {
      if (s.distMly === undefined) continue;
      centers.set(s.id, structureCenterMly(s));
    }
    for (const s of STRUCTURES) {
      if (!s.richness || s.distMly === undefined) continue;
      const c = centers.get(s.id)!;
      const n = Math.floor(s.richness * 45 * q);
      const subs = s.kind === 'supercluster' ? 7 : 1;
      for (let k = 0; k < subs; k++) {
        const off: Vec3 = subs > 1 ? scale(rng.direction(), (s.sizeMly / 2.6) * Math.sqrt(rng.next())) : [0, 0, 0];
        const sigma = subs > 1 ? s.sizeMly / 22 : s.sizeMly / 4;
        for (let i = 0; i < n / subs; i++) {
          const r = Math.abs(rng.gauss()) < 1.3 ? 1 : 2;
          extra.push({
            p: [
              c[0] + off[0] + rng.gauss() * sigma * r,
              c[1] + off[1] + rng.gauss() * sigma * r,
              c[2] + off[2] + rng.gauss() * sigma * r,
            ],
            env: ENV_NODE,
          });
        }
      }
    }
    for (const [a, b] of FILAMENTS) {
      const pa = centers.get(a);
      const pb = centers.get(b);
      if (!pa || !pb) continue;
      const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
      const n = Math.floor(len * 3.2 * q);
      const bend = scale(rng.direction(), len * 0.12);
      for (let i = 0; i < n; i++) {
        const t = rng.next();
        const curve = Math.sin(Math.PI * t);
        const sg = 2.5 + len * 0.012;
        extra.push({
          p: [
            pa[0] + (pb[0] - pa[0]) * t + bend[0] * curve + rng.gauss() * sg,
            pa[1] + (pb[1] - pa[1]) * t + bend[1] * curve + rng.gauss() * sg,
            pa[2] + (pb[2] - pa[2]) * t + bend[2] * curve + rng.gauss() * sg,
          ],
          env: ENV_FILAMENT,
        });
      }
    }

    const n = web.count + extra.length;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const col = new THREE.Color();
    const put = (i: number, x: number, y: number, z: number, env: number) => {
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const [hex, k] = ENV_COLORS[env];
      col.set(hex);
      const j = (0.7 + rng.next() * 0.6) * k;
      colors[i * 3] = col.r * j;
      colors[i * 3 + 1] = col.g * j;
      colors[i * 3 + 2] = col.b * j;
      sizes[i] = 0.9 + rng.next() * 0.9;
    };
    for (let i = 0; i < web.count; i++) {
      put(i, web.positions[i * 3], web.positions[i * 3 + 1], web.positions[i * 3 + 2], web.env[i]);
    }
    extra.forEach((e, k) => put(web.count + k, e.p[0], e.p[1], e.p[2], e.env));
    this.points = makePoints({ positions, colors, sizes, count: n }, { minPx: 1, maxPx: 10, fadeNear: 1.5 });
    this.scene.add(this.points);

    const lg = this.makeGlow('#ffe6b8', 4, 3, 14);
    this.glows.add(lg);
    for (const g of NOTABLE_GALAXIES) {
      if (g.distKly === undefined || g.distKly > 120000) continue;
      const p = scale(raDecToWorld(parseRA(g.ra), parseDec(g.dec)), g.distKly / 1000);
      const glow = this.makeGlow(g.model === 'elliptical' ? '#ffd9a8' : '#e6ecff', (g.diameterKly / 1000) * 6, 2.2, 12);
      (glow.geometry.getAttribute('position') as THREE.BufferAttribute).setXYZ(0, p[0], p[1], p[2]);
      this.glows.add(glow);
    }
    this.scene.add(this.glows);
  }

  private makeGlow(color: string, size: number, minPx: number, maxPx: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const p = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: {
          uScale: shared.uScale,
          uWorldSize: { value: size },
          uPx: { value: 0 },
          uMinPx: { value: minPx },
          uMaxPx: { value: maxPx },
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: 1 },
        },
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    p.frustumCulled = false;
    return p;
  }

  computeOpacity(ctx: FrameContext): number {
    return band(ctx.logView, 21.9, 22.7, 25.8, 26.5);
  }

  update(ctx: FrameContext): void {
    setOpacity(this.points, this.opacity);
    setOpacity(this.glows, this.opacity * band(ctx.logView, 21.9, 22.6, 24.6, 25.4));
  }
}
