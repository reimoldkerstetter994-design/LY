import * as THREE from 'three';
import { LOCAL_GROUP, NOTABLE_GALAXIES, type GalaxyModel } from '../../data/galaxies';
import type { CatalogObject } from '../../data/types';
import type { Vec3 } from '../../physics/coords';
import { Rng } from '../../utils/random';
import { nativeVisibility } from '../interact';
import { Layer, makePoints, ramp, setOpacity, type FrameContext } from '../core';
import { generateElliptical, generateIrregular, generateSpiral } from '../procedural/galaxyModel';

/** Galaxies that already have a full particle model in the Milky Way layer. */
const MODELED = new Set(LOCAL_GROUP.map((g) => g.id));
MODELED.add('milky-way');

const MODELS = new Map([...LOCAL_GROUP, ...NOTABLE_GALAXIES].map((g) => [g.id, g.model]));

const STAND_IN = new Set<CatalogObject['kind']>([
  'galaxy',
  'quasar',
  'cluster',
  'group',
  'supercluster',
  'structure',
  'void',
  'nebula',
  'star-cluster',
  'black-hole',
  'region',
]);

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) m.dispose();
  });
}

/**
 * A body you can fly into when the object's own scale layer has faded, or when it was only
 * ever drawn as a single point: galaxies, clusters, nebulae, black holes, shells.
 * The layer unit is the object's radius, so coordinates stay well inside float32 range.
 */
export class FocusBodyLayer extends Layer {
  private target: CatalogObject | null = null;
  private root = new THREE.Group();

  constructor() {
    super('focus-body', 1);
    this.extent = 8;
    this.scene.add(this.root);
  }

