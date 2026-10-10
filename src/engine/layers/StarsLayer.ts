import * as THREE from 'three';
import { LY_M } from '../../physics/constants';
import { galacticToWorld, parseDec, parseRA, raDecToWorld, scale, type Vec3 } from '../../physics/coords';
import { STARS, spectralColor } from '../../data/stars';
import { Rng } from '../../utils/random';
import { Layer, ramp, setOpacity, shared, type FrameContext } from '../core';
import { GLOW_FRAG, GLOW_VERT, PLANET_FRAG, PLANET_VERT, STARS_FRAG, STARS_VERT } from '../shaders';

interface StarClass {
  frac: number;
  M: [number, number];
  color: string;
  height: number;
}

/** Rough solar-neighbourhood luminosity function by spectral class. */
const CLASSES: StarClass[] = [
  { frac: 0.003, M: [-5.5, -1.5], color: '#9bb0ff', height: 150 },
  { frac: 0.012, M: [-0.5, 2], color: '#cad7ff', height: 250 },
  { frac: 0.03, M: [2, 4], color: '#f8f7ff', height: 300 },
  { frac: 0.08, M: [4, 6], color: '#fff4ea', height: 350 },
  { frac: 0.14, M: [5.5, 8.5], color: '#ffd2a1', height: 380 },
  { frac: 0.035, M: [-1.5, 1.2], color: '#ffc285', height: 450 },
  { frac: 0.6, M: [8.5, 15], color: '#ffb56c', height: 400 },
  { frac: 0.1, M: [10, 15], color: '#e8eeff', height: 450 },
];

export class StarsLayer extends Layer {
  private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private glows: THREE.Group;
  private closeup: THREE.Group;
  private closeupMat: THREE.ShaderMaterial;
  private closeupGlow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private closeupMesh: THREE.Mesh;

