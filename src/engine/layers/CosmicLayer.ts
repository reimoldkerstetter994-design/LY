import * as THREE from 'three';
import { GLY_M, MPC_GLY } from '../../physics/constants';
import { galacticBasisWorld, type Vec3 } from '../../physics/coords';
import type { Cosmology } from '../../physics/cosmology';
import { Rng } from '../../utils/random';
import { Layer, makePoints, ramp, setOpacity, type FrameContext } from '../core';
import { generateCosmicWeb } from '../procedural/cosmicWeb';
import { ATMO_FRAG, ATMO_VERT, CMB_FRAG, CMB_VERT } from '../shaders';

export interface ShellLabel {
  key: string;
  text: { zh: string; en: string };
  /** World position (metres). */
  position: Vec3;
  color: string;
}

const SHELL_Z = [0.1, 0.5, 1, 2, 3, 6, 10, 20];
const Z_COLORS: [number, string][] = [
  [0, '#eaf2ff'],
  [0.3, '#fff3d6'],
  [1, '#ffc46b'],
  [2, '#ff8a3d'],
  [4, '#ff4d2e'],
  [8, '#d81b60'],
  [16, '#7b1fa2'],
];

/** Colour of light emitted at redshift z as an observer would perceive the shift (stylised). */
export function redshiftColor(z: number, out = new THREE.Color()): THREE.Color {
  const a = new THREE.Color();
  for (let i = 1; i < Z_COLORS.length; i++) {
    if (z <= Z_COLORS[i][0]) {
      const [z0, c0] = Z_COLORS[i - 1];
      const [z1, c1] = Z_COLORS[i];
      const t = (Math.log1p(z) - Math.log1p(z0)) / (Math.log1p(z1) - Math.log1p(z0));
      return out.set(c0).lerp(a.set(c1), t);
    }
  }
  return out.set(Z_COLORS[Z_COLORS.length - 1][1]);
}

function ring(color: string, opacity: number, dashed = false): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 256; i++) {
    const t = (i / 256) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(t), Math.sin(t), 0));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.02, gapSize: 0.015, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.LineLoop(geo, mat);
  if (dashed) line.computeLineDistances();
  line.frustumCulled = false;
  return line;
}

export class CosmicLayer extends Layer {
  private galaxies: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private galaxyR: Float32Array;
  private galaxyBase: Float32Array;
  private quasars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private quasarR: Float32Array;
  private shells = new THREE.Group();
  private shellRings: { z: number; line: THREE.LineLoop; r: number }[] = [];
  private horizons: { id: string; line: THREE.LineLoop; r: number; color: string; name: { zh: string; en: string } }[] = [];
  private cmb: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private cmbRim: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private cmbTexture: THREE.DataTexture;
  rCmb = 45;
  rParticle = 46;
  private cosmo: Cosmology | null = null;

  constructor(quality: 'low' | 'medium' | 'high') {
    super('cosmic', GLY_M);
    this.extent = 50;
    const q = quality === 'low' ? 0.35 : quality === 'medium' ? 0.65 : 1;

    const inner = generateCosmicWeb({
      seed: 21,
      count: Math.floor(120000 * q),
      radius: 3.4,
      cellSize: 0.17,
      accept: (r) => ramp(r, 0.45, 0.95) * (r < 2 ? 1 : (2 / r) ** 2.2),
    });
    const outer = generateCosmicWeb({
      seed: 22,
      count: Math.floor(70000 * q),
      radius: 36,
      cellSize: 2.2,
      accept: (r) => (r < 3 ? 0 : (3 / r) ** 1.7),
    });
    const n = inner.count + outer.count;
    const positions = new Float32Array(n * 3);
    positions.set(inner.positions, 0);
    positions.set(outer.positions, inner.count * 3);
    const sizes = new Float32Array(n);
    this.galaxyR = new Float32Array(n);
    this.galaxyBase = new Float32Array(n);
    const rng = new Rng(5);
    const envWeight = [0.1, 0.32, 1, 1.6];
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      this.galaxyR[i] = r;
      const env = i < inner.count ? inner.env[i] : outer.env[i - inner.count];
      this.galaxyBase[i] = (0.6 + rng.next() * 0.8) * envWeight[env];
      sizes[i] = i < inner.count ? 0.004 + rng.next() * 0.004 : 0.03 + r * 0.004;
    }
    this.galaxies = makePoints({ positions, colors: new Float32Array(n * 3), sizes, count: n }, { minPx: 1, maxPx: 6, fadeNear: 0.003 });
    this.scene.add(this.galaxies);

