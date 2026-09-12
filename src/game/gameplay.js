import * as THREE from "three";

const NEED = { commits: 6, compile: 3, bake: 2, qa: 10 };

export class Gameplay {
  constructor({ meta, player, world, bugs, ui, audio, scene }) {
    this.meta = meta;
    this.player = player;
    this.world = world;
    this.bugs = bugs;
    this.ui = ui;
    this.audio = audio;
    this.scene = scene;
    this.mission = 0;
    this.talked = new Set();
    this.commits = new Set();
    this.done = new Set();
    this.busy = null;
    this.dialogue = null;
    this.paused = false;
    this.won = false;
    this.focus = 5;
    this.maxFocus = 5;
    this.hurtCd = 0;
    this.startedAt = performance.now();
    this.shots = 0;
    this.laser = makeLaser();
    scene.add(this.laser);
    this.missions = meta.missions;
    this.refreshHud();
    this.ui.log("夜班开始。去广场找 Mira 拿简报。");
  }

  get blocked() {
    return Boolean(this.dialogue || this.busy || this.paused || this.won);
  }

  refreshHud() {
    const m = this.missions[this.mission];
    let detail = m.detail;
    if (m.id === "commits") detail = `已收集 ${this.commits.size}/${NEED.commits}`;
    if (m.id === "compile") detail = `终端 ${compileCount(this)}/${NEED.compile}`;
    if (m.id === "bake") detail = `烘焙 ${bakeCount(this)}/${NEED.bake}`;
    if (m.id === "qa") detail = `剩余 ${this.bugs.aliveCount} 只`;
    this.ui.setQuest(m.title, detail);
    this.ui.setFocus(this.focus, this.maxFocus);
    this.ui.setCounts(this.commits.size, NEED.commits, NEED.qa - this.bugs.aliveCount, NEED.qa);
  }

