import * as THREE from 'three';

const GRAVITY = -28;
const JUMP_FORCE = 9;
const MOVE_SPEED = 8;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;

export class Player {
  constructor(camera, canvas, world, blockSystem) {
    this.camera = camera;
    this.canvas = canvas;
    this.world = world;
    this.blockSystem = blockSystem;

    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.enabled = false;

    this.keys = {};
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.pointerLocked = false;

    this.setupInput();
  }

  setupInput() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space' && this.enabled) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.canvas.addEventListener('click', () => {
      if (this.enabled && !this.pointerLocked) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.euler.setFromQuaternion(this.camera.quaternion);
      this.euler.y -= e.movementX * 0.002;
      this.euler.x -= e.movementY * 0.002;
      this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.pointerLocked) return;
      if (e.button === 0) this.blockSystem.placeBlock(this.camera);
      if (e.button === 2) this.blockSystem.removeBlock(this.camera);
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  update(dt) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

    const move = new THREE.Vector3();
    if (this.keys['KeyW'] || this.keys['ArrowUp']) move.add(forward);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) move.sub(forward);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) move.sub(right);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(MOVE_SPEED * dt);
    }

    this.velocity.x = move.x;
    this.velocity.z = move.z;

    if (this.onGround && this.keys['Space']) {
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
    }

    this.velocity.y += GRAVITY * dt;

    const newPos = this.camera.position.clone();
    newPos.x += this.velocity.x;
    if (!this.checkCollision(newPos)) {
      this.camera.position.x = newPos.x;
    }

    newPos.copy(this.camera.position);
    newPos.z += this.velocity.z;
    if (!this.checkCollision(newPos)) {
      this.camera.position.z = newPos.z;
    }

    newPos.copy(this.camera.position);
    newPos.y += this.velocity.y * dt;

    const groundY = this.getGroundHeight(
      this.camera.position.x,
      this.camera.position.z
    ) + PLAYER_HEIGHT;

    if (newPos.y <= groundY) {
      this.camera.position.y = groundY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.camera.position.y = newPos.y;
      this.onGround = false;
    }

    const minY = -5;
    if (this.camera.position.y < minY) {
      this.camera.position.set(0, 8, 15);
      this.velocity.set(0, 0, 0);
    }
  }

  checkCollision(pos) {
    const blockY = Math.floor(pos.y - PLAYER_HEIGHT + 0.5);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bx = Math.floor(pos.x + dx * PLAYER_RADIUS);
        const bz = Math.floor(pos.z + dz * PLAYER_RADIUS);
        if (this.blockSystem.hasBlock(bx, blockY, bz)) return true;
        if (this.blockSystem.hasBlock(bx, blockY + 1, bz)) return true;
      }
    }
    return false;
  }

  getGroundHeight(x, z) {
    let maxY = this.world.getTerrainHeight(x, z);

    for (let dy = 0; dy < 20; dy++) {
      const bx = Math.floor(x);
      const by = Math.floor(maxY) + dy;
      const bz = Math.floor(z);
      if (this.blockSystem.hasBlock(bx, by, bz)) {
        maxY = by + 1;
      }
    }

    return maxY;
  }
}
