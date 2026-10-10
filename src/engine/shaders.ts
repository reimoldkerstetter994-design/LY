/**
 * GLSL sources. Particle shaders conserve flux: a particle's on-screen footprint is clamped to a
 * pixel range and its alpha is reduced when it becomes sub-pixel, so a cloud of particles keeps
 * a constant surface brightness as it recedes (like a real galaxy).
 */

export const POINTS_VERT = /* glsl */ `
attribute vec3 color;
attribute float size;
uniform float uScale;
uniform float uSizeMul;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uOpacity;
uniform float uFadeNear;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(-mv.z, 1e-12);
  float px = size * uSizeMul * uScale / dist;
  float alpha = 1.0;
  if (px < uMinPx) { alpha = (px * px) / (uMinPx * uMinPx); px = uMinPx; }
  if (px > uMaxPx) { alpha *= (uMaxPx * uMaxPx) / (px * px) * 0.6 + 0.4 * uMaxPx / px; px = uMaxPx; }
  // particles very close to the camera fade out instead of blowing up
  alpha *= smoothstep(0.0, uFadeNear, dist);
  gl_PointSize = px;
  gl_Position = projectionMatrix * mv;
  vColor = color;
  vAlpha = alpha * uOpacity;
}
`;

export const POINTS_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.2) - 0.04;
  gl_FragColor = vec4(vColor, max(a, 0.0) * vAlpha);
}
`;

/** Dust: darkens what is behind it (custom blending: dst * (1 - a)). */
export const DUST_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c) * 4.0;
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 2.5) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;

/** Stars rendered by apparent magnitude computed from distance (layer unit: light-years). */
export const STARS_VERT = /* glsl */ `
attribute vec3 color;
attribute float absMag;
uniform float uOpacity;
uniform float uMagLimit;
uniform float uPxScale;
uniform float uBoost;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dLy = max(length(mv.xyz), 1e-6);
  // m = M + 5 log10(d / 10 pc); 10 pc = 32.6156 ly
  float m = absMag + 5.0 * log(dLy / 32.6156) / log(10.0) - uBoost;
  // Brightness is referenced to the naked-eye limit; uMagLimit only decides which faint stars show.
  float flux = pow(10.0, -0.4 * (m - 6.5));
  float px = clamp(1.5 + 1.9 * pow(flux, 0.25), 1.5, 15.0) * uPxScale;
  float alpha = clamp(0.18 + 0.82 * pow(flux, 0.5), 0.0, 1.0) * smoothstep(uMagLimit + 1.2, uMagLimit - 0.8, m);
  gl_PointSize = px;
  gl_Position = projectionMatrix * mv;
  vColor = color;
  vAlpha = alpha * uOpacity;
}
`;

export const STARS_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float core = exp(-r * r * 18.0);
  float halo = exp(-r * 4.5) * 0.35;
  float a = (core + halo) * vAlpha;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.6), a);
}
`;