  nearest(list, max = 2.4) {
    const p = this.player.position;
    let best = null;
    let bestD = max;
    for (const item of list) {
      const [x, , z] = item.position;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        best = item;
        bestD = d;
      }
    }
    return best;
  }

  update(dt, t) {
    if (this.won || this.paused) return;
    if (this.hurtCd > 0) this.hurtCd -= dt;
    this.world.pulseCollects(t);
    this.bugs.update(dt, t, this.player.position);
    this.updateLaser(dt);

    if (this.busy) {
      this.busy.t += dt;
      const p = Math.min(1, this.busy.t / this.busy.dur);
      this.ui.setBusy(true, this.busy.label, p);
      if (p >= 1) this.finishBusy();
    }

    for (const bug of this.bugs.bugs) {
      if (bug.alive && bug.near && this.hurtCd <= 0 && !this.blocked) this.hitPlayer();
    }

    this.tryCollect();
    this.tryDuck();
    if (this.mission === 4 && this.bugs.aliveCount <= 0) {
      this.mission = 5;
      this.ui.log("压测通过。去发版码头点火。");
    }
    this.prompt();
    this.refreshHud();
    this.ui.drawMap(this.player, this.meta, this.bugs.bugs);
  }

  prompt() {
    if (this.dialogue) {
      this.ui.setPrompt("");
      return;
    }
    if (this.busy) {
      this.ui.setPrompt("");
      return;
    }
    const npc = this.nearest(this.meta.npcs, 2.3);
    if (npc) {
      this.ui.setPrompt(`E  与 ${npc.name}（${npc.role}）交谈`);
      return;
    }
    const inter = this.nearest(this.meta.interacts, 2.1);
    if (inter) {
      this.ui.setPrompt(`E  ${inter.label}`);
      return;
    }
    this.ui.setPrompt("");
  }

  interact() {
    if (this.won || this.paused) return;
    if (this.dialogue) {
      this.advanceDialogue();
      return;
    }
    if (this.busy) return;
    const npc = this.nearest(this.meta.npcs, 2.3);
    if (npc) {
      this.startDialogue(npc);
      return;
    }
    const inter = this.nearest(this.meta.interacts, 2.1);
    if (inter) this.use(inter);
  }

  startDialogue(npc) {
    const lines = npc.lines;
    this.dialogue = { npc, i: 0 };
    this.talked.add(npc.id);
    this.ui.showDialogue(`${npc.role} · ${npc.name}`, lines[0]);
    this.audio.ui();
    if (npc.id === "producer" && this.mission === 0) {
      this.mission = 1;
      this.ui.log("任务更新：收集至少 6 枚 Commit 晶体。");
    }
  }

  advanceDialogue() {
    const { npc, i } = this.dialogue;
    const next = i + 1;
    if (next >= npc.lines.length) {
      this.dialogue = null;
      this.ui.hideDialogue();
      return;
    }
    this.dialogue.i = next;
    this.ui.showDialogue(`${npc.role} · ${npc.name}`, npc.lines[next]);
    this.audio.ui();
  }

  use(inter) {
    if (inter.kind === "compile") {
      if (this.mission < 2) {
        this.ui.log("先把 Commit 晶体交齐，Ken 才会开编译锁。");
        return;
      }
      if (this.done.has(inter.id)) {
        this.ui.log("这台终端已经是绿的。");
        return;
      }
      this.busy = { id: inter.id, kind: "compile", label: inter.label, t: 0, dur: 2.3 };
      this.audio.ok();
      return;
    }
    if (inter.kind === "bake") {
      if (this.mission < 3) {
        this.ui.log("引擎还没编完，烘焙会烤在旧着色器上。");
        return;
      }
      if (this.done.has(inter.id)) {
        this.ui.log("这座已经 bake 过了。");
        return;
      }
      this.busy = { id: inter.id, kind: "bake", label: inter.label, t: 0, dur: 2.0 };
      this.audio.ok();
      return;
    }
    if (inter.kind === "launch") {
      if (this.mission < 5) {
        this.ui.log("QA 没放行。Rex 说崩溃不准上飞船。");
        return;
      }
      this.launch();
    }
  }

  finishBusy() {
    this.done.add(this.busy.id);
    this.ui.setBusy(false);
    this.ui.log(`${this.busy.label} 完成。`);
    this.audio.ok();
    this.busy = null;
    if (this.mission === 2 && compileCount(this) >= NEED.compile) {
      this.mission = 3;
      this.ui.log("编译门全绿。去美术馆烘焙。");
    }
    if (this.mission === 3 && bakeCount(this) >= NEED.bake) {
      this.mission = 4;
      this.ui.log("材质已锁定。去 QA 竞技场 squash bug。");
    }
  }

  tryCollect() {
    const p = this.player.position;
    for (const item of this.meta.collects) {
      if (this.commits.has(item.id)) continue;
      const [x, y, z] = item.position;
      if (Math.hypot(p.x - x, p.z - z) > 1.35) continue;
      this.commits.add(item.id);
      const mesh = this.world.collectMeshes.get(item.id);
      if (mesh) mesh.visible = false;
      this.audio.pickup();
      this.ui.log(`收入 Commit ${item.id}（${this.commits.size}/${NEED.commits}）`);
      if (this.mission === 1 && this.commits.size >= NEED.commits) {
        this.mission = 2;
        this.ui.log("版本树接上了。去引擎馆跑三台终端。");
      }
    }
  }

  tryDuck() {
    if (this.done.has("DUCK")) return;
    const duck = this.meta.secrets?.[0];
    if (!duck) return;
    const [x, , z] = duck.position;
    const p = this.player.position;
    if (Math.hypot(p.x - x, p.z - z) > 1.6) return;
    this.done.add("DUCK");
    this.ui.log("你找到了橡胶鸭。调试器伤害已加倍。");
    this.audio.ok();
    const mesh = this.world.named.get(duck.object);
    if (mesh) mesh.visible = false;
  }

  shoot() {
    if (this.blocked) return;
    this.shots += 1;
    this.audio.laser();
    const origin = this.player.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.camera.quaternion);
    this.showLaser(origin, dir);
    const bug = this.bugs.hitscan(origin, dir);
    if (!bug) return;
    const dmg = this.done.has("DUCK") ? 2 : 1;
    const dead = this.bugs.hurt(bug, dmg);
    if (!dead) {
      this.ui.log(`Bug #${bug.id + 1} 还在跳栈`);
      return;
    }
    this.audio.squash();
    this.ui.log(`squash #${bug.id + 1} · 剩余 ${this.bugs.aliveCount}`);
  }

  showLaser(origin, dir) {
    const end = origin.clone().add(dir.clone().setLength(16));
    const pos = this.laser.geometry.attributes.position;
    pos.setXYZ(0, origin.x, origin.y - 0.1, origin.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    this.laser.visible = true;
    this.laser.userData.life = 0.08;
  }

  updateLaser(dt) {
    if (!this.laser.visible) return;
    this.laser.userData.life -= dt;
    if (this.laser.userData.life <= 0) this.laser.visible = false;
  }

  hitPlayer() {
    this.focus -= 1;
    this.hurtCd = 1.05;
    this.audio.hurt();
    this.ui.log("Bug 咬了一口。专注下降。");
    if (this.focus <= 0) {
      this.focus = 3;
      const qa = this.meta.zones.qa.center;
      this.player.position.set(qa[0], this.player.eye, qa[2] - 12);
      this.ui.log("专注归零，从 QA 入口重整。");
    }
    this.ui.setFocus(this.focus, this.maxFocus);
  }

  launch() {
    this.won = true;
    this.player.enabled = false;
    document.exitPointerLock?.();
    this.audio.win();
    const minutes = ((performance.now() - this.startedAt) / 60000).toFixed(1);
    const duck = this.done.has("DUCK") ? "橡胶鸭已随机构建。" : "橡胶鸭还在灌木里。";
    this.ui.showWin(`值班 ${minutes} 分钟 · 射击 ${this.shots} 次 · Commit ${this.commits.size} · ${duck}`);
    this.ui.log("v1.0 SHIPPED.");
  }
}

function compileCount(g) {
  return ["ENGINE_1", "ENGINE_2", "ENGINE_3"].filter((id) => g.done.has(id)).length;
}

function bakeCount(g) {
  return ["ART_1", "ART_2"].filter((id) => g.done.has(id)).length;
}

function makeLaser() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x66f7ff, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  line.frustumCulled = false;
  return line;
}