    const nq = Math.floor(3500 * q);
    const qp = new Float32Array(nq * 3);
    const qs = new Float32Array(nq);
    this.quasarR = new Float32Array(nq);
    for (let i = 0; i < nq; i++) {
      // Uniform in volume between 6 and 30 Gly (z ≈ 0.6–7); weighting by the quasar epoch happens in colours.
      const r = Math.cbrt(6 ** 3 + rng.next() * (30 ** 3 - 6 ** 3));
      const [x, y, z] = rng.direction();
      qp.set([x * r, y * r, z * r], i * 3);
      qs[i] = 0.12;
      this.quasarR[i] = r;
    }
    this.quasars = makePoints({ positions: qp, colors: new Float32Array(nq * 3), sizes: qs, count: nq }, { minPx: 2.2, maxPx: 5 });
    this.scene.add(this.quasars);

    for (const z of SHELL_Z) {
      const c = redshiftColor(z);
      const line = ring(`#${c.getHexString()}`, 0.45);
      this.shells.add(line);
      this.shellRings.push({ z, line, r: 1 });
    }
    const hz: [string, string, { zh: string; en: string }][] = [
      ['hubble', '#7dffcf', { zh: '哈勃球', en: 'Hubble sphere' }],
      ['event', '#ff8fab', { zh: '事件视界', en: 'Event horizon' }],
      ['particle', '#9ecbff', { zh: '粒子视界', en: 'Particle horizon' }],
    ];
    for (const [id, color, name] of hz) {
      const line = ring(color, 0.55, id !== 'particle');
      this.shells.add(line);
      this.horizons.push({ id, line, r: 1, color, name });
    }
    this.scene.add(this.shells);

