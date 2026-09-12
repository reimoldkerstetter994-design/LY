import * as THREE from "three";
import { UI } from "./ui.js";
import { AudioBed } from "./audio.js";
import { Input } from "./input.js";
import { Player, movePlayer } from "./player.js";
import { loadWorld, makeSky, createWater } from "./world.js";
import {
  QuestLog,
  spawnBugs,
  spawnNpcs,
  spawnTokenMeshes,
  updateBugs,
  updateTokens,
  lockedToken,
} from "./quests.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ui = new UI();
    this.audio = new AudioBed();
    this.input = new Input();
    this.running = false;
    this.paused = false;
    this.clock = new THREE.Clock();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    makeSky(this.scene);
    this.quest = new QuestLog();
    this.interact = null;
    this.stepAcc = 0;
    this.titleCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 250);
    this._ready = this._boot();
    this.resize();
    const startBtn = document.getElementById("start");
    startBtn.disabled = true;
    startBtn.textContent = "正在编译世界…";
    this._ready.then(() => {
      startBtn.disabled = false;
      startBtn.textContent = "进入世界";
    }).catch((err) => {
      startBtn.textContent = "加载失败";
      console.error(err);
    });
  }

  async _boot() {
    const { world, terrain } = await loadWorld(this.scene);
    this.world = world;
    this.terrain = terrain;
    this.colliders = world.colliders || [];
    createWater(this.scene, world.waterLevel ?? 0.45);
    this.player = new Player(world.spawn, world.player);
    this.player._spawn = { ...world.spawn };
    this.flashLight = new THREE.PointLight(0xc6f6ff, 0, 14, 2);
    this.player.camera.add(this.flashLight);
    this.scene.add(this.player.camera);
    const bugz = world.interactables.find((m) => m.kind === "bugzone");
    this.bugs = bugz
      ? spawnBugs(
          this.scene,
          new THREE.Vector3(bugz.pos[0], bugz.pos[1], bugz.pos[2]),
          bugz.count || 7
        )
      : [];
    spawnNpcs(this.scene, world.interactables);
    this.tokenMeshes = spawnTokenMeshes(this.scene, world.interactables, this.quest);
    this.ui.setTokens(this.quest.tokens);
    this._syncQuest();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  async start() {
    await this._ready;
    this.audio.resume();
    this.running = true;
    this.paused = false;
    this.ui.showHud();
    this.clock.getDelta();
    this._tryLock();
  }

  resume() {
    this.paused = false;
    this.ui.showPause(false);
    this.clock.getDelta();
    this._tryLock();
  }

  restart() {
    location.reload();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    if (this.player) {
      this.player.camera.aspect = w / h;
      this.player.camera.updateProjectionMatrix();
    }
    if (this.titleCam) {
      this.titleCam.aspect = w / h;
      this.titleCam.updateProjectionMatrix();
    }
  }

  onKey(e, down) {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
    this.input.setKey(e.code, down);
    if (!down) return;
    if (e.code === "Escape") {
      if (this.running && !this.quest.compiled) {
        this.paused = !this.paused;
        this.ui.showPause(this.paused);
        if (this.paused && document.pointerLockElement) document.exitPointerLock();
      }
    }
    if (e.code === "KeyE") this._interact();
    if (e.code === "KeyF") this.player && (this.player.flash = !this.player.flash);
    if (e.code === "Tab") {
      e.preventDefault();
      this.ui.log(this.quest.current().body);
    }
  }

  onPointerDown(e) {
    if (!this.running || this.paused) return;
    if (e.button === 0) this._tryLock();
    this.input.dragging = true;
  }

  onPointerUp() {
    this.input.dragging = false;
  }

  onPointerMove(e) {
    if (!this.running || this.paused) return;
    const locked = document.pointerLockElement === this.canvas;
    if (locked || this.input.dragging) {
      this.player?.applyLook(e.movementX, e.movementY);
    }
  }

  _tryLock() {
    this.canvas.requestPointerLock?.().catch(() => {});
  }

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.player) return;
    if (!this.running) {
      const t = performance.now() * 0.00015;
      this.titleCam.position.set(Math.cos(t) * 46, 20, Math.sin(t) * 46);
      this.titleCam.lookAt(0, 2.2, 0);
      this.renderer.render(this.scene, this.titleCam);
      return;
    }
    if (this.paused) {
      this.renderer.render(this.scene, this.player.camera);
      return;
    }
    if (!this.quest.compiled) {
      movePlayer(
        this.player,
        this.input,
        this.colliders,
        this.terrain,
        dt,
        this.world.waterLevel ?? 0.45
      );
      updateBugs(this.bugs, dt, this.player, () => {
        this.quest.bugsSquashed += 1;
        this.audio.zap();
        this.ui.log(`调试空指针 ${this.quest.bugsSquashed}/${this.quest.bugsNeeded}`);
        if (this.quest.bugsSquashed >= this.quest.bugsNeeded) {
          this.ui.log("沼泽清净了。调试令牌已解锁。");
        }
        this._syncQuest();
      });
      updateTokens(this.tokenMeshes, this.quest, dt);
      this._scanInteract();
      if (this.player.onGround && (this.input.axis().x || this.input.axis().z)) {
        this.stepAcc += dt;
        if (this.stepAcc > 0.42) {
          this.stepAcc = 0;
          this.audio.step();
        }
      }
    }
    if (this.flashLight) this.flashLight.intensity = this.player.flash ? 2.6 : 0;
    this.player.updateCamera();
    this.ui.drawMinimap(this.player.pos, this.world?.districts || [], this.player.yaw);
    this.renderer.render(this.scene, this.player.camera);
  }

  _scanInteract() {
    let best = null;
    let bestD = 2.6;
    const p = this.player.pos;
    for (const mark of this.world.interactables) {
      const d = Math.hypot(p.x - mark.pos[0], p.z - mark.pos[2]);
      const rad = mark.radius ?? 2;
      if (d < Math.min(bestD, rad)) {
        best = mark;
        bestD = d;
      }
    }
    this.interact = best;
    this.ui.setPrompt(best ? `按 E  ${best.title || best.id}` : "");
  }

  _interact() {
    const mark = this.interact;
    if (!mark) return;
    if (mark.kind === "npc" && mark.id === "ada") {
      this.quest.talkedAda = true;
      this.ui.log("艾达：内核在发布窗口里熄灭了。五枚令牌，一座尖塔。");
      this.audio.pickup();
    } else if (mark.kind === "npc" && mark.id === "curl") {
      this.ui.log("Curl：信标全亮，港湾才会把接口令牌交出来。");
    } else if (mark.kind === "note") {
      this.quest.readReadme = true;
      this.ui.log(mark.body || "一块 README。");
    } else if (mark.kind === "beacon") {
      this.quest.beacons[mark.index] = true;
      this.ui.log(`信标 ${mark.index + 1} 已点亮`);
      this.audio.tone(520, 0.2, "square", 0.2);
    } else if (mark.kind === "console") {
      this.quest.consoles[mark.index] = true;
      this.ui.log(`流水线 ${String.fromCharCode(65 + mark.index)} 变绿`);
      this.audio.tone(480, 0.18, "square", 0.2);
    } else if (mark.kind === "token") {
      if (lockedToken(mark, this.quest)) {
        this.ui.log("还没满足条件。");
      } else if (this.quest.grant(mark.token)) {
        this.audio.pickup();
        this.ui.log(`获得 ${mark.title}`);
        this.ui.setTokens(this.quest.tokens);
      }
    } else if (mark.kind === "compile") {
      if (!this.quest.allTokens()) {
        this.ui.log(`令牌不足（${this.quest.tokenCount}/5）`);
      } else {
        this.quest.compiled = true;
        this.audio.compile();
        this.scene.fog.color.set(0x6ad8c8);
        this.scene.background.set(0x6ad8c8);
        this.ui.showWin("五枚令牌归位。源码岛在黄昏里重新亮起，构建成功。");
      }
    }
    this._syncQuest();
  }

  _syncQuest() {
    const q = this.quest.current();
    this.ui.setQuest(q.title, q.body);
  }
}
