import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { CATALOG, findObject, objectDistanceMpc, skyToXyz } from "./catalog.js";
import { clusteringWeight, mixColor, plasmaFraction, smoothstep, thermalColor } from "./evolution.js";
import {
  DISPLAY_RADIUS,
  GALAXY_KPC,
  LOCAL_MPC,
  createLocalGroup,
  createMilkyWay,
  galacticPosition,
} from "./galaxy.js";
import { pointFragment, pointVertex, shellFragment, shellVertex } from "./shaders.js";
import { generateWeb } from "./web.js";

export const NEAR_MPC = 420;

const QUALITY = {
  low: { far: 8000, near: 4200, nodesFar: 72, nodesNear: 54 },
  mid: { far: 17000, near: 9000, nodesFar: 120, nodesNear: 84 },
  high: { far: 32000, near: 16000, nodesFar: 170, nodesNear: 110 },
};

const KIND_COLOR = {
  galaxy: 0xd5e4ff,
  cluster: 0xf0d0a0,
  supercluster: 0xe0b56a,
  wall: 0xb7c7de,
  quasar: 0xff7a45,
  void: 0x8ea0b8,
  group: 0xf2d7a2,
  blackhole: 0xffc27a,
  star: 0xffe7b8,
  cmb: 0xffd0c2,
};

