import * as THREE from 'three';

const TYPES = {
  stalker: {
    id: 'stalker',
    name: '影魔',
    height: 2.4,
    bodyScale: [1, 1, 1],
    color: 0x0a0a0a,
    eye: 0xff0000,
    speed: 2.2,
    chase: 4.6,
    detect: 11,
    attack: 1.45,
    lose: 18,
    spawnDelay: 6,
    canTeleport: true,
    crouch: false,
  },
  crawler: {
    id: 'crawler',
    name: '爬行者',
    height: 0.7,
    bodyScale: [1.1, 0.35, 1.4],
    color: 0x1a0a08,
    eye: 0xff6600,
    speed: 2.8,
    chase: 5.8,
    detect: 8,
    attack: 1.2,
    lose: 14,
    spawnDelay: 10,
    canTeleport: false,
    crouch: true,
  },
  whisperer: {
    id: 'whisperer',
    name: '低语者',
    height: 2.1,
    bodyScale: [0.7, 1.15, 0.7],
    color: 0x14101a,
    eye: 0xaa66ff,
    speed: 1.6,
    chase: 3.4,
    detect: 16,
    attack: 1.3,
    lose: 22,
    spawnDelay: 12,
    canTeleport: true,
    sanityAura: 4,
    fadeFar: true,
  },
  watcher: {
    id: 'watcher',
    name: '注视者',
    height: 2.8,
    bodyScale: [0.85, 1.3, 0.85],
    color: 0x080810,
    eye: 0xffffff,
    speed: 1.2,
    chase: 5.2,
    detect: 14,
    attack: 1.5,
    lose: 20,
    spawnDelay: 14,
    canTeleport: true,
    stare: true,
  },
};

function createEnemyMesh(type) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({
    color: type.color,
    transparent: type.fadeFar || false,
    opacity: 0.95,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 1.8, 6), mat);
  body.position.y = type.crouch ? 0.45 : 1.0;
  body.scale.set(type.bodyScale[0], type.bodyScale[1], type.bodyScale[2]);
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), mat);
  head.position.y = type.crouch ? 0.85 : type.height;
  head.scale.set(1, type.crouch ? 0.7 : 1.2, 0.85);
  group.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: type.eye });
  const eyeGeo = new THREE.SphereGeometry(0.035, 6, 6);
  const ly = type.crouch ? 0.88 : type.height + 0.02;
  const lz = type.crouch ? 0.22 : 0.14;
  const left = new THREE.Mesh(eyeGeo, eyeMat);
  left.position.set(-0.08, ly, lz);
  const right = new THREE.Mesh(eyeGeo, eyeMat);
  right.position.set(0.08, ly, lz);
  group.add(left, right);

  if (type.crouch) {
    [-0.22, 0.22].forEach(sx => {
      const limb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), mat);
      limb.position.set(sx, 0.18, 0.15);
      group.add(limb);
    });
  }

  group.visible = false;
  group.userData.bodyMat = mat;
  return group;
}

export class Enemy {
  constructor(scene, audio, typeId, index) {
    this.scene = scene;
    this.audio = audio;
    this.type = TYPES[typeId] || TYPES.stalker;
    this.index = index;
    this.mesh = createEnemyMesh(this.type);
    this.scene.add(this.mesh);
    this.position = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.lastKnownPlayerPos = new THREE.Vector3();
    this.state = 'dormant';
    this.hasSpawned = false;
    this.attackCooldown = 0;
    this.footstepTimer = 0;
    this.teleportTimer = 8 + index * 4;
    this.stalkTimer = 0;
    this.investigateTimer = 0;
    this.jumpscareTriggered = false;
    this.patrolPoints = [];
    this.currentPatrolIndex = index % 3;
    this._dir = new THREE.Vector3();
  }

  setPatrol(points) {
    this.patrolPoints = points.length ? points : [new THREE.Vector3()];
    this.currentPatrolIndex = this.index % this.patrolPoints.length;
  }

  spawn(fromPos, env) {
    if (this.hasSpawned) return;
    const spot = env.getRandomWalkable(12 + this.index * 2, fromPos);
    this.position.copy(spot);
    this.mesh.position.copy(this.position);
    this.mesh.visible = true;
    this.state = 'stalking';
    this.hasSpawned = true;
  }

