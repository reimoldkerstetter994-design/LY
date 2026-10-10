import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { companionDisk, milkyWayDisk } from "./galaxy.js";
import { displace } from "./zeldovich.js";

const FOV = 40;
const HALF = (FOV * Math.PI) / 180 / 2;
const KIND_COLOR = {
  star: 0xfff1c9,
  nucleus: 0xffd48a,
  satellite: 0xb7c4de,
  galaxy: 0xd5e4ff,
  group: 0x8fd0c4,
  cluster: 0xe4a15a,
  attractor: 0xf0d7a2,
  void: 0x7ea8c8,
  wall: 0xd7b0ff,
  cmb: 0xffb088,
  horizon: 0xf0d7a2,
  hubble: 0x9fd4d1,
};

const LABEL_WEIGHT = {
  star: 2,
  nucleus: 2,
  satellite: 1,
  galaxy: 3,
  group: 4,
  cluster: 5,
  attractor: 6,
  void: 4,
  wall: 5,
};

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

export function structureOpacity(snap, kind) {
  if (kind === "cmb") return snap.cmbVisible ? 1 : 0;
  if (kind === "horizon" || kind === "hubble") return 1;
  if (!snap.cmbVisible) return 0;
  const d = snap.D;
  if (kind === "wall" || kind === "attractor" || kind === "void") return smoothstep(0.12, 0.45, d);
  if (kind === "cluster") return smoothstep(0.04, 0.24, d);
  return smoothstep(0.02, 0.14, d);
}

function distanceFor(radius) {
  return Math.max(radius, 1e-4) / Math.tan(HALF);
}

function radiusOf(distance) {
  return distance * Math.tan(HALF);
}

function makeSpriteMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function hash01(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function createUniverseView(canvas, host) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    logarithmicDepthBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setClearColor(0x07080c, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1e-4, 100000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.9;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.28;
  controls.minDistance = distanceFor(0.008);
  controls.maxDistance = distanceFor(40000);

  const labels = new CSS2DRenderer();
  labels.domElement.className = "label-layer";
  host.appendChild(labels.domElement);

  const mapGroup = new THREE.Group();
  const webGroup = new THREE.Group();
  scene.add(mapGroup, webGroup);

  const cmb = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), cmbMaterial());
  cmb.frustumCulled = false;
  const horizon = wireSphere(0xe7c59a, 0.45);
  const hubble = wireSphere(0x8fd4cf, 0.4);
  mapGroup.add(cmb, horizon, hubble);

  const plane = new THREE.Mesh(
    new THREE.CircleGeometry(1, 72),
    new THREE.MeshBasicMaterial({
      color: 0xf0d7a2,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mapGroup.add(plane);

  const axes = new THREE.Group();
  axes.add(axisLine([1, 0, 0], 0xd5924a), axisLine([0, 1, 0], 0x8fd0c4), axisLine([0, 0, 1], 0x7ea2c4));
  mapGroup.add(axes);

  const linkGeo = new THREE.BufferGeometry();
  const linkMat = new THREE.LineBasicMaterial({
    color: 0xcbb892,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const links = new THREE.LineSegments(linkGeo, linkMat);
  mapGroup.add(links);

  const wallGeo = new THREE.BufferGeometry();
  const wallMat = new THREE.LineBasicMaterial({
    color: 0xd7b0ff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const walls = new THREE.LineSegments(wallGeo, wallMat);
  mapGroup.add(walls);

  const mw = milkyWayDisk();
  const mwPoints = coloredPoints(mw.positions, mw.colors, 0.00012);
  mapGroup.add(mwPoints);
  const m31local = companionDisk(2200, 0.024, 19);
  const m31Points = coloredPoints(m31local.positions, m31local.colors, 0.00016);
  mapGroup.add(m31Points);

  const markerGroup = new THREE.Group();
  mapGroup.add(markerGroup);
  const markers = new Map();

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 1, 48),
    new THREE.MeshBasicMaterial({
      color: 0xf3ecdf,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  ring.visible = false;
  mapGroup.add(ring);

  const plasma = new THREE.Mesh(
    new THREE.SphereGeometry(1, 40, 28),
    new THREE.MeshBasicMaterial({
      color: 0xffc39a,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  plasma.frustumCulled = false;
  plasma.renderOrder = -1;
  camera.add(plasma);
  scene.add(camera);

  const webPoints = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: { uScale: { value: 1 } },
      vertexShader: `
        attribute float aSize;
        attribute vec3 aColor;
        varying vec3 vColor;
        uniform float uScale;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uScale * (520.0 / max(-mv.z, 0.001)), 0.0, 7.5);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        void main() {
          vec2 p = gl_PointCoord - vec2(0.5);
          float r = length(p);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.12, r) * 0.9;
          gl_FragColor = vec4(vColor, a);
          #include <logdepthbuf_fragment>
        }
      `,
    }),
  );
  webGroup.add(webPoints);

  const filamentGeo = new THREE.BufferGeometry();
  const filamentMat = new THREE.LineBasicMaterial({
    color: 0x5e9c9a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const filaments = new THREE.LineSegments(filamentGeo, filamentMat);
  webGroup.add(filaments);

  const boxLines = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xf0d7a2, transparent: true, opacity: 0.35 }),
  );
  webGroup.add(boxLines);

  let sim = null;
  let filamentIndex = new Uint32Array();
  let displaced = new Float32Array();
  let catalogKey = "";
  let anim = null;
  let mode = "map";
  const scratch = new THREE.Vector3();
  const clock = new THREE.Clock();

  canvas.addEventListener("pointerdown", () => {
    controls.autoRotate = false;
    anim = null;
  });

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  function setMode(next) {
    mode = next;
    mapGroup.visible = next === "map";
    webGroup.visible = next === "web";
    if (next === "web" && sim) {
      const boxMpc = sim.box / (sim.h || 0.67);
      controls.minDistance = distanceFor(boxMpc * 0.08);
      controls.maxDistance = distanceFor(boxMpc * 8);
    } else {
      controls.minDistance = distanceFor(0.008);
      controls.maxDistance = distanceFor(50000);
    }
  }

  function focusOn(position, radius) {
    const dest = new THREE.Vector3(position[0], position[1], position[2]);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-10) dir.set(0.62, 0.36, 0.7);
    dir.normalize();
    anim = {
      t0: performance.now(),
      ms: 780,
      fromT: controls.target.clone(),
      toT: dest,
      fromP: camera.position.clone(),
      toP: dest.clone().addScaledVector(dir, distanceFor(radius)),
    };
  }

  function setRadius(radius) {
    focusOn([controls.target.x, controls.target.y, controls.target.z], radius);
  }

  function lookRadius(radius) {
    anim = null;
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-10) dir.set(0.62, 0.36, 0.7);
    dir.setLength(distanceFor(radius));
    camera.position.copy(controls.target).add(dir);
  }

  function home(radius) {
    camera.position.set(0.62, 0.36, 0.7).normalize().multiplyScalar(distanceFor(radius));
    controls.target.set(0, 0, 0);
    anim = null;
    controls.update();
  }

  function setCatalog(placed) {
    const key = placed.map((b) => `${b.id}:${b.d.toFixed(4)}:${b.p?.[0]?.toFixed?.(2)}`).join("|");
    if (key === catalogKey) return;
    catalogKey = key;
    const seen = new Set();
    for (const body of placed) {
      if (body.shell) continue;
      seen.add(body.id);
      let marker = markers.get(body.id);
      if (!marker) {
        marker = createMarker(body);
        markers.set(body.id, marker);
        markerGroup.add(marker.group);
      }
      marker.body = body;
      marker.group.position.set(body.p[0], body.p[1], body.p[2]);
      marker.label.element.textContent = body.name;
    }
    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        markerGroup.remove(marker.group);
        marker.label.element.remove();
        markers.delete(id);
      }
    }
    rebuildLinks(placed);
    const m31 = placed.find((b) => b.id === "m31");
    if (m31?.p) m31Points.position.set(m31.p[0], m31.p[1], m31.p[2]);
  }

  function setSimulation(next) {
    sim = next;
    displaced = new Float32Array(sim.q.length);
    filamentIndex = buildFilaments(sim);
    const n = sim.q.length / 3;
    const positions = new Float32Array(sim.q.length);
    const colors = new Float32Array(sim.q.length);
    const sizes = new Float32Array(n);
    webPoints.geometry.dispose();
    webPoints.geometry = new THREE.BufferGeometry();
    webPoints.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    webPoints.geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    webPoints.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const linePos = new Float32Array(filamentIndex.length * 3);
    filamentGeo.dispose();
    filaments.geometry = new THREE.BufferGeometry();
    filaments.geometry.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    const boxMpc = sim.box / sim.h;
    boxLines.scale.setScalar(boxMpc);
  }

  function sync(snap, layers, selectedId, gain) {
    const dist = camera.position.distanceTo(controls.target);
    const viewRadius = radiusOf(dist);
    camera.near = Math.max(dist * 2e-4, 1e-6);
    camera.far = Math.max(dist * 80, (snap.horizonMpc || 1000) * 3, 5000);
    camera.updateProjectionMatrix();

    const plasmaOn = !snap.cmbVisible || snap.z > 80;
    plasma.material.opacity = plasmaOn ? (snap.cmbVisible ? 0.08 : 0.34) : 0;
    plasma.material.color.copy(plasmaColor(snap.T));
    plasma.scale.setScalar(Math.max(dist * 1.8, 1));
    renderer.setClearColor(plasmaOn ? plasma.material.color.clone().multiplyScalar(0.18) : new THREE.Color(0x07080c));

    const showShell = (radius) => radius > 0 && viewRadius > radius * 0.18;
    cmb.visible = layers.cmb && snap.cmbVisible && mode === "map" && showShell(snap.cmbRadiusMpc);
    cmb.scale.setScalar(Math.max(snap.cmbRadiusMpc, 0.001));
    cmb.material.uniforms.uOpacity.value = selectedId === "cmb" ? 0.72 : 0.34;
    horizon.visible = layers.horizon && mode === "map" && showShell(snap.horizonMpc);
    horizon.scale.setScalar(Math.max(snap.horizonMpc, 0.001));
    horizon.material.opacity = selectedId === "horizon" ? 0.9 : 0.42;
    hubble.visible = layers.hubble && mode === "map" && showShell(snap.hubbleComovingMpc);
    hubble.scale.setScalar(Math.max(snap.hubbleComovingMpc, 0.001));
    hubble.material.opacity = selectedId === "hubble" ? 0.95 : 0.45;

    plane.visible = layers.plane && mode === "map";
    plane.scale.setScalar(Math.min(Math.max(viewRadius, 0.05), 800));
    axes.visible = layers.axes && mode === "map";
    const axisLen = Math.min(viewRadius * 0.28, 120);
    axes.scale.setScalar(axisLen);

    const galaxyIn = structureOpacity(snap, "galaxy");
    mwPoints.visible = layers.disk && mode === "map" && viewRadius < 0.28 && galaxyIn > 0.05;
    mwPoints.material.opacity = galaxyIn;
    const starWorld = (5.2 * viewRadius) / Math.max(host.clientHeight, 1);
    mwPoints.material.size = starWorld;
    m31Points.visible = layers.disk && mode === "map" && viewRadius < 2.4 && viewRadius > 0.08 && galaxyIn > 0.05;
    m31Points.material.opacity = galaxyIn;
    m31Points.material.size = starWorld * 1.4;

    linkMat.opacity = layers.links ? 0.32 * structureOpacity(snap, "group") : 0;
    links.visible = layers.links && mode === "map" && linkMat.opacity > 0.02;
    wallMat.opacity = layers.links ? 0.7 * structureOpacity(snap, "wall") : 0;
    walls.visible = mode === "map" && wallMat.opacity > 0.02;

    const ranked = [];
    const labelAnchors = [];
    const frame = labelFrame(host);
    for (const marker of markers.values()) {
      const body = marker.body;
      const fade = structureOpacity(snap, body.kind);
      const inRange = body.d <= viewRadius * 1.35;
      const show = fade > 0.04 && mode === "map" && inRange;
      marker.group.visible = show;
      marker.label.visible = false;
      marker.core.material.opacity = Math.min(1, 0.35 + fade);
      marker.halo.material.opacity = 0.22 * fade;
      marker.fade = fade;
      const scale = viewRadius * (body.id === selectedId ? 0.02 : 0.012);
      marker.group.scale.setScalar(Math.max(scale, 1e-5));
      if (!show) continue;
      const score = labelScore(body, viewRadius, selectedId);
      if (layers.labels && score > 0) ranked.push({ marker, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    for (const { marker } of ranked) {
      const selected = marker.body.id === selectedId;
      scratch.copy(marker.group.position).project(camera);
      const sx = (scratch.x * 0.5 + 0.5) * frame.width;
      const sy = (-scratch.y * 0.5 + 0.5) * frame.height;
      const onScreen =
        scratch.z > -1 &&
        scratch.z < 1 &&
        sx > frame.left &&
        sx < frame.right &&
        sy > frame.top &&
        sy < frame.bottom;
      const near = viewRadius < 0.2;
      const crowded = labelAnchors.some((p) => {
        const dx = (p.x - sx) / (near ? 62 : 108);
        const dy = (p.y - sy) / (near ? 20 : 30);
        return dx * dx + dy * dy < 1;
      });
      const on = onScreen && (selected || (!crowded && labelAnchors.length < 10));
      marker.label.visible = on;
      marker.label.element.classList.toggle("is-selected", selected && on);
      if (on) labelAnchors.push({ x: sx, y: sy });
    }

    const selected = markers.get(selectedId);
    if (selected && selected.group.visible && mode === "map") {
      ring.visible = true;
      ring.position.copy(selected.group.position);
      ring.lookAt(camera.position);
      ring.scale.setScalar(viewRadius * 0.02);
    } else {
      ring.visible = false;
    }

    if (sim && mode === "web") updateWeb(snap, layers, gain);

    return viewRadius;
  }

  function updateWeb(snap, layers, gain) {
    if (!webPoints.geometry.attributes.position) return;
    const growth = Math.max(snap.D, 0) * gain;
    displace(sim, growth, displaced);
    const hScale = 1 / sim.h;
    const jitter = sim.cell * 0.28;
    const pos = webPoints.geometry.attributes.position.array;
    const col = webPoints.geometry.attributes.aColor.array;
    const size = webPoints.geometry.attributes.aSize.array;
    const n = sim.delta.length;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      const contrast = sim.delta[i] * Math.min(growth, 1.35);
      pos[j] = (displaced[j] + (hash01(i) - 0.5) * jitter) * hScale;
      pos[j + 1] = (displaced[j + 1] + (hash01(i + 19) - 0.5) * jitter) * hScale;
      pos[j + 2] = (displaced[j + 2] + (hash01(i + 47) - 0.5) * jitter) * hScale;
      const rgb = densityColor(contrast);
      col[j] = rgb[0];
      col[j + 1] = rgb[1];
      col[j + 2] = rgb[2];
      const peak = sim.delta[i] > 1.15 && growth > 0.25;
      let s = 0;
      if (layers.dm) {
        if (growth < 0.08) s = 0.42;
        else if (contrast > -0.2) s = 0.38 + Math.min(Math.max(contrast, 0), 1.8) * 0.36;
      }
      if (layers.galaxies && peak) s = Math.max(s, 1.55 + Math.min(contrast, 2));
      if (!layers.dm && !(layers.galaxies && peak)) s = 0;
      size[i] = s;
    }
    webPoints.geometry.attributes.position.needsUpdate = true;
    webPoints.geometry.attributes.aColor.needsUpdate = true;
    webPoints.geometry.attributes.aSize.needsUpdate = true;
    webPoints.material.uniforms.uScale.value = 1;
    webPoints.visible = layers.dm || layers.galaxies;

    if (layers.filaments && filamentIndex.length) {
      const line = filaments.geometry.attributes.position.array;
      for (let k = 0; k < filamentIndex.length; k += 2) {
        const a = filamentIndex[k] * 3;
        const b = filamentIndex[k + 1] * 3;
        const o = k * 3;
        const dx = pos[a] - pos[b];
        const dy = pos[a + 1] - pos[b + 1];
        const dz = pos[a + 2] - pos[b + 2];
        const maxLen = (sim.cell / sim.h) * 4.2;
        const wrapped = dx * dx + dy * dy + dz * dz > maxLen * maxLen;
        const bx = wrapped ? pos[a] : pos[b];
        const by = wrapped ? pos[a + 1] : pos[b + 1];
        const bz = wrapped ? pos[a + 2] : pos[b + 2];
        line[o] = pos[a];
        line[o + 1] = pos[a + 1];
        line[o + 2] = pos[a + 2];
        line[o + 3] = bx;
        line[o + 4] = by;
        line[o + 5] = bz;
      }
      filaments.geometry.attributes.position.needsUpdate = true;
      filaments.frustumCulled = false;
      const filamentIn = smoothstep(0.18, 0.7, growth);
      filamentMat.opacity = 0.46 * filamentIn;
      filaments.visible = filamentIn > 0.05;
    } else {
      filaments.visible = false;
    }
    boxLines.visible = layers.box;
  }

  function pick(clientX, clientY) {
    if (mode !== "map") return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    let best = null;
    let bestD = 20;
    for (const marker of markers.values()) {
      if (!marker.group.visible) continue;
      scratch.copy(marker.group.position).project(camera);
      if (scratch.z < -1 || scratch.z > 1) continue;
      const dx = (scratch.x - x) * rect.width * 0.5;
      const dy = (scratch.y - y) * rect.height * 0.5;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = marker.body.id;
      }
    }
    return best;
  }

  function render() {
    const now = performance.now();
    if (anim) {
      const k = ease(Math.min(1, (now - anim.t0) / anim.ms));
      controls.target.lerpVectors(anim.fromT, anim.toT, k);
      camera.position.lerpVectors(anim.fromP, anim.toP, k);
      if (k >= 1) anim = null;
    }
    controls.update();
    if (cmb.visible) cmb.material.uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
    labels.render(scene, camera);
    return radiusOf(camera.position.distanceTo(controls.target));
  }

  function createMarker(body) {
    const color = KIND_COLOR[body.kind] ?? 0xffffff;
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 14), makeSpriteMaterial(color, 1));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), makeSpriteMaterial(color, 0.25));
    group.add(halo, core);
    const el = document.createElement("div");
    el.className = "tag";
    el.textContent = body.name;
    const label = new CSS2DObject(el);
    label.center.set(0, 0.5);
    group.add(label);
    return { body, group, core, halo, label, fade: 1 };
  }

  function rebuildLinks(placed) {
    const byId = new Map(placed.map((b) => [b.id, b]));
    const seg = [];
    const wall = [];
    for (const body of placed) {
      if (body.path?.length > 1) {
        for (let i = 0; i < body.path.length - 1; i++) {
          wall.push(...body.path[i], ...body.path[i + 1]);
        }
      }
      if (!body.parent) continue;
      const parent = byId.get(body.parent);
      if (!parent?.p || body.shell || parent.shell) continue;
      seg.push(...body.p, ...parent.p);
    }
    linkGeo.dispose();
    links.geometry = new THREE.BufferGeometry();
    links.geometry.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    wallGeo.dispose();
    walls.geometry = new THREE.BufferGeometry();
    walls.geometry.setAttribute("position", new THREE.Float32BufferAttribute(wall, 3));
  }

  home(140);
  resize();

  return {
    resize,
    setMode,
    setCatalog,
    setSimulation,
    sync,
    render,
    pick,
    focusOn,
    setRadius,
    lookRadius,
    home,
    stopAuto() {
      controls.autoRotate = false;
    },
  };
}

