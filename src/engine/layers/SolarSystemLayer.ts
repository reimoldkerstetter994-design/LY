import * as THREE from 'three';
import { AU_M, DEG } from '../../physics/constants';
import { eclipticToWorld, type Vec3 } from '../../physics/coords';
import { J2000_JD, orbitPath, solveKepler } from '../../physics/kepler';
import { PROBES, SOLAR_BODIES, type SolarBody } from '../../data/solarSystem';
import { BODY_BY_ID, bodyPosition, equatorBasis, poleVector } from '../../sim/ephemeris';
import { Rng } from '../../utils/random';
import { Layer, band, makePoints, ramp, setOpacity, shared, type FrameContext } from '../core';
import { ATMO_FRAG, ATMO_VERT, GLOW_FRAG, GLOW_VERT, PLANET_FRAG, PLANET_VERT, RING_FRAG, RING_VERT } from '../shaders';
import type { ParticleCloud } from '../procedural/galaxyModel';

interface BodyView {
  body: SolarBody;
  group: THREE.Group;
  tilt: THREE.Group;
  spin: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  atmo?: THREE.Mesh;
  ring?: THREE.Mesh;
  radiusAu: number;
}

const DOT_VERT = /* glsl */ `
attribute vec3 color;
attribute float alpha;
uniform float uPx;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uPx;
  gl_Position = projectionMatrix * mv;
  vColor = color;
  vAlpha = alpha * uOpacity;
}
`;
const DOT_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  gl_FragColor = vec4(vColor, (1.0 - smoothstep(0.55, 1.0, r)) * vAlpha);
}
`;

const toWorldAu = (v: Vec3): Vec3 => eclipticToWorld(v);

function orbitalCloud(
  rng: Rng,
  n: number,
  aRange: [number, number],
  eSigma: number,
  incSigmaDeg: number,
  color: THREE.Color,
  size: number,
  filter?: (a: number) => boolean,
): ParticleCloud {
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  let k = 0;
  while (k < n) {
    const a = aRange[0] + rng.next() * (aRange[1] - aRange[0]);
    if (filter && !filter(a)) continue;
    const e = Math.min(0.6, Math.abs(rng.gauss() * eSigma));
    const inc = Math.abs(rng.gauss() * incSigmaDeg) * DEG;
    const Om = rng.next() * Math.PI * 2;
    const w = rng.next() * Math.PI * 2;
    const E = solveKepler(rng.next() * Math.PI * 2, e);
    const xp = a * (Math.cos(E) - e);
    const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const co = Math.cos(w);
    const so = Math.sin(w);
    const cO = Math.cos(Om);
    const sO = Math.sin(Om);
    const ci = Math.cos(inc);
    const si = Math.sin(inc);
    const ecl: Vec3 = [
      (co * cO - so * sO * ci) * xp + (-so * cO - co * sO * ci) * yp,
      (co * sO + so * cO * ci) * xp + (-so * sO + co * cO * ci) * yp,
      so * si * xp + co * si * yp,
    ];
    const p = toWorldAu(ecl);
    positions.set(p, k * 3);
    const j = 0.7 + rng.next() * 0.6;
    colors[k * 3] = color.r * j;
    colors[k * 3 + 1] = color.g * j;
    colors[k * 3 + 2] = color.b * j;
    sizes[k] = size * (0.6 + rng.next() * 0.8);
    k++;
  }
  return { positions, colors, sizes, count: n };
}

export class SolarSystemLayer extends Layer {
  private views: BodyView[] = [];
  private sunGlow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private orbits = new Map<string, THREE.Line>();
  private orbitEpoch = Number.NaN;
  private moonOrbits: { body: SolarBody; group: THREE.Group; line: THREE.LineLoop; aAu: number }[] = [];
  private dots: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private dotIds: string[] = [];
  private asteroid: THREE.Points;
  private kuiper: THREE.Points;
  private oort: THREE.Points;
  private heliopause: THREE.Mesh;
  private probes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly sphereGeo = new THREE.SphereGeometry(1, 96, 48);

  constructor(quality: 'low' | 'medium' | 'high') {
    super('solar', AU_M);
    this.solid = true;
    this.extent = 1e5;
    const q = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1;

    for (const body of SOLAR_BODIES) this.views.push(this.buildBody(body));

    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    this.sunGlow = new THREE.Points(
      glowGeo,
      new THREE.ShaderMaterial({
        uniforms: {
          uScale: shared.uScale,
          uWorldSize: { value: (695700 / 1.496e8) * 18 },
          uPx: { value: 0 },
          uMinPx: { value: 7 },
          uMaxPx: { value: 520 },
          uColor: { value: new THREE.Color('#ffd9a0') },
          uOpacity: { value: 1 },
        },
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.sunGlow.frustumCulled = false;
    this.sunGlow.renderOrder = 5;
    this.scene.add(this.sunGlow);

    // Planet marker dots (visible when the discs are sub-pixel).
    const dotBodies = SOLAR_BODIES.filter((b) => b.id !== 'sun');
    this.dotIds = dotBodies.map((b) => b.id);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dotBodies.length * 3), 3));
    const dc = new Float32Array(dotBodies.length * 3);
    dotBodies.forEach((b, i) => {
      const c = new THREE.Color(b.color);
      dc.set([c.r * 1.2, c.g * 1.2, c.b * 1.2], i * 3);
    });
    dg.setAttribute('color', new THREE.BufferAttribute(dc, 3));
    dg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(dotBodies.length).fill(1), 1));
    this.dots = new THREE.Points(
      dg,
      new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 4 }, uOpacity: { value: 1 } },
        vertexShader: DOT_VERT,
        fragmentShader: DOT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.dots.frustumCulled = false;
    this.scene.add(this.dots);

    // Moon orbit circles that follow their parent.
    for (const body of SOLAR_BODIES) {
      if (body.kind !== 'moon') continue;
      const parent = BODY_BY_ID.get(body.parent!)!;
      const aKm = body.moonOrbit?.aKm ?? 384_400;
      const aAu = (aKm * 1000) / AU_M;
      let u: Vec3;
      let v: Vec3;
      if (body.id === 'moon') {
        const inc = 5.145 * DEG;
        u = toWorldAu([1, 0, 0]);
        v = toWorldAu([0, Math.cos(inc), Math.sin(inc)]);
      } else {
        [u, v] = equatorBasis(parent);
      }
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 128; i++) {
        const t = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          (u[0] * Math.cos(t) + v[0] * Math.sin(t)) * aAu,
          (u[1] * Math.cos(t) + v[1] * Math.sin(t)) * aAu,
          (u[2] * Math.cos(t) + v[2] * Math.sin(t)) * aAu,
        ));
      }
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: body.color, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      const group = new THREE.Group();
      group.add(line);
      this.scene.add(group);
      this.moonOrbits.push({ body, group, line, aAu });
    }

    const rng = new Rng(2024);
    const gaps = [2.5, 2.82, 2.95, 3.27];
    this.asteroid = makePoints(
      orbitalCloud(rng, Math.floor(9000 * q), [2.1, 3.3], 0.08, 7, new THREE.Color('#b9a58e'), 0.012, (a) => gaps.every((g) => Math.abs(a - g) > 0.02)),
      { minPx: 1.2, maxPx: 3, depthTest: true },
    );
    this.kuiper = makePoints(orbitalCloud(rng, Math.floor(8000 * q), [30, 50], 0.1, 10, new THREE.Color('#9fb7d6'), 0.25), {
      minPx: 1.2,
      maxPx: 3,
      depthTest: true,
    });
    this.oort = makePoints(this.makeOort(rng, Math.floor(16000 * q)), { minPx: 1.2, maxPx: 3.5 });
    this.scene.add(this.asteroid, this.kuiper, this.oort);

    this.heliopause = new THREE.Mesh(
      new THREE.SphereGeometry(120, 64, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#5aa0ff') },
          uSunPos: { value: new THREE.Vector3(1e9, 0, 0) },
          uStrength: { value: 0.5 },
          uOpacity: { value: 1 },
        },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG.replace('float day = clamp(dot(N, L) * 0.7 + 0.45, 0.0, 1.0);', 'float day = 1.0;'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.heliopause.scale.set(1.25, 1, 1);
    this.scene.add(this.heliopause);

    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PROBES.length * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PROBES.length * 3).fill(0.7), 3));
    pg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(PROBES.length).fill(1), 1));
    this.probes = new THREE.Points(
      pg,
      new THREE.ShaderMaterial({
        uniforms: { uPx: { value: 4 }, uOpacity: { value: 1 } },
        vertexShader: DOT_VERT,
        fragmentShader: DOT_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.probes.frustumCulled = false;
    this.scene.add(this.probes);
  }

  private makeOort(rng: Rng, n: number): ParticleCloud {
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Number density ∝ r^-3.5 between 2 000 and 100 000 au.
      const u = rng.next();
      const r0 = 2000;
      const r1 = 100000;
      const r = Math.pow(Math.pow(r0, -0.5) + u * (Math.pow(r1, -0.5) - Math.pow(r0, -0.5)), -2);
      let [x, y, z] = rng.direction();
      if (r < 20000) y *= 0.5; // the inner (Hills) cloud is flattened towards the ecliptic
      const len = Math.hypot(x, y, z);
      x /= len;
      y /= len;
      z /= len;
      positions.set([x * r, y * r, z * r], i * 3);
      const b = 0.25 + rng.next() * 0.35;
      colors.set([0.55 * b, 0.7 * b, 1.0 * b], i * 3);
      sizes[i] = r * 0.012;
    }
    return { positions, colors, sizes, count: n };
  }

  private buildBody(body: SolarBody): BodyView {
    const radiusAu = (body.radiusKm * 1000) / AU_M;
    const ap = body.appearance;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uKind: { value: ap.kind },
        uC0: { value: new THREE.Color(ap.colors[0]) },
        uC1: { value: new THREE.Color(ap.colors[1]) },
        uC2: { value: new THREE.Color(ap.colors[2]) },
        uBands: { value: ap.bands ?? 10 },
        uSeed: { value: ap.seed },
        uTime: { value: 0 },
        uSpot: { value: ap.spot ? 1 : 0 },
        uSunPos: { value: new THREE.Vector3(0, 0, 0) },
        uOpacity: { value: 1 },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    const spin = new THREE.Mesh(this.sphereGeo, mat);
    spin.scale.setScalar(radiusAu);
    tilt.add(spin);
    group.add(tilt);
    const pole = poleVector(body);
    tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...pole));
    const view: BodyView = { body, group, tilt, spin, mat, radiusAu };
    if (ap.atmosphere) {
      const atmo = new THREE.Mesh(
        this.sphereGeo,
        new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: new THREE.Color(ap.atmosphere) },
            uSunPos: { value: new THREE.Vector3(0, 0, 0) },
            uStrength: { value: ap.atmosphereStrength ?? 0.6 },
            uOpacity: { value: 1 },
          },
          vertexShader: ATMO_VERT,
          fragmentShader: ATMO_FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      atmo.scale.setScalar(radiusAu * (ap.kind === 2 ? 1.025 : ap.kind === 5 ? 1.035 : 1.015));
      group.add(atmo);
      view.atmo = atmo;
    }
    if (ap.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(ap.ring.inner, ap.ring.outer, 256, 1),
        new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: new THREE.Color('#e8d8b4') },
            uSunPos: { value: new THREE.Vector3(0, 0, 0) },
            uPlanetPos: { value: new THREE.Vector3() },
            uPlanetRadius: { value: radiusAu },
            uOpacity: { value: 1 },
          },
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(radiusAu);
      tilt.add(ring);
      view.ring = ring;
    }
    this.scene.add(group);
    return view;
  }

  private rebuildOrbits(jd: number): void {
    for (const line of this.orbits.values()) {
      this.scene.remove(line);
      line.geometry.dispose();
    }
    this.orbits.clear();
    for (const body of SOLAR_BODIES) {
      if (!body.orbitKey) continue;
      const pts = orbitPath(body.orbitKey, jd, 360).map((p) => new THREE.Vector3(...toWorldAu(p)));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: body.color, transparent: true, opacity: 0.42, depthWrite: false }),
      );
      line.frustumCulled = false;
      this.scene.add(line);
      this.orbits.set(body.id, line);
    }
    this.orbitEpoch = jd;
  }

  computeOpacity(ctx: FrameContext): number {
    return 1 - ramp(ctx.logView, 16.9, 17.6);
  }

  update(ctx: FrameContext): void {
    const { jd, logView } = ctx;
    if (!(Math.abs(jd - this.orbitEpoch) < 3650)) this.rebuildOrbits(jd);
    const days = jd - J2000_JD;
    const dotPos = this.dots.geometry.getAttribute('position') as THREE.BufferAttribute;
    const dotAlpha = this.dots.geometry.getAttribute('alpha') as THREE.BufferAttribute;
    const positions = new Map<string, Vec3>();
    for (const v of this.views) {
      const p = bodyPosition(v.body.id, jd);
      const local: Vec3 = [p[0] / AU_M, p[1] / AU_M, p[2] / AU_M];
      positions.set(v.body.id, local);
      v.group.position.set(local[0], local[1], local[2]);
      const spinAngle = ((days * 24) / v.body.rotationHours) * Math.PI * 2;
      v.spin.rotation.y = spinAngle % (Math.PI * 2);
      v.mat.uniforms.uTime.value = ctx.time;
      if (v.ring) (v.ring.material as THREE.ShaderMaterial).uniforms.uPlanetPos.value.set(local[0], local[1], local[2]);
    }
    this.dotIds.forEach((id, i) => {
      const p = positions.get(id)!;
      dotPos.setXYZ(i, p[0], p[1], p[2]);
      const body = BODY_BY_ID.get(id)!;
      let a = 1;
      if (body.kind === 'moon') {
        const aAu = ((body.moonOrbit?.aKm ?? 384_400) * 1000) / AU_M;
        a = 1 - ramp(ctx.viewDist / AU_M / aAu, 40, 160);
      } else if (body.kind === 'dwarf-planet') {
        a = 0.8;
      }
      dotAlpha.setX(i, a);
    });
    dotPos.needsUpdate = true;
    dotAlpha.needsUpdate = true;
    this.dots.material.uniforms.uPx.value = 4.2 * Math.min(window.devicePixelRatio || 1, 2);
    this.dots.material.uniforms.uOpacity.value = (1 - ramp(logView, 14.6, 15.4)) * this.opacity;

    const orbitOpacity = ctx.settings.orbits ? 1 : 0;
    for (const [id, line] of this.orbits) {
      const outer = id === 'jupiter' || id === 'saturn' || id === 'uranus' || id === 'neptune' || id === 'pluto';
      const o = band(logView, 8.6, 9.6, outer ? 14.4 : 13.6, outer ? 15.2 : 14.4) * orbitOpacity * this.opacity;
      setOpacity(line, o);
    }
    for (const mo of this.moonOrbits) {
      const parentPos = positions.get(mo.body.parent!)!;
      mo.group.position.set(parentPos[0], parentPos[1], parentPos[2]);
      const ratio = ctx.viewDist / AU_M / mo.aAu;
      setOpacity(mo.line, ramp(ratio, 0.02, 0.15) * (1 - ramp(ratio, 25, 90)) * orbitOpacity * this.opacity);
    }

    setOpacity(this.asteroid, band(logView, 10.5, 11.3, 13.4, 14.2) * this.opacity);
    setOpacity(this.kuiper, band(logView, 11.5, 12.4, 14.6, 15.4) * this.opacity);
    setOpacity(this.oort, band(logView, 14.2, 15.2, 17.0, 17.6) * this.opacity);
    setOpacity(this.heliopause, band(logView, 12.6, 13.4, 14.9, 15.6) * 0.5 * this.opacity);

    const glow = this.sunGlow.material.uniforms;
    glow.uOpacity.value = this.opacity;
    glow.uMinPx.value = 6 * (1 + ramp(logView, 13, 16) * 0.4);

    const probePos = this.probes.geometry.getAttribute('position') as THREE.BufferAttribute;
    PROBES.forEach((pr, i) => {
      const p = bodyPosition(pr.id, jd);
      probePos.setXYZ(i, p[0] / AU_M, p[1] / AU_M, p[2] / AU_M);
    });
    probePos.needsUpdate = true;
    this.probes.material.uniforms.uOpacity.value = band(logView, 11.5, 12.3, 14.4, 15.2) * this.opacity;

    for (const v of this.views) {
      setOpacity(v.spin, this.opacity);
      if (v.atmo) setOpacity(v.atmo, this.opacity);
      if (v.ring) setOpacity(v.ring, this.opacity);
    }
  }
}
