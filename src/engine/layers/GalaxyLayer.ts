import * as THREE from 'three';
import { KLY_M } from '../../physics/constants';
import {
  galacticBasisWorld,
  galaxyDiscNormal,
  galaxyMajorAxis,
  normalize,
  cross,
  parseDec,
  parseRA,
  raDecToWorld,
  scale,
  type Vec3,
} from '../../physics/coords';
import { GALACTIC_CENTER, R0_LY, Z_SUN_LY } from '../../data/catalog';
import { LOCAL_GROUP, type GalaxyData } from '../../data/galaxies';
import { Rng } from '../../utils/random';
import { Layer, band, makePoints, ramp, setOpacity, shared, type FrameContext } from '../core';
import { generateElliptical, generateIrregular, generateSpiral, type ParticleCloud } from '../procedural/galaxyModel';
import { GLOW_FRAG, GLOW_VERT } from '../shaders';

function basisQuaternion(x: Vec3, y: Vec3, z: Vec3): THREE.Quaternion {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

function glow(color: string, worldSize: number, minPx: number, maxPx: number, opacity = 1): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const p = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      uniforms: {
        uScale: shared.uScale,
        uWorldSize: { value: worldSize },
        uPx: { value: 0 },
        uMinPx: { value: minPx },
        uMaxPx: { value: maxPx },
        uColor: { value: new THREE.Color(color).multiplyScalar(opacity) },
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

/** The Milky Way and its Local Group neighbours, in units of 1000 ly in the Galactic frame. */
export class GalaxyLayer extends Layer {
  private mwStars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private mwDust: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private core: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private globulars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private neighbours = new THREE.Group();
  private sunMarker: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(quality: 'low' | 'medium' | 'high') {
    const [bx, by, bz] = galacticBasisWorld();
    super('galaxy', KLY_M, GALACTIC_CENTER, basisQuaternion(bx, by, bz));
    this.extent = 3000;
    const q = quality === 'low' ? 0.35 : quality === 'medium' ? 0.65 : 1;

    const mw = generateSpiral({
      seed: 11,
      count: Math.floor(220000 * q),
      radius: 52,
      scaleLength: 9,
      thickness: 0.55,
      arms: 4,
      pitchDeg: 13,
      armSpread: 0.2,
      armRef: 21.5,
      armPhase: Math.PI,
      armWeights: [0.65, 1, 0.65, 1],
      armStart: 10,
      bulgeFraction: 0.14,
      bulgeRadius: 6,
      barLength: 16,
      barAngle: (153 * Math.PI) / 180,
      haloFraction: 0.03,
      armFraction: 0.62,
      particleSize: 0.55,
      brightness: 0.9,
      palette: { core: '#ffd29a', disk: '#ffe7c8', arm: '#c4d8ff', hii: '#ff6b98', halo: '#ffe1b8' },
      spur: { r: R0_LY / 1000, phi: Math.PI, length: 0.55, fraction: 0.025 },
    });
    this.mwStars = makePoints(mw.stars, { minPx: 1, maxPx: 22, fadeNear: 0.12 });
    this.mwDust = makePoints(mw.dust, { minPx: 1, maxPx: 40, fadeNear: 0.2, dust: true });
    this.mwDust.renderOrder = 1;
    this.mwStars.renderOrder = 0;
    this.core = glow('#ffcf8a', 14, 0, 2000, 0.35);
    this.globulars = makePoints(this.makeGlobulars(new Rng(5)), { minPx: 1.6, maxPx: 6 });
    this.scene.add(this.mwStars, this.mwDust, this.core, this.globulars);

    const sun = glow('#fff1b0', 0.25, 4, 10, 1);
    const sp = sun.geometry.getAttribute('position') as THREE.BufferAttribute;
    sp.setXYZ(0, -R0_LY / 1000, 0, Z_SUN_LY / 1000);
    this.sunMarker = sun;
    this.scene.add(sun);

    for (const g of LOCAL_GROUP) this.neighbours.add(this.buildNeighbour(g, q));
    this.scene.add(this.neighbours);
  }

  private makeGlobulars(rng: Rng): ParticleCloud {
    const n = 160;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = 1.5 * Math.pow(1 - rng.next() * 0.985, -1 / 1.6);
      const [x, y, z] = rng.direction();
      positions.set([x * Math.min(r, 130), y * Math.min(r, 130), z * Math.min(r, 130)], i * 3);
      colors.set([1.4, 1.2, 0.85], i * 3);
      sizes[i] = 0.15;
    }
    return { positions, colors, sizes, count: n };
  }

  private buildNeighbour(g: GalaxyData, q: number): THREE.Object3D {
    const ra = parseRA(g.ra);
    const dec = parseDec(g.dec);
    const world = scale(raDecToWorld(ra, dec), (g.distKly ?? 0) * KLY_M);
    const local = this.toLocal(world);
    const group = new THREE.Group();
    group.position.copy(local);
    const r = g.diameterKly / 2;
    let cloud: ParticleCloud;
    // Surface brightness ∝ overlap = N·s²·0.35 / (4·R_eff²); exposure keeps it near unity.
    const exposureFor = (n: number, s: number, rEff: number) => Math.min(1, Math.max(0.06, 1 / ((n * s * s * 0.35) / (4 * rEff * rEff))));
    if (g.id === 'm31') {
      const s = generateSpiral({
        seed: 31, count: Math.floor(80000 * q), radius: r, scaleLength: 17, thickness: 0.9, arms: 2, pitchDeg: 7,
        armSpread: 0.17, armRef: 30, armPhase: 0, armStart: 12, bulgeFraction: 0.22, bulgeRadius: 9, barLength: 0,
        barAngle: 0, haloFraction: 0.04, armFraction: 0.55, particleSize: 1.15, brightness: 0.85,
        palette: { core: '#ffd8a0', disk: '#ffe6c4', arm: '#cfe0ff', hii: '#ff7aa8', halo: '#ffe3bf' },
      });
      group.add(makePoints(s.stars, { minPx: 1, maxPx: 26 }));
      const dust = makePoints(s.dust, { minPx: 1, maxPx: 30, dust: true });
      dust.renderOrder = 1;
      dust.userData.fixed = 0.5;
      group.add(dust);
      const core = glow('#ffd6a0', 20, 0, 1500, 0.3);
      core.userData.fixed = 1;
      group.add(core);
      group.userData.exposure = exposureFor(s.stars.count, 1.3, r * 0.45);
    } else if (g.id === 'm33') {
      const s = generateSpiral({
        seed: 33, count: Math.floor(30000 * q), radius: r, scaleLength: 6, thickness: 0.4, arms: 2, pitchDeg: 26,
        armSpread: 0.34, armRef: 8, armPhase: 0, armStart: 3, bulgeFraction: 0.05, bulgeRadius: 2, barLength: 0,
        barAngle: 0, haloFraction: 0.02, armFraction: 0.7, particleSize: 0.55, brightness: 0.8,
        palette: { core: '#ffe2b5', disk: '#f1ecff', arm: '#b8d0ff', hii: '#ff74a6', halo: '#e9e4ff' },
      });
      group.add(makePoints(s.stars, { minPx: 1, maxPx: 22 }));
      group.userData.exposure = exposureFor(s.stars.count, 0.65, r * 0.5);
    } else if (g.model === 'irregular') {
      const big = g.id === 'lmc' || g.id === 'smc';
      const size = big ? 0.35 : r * 0.12;
      cloud = generateIrregular(g.id.length * 97 + 3, Math.floor((big ? (g.id === 'lmc' ? 16000 : 8000) : 900) * q), r, size, big ? 0.9 : 0.55);
      group.add(makePoints(cloud, { minPx: 1, maxPx: 20 }));
      group.userData.exposure = exposureFor(cloud.count, size * 1.1, r * 0.5);
    } else {
      const size = r * 0.1;
      cloud = generateElliptical(g.id.length * 131 + 7, Math.floor((g.model === 'elliptical' ? 2500 : 700) * q), r, size, g.model === 'elliptical' ? 0.8 : 0.45, g.model === 'elliptical' ? 0.85 : 0.75);
      group.add(makePoints(cloud, { minPx: 1, maxPx: 16 }));
      group.userData.exposure = exposureFor(cloud.count, size, r * 0.35);
    }
    const inv = this.basis.clone().invert();
    const toLocalDir = (v: Vec3) => new THREE.Vector3(...v).applyQuaternion(inv);
    const normalW = g.incl !== undefined && g.pa !== undefined ? galaxyDiscNormal(ra, dec, g.incl, g.pa) : normalize(cross(raDecToWorld(ra, dec), [0, 1, 0]));
    const majorW = g.pa !== undefined ? galaxyMajorAxis(ra, dec, g.pa) : normalize(cross(normalW, [1, 0, 0]));
    const z = toLocalDir(normalW).normalize();
    const x = toLocalDir(majorW);
    x.sub(z.clone().multiplyScalar(x.dot(z))).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    group.userData.id = g.id;
    return group;
  }

  computeOpacity(ctx: FrameContext): number {
    return 1 - ramp(ctx.logView, 23.7, 24.4);
  }

  update(ctx: FrameContext): void {
    const lv = ctx.logView;
    // From inside the disc (the night-sky band) particles must be small and faint; from outside
    // they are large enough to merge into a smooth disc.
    const outside = ramp(lv, 19.2, 20.6);
    const su = this.mwStars.material.uniforms;
    su.uSizeMul.value = 0.1 + 0.9 * outside;
    su.uMaxPx.value = 4 + 18 * outside;
    const du = this.mwDust.material.uniforms;
    du.uSizeMul.value = 0.14 + 0.86 * outside;
    du.uMaxPx.value = 7 + 33 * outside;
    // Exposure: seen from outside ~10 particles overlap per pixel, so each must be faint.
    setOpacity(this.mwStars, this.opacity * (0.75 - 0.6 * outside));
    setOpacity(this.mwDust, this.opacity * (0.85 - 0.25 * outside));
    setOpacity(this.core, this.opacity * ramp(lv, 18.5, 20) * 0.5);
    setOpacity(this.globulars, this.opacity * band(lv, 19.5, 20.4, 23, 23.8));
    setOpacity(this.sunMarker, this.opacity * band(lv, 19.4, 20.2, 22.6, 23.3));
    const nb = this.opacity * ramp(lv, 16, 18);
    this.neighbours.visible = nb > 0.002;
    for (const g of this.neighbours.children) {
      const exposure = (g.userData.exposure as number | undefined) ?? 1;
      for (const child of g.children) setOpacity(child, nb * ((child.userData.fixed as number | undefined) ?? exposure));
    }
  }
}
