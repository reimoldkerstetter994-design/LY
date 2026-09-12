import * as THREE from "three";

export class QuestLog {
  constructor() {
    this.talkedAda = false;
    this.tokens = { git: false, debug: false, api: false, ci: false, bloom: false };
    this.bugsSquashed = 0;
    this.bugsNeeded = 5;
    this.beacons = [false, false, false];
    this.consoles = [false, false, false];
    this.compiled = false;
    this.readReadme = false;
  }

  get tokenCount() {
    return Object.values(this.tokens).filter(Boolean).length;
  }

  allTokens() {
    return this.tokenCount >= 5;
  }

  grant(id) {
    if (this.tokens[id]) return false;
    this.tokens[id] = true;
    return true;
  }

  current() {
    if (!this.talkedAda) {
      return { title: "唤醒内核", body: "到终端广场找到艾达，听取这次失败发布的残骸。" };
    }
    if (!this.tokens.git) {
      return { title: "Git 峡谷", body: "沿西路进入峡谷，跳上提交平台，拾取分支令牌。" };
    }
    if (!this.tokens.debug) {
      return {
        title: "空指针沼泽",
        body: `西南沼泽里调试空指针虫（${this.bugsSquashed}/${this.bugsNeeded}），解锁调试令牌。`,
      };
    }
    if (!this.tokens.api) {
      const n = this.beacons.filter(Boolean).length;
      return { title: "点亮港湾", body: `到 API 港湾点亮三座信标（${n}/3），向舰长 Curl 取令牌。` };
    }
    if (!this.tokens.ci) {
      const n = this.consoles.filter(Boolean).length;
      return { title: "修复流水线", body: `CI 工厂外修复三条节点（${n}/3），让构建重新变绿。` };
    }
    if (!this.tokens.bloom) {
      return { title: "着色峰", body: "沿石阶登上北峰，在神社取回辉光令牌。" };
    }
    if (!this.compiled) {
      return { title: "重新编译", body: "五枚令牌已齐。回到编译尖塔，按住交互完成最终编译。" };
    }
    return { title: "BUILD SUCCESS", body: "源码岛再次运转。在黄昏里随便走走吧。" };
  }
}

export function spawnBugs(scene, center, count) {
  const bugs = [];
  const geo = new THREE.IcosahedronGeometry(0.32, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x4a1028,
    emissive: 0xff2d86,
    emissiveIntensity: 0.8,
    roughness: 0.35,
  });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat.clone());
    const ang = (i / count) * Math.PI * 2;
    mesh.position.set(
      center.x + Math.cos(ang) * 3.4,
      center.y + 0.9,
      center.z + Math.sin(ang) * 3.4
    );
    mesh.userData = {
      kind: "bug",
      origin: mesh.position.clone(),
      phase: Math.random() * 10,
      alive: true,
    };
    scene.add(mesh);
    bugs.push(mesh);
  }
  return bugs;
}

export function spawnNpcs(scene, interactables) {
  const npcs = [];
  for (const mark of interactables.filter((m) => m.kind === "npc")) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: mark.id === "ada" ? 0x7be7dc : 0xe0a25a })
    );
    body.position.y = 0.85;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xf2d2b6 })
    );
    head.position.y = 1.55;
    group.add(body, head);
    group.position.set(mark.pos[0], mark.pos[1], mark.pos[2]);
    group.rotation.y = mark.yaw ?? 0;
    scene.add(group);
    npcs.push(group);
  }
  return npcs;
}

export function spawnTokenMeshes(scene, interactables, quest) {
  const meshes = [];
  const geo = new THREE.OctahedronGeometry(0.28, 0);
  for (const mark of interactables.filter((m) => m.kind === "token")) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffc247,
      emissive: 0xffaa33,
      emissiveIntensity: 1.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(mark.pos[0], mark.pos[1] + 0.35, mark.pos[2]);
    mesh.userData.mark = mark;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

export function updateBugs(bugs, dt, player, onZap) {
  for (const bug of bugs) {
    if (!bug.userData.alive) continue;
    bug.userData.phase += dt;
    const o = bug.userData.origin;
    bug.position.x = o.x + Math.cos(bug.userData.phase) * 2.2;
    bug.position.z = o.z + Math.sin(bug.userData.phase * 0.8) * 2.2;
    bug.position.y = o.y + Math.sin(bug.userData.phase * 2.4) * 0.18;
    bug.rotation.y += dt * 2;
    if (bug.position.distanceTo(player.pos) < 1.15) {
      bug.userData.alive = false;
      bug.visible = false;
      onZap(bug);
    }
  }
}

export function updateTokens(meshes, quest, dt) {
  for (const mesh of meshes) {
    const id = mesh.userData.mark.token;
    const locked = lockedToken(mesh.userData.mark, quest);
    mesh.visible = !quest.tokens[id] && !locked;
    mesh.rotation.y += dt * 1.6;
    mesh.position.y += Math.sin(performance.now() / 400 + mesh.id) * 0.002;
  }
}

export function lockedToken(mark, quest) {
  if (mark.lockedBy === "bugs") return quest.bugsSquashed < quest.bugsNeeded;
  if (mark.lockedBy === "beacons") return quest.beacons.some((v) => !v);
  if (mark.lockedBy === "consoles") return quest.consoles.some((v) => !v);
  return false;
}
