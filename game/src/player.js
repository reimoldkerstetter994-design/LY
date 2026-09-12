import * as THREE from "three";

export class Player {
  constructor(spawn, stats) {
    this.radius = stats.radius ?? 0.38;
    this.height = stats.height ?? 1.7;
    this.eye = stats.eye ?? 1.56;
    this.speed = stats.speed ?? 6.2;
    this.sprint = stats.sprint ?? 9.4;
    this.jumpSpeed = stats.jump ?? 7.4;
    this.pos = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.vel = new THREE.Vector3();
    this.yaw = spawn.yaw ?? 0;
    this.pitch = 0.12;
    this.onGround = false;
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.08, 240);
    this.bob = 0;
    this.flash = false;
  }

  eyePosition(target) {
    target.copy(this.pos);
    target.y += this.eye + Math.sin(this.bob) * (this.onGround ? 0.035 : 0);
    return target;
  }

  applyLook(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0020, -1.2, 1.2);
  }

  updateCamera() {
    const eye = this.eyePosition(this.camera.position);
    const look = new THREE.Vector3(
      eye.x - Math.sin(this.yaw) * Math.cos(this.pitch),
      eye.y + Math.sin(this.pitch),
      eye.z - Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(look);
  }
}

function aabbOverlap(aMin, aMax, bMin, bMax) {
  return (
    aMin[0] < bMax[0] &&
    aMax[0] > bMin[0] &&
    aMin[1] < bMax[1] &&
    aMax[1] > bMin[1] &&
    aMin[2] < bMax[2] &&
    aMax[2] > bMin[2]
  );
}

export function movePlayer(player, input, colliders, terrain, dt, waterLevel) {
  const sprint = input.pressed("ShiftLeft") || input.pressed("ShiftRight");
  const speed = sprint ? player.sprint : player.speed;
  const axis = input.axis();
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const wishX = axis.x * cos + axis.z * sin;
  const wishZ = -axis.x * sin + axis.z * cos;
  const moving = Math.hypot(axis.x, axis.z) > 0.01 && player.onGround;
  if (moving) player.bob += dt * (sprint ? 14 : 10);

  player.vel.x = wishX * speed;
  player.vel.z = wishZ * speed;
  player.vel.y -= 22 * dt;
  if (player.onGround && (input.pressed("Space") || input.pressed("Spacebar"))) {
    player.vel.y = player.jumpSpeed;
    player.onGround = false;
  }

  const next = player.pos.clone();
  next.x += player.vel.x * dt;
  if (!blocked(next, player, colliders)) player.pos.x = next.x;
  else next.x = player.pos.x;

  next.z += player.vel.z * dt;
  if (!blocked(next, player, colliders)) player.pos.z = next.z;
  else next.z = player.pos.z;

  next.y += player.vel.y * dt;
  const ground = groundHeight(player.pos.x, player.pos.z, terrain, waterLevel);
  if (next.y <= ground) {
    next.y = ground;
    player.vel.y = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }
  player.pos.y = next.y;

  if (player.pos.y < waterLevel - 2.5) {
    player.pos.set(player._spawn.x, player._spawn.y, player._spawn.z);
    player.vel.set(0, 0, 0);
  }
}

function blocked(pos, player, colliders) {
  const min = [pos.x - player.radius, pos.y + 0.12, pos.z - player.radius];
  const max = [pos.x + player.radius, pos.y + player.height, pos.z + player.radius];
  for (const c of colliders) {
    if (aabbOverlap(min, max, c.min, c.max)) return true;
  }
  return false;
}

const _down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();
const _ray = new THREE.Raycaster();

function groundHeight(x, z, terrain, waterLevel) {
  if (!terrain) return waterLevel + 0.1;
  _origin.set(x, 80, z);
  _ray.set(_origin, _down);
  _ray.far = 120;
  const hits = _ray.intersectObject(terrain, true);
  if (hits.length) return hits[0].point.y + 0.02;
  return Math.max(waterLevel + 0.2, 0.2);
}
