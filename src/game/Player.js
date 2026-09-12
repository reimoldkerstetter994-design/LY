import * as THREE from "three";

const GRAVITY = -25;
const JUMP_FORCE = 9;
const MOVE_SPEED = 6;
const SPRINT_MULT = 1.6;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.position = new THREE.Vector3(0, 10, 5);
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = {};
    this.locked = false;
  }

  lock() {
    document.body.requestPointerLock();
  }

  setupInput() {
    document.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
    });
    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.002;
      this.pitch -= e.movementY * 0.002;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === document.body;
    });
  }

  checkCollision(pos) {
    const minX = Math.floor(pos.x - PLAYER_RADIUS);
    const maxX = Math.floor(pos.x + PLAYER_RADIUS);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + PLAYER_HEIGHT);
    const minZ = Math.floor(pos.z - PLAYER_RADIUS);
    const maxZ = Math.floor(pos.z + PLAYER_RADIUS);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.world.getBlock(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  update(dt) {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();

    if (this.keys["KeyW"]) move.add(forward);
    if (this.keys["KeyS"]) move.sub(forward);
    if (this.keys["KeyA"]) move.sub(right);
    if (this.keys["KeyD"]) move.add(right);

    if (move.length() > 0) move.normalize();

    const speed = this.keys["ShiftLeft"] ? MOVE_SPEED * SPRINT_MULT : MOVE_SPEED;
    this.velocity.x = move.x * speed;
    this.velocity.z = move.z * speed;

    if (this.keys["Space"] && this.onGround) {
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
    }

    this.velocity.y += GRAVITY * dt;

    this.moveAxis("x", this.velocity.x * dt);
    this.moveAxis("z", this.velocity.z * dt);
    this.moveAxis("y", this.velocity.y * dt);

    if (this.position.y < -10) {
      this.position.set(0, 15, 5);
      this.velocity.set(0, 0, 0);
    }

    this.camera.position.copy(this.position);
    this.camera.position.y += PLAYER_HEIGHT - 0.2;
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  moveAxis(axis, amount) {
    const testPos = this.position.clone();
    testPos[axis] += amount;

    if (!this.checkCollision(testPos)) {
      this.position[axis] += amount;
      if (axis === "y") this.onGround = false;
    } else if (axis === "y") {
      if (amount < 0) this.onGround = true;
      this.velocity.y = 0;
    }
  }

  getCoords() {
    return {
      x: Math.floor(this.position.x),
      y: Math.floor(this.position.y),
      z: Math.floor(this.position.z),
    };
  }
}
