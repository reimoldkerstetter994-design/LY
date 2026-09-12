import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GameAudio } from "./audio.js";
import { Input } from "./input.js";

const DOWN = new THREE.Vector3(0, -1, 0);
const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();

function el(id) {
  return document.getElementById(id);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.audio = new GameAudio();
    this.input = new Input(canvas);
    this.clock = new THREE.Clock();
    this.playing = false;
    this.paused = false;
    this.won = false;
    this.dialogOpen = false;
    this.dialogQueue = [];
    this.toastTimer = 0;

    this.hp = 100;
    this.stamina = 100;
    this.vy = 0;
    this.onGround = false;
    this.invuln = 0;
    this.attackCd = 0;
    this.stepTimer = 0;
    this.bob = 0;

    this.talked = false;
    this.fragments = new Set();
    this.stars = new Set();
    this.chests = new Set();

    this.named = new Map();
    this.obstacles = [];
    this.walkable = [];
    this.interactables = [];
    this.enemies = [];
    this.spawns = [];
    this.spawn = new THREE.Vector3(0, 4, 54);
    this.playerPos = new THREE.Vector3(0, 4, 54);

    this.ray = new THREE.Raycaster();
    this.ray.far = 40;

    this._setupRenderer();
    this._bindUi();
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1524);
    this.scene.fog = new THREE.FogExp2(0x122033, 0.011);

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 400);

    this.hemi = new THREE.HemisphereLight(0x7ec8ff, 0x1a1814, 0.62);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffd2a8, 1.15);
    this.sun.position.set(48, 62, 28);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.camera.left = -38;
    this.sun.shadow.camera.right = 38;
    this.sun.shadow.camera.top = 38;
    this.sun.shadow.camera.bottom = -38;
    this.scene.add(this.sun);

    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.6, 0.38);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } catch (err) {
      console.warn("postprocess fallback", err);
      this.composer = {
        setSize() {},
        render: () => this.renderer.render(this.scene, this.camera),
      };
    }

    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  _bindUi() {
    el("startBtn").onclick = () => this.start();
    el("resumeBtn").onclick = () => this.setPaused(false);
    el("respawnBtn").onclick = () => this.respawn();
    el("againBtn").onclick = () => location.reload();
    el("dialogBtn").onclick = () => this.advanceDialog();
  }

  async load() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      const p = total ? loaded / total : 0;
      el("loadbar").style.width = `${Math.round(p * 100)}%`;
      el("loadtxt").textContent = `装载模块 ${Math.round(p * 100)}%`;
    };
    const loader = new GLTFLoader(manager);

    const [worldMeta, worldGltf, playerGltf, enemyGltf] = await Promise.all([
      fetch("/assets/world.json").then((r) => r.json()),
      loader.loadAsync("/assets/world.glb"),
      loader.loadAsync("/assets/player.glb"),
      loader.loadAsync("/assets/enemy.glb"),
      this.audio.boot().catch(() => null),
    ]);
    this.meta = worldMeta;
    this.worldRoot = worldGltf.scene;
    this.scene.add(this.worldRoot);
    this._ingestWorld(this.worldRoot);
    this._addWater();
    this._addFillLights();
    this._addStars();
    this._makePlayer(playerGltf.scene);
    this._spawnEnemies(enemyGltf.scene);

    el("loading").classList.add("hidden");
    el("title").classList.remove("hidden");
    this._loop();
  }

  _ingestWorld(root) {
    const walkNames = /^(TERRAIN|BRIDGE|BOOT_plaza|ARENA_floor|ISLE_|SPIRE_plinth)/;
    root.traverse((obj) => {
      if (!obj.isMesh) {
        if (obj.name) this.named.set(obj.name, obj);
        return;
      }
      obj.castShadow = !obj.name.startsWith("TERRAIN") && !obj.name.startsWith("COL_");
      obj.receiveShadow = true;
      if (obj.name) this.named.set(obj.name, obj);

      if (obj.name === "TERRAIN") {
        const mats = [].concat(obj.material);
        for (const m of mats) {
          if (!m) continue;
          m.vertexColors = true;
          m.roughness = 0.92;
          m.metalness = 0.04;
        }
        this.walkable.push(obj);
      } else if (walkNames.test(obj.name)) {
        this.walkable.push(obj);
      }

      if (obj.name.startsWith("COL_")) {
        obj.visible = false;
        if (obj.name.startsWith("COL_tree") || obj.name === "COL_spire") return;
        obj.geometry.computeBoundingBox();
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.y >= 1.25) this.obstacles.push(box);
      }

      if (obj.name.startsWith("SPAWN_player")) {
        obj.visible = false;
        obj.getWorldPosition(this.spawn);
        this.playerPos.copy(this.spawn);
      }

      if (
        obj.name.startsWith("FRAG_") ||
        obj.name.startsWith("TERM_") ||
        obj.name.startsWith("NPC_") ||
        obj.name.startsWith("CHEST_") ||
        obj.name.startsWith("STAR_") ||
        obj.name === "SPIRE_core"
      ) {
        this.interactables.push(obj);
      }
    });
  }

  _addWater() {
    const geo = new THREE.PlaneGeometry(240, 240, 48, 48);
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uColorDeep: { value: new THREE.Color("#07242e") },
        uColorLite: { value: new THREE.Color("#1aa3b8") },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z += sin(p.x * 0.12 + uTime * 1.2) * 0.12 + cos(p.y * 0.1 + uTime * 0.9) * 0.1;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColorDeep;
        uniform vec3 uColorLite;
        varying vec2 vUv;
        void main() {
          float g = 0.35 + 0.2 * sin(vUv.x * 40.0) * sin(vUv.y * 36.0);
          vec3 c = mix(uColorDeep, uColorLite, g);
          gl_FragColor = vec4(c, 0.78);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, this.waterMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = this.meta.waterLevel ?? 0.18;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  _addFillLights() {
    const spots = [
      [0, 12, 0, 0x4df0ff, 18],
      [54, 6, -10, 0xffb14a, 14],
      [-52, 6, -6, 0xff4dff, 14],
      [4, 8, -58, 0xffd36a, 14],
      [44, 5, -42, 0x4df0ff, 12],
      [-42, 6, -44, 0xff4d6a, 12],
    ];
    for (const [x, y, z, c, d] of spots) {
      const l = new THREE.PointLight(c, 2.2, d, 1.6);
      l.position.set(x, y, z);
      this.scene.add(l);
    }
  }

  _addStars() {
    const count = 900;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 160 + Math.random() * 80;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * 0.7;
      pos[i * 3] = Math.cos(th) * Math.cos(ph) * r;
      pos[i * 3 + 1] = 18 + Math.sin(ph) * r * 0.55;
      pos[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * r;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xb8e7ff, size: 0.55, sizeAttenuation: true })
    );
    this.scene.add(stars);
  }

  _makePlayer(model) {
    this.playerRig = new THREE.Group();
    model.scale.setScalar(1.12);
    model.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.playerModel = model;
    this.playerRig.add(model);
    this.scene.add(this.playerRig);
    this.playerRig.position.copy(this.playerPos);
  }

  _spawnEnemies(proto) {
    const sites = this.meta.sites;
    const homes = [];
    const forest = sites.forest;
    const canyon = sites.canyon;
    const lake = sites.lake;
    for (let i = 0; i < 5; i++) {
      const a = (i / 8) * Math.PI * 2;
      homes.push([forest.x + Math.cos(a) * 9, forest.z + Math.sin(a) * 9]);
    }
    for (let i = 0; i < 4; i++) homes.push([canyon.x + (i - 1.5) * 4, canyon.z + 10]);
    homes.push([lake.x - 12, lake.z], [0, 22], [18, -16]);
    for (const [x, z] of homes) {
      const mesh = proto.clone(true);
      mesh.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.material = o.material.clone();
        }
      });
      const e = {
        mesh,
        hp: 2,
        home: new THREE.Vector3(x, 2, z),
        pos: new THREE.Vector3(x, 2, z),
        vel: new THREE.Vector3(),
        cooldown: 0,
        alive: true,
        wander: Math.random() * Math.PI * 2,
      };
      this.scene.add(mesh);
      this.enemies.push(e);
    }
  }

  start() {
    this.audio.resume();
    this.audio.startAmbient();
    this.audio.play("click");
    el("title").classList.add("hidden");
    el("hud").classList.remove("hidden");
    this.playing = true;
    this._updateCamera(0.016, true);
    this.canvas.requestPointerLock?.();
    this.toast("找到引导者 BOOT");
  }

  setPaused(v) {
    this.paused = v;
    el("pause").classList.toggle("hidden", !v);
    if (!v) this.canvas.requestPointerLock?.();
    else document.exitPointerLock?.();
  }

  toast(text) {
    const n = el("toast");
    n.textContent = text;
    n.classList.add("show");
    this.toastTimer = 2.2;
  }

  groundY(x, y, z) {
    this.ray.set(TMP.set(x, y + 6, z), DOWN);
    const hits = this.ray.intersectObjects(this.walkable, false);
    if (hits.length) return hits[0].point.y;
    return null;
  }

  resolveWalls(x, y, z, radius = 0.42) {
    for (const box of this.obstacles) {
      if (y + 1.7 < box.min.y || y + 0.2 > box.max.y) continue;
      const cx = clamp(x, box.min.x, box.max.x);
      const cz = clamp(z, box.min.z, box.max.z);
      let dx = x - cx;
      let dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 < 1e-8) {
        const mid = box.getCenter(TMP2);
        dx = x - mid.x;
        dz = z - mid.z;
        const n = Math.hypot(dx, dz) || 1;
        x += (dx / n) * radius;
        z += (dz / n) * radius;
        continue;
      }
      const d = Math.sqrt(d2);
      const push = radius - d;
      x += (dx / d) * push;
      z += (dz / d) * push;
    }
    return { x, z };
  }

  _loop = () => {
    requestAnimationFrame(this._loop);
    let acc = Math.min(0.25, this.clock.getDelta());
    while (acc > 0) {
      const dt = Math.min(0.05, acc);
      this._step(dt);
      acc -= dt;
    }
    if (this.playing && !this.paused && !this.dialogOpen && !this.won) this._updateHud();
    this.composer.render();
  };

  _step(dt) {
    this.waterMat.uniforms.uTime.value = this.clock.elapsedTime;
    this._spinPickups(dt);

    if (!this.playing) {
      const t = this.clock.elapsedTime * 0.13;
      this.camera.position.set(Math.cos(t) * 78, 32, Math.sin(t) * 78);
      this.camera.lookAt(0, 10, 0);
      return;
    }

    if (this.input.takePause() && !this.dialogOpen && !this.won) {
      this.setPaused(!this.paused);
    }
    if (this.paused || this.dialogOpen || this.won) {
      if (this.dialogOpen && this.input.takeInteract()) this.advanceDialog();
      return;
    }

    this._updatePlayer(dt);
    this._updateEnemies(dt);
    this._updateInteract(dt);
    this._updateCamera(dt);
    this.sun.position.set(this.playerPos.x + 40, 62, this.playerPos.z + 24);
  }

  _spinPickups(dt) {
    const t = this.clock.elapsedTime;
    for (const obj of this.interactables) {
      if (!obj.visible) continue;
      if (obj.name.startsWith("FRAG_") || obj.name.startsWith("STAR_")) {
        obj.rotation.y += dt * 1.4;
        obj.position.y += Math.sin(t * 2 + obj.id) * 0.004;
      }
    }
    const ring0 = this.named.get("SPIRE_ring_0");
    const ring1 = this.named.get("SPIRE_ring_1");
    const ring2 = this.named.get("SPIRE_ring_2");
    if (ring0) ring0.rotation.y += dt * 0.4;
    if (ring1) ring1.rotation.y -= dt * 0.55;
    if (ring2) ring2.rotation.y += dt * 0.7;
  }

  _updatePlayer(dt) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    const axis = this.input.axis();
    const yaw = this.input.yaw;
    const sprintWanted = this.input.sprinting() && this.stamina > 4 && (axis.x || axis.z);
    const speed = sprintWanted ? 11.2 : 6.4;
    if (sprintWanted) this.stamina = Math.max(0, this.stamina - 22 * dt);
    else this.stamina = Math.min(100, this.stamina + 18 * dt);

    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    let vx = (axis.x * rx + axis.z * fx) * speed;
    let vz = (axis.x * rz + axis.z * fz) * speed;

    const moving = Math.hypot(axis.x, axis.z) > 0;
    if (moving) {
      this.bob += dt * (sprintWanted ? 12 : 8);
      this.stepTimer -= dt;
      if (this.onGround && this.stepTimer <= 0) {
        this.audio.play("step", { volume: 0.18, rate: 0.9 + Math.random() * 0.2 });
        this.stepTimer = sprintWanted ? 0.28 : 0.42;
      }
    }

    this.vy -= 22 * dt;
    if (this.onGround && this.input.jumping()) {
      this.vy = 8.4;
      this.onGround = false;
      this.audio.play("jump", { volume: 0.28 });
    }

    let x = this.playerPos.x + vx * dt;
    let y = this.playerPos.y + this.vy * dt;
    let z = this.playerPos.z + vz * dt;
    const resolved = this.resolveWalls(x, y, z);
    x = resolved.x;
    z = resolved.z;

    const gy = this.groundY(x, y, z);
    const water = this.meta.waterLevel ?? 0.18;
    if (gy != null) {
      if (y <= gy + 0.05) {
        y = gy;
        if (this.vy < 0) this.vy = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
    } else {
      this.onGround = false;
    }
    if (y < water - 0.15) {
      y = Math.max(y, water - 0.4);
      this.vy *= 0.4;
      this.stamina = Math.max(0, this.stamina - 8 * dt);
    }
    if (y < -6) {
      this.hurt(28);
      x = this.spawn.x;
      y = this.spawn.y;
      z = this.spawn.z;
    }

    this.playerPos.set(x, y, z);
    this.playerRig.position.set(x, y, z);
    this.playerRig.rotation.y = yaw;
    if (this.playerModel) {
      this.playerModel.rotation.z = moving ? Math.sin(this.bob) * 0.06 : 0;
    }

    if (this.input.takeAttack() && this.attackCd <= 0) {
      this.attackCd = 0.45;
      this._melee();
    }
  }

  _melee() {
    let hit = false;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.playerPos.x;
      const dz = e.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.6) continue;
      e.hp -= 1;
      const n = dist || 1;
      e.pos.x += (dx / n) * 1.6;
      e.pos.z += (dz / n) * 1.6;
      hit = true;
      if (e.hp <= 0) {
        e.alive = false;
        e.mesh.visible = false;
      }
    }
    this.audio.play(hit ? "hit" : "click", { volume: 0.35 });
  }

  _updateEnemies(dt) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.cooldown = Math.max(0, e.cooldown - dt);
      const dx = this.playerPos.x - e.pos.x;
      const dz = this.playerPos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      let dirx = 0;
      let dirz = 0;
      if (this.talked && dist < 14) {
        dirx = dx / (dist || 1);
        dirz = dz / (dist || 1);
      } else {
        e.wander += dt * 0.6;
        dirx = Math.cos(e.wander);
        dirz = Math.sin(e.wander);
        const hx = e.home.x - e.pos.x;
        const hz = e.home.z - e.pos.z;
        if (Math.hypot(hx, hz) > 11) {
          dirx = hx;
          dirz = hz;
          const n = Math.hypot(dirx, dirz) || 1;
          dirx /= n;
          dirz /= n;
        }
      }
      const spd = this.talked && dist < 14 ? 4.6 : 2.1;
      e.pos.x += dirx * spd * dt;
      e.pos.z += dirz * spd * dt;
      const gy = this.groundY(e.pos.x, e.pos.y, e.pos.z);
      e.pos.y = gy == null ? e.pos.y : gy;
      e.mesh.position.copy(e.pos);
      e.mesh.rotation.y = Math.atan2(dirx, dirz);
      if (dist < 1.35 && e.cooldown <= 0) {
        this.hurt(12);
        e.cooldown = 1.05;
      }
    }
  }

  hurt(n) {
    if (this.invuln > 0 || this.won) return;
    this.hp -= n;
    this.invuln = 0.85;
    this.audio.play("hurt", { volume: 0.45 });
    if (this.hp <= 0) {
      this.hp = 0;
      el("dead").classList.remove("hidden");
      this.paused = true;
      document.exitPointerLock?.();
    }
  }

  respawn() {
    this.hp = 100;
    this.stamina = 100;
    this.playerPos.copy(this.spawn);
    this.vy = 0;
    this.paused = false;
    el("dead").classList.add("hidden");
    this.canvas.requestPointerLock?.();
  }

  _updateInteract(dt) {
    let best = null;
    let bestScore = Infinity;
    for (const obj of this.interactables) {
      if (!obj.visible) continue;
      if (obj.name.startsWith("NPC_") && obj.name.includes("body")) continue;
      if (obj.name === "SPIRE_core") continue;
      obj.getWorldPosition(TMP);
      const dx = TMP.x - this.playerPos.x;
      const dz = TMP.z - this.playerPos.z;
      const dXZ = Math.hypot(dx, dz);
      if (obj.name.startsWith("STAR_") && dXZ < 1.6) {
        this._collectStar(obj);
        continue;
      }
      if (obj.name.startsWith("FRAG_") && this.talked && dXZ < 2.3 && Math.abs(TMP.y - this.playerPos.y) < 4) {
        this._use(obj);
        continue;
      }
      let prio = 4;
      if (obj.name.startsWith("FRAG_")) prio = 0;
      else if (obj.name.startsWith("CHEST_")) prio = 1;
      else if (obj.name.startsWith("NPC_")) prio = 2;
      else if (obj.name === "TERM_spire" && this.fragments.size >= 5) prio = 0;
      else if (obj.name.startsWith("TERM_")) prio = 5;
      const score = prio * 12 + dXZ;
      if (dXZ < 3.6 && score < bestScore) {
        best = obj;
        bestScore = score;
      }
    }
    const prompt = el("prompt");
    if (!best) {
      prompt.classList.add("hidden");
    } else {
      prompt.classList.remove("hidden");
      prompt.textContent = `[E] ${this._promptText(best)}`;
    }
    if (this.input.takeInteract() && best) this._use(best);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) el("toast").classList.remove("show");
    }
  }

  _promptText(obj) {
    if (obj.name.startsWith("NPC_")) return "与引导者对话";
    if (obj.name.startsWith("FRAG_")) return "拾取核心碎片";
    if (obj.name.startsWith("CHEST_")) return "打开补给箱";
    if (obj.name === "TERM_spire") {
      return this.fragments.size >= 5 ? "编译内核" : "读取编译之塔终端";
    }
    if (obj.name.startsWith("TERM_")) return "读取终端";
    return "交互";
  }

  _use(obj) {
    if (obj.name.startsWith("NPC_")) {
      this._openDialog(this.meta.mentor.name, this.meta.mentor.lines, () => {
        this.talked = true;
        this.toast("主线已激活：收集 5 枚核心");
      });
      return;
    }
    if (obj.name.startsWith("FRAG_")) {
      if (!this.talked) {
        this.toast("先去找引导者 BOOT");
        return;
      }
      const spec = this.meta.fragments.find((f) => f.object === obj.name);
      this.fragments.add(obj.name);
      obj.visible = false;
      this.audio.play("pickup");
      this.toast(spec ? `取得 ${spec.title}` : "取得核心");
      if (this.fragments.size >= 5) this.toast("回编译之塔，链接内核");
      return;
    }
    if (obj.name.startsWith("CHEST_")) {
      if (this.chests.has(obj.name)) return;
      this.chests.add(obj.name);
      this.hp = Math.min(100, this.hp + 40);
      obj.visible = false;
      this.audio.play("pickup", { rate: 0.8 });
      this.toast("补给已注入 +40 HP");
      return;
    }
    if (obj.name === "TERM_spire" && this.fragments.size >= 5) {
      this._win();
      return;
    }
    if (obj.name.startsWith("TERM_")) {
      const text = this.meta.terminals[obj.name] || "终端静默。";
      this._openDialog("TERMINAL", [text]);
    }
  }

  _collectStar(obj) {
    if (this.stars.has(obj.name)) return;
    this.stars.add(obj.name);
    obj.visible = false;
    this.audio.play("pickup", { volume: 0.4, rate: 1.4 });
  }

  _openDialog(name, lines, onDone) {
    this.dialogOpen = true;
    this.dialogQueue = [...lines];
    this.dialogDone = onDone;
    el("dialogName").textContent = name;
    el("dialogText").textContent = this.dialogQueue.shift() || "";
    el("dialog").classList.remove("hidden");
    document.exitPointerLock?.();
    this.audio.play("talk");
  }

  advanceDialog() {
    this.audio.play("talk", { volume: 0.4 });
    if (this.dialogQueue.length) {
      el("dialogText").textContent = this.dialogQueue.shift();
      return;
    }
    el("dialog").classList.add("hidden");
    this.dialogOpen = false;
    this.dialogDone?.();
    this.dialogDone = null;
    this.canvas.requestPointerLock?.();
  }

  _win() {
    this.won = true;
    this.audio.play("compile");
    setTimeout(() => this.audio.play("win", { volume: 0.7 }), 400);
    el("winStats").textContent = `核心 ${this.fragments.size}/5 · 提交 ${this.stars.size}/15 · 剩余生命 ${Math.ceil(this.hp)}`;
    el("win").classList.remove("hidden");
    el("hud").classList.add("hidden");
    document.exitPointerLock?.();
  }

  _updateCamera(dt, snap = false) {
    const dist = 6.35;
    const height = 2.15;
    const yaw = this.input.yaw;
    const pitch = this.input.pitch;
    const ox = Math.sin(yaw) * Math.cos(pitch) * dist;
    const oy = Math.sin(pitch) * dist + height;
    const oz = Math.cos(yaw) * Math.cos(pitch) * dist;
    const ideal = TMP.set(this.playerPos.x + ox, this.playerPos.y + oy, this.playerPos.z + oz);
    if (snap) this.camera.position.copy(ideal);
    else this.camera.position.lerp(ideal, 1 - Math.exp(-dt * 10));
    const look = TMP2.set(this.playerPos.x, this.playerPos.y + 1.35, this.playerPos.z);
    this.camera.lookAt(look);
  }

  _updateHud() {
    el("hpbar").style.width = `${this.hp}%`;
    el("stbar").style.width = `${this.stamina}%`;
    el("cores").textContent = `核心 ${this.fragments.size}/5 · 提交 ${this.stars.size}/15`;
    let q = "与引导者对话，启动引导程序。";
    if (this.talked && this.fragments.size < 5) {
      const missing = this.meta.fragments.filter((f) => !this.fragments.has(f.object));
      q = `收集核心 ${this.fragments.size}/5。${missing[0]?.hint || ""}`;
    } else if (this.talked) q = "五枚核心已齐。回编译之塔终端，执行链接。";
    el("quest").textContent = q;
    this._drawMinimap();
  }

  _drawMinimap() {
    const c = el("minimap");
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#071018";
    ctx.fillRect(0, 0, w, h);
    const R = 90;
    const map = (x, z) => [w * 0.5 + (x / R) * 74, h * 0.5 + (z / R) * 74];
    ctx.strokeStyle = "#1d4a58";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 74, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#4df0ff";
    for (const site of Object.values(this.meta.sites)) {
      const [mx, mz] = map(site.x, site.z);
      ctx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    ctx.fillStyle = "#ffb14a";
    for (const f of this.meta.fragments) {
      if (this.fragments.has(f.object)) continue;
      const obj = this.named.get(f.object);
      if (!obj || !obj.visible) continue;
      obj.getWorldPosition(TMP);
      const [mx, mz] = map(TMP.x, TMP.z);
      ctx.beginPath();
      ctx.arc(mx, mz, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const [px, pz] = map(this.playerPos.x, this.playerPos.z);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(px, pz, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#4df0ff";
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.lineTo(px + Math.sin(this.input.yaw) * 10, pz + Math.cos(this.input.yaw) * 10);
    ctx.stroke();
  }
}

