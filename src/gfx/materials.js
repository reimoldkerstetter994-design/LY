/**
 * Material library built on top of the procedurally baked textures.
 * Shell materials use vertex colours (baked AO); prop materials do not.
 */

import {
  Group,
  Mesh,
  CylinderGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  ShaderMaterial,
  AdditiveBlending,
  Color,
  DoubleSide,
  FrontSide,
} from 'three';

export function buildMaterials(tex) {
  const shell = (t, extra = {}) =>
    new MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughnessMap: t.roughnessMap,
      vertexColors: true,
      metalness: 0,
      roughness: 1,
      dithering: true,
      ...extra,
    });

  const prop = (t, extra = {}) =>
    new MeshStandardMaterial({
      map: t.map,
      normalMap: t.normalMap,
      roughnessMap: t.roughnessMap,
      metalness: 0,
      roughness: 1,
      dithering: true,
      ...extra,
    });

  const m = {
    // Colours stay near-white: the baked albedo already carries the grime, and
    // tinting it down again is what turns a dark game into an unreadable one.
    floor: shell(tex.floor, { color: 0xffffff }),
    ceiling: shell(tex.ceiling, { color: 0xfdfcf8 }),
    tile: shell(tex.tile, { color: 0xffffff, roughness: 0.85 }),
    paint: shell(tex.wall, { color: 0xfffdf6 }),

    metal: prop(tex.metal, { color: 0xf6f4f0, metalness: 0.45, roughness: 0.72 }),
    wood: prop(tex.wood, { color: 0xfff6e8 }),
    fabric: prop(tex.fabric, { color: 0xfffdf7, roughness: 1 }),
    concrete: prop(tex.floor, { color: 0xfaf8f4 }),
    ceramic: new MeshPhysicalMaterial({
      color: 0xf2f0e8,
      roughness: 0.28,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
      map: tex.ceiling.map,
      normalMap: tex.ceiling.normalMap,
      normalScale: { x: 0.25, y: 0.25 },
    }),
    glass: new MeshPhysicalMaterial({
      color: 0x9aa0a2,
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.34,
      side: DoubleSide,
    }),
    blood: new MeshStandardMaterial({
      map: tex.blood.map,
      roughnessMap: tex.blood.roughnessMap,
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      roughness: 0.4,
      metalness: 0,
      side: FrontSide,
    }),
    tube: new MeshBasicMaterial({ color: 0xd8e4ea, toneMapped: false }),
    // Wet, waxy, and just translucent enough at the edges to look like meat.
    skin: new MeshPhysicalMaterial({
      // White: the colour lives in the baked albedo, like every other surface
      // here, so the creature is not darkened twice over.
      color: 0xffffff,
      map: tex.skin.map,
      normalMap: tex.skin.normalMap,
      roughnessMap: tex.skin.roughnessMap,
      // The body's creases and ingrained grime are baked into vertex colours by
      // the sweep that builds it.
      vertexColors: true,
      normalScale: { x: 1.25, y: 1.25 },
      roughness: 1,
      metalness: 0,
      // A thin wet film, but a *patchy* one. Driving clearcoat roughness from the
      // same map as the surface roughness is what stops it reading as polished
      // stone: at 0.55 flat it laid one broad highlight over the whole body and
      // every bit of baked detail underneath disappeared into it.
      clearcoat: 0.26,
      // Multiplies against the map, so this has to stay high or the wet patches
      // come back as hard specular dots.
      clearcoatRoughness: 0.78,
      clearcoatRoughnessMap: tex.skin.roughnessMap,
      // Sheen stays neutral and weak. A red sheen tinted the entire creature
      // terracotta and made it look like a painted figurine.
      sheen: 0.16,
      sheenColor: new Color(0x6d6660),
      sheenRoughness: 0.7,
    }),
    // The inside of the mouth should swallow light, not reflect it.
    maw: new MeshStandardMaterial({ color: 0x08070a, roughness: 1, metalness: 0 }),
    // Sunk deep in an empty socket, this is a wet reflection catching the
    // torch — not a lit-up robot eye, so it is kept dim and small.
    eye: new MeshBasicMaterial({ color: 0x6a5c3e, toneMapped: false }),
    sign: new MeshBasicMaterial({ color: 0x1a9c4a, toneMapped: false }),
    signRed: new MeshBasicMaterial({ color: 0xb01c22, toneMapped: false }),
  };

  // The creature's parts are all lathes with their own normalised UVs, so a
  // single repeat stretches the pores and blotching across an entire limb and
  // the skin comes out as flat, unpainted plastic. Tiling brings the detail back
  // to roughly life size on the torso.
  for (const k of ['map', 'normalMap', 'roughnessMap']) {
    m.skin[k].repeat.set(2.4, 2.4);
    m.skin[k].needsUpdate = true;
  }
  m.skin.envMapIntensity = 0.4;
  return m;
}