  tryMove(nx, nz, env, dtSpeed) {
    if (!env.isBlockedWorld(nx, nz, 0.35)) {
      this.position.x = nx;
      this.position.z = nz;
      return;
    }
    if (!env.isBlockedWorld(nx, this.position.z, 0.35)) this.position.x = nx;
    else if (!env.isBlockedWorld(this.position.x, nz, 0.35)) this.position.z = nz;
  }

  update(delta, player, env, lookDir) {
    if (!this.hasSpawned) {
      this.stalkTimer += delta;
      if (this.stalkTimer > this.type.spawnDelay) this.spawn(player.position, env);
      return { distance: Infinity, state: 'dormant', attacking: false, name: this.type.name };
    }

    const dist = this.position.distanceTo(player.position);
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.teleportTimer -= delta;
    this.footstepTimer -= delta;

    let detect = this.type.detect;
    if (player.isHiding) detect *= 0.18;
    else if (player.isCrouching) detect *= 0.55;
    if (player.isRunning) detect *= 1.85;
    if (!player.flashlightOn) detect *= 0.75;

    const canSee = dist < detect && env.hasLineOfSight(
      this.position.x, this.position.z, player.position.x, player.position.z
    );

    if (this.type.stare && lookDir && canSee) {
      this._dir.subVectors(this.position, player.position).setY(0).normalize();
      const facing = lookDir.dot(this._dir);
      if (facing > 0.72 && this.state !== 'chasing') {
        this.state = 'stalking';
      } else if (facing < 0.15 && dist < detect) {
        this.state = 'chasing';
        this.lastKnownPlayerPos.copy(player.position);
      }
    }

    switch (this.state) {
      case 'stalking':
        this.updateStalking(delta, player.position, canSee, env);
        break;
      case 'chasing':
        this.updateChasing(delta, player.position, canSee, env);
        break;
      case 'investigating':
        this.updateInvestigating(delta, canSee, env);
        break;
      case 'attacking':
        if (this.attackCooldown <= 1) this.state = 'chasing';
        break;
      case 'teleporting':
        this.updateTeleporting(delta, player.position, env);
        break;
    }

    if (this.type.canTeleport && this.teleportTimer <= 0 && this.state !== 'attacking' && this.state !== 'teleporting') {
      if (dist > 9 && dist < 28 && Math.random() > 0.55) {
        this.state = 'teleporting';
        this.mesh.visible = false;
        this.teleportTimer = 1.4;
      } else {
        this.teleportTimer = 12 + Math.random() * 10;
      }
    }

    this._nearAudio = dist < 14;
    this.mesh.position.copy(this.position);
    const look = this.state === 'chasing' ? player.position : this.targetPosition;
    this._dir.subVectors(look, this.position);
    if (this._dir.lengthSq() > 0.04) this.mesh.rotation.y = Math.atan2(this._dir.x, this._dir.z);

    if (this.type.fadeFar && this.mesh.userData.bodyMat) {
      this.mesh.userData.bodyMat.opacity = dist > 14 ? 0.15 : dist > 7 ? 0.45 : 0.9;
    }

    return {
      distance: dist,
      state: this.state,
      attacking: this.state === 'attacking',
      name: this.type.name,
      sanityDrain: this.type.sanityAura && dist < 10 ? this.type.sanityAura : 0,
    };
  }

  updateStalking(delta, playerPos, canSee, env) {
    const target = this.patrolPoints[this.currentPatrolIndex] || playerPos;
    this._dir.subVectors(target, this.position).setY(0);
    if (this._dir.length() < 1.2) {
      this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
    } else {
      this._dir.normalize();
      this.tryMove(
        this.position.x + this._dir.x * this.type.speed * 0.45 * delta,
        this.position.z + this._dir.z * this.type.speed * 0.45 * delta,
        env
      );
      this.targetPosition.copy(target);
    }
    if (canSee) {
      this.state = 'chasing';
      this.lastKnownPlayerPos.copy(playerPos);
    }
    this.stepSound(false);
  }

