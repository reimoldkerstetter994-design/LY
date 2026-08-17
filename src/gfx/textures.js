/**
 * Procedural PBR texture bakery.
 *
 * Every surface in the game gets albedo + normal + roughness maps that are
 * generated pixel-by-pixel at load time from value/worley noise. No image
 * files, no downloads — and because it's seeded, a given build always looks
 * the same.
 */

import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  NoColorSpace,
  LinearFilter,
  LinearMipmapLinearFilter,
} from 'three';
import { clamp01, lerp, makeNoise2D, smoothstep } from '../core/utils.js';

const noise = makeNoise2D(90210);

function canvasOf(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function toTexture(canvas, { srgb = false, aniso = 4, repeat = 1 } = {}) {
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = aniso;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.repeat.set(repeat, repeat);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Bake a material from a per-pixel shader-like callback.
 * @param {number} size texture resolution
 * @param {(u:number,v:number,o:{r:number,g:number,b:number,h:number,rough:number,metal:number})=>void} fn
 * @param {{normalStrength?:number, aniso?:number}} opts
 */
function bake(size, fn, opts = {}) {
  const { normalStrength = 2.2, aniso = 4 } = opts;
  const albedo = canvasOf(size);
  const rough = canvasOf(size);
  const normal = canvasOf(size);

  const aCtx = albedo.getContext('2d', { willReadFrequently: true });
  const rCtx = rough.getContext('2d', { willReadFrequently: true });
  const nCtx = normal.getContext('2d', { willReadFrequently: true });

  const aImg = aCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  const o = { r: 0.5, g: 0.5, b: 0.5, h: 0.5, rough: 0.6, metal: 0 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      o.r = o.g = o.b = 0.5;
      o.h = 0.5;
      o.rough = 0.6;
      o.metal = 0;
      fn(x / size, y / size, o);
      const p = i * 4;
      aImg.data[p] = clamp01(o.r) * 255;
      aImg.data[p + 1] = clamp01(o.g) * 255;
      aImg.data[p + 2] = clamp01(o.b) * 255;
      aImg.data[p + 3] = 255;
      const rr = clamp01(o.rough) * 255;
      rImg.data[p] = rr;
      rImg.data[p + 1] = rr;
      rImg.data[p + 2] = rr;
      rImg.data[p + 3] = 255;
      height[i] = o.h;
    }
  }

  // Sobel → tangent-space normal map (wraps at the edges so tiling is seamless).
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * normalStrength;
      let ny = -dy * normalStrength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const p = (y * size + x) * 4;
      nImg.data[p] = (nx * 0.5 + 0.5) * 255;
      nImg.data[p + 1] = (ny * 0.5 + 0.5) * 255;
      nImg.data[p + 2] = (nz / len) * 0.5 * 255 + 127.5;
      nImg.data[p + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);

  return {
    map: toTexture(albedo, { srgb: true, aniso }),
    roughnessMap: toTexture(rough, { aniso }),
    normalMap: toTexture(normal, { aniso }),
  };
}

/* ------------------------------------------------------------- ingredients */

const fbm = (x, y, oct = 5) => noise.fbm(x, y, oct) * 0.5 + 0.5;

/** Grime / water staining used on nearly every surface. */
function grime(u, v, scale = 4, strength = 1) {
  const s = fbm(u * scale, v * scale, 5);
  const streak = fbm(u * scale * 0.4, v * scale * 3.5, 4);
  return clamp01((s * 0.6 + streak * 0.55) * strength);
}

function cracks(u, v, freq = 7, sharp = 26) {
  const { f1, f2 } = noise.worley(u, v, freq);
  const edge = clamp01((f2 - f1) * sharp);
  return 1 - edge; // 1 on the crack line
}

/**
 * Cracks confined to blotches. A uniform worley network reads as crazy paving
 * rather than damage, so the pattern is masked by a low-frequency fBm.
 */
function patchyCracks(u, v, freq, sharp, seed = 0) {
  const mask = smoothstep((fbm(u * 2.4 + seed, v * 2.4 - seed, 3) - 0.54) * 5.5);
  return cracks(u, v, freq, sharp) * mask;
}

/* ----------------------------------------------------------------- recipes */

function recipeConcreteFloor(u, v, o) {
  const base = fbm(u * 6, v * 6, 6);
  const fine = fbm(u * 42, v * 42, 3);
  const pits = clamp01(1 - noise.worley(u, v, 30).f1 * 2.2);
  const crack = patchyCracks(u, v, 18, 48, 7) * 0.9;
  const wet = grime(u, v, 3.2, 1.1);
  const stain = smoothstep((wet - 0.42) * 3);

  // Albedo is authored at realistic reflectance — the darkness in this game
  // comes from the absence of light, never from black textures.
  let g = 0.44 + base * 0.15 + fine * 0.06;
  g -= pits * 0.13;
  g -= crack * 0.2;
  g = lerp(g, g * 0.5, stain * 0.8);

  // Faint rust-coloured seepage.
  const rust = clamp01(fbm(u * 5 + 11, v * 5 - 4, 4) * 1.4 - 0.72);
  o.r = g + rust * 0.2;
  o.g = g * 0.96 + rust * 0.07;
  o.b = g * 0.9 + rust * 0.01;

  o.h = 0.5 + base * 0.14 - crack * 0.34 - pits * 0.12 + fine * 0.05;
  o.rough = clamp01(0.94 - stain * 0.62 - pits * 0.1);
}

function recipeWallTile(u, v, o) {
  // Small institutional wall tiles: 12 per texture repeat, which at the
  // wall's texture scale works out to roughly 15 cm squares.
  const N = 12;
  const tx = u * N;
  const ty = v * N;
  const ix = Math.floor(tx);
  const iy = Math.floor(ty);
  const fx = tx - ix;
  const fy = ty - iy;

  // Distance to the nearest grout line, in tile units.
  const dEdge = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
  const groutW = 0.042;
  // Both masks are smooth. A hard inside/outside test aliases into a
  // shimmering checkerboard the moment the wall is more than a few metres off,
  // which is what made these read as bathroom-set glass blocks.
  const grout = 1 - smoothstep((dEdge - groutW) * 30);
  const bevel = smoothstep((dEdge - groutW) * 7);

  // Per-tile tone. Institutional tiling is never one flat colour — kiln
  // variation plus decades of nicotine leave every tile slightly its own.
  const jitter = fbm(ix * 3.1 + 0.5, iy * 2.7 + 0.5, 2);
  const warm = fbm(ix * 1.27 + 9.5, iy * 1.73 - 4.5, 2);
  // Each tile also sits very slightly proud or sunk and off-square, so the
  // flashlight's highlight breaks up across the wall instead of sliding over
  // it like one sheet of plastic.
  const lean = (fx - 0.5) * (jitter - 0.5) * 0.1 + (fy - 0.5) * (warm - 0.5) * 0.1;
  const set = (jitter - 0.5) * 0.05;

  const dirt = grime(u, v, 5, 1.15);
  const dripping = clamp01(fbm(u * 9, v * 1.6, 4) * 1.5 - 0.62);
  const crack = patchyCracks(u, v, 22, 52, 19);
  // A handful of tiles have popped off entirely, exposing dark adhesive.
  const missing = smoothstep((jitter - 0.88) * 40);
  // ...and a few more have lost a corner.
  const chip =
    smoothstep((jitter - 0.7) * 24) *
    smoothstep((0.34 - Math.hypot(fx - (warm > 0.5 ? 1 : 0), fy - 0.5 - set)) * 12);

  // Glazed off-white ceramic sits around 0.7 reflectance, not 0.9.
  let base = 0.68 + jitter * 0.1 - warm * 0.05;
  base = lerp(base, 0.4, clamp01(dirt * 0.8));
  base = lerp(base, 0.24, dripping * 0.82);
  base = lerp(base, 0.3, grout * 0.55);
  base = lerp(base, 0.11, missing);
  base = lerp(base, 0.34, chip * 0.8);

  // Grout is a dirty warm grey; the glaze itself is faintly green-cream.
  const cream = 1 - grout * 0.45;
  o.r = base * (1.02 - dripping * 0.08);
  o.g = base * (0.995 - dirt * 0.05) * (1 + (1 - grout) * 0.008);
  o.b = base * (0.93 - dirt * 0.12) * cream + 0.01;

  o.h =
    0.5 +
    bevel * 0.055 -
    grout * 0.075 -
    crack * 0.1 -
    missing * 0.22 -
    chip * 0.14 +
    lean;
  // The glaze is the only genuinely shiny thing down here, and it only stays
  // shiny where nothing has run down it.
  o.rough = clamp01(
    lerp(0.22, 0.8, clamp01(dirt * 1.1)) +
      grout * 0.62 +
      dripping * 0.16 +
      missing * 0.5 +
      chip * 0.4,
  );
}

function recipePaintedWall(u, v, o) {
  const base = fbm(u * 5, v * 5, 5);
  // Mid-frequency roller texture. Without it the paint covers whole metres in
  // one smooth gradient and the wall looks like untextured geometry.
  const roller = fbm(u * 11, v * 13, 4);
  const stipple = fbm(u * 58, v * 61, 2);
  const peelMask = fbm(u * 3.2 + 3, v * 3.2 - 7, 4);
  const peel = smoothstep((peelMask - 0.52) * 6);
  // Where paint has lifted, it lifts in flakes with hard edges, not a fade.
  const flake = smoothstep((fbm(u * 16 + 5, v * 16 + 2, 3) - 0.5) * 9) * peel;
  const plaster = fbm(u * 24, v * 24, 3);
  const dirt = grime(u, v, 4.5, 1.2);
  const mould = clamp01(fbm(u * 7 - 2, v * 7 + 5, 5) * 1.7 - 0.9);
  const crack = patchyCracks(u, v, 24, 54, 31);

  // Institutional green paint over grey plaster.
  const tone = base * 0.1 + roller * 0.05 + stipple * 0.025;
  const paintR = 0.56 + tone;
  const paintG = 0.61 + tone * 1.08;
  const paintB = 0.5 + tone * 0.82;
  const plasterC = 0.5 + plaster * 0.18;

  const bare = clamp01(peel * 0.55 + flake * 0.6);
  let r = lerp(paintR, plasterC, bare);
  let g = lerp(paintG, plasterC * 0.98, bare);
  let b = lerp(paintB, plasterC * 0.9, bare);

  const d = clamp01(dirt * 0.7);
  r = lerp(r, 0.24, d * 0.62);
  g = lerp(g, 0.22, d * 0.62);
  b = lerp(b, 0.18, d * 0.62);
  r = lerp(r, 0.18, mould * 0.7);
  g = lerp(g, 0.22, mould * 0.7);
  b = lerp(b, 0.15, mould * 0.7);

  o.r = r * (1 - crack * 0.2);
  o.g = g * (1 - crack * 0.2);
  o.b = b * (1 - crack * 0.2);
  o.h =
    0.5 + base * 0.08 + roller * 0.05 + stipple * 0.035 - flake * 0.14 - crack * 0.22 + plaster * 0.05;
  o.rough = clamp01(lerp(0.62, 0.95, bare) + d * 0.1 + stipple * 0.05);
}

function recipeCeiling(u, v, o) {
  const N = 3;
  const tx = u * N;
  const ty = v * N;
  const fx = tx - Math.floor(tx);
  const fy = ty - Math.floor(ty);
  const seam = Math.min(fx, 1 - fx) < 0.03 || Math.min(fy, 1 - fy) < 0.03 ? 1 : 0;
  const speckle = fbm(u * 90, v * 90, 2);
  const water = clamp01(fbm(u * 4 + 8, v * 4 + 2, 5) * 1.8 - 0.78);
  const sag = fbm(u * 2.4, v * 2.4, 3);

  let base = 0.72 + speckle * 0.17 - sag * 0.09;
  base = lerp(base, 0.34, water * 0.9);
  if (seam) base *= 0.66;

  o.r = base + water * 0.09;
  o.g = base * 0.98 + water * 0.03;
  o.b = base * 0.9;
  o.h = 0.5 + speckle * 0.35 - (seam ? 0.5 : 0) - water * 0.2;
  o.rough = clamp01(0.9 - water * 0.35);
}

function recipeRustMetal(u, v, o) {
  const panel = fbm(u * 3, v * 3, 4);
  const rust = clamp01(fbm(u * 6.5, v * 6.5, 6) * 1.5 - 0.42);
  const heavy = clamp01(fbm(u * 2.5 + 5, v * 2.5 + 9, 4) * 1.7 - 0.75);
  const scratch = clamp01(fbm(u * 60, v * 4, 3) * 1.6 - 0.6);
  const pits = clamp01(1 - noise.worley(u, v, 26).f1 * 2.6) * rust;

  const steel = 0.52 + panel * 0.12 + scratch * 0.14;
  const rustR = 0.44 + heavy * 0.18;
  const rustG = 0.2 + heavy * 0.09;
  const rustB = 0.1 + heavy * 0.04;

  const m = clamp01(rust * 0.85 + heavy * 0.55);
  o.r = lerp(steel, rustR, m);
  o.g = lerp(steel * 0.99, rustG, m);
  o.b = lerp(steel * 1.02, rustB, m);
  o.h = 0.5 + panel * 0.12 - pits * 0.7 + scratch * 0.08;
  o.rough = clamp01(lerp(0.28, 0.94, m) + pits * 0.2);
  o.metal = 1 - m * 0.7;
}

function recipeWood(u, v, o) {
  // Ring-based grain along v.
  const warp = fbm(u * 3, v * 1.2, 4) * 0.35;
  const rings = Math.sin((v * 26 + warp * 9) * Math.PI) * 0.5 + 0.5;
  const grain = fbm(u * 8, v * 90, 3);
  const rot = clamp01(fbm(u * 4 + 21, v * 4 - 3, 5) * 1.6 - 0.72);
  const splint = clamp01(fbm(u * 40, v * 6, 2) * 1.4 - 0.55);

  const base = 0.36 + rings * 0.11 + grain * 0.06;
  o.r = lerp(base * 1.25, 0.16, rot * 0.8);
  o.g = lerp(base * 0.86, 0.13, rot * 0.8);
  o.b = lerp(base * 0.58, 0.1, rot * 0.8);
  o.h = 0.5 + rings * 0.2 + grain * 0.14 - splint * 0.3 - rot * 0.2;
  o.rough = clamp01(0.72 + rot * 0.2 + splint * 0.1);
}

function recipeFabric(u, v, o) {
  const weaveU = Math.sin(u * 300 * Math.PI) * 0.5 + 0.5;
  const weaveV = Math.sin(v * 300 * Math.PI) * 0.5 + 0.5;
  const weave = (weaveU + weaveV) * 0.5;
  const stain = clamp01(fbm(u * 4, v * 4, 5) * 1.6 - 0.55);
  const blood = clamp01(fbm(u * 3 + 40, v * 3 + 17, 4) * 1.9 - 1.05);
  const base = 0.68 + weave * 0.09 - stain * 0.3;
  o.r = lerp(base, 0.28, blood);
  o.g = lerp(base * 0.96, 0.035, blood);
  o.b = lerp(base * 0.88, 0.035, blood);
  o.h = 0.5 + weave * 0.3 - stain * 0.1;
  o.rough = clamp01(0.93 - blood * 0.35);
}

/**
 * Skin for the thing in the dark.
 *
 * This used to borrow the upholstery texture, which is why the creature read as
 * a cloth doll: a 300-cycle weave at normal strength 2.4 is unmistakably fabric
 * no matter what colour you tint it. Real-looking skin needs three scales at
 * once — pores, blotchy discolouration, and a few large wet patches — plus
 * roughness that varies, because uniformly glossy skin looks like vinyl.
 */
function recipeSkin(u, v, o) {
  /* Every scale here does a different job, and the reason there are so many is
   * that a single band of noise is exactly what reads as moulded plaster: the
   * eye needs coarse tonal patches to break the silhouette up, mid-scale
   * mottling inside those, and micro-relief for the torch to skim across. */
  const pores = clamp01(1 - noise.worley(u, v, 96).f1 * 2.6);
  const grain = fbm(u * 150, v * 150, 2);
  // Creases: skin dragged over bone, pulled into long slack folds.
  const cw = noise.worley(u * 1.2 + 61, v * 3.1 + 5, 22);
  const crease = clamp01(1 - (cw.f2 - cw.f1) * 9) ** 1.6;
  // Coarse patches — the load-bearing variation. Dark necrotic areas and
  // stretched pale ones, at a scale big enough to see across a corridor.
  const patch = fbm(u * 2.3 + 41, v * 2.3 - 17, 4);
  const mottle = fbm(u * 8.5, v * 8.5, 4);
  const necrosis = smoothstep((patch - 0.56) * 3.6);
  const bleached = smoothstep((0.42 - patch) * 4.2);
  const bruise = smoothstep((fbm(u * 4 + 17, v * 4 - 9, 4) - 0.57) * 4.2);
  // Veins pulled tight under skin that has too little fat behind it.
  const w = noise.worley(u * 1.4 + 3, v * 1.4 + 8, 11);
  const vein = clamp01(1 - (w.f2 - w.f1) * 15) * smoothstep((mottle - 0.42) * 6);
  // Long healed splits.
  const scar = clamp01(1 - Math.abs(fbm(u * 3.4 - 22, v * 9 + 5, 3) - 0.5) * 26);
  // Dry skin lifting at the edges of the necrotic patches.
  const flake = clamp01(1 - noise.worley(u * 1.1 + 88, v * 1.1 + 3, 34).f1 * 3) * necrosis;
  // Where it is wet, and it is mostly wet.
  const wet = smoothstep((fbm(u * 3.1 - 6, v * 3.1 + 14, 4) - 0.43) * 4);

  // Bloodless grey with a jaundiced cast — not pink, and never red overall.
  // Kept dark: lit by a torch at two metres, anything brighter clips to a white
  // silhouette and the creature looks like polished marble.
  let r = 0.235 + mottle * 0.1 + grain * 0.028;
  let g = 0.219 + mottle * 0.093 + grain * 0.028;
  let b = 0.198 + mottle * 0.07 + grain * 0.023;

  // Necrotic patches go very dark and slightly green; bleached ones go pale and
  // waxy. Between them the body stops being one flat tone.
  r = lerp(r, 0.088, necrosis * 0.85);
  g = lerp(g, 0.094, necrosis * 0.85);
  b = lerp(b, 0.076, necrosis * 0.85);
  r = lerp(r, 0.46, bleached * 0.75);
  g = lerp(g, 0.435, bleached * 0.75);
  b = lerp(b, 0.395, bleached * 0.75);
  // Bruising drags it toward a dead violet.
  r = lerp(r, 0.2, bruise * 0.7);
  g = lerp(g, 0.152, bruise * 0.7);
  b = lerp(b, 0.205, bruise * 0.7);
  // Veins are darker and colder, never blue-bright.
  r = lerp(r, 0.14, vein * 0.6);
  g = lerp(g, 0.133, vein * 0.6);
  b = lerp(b, 0.155, vein * 0.6);
  // Scars are pale and shiny.
  r = lerp(r, 0.44, scar * 0.6);
  g = lerp(g, 0.4, scar * 0.6);
  b = lerp(b, 0.365, scar * 0.6);
  // Creases hold dirt.
  const dirt = crease * 0.55;
  r = lerp(r, 0.062, dirt);
  g = lerp(g, 0.058, dirt);
  b = lerp(b, 0.05, dirt);

  o.r = r * (1 - pores * 0.24);
  o.g = g * (1 - pores * 0.24);
  o.b = b * (1 - pores * 0.22);

  o.h =
    0.5 -
    pores * 0.4 -
    crease * 0.5 +
    mottle * 0.1 +
    grain * 0.08 -
    vein * 0.12 +
    scar * 0.15 +
    flake * 0.28;
  // Wide spread on purpose: a single roughness value over a whole body is a
  // uniform highlight, and a uniform highlight is what reads as polished stone.
  o.rough = clamp01(0.66 - wet * 0.46 - scar * 0.22 + pores * 0.12 + flake * 0.3 + necrosis * 0.2);
}

function recipeBloodStain(u, v, o) {
  // Used as an alpha-mapped decal; albedo is dark arterial red.
  const d = Math.hypot(u - 0.5, v - 0.5) * 2;
  const wobble = fbm(u * 4, v * 4, 4) * 0.7;
  const edge = clamp01(1 - (d + wobble - 0.45) * 3.2);
  const splat = clamp01(1 - noise.worley(u, v, 5).f1 * 3) * 0.6;
  const a = clamp01(edge + splat);
  const dark = fbm(u * 12, v * 12, 3);
  o.r = 0.19 + dark * 0.14;
  o.g = 0.017 + dark * 0.015;
  o.b = 0.015 + dark * 0.012;
  o.h = 0.5 + a * 0.1;
  o.rough = clamp01(0.9 - a * 0.62);
  o.alpha = a;
}

/** Blood decals need an alpha channel, so they get their own baker. */
function bakeDecal(size) {
  const albedo = canvasOf(size);
  const ctx = albedo.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const rough = canvasOf(size);
  const rctx = rough.getContext('2d', { willReadFrequently: true });
  const rimg = rctx.createImageData(size, size);
  const o = { r: 0, g: 0, b: 0, h: 0, rough: 0, metal: 0, alpha: 1 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      o.alpha = 1;
      recipeBloodStain(x / size, y / size, o);
      const p = (y * size + x) * 4;
      img.data[p] = clamp01(o.r) * 255;
      img.data[p + 1] = clamp01(o.g) * 255;
      img.data[p + 2] = clamp01(o.b) * 255;
      img.data[p + 3] = clamp01(o.alpha) * 255;
      const rr = clamp01(o.rough) * 255;
      rimg.data[p] = rr;
      rimg.data[p + 1] = rr;
      rimg.data[p + 2] = rr;
      rimg.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return {
    map: toTexture(albedo, { srgb: true }),
    roughnessMap: toTexture(rough),
  };
}

/** A soft radial falloff used for the flashlight cookie and light sprites. */
function bakeGlow(size = 128) {
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,250,235,0.55)');
  g.addColorStop(0.6, 'rgba(255,240,210,0.12)');
  g.addColorStop(1, 'rgba(255,235,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Grimy dust motes sprite. */
function bakeDust(size = 64) {
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(230,225,210,0.25)');
  g.addColorStop(1, 'rgba(200,195,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Hand-scrawled wall messages. Rendered as transparent decals so they can be
 * slapped onto the tiles wherever the generator feels like it.
 */
export function bakeGraffiti(text, { size = 512, color = '#7a0f12' } = {}) {
  const c = canvasOf(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((Math.random() - 0.5) * 0.12);
  const lines = String(text).split('\n');
  const fs = Math.floor((size * 0.72) / Math.max(2.1, lines.length * 1.25));
  ctx.font = `900 ${fs}px 'PingFang SC','Microsoft YaHei',sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  lines.forEach((line, i) => {
    const y = (i - (lines.length - 1) / 2) * fs * 1.16;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    ctx.fillText(line, (Math.random() - 0.5) * 10, y);
    // Smeared second pass for a wet, finger-painted edge.
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = fs * 0.06;
    ctx.strokeStyle = color;
    ctx.strokeText(line, (Math.random() - 0.5) * 14, y + 3);
  });
  ctx.restore();

  // Drips running down from the strokes.
  const img = ctx.getImageData(0, 0, size, size);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = color;
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(Math.random() * size);
    let y = -1;
    for (let sy = size - 2; sy >= 0; sy--) {
      if (img.data[(sy * size + x) * 4 + 3] > 60) {
        y = sy;
        break;
      }
    }
    if (y < 0) continue;
    const len = 8 + Math.random() * 70;
    const w = 1 + Math.random() * 2.5;
    ctx.fillRect(x, y, w, len);
    ctx.beginPath();
    ctx.arc(x + w / 2, y + len, w * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export const GRAFFITI_LINES = [
  '别回头',
  '它在\n墙里',
  '关灯\n关灯\n关灯',
  '第七间\n有人',
  '不要\n出声',
  '我数到三',
  '它长得\n像我',
  '出口是\n谎言',
];

const RECIPES = {
  floor: { fn: recipeConcreteFloor, normalStrength: 1.5 },
  tile: { fn: recipeWallTile, normalStrength: 1.6 },
  wall: { fn: recipePaintedWall, normalStrength: 1.4 },
  ceiling: { fn: recipeCeiling, normalStrength: 1.3 },
  metal: { fn: recipeRustMetal, normalStrength: 1.9 },
  wood: { fn: recipeWood, normalStrength: 2.2 },
  fabric: { fn: recipeFabric, normalStrength: 1.5 },
  skin: { fn: recipeSkin, normalStrength: 1.1 },
};

/**
 * Bake the whole texture library, yielding between maps so the loading bar
 * can actually animate.
 */
export async function bakeTextureLibrary({ size = 512, aniso = 4, onProgress } = {}) {
  const out = {};
  const names = Object.keys(RECIPES);
  const total = names.length + 3;
  let done = 0;
  const tick = async (label) => {
    done++;
    onProgress?.(done / total, label);
    await new Promise((r) => setTimeout(r, 0));
  };

  for (const name of names) {
    const { fn, normalStrength } = RECIPES[name];
    out[name] = bake(size, fn, { normalStrength, aniso });
    await tick(name);
  }

  out.blood = bakeDecal(Math.min(256, size));
  await tick('blood');
  out.glow = bakeGlow(128);
  await tick('glow');
  out.dust = bakeDust(64);
  await tick('dust');

  return out;
}
