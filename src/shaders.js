export const pointVertex = /* glsl */ `
uniform float uPixelRatio;
uniform float uScale;
attribute float aSize;
attribute vec3 aColor;
attribute float aHash;
varying vec3 vColor;
varying float vHash;
void main() {
  vColor = aColor;
  vHash = aHash;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float attenuation = 340.0 / max(12.0, -mv.z);
  gl_PointSize = clamp(aSize * uPixelRatio * uScale * attenuation, 1.2, 56.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const pointFragment = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying vec3 vColor;
varying float vHash;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.02, d);
  core *= core;
  float twinkle = 0.86 + 0.14 * sin(uTime * (0.45 + vHash) + vHash * 28.0);
  float alpha = core * uAlpha * twinkle;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

export const shellVertex = /* glsl */ `
varying vec3 vDir;
varying vec3 vNormalView;
varying vec3 vView;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalView = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const shellFragment = /* glsl */ `
uniform float uAniso;
uniform float uOpacity;
uniform vec3 uPlasma;
uniform vec3 uDipole;
varying vec3 vDir;
varying vec3 vNormalView;
varying vec3 vView;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                     mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                    mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  return n;
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.05 + vec3(1.7, 9.2, 2.4);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float field = fbm(dir * 3.4);
  float fine = fbm(dir * 8.0 + 4.0);
  float dipole = dot(dir, normalize(uDipole));
  float t = clamp(field * 0.72 + fine * 0.28 + dipole * 0.2, 0.0, 1.0);
  vec3 cold = vec3(0.16, 0.38, 0.95);
  vec3 hot = vec3(0.96, 0.28, 0.18);
  vec3 aniso = mix(cold, hot, t);
  vec3 color = mix(uPlasma, aniso, uAniso);
  float facing = abs(dot(normalize(vNormalView), normalize(vView)));
  float rim = pow(1.0 - facing, 1.35);
  float alpha = (0.16 + 0.5 * rim) * uOpacity;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;

export const galaxyVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const galaxyFragment = /* glsl */ `
uniform float uTime;
uniform float uArms;
uniform float uWind;
uniform float uBar;
uniform float uOpacity;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float theta = atan(p.y, p.x);
  float spiral = sin(uArms * (theta - log(r + 0.015) * uWind) + uTime * 0.04);
  float arm = smoothstep(-0.15, 0.9, spiral);
  float disk = exp(-pow(r * 1.28, 1.35));
  float bulge = exp(-pow(r * 4.4, 2.0));
  float bar = exp(-pow(p.x * (2.4 - uBar), 2.0) - pow(p.y * (7.0 - uBar * 2.0), 2.0));
  float dust = exp(-pow(p.y / 0.075, 2.0)) * smoothstep(0.08, 0.25, abs(p.x));
  float spark = step(0.86, hash(floor(p * 46.0))) * arm;
  float light = disk * (0.22 + 0.78 * arm) + bulge * 1.45 + bar * uBar * 0.85 + spark * 0.7;
  light *= 1.0 - dust * disk * 0.72;
  vec3 cool = vec3(0.55, 0.74, 1.0);
  vec3 warm = vec3(1.0, 0.84, 0.58);
  vec3 color = mix(cool, warm, clamp(bulge * 1.5 + bar * uBar, 0.0, 1.0));
  float alpha = clamp(light, 0.0, 1.0) * smoothstep(1.0, 0.72, r) * uOpacity;
  gl_FragColor = vec4(color * alpha, alpha);
}
`;
