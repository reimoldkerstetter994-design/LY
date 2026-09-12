import * as THREE from 'three';

const GRAVITY = -24;
const JUMP_FORCE = 9;
const WALK_SPEED = 6;
const FLY_SPEED = 12;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.flying = false;
    this.onGround = false;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = {};
  }

  spawn() {
    const spawn = this.world.getSpawnPoint();
    this.position.set(spawn.x, spawn.y, spawn.z);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.updateCamera();
  }

  toggleFly() {
    this.flying = !this.flying;
    if (this.flying) this.velocity.y = 0;
    return this.flying;
  }

  update(dt) {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();

    if (this.keys['KeyW']) move.add(forward);
    if (this.keys['KeyS']) move.sub(forward);
    if (this.keys['KeyA']) move.sub(right);
    if (this.keys['KeyD']) move.add(right);

    if (move.length() > 0) move.normalize();

    const speed = this.flying ? FLY_SPEED : WALK_SPEED;
    this.velocity.x = move.x * speed;
    this.velocity.z = move.z * speed;

    if (this.flying) {
      this.velocity.y = 0;
      if (this.keys['Space']) this.velocity.y = FLY_SPEED;
      if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) this.velocity.y = -FLY_SPEED;
      this.onGround = false;
    } else {
      if (this.keys['Space'] && this.onGround) {
        this.velocity.y = JUMP_FORCE;
        this.onGround = false;
      }
      this.velocity.y += GRAVITY * dt;
    }

    this.moveWithCollision(dt);
    this.updateCamera();
    this.world.loadChunksAround(this.position.x, this.position.z);
  }

  moveWithCollision(dt) {
    const steps = 4;
    const subDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.position.x += this.velocity.x * subDt;
      this.resolveCollision('x');

      this.position.y += this.velocity.y * subDt;
      this.resolveCollision('y');

      this.position.z += this.velocity.z * subDt;
      this.resolveCollision('z');
    }
  }

  resolveCollision(axis) {
    const minX = Math.floor(this.position.x - PLAYER_RADIUS);
    const maxX = Math.floor(this.position.x + PLAYER_RADIUS);
    const minY = Math.floor(this.position.y - PLAYER_HEIGHT);
    const maxY = Math.floor(this.position.y);
    const minZ = Math.floor(this.position.z - PLAYER_RADIUS);
    const maxZ = Math.floor(this.position.z + PLAYER_RADIUS);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const block = this.world.getBlock(x, y, z);
          if (!this.world.materials[block]) continue;

          const blockBox = {
            minX: x, maxX: x + 1,
            minY: y, maxY: y + 1,
            minZ: z, maxZ: z + 1,
          };

          const playerBox = {
            minX: this.position.x - PLAYER_RADIUS,
            maxX: this.position.x + PLAYER_RADIUS,
            minY: this.position.y - PLAYER_HEIGHT,
            maxY: this.position.y,
            minZ: this.position.z - PLAYER_RADIUS,
            maxZ: this.position.z + PLAYER_RADIUS,
          };

          if (this.boxesOverlap(playerBox, blockBox)) {
            if (axis === 'x') {
              if (this.velocity.x > 0) this.position.x = x - PLAYER_RADIUS;
              else if (this.velocity.x < 0) this.position.x = x + 1 + PLAYER_RADIUS;
              this.velocity.x = 0;
            } else if (axis === 'y') {
              if (this.velocity.y > 0) {
                this.position.y = y;
                this.velocity.y = 0;
              } else if (this.velocity.y < 0) {
                this.position.y = y + 1;
                this.velocity.y = 0;
                this.onGround = true;
              }
            } else if (axis === 'z') {
              if (this.velocity.z > 0) this.position.z = z - PLAYER_RADIUS;
              else if (this.velocity.z < 0) this.position.z = z + 1 + PLAYER_RADIUS;
              this.velocity.z = 0;
            }
          }
        }
      }
    }
  }

  boxesOverlap(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX &&
           a.minY < b.maxY && a.maxY > b.minY &&
           a.minZ < b.maxZ && a.maxZ > b.minZ;
  }

  rotate(dx, dy) {
    this.yaw -= dx * 0.002;
    this.pitch -= dy * 0.002;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  updateCamera() {
    this.camera.position.copy(this.position);
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  getLookDirection() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);
    return dir;
  }
}