function wireSphere(color, opacity) {
  const geo = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 36, 20));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.LineSegments(geo, mat);
  line.frustumCulled = false;
  return line;
}

function axisLine(dir, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(dir[0], dir[1], dir[2]),
  ]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
}

function coloredPoints(positions, colors, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

function cmbMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.42 },
    },
    vertexShader: `
      varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uTime;
      uniform float uOpacity;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float hash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z
        );
      }
      void main() {
        float n = noise(vDir * 6.5) * 0.65 + noise(vDir * 18.0 + uTime * 0.03) * 0.35;
        vec3 cold = vec3(0.72, 0.28, 0.16);
        vec3 hot = vec3(1.0, 0.9, 0.72);
        vec3 col = mix(cold, hot, smoothstep(0.32, 0.78, n));
        gl_FragColor = vec4(col, uOpacity * (0.45 + 0.55 * n));
        #include <logdepthbuf_fragment>
      }
    `,
  });
}

function plasmaColor(T) {
  const x = Math.log10(Math.max(T, 300));
  const c = new THREE.Color();
  if (x > 9) c.set("#d5e4ff");
  else if (x > 6.5) c.set("#fff4dd");
  else if (x > 4.2) c.set("#ffb15a");
  else c.set("#c85b34");
  return c;
}