    const w = 4;
    const data = new Uint8Array(w * w * 4).fill(90);
    this.cmbTexture = new THREE.DataTexture(data, w, w, THREE.RGBAFormat);
    this.cmbTexture.colorSpace = THREE.SRGBColorSpace;
    this.cmbTexture.needsUpdate = true;
    const sphere = new THREE.SphereGeometry(1, 160, 80);
    this.cmb = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: this.cmbTexture }, uOpacity: { value: 1 }, uInside: { value: 0 } },
        vertexShader: CMB_VERT,
        fragmentShader: CMB_FRAG,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.cmbRim = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#ffb070') },
          uSunPos: { value: new THREE.Vector3(1e6, 0, 0) },
          uStrength: { value: 0.7 },
          uOpacity: { value: 1 },
        },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG.replace('float day = clamp(dot(N, L) * 0.7 + 0.45, 0.0, 1.0);', 'float day = 1.0;'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    // Texture longitude/colatitude map onto Galactic (l, b): local (x, y, z) → Galactic (−x, z, y).
    const [bx, by, bz] = galacticBasisWorld();
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(-bx[0], -bx[1], -bx[2]),
      new THREE.Vector3(...bz),
      new THREE.Vector3(...by),
    );
    this.cmb.quaternion.setFromRotationMatrix(m);
    this.cmb.renderOrder = -2;
    this.cmbRim.renderOrder = -1;
    this.scene.add(this.cmb, this.cmbRim);
  }

  /** Re-derives every distance-dependent element (shells, horizons, colours) for a cosmology. */
  setCosmology(cosmo: Cosmology, zStar = 1090): void {
    this.cosmo = cosmo;
    const toGly = (mpc: number) => mpc * MPC_GLY;
    this.rCmb = toGly(cosmo.comovingDistance(zStar));
    this.rParticle = toGly(cosmo.particleHorizon(1));
    this.cmb.scale.setScalar(this.rCmb);
    this.cmbRim.scale.setScalar(this.rCmb * 1.001);
    for (const s of this.shellRings) s.r = toGly(cosmo.comovingDistance(s.z));
    for (const h of this.horizons) {
      h.r =
        h.id === 'hubble'
          ? toGly(cosmo.hubbleRadius(1))
          : h.id === 'event'
            ? toGly(cosmo.eventHorizon(1))
            : this.rParticle;
    }
    // z(r) lookup table for recolouring.
    const N = 1024;
    const rMax = this.rParticle;
    const zTab = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) zTab[i] = cosmo.zAtComovingDistance(((i / N) * rMax) / MPC_GLY);
    const zOf = (r: number) => {
      const x = Math.min(N, (r / rMax) * N);
      const i = Math.min(N - 1, Math.floor(x));
      return zTab[i] + (zTab[i + 1] - zTab[i]) * (x - i);
    };
    const col = this.galaxies.geometry.getAttribute('color') as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < this.galaxyR.length; i++) {
      const z = zOf(this.galaxyR[i]);
      // Galaxies thin out towards cosmic dawn (no luminous galaxies before z ≈ 20).
      const formed = 1 - ramp(Math.log1p(z), Math.log1p(6), Math.log1p(18));
      const dim = (1 / (1 + (this.galaxyR[i] / 9) ** 1.3)) * 0.8 + 0.2;
      redshiftColor(z, c);
      const k = this.galaxyBase[i] * formed * dim * 1.2;
      col.setXYZ(i, c.r * k, c.g * k, c.b * k);
    }
    col.needsUpdate = true;
    const qcol = this.quasars.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < this.quasarR.length; i++) {
      const z = zOf(this.quasarR[i]);
      const epoch = Math.exp(-(((z - 2.2) / 1.7) ** 2));
      redshiftColor(z * 0.6, c);
      c.lerp(new THREE.Color('#bfe3ff'), 0.55);
      const k = 1.6 * epoch;
      qcol.setXYZ(i, c.r * k, c.g * k, c.b * k);
    }
    qcol.needsUpdate = true;
  }

  setCmbTexture(rgba: Uint8ClampedArray, width: number, height: number): void {
    // Flip rows so that row 0 (north Galactic pole) maps to the top of the sphere (v = 1).
    const flipped = new Uint8Array(rgba.length);
    const row = width * 4;
    for (let j = 0; j < height; j++) flipped.set(rgba.subarray(j * row, (j + 1) * row), (height - 1 - j) * row);
    const tex = new THREE.DataTexture(flipped, width, height, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    this.cmbTexture.dispose();
    this.cmbTexture = tex;
    this.cmb.material.uniforms.uMap.value = tex;
  }

  computeOpacity(ctx: FrameContext): number {
    return ctx.settings.cmbSky ? 1 : ramp(ctx.logView, 25.0, 25.7);
  }

  update(ctx: FrameContext): void {
    const lv = ctx.logView;
    const base = ramp(lv, 25.0, 25.7);
    setOpacity(this.galaxies, base * 0.6);
    setOpacity(this.quasars, base * ramp(lv, 25.6, 26.3));
    const shellsOn = ctx.settings.shells ? 1 : 0;
    // Shells are camera-facing circles: the outline of each sphere seen from the camera.
    this.shells.quaternion.copy(this.camera.quaternion);
    const camR = this.camera.position.length();
    for (const s of this.shellRings) {
      s.line.scale.setScalar(s.r);
      const vis = ramp(lv, Math.log10(s.r * GLY_M) - 0.2, Math.log10(s.r * GLY_M) + 0.5) * (1 - ramp(lv, 27.4, 27.8));
      setOpacity(s.line, vis * shellsOn * base * (camR > s.r ? 1 : 0.35));
    }
    for (const h of this.horizons) {
      h.line.scale.setScalar(h.r);
      const vis = ramp(lv, Math.log10(h.r * GLY_M) - 0.2, Math.log10(h.r * GLY_M) + 0.4);
      setOpacity(h.line, vis * shellsOn * base);
    }
    const inside = camR < this.rCmb ? 1 : 0;
    const cmbVis = ctx.settings.cmbSky ? Math.max(0.85, ramp(lv, 25.9, 26.5)) : ramp(lv, 25.9, 26.5);
    this.cmb.material.uniforms.uInside.value = inside;
    // From outside, the far hemisphere is seen through the galaxies as a translucent shell.
    setOpacity(this.cmb, cmbVis * (inside ? 1 : 0.45));
    setOpacity(this.cmbRim, ramp(lv, 26.3, 26.8) * (1 - inside) * 0.3);
  }

  /** Labels for shells and horizons (world metres), positioned on the top of each outline. */
  shellLabels(ctx: FrameContext): ShellLabel[] {
    if (!ctx.settings.shells || !this.cosmo) return [];
    const lv = ctx.logView;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const out: ShellLabel[] = [];
    // Labels are fanned around their circles so neighbouring shells don't collide.
    const add = (key: string, r: number, text: { zh: string; en: string }, color: string, angleDeg: number) => {
      const logR = Math.log10(r * GLY_M);
      if (lv < logR - 0.15 || lv > 27.6) return;
      const a = (angleDeg * Math.PI) / 180;
      const p = up.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(right, Math.sin(a) * r);
      out.push({ key, text, position: [p.x * GLY_M, p.y * GLY_M, p.z * GLY_M], color });
    };
    this.shellRings.forEach((s, i) => {
      const lb = this.cosmo!.lookbackTime(s.z);
      add(`z${s.z}`, s.r, { zh: `z = ${s.z} · ${(lb * 10).toFixed(lb < 1 ? 1 : 0)} 亿年前`, en: `z = ${s.z} · ${lb.toFixed(1)} Gyr ago` }, `#${redshiftColor(s.z).getHexString()}`, -40 + i * 11);
    });
    this.horizons.forEach((h, i) => add(h.id, h.r, h.name, h.color, 150 + i * 14));
    return out;
  }
}