export function createView(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x08090d, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "webgl";
  container.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = "labels";
  container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.02, 4000);
  camera.position.set(70, 34, 92);
  camera.position.setLength(DISPLAY_RADIUS * 2.65);
  camera.far = 5000;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.maxDistance = 900;
  controls.minDistance = 0.08;

  const stage = new THREE.Group();
  scene.add(stage);

  const farMaterial = pointMaterial(1.85);
  const nearMaterial = pointMaterial(2.05);
  const farPoints = new THREE.Points(new THREE.BufferGeometry(), farMaterial);
  const nearPoints = new THREE.Points(new THREE.BufferGeometry(), nearMaterial);
  farPoints.frustumCulled = false;
  nearPoints.frustumCulled = false;
  farPoints.renderOrder = 2;
  nearPoints.renderOrder = 3;
  stage.add(farPoints, nearPoints);

  const shellMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uAniso: { value: 1 },
      uOpacity: { value: 0.9 },
      uPlasma: { value: new THREE.Color(1, 0.4, 0.15) },
      uDipole: { value: new THREE.Vector3(...skyToXyz(167.9, -6.9, 1)) },
    },
    vertexShader: shellVertex,
    fragmentShader: shellFragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), shellMaterial);
  shell.renderOrder = 0;
  stage.add(shell);

  const horizonWire = new THREE.LineSegments(
    new THREE.WireframeGeometry(new THREE.SphereGeometry(DISPLAY_RADIUS, 18, 12)),
    new THREE.LineBasicMaterial({ color: 0xd7c4a2, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  stage.add(horizonWire);

  const cage = buildCage();
  stage.add(cage);

  const markerRoot = new THREE.Group();
  stage.add(markerRoot);
  const localGroup = createLocalGroup(CATALOG);
  const milkyWay = createMilkyWay();
  stage.add(localGroup, milkyWay);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xf6e2b8 }),
  );
  earth.name = "earth";
  stage.add(earth);

  const selection = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.86, 40),
    new THREE.MeshBasicMaterial({
      color: 0xe0b56a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  selection.visible = false;
  stage.add(selection);

  const backdrop = buildBackdrop();
  backdrop.renderOrder = -2;
  scene.add(backdrop);

  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let farBuffer = null;
  let nearBuffer = null;
  let webSignature = "";
  let layoutSignature = "";
  let lastA = -1;
  let animation = null;
  const markers = new Map();
  const hitMeshes = [];
  let reducedMotion = false;
  let currentScale = "universe";
  const labelVec = new THREE.Vector3();

  controls.addEventListener("start", () => {
    animation = null;
  });

  function resize() {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labels.setSize(width, height);
    const ratio = renderer.getPixelRatio();
    stage.traverse((obj) => {
      if (obj.material?.uniforms?.uPixelRatio) obj.material.uniforms.uPixelRatio.value = ratio;
    });
  }

  function ensureWeb(state) {
    const signature = `${state.quality}:${state.seed}`;
    if (signature === webSignature) return;
    webSignature = signature;
    layoutSignature = "";
    const preset = QUALITY[state.quality] ?? QUALITY.mid;
    farBuffer = generateWeb({
      seed: state.seed >>> 0,
      count: preset.far,
      nodes: preset.nodesFar,
      haloSigma: 0.018,
      filamentSigma: 0.0065,
    });
    nearBuffer = generateWeb({
      seed: (state.seed + 97) >>> 0,
      count: preset.near,
      nodes: preset.nodesNear,
      haloSigma: 0.05,
      filamentSigma: 0.02,
    });
    swapGeometry(farPoints, farBuffer);
    swapGeometry(nearPoints, nearBuffer);
  }

  function update(state, time) {
    reducedMotion = state.reducedMotion;
    currentScale = state.scale;
    ensureWeb(state);
    const subject = subjectMpc(state);
    const signature = `${state.scale}:${subject.toFixed(3)}:${state.showCage}:${state.showLabels}:${state.seed}:${state.quality}`;
    if (signature !== layoutSignature) {
      layoutSignature = signature;
      lastA = -1;
      rebuildMarkers(state, subject);
    }

    const properScale = state.proper ? Math.max(state.a, 1e-4) : 1;
    stage.scale.setScalar(state.scale === "galaxy" ? 1 : properScale);

    fadeAssemblies(localGroup, state.scale === "local" ? 1 : 0);
    fadeAssemblies(milkyWay, state.scale === "galaxy" ? 1 : 0);
    localGroup.visible = state.scale === "local";
    milkyWay.visible = state.scale === "galaxy";
    earth.visible = state.scale === "universe" || state.scale === "supercluster";
    horizonWire.visible = state.scale === "universe" && state.showShell;
    cage.visible = state.scale === "universe" && state.showCage;
    shell.visible = state.scale === "universe" && state.showShell;

    const plasma = plasmaFraction(state.a);
    const xi = clusteringWeight(state.a, state.cosmo) * (1 - plasma);
    const heat = thermalColor(state.cosmo.temperature(state.a));
    const aChanged = Math.abs(state.a - lastA) > 1e-6;
    if (aChanged) {
      lastA = state.a;
      if (state.scale === "universe" && state.showWeb) {
        paintWeb(farPoints, farBuffer, DISPLAY_RADIUS, xi, plasma, heat, state.a);
      }
      const nearRadius =
        state.scale === "universe"
          ? DISPLAY_RADIUS * (NEAR_MPC / state.cosmo.horizonMpc)
          : DISPLAY_RADIUS;
      if ((state.scale === "universe" || state.scale === "supercluster") && state.showWeb) {
        paintWeb(nearPoints, nearBuffer, nearRadius, xi, plasma, heat, state.a);
      }
    }
    farPoints.visible = state.scale === "universe" && state.showWeb;
    nearPoints.visible = (state.scale === "universe" || state.scale === "supercluster") && state.showWeb;

    const shellRadius =
      state.scale === "universe"
        ? (state.cosmo.chiOfZ(1089.9) / state.cosmo.horizonMpc) * DISPLAY_RADIUS
        : DISPLAY_RADIUS;
    shell.scale.setScalar(Math.max(shellRadius, 0.2));
    horizonWire.scale.setScalar(1);
    cage.scale.setScalar(shellRadius);

    const color = new THREE.Color(heat[0], heat[1], heat[2]);
    shellMaterial.uniforms.uPlasma.value.copy(color);
    shellMaterial.uniforms.uAniso.value = 1 - plasma;
    shellMaterial.uniforms.uOpacity.value = 0.82 + plasma * 0.18;
    const tint = 0.015 + plasma * 0.05;
    renderer.setClearColor(new THREE.Color(heat[0] * tint, heat[1] * tint, heat[2] * tint), 1);

    const dt = Math.min(0.05, clock.getDelta());
    const spin = milkyWay.getObjectByName("spin");
    if (spin && !reducedMotion && milkyWay.visible) spin.rotation.y += dt * 0.12;

    stage.traverse((obj) => {
      const uniforms = obj.material?.uniforms;
      if (!uniforms) return;
      if (uniforms.uTime) uniforms.uTime.value = time;
    });

    const selected = markers.get(state.selectedId);
    if (selected) {
      selection.visible = true;
      selection.position.copy(selected.position);
      selection.lookAt(camera.position);
      const pulse = 1 + Math.sin(time * 2.4) * 0.06;
      selection.scale.setScalar(pulse * (selected.userData.span ? 1.8 : 1));
    } else {
      selection.visible = false;
    }

    applyLabels(state);
    stepAnimation(dt);
    controls.update();
    backdrop.visible = state.scale !== "galaxy";
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    return hits[0]?.object.userData.item ?? null;
  }

  function frameSubject() {
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 1e-8) offset.set(0.62, 0.32, 0.84);
    const radius = DISPLAY_RADIUS * stage.scale.x;
    const factor = currentScale === "local" ? 1.55 : currentScale === "galaxy" ? 2.05 : currentScale === "supercluster" ? 2.15 : 2.55;
    offset.setLength(Math.max(radius * factor, 1.2));
    animateTo(new THREE.Vector3(), offset);
  }

  function focusSelected(state) {
    const item = findObject(state.selectedId);
    if (!item || item.id === "cmb" || item.id === "local-group" || item.id === "milky-way") {
      frameSubject();
      return;
    }
    const marker = markers.get(item.id);
    if (!marker) {
      frameSubject();
      return;
    }
    stage.updateMatrixWorld(true);
    const world = marker.getWorldPosition(new THREE.Vector3());
    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() < 1e-8) offset.set(0.4, 0.2, 1);
    const distance = (item.spanMpc || item.basin ? 26 : 18) * Math.max(stage.scale.x, 0.2);
    offset.setLength(Math.max(distance, 1.5));
    animateTo(world, world.clone().add(offset));
  }

  function hud(state) {
    const subject = subjectMpc(state);
    const mpcPerWorld = subject / DISPLAY_RADIUS;
    const distance = camera.position.distanceTo(controls.target);
    const fov = (camera.fov * Math.PI) / 180;
    const worldHeight = 2 * Math.tan(fov / 2) * distance;
    const worldPerPx = worldHeight / Math.max(renderer.domElement.clientHeight, 1);
    const shellRadius = shell.scale.x * stage.scale.x;
    return {
      mpcPerPx: (mpcPerWorld * worldPerPx) / stage.scale.x,
      fromOriginMpc: camera.position.length() * mpcPerWorld,
      inside: state.scale === "universe" && camera.position.length() < shellRadius,
      subjectMpc: subject,
    };
  }

  function animateTo(target, position) {
    animation = {
      fromT: controls.target.clone(),
      toT: target.clone(),
      fromP: camera.position.clone(),
      toP: position.clone(),
      elapsed: 0,
      duration: reducedMotion ? 0.01 : 0.75,
    };
  }

  function stepAnimation(dt) {
    if (!animation) return;
    animation.elapsed += dt;
    const t = Math.min(1, animation.elapsed / animation.duration);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    controls.target.lerpVectors(animation.fromT, animation.toT, e);
    camera.position.lerpVectors(animation.fromP, animation.toP, e);
    if (t >= 1) animation = null;
  }

  function rebuildMarkers(state, subject) {
    for (const child of [...markerRoot.children]) {
      markerRoot.remove(child);
      child.traverse((obj) => {
        if (obj.element) obj.element.remove();
        obj.geometry?.dispose?.();
      });
    }
    markers.clear();
    hitMeshes.length = 0;
    for (const item of CATALOG) {
      const local = markerLocal(item, state, subject);
      if (!local) continue;
      const group = new THREE.Group();
      group.position.set(local[0], local[1], local[2]);
      group.userData.formA = formationA(item);
      const visual = new THREE.Mesh(
        new THREE.SphereGeometry(item.kind === "void" ? 0.16 : 0.18, 12, 8),
        new THREE.MeshBasicMaterial({ color: KIND_COLOR[item.kind] ?? 0xd5e4ff }),
      );
      group.add(visual);
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(item.spanMpc ? 1.8 : 1.25, 10, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hit.userData.item = item;
      group.add(hit);
      hitMeshes.push(hit);
      if (item.spanMpc && item.kind !== "void") {
        group.add(spanLine(item, local, subject));
        group.userData.span = true;
      }
      if (item.kind === "void") {
        const bubble = new THREE.Mesh(
          new THREE.SphereGeometry(((item.spanMpc / subject) * DISPLAY_RADIUS) / 2, 12, 8),
          new THREE.MeshBasicMaterial({
            color: 0x9eb0c6,
            transparent: true,
            opacity: 0.05,
            wireframe: true,
            depthWrite: false,
          }),
        );
        group.add(bubble);
      }
      if (item.basin && state.scale === "supercluster") {
        const basin = ellipsoidRings([
          (70 / subject) * DISPLAY_RADIUS,
          (46 / subject) * DISPLAY_RADIUS,
          (88 / subject) * DISPLAY_RADIUS,
        ]);
        const direction = new THREE.Vector3(...local).normalize();
        basin.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
        group.position.copy(direction.multiplyScalar((42 / subject) * DISPLAY_RADIUS));
        group.add(basin);
      }
      const label = document.createElement("div");
      label.className = "star-label";
      label.textContent = item.name;
      const tag = new CSS2DObject(label);
      tag.position.set(0.4, 0.35, 0);
      group.add(tag);
      group.userData.label = label;
      group.userData.tag = tag;
      group.userData.landmark = Boolean(item.landmark);
      markerRoot.add(group);
      markers.set(item.id, group);
    }
    applyLabels(state);
  }

  function applyLabels(state) {
    const width = renderer.domElement.clientWidth || 1;
    const height = renderer.domElement.clientHeight || 1;
    const placed = [];
    const ids = [...markers.keys()].sort((a, b) => {
      if (a === state.selectedId) return -1;
      if (b === state.selectedId) return 1;
      return Number(markers.get(b).userData.landmark) - Number(markers.get(a).userData.landmark);
    });
    for (const id of ids) {
      const group = markers.get(id);
      const born = state.a + 1e-4 >= group.userData.formA;
      const dot = group.children[0];
      if (dot?.material && "opacity" in dot.material) {
        dot.material.transparent = true;
        dot.material.opacity = born ? 1 : 0.22;
      }
      let show =
        id === state.selectedId ||
        (born &&
          (state.showLabels === "all" || (state.showLabels === "key" && group.userData.landmark)));
      group.getWorldPosition(labelVec).project(camera);
      const x = (labelVec.x * 0.5 + 0.5) * width;
      const y = (-labelVec.y * 0.5 + 0.5) * height;
      const onScreen = labelVec.z <= 1;
      if (show && id !== state.selectedId && placed.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 28 ** 2)) {
        show = false;
      }
      if (!onScreen && id !== state.selectedId) show = false;
      if (show && onScreen) placed.push({ x, y });
      group.userData.tag.visible = show;
      group.userData.label.classList.toggle("is-selected", id === state.selectedId);
    }
  }

  resize();

  return {
    resize,
    update,
    pick,
    frameSubject,
    focusSelected,
    hud,
    dom: renderer.domElement,
  };
}

