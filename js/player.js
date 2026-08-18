import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    this.direction = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._move = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    this.walkSpeed = 3.6;
    this.runSpeed = 6.2;
    this.crouchSpeed = 1.6;
    this.speed = this.walkSpeed;
    this.isRunning = false;
    this.isCrouching = false;
    this.isMoving = false;
    this.isHiding = false;

    this.flashlightOn = true;
    this.battery = 100;
    this.batteryDrainRate = 1.6;
    this.sanity = 100;
    this.sanityDrainRate = 0.35;
    this.keys = 0;
    this.requiredKeys = 3;
    this.stamina = 100;
    this.notesRead = 0;

    this.flashlight = null;
    this.flashlightTarget = null;
    this.headBobTimer = 0;
    this.breathTimer = 0;
    this.baseHeight = 1.7;
    this.crouchHeight = 0.95;
    this.currentHeight = this.baseHeight;
    this.footstepTimer = 0;
    this.hideOrigin = new THREE.Vector3();

    this.keys_pressed = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      run: false,
      crouch: false,
    };

    this.setupInput();
    this.createFlashlight();
  }

  createFlashlight() {
    this.flashlight = new THREE.SpotLight(0xffffee, 7.5, 28, Math.PI / 4.6, 0.35, 1.05);
    this.flashlight.castShadow = false;
    this.flashlight.position.set(0.15, -0.05, 0);
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, 0, -1);
    this.flashlight.target = this.flashlightTarget;
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
  }

  setupInput() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  onKeyDown(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys_pressed.forward = true; break;
      case 'KeyS': case 'ArrowDown': this.keys_pressed.backward = true; break;
      case 'KeyA': case 'ArrowLeft': this.keys_pressed.left = true; break;
      case 'KeyD': case 'ArrowRight': this.keys_pressed.right = true; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys_pressed.run = true; break;
      case 'ControlLeft': case 'ControlRight': this.keys_pressed.crouch = true; break;
      case 'KeyF': this.toggleFlashlight(); break;
    }
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys_pressed.forward = false; break;
      case 'KeyS': case 'ArrowDown': this.keys_pressed.backward = false; break;
      case 'KeyA': case 'ArrowLeft': this.keys_pressed.left = false; break;
      case 'KeyD': case 'ArrowRight': this.keys_pressed.right = false; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys_pressed.run = false; break;
      case 'ControlLeft': case 'ControlRight': this.keys_pressed.crouch = false; break;
    }
  }

  toggleFlashlight() {
    if (this.isHiding) return;
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn && this.battery > 0 ? 7.5 : 0;
  }

  lock() { this.controls.lock(); }
  unlock() { this.controls.unlock(); }

  setPosition(x, y, z) {
    this.camera.position.set(x, y, z);
    this.position.copy(this.camera.position);
  }

  enterHide(spot) {
    this.isHiding = true;
    this.hideOrigin.copy(this.camera.position);
    this.flashlightOn = false;
    this.flashlight.intensity = 0;
    this.camera.position.copy(spot.position);
    this.camera.position.y = 1.4;
    this.isMoving = false;
    this.isRunning = false;
  }

  exitHide() {
    if (!this.isHiding) return;
    this.isHiding = false;
    this.camera.position.copy(this.hideOrigin);
    this.position.copy(this.camera.position);
  }

  update(delta, env, audio) {
    if (this.isHiding) {
      this.position.copy(this.camera.position);
      this.sanity = Math.min(100, this.sanity + delta * 1.2);
      this.stamina = Math.min(100, this.stamina + delta * 12);
      return;
    }

    const wantRun = this.keys_pressed.run && !this.keys_pressed.crouch && this.stamina > 4;
    this.isCrouching = this.keys_pressed.crouch;
    this.isRunning = wantRun && (this.keys_pressed.forward || this.keys_pressed.backward || this.keys_pressed.left || this.keys_pressed.right);

    if (this.isCrouching) this.speed = this.crouchSpeed;
    else if (this.isRunning) this.speed = this.runSpeed;
    else this.speed = this.walkSpeed;

    this.direction.set(0, 0, 0);
    if (this.keys_pressed.forward) this.direction.z -= 1;
    if (this.keys_pressed.backward) this.direction.z += 1;
    if (this.keys_pressed.left) this.direction.x -= 1;
    if (this.keys_pressed.right) this.direction.x += 1;
    this.isMoving = this.direction.lengthSq() > 0;

    if (this.isMoving) {
      this.direction.normalize();
      this.camera.getWorldDirection(this._forward);
      this._forward.y = 0;
      this._forward.normalize();
      this._right.crossVectors(this._forward, this._up).normalize();
      this._move.set(0, 0, 0);
      this._move.addScaledVector(this._forward, -this.direction.z);
      this._move.addScaledVector(this._right, this.direction.x);
      this._move.normalize().multiplyScalar(this.speed * delta);

      const nx = this.camera.position.x + this._move.x;
      const nz = this.camera.position.z + this._move.z;
      if (!env.isBlockedWorld(nx, nz, 0.3)) {
        this.camera.position.x = nx;
        this.camera.position.z = nz;
      } else if (!env.isBlockedWorld(nx, this.camera.position.z, 0.3)) {
        this.camera.position.x = nx;
      } else if (!env.isBlockedWorld(this.camera.position.x, nz, 0.3)) {
        this.camera.position.z = nz;
      }
    }

    if (this.isRunning) this.stamina = Math.max(0, this.stamina - delta * 18);
    else this.stamina = Math.min(100, this.stamina + delta * (this.isMoving ? 8 : 16));

    const targetHeight = this.isCrouching ? this.crouchHeight : this.baseHeight;
    this.currentHeight = THREE.MathUtils.lerp(this.currentHeight, targetHeight, delta * 8);
    this.camera.position.y = this.currentHeight;
    this.position.copy(this.camera.position);

    if (this.isMoving) {
      this.headBobTimer += delta * (this.isRunning ? 11 : 7);
      this.camera.position.y += Math.sin(this.headBobTimer) * (this.isRunning ? 0.05 : 0.025);
      this.footstepTimer -= delta;
      if (this.footstepTimer <= 0) {
        audio?.playFootstep(this.isRunning);
        this.footstepTimer = this.isRunning ? 0.34 : 0.48;
      }
    }

    this.breathTimer += delta;
    this.camera.position.y += Math.sin(this.breathTimer * 1.4) * 0.004;

    if (this.flashlightOn) {
      this.battery = Math.max(0, this.battery - this.batteryDrainRate * delta);
      if (this.battery <= 0) {
        this.flashlightOn = false;
        this.flashlight.intensity = 0;
      } else if (this.battery < 18) {
        this.flashlight.intensity = Math.random() > 0.12 ? 7.5 * (this.battery / 18) : 0;
      } else {
        this.flashlight.intensity = 7.5;
      }
    }

    const drain = this.flashlightOn ? this.sanityDrainRate * 0.28 : this.sanityDrainRate;
    this.sanity = Math.max(0, this.sanity - drain * delta);
  }

  drainSanity(amount) { this.sanity = Math.max(0, this.sanity - amount); }
  restoreSanity(amount) { this.sanity = Math.min(100, this.sanity + amount); }
  collectKey() { this.keys++; }
  addBattery(amount = 40) { this.battery = Math.min(100, this.battery + amount); }

  getSanityEffect() {
    if (this.sanity > 62) return 0;
    return (62 - this.sanity) / 62;
  }

  reset(spawnPoint, requiredKeys = 3, yaw = 0) {
    this.setPosition(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    this.camera.rotation.set(0, yaw, 0);
    this.battery = 100;
    this.sanity = 100;
    this.stamina = 100;
    this.keys = 0;
    this.requiredKeys = requiredKeys;
    this.notesRead = 0;
    this.isHiding = false;
    this.flashlightOn = true;
    this.flashlight.intensity = 7.5;
    this.isRunning = false;
    this.isCrouching = false;
  }
}
