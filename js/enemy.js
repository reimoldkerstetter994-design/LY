import * as THREE from 'three';

/**
 * 恐怖敌人 AI - "影魔"
 */
export class Enemy {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.mesh = null;
    this.position = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.state = 'dormant'; // dormant, stalking, chasing, attacking, teleporting
    this.speed = 2.5;
    this.chaseSpeed = 5.5;
    this.detectionRange = 12;
    this.attackRange = 1.5;
    this.loseRange = 20;
    this.attackCooldown = 0;
    this.footstepTimer = 0;
    this.teleportCooldown = 15;
    this.teleportTimer = 10;
    this.stalkTimer = 0;
    this.visible = false;
    this.eyeGlow = null;
    this.patrolPoints = [];
    this.currentPatrolIndex = 0;
    this.jumpscareTriggered = false;
    this.lastKnownPlayerPos = new THREE.Vector3();
    this.investigateTimer = 0;
    this.spawnDistance = 25;
    this.hasSpawned = false;
  }

  create() {
    const group = new THREE.Group();

    // 身体 - 高大瘦长的人形阴影
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.5, 2.2, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0.95,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.1;
    group.add(body);

    // 头部
    const headGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 2.4;
    head.scale.set(1, 1.3, 0.8);
    group.add(head);

    // 发光红眼
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.1, 2.45, 0.15);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.1, 2.45, 0.15);
    group.add(leftEye, rightEye);

    // 眼睛点光源
    this.eyeGlow = new THREE.PointLight(0xff0000, 0, 5);
    this.eyeGlow.position.set(0, 2.4, 0.3);
    group.add(this.eyeGlow);

    // 手臂 - 异常修长
    const armGeo = new THREE.CylinderGeometry(0.05, 0.08, 1.5, 6);
    [-0.4, 0.4].forEach(sx => {
      const arm = new THREE.Mesh(armGeo, bodyMat);
      arm.position.set(sx, 1.5, 0);
      arm.rotation.z = sx > 0 ? -0.3 : 0.3;
      arm.rotation.x = -0.5;
      group.add(arm);
    });

    // 腿部
    [-0.15, 0.15].forEach(sx => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.06, 1.0, 6),
        bodyMat
      );
      leg.position.set(sx, 0.5, 0);
      group.add(leg);
    });

    group.visible = false;
    this.mesh = group;
    this.scene.add(group);

    // 设置巡逻点
    this.patrolPoints = [
      new THREE.Vector3(15, 0, -20),
      new THREE.Vector3(-15, 0, -10),
      new THREE.Vector3(10, 0, 10),
      new THREE.Vector3(-10, 0, 20),
      new THREE.Vector3(0, 0, -5),
      new THREE.Vector3(18, 0, 5),
    ];

    return group;
  }

  spawn(playerPos) {
    if (this.hasSpawned) return;

    // 在玩家视野外生成
    const angle = Math.random() * Math.PI * 2;
    const dist = this.spawnDistance + Math.random() * 5;
    this.position.set(
      playerPos.x + Math.cos(angle) * dist,
      0,
      playerPos.z + Math.sin(angle) * dist
    );
    this.mesh.position.copy(this.position);
    this.mesh.visible = true;
    this.visible = true;
    this.state = 'stalking';
    this.hasSpawned = true;
    this.eyeGlow.intensity = 0.3;

  }

  update(delta, playerPos, playerCrouching, playerRunning, playerFlashlightOn, walls) {
    if (!this.hasSpawned) {
      // 延迟生成
      this.stalkTimer += delta;
      if (this.stalkTimer > 8) {
        this.spawn(playerPos);
      }
      return { distance: Infinity, state: 'dormant' };
    }

    const distToPlayer = this.position.distanceTo(playerPos);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.teleportTimer -= delta;
    this.footstepTimer -= delta;

    // 检测范围受蹲下和手电筒影响
    let effectiveDetection = this.detectionRange;
    if (playerCrouching) effectiveDetection *= 0.5;
    if (playerRunning) effectiveDetection *= 2;
    if (!playerFlashlightOn) effectiveDetection *= 0.7;

    // 视线检测
    const canSeePlayer = distToPlayer < effectiveDetection && this.hasLineOfSight(playerPos, walls);

    switch (this.state) {
      case 'stalking':
        this.updateStalking(delta, playerPos, canSeePlayer);
        break;
      case 'chasing':
        this.updateChasing(delta, playerPos, canSeePlayer, playerCrouching);
        break;
      case 'investigating':
        this.updateInvestigating(delta, playerPos, canSeePlayer);
        break;
      case 'attacking':
        this.updateAttacking(delta);
        break;
      case 'teleporting':
        this.updateTeleporting(delta, playerPos);
        break;
    }

    // 随机传送
    if (this.teleportTimer <= 0 && this.state !== 'attacking' && this.state !== 'teleporting') {
      if (distToPlayer > 8 && distToPlayer < 30 && Math.random() > 0.6) {
        this.startTeleport(playerPos);
      }
      this.teleportTimer = this.teleportCooldown + Math.random() * 10;
    }

    // 更新网格位置
    this.mesh.position.copy(this.position);

    // 面向玩家
    if (this.state === 'chasing' || this.state === 'stalking') {
      const lookTarget = this.state === 'chasing' ? playerPos : this.targetPosition;
      const dir = new THREE.Vector3().subVectors(lookTarget, this.position);
      dir.y = 0;
      if (dir.length() > 0.1) {
        const angle = Math.atan2(dir.x, dir.z);
        this.mesh.rotation.y = angle;
      }
    }

    // 眼睛发光强度
    if (this.eyeGlow) {
      const glowIntensity = this.state === 'chasing' ? 2 : 0.3;
      this.eyeGlow.intensity = THREE.MathUtils.lerp(this.eyeGlow.intensity, glowIntensity, delta * 3);
    }

    // 出现/消失动画
    if (this.mesh.material) {
      // handled per child
    }

  // 远处时半透明
    const opacity = distToPlayer > 15 ? 0.3 : distToPlayer > 8 ? 0.6 : 0.95;
    this.mesh.traverse(child => {
      if (child.material && child.material.transparent !== undefined) {
        child.material.opacity = opacity;
      }
    });

    return {
      distance: distToPlayer,
      state: this.state,
      canSee: canSeePlayer,
      attacking: this.state === 'attacking',
    };
  }

  updateStalking(delta, playerPos, canSeePlayer) {
    // 巡逻
    const target = this.patrolPoints[this.currentPatrolIndex];
    const dir = new THREE.Vector3().subVectors(target, this.position);
    dir.y = 0;
    const dist = dir.length();

    if (dist < 1) {
      this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
    } else {
      dir.normalize();
      this.position.add(dir.multiplyScalar(this.speed * 0.5 * delta));
      this.targetPosition.copy(target);
    }

    if (canSeePlayer) {
      this.state = 'chasing';
      this.lastKnownPlayerPos.copy(playerPos);
    }

    this.playFootstepSound();
  }

  updateChasing(delta, playerPos, canSeePlayer, playerCrouching) {
    if (canSeePlayer) {
      this.lastKnownPlayerPos.copy(playerPos);
    }

    const target = canSeePlayer ? playerPos : this.lastKnownPlayerPos;
    const dir = new THREE.Vector3().subVectors(target, this.position);
    dir.y = 0;
    const dist = dir.length();

    if (dist > 0.5) {
      dir.normalize();
      const speed = playerCrouching ? this.chaseSpeed * 0.7 : this.chaseSpeed;
      this.position.add(dir.multiplyScalar(speed * delta));
    }

    // 攻击判定
    if (dist < this.attackRange && this.attackCooldown <= 0) {
      this.state = 'attacking';
      this.attackCooldown = 2;
      return;
    }

    // 失去目标
    if (!canSeePlayer && dist > this.loseRange) {
      this.state = 'investigating';
      this.investigateTimer = 5;
    }

    this.playFootstepSound(true);
  }

  updateInvestigating(delta, playerPos, canSeePlayer) {
    const dir = new THREE.Vector3().subVectors(this.lastKnownPlayerPos, this.position);
    dir.y = 0;
    const dist = dir.length();

    if (dist > 1) {
      dir.normalize();
      this.position.add(dir.multiplyScalar(this.speed * delta));
    }

    this.investigateTimer -= delta;

    if (canSeePlayer) {
      this.state = 'chasing';
    } else if (this.investigateTimer <= 0) {
      this.state = 'stalking';
    }

    this.playFootstepSound();
  }

  updateAttacking(delta) {
    this.attackCooldown -= delta;
    if (this.attackCooldown <= 1) {
      this.state = 'chasing';
    }
  }

  startTeleport(playerPos) {
    this.state = 'teleporting';
    this.mesh.visible = false;
    this.teleportTimer = 2;
  }

  updateTeleporting(delta, playerPos) {
    this.teleportTimer -= delta;
    if (this.teleportTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 5;
      this.position.set(
        playerPos.x + Math.cos(angle) * dist,
        0,
        playerPos.z + Math.sin(angle) * dist
      );
      this.mesh.position.copy(this.position);
      this.mesh.visible = true;
      this.state = 'stalking';
    }
  }

  hasLineOfSight(playerPos, walls) {
    const origin = this.position.clone();
    origin.y = 2;
    const target = playerPos.clone();
    target.y = 1.7;

    const direction = new THREE.Vector3().subVectors(target, origin);
    const distance = direction.length();
    direction.normalize();

    const raycaster = new THREE.Raycaster(origin, direction, 0, distance);
    const intersects = raycaster.intersectObjects(walls, true);

    return intersects.length === 0;
  }

  playFootstepSound(running = false) {
    if (this.footstepTimer <= 0) {
      this.audio?.playEnemyFootstep();
      this.footstepTimer = running ? 0.4 : 0.8;
    }
  }

  triggerJumpScare() {
    if (this.jumpscareTriggered) return false;
    this.jumpscareTriggered = true;
    this.state = 'attacking';
    this.attackCooldown = 1.5;
    return true;
  }

  reset() {
    this.state = 'dormant';
    this.hasSpawned = false;
    this.visible = false;
    this.stalkTimer = 0;
    this.jumpscareTriggered = false;
    this.attackCooldown = 0;
    this.teleportTimer = 10;
    if (this.mesh) {
      this.mesh.visible = false;
    }
  }

  getPosition() {
    return this.position.clone();
  }
}
