import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Player } from "./player.js";
import { createAudio } from "./audio.js";

const FRAG_META = {
  frag_ui: "CSS 棱晶",
  frag_api: "SQL 内核",
  frag_gfx: "GLSL 花蕾",
  frag_eng: "引擎齿轮",
  frag_sh: "Root Shell",
  frag_pkg: "package 图腾",
};

function $(id) {
  return document.getElementById(id);
}

function tintMaterial(mesh, hex) {
  mesh.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    child.material = mats.map((m) => {
      const c = m.clone();
      if (child.name.includes("_h") || child.name.includes("hair")) return c;
      if (c.color) c.color = new THREE.Color(hex);
      return c;
    });
    if (child.material.length === 1) child.material = child.material[0];
  });
}

export class Game {
  constructor() {
    this.world = null;
    this.player = null;
    this.audio = null;
    this.clock = new THREE.Clock();
    this.interactables = [];
    this.npcs = [];
    this.state = {
      fragments: new Set(),
      commits: 0,
      coffees: 0,
      talked: false,
      restored: false,
      dialogue: null,
      line: 0,
    };
    this.markerGroup = new THREE.Group();
  }

  async load() {
    const res = await fetch("/assets/world.json");
    this.world = await res.json();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8ec8e4, 55, 175);
    this.camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.08, 400);
    this.renderer = new THREE.WebGLRenderer({
      canvas: $("view"),
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;

    this.setupSky();
    const loader = new GLTFLoader();
    const [worldGltf, kitGltf] = await Promise.all([
      loader.loadAsync("/assets/world.glb"),
      loader.loadAsync("/assets/kit.glb"),
    ]);
    this.scene.add(worldGltf.scene);
    worldGltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (m.map) m.colorSpace = THREE.SRGBColorSpace;
            if (m.emissive && m.emissiveIntensity < 0.2 && m.emissive.getHex() !== 0) {
              m.emissiveIntensity = 1.4;
            }
          }
        }
      }
    });

    this.kit = {};
    kitGltf.scene.traverse((obj) => {
      if (obj.name.startsWith("kit_") || obj.name.startsWith("npc_")) {
        this.kit[obj.name.replace(/^kit_/, "")] = obj;
      }
    });
    // Also index by exact names
    kitGltf.scene.traverse((obj) => {
      if (obj.isMesh || obj.type === "Group" || obj.type === "Object3D") {
        if (obj.name) this.kit[obj.name] = obj;
      }
    });

    this.placeInstances(kitGltf.scene);
    this.spawnMarkers();
    this.spawnNpcs(kitGltf.scene);

    this.player = new Player(this.camera, this.world);
    this.player.bind($("view"));
    this.buildQuestList();
    this.bindUi();
    window.addEventListener("resize", () => this.onResize());
    window.bytehaven = this;
    this.playing = false;
    this.camera.position.set(22, 14, 28);
    this.camera.lookAt(0, 1.6, 0);
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
    $("loader").classList.add("hidden");
  }

  setupSky() {
    this.scene.background = new THREE.Color(0x8ec8e4);
    this.scene.fog = new THREE.Fog(0x8ec8e4, 55, 175);
    this.scene.add(new THREE.HemisphereLight(0xb7e0ff, 0x3d4a32, 1.05));
    const dir = new THREE.DirectionalLight(0xfff1d0, 1.15);
    dir.position.set(-40, 60, 20);
    this.scene.add(dir);
    this.scene.add(new THREE.AmbientLight(0x88a0b8, 0.35));
  }

  findKit(scene, names) {
    for (const n of names) {
      const found = scene.getObjectByName(n);
      if (found) return found;
    }
    return null;
  }

    placeInstances(kitScene) {
      const templates = {};
      kitScene.traverse((o) => {
        if (o.name) templates[o.name] = o;
      });
      const alias = {
        tree_a: ["kit_tree_a"],
        tree_b: ["kit_tree_b", "kit_tree_b.001"],
        lamp: ["kit_lamp", "kit_lamp.001"],
        bench: ["kit_bench", "kit_bench.001"],
        crate: ["crate", "crate.001"],
        rock: ["rock", "rock.001"],
        terminal: ["kit_terminal", "kit_terminal.001"],
        rack: ["kit_rack", "kit_rack.001"],
        flower: ["kit_flower", "kit_flower.001"],
        sign: ["kit_sign", "kit_sign.001"],
      };
      const group = new THREE.Group();
      group.name = "instances";
      let placed = 0;
      for (const inst of this.world.instances) {
        const keys = alias[inst.kit] || [inst.kit, `kit_${inst.kit}`];
        let src = null;
        for (const k of keys) {
          src = templates[k];
          if (src) break;
          const fuzzy = Object.keys(templates).find((n) => n.startsWith(k));
          if (fuzzy) {
            src = templates[fuzzy];
            break;
          }
        }
        if (!src) continue;
        const clone = src.clone(true);
        clone.visible = true;
        clone.position.set(...inst.pos);
        clone.rotation.y = inst.rotY || 0;
        clone.scale.setScalar(inst.scale || 1);
        group.add(clone);
        placed += 1;
      }
      this.scene.add(group);
      console.info("placed kit instances", placed, "/", this.world.instances.length);
    }

  spawnMarkers() {
    for (const item of this.world.interactables) {
      const mesh = this.markerMesh(item);
      mesh.position.set(item.pos[0], item.pos[1], item.pos[2]);
      mesh.userData.item = item;
      this.markerGroup.add(mesh);
      this.interactables.push({ data: item, mesh });
    }
    this.scene.add(this.markerGroup);
  }

  markerMesh(item) {
    const g =
      item.kind === "fragment"
        ? new THREE.OctahedronGeometry(0.55, 0)
        : item.kind === "coffee"
          ? new THREE.CylinderGeometry(0.12, 0.14, 0.22, 10)
          : item.kind === "commit"
            ? new THREE.IcosahedronGeometry(0.18, 0)
            : new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const colors = {
      fragment: 0x5ce8ff,
      coffee: 0xc58b5a,
      commit: 0xffd45a,
      terminal: 0x5dff88,
    };
    const mat = new THREE.MeshStandardMaterial({
      color: colors[item.kind] || 0xffffff,
      emissive: colors[item.kind] || 0xffffff,
      emissiveIntensity: item.kind === "fragment" ? 2.4 : 0.9,
      roughness: 0.25,
      metalness: 0.2,
    });
    const m = new THREE.Mesh(g, mat);
    return m;
  }

  spawnNpcs(kitScene) {
    const kernelSrc = kitScene.getObjectByName("npc_kernel");
    const genericSrc = kitScene.getObjectByName("npc_generic");
    for (const npc of this.world.npcs) {
      const src = npc.id === "kernel" ? kernelSrc || genericSrc : genericSrc || kernelSrc;
      let obj;
      if (src) {
        obj = src.clone(true);
      } else {
        const geo = new THREE.CapsuleGeometry(0.28, 1.1, 4, 8);
        obj = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({ color: npc.color, roughness: 0.5 }),
        );
      }
      obj.position.set(npc.pos[0], npc.pos[1], npc.pos[2]);
      obj.userData.npc = npc;
      this.scene.add(obj);
      this.npcs.push({ data: npc, mesh: obj });
    }
  }

  bindUi() {
    $("start-btn").addEventListener("click", () => this.start());
    window.addEventListener("keydown", (e) => {
      if (!this.playing && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        this.start();
      }
    });
    $("again-btn").addEventListener("click", () => {
      $("win-screen").classList.add("hidden");
      $("view").requestPointerLock();
    });
    $("help-close").addEventListener("click", () => $("help").classList.add("hidden"));
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyH") $("help").classList.toggle("hidden");
      if (e.code === "KeyE") this.interact();
    });
    $("dialogue").addEventListener("click", () => this.advanceDialogue());
  }

  start() {
    $("title-screen").classList.add("hidden");
    $("hud").classList.remove("hidden");
    this.playing = true;
    this.audio = createAudio();
    this.audio.resume();
    this.audio.ambient();
  }

  buildQuestList() {
    const ul = $("fragment-list");
    ul.innerHTML = "";
    for (const id of this.world.quests.main.fragments) {
      const li = document.createElement("li");
      li.dataset.id = id;
      li.innerHTML = `<span>${FRAG_META[id] || id}</span><span>○</span>`;
      ul.appendChild(li);
    }
  }

  toast(text) {
    $("toast").textContent = text;
    clearTimeout(this._toast);
    this._toast = setTimeout(() => {
      $("toast").textContent = "";
    }, 2400);
  }

  nearest(range = 2.6) {
    const p = this.player.pos;
    let best = null;
    let bestD = range;
    for (const it of this.interactables) {
      if (it.taken) continue;
      const d = it.mesh.position.distanceTo(p);
      if (d < bestD) {
        bestD = d;
        best = { kind: "item", ...it, dist: d };
      }
    }
    for (const n of this.npcs) {
      const d = n.mesh.position.distanceTo(new THREE.Vector3(p.x, n.mesh.position.y, p.z));
      if (d < bestD) {
        bestD = d;
        best = { kind: "npc", ...n, dist: d };
      }
    }
    return best;
  }

  interact() {
    if (this.state.dialogue) {
      this.advanceDialogue();
      return;
    }
    const n = this.nearest();
    if (!n) return;
    if (n.kind === "npc") this.openDialogue(n.data);
    else this.take(n);
  }

  openDialogue(npc) {
    this.state.dialogue = npc;
    this.state.line = 0;
    $("dialogue").classList.remove("hidden");
    $("npc-name").textContent = npc.name;
    $("npc-title").textContent = npc.title;
    $("npc-line").textContent = npc.lines[0];
    this.state.talked = true;
    this.audio?.talk();
    document.exitPointerLock();
  }

  advanceDialogue() {
    const npc = this.state.dialogue;
    if (!npc) return;
    this.state.line += 1;
    if (this.state.line >= npc.lines.length) {
      this.state.dialogue = null;
      $("dialogue").classList.add("hidden");
      $("view").requestPointerLock();
      return;
    }
    $("npc-line").textContent = npc.lines[this.state.line];
    this.audio?.talk();
  }

  take(entry) {
    const item = entry.data;
    if (item.kind === "terminal") {
      this.openDialogue({
        name: "TERMINAL",
        title: item.label,
        lines: item.lines || ["> ok"],
      });
      return;
    }
    if (item.kind === "fragment") {
      this.state.fragments.add(item.id);
      this.toast(`取得 ${item.label}`);
      this.audio?.pickup();
      this.refreshFragments();
      this.maybeRestore();
    } else if (item.kind === "commit") {
      this.state.commits += 1;
      $("commit-count").textContent = this.state.commits;
      this.toast("一次提交已记录");
      this.audio?.pickup();
    } else if (item.kind === "coffee") {
      this.state.coffees += 1;
      this.player.stamina = 1;
      $("coffee-count").textContent = this.state.coffees;
      this.toast("体力回满");
      this.audio?.pickup();
    }
    entry.taken = true;
    entry.mesh.visible = false;
  }

  refreshFragments() {
    for (const li of $("fragment-list").children) {
      const got = this.state.fragments.has(li.dataset.id);
      li.classList.toggle("got", got);
      li.lastElementChild.textContent = got ? "●" : "○";
    }
  }

  maybeRestore() {
    const need = this.world.quests.main.fragments;
    if (need.every((id) => this.state.fragments.has(id)) && !this.state.restored) {
      const p = this.player.pos;
      const fountain = new THREE.Vector3(0, p.y, 0);
      if (p.distanceTo(fountain) < 8) this.restore();
      else if (!this._returnHint) {
        this._returnHint = true;
        this.toast("碎片齐了。带回编译广场喷泉。");
      }
    }
  }

  restore() {
    this.state.restored = true;
    this.state.dialogue = null;
    $("dialogue").classList.add("hidden");
    this.audio?.win();
    $("win-stats").textContent = `提交 ${this.state.commits} · 咖啡 ${this.state.coffees}`;
    $("win-screen").classList.remove("hidden");
    document.exitPointerLock();
  }

  currentDistrict() {
    const x = this.player.pos.x;
    const z = this.player.pos.z;
    let best = this.world.districts[0];
    let bestD = Infinity;
    for (const d of this.world.districts) {
      const dx = x - d.center[0];
      const dz = z - d.center[1];
      const dist = Math.hypot(dx, dz);
      if (dist < d.radius + 6 && dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    return best;
  }

  drawMinimap() {
    const c = $("minimap");
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    ctx.fillStyle = "#07141c";
    ctx.fillRect(0, 0, w, h);
    const scale = 180 / 200;
    const to = (x, z) => [w / 2 + x * scale, h / 2 + z * scale];
    for (const d of this.world.districts) {
      const [mx, mz] = to(d.center[0], d.center[1]);
      ctx.beginPath();
      ctx.arc(mx, mz, d.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = d.color + "55";
      ctx.fill();
      ctx.fillStyle = "#dfefff";
      ctx.font = "9px sans-serif";
      ctx.fillText(d.name, mx - 16, mz);
    }
    for (const it of this.interactables) {
      if (it.taken || it.data.kind !== "fragment") continue;
      const [mx, mz] = to(it.data.pos[0], it.data.pos[2]);
      ctx.fillStyle = "#5ce8ff";
      ctx.fillRect(mx - 2, mz - 2, 4, 4);
    }
    const [px, pz] = to(this.player.pos.x, this.player.pos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-this.player.yaw);
    ctx.fillStyle = "#ffd45a";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (!this.playing) {
      this.camera.position.set(Math.cos(t * 0.12) * 28, 13, Math.sin(t * 0.12) * 28);
      this.camera.lookAt(0, 1.8, 0);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (!this.state.dialogue) {
      const info = this.player.update(dt);
      if (info.moving && info.onGround) this.audio?.step(dt, info.sprint);
    }
    $("stamina").style.width = `${Math.round(this.player.stamina * 100)}%`;
    const d = this.currentDistrict();
    $("district-chip").textContent = d?.name || "源码港";
    const n = this.nearest();
    if (n && !this.state.dialogue) {
      $("prompt").classList.remove("hidden");
      const label = n.kind === "npc" ? `与 ${n.data.name} 交谈` : `拾取 ${n.data.label}`;
      $("prompt").textContent = `E  ${label}`;
    } else {
      $("prompt").classList.add("hidden");
    }
    this.maybeRestore();
    for (const it of this.interactables) {
      if (it.taken) continue;
      it.mesh.rotation.y += dt * (it.data.kind === "fragment" ? 1.4 : 0.8);
      it.mesh.position.y = it.data.pos[1] + Math.sin(t * 2 + it.mesh.id) * 0.12;
    }
    for (const n of this.npcs) {
      const dx = this.player.pos.x - n.mesh.position.x;
      const dz = this.player.pos.z - n.mesh.position.z;
      n.mesh.rotation.y = Math.atan2(dx, dz);
    }
    this.drawMinimap();
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}
