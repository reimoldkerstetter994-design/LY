import * as THREE from "three";

export class Player {
  constructor(camera, spawn, yaw = 0) {
    this.camera = camera;
    this.position = new THREE.Vector3(spawn[0], 1.62, spawn[2]);
    this.velocity = new THREE.Vector3();
    this.yaw = yaw;
    this.pitch = 0;
    this.radius = 0.38;
    this.eye = 1.62;
    this.onGround = true;
    this.speed = 6.2;
    this.sprint = 9.4;
    this.keys = new Set();
    this.locked = false;
    this.enabled = false;
    this.ignoreMouseUntil = 0;
    this._onKey = (e) => this.onKey(e);
    this._onMove = (e) => this.onMouse(e);
    this._onLock = () => {
      this.locked = document.pointerLockElement === document.getElementById("view");
      if (this.locked) this.ignoreMouseUntil = performance.now() + 350;
    };
  }

  resetPose(spawn, yaw = 0) {
    this.position.set(spawn[0], this.eye, spawn[2]);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.ignoreMouseUntil = performance.now() + 350;
    this.syncCamera();
  }

  attach() {
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("keyup", this._onKey);
    document.addEventListener("mousemove", this._onMove);
    document.addEventListener("pointerlockchange", this._onLock);
  }

  detach() {
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("keyup", this._onKey);
    document.removeEventListener("mousemove", this._onMove);
    document.removeEventListener("pointerlockchange", this._onLock);
  }

  onKey(e) {
    if (e.repeat && e.type === "keydown") return;
    const k = e.code;
    if (e.type === "keydown") this.keys.add(k);
    else this.keys.delete(k);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) {
      e.preventDefault();
    }
  }

  onMouse(e) {
    if (!this.enabled || !this.locked) return;
    if (performance.now() < this.ignoreMouseUntil) return;
    this.yaw -= e.movementX * 0.0016;
    this.pitch -= e.movementY * 0.0016;
    this.pitch = Math.max(-0.85, Math.min(0.75, this.pitch));
  }

  wish() {
    let x = 0;
    let z = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) z -= 1;
    if (this.keys.has("KeyS")) z += 1;
    if (this.keys.has("KeyA")) x -= 1;
    if (this.keys.has("KeyD")) x += 1;
    return { x, z };
  }

  update(dt, colliders, blocked) {
    if (!this.enabled) {
      this.syncCamera();
      return;
    }
    if (!this.locked) {
      const turn = (this.keys.has("ArrowLeft") ? 1 : 0) - (this.keys.has("ArrowRight") ? 1 : 0);
      this.yaw += turn * 1.8 * dt;
      if (this.keys.has("KeyQ")) this.pitch = Math.min(0.75, this.pitch + 0.9 * dt);
      if (this.keys.has("KeyZ")) this.pitch = Math.max(-0.85, this.pitch - 0.9 * dt);
    }
    if (this.keys.has("KeyR")) {
      this.pitch = 0;
    }

    const wish = this.wish();
    const speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? this.sprint : this.speed;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const fx = wish.x * cos + wish.z * sin;
    const fz = wish.z * cos - wish.x * sin;
    const mag = Math.hypot(fx, fz) || 1;
    const vx = blocked ? 0 : (fx / mag) * speed;
    const vz = blocked ? 0 : (fz / mag) * speed;

    this.position.x += vx * dt;
    resolve(this.position, this.radius, this.eye, colliders, "x");
    this.position.z += vz * dt;
    resolve(this.position, this.radius, this.eye, colliders, "z");

    this.velocity.y -= 22 * dt;
    if (this.onGround && this.keys.has("Space") && !blocked) {
      this.velocity.y = 7.4;
      this.onGround = false;
    }
    this.position.y += this.velocity.y * dt;
    if (this.position.y <= this.eye) {
      this.position.y = this.eye;
      this.velocity.y = 0;
      this.onGround = true;
    }

    this.position.x = THREE.MathUtils.clamp(this.position.x, -43, 43);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -43, 43);
    this.syncCamera();
  }

  syncCamera() {
    this.camera.position.copy(this.position);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}

function resolve(pos, radius, eye, colliders, axis) {
  const feet = pos.y - eye;
  const head = pos.y + 0.12;
  for (const c of colliders) {
    const minY = c.min[1];
    const maxY = c.max[1];
    if (head < minY || feet > maxY) continue;
    const minX = c.min[0] - radius;
    const maxX = c.max[0] + radius;
    const minZ = c.min[2] - radius;
    const maxZ = c.max[2] + radius;
    if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;
    if (axis === "x") {
      const dl = pos.x - minX;
      const dr = maxX - pos.x;
      pos.x = dl < dr ? minX : maxX;
    } else {
      const db = pos.z - minZ;
      const df = maxZ - pos.z;
      pos.z = db < df ? minZ : maxZ;
    }
  }
}