function densityColor(contrast) {
  const t = Math.max(-1.2, Math.min(2.2, contrast));
  if (t < 0) {
    const k = (t + 1.2) / 1.2;
    return [0.08 + 0.1 * k, 0.12 + 0.18 * k, 0.22 + 0.28 * k];
  }
  if (t < 1) {
    return [0.22 + 0.38 * t, 0.4 + 0.22 * t, 0.48 + 0.08 * t];
  }
  const k = Math.min(1, (t - 1) / 1.6);
  return [0.86 + 0.1 * k, 0.58 + 0.16 * k, 0.28 + 0.08 * k];
}

function labelScore(body, viewRadius, selectedId) {
  if (body.d > viewRadius * 1.08 && body.id !== selectedId) return -1;
  if (viewRadius > 0.25 && body.d < viewRadius * 0.02 && body.id !== selectedId) return -1;
  if (body.id === selectedId) return 100;
  if (viewRadius > 0.4 && (body.kind === "star" || body.kind === "nucleus" || body.kind === "satellite")) return -1;
  if (viewRadius > 25 && body.kind === "galaxy" && body.d < 15) return body.id === "mw" ? 8 : -1;
  if (viewRadius > 80 && body.kind === "cluster" && body.d < 25) return 3;
  const weight = LABEL_WEIGHT[body.kind] ?? 1;
  return weight + (1 - Math.min(body.d / Math.max(viewRadius, 1e-4), 1)) * 2;
}