  constructor(quality: 'low' | 'medium' | 'high') {
    super('stars', LY_M);
    this.extent = 3000;
    const nProc = quality === 'low' ? 15000 : quality === 'medium' ? 28000 : 42000;
    const named = STARS.filter((s) => (s.kind ?? 'star') === 'star');
    const n = named.length + 1 + nProc;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const mag = new Float32Array(n);
    const c = new THREE.Color();
    let k = 0;
    const put = (p: Vec3, hex: string, M: number) => {
      pos.set(p, k * 3);
      c.set(hex);
      col.set([c.r, c.g, c.b], k * 3);
      mag[k] = M;
      k++;
    };
    put([0, 0, 0], '#fff4ea', 4.83);
    for (const s of named) {
      const dir = raDecToWorld(parseRA(s.ra), parseDec(s.dec));
      const dPc = s.distLy / 3.26156;
      put(scale(dir, s.distLy), spectralColor(s.spectral), s.vmag - 5 * Math.log10(dPc / 10));
    }
    const rng = new Rng(77);
    const cum: number[] = [];
    CLASSES.reduce((acc, cl) => {
      cum.push(acc + cl.frac);
      return acc + cl.frac;
    }, 0);
    const total = cum[cum.length - 1];
    for (let i = 0; i < nProc; i++) {
      const u = rng.next() * total;
      const cl = CLASSES[cum.findIndex((x) => u <= x)];
      // Uniform in a 1500-ly disc with an exponential vertical profile (Galactic frame).
      const r = 1500 * Math.sqrt(rng.next());
      const phi = rng.next() * Math.PI * 2;
      const z = -Math.log(1 - rng.next()) * cl.height * (rng.next() < 0.5 ? -1 : 1);
      if (r < 15 && rng.next() < 0.9) continue;
      const p = galacticToWorld([r * Math.cos(phi), r * Math.sin(phi), z]);
      put(p, cl.color, cl.M[0] + rng.next() * (cl.M[1] - cl.M[0]));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, k * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, k * 3), 3));
    geo.setAttribute('absMag', new THREE.BufferAttribute(mag.subarray(0, k), 1));
    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: {
          uOpacity: { value: 1 },
          uMagLimit: { value: 6.5 },
          uPxScale: { value: 1 },
          uBoost: { value: 0 },
        },
        vertexShader: STARS_VERT,
        fragmentShader: STARS_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Nebulae and star clusters as soft glows.
    this.glows = new THREE.Group();
    for (const s of STARS) {
      const kind = s.kind ?? 'star';
      if (kind !== 'nebula' && kind !== 'star-cluster') continue;
      const p = scale(raDecToWorld(parseRA(s.ra), parseDec(s.dec)), s.distLy);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
      const glow = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          uniforms: {
            uScale: shared.uScale,
            uWorldSize: { value: (s.sizeLy ?? 10) * 1.6 },
            uPx: { value: 0 },
            uMinPx: { value: 2 },
            uMaxPx: { value: 900 },
            uColor: { value: new THREE.Color(kind === 'nebula' ? (s.spectral === 'SNR' ? '#9fc4ff' : '#ff6fa5') : '#a8c4ff').multiplyScalar(0.55) },
            uOpacity: { value: 1 },
          },
          vertexShader: GLOW_VERT,
          fragmentShader: GLOW_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.frustumCulled = false;
      this.glows.add(glow);
    }
    this.scene.add(this.glows);

    // Close-up sphere for whichever star is focused.
    this.closeup = new THREE.Group();
    this.closeupMat = new THREE.ShaderMaterial({
      uniforms: {
        uKind: { value: 0 },
        uC0: { value: new THREE.Color('#ffffff') },
        uC1: { value: new THREE.Color('#ffaa55') },
        uC2: { value: new THREE.Color('#ff7a1a') },
        uBands: { value: 0 },
        uSeed: { value: 3 },
        uTime: { value: 0 },
        uSpot: { value: 0 },
        uSunPos: { value: new THREE.Vector3() },
        uOpacity: { value: 1 },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });
    this.closeupMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), this.closeupMat);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    this.closeupGlow = new THREE.Points(
      cg,
      new THREE.ShaderMaterial({
        uniforms: {
          uScale: shared.uScale,
          uWorldSize: { value: 1 },
          uPx: { value: 0 },
          uMinPx: { value: 0 },
          uMaxPx: { value: 700 },
          uColor: { value: new THREE.Color('#ffffff') },
          uOpacity: { value: 1 },
        },
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.closeupGlow.frustumCulled = false;
    this.closeup.add(this.closeupMesh, this.closeupGlow);
    this.closeup.visible = false;
    this.scene.add(this.closeup);
  }

  computeOpacity(ctx: FrameContext): number {
    return 1 - ramp(ctx.logView, 19.6, 20.6);
  }

  update(ctx: FrameContext): void {
    const lv = ctx.logView;
    const u = this.points.material.uniforms;
    u.uOpacity.value = this.opacity;
    // Reveal fainter stars as the camera pulls back so the 3-D neighbourhood stays populated.
    u.uMagLimit.value = 6.8 + ramp(lv, 15.5, 18.8) * 9.5;
    u.uPxScale.value = Math.min(window.devicePixelRatio || 1, 2);
    u.uBoost.value = 0;
    setOpacity(this.glows, ramp(lv, 15.5, 17.5) * this.opacity);

    const star = ctx.focusId ? STARS.find((s) => s.id === ctx.focusId && (s.kind ?? 'star') === 'star') : undefined;
    if (star && star.radius && ctx.viewDist < 3e14) {
      const p = scale(raDecToWorld(parseRA(star.ra), parseDec(star.dec)), star.distLy);
      const rLy = (star.radius * 6.957e8) / LY_M;
      this.closeup.position.set(p[0], p[1], p[2]);
      this.closeupMesh.scale.setScalar(rLy);
      const base = new THREE.Color(spectralColor(star.spectral));
      this.closeupMat.uniforms.uC0.value.copy(base).lerp(new THREE.Color('#ffffff'), 0.35);
      this.closeupMat.uniforms.uC1.value.copy(base);
      this.closeupMat.uniforms.uC2.value.copy(base).multiplyScalar(0.6);
      this.closeupMat.uniforms.uTime.value = ctx.time;
      const gu = this.closeupGlow.material.uniforms;
      gu.uWorldSize.value = rLy * 16;
      gu.uColor.value.copy(base);
      const fade = 1 - ramp(Math.log10(ctx.viewDist), 13.5, 14.4);
      gu.uOpacity.value = fade;
      this.closeup.visible = fade > 0.01;
    } else {
      this.closeup.visible = false;
    }
  }
}
