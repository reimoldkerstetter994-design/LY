import * as THREE from "three";
import { HeightField, resolveAabb } from "./collision.js";

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.field = new HeightField(world.heightmap);
    this.radius = world.player.radius;
    this.height = world.player.height;
    this.eye = world.player.eye;
    this.pos = new THREE.Vector3(...world.spawn);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.pitch = 0.05;
    this.onGround = true;
    this.stamina = 1;
    this.keys = new Set();
    this.dragging = false;
    this.locked = false;
    this.spawn = this.pos.clone();
  }

  bind(dom) {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    dom.addEventListener("click", () => {
      if (!this.locked) dom.requestPointerLock?.();
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === dom;
    });
    dom.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.dragging = true;
    });
    window.addEventListener("mouseup", () => {
      this.dragging = false;
    });
    window.addEventListener("mousemove", (e) => {
      if (!this.locked && !this.dragging) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    });
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt) {
    const sprintWant = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const canSprint = this.stamina > 0.08;
    const sprint = sprintWant && canSprint;
    const speed = sprint ? 11.5 : 6.2;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyQ")) this.yaw += 1.8 * dt;
    if (this.keys.has("ArrowRight")) this.yaw -= 1.8 * dt;
    if (this.keys.has("ArrowUp")) this.pitch += 1.2 * dt;
    if (this.keys.has("ArrowDown")) this.pitch -= 1.2 * dt;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    const f = this.forward();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const wish = new THREE.Vector3();
    if (this.keys.has("KeyW")) wish.add(f);
    if (this.keys.has("KeyS")) wish.sub(f);
    if (this.keys.has("KeyD")) wish.add(r);
    if (this.keys.has("KeyA")) wish.sub(r);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    this.vel.x = wish.x;
    this.vel.z = wish.z;
    if (sprint && wish.lengthSq() > 0) this.stamina = Math.max(0, this.stamina - dt * 0.22);
    else this.stamina = Math.min(1, this.stamina + dt * 0.16);

    if (this.onGround && this.keys.has("Space")) {
      this.vel.y = 7.2;
      this.onGround = false;
    }
    this.vel.y -= 22 * dt;

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const resolved = resolveAabb(nx, nz, this.radius, this.world.colliders);
    nx = resolved.x;
    nz = resolved.z;
    this.pos.x = nx;
    this.pos.z = nz;
    this.pos.y += this.vel.y * dt;

    const ground = this.field.sample(this.pos.x, this.pos.z);
    const feet = ground + this.height;
    if (this.pos.y <= feet) {
      this.pos.y = feet;
      this.vel.y = Math.max(0, this.vel.y);
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    if (this.pos.y < -8) {
      this.pos.copy(this.spawn);
      this.vel.set(0, 0, 0);
    }

    this.camera.position.set(this.pos.x, this.pos.y - this.height + this.eye, this.pos.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    return { moving: wish.lengthSq() > 0, sprint, onGround: this.onGround };
  }
}