/**
 * Additive shell used to fake light scattering through dusty air.
 *
 * A single open cone can't represent volume, so the alpha is driven by how
 * square-on the surface is to the eye: the silhouette fades out and the middle
 * fills in. Stack a few of these (see `makeBeamCone`) and you get a beam that
 * reads as thick near the lens and dissolves into the dark.
 */
export function makeVolumetricMaterial({ color = 0xfff0d2, intensity = 0.16 } = {}) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(color) },
      uIntensity: { value: intensity },
      uFade: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vViewDir;
      varying vec3 vNrm;
      void main() {
        vLocal = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mv.xyz);
        vNrm = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3  uColor;
      uniform float uIntensity;
      uniform float uFade;
      varying vec3 vLocal;
      varying vec3 vViewDir;
      varying vec3 vNrm;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float vnoise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      void main() {
        // Geometry convention: apex at y = 0, base at y = -1.
        float along = clamp(-vLocal.y, 0.0, 1.0);

        // Square-on to the eye = looking through more air.
        float facing = pow(abs(dot(normalize(vNrm), normalize(vViewDir))), 1.5);
        // Bright at the lens, gone by the end of the throw.
        float depth = pow(1.0 - along, 2.1) * smoothstep(0.0, 0.1, along);
        float dust = 0.7 + 0.55 * vnoise(vLocal * 6.0 + vec3(0.0, uTime * 0.4, uTime * 0.25));

        float a = facing * depth * dust * uIntensity * uFade;
        if (a <= 0.0015) discard;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
}

/**
 * Nested additive cones forming one light shaft.
 * Returns a Group with `setFade()` / `setTime()` helpers.
 *
 * @param {object} opts
 * @param {number} opts.length  throw distance in metres
 * @param {number} opts.angle   half-angle of the cone in radians
 */
export function makeBeamCone({
  length = 12,
  angle = 0.36,
  color = 0xffeccd,
  intensity = 0.5,
  layers = 3,
} = {}) {
  const group = new Group();
  const mats = [];
  for (let i = 0; i < layers; i++) {
    const k = i / Math.max(1, layers - 1); // 0 = widest, 1 = tightest core
    const radius = Math.tan(angle) * length * lerpNum(1, 0.3, k);
    // A pinched apex avoids a hard point singularity at the lens.
    const geo = new CylinderGeometry(radius * 0.05, radius, 1, 20, 1, true);
    geo.translate(0, -0.5, 0);
    const mat = makeVolumetricMaterial({
      color,
      intensity: intensity * lerpNum(0.55, 1.6, k),
    });
    const mesh = new Mesh(geo, mat);
    mesh.scale.set(1, length, 1);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6 + i;
    group.add(mesh);
    mats.push(mat);
  }
  group.userData.materials = mats;
  group.setFade = (v) => {
    for (const m of mats) m.uniforms.uFade.value = v;
  };
  group.setTime = (t) => {
    for (const m of mats) m.uniforms.uTime.value = t;
  };
  return group;
}

const lerpNum = (a, b, t) => a + (b - a) * t;

/** Floating dust motes that catch the flashlight. */
export function makeDustMaterial(tex) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: tex },
      uSize: { value: 26 },
      uOpacity: { value: 0.5 },
      uCam: { value: null },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uSize;
      varying float vFade;
      void main() {
        vec3 p = position;
        // Lazy convection drift.
        p.x += sin(uTime * 0.21 + aSeed * 6.2831) * 0.5;
        p.y += sin(uTime * 0.15 + aSeed * 12.9) * 0.35;
        p.z += cos(uTime * 0.19 + aSeed * 9.7) * 0.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vFade = smoothstep(0.4, 2.0, d) * (1.0 - smoothstep(6.0, 13.0, d));
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize / max(0.6, d);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying float vFade;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        float a = t.a * vFade * uOpacity;
        if (a <= 0.002) discard;
        gl_FragColor = vec4(t.rgb * a, a);
      }
    `,
  });
}