function pointMaterial(scale) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uScale: { value: scale },
      uAlpha: { value: 0.9 },
    },
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    premultipliedAlpha: true,
  });
}

function swapGeometry(points, buffer) {
  points.geometry.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer.count * 3), 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(buffer.count * 3), 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(buffer.count), 1));
  geometry.setAttribute("aHash", new THREE.BufferAttribute(buffer.hash, 1));
  points.geometry = geometry;
}

function paintWeb(points, buffer, radius, xi, plasma, heat, a) {
  const position = points.geometry.attributes.position.array;
  const color = points.geometry.attributes.aColor.array;
  const size = points.geometry.attributes.aSize.array;
  for (let i = 0; i < buffer.count; i += 1) {
    const o = i * 3;
    position[o] = (buffer.uniform[o] + (buffer.web[o] - buffer.uniform[o]) * xi) * radius;
    position[o + 1] = (buffer.uniform[o + 1] + (buffer.web[o + 1] - buffer.uniform[o + 1]) * xi) * radius;
    position[o + 2] = (buffer.uniform[o + 2] + (buffer.web[o + 2] - buffer.uniform[o + 2]) * xi) * radius;
    const born = smoothstep(buffer.formA[i], buffer.formA[i] * 1.7, a);
    const appear = (1 - plasma) * born;
    const mixed = mixColor(heat, [buffer.baseColor[o], buffer.baseColor[o + 1], buffer.baseColor[o + 2]], appear);
    const gain = plasma > 0.45 ? 0.5 : 0.12 + 0.88 * appear;
    color[o] = mixed[0] * gain;
    color[o + 1] = mixed[1] * gain;
    color[o + 2] = mixed[2] * gain;
    size[i] = buffer.baseSize[i] * (plasma > 0.5 ? 2.1 : 0.7 + appear * 0.8);
  }
  points.geometry.attributes.position.needsUpdate = true;
  points.geometry.attributes.aColor.needsUpdate = true;
  points.geometry.attributes.aSize.needsUpdate = true;
}

