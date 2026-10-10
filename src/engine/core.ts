import * as THREE from 'three';
import type { Vec3 } from '../physics/coords';
import type { ParticleCloud } from './procedural/galaxyModel';
import { DUST_FRAG, POINTS_FRAG, POINTS_VERT } from './shaders';

export interface EngineSettings {
  labels: boolean;
  orbits: boolean;
  bloom: boolean;
  shells: boolean;
  cmbSky: boolean;
  autoRotate: boolean;
  quality: 'low' | 'medium' | 'high';
}

export interface FrameContext {
  camPos: Vec3;
  camQuat: THREE.Quaternion;
  focus: Vec3;
  viewDist: number;
  logView: number;
  jd: number;
  time: number;
  dt: number;
  fov: number;
  aspect: number;
  heightPx: number;
  settings: EngineSettings;
  focusId: string | null;
}

/** Uniforms shared by every point material (updated once per frame). */
export const shared = {
  uScale: { value: 1000 },
};

/** Smooth 0→1 ramp of x between a and b. */
export function ramp(x: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Visibility window: fades in over [inA, inB] and out over [outA, outB] (log10 metres). */
export function band(x: number, inA: number, inB: number, outA: number, outB: number): number {
  return ramp(x, inA, inB) * (1 - ramp(x, outA, outB));
}

export interface PointsOptions {
  sizeMul?: number;
  minPx?: number;
  maxPx?: number;
  fadeNear?: number;
  depthTest?: boolean;
  dust?: boolean;
}

export function pointsMaterial(o: PointsOptions = {}): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uScale: shared.uScale,
      uSizeMul: { value: o.sizeMul ?? 1 },
      uMinPx: { value: o.minPx ?? 1.5 },
      uMaxPx: { value: o.maxPx ?? 48 },
      uOpacity: { value: 1 },
      uFadeNear: { value: o.fadeNear ?? 0 },
    },
    vertexShader: POINTS_VERT,
    fragmentShader: o.dust ? DUST_FRAG : POINTS_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: o.depthTest ?? false,
  });
  if (o.dust) {
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.ZeroFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  } else {
    mat.blending = THREE.AdditiveBlending;
  }
  return mat;
}

export function cloudGeometry(c: ParticleCloud): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(c.positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c.colors, 3));
  g.setAttribute('size', new THREE.BufferAttribute(c.sizes, 1));
  g.computeBoundingSphere();
  return g;
}

export function makePoints(c: ParticleCloud, o: PointsOptions = {}): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const p = new THREE.Points(cloudGeometry(c), pointsMaterial(o));
  p.frustumCulled = false;
  return p;
}

export function setOpacity(obj: THREE.Object3D, opacity: number): void {
  obj.visible = opacity > 0.002;
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      const sm = mat as THREE.ShaderMaterial;
      if (sm.uniforms?.uOpacity) sm.uniforms.uOpacity.value = opacity;
      else if ('opacity' in mat) {
        const base = (mat.userData.baseOpacity as number | undefined) ?? (mat.userData.baseOpacity = mat.opacity);
        mat.opacity = base * opacity;
      }
    }
  });
}

const qInv = new THREE.Quaternion();

/**
 * A scale layer renders its own scene in its own length unit with its own camera, so that every
 * scale from planetary surfaces to the cosmic horizon keeps full floating-point precision.
 */
export abstract class Layer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 1, 10);
  opacity = 0;
  /** Characteristic size of the layer content (layer units), used for clipping planes. */
  extent = 1;
  /** Whether near/far must preserve depth precision (solid meshes present). */
  solid = false;

  constructor(
    readonly id: string,
    /** Metres per layer unit. The focus-body layer changes this to match the object being inspected. */
    public unit: number,
    /** World position (metres) of the layer origin. */
    public origin: Vec3 = [0, 0, 0],
    /** Rotation from layer-local axes to world axes. */
    public basis: THREE.Quaternion = new THREE.Quaternion(),
  ) {
    this.scene.matrixWorldAutoUpdate = true;
  }

  abstract computeOpacity(ctx: FrameContext): number;
  abstract update(ctx: FrameContext): void;

  /** World (metres) → layer-local coordinates. */
  toLocal(p: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
    out.set((p[0] - this.origin[0]) / this.unit, (p[1] - this.origin[1]) / this.unit, (p[2] - this.origin[2]) / this.unit);
    qInv.copy(this.basis).invert();
    return out.applyQuaternion(qInv);
  }

  syncCamera(ctx: FrameContext): void {
    const cam = this.camera;
    this.toLocal(ctx.camPos, cam.position);
    qInv.copy(this.basis).invert();
    cam.quaternion.copy(qInv).multiply(ctx.camQuat);
    const dLocal = ctx.viewDist / this.unit;
    if (this.solid) {
      cam.near = Math.max(dLocal * 1e-3, 1e-14);
      cam.far = Math.max(dLocal * 2e6, cam.near * 10);
    } else {
      const reach = cam.position.length() + this.extent * 4;
      cam.far = Math.max(dLocal * 1e6, reach);
      cam.near = Math.max(Math.min(dLocal * 1e-3, reach * 1e-9), cam.far * 1e-12);
    }
    cam.fov = ctx.fov;
    cam.aspect = ctx.aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }
}
