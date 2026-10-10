import * as THREE from "three";
import { galaxyFragment, galaxyVertex, pointFragment, pointVertex } from "./shaders.js";
import { skyToXyz } from "./catalog.js";

export const DISPLAY_RADIUS = 42;
export const LOCAL_MPC = 1.15;
export const GALAXY_KPC = 25;
const DISK_EXAGGERATION = 3;

function spiralMaterial({ arms = 2, wind = 5.4, bar = 0.8, opacity = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uArms: { value: arms },
      uWind: { value: wind },
      uBar: { value: bar },
      uOpacity: { value: opacity },
    },
    vertexShader: galaxyVertex,
    fragmentShader: galaxyFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    premultipliedAlpha: true,
  });
}

function haloMesh(radius, color, opacity) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 28, 18),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  );
  mesh.userData.kind = "halo";
  return mesh;
}

export function createMilkyWay() {
  const group = new THREE.Group();
  group.name = "milky-way";
  const kpc = DISPLAY_RADIUS / GALAXY_KPC;

  const spin = new THREE.Group();
  spin.name = "spin";
  const disk = new THREE.Mesh(new THREE.CircleGeometry(16 * kpc, 128), spiralMaterial());
  disk.rotation.x = -Math.PI / 2;
  spin.add(disk);
  spin.add(buildStarfield(kpc));
  group.add(spin);

  const halo = haloMesh(18 * kpc, 0x9db7dc, 0.035);
  group.add(halo);

  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 128 }, (_, i) => {
        const t = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(t) * 8.2 * kpc, 0.02 * kpc, Math.sin(t) * 8.2 * kpc);
      }),
    ),
    new THREE.LineBasicMaterial({ color: 0xe0b56a, transparent: true, opacity: 0.45 }),
  );
  group.add(ring);

  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(0.28 * kpc, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
  );
  group.add(nucleus);

  return group;
}

function buildStarfield(kpc) {
  const count = 7000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed & 0x7fffffff) / 2147483647;
  };
  for (let i = 0; i < count; i += 1) {
    const bulge = rand() < 0.16;
    const radius = bulge ? Math.abs(gaussian(rand)) * 1.3 : 18 * (1 - rand() ** 0.35);
    const theta = rand() * Math.PI * 2;
    const arm = Math.sin(2 * (theta - Math.log(radius + 0.2) * 5)) > 0 || rand() > 0.35;
    const scatter = bulge ? 0 : arm ? 0.35 : 1.1;
    const r = Math.max(0.05, radius + gaussian(rand) * scatter);
    const y = gaussian(rand) * (bulge ? 0.7 : 0.28);
    const o = i * 3;
    positions[o] = Math.cos(theta) * r * kpc;
    positions[o + 1] = y * kpc;
    positions[o + 2] = Math.sin(theta) * r * kpc;
    const warm = bulge || rand() > 0.72;
    colors[o] = warm ? 1 : 0.62;
    colors[o + 1] = warm ? 0.84 : 0.78;
    colors[o + 2] = warm ? 0.58 : 1;
    sizes[i] = bulge ? 1.4 : 0.7 + rand();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aHash", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uScale: { value: 1.1 },
      uAlpha: { value: 0.85 },
    },
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    premultipliedAlpha: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function gaussian(rand) {
  const u = Math.max(rand(), 1e-6);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

export function createLocalGroup(catalog) {
  const group = new THREE.Group();
  group.name = "local-group";
  const toLocal = (mpc) => (mpc / LOCAL_MPC) * DISPLAY_RADIUS;

  const majors = catalog.filter((item) => item.group === "local" && item.distanceMpc > 0);
  const mwHalo = haloMesh(toLocal(0.2), 0xc9d7ee, 0.07);
  group.add(mwHalo);
  const mwDisk = new THREE.Mesh(
    new THREE.CircleGeometry(toLocal((15 / 1000) * DISK_EXAGGERATION), 64),
    spiralMaterial({ opacity: 0.95 }),
  );
  mwDisk.rotation.x = -Math.PI / 2;
  mwDisk.rotation.z = 0.4;
  group.add(mwDisk);

  for (const item of majors) {
    const [x, y, z] = skyToXyz(item.ra, item.dec, toLocal(item.distanceMpc));
    const anchor = new THREE.Group();
    anchor.position.set(x, y, z);
    anchor.userData.id = item.id;
    if (item.morph === "spiral") {
      const halo = haloMesh(toLocal((item.haloKpc ?? 160) / 1000), 0xd7c4a2, 0.055);
      anchor.add(halo);
      const disk = new THREE.Mesh(
        new THREE.CircleGeometry(toLocal(((item.diskKpc ?? 12) / 1000) * DISK_EXAGGERATION), 48),
        spiralMaterial({
          arms: item.id === "m33" ? 2 : 2,
          wind: item.id === "m33" ? 6.2 : 5,
          bar: item.id === "m31" ? 0.35 : 0.7,
        }),
      );
      disk.rotation.x = -Math.PI / 2 + ((item.inclination ?? 50) * Math.PI) / 180;
      disk.rotation.y = ((item.pa ?? 0) * Math.PI) / 180;
      anchor.add(disk);
    } else if (item.morph === "elliptical") {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(toLocal(0.004), 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xf0d7b0 }),
      );
      anchor.add(ball);
    } else {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(toLocal(((item.diskKpc ?? 1.2) / 1000) * 2), 0.22), 12, 10),
        new THREE.MeshBasicMaterial({
          color: item.morph === "dwarf" ? 0xb7c4d6 : 0x9ec0ff,
          transparent: true,
          opacity: 0.85,
        }),
      );
      anchor.add(puff);
    }
    group.add(anchor);
  }

  const m31 = majors.find((item) => item.id === "m31");
  if (m31) {
    const [x, y, z] = skyToXyz(m31.ra, m31.dec, toLocal(m31.distanceMpc));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(x, y, z),
      ]),
      new THREE.LineBasicMaterial({ color: 0xe0b56a, transparent: true, opacity: 0.35 }),
    );
    group.add(line);
  }
  return group;
}

export function galacticPosition(kpc) {
  const scale = DISPLAY_RADIUS / GALAXY_KPC;
  return [kpc[0] * scale, kpc[1] * scale, kpc[2] * scale];
}