  updateChasing(delta, playerPos, canSee, env) {
    if (canSee) this.lastKnownPlayerPos.copy(playerPos);
    const target = canSee ? playerPos : this.lastKnownPlayerPos;
    this._dir.subVectors(target, this.position).setY(0);
    const dist = this._dir.length();
    if (dist > 0.45) {
      this._dir.normalize();
      this.tryMove(
        this.position.x + this._dir.x * this.type.chase * delta,
        this.position.z + this._dir.z * this.type.chase * delta,
        env
      );
    }
    if (dist < this.type.attack && this.attackCooldown <= 0) {
      this.state = 'attacking';
      this.attackCooldown = 1.8;
      return;
    }
    if (!canSee && dist > this.type.lose) {
      this.state = 'investigating';
      this.investigateTimer = 4;
    }
    this.stepSound(true);
  }

  updateInvestigating(delta, canSee, env) {
    this._dir.subVectors(this.lastKnownPlayerPos, this.position).setY(0);
    if (this._dir.length() > 1) {
      this._dir.normalize();
      this.tryMove(
        this.position.x + this._dir.x * this.type.speed * delta,
        this.position.z + this._dir.z * this.type.speed * delta,
        env
      );
    }
    this.investigateTimer -= delta;
    if (canSee) this.state = 'chasing';
    else if (this.investigateTimer <= 0) this.state = 'stalking';
  }

  updateTeleporting(delta, playerPos, env) {
    this.teleportTimer -= delta;
    if (this.teleportTimer <= 0) {
      const spot = env.getRandomWalkable(7, playerPos);
      this.position.copy(spot);
      this.mesh.position.copy(this.position);
      this.mesh.visible = true;
      this.state = 'stalking';
      this.teleportTimer = 14 + Math.random() * 8;
    }
  }

  stepSound(running) {
    if (this.footstepTimer <= 0) {
      if (this._nearAudio) this.audio?.playEnemyFootstep();
      this.footstepTimer = running ? 0.5 : 0.9;
    }
  }

  triggerJumpScare() {
    if (this.jumpscareTriggered) return false;
    this.jumpscareTriggered = true;
    this.state = 'attacking';
    this.attackCooldown = 1.4;
    return true;
  }

  reset() {
    this.state = 'dormant';
    this.hasSpawned = false;
    this.stalkTimer = 0;
    this.jumpscareTriggered = false;
    this.attackCooldown = 0;
    this.teleportTimer = 8 + this.index * 3;
    this.mesh.visible = false;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

export class EnemyManager {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.enemies = [];
    this._look = new THREE.Vector3();
  }

  setup(typeIds, env) {
    this.clear();
    const patrol = env.getPatrolPoints(8);
    typeIds.forEach((id, i) => {
      const enemy = new Enemy(this.scene, this.audio, id, i);
      enemy.setPatrol(patrol);
      this.enemies.push(enemy);
    });
  }

  spawnExtra(typeId, env, playerPos) {
    const enemy = new Enemy(this.scene, this.audio, typeId, this.enemies.length);
    enemy.setPatrol(env.getPatrolPoints(6));
    enemy.spawn(playerPos, env);
    this.enemies.push(enemy);
    return enemy;
  }

  update(delta, player, env) {
    player.camera.getWorldDirection(this._look);
    this._look.y = 0;
    this._look.normalize();

    let closest = Infinity;
    let closestState = 'dormant';
    let closestName = '';
    let anyAttack = false;
    let scareEnemy = null;
    let aura = 0;

    for (const e of this.enemies) {
      const info = e.update(delta, player, env, this._look);
      if (info.distance < closest) {
        closest = info.distance;
        closestState = info.state;
        closestName = info.name;
      }
      if (info.attacking && info.distance < 2) anyAttack = true;
      if (info.distance < 3 && info.state === 'chasing' && !e.jumpscareTriggered) {
        scareEnemy = e;
      }
      aura += info.sanityDrain;
    }

    return {
      distance: closest,
      state: closestState,
      name: closestName,
      attacking: anyAttack,
      scareEnemy,
      sanityAura: aura,
      count: this.enemies.filter(e => e.hasSpawned).length,
    };
  }

  reset() {
    this.enemies.forEach(e => e.reset());
  }

  clear() {
    this.enemies.forEach(e => e.dispose());
    this.enemies = [];
  }
}

export { TYPES };
