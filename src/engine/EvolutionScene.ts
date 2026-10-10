import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EvoVisual } from '../sim/evolution';
import { Rng } from '../utils/random';
import { shared } from './core';
import { ENV_NODE, generateCosmicWeb } from './procedural/cosmicWeb';

const VERT = /* glsl */ `
attribute vec3 initial;
attribute float kind;
attribute float env;
attribute float rnd;
uniform float uGrowth;
uniform float uScaleView;
uniform float uPlasma;
uniform vec3 uPlasmaColor;
uniform float uLum;
uniform float uDawn;
uniform float uDM;
uniform float uAge;
uniform float uJitter;
uniform float uTime;
uniform float uScale;
uniform float uPx;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = mix(initial, position, uGrowth);
  if (uJitter > 0.0) {
    vec3 j = vec3(sin(rnd * 91.7 + uTime * 23.0), sin(rnd * 47.3 + uTime * 17.0), sin(rnd * 13.9 + uTime * 29.0));
    p += j * uJitter * 4.0;
  }
  p *= uScaleView;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv.z, 1e-6);
  vec3 young = vec3(0.62, 0.76, 1.0);
  vec3 old = vec3(1.0, 0.74, 0.5);
  float isNode = step(2.5, env);
  vec3 gal = mix(young, old, clamp(uAge + isNode * 0.25, 0.0, 1.0));
  float galA = kind * uLum * (0.45 + 0.22 * env);
  float sparkle = kind * isNode * uDawn * (0.55 + 0.45 * sin(uTime * 2.5 + rnd * 60.0));
  vec3 dmCol = vec3(0.5, 0.32, 1.0);
  float dmA = (1.0 - kind * 0.5) * uDM * (0.25 + 0.12 * env);
  vec3 col = gal * galA * 1.4 + vec3(1.0, 0.92, 0.75) * sparkle * 1.6 + dmCol * dmA;
  col = mix(col, uPlasmaColor * 1.1, uPlasma);
  float a = max(max(galA, sparkle), max(dmA, uPlasma * 0.7));
  float px = uPx * (kind > 0.5 ? 1.5 : 1.0) * uScale / dist;
  gl_PointSize = clamp(px, 1.0, 7.0);
  gl_Position = projectionMatrix * mv;
  vColor = col;
  vAlpha = a;
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vColor, exp(-r2 * 3.0) * vAlpha);
}
`;

const BUBBLE_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const BUBBLE_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
  gl_FragColor = vec4(vec3(0.35, 0.6, 1.0), (0.05 + rim * 0.5) * uOpacity);
}
`;

const HALF = 150;

/** Structure formation in a ~1 billion light-year comoving box, driven by the cosmic clock. */
export class EvolutionScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 1, 50000);
  readonly controls: OrbitControls;
  readonly clearColor = new THREE.Color(0, 0, 0);
  private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private bubbles: THREE.InstancedMesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private bubbleSeeds: { q: THREE.Vector3; x: THREE.Vector3; k: number }[] = [];
  private box: THREE.LineSegments;
  private time = 0;

  constructor(dom: HTMLElement, quality: 'low' | 'medium' | 'high') {
    this.camera.position.set(330, 210, 360);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.25;
    this.controls.minDistance = 40;
    this.controls.maxDistance = 3000;
    this.controls.enabled = false;

    const n = quality === 'low' ? 50000 : quality === 'medium' ? 90000 : 140000;
    const web = generateCosmicWeb({ seed: 314, count: n, radius: HALF, cellSize: 42, cube: true });
    const rng = new Rng(99);
    const kind = new Float32Array(web.count);
    const env = new Float32Array(web.count);
    const rnd = new Float32Array(web.count);
    for (let i = 0; i < web.count; i++) {
      env[i] = web.env[i];
      kind[i] = rng.next() < 0.3 + 0.12 * web.env[i] ? 1 : 0;
      rnd[i] = rng.next();
      if (web.env[i] === ENV_NODE && kind[i] === 1 && this.bubbleSeeds.length < 260 && rng.next() < 0.06) {
        this.bubbleSeeds.push({
          q: new THREE.Vector3(web.initial[i * 3], web.initial[i * 3 + 1], web.initial[i * 3 + 2]),
          x: new THREE.Vector3(web.positions[i * 3], web.positions[i * 3 + 1], web.positions[i * 3 + 2]),
          k: 0.6 + rng.next() * 0.8,
        });
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(web.positions, 3));
    g.setAttribute('initial', new THREE.BufferAttribute(web.initial, 3));
    g.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
    g.setAttribute('env', new THREE.BufferAttribute(env, 1));
    g.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: {
          uGrowth: { value: 1 },
          uScaleView: { value: 1 },
          uPlasma: { value: 0 },
          uPlasmaColor: { value: new THREE.Color(1, 1, 1) },
          uLum: { value: 1 },
          uDawn: { value: 0 },
          uDM: { value: 0 },
          uAge: { value: 0.5 },
          uJitter: { value: 0 },
          uTime: { value: 0 },
          uScale: shared.uScale,
          uPx: { value: 1.6 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.bubbles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: BUBBLE_VERT,
        fragmentShader: BUBBLE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      this.bubbleSeeds.length,
    );
    this.bubbles.frustumCulled = false;
    this.scene.add(this.bubbles);

    this.box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(HALF * 2, HALF * 2, HALF * 2)),
      new THREE.LineBasicMaterial({ color: '#4c6a9a', transparent: true, opacity: 0.35 }),
    );
    this.scene.add(this.box);
  }

  setActive(active: boolean): void {
    this.controls.enabled = active;
  }

  apply(v: EvoVisual, showDM: boolean): void {
    const u = this.points.material.uniforms;
    u.uGrowth.value = v.growth;
    u.uScaleView.value = v.scaleView;
    u.uPlasma.value = v.plasma;
    u.uPlasmaColor.value.setRGB(...v.plasmaColor);
    u.uLum.value = v.lum;
    u.uDawn.value = v.dawn;
    u.uDM.value = showDM ? Math.max(v.dm, 0.45 * (1 - v.plasma)) : v.dm;
    u.uAge.value = v.age;
    u.uJitter.value = v.jitter;
    this.box.scale.setScalar(v.scaleView);
    const g = Math.min(1, v.glow);
    this.clearColor.setRGB(v.plasmaColor[0] * g * 0.32, v.plasmaColor[1] * g * 0.3, v.plasmaColor[2] * g * 0.3);

    const bubbleVis = v.ionized > 0.002 && v.ionized < 0.985 ? Math.min(1, v.ionized * 8) * (1 - Math.pow(v.ionized, 6)) : 0;
    this.bubbles.material.uniforms.uOpacity.value = bubbleVis * 0.8;
    this.bubbles.visible = bubbleVis > 0.01;
    if (this.bubbles.visible) {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const rMax = 46;
      this.bubbleSeeds.forEach((b, i) => {
        p.copy(b.q).lerp(b.x, v.growth).multiplyScalar(v.scaleView);
        const r = rMax * Math.cbrt(v.ionized) * b.k * v.scaleView;
        m.makeScale(r, r, r).setPosition(p);
        this.bubbles.setMatrixAt(i, m);
      });
      this.bubbles.instanceMatrix.needsUpdate = true;
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.points.material.uniforms.uTime.value = this.time;
    this.controls.update(dt);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.controls.dispose();
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.bubbles.dispose();
  }
}