function labelFrame(host) {
  const width = host.clientWidth || 1;
  const height = host.clientHeight || 1;
  const bounds = { left: 8, right: width - 8, top: 8, bottom: height - 8, width, height };
  const hostRect = host.getBoundingClientRect();
  for (const panel of document.querySelectorAll(".panel")) {
    if (getComputedStyle(panel).display === "none") continue;
    const rect = panel.getBoundingClientRect();
    const localLeft = rect.left - hostRect.left;
    const localRight = rect.right - hostRect.left;
    const localTop = rect.top - hostRect.top;
    if (rect.width < width * 0.62 && localLeft < width * 0.4) bounds.left = Math.max(bounds.left, localRight + 8);
    if (rect.width < width * 0.62 && width - localRight < width * 0.4) bounds.right = Math.min(bounds.right, localLeft - 8);
    if (rect.width > width * 0.7 && localTop > height * 0.28) bounds.bottom = Math.min(bounds.bottom, localTop - 8);
  }
  if (bounds.right < bounds.left + 40) {
    bounds.left = 8;
    bounds.right = width - 8;
  }
  return bounds;
}

function buildFilaments(sim) {
  const { n, delta } = sim;
  const pairs = [];
  const at = (x, y, z) => (x * n + y) * n + z;
  const thresh = 1.35;
  const dirs = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        if (dx < 0 || (dx === 0 && dy < 0) || (dx === 0 && dy === 0 && dz < 0)) continue;
        dirs.push([dx, dy, dz]);
      }
    }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      for (let z = 0; z < n; z++) {
        const i = at(x, y, z);
        if (delta[i] < thresh) continue;
        let best = -1;
        let bestD = thresh;
        for (const [dx, dy, dz] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          if (nx < 0 || ny < 0 || nz < 0 || nx >= n || ny >= n || nz >= n) continue;
          const j = at(nx, ny, nz);
          if (delta[j] < thresh) continue;
          const ridge = delta[i] + delta[j];
          if (ridge > bestD) {
            bestD = ridge;
            best = j;
          }
        }
        if (best >= 0) pairs.push(i, best);
      }
    }
  }
  return new Uint32Array(pairs);
}

function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function createFallbackView() {
  const noop = () => {};
  return {
    resize: noop,
    setMode: noop,
    setCatalog: noop,
    setSimulation: noop,
    sync: () => 140,
    render: noop,
    pick: () => null,
    focusOn: noop,
    setRadius: noop,
    lookRadius: noop,
    home: noop,
    stopAuto: noop,
  };
}
