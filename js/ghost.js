// "她" —— 游荡在医院里的东西
import * as THREE from 'three';
import { findPath, lineOfSight, floorCells } from './maze.js';
import { makeGhostFaceTexture } from './textures.js';

export class Ghost {
  constructor(scene, grid, cellSize) {
    this.grid = grid;
    this.cellSize = cellSize;
    this.active = false;       // 收集第一根保险丝后激活
    this.aggression = 0;       // 0~6,随保险丝数量增加
    this.state = 'roam';       // roam | hunt
    this.path = [];
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.stepSoundTimer = 0;
    this.huntCooldown = 0;     // 追丢后的冷却
    this.frozenByLight = 0;    // 被手电照住的减速系数

    this.group = new THREE.Group();

    // 身体:黑袍(拉伸的锥形 + 噪声顶点)
    const bodyGeo = new THREE.ConeGeometry(0.55, 2.3, 24, 30, true);
    const pos = bodyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const wobble = Math.sin(y * 6 + pos.getX(i) * 8) * 0.05 + (Math.random() - 0.5) * 0.03;
      pos.setX(i, pos.getX(i) * (1 + wobble));
      pos.setZ(i, pos.getZ(i) * (1 + wobble));
    }
    bodyGeo.computeVertexNormals();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0c,
      roughness: 0.98,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 1.15;
    this.group.add(this.body);