  setTarget(o: CatalogObject | null, position: Vec3): void {
    if (!o || !STAND_IN.has(o.kind) || MODELED.has(o.id) || o.radius <= 0) {
      this.target = null;
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.origin = position;
    this.unit = Math.max(o.radius, 1);
    if (this.target?.id !== o.id) {
      this.target = o;
      this.rebuild(o);
    }
  }

  computeOpacity(ctx: FrameContext): number {
    const o = this.target;
    if (!o) return 0;
    const radii = ctx.viewDist / this.unit;
    const logR = Math.log10(Math.max(radii, 1e-6));
    if (o.kind === 'black-hole') return 1 - ramp(logR, 2.05, 3.25);
    if (o.kind === 'region') return 1 - ramp(logR, -0.35, 0.55);
    if (o.kind === 'nebula' || o.kind === 'star-cluster') {
      const close = 1 - ramp(logR, 0.85, 1.55);
      const revealed = (1 - ramp(logR, 1.15, 1.85)) * (1 - nativeVisibility(o.group, ctx.logView));
      return Math.max(close, revealed);
    }
    const approach = 1 - ramp(logR, 1.15, 1.9);
    return approach * (1 - nativeVisibility(o.group, ctx.logView));
  }

  update(_ctx: FrameContext): void {
    setOpacity(this.root, this.opacity);
  }

  private rebuild(o: CatalogObject): void {
    disposeObject(this.root);
    this.root.clear();
    this.root.quaternion.identity();
    if (o.up) {
      this.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...o.up).normalize());
    }
    const seed = hashId(o.id);
    if (o.kind === 'galaxy' || o.kind === 'quasar') this.addGalaxy(o, seed);
    else if (o.kind === 'nebula') this.addCloud(seed, o.color ?? '#ff9ec7', 2800, 0.42, 0.09);
    else if (o.kind === 'star-cluster') this.addCloud(seed, '#d5e4ff', 2200, 0.55, 0.012);
    else if (o.kind === 'black-hole') this.addBlackHole();
    else if (o.kind === 'void') this.addWire('#8fa4c4');
    else if (o.kind === 'region') this.addShell(seed, '#c5d7f2');
    else this.addStructure(seed, o);
  }

  private addGalaxy(o: CatalogObject, seed: number): void {
    const model: GalaxyModel = o.kind === 'quasar' ? 'elliptical' : (MODELS.get(o.id) ?? 'spiral');
    const count = 8000;
    if (model === 'spiral' || model === 'barred') {
      const cloud = generateSpiral({
        seed,
        count,
        radius: 1,
        scaleLength: 0.22,
        thickness: 0.035,
        arms: model === 'barred' ? 2 : 2,
        pitchDeg: model === 'barred' ? 16 : 13,
        armSpread: 0.2,
        armRef: 0.4,
        armPhase: (seed % 628) / 100,
        armStart: 0.12,
        bulgeFraction: 0.16,
        bulgeRadius: 0.1,
        barLength: model === 'barred' ? 0.28 : 0,
        barAngle: 0.6,
        haloFraction: 0.04,
        armFraction: 0.58,
        particleSize: 0.018,
        brightness: o.kind === 'quasar' ? 1.3 : 0.9,
        palette: { core: '#ffd29a', disk: '#ffe7c8', arm: '#c4d8ff', hii: '#ff6b98', halo: '#ffe1b8' },
      });
      this.root.add(makePoints(cloud.stars, { minPx: 1.1, maxPx: 16, fadeNear: 0.03 }));
      return;
    }
    if (model === 'irregular') {
      this.root.add(makePoints(generateIrregular(seed, count, 1, 0.16, 0.9), { minPx: 1.1, maxPx: 14, fadeNear: 0.03 }));
      return;
    }
    const flatten = model === 'dwarf' ? 0.55 : 0.72;
    this.root.add(
      makePoints(generateElliptical(seed, count, 1, 0.02, model === 'dwarf' ? 0.7 : 1, flatten), {
        minPx: 1.1,
        maxPx: 14,
        fadeNear: 0.03,
      }),
    );
  }

  private addStructure(seed: number, o: CatalogObject): void {
    const rich = o.kind === 'supercluster' || o.kind === 'structure';
    const n = rich ? 7000 : 4200;
    const rng = new Rng(seed);
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const col = new THREE.Color(o.color ?? '#ffd9a0');
    const knots = Array.from({ length: rich ? 8 : 4 }, () => {
      const [x, y, z] = rng.direction();
      const r = rich ? 0.25 + rng.next() * 0.55 : rng.next() * 0.35;
      return { x: x * r, y: y * r, z: z * r * 0.35, s: 0.05 + rng.next() * 0.08 };
    });
    for (let i = 0; i < n; i++) {
      const u = rng.next();
      let x: number;
      let y: number;
      let z: number;
      let bright: number;
      if (u < 0.42) {
        const k = knots[Math.floor(rng.next() * knots.length)];
        x = k.x + rng.gauss() * k.s;
        y = k.y + rng.gauss() * k.s;
        z = k.z + rng.gauss() * k.s * 0.6;
        bright = 1.1;
      } else if (u < 0.78) {
        const a = knots[Math.floor(rng.next() * knots.length)];
        const b = knots[Math.floor(rng.next() * knots.length)];
        const t = rng.next();
        x = a.x + (b.x - a.x) * t + rng.gauss() * 0.03;
        y = a.y + (b.y - a.y) * t + rng.gauss() * 0.03;
        z = a.z + (b.z - a.z) * t + rng.gauss() * 0.02;
        bright = 0.7;
      } else {
        const r = Math.pow(rng.next(), 0.55);
        const [dx, dy, dz] = rng.direction();
        x = dx * r;
        y = dy * r;
        z = dz * r * 0.4;
        bright = 0.22;
      }
      positions.set([x, y, z], i * 3);
      const j = bright * (0.75 + rng.next() * 0.5);
      colors.set([col.r * j, col.g * j, col.b * j], i * 3);
      sizes[i] = 0.012 + rng.next() * 0.012;
    }
    this.root.add(makePoints({ positions, colors, sizes, count: n }, { minPx: 1.05, maxPx: 12, fadeNear: 0.02 }));
  }

  private addCloud(seed: number, color: string, count: number, spread: number, size: number): void {
    const rng = new Rng(seed);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const col = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const r = Math.abs(rng.gauss()) * spread;
      const [x, y, z] = rng.direction();
      positions.set([x * r, y * r, z * r * 0.65], i * 3);
      const j = 0.45 + rng.next() * 0.9;
      colors.set([col.r * j, col.g * j, col.b * j], i * 3);
      sizes[i] = size * (0.5 + rng.next());
    }
    this.root.add(makePoints({ positions, colors, sizes, count }, { minPx: 1.2, maxPx: 36, fadeNear: 0.04 }));
  }

  private addShell(seed: number, color: string): void {
    const rng = new Rng(seed);
    const n = 4500;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const col = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = rng.direction();
      const r = 0.72 + rng.next() * 0.28;
      positions.set([x * r, y * r, z * r], i * 3);
      const j = 0.35 + rng.next() * 0.5;
      colors.set([col.r * j, col.g * j, col.b * j], i * 3);
      sizes[i] = 0.02 + rng.next() * 0.02;
    }
    this.root.add(makePoints({ positions, colors, sizes, count: n }, { minPx: 1.1, maxPx: 10, fadeNear: 0.04 }));
  }

  private addBlackHole(): void {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 72),
      new THREE.MeshBasicMaterial({ color: 0x050308, side: THREE.DoubleSide, transparent: true, opacity: 1 }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.45, 1.85, 128),
      new THREE.MeshBasicMaterial({ color: 0xffb15a, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }),
    );
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.4, 96),
      new THREE.MeshBasicMaterial({ color: 0xfff1c9, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
    );
    disc.rotation.x = inner.rotation.x = ring.rotation.x = 1.15;
    this.root.add(disc, inner, ring);
  }

  private addWire(color: string): void {
    const mesh = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 18, 12)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }),
    );
    this.root.add(mesh);
  }
}