function subjectMpc(state) {
  if (state.scale === "universe") return state.cosmo.horizonMpc;
  if (state.scale === "supercluster") return NEAR_MPC;
  if (state.scale === "local") return LOCAL_MPC;
  return GALAXY_KPC / 1000;
}

function markerLocal(item, state, subject) {
  if (state.scale === "galaxy") {
    if (item.kpc) return galacticPosition(item.kpc);
    return null;
  }
  if (item.id === "milky-way" && state.scale === "local") return [0, 0, 0];
  if (item.group === "galaxy") return null;
  if (item.id === "cmb") return null;
  if (item.id === "local-group") {
    return state.scale === "universe" || state.scale === "supercluster" ? [0, 0, 0] : null;
  }
  if (item.ra == null || item.dec == null) return null;
  const distance = objectDistanceMpc(item, state.cosmo);
  if (state.scale === "universe" && distance < 25) return null;
  if (state.scale === "supercluster" && (distance > NEAR_MPC * 1.05 || distance < 8)) return null;
  if (state.scale === "local" && item.group !== "local") return null;
  if (state.scale !== "local" && item.group === "local") return null;
  return skyToXyz(item.ra, item.dec, (distance / subject) * DISPLAY_RADIUS);
}

function formationA(item) {
  if (item.kind === "cmb") return 0;
  if (item.z != null && item.z > 0.4) return 1 / (1 + item.z);
  if (item.group === "local" || item.group === "galaxy") return 0.12;
  return 0.18;
}

