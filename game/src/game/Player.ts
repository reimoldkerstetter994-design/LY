import * as THREE from 'three';
import type { InputManager } from './InputManager';
import type { World } from './World';

const MOVE_SPEED = 6;
const JUMP_FORCE = 8;
const GRAVITY = 24;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;

export class Player {
  position = new THREE.Vector3(0, 10, 0);
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  private onGround = false;
  private camera: THREE.PerspectiveCamera;

  constructor(
    private input: InputManager,
    private world: World,
    camera: THREE.PerspectiveCamera
  ) {
    this.camera = camera;
  }

  reset(x = 0, z = 0): void {
    const groundY = this.world.getGroundHeight(x, z);
    this.position.set(x, groundY + PLAYER_HEIGHT, z);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
  }

  update(dt: number): void {
    const mouse = this.input.consumeMouseDelta();
    this.yaw -= mouse.x * 0.002;
    this.pitch -= mouse.y * 0.002;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3();
    if (this.input.isKeyDown('KeyW')) moveDir.add(forward);
    if (this.input.isKeyDown('KeyS')) moveDir.sub(forward);
    if (this.input.isKeyDown('KeyA')) moveDir.sub(right);
    if (this.input.isKeyDown('KeyD')) moveDir.add(right);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(MOVE_SPEED);
    }

    this.velocity.x = moveDir.x;
    this.velocity.z = moveDir.z;

    if (this.onGround && this.input.isKeyDown('Space')) {
      this.velocity.y = JUMP_FORCE;
      this.onGround = false;
    }

    this.velocity.y -= GRAVITY * dt;

    this.moveWithCollision(dt);

    this.camera.position.copy(this.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  private moveWithCollision(dt: number): void {
    const steps = 3;
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      this.position.x += this.velocity.x * stepDt;
      this.resolveCollision('x');

      this.position.z += this.velocity.z * stepDt;
      this.resolveCollision('z');

      this.position.y += this.velocity.y * stepDt;
      this.onGround = false;
      this.resolveCollision('y');
    }
  }

  private resolveCollision(axis: 'x' | 'y' | 'z'): void {
    const min = new THREE.Vector3(
      this.position.x - PLAYER_RADIUS,
      this.position.y - PLAYER_HEIGHT,
      this.position.z - PLAYER_RADIUS
    );
    const max = new THREE.Vector3(
      this.position.x + PLAYER_RADIUS,
      this.position.y + 0.2,
      this.position.z + PLAYER_RADIUS
    );

    const checkPositions = [
      [Math.floor(min.x), Math.floor(min.y), Math.floor(min.z)],
      [Math.floor(max.x), Math.floor(min.y), Math.floor(min.z)],
      [Math.floor(min.x), Math.floor(max.y), Math.floor(min.z)],
      [Math.floor(max.x), Math.floor(max.y), Math.floor(min.z)],
      [Math.floor(min.x), Math.floor(min.y), Math.floor(max.z)],
      [Math.floor(max.x), Math.floor(min.y), Math.floor(max.z)],
      [Math.floor(min.x), Math.floor(max.y), Math.floor(max.z)],
      [Math.floor(max.x), Math.floor(max.y), Math.floor(max.z)],
    ];

    for (const [bx, by, bz] of checkPositions) {
      const blockMin = new THREE.Vector3(bx - 0.5, by - 0.5, bz - 0.5);
      const blockMax = new THREE.Vector3(bx + 0.5, by + 0.5, bz + 0.5);

      if (max.x <= blockMin.x || min.x >= blockMax.x) continue;
      if (max.y <= blockMin.y || min.y >= blockMax.y) continue;
      if (max.z <= blockMin.z || min.z >= blockMax.z) continue;

      if (axis === 'x') {
        if (this.velocity.x > 0) this.position.x = blockMin.x - PLAYER_RADIUS;
        else if (this.velocity.x < 0) this.position.x = blockMax.x + PLAYER_RADIUS;
        this.velocity.x = 0;
      } else if (axis === 'z') {
        if (this.velocity.z > 0) this.position.z = blockMin.z - PLAYER_RADIUS;
        else if (this.velocity.z < 0) this.position.z = blockMax.z + PLAYER_RADIUS;
        this.velocity.z = 0;
      } else {
        if (this.velocity.y < 0) {
          this.position.y = blockMax.y + PLAYER_HEIGHT;
          this.velocity.y = 0;
          this.onGround = true;
        } else if (this.velocity.y > 0) {
          this.position.y = blockMin.y - 0.2;
          this.velocity.y = 0;
        }
      }
    }

    if (this.position.y < -20) {
      this.reset(this.position.x, this.position.z);
    }
  }

  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }
}
