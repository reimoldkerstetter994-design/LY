(() => {
  const canvas = document.getElementById("scene");
  const loader = document.getElementById("loader");
  const nav = document.getElementById("planet-nav");
  const infoPanel = document.getElementById("info-panel");
  const dateEl = document.getElementById("sim-date");
  const metaEl = document.getElementById("sim-meta");
  const speedInput = document.getElementById("speed");
  const speedLabel = document.getElementById("speed-label");
  const playBtn = document.getElementById("btn-play");
  const resetBtn = document.getElementById("btn-reset");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03060d);
  scene.fog = new THREE.FogExp2(0x03060d, 0.0032);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0, 38, 92);

  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const labelLayer = document.createElement("div");
  labelLayer.className = "label-layer";
  document.getElementById("app").appendChild(labelLayer);

  const state = {
    paused: false,
    speed: 8,
    days: 0,
    showOrbits: true,
    showLabels: true,
    showAsteroids: true,
    showMoons: true,
    selected: "sun",
    follow: null
  };

  const cameraRig = {
    target: new THREE.Vector3(),
    spherical: new THREE.Spherical(98, 1.12, 0.55),
    dragging: false,
    lastX: 0,
    lastY: 0
  };

  const pickables = [];
  const bodies = new Map();
  const labels = [];

  function addStars() {
    const count = 3500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const r = 180 + Math.random() * 520;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const tint = 0.75 + Math.random() * 0.25;
      colors[i * 3] = tint;
      colors[i * 3 + 1] = tint * (0.9 + Math.random() * 0.1);
      colors[i * 3 + 2] = 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.7,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    scene.add(new THREE.Points(geometry, material));
  }

  function orbitPosition(body, days) {
    if (!body.orbitAU) return new THREE.Vector3();
    const a = body.orbitAU * AU;
    const e = body.eccentricity;
    const mean = ((days / body.periodDays) * Math.PI * 2) % (Math.PI * 2);
    const trueAnomaly = mean + 2 * e * Math.sin(mean);
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));
    const x = r * Math.cos(trueAnomaly);
    const z = r * Math.sin(trueAnomaly);
    const i = THREE.MathUtils.degToRad(body.inclination);
    return new THREE.Vector3(x, z * Math.sin(i) * 0.35, z * Math.cos(i));
  }

  function createOrbit(body) {
    const points = [];
    for (let i = 0; i <= 256; i += 1) {
      points.push(orbitPosition(body, (i / 256) * body.periodDays));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: body.color,
      transparent: true,
      opacity: 0.22
    });
    const line = new THREE.LineLoop(geometry, material);
    scene.add(line);
    return line;
  }

  function planetTexture(id) {
    if (id === "mercury") return TextureFactory.mercury();
    if (id === "venus") return TextureFactory.venus();
    if (id === "earth") return TextureFactory.earth();
    if (id === "mars") return TextureFactory.mars();
    if (id === "jupiter") {
      return TextureFactory.gasGiant(1024, 18, {
        r: 190, g: 140, b: 90, dr: 50, dg: 30, db: 10, spot: true
      });
    }
    if (id === "saturn") {
      return TextureFactory.gasGiant(1024, 14, {
        r: 210, g: 180, b: 120, dr: 30, dg: 20, db: 10
      });
    }
    if (id === "uranus") {
      return TextureFactory.gasGiant(512, 8, {
        r: 90, g: 200, b: 205, dr: 20, dg: 25, db: 20
      });
    }
    if (id === "neptune") {
      return TextureFactory.gasGiant(512, 10, {
        r: 40, g: 80, b: 190, dr: 20, dg: 40, db: 50
      });
    }
    return TextureFactory.moon();
  }

  function makeLabel(text) {
    const el = document.createElement("div");
    el.className = "space-label";
    el.textContent = text;
    labelLayer.appendChild(el);
    return el;
  }

  function createSun() {
    const group = new THREE.Group();
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(5.4, 64, 64),
      new THREE.MeshBasicMaterial({ map: TextureFactory.sun() })
    );
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TextureFactory.glowSprite(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    corona.scale.set(28, 28, 1);
    const light = new THREE.PointLight(0xffd8a0, 180, 260, 1.6);
    group.add(sun, corona, light);
    scene.add(group);
    pickables.push(sun);
    sun.userData.id = "sun";
    const label = makeLabel("太阳");
    bodies.set("sun", { data: BODIES[0], group, mesh: sun, orbit: null, moons: [], clouds: null, label });
    labels.push({ el: label, object: sun });
  }

  function createPlanet(data) {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(data.radius, 48, 48),
      new THREE.MeshStandardMaterial({
        map: planetTexture(data.id),
        roughness: 0.72,
        metalness: 0.04,
        emissive: new THREE.Color(data.color).multiplyScalar(0.04)
      })
    );
    mesh.rotation.z = THREE.MathUtils.degToRad(data.tilt);
    mesh.userData.id = data.id;
    group.add(mesh);
    pickables.push(mesh);

    let clouds = null;
    if (data.id === "earth") {
      clouds = new THREE.Mesh(
        new THREE.SphereGeometry(data.radius * 1.02, 48, 48),
        new THREE.MeshStandardMaterial({
          map: TextureFactory.clouds(),
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          roughness: 1
        })
      );
      group.add(clouds);
    }

    if (data.hasRings) {
      const ringTex = TextureFactory.rings(
        0.42,
        0.92,
        data.id === "uranus" ? { r: 170, g: 220, b: 230 } : { r: 220, g: 200, b: 150 },
        data.id === "uranus" ? 0.5 : 0.67
      );
      const rings = new THREE.Mesh(
        new THREE.PlaneGeometry(data.radius * 4.7, data.radius * 4.7),
        new THREE.MeshBasicMaterial({
          map: ringTex,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false
        })
      );
      rings.rotation.x = -Math.PI / 2.15;
      group.add(rings);
    }

    const moons = [];
    (data.moons || []).forEach((moon) => {
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(moon.radius, 24, 24),
        new THREE.MeshStandardMaterial({
          map: TextureFactory.moon(),
          color: moon.color,
          roughness: 0.9
        })
      );
      moonMesh.userData.moon = moon;
      group.add(moonMesh);
      moons.push(moonMesh);
    });

    const orbit = createOrbit(data);
    scene.add(group);
    const label = makeLabel(data.name);
    labels.push({ el: label, object: mesh });
    bodies.set(data.id, { data, group, mesh, orbit, moons, clouds, label });
  }

  function createAsteroids() {
    const count = 1400;
    const geometry = new THREE.SphereGeometry(0.06, 5, 4);
    const material = new THREE.MeshStandardMaterial({ color: 0x8b8074, roughness: 1 });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    const items = [];
    for (let i = 0; i < count; i += 1) {
      const radius = (2.15 + Math.random() * 0.7) * AU;
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 1.6;
      dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      dummy.scale.setScalar(0.4 + Math.random());
      dummy.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      items.push({ radius, angle, y, speed: 0.08 + Math.random() * 0.05 });
    }
    scene.add(mesh);
    bodies.set("asteroids", { mesh, items, dummy });
  }

  function buildNav() {
    nav.innerHTML = "";
    BODIES.forEach((body) => {
      const button = document.createElement("button");
      button.dataset.id = body.id;
      button.innerHTML = `<span class="swatch" style="background:${new THREE.Color(body.color).getStyle()};color:${new THREE.Color(body.color).getStyle()}"></span>${body.name}`;
      button.addEventListener("click", () => selectBody(body.id, true));
      nav.appendChild(button);
    });
  }

  function renderInfo(id) {
    const data = BODIES.find((item) => item.id === id);
    if (!data) return;
    infoPanel.hidden = false;
    infoPanel.innerHTML = `
      <div class="info-kicker">${data.kind === "star" ? "恒星" : "行星"} · ${data.nameEn.toUpperCase()}</div>
      <h2>${data.name}</h2>
      <p class="info-en">${data.nameEn}</p>
      <p class="info-lead">${data.summary}</p>
      <div class="facts">${data.facts.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
    `;
    [...nav.querySelectorAll("button")].forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.id === id);
    });
  }

  function selectBody(id, follow) {
    state.selected = id;
    state.follow = follow ? id : state.follow;
    const record = bodies.get(id);
    if (record) {
      const distance = Math.max(record.data.radius * 8, 10);
      cameraRig.spherical.radius = distance;
    }
    renderInfo(id);
  }

  function formatDate(days) {
    const date = new Date(Date.UTC(2000, 0, 1));
    date.setUTCDate(date.getUTCDate() + Math.floor(days));
    const y = date.getUTCFullYear();
    const era = y >= 1 ? "公元" : "公元前";
    const year = y >= 1 ? y : Math.abs(y) + 1;
    return `${era} ${year} 年 ${date.getUTCMonth() + 1} 月 ${date.getUTCDate()} 日`;
  }

  function updateLabels() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    labels.forEach(({ el, object }) => {
      if (!state.showLabels) {
        el.style.display = "none";
        return;
      }
      const pos = object.getWorldPosition(new THREE.Vector3()).project(camera);
      const visible = pos.z < 1 && pos.x > -1.1 && pos.x < 1.1 && pos.y > -1.1 && pos.y < 1.1;
      el.style.display = visible ? "block" : "none";
      el.style.left = `${(pos.x * 0.5 + 0.5) * width}px`;
      el.style.top = `${(-pos.y * 0.5 + 0.5) * height}px`;
    });
  }

  function updateBodies(dt) {
    if (!state.paused) state.days += dt * state.speed * 12;
    BODIES.forEach((data) => {
      const record = bodies.get(data.id);
      if (!record) return;
      if (data.id !== "sun") {
        record.group.position.copy(orbitPosition(data, state.days));
        record.orbit.visible = state.showOrbits;
      }
      const spin = data.rotationDays ? (dt * state.speed * 12 * Math.PI * 2) / Math.abs(data.rotationDays) : 0;
      record.mesh.rotation.y += (data.rotationDays < 0 ? -spin : spin) * (state.paused ? 0 : 1);
      if (record.clouds) record.clouds.rotation.y += spin * 1.3 * (state.paused ? 0 : 1);
      record.moons.forEach((moon) => {
        const info = moon.userData.moon;
        const angle = (state.days / info.periodDays) * Math.PI * 2;
        moon.visible = state.showMoons;
        moon.position.set(Math.cos(angle) * info.distance, Math.sin(angle) * 0.18, Math.sin(angle) * info.distance);
      });
    });

    const asteroids = bodies.get("asteroids");
    if (asteroids) {
      asteroids.mesh.visible = state.showAsteroids;
      if (!state.paused && state.showAsteroids) {
        asteroids.items.forEach((item, index) => {
          item.angle += dt * item.speed * state.speed * 0.08;
          asteroids.dummy.position.set(
            Math.cos(item.angle) * item.radius,
            item.y,
            Math.sin(item.angle) * item.radius
          );
          asteroids.dummy.scale.setScalar(0.4 + (index % 5) * 0.12);
          asteroids.dummy.updateMatrix();
          asteroids.mesh.setMatrixAt(index, asteroids.dummy.matrix);
        });
        asteroids.mesh.instanceMatrix.needsUpdate = true;
      }
    }

    dateEl.textContent = formatDate(state.days);
    const yearsPerSec = state.paused ? 0 : (state.speed * 12) / 365.25;
    metaEl.textContent = `${yearsPerSec.toFixed(2)} 地球年 / 秒`;
  }

  function updateCamera() {
    if (state.follow && bodies.has(state.follow)) {
      cameraRig.target.copy(bodies.get(state.follow).group.position);
    }
    const offset = new THREE.Vector3().setFromSpherical(cameraRig.spherical);
    camera.position.copy(cameraRig.target).add(offset);
    camera.lookAt(cameraRig.target);
  }

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length) selectBody(hits[0].object.userData.id, true);
  }

  function bindControls() {
    canvas.addEventListener("pointerdown", (event) => {
      cameraRig.dragging = true;
      cameraRig.startX = event.clientX;
      cameraRig.startY = event.clientY;
      cameraRig.lastX = event.clientX;
      cameraRig.lastY = event.clientY;
    });
    window.addEventListener("pointerup", (event) => {
      if (cameraRig.dragging) {
        const moved = Math.hypot(event.clientX - cameraRig.startX, event.clientY - cameraRig.startY);
        if (moved < 4) pick(event);
      }
      cameraRig.dragging = false;
    });
    window.addEventListener("pointermove", (event) => {
      if (!cameraRig.dragging) return;
      const dx = event.clientX - cameraRig.lastX;
      const dy = event.clientY - cameraRig.lastY;
      cameraRig.lastX = event.clientX;
      cameraRig.lastY = event.clientY;
      cameraRig.spherical.theta -= dx * 0.005;
      cameraRig.spherical.phi = THREE.MathUtils.clamp(cameraRig.spherical.phi - dy * 0.005, 0.15, Math.PI - 0.15);
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      cameraRig.spherical.radius = THREE.MathUtils.clamp(
        cameraRig.spherical.radius * (1 + event.deltaY * 0.0012),
        6,
        220
      );
    }, { passive: false });

    speedInput.addEventListener("input", () => {
      state.speed = Number(speedInput.value);
      speedLabel.textContent = `× ${state.speed}`;
    });
    playBtn.addEventListener("click", () => {
      state.paused = !state.paused;
      playBtn.textContent = state.paused ? "继续" : "暂停";
    });
    resetBtn.addEventListener("click", () => {
      state.days = 0;
      state.follow = null;
      cameraRig.target.set(0, 0, 0);
      cameraRig.spherical.set(98, 1.12, 0.55);
      selectBody("sun", false);
    });
    document.getElementById("toggle-orbits").addEventListener("change", (e) => { state.showOrbits = e.target.checked; });
    document.getElementById("toggle-labels").addEventListener("change", (e) => { state.showLabels = e.target.checked; });
    document.getElementById("toggle-asteroids").addEventListener("change", (e) => { state.showAsteroids = e.target.checked; });
    document.getElementById("toggle-moons").addEventListener("change", (e) => { state.showMoons = e.target.checked; });

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        playBtn.click();
      }
      const map = ["sun", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
      if (/^Digit[0-8]$/.test(event.code)) selectBody(map[Number(event.key)], true);
    });

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    updateBodies(dt);
    updateCamera();
    renderer.render(scene, camera);
    updateLabels();
    requestAnimationFrame(tick);
  }

  scene.add(new THREE.AmbientLight(0x6b7c9b, 0.28));
  addStars();
  createSun();
  BODIES.filter((item) => item.id !== "sun").forEach(createPlanet);
  createAsteroids();
  buildNav();
  renderInfo("sun");
  bindControls();
  requestAnimationFrame(tick);
  setTimeout(() => loader.classList.add("hide"), 350);
})();