function ellipsoidRings(radii) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0xe0b56a, transparent: true, opacity: 0.55, depthWrite: false });
  for (let axis = 0; axis < 3; axis += 1) {
    const points = [];
    for (let i = 0; i <= 80; i += 1) {
      const t = (i / 80) * Math.PI * 2;
      const p = [0, 0, 0];
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      p[a] = Math.cos(t) * radii[a];
      p[b] = Math.sin(t) * radii[b];
      points.push(new THREE.Vector3(p[0], p[1], p[2]));
    }
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material));
  }
  return group;
}

function spanLine(item, local, subject) {
  const radial = new THREE.Vector3(...local).normalize();
  const up = Math.abs(radial.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(radial, up).normalize();
  const half = ((item.spanMpc / subject) * DISPLAY_RADIUS) / 2;
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      side.clone().multiplyScalar(-half),
      side.multiplyScalar(half),
    ]),
    new THREE.LineBasicMaterial({ color: KIND_COLOR[item.kind] ?? 0xb7c7de, transparent: true, opacity: 0.7 }),
  );
}

function fadeAssemblies(group, amount) {
  group.traverse((obj) => {
    if (!obj.material) return;
    if (obj.material.uniforms?.uOpacity) {
      obj.material.uniforms.uOpacity.value = amount;
      obj.visible = amount > 0.02;
      return;
    }
    if (obj.userData.baseOpacity == null && "opacity" in obj.material) {
      obj.userData.baseOpacity = obj.material.opacity;
    }
    if (obj.userData.baseOpacity != null) {
      obj.material.opacity = obj.userData.baseOpacity * amount;
      obj.material.transparent = true;
    }
  });
}

function buildCage() {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({
    color: 0xc8b89a,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  });
  for (const dec of [-60, -30, 0, 30, 60]) {
    const phi = (dec * Math.PI) / 180;
    const y = Math.sin(phi);
    const r = Math.cos(phi);
    const points = [];
    for (let i = 0; i <= 96; i += 1) {
      const t = (i / 96) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(t) * r, y, Math.sin(t) * r));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }
  for (let h = 0; h < 6; h += 1) {
    const ra = (h / 6) * Math.PI * 2;
    const points = [];
    for (let i = 0; i <= 64; i += 1) {
      const dec = -Math.PI / 2 + (i / 64) * Math.PI;
      points.push(
        new THREE.Vector3(
          Math.cos(dec) * Math.cos(ra),
          Math.sin(dec),
          Math.cos(dec) * Math.sin(ra),
        ),
      );
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  }
  return group;
}

function buildBackdrop() {
  const count = 900;
  const positions = new Float32Array(count * 3);
  let seed = 3;
  const rand = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i += 1) {
    const radius = 1200 + rand() * 80;
    const cosTheta = 1 - 2 * rand();
    const sinTheta = Math.sqrt(Math.max(1 - cosTheta * cosTheta, 0));
    const phi = rand() * Math.PI * 2;
    positions[i * 3] = radius * sinTheta * Math.cos(phi);
    positions[i * 3 + 1] = radius * cosTheta;
    positions[i * 3 + 2] = radius * sinTheta * Math.sin(phi);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xc5ceda,
      size: 1.15,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;
  return points;
}