const NOISE = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
                 mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                 mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) { v += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v;
}
`;

export const PLANET_VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vLocal = normalize(position);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const PLANET_FRAG = /* glsl */ `
uniform int uKind;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uBands;
uniform float uSeed;
uniform float uTime;
uniform float uSpot;
uniform vec3 uSunPos;
uniform float uOpacity;
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vPosW;
${NOISE}
void main() {
  vec3 p = vLocal;
  vec3 s = p + vec3(uSeed * 1.37, uSeed * 2.11, uSeed * 0.73);
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(uSunPos - vPosW);
  vec3 V = normalize(cameraPosition - vPosW);
  float ndl = dot(N, L);
  vec3 col;
  float emissive = 0.0;
  if (uKind == 0) {
    float g = fbm(p * 18.0 + vec3(uTime * 0.02));
    float g2 = fbm(p * 60.0 - vec3(uTime * 0.05));
    float mu = clamp(dot(N, V), 0.0, 1.0);
    float limb = 0.35 + 0.65 * pow(mu, 0.55);
    col = mix(uC1, uC0, g * 0.8 + g2 * 0.4) * limb * 2.6;
    col = mix(uC2 * 1.4, col, smoothstep(0.0, 0.25, mu));
    emissive = 1.0;
  } else if (uKind == 1) {
    float h = fbm(s * 3.0);
    float d = fbm(s * 11.0);
    col = mix(uC1, uC0, smoothstep(0.25, 0.65, h));
    col = mix(col, uC2, smoothstep(0.55, 0.85, d) * 0.6);
    float crater = smoothstep(0.62, 0.7, vnoise(s * 26.0)) * 0.25;
    col *= 1.0 - crater;
    col = mix(col, vec3(0.95), smoothstep(0.88, 0.95, abs(p.y)) * step(0.5, uSpot));
  } else if (uKind == 2) {
    float h = fbm(s * 2.4);
    float land = smoothstep(0.5, 0.53, h);
    vec3 ocean = mix(uC0 * 0.55, uC0, smoothstep(0.3, 0.5, h));
    float dry = smoothstep(0.45, 0.7, fbm(s * 5.0 + 4.0)) * (1.0 - smoothstep(0.55, 0.8, abs(p.y)));
    vec3 ground = mix(uC1, uC2, dry);
    col = mix(ocean, ground, land);
    col = mix(col, vec3(0.94, 0.97, 1.0), smoothstep(0.82, 0.9, abs(p.y) + (h - 0.5) * 0.3));
    float cl = smoothstep(0.5, 0.75, fbm(s * 4.0 + vec3(uTime * 0.01, 0.0, uTime * 0.006)));
    col = mix(col, vec3(1.0), cl * 0.85);
    float night = smoothstep(0.05, -0.15, ndl);
    // Cities cluster in populated regions (large-scale mask) and appear as sparse specks.
    float populated = smoothstep(0.52, 0.62, fbm(s * 5.0 + 11.0));
    float specks = smoothstep(0.82, 0.92, vnoise(s * 160.0)) + 0.35 * smoothstep(0.7, 0.9, vnoise(s * 45.0));
    float lights = land * populated * (1.0 - cl) * specks * (1.0 - smoothstep(0.55, 0.75, abs(p.y)));
    emissive = lights * night * 0.35;
  } else if (uKind == 3 || uKind == 4) {
    float turb = fbm(s * vec3(3.0, 14.0, 3.0)) - 0.5;
    float b = sin((p.y + turb * (uKind == 3 ? 0.08 : 0.03)) * uBands * 3.14159);
    float b2 = sin(p.y * uBands * 7.3 + turb * 4.0);
    col = mix(uC0, uC1, smoothstep(-0.6, 0.6, b) * (uKind == 3 ? 0.9 : 0.35));
    col = mix(col, uC2, smoothstep(0.6, 1.0, b2) * 0.35);
    if (uSpot > 0.5) {
      float lat = asin(clamp(p.y, -1.0, 1.0));
      float lon = atan(p.z, p.x);
      float spotLat = uKind == 3 ? -0.39 : -0.35;
      vec2 dd = vec2((lon - 1.2) * 0.55, (lat - spotLat) * 1.6);
      float spot = smoothstep(0.12, 0.05, length(dd));
      col = mix(col, uKind == 3 ? vec3(0.72, 0.33, 0.2) : vec3(0.08, 0.1, 0.35), spot * 0.85);
    }
  } else {
    float sw = fbm(s * vec3(2.0, 6.0, 2.0) + vec3(uTime * 0.004));
    col = mix(uC1, uC0, smoothstep(0.3, 0.7, sw));
    col = mix(col, uC2, smoothstep(0.65, 0.9, fbm(s * 9.0)) * 0.4);
  }
  if (uKind == 0) {
    gl_FragColor = vec4(col, uOpacity);
    return;
  }
  float wrap = (uKind == 3 || uKind == 4 || uKind == 5) ? 0.12 : 0.04;
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 lit = col * (diff * 0.95 + 0.012) + vec3(1.0, 0.8, 0.45) * emissive;
  if (uKind == 2) {
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 60.0) * (1.0 - smoothstep(0.5, 0.53, fbm(s * 2.4))) * diff;
    lit += vec3(0.6, 0.7, 0.8) * spec * 0.5;
  }
  gl_FragColor = vec4(lit, uOpacity);
}
`;

export const ATMO_VERT = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSunPos;
uniform float uStrength;
uniform float uOpacity;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uSunPos - vPosW);
  float rim = pow(1.0 - abs(dot(N, V)), 3.0);
  float day = clamp(dot(N, L) * 0.7 + 0.45, 0.0, 1.0);
  float a = rim * day * uStrength * uOpacity;
  gl_FragColor = vec4(uColor * 1.4, a);
}
`;

export const RING_VERT = /* glsl */ `
varying float vR;
varying vec3 vPosW;
void main() {
  vR = length(position.xy);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSunPos;
uniform vec3 uPlanetPos;
uniform float uPlanetRadius;
uniform float uOpacity;
varying float vR;
varying vec3 vPosW;
float h(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  float r = vR;
  // radii in planet radii (Saturn): C ring 1.24–1.53, B 1.53–2.03, Cassini 2.03–2.10, A 2.10–2.35
  float dens = 0.0;
  dens += smoothstep(1.24, 1.26, r) * (1.0 - smoothstep(1.52, 1.53, r)) * 0.28;
  dens += smoothstep(1.53, 1.56, r) * (1.0 - smoothstep(2.0, 2.03, r)) * 0.95;
  dens += smoothstep(2.09, 2.11, r) * (1.0 - smoothstep(2.33, 2.35, r)) * 0.7;
  dens *= 1.0 - smoothstep(2.21, 2.215, r) * (1.0 - smoothstep(2.222, 2.227, r)) * 0.8;
  float fine = 0.75 + 0.25 * h(floor(r * 420.0));
  dens *= fine;
  // planet shadow
  vec3 toSun = normalize(uSunPos - vPosW);
  vec3 rel = vPosW - uPlanetPos;
  float t = dot(rel, toSun);
  float dPerp = length(rel - toSun * t);
  float shadow = (t < 0.0 && dPerp < uPlanetRadius) ? 0.15 : 1.0;
  vec3 col = uColor * (0.55 + 0.45 * fine) * shadow;
  gl_FragColor = vec4(col, dens * uOpacity);
}
`;

export const GLOW_VERT = /* glsl */ `
uniform float uPx;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uScale;
uniform float uWorldSize;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = uWorldSize * uScale / max(-mv.z, 1e-12);
  gl_PointSize = clamp(max(px, uPx), uMinPx, uMaxPx);
  gl_Position = projectionMatrix * mv;
}
`;

export const GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a = pow(1.0 - r, 2.2) * 0.9 + exp(-r * r * 40.0);
  gl_FragColor = vec4(uColor, a * uOpacity);
}
`;

export const CMB_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const CMB_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uInside;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vec3 col = texture2D(uMap, vUv).rgb;
  vec3 V = normalize(cameraPosition - vPosW);
  float rim = pow(1.0 - abs(dot(normalize(vNormalW), V)), 2.0);
  vec3 c = col * mix(0.7, 0.85, uInside) + vec3(1.0, 0.6, 0.3) * rim * 0.12 * (1.0 - uInside);
  gl_FragColor = vec4(c, uOpacity);
}
`;