    // 头:苍白的脸,总是朝向玩家
    const headGeo = new THREE.SphereGeometry(0.21, 20, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x9a9086,
      roughness: 0.85,
      map: makeGhostFaceTexture(),
      emissive: 0x141210,
    });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = 2.28;
    this.group.add(this.head);

    // 长发遮头
    const hairGeo = new THREE.SphereGeometry(0.24, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 1 });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 2.34;
    hair.scale.set(1, 1.5, 1);
    this.group.add(hair);

    // 眼睛微光(只有很暗的光,增强不安感)
    const eyeGeo = new THREE.SphereGeometry(0.018, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8d4c8 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(sx * 0.07, 2.31, 0.185);
      this.group.add(eye);
    }

    this.group.visible = false;
    scene.add(this.group);

    this.position = new THREE.Vector2(0, 0); // 世界 XZ
    this.animTime = 0;
    this.twitchTimer = 0;
  }

  worldToCell(wx, wz) {
    return [Math.floor(wx / this.cellSize), Math.floor(wz / this.cellSize)];
  }

  cellToWorld(cx, cy) {
    return [(cx + 0.5) * this.cellSize, (cy + 0.5) * this.cellSize];
  }

  // 在远离玩家的位置生成
  spawn(playerPos) {
    const cells = floorCells(this.grid);
    const [px, py] = this.worldToCell(playerPos.x, playerPos.z);
    let best = null, bestD = -1;
    for (let i = 0; i < 40; i++) {
      const [cx, cy] = cells[Math.floor(Math.random() * cells.length)];
      const d = Math.hypot(cx - px, cy - py);
      if (d > bestD) { bestD = d; best = [cx, cy]; }
    }
    const [wx, wz] = this.cellToWorld(best[0], best[1]);
    this.position.set(wx, wz);
    this.active = true;
    this.group.visible = true;
    this.state = 'roam';
    this.path = [];
  }

  // 直接闪现到玩家附近(惊吓事件)
  teleportNear(playerPos, minDist, maxDist) {
    const cells = floorCells(this.grid);
    const [px, py] = this.worldToCell(playerPos.x, playerPos.z);
    const candidates = cells.filter(([cx, cy]) => {
      const d = Math.hypot(cx - px, cy - py);
      return d >= minDist && d <= maxDist;
    });
    if (!candidates.length) return;
    const [cx, cy] = candidates[Math.floor(Math.random() * candidates.length)];
    const [wx, wz] = this.cellToWorld(cx, cy);
    this.position.set(wx, wz);
    this.path = [];
  }

  speed() {
    const base = 1.35 + this.aggression * 0.34;
    const huntBoost = this.state === 'hunt' ? 0.85 : 0;
    return (base + huntBoost) * (1 - this.frozenByLight * 0.55);
  }

  update(dt, player, audio, litByFlashlight) {
    if (!this.active) return { dist: Infinity, visible: false };

    this.animTime += dt;
    const [gx, gy] = this.worldToCell(this.position.x, this.position.y);
    const [px, py] = this.worldToCell(player.position.x, player.position.z);
    const distWorld = Math.hypot(player.position.x - this.position.x, player.position.z - this.position.y);
    const cellDist = distWorld / this.cellSize;

    // 视线判定(格子坐标系,取格子中心连续坐标)
    const los = lineOfSight(
      this.grid,
      this.position.x / this.cellSize, this.position.y / this.cellSize,
      player.position.x / this.cellSize, player.position.z / this.cellSize
    );

    // 手电照射减速
    this.frozenByLight = THREE.MathUtils.lerp(this.frozenByLight, litByFlashlight && los ? 1 : 0, dt * 4);

    // ------- 状态切换 -------
    this._stingTimer = (this._stingTimer ?? 99) + dt;
    const hearRangeM = player.isRunning ? 13 : (player.isMoving ? 7.5 : 3.5);
    const seesPlayer = los && distWorld < 26;
    const hearsPlayer = distWorld < hearRangeM;
    if (this.state === 'roam') {
      if (seesPlayer || hearsPlayer) {
        this.state = 'hunt';
        this.repathTimer = 0;
        if (seesPlayer && this._stingTimer > 9) {
          audio.scareSting();
          this._stingTimer = 0;
        }
      }
    } else if (this.state === 'hunt') {
      if (!los && distWorld > 22) {
        this.state = 'roam';
        this.path = [];
      }
    }

    // ------- 寻路与移动 -------
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.repathTimer = this.state === 'hunt' ? 0.45 : 2.2;
      let target;
      if (this.state === 'hunt') {
        target = [px, py];
      } else {
        // 游荡:偏向玩家所在方向的随机点(让它总是"阴魂不散")
        const cells = floorCells(this.grid);
        const c = cells[Math.floor(Math.random() * cells.length)];
        target = Math.random() < 0.4 ? [px, py] : c;
      }
      const p = findPath(this.grid, gx, gy, target[0], target[1]);
      if (p && p.length > 1) {
        this.path = p;
        this.pathIndex = 1;
      }
    }

    if (this.path.length && this.pathIndex < this.path.length) {
      const [tx, ty] = this.cellToWorld(this.path[this.pathIndex][0], this.path[this.pathIndex][1]);
      const dx = tx - this.position.x, dz = ty - this.position.y;
      const d = Math.hypot(dx, dz);
      const step = this.speed() * dt;
      if (d < step + 0.05) {
        this.position.set(tx, ty);
        this.pathIndex++;
      } else {
        this.position.x += (dx / d) * step;
        this.position.y += (dz / d) * step;
      }

      // 拖拽脚步声(近距离才可闻)
      this.stepSoundTimer -= dt;
      if (this.stepSoundTimer <= 0 && distWorld < 16) {
        this.stepSoundTimer = 0.62 - Math.min(0.25, this.aggression * 0.04);
        if (distWorld < 14) audio.ghostStep();
      }
    }

    // ------- 呈现 -------
    this.group.position.set(this.position.x, 0, this.position.y);
    // 永远面向玩家(最不安的细节)
    this.group.lookAt(player.position.x, 0, player.position.z);
    // 漂浮 + 抽搐
    this.body.position.y = 1.15 + Math.sin(this.animTime * 1.7) * 0.05;
    this.twitchTimer -= dt;
    if (this.twitchTimer <= 0) {
      this.twitchTimer = 0.6 + Math.random() * 2.4;
      this.head.rotation.z = (Math.random() - 0.5) * 0.55;
      this.head.rotation.x = (Math.random() - 0.5) * 0.3;
    }

    return { dist: distWorld, visible: los, cellDist };
  }
}
