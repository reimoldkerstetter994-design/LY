import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * 第一人称玩家控制器
 */
export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.position = new THREE.Vector3();

    this.walkSpeed = 3.5;
    this.runSpeed = 6.5;
    this.crouchSpeed = 1.5;
    this.speed = this.walkSpeed;
    this.isRunning = false;
    this.isCrouching = false;
    this.isMoving = false;

    this.flashlightOn = true;
    this.battery = 100;
    this.batteryDrainRate = 2;
    this.sanity = 100;
    this.sanityDrainRate = 0.5;
    this.keys = 0;

    this.flashlight = null;
    this.flashlightTarget = null;
    this.headBobTimer = 0;
    this.breathTimer = 0;
    this.baseHeight = 1.7;
    this.crouchHeight = 0.9;
    this.currentHeight = this.baseHeight;

  this.footstepTimer = 0;
    this.lastFootstepTime = 0;

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
    this.flashlight = new THREE.SpotLight(0xffffee, 5, 30, Math.PI / 5, 0.4, 1.2);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.001;
    this.flashlight.position.set(0.2, 0, 0);

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
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 5 : 0;
  }

  lock() {
    this.controls.lock();
  }

  unlock() {
    this.controls.unlock();
  }

  setPosition(x, y, z) {
    this.camera.position.set(x, y, z);
    this.position.copy(this.camera.position);
  }

  update(delta, collisionBoxes, audio) {
    // 速度计算
    this.isRunning = this.keys_pressed.run && !this.keys_pressed.crouch &&
                     (this.keys_pressed.forward || this.keys_pressed.backward);
    this.isCrouching = this.keys_pressed.crouch;

    if (this.isCrouching) {
      this.speed = this.crouchSpeed;
    } else if (this.isRunning) {
      this.speed = this.runSpeed;
    } else {
      this.speed = this.walkSpeed;
    }

    // 移动方向
    this.direction.set(0, 0, 0);
    if (this.keys_pressed.forward) this.direction.z -= 1;
    if (this.keys_pressed.backward) this.direction.z += 1;
    if (this.keys_pressed.left) this.direction.x -= 1;
    if (this.keys_pressed.right) this.direction.x += 1;

    this.isMoving = this.direction.length() > 0;

    if (this.isMoving) {
      this.direction.normalize();

      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

      const moveDir = new THREE.Vector3();
      moveDir.addScaledVector(forward, -this.direction.z);
      moveDir.addScaledVector(right, this.direction.x);
      moveDir.normalize();

      const moveSpeed = this.speed * delta;
      const newPos = this.camera.position.clone().add(moveDir.multiplyScalar(moveSpeed));

      // 碰撞检测
      const playerBox = new THREE.Box3(
        new THREE.Vector3(newPos.x - 0.3, 0, newPos.z - 0.3),
        new THREE.Vector3(newPos.x + 0.3, 2, newPos.z + 0.3)
      );

      let collided = false;
      for (const box of collisionBoxes) {
        if (playerBox.intersectsBox(box)) {
          collided = true;
          break;
        }
      }

      if (!collided) {
        this.camera.position.x = newPos.x;
        this.camera.position.z = newPos.z;
      }
    }

    // 蹲下高度
    const targetHeight = this.isCrouching ? this.crouchHeight : this.baseHeight;
    this.currentHeight = THREE.MathUtils.lerp(this.currentHeight, targetHeight, delta * 8);
    this.camera.position.y = this.currentHeight;

    this.position.copy(this.camera.position);

    // 头部晃动
    if (this.isMoving) {
      this.headBobTimer += delta * (this.isRunning ? 12 : 8);
      const bobAmount = this.isRunning ? 0.06 : 0.03;
      const bob = Math.sin(this.headBobTimer) * bobAmount;
      this.camera.position.y += bob;

      // 脚步声
      this.footstepTimer -= delta;
      if (this.footstepTimer <= 0) {
        audio?.playFootstep(this.isRunning);
        this.footstepTimer = this.isRunning ? 0.35 : 0.5;
      }
    }

    // 呼吸效果
    this.breathTimer += delta;
    const breathBob = Math.sin(this.breathTimer * 1.5) * 0.005;
    this.camera.position.y += breathBob;

    // 电池消耗
    if (this.flashlightOn) {
      this.battery = Math.max(0, this.battery - this.batteryDrainRate * delta);
      if (this.battery <= 0) {
        this.flashlightOn = false;
        this.flashlight.intensity = 0;
      } else if (this.battery < 20) {
        // 低电量闪烁
        this.flashlight.intensity = Math.random() > 0.1 ? 5 * (this.battery / 20) : 0;
      }
    }

    // 理智消耗（在黑暗中更快）
    const sanityDrain = this.flashlightOn ? this.sanityDrainRate * 0.3 : this.sanityDrainRate;
    this.sanity = Math.max(0, this.sanity - sanityDrain * delta);
  }

  drainSanity(amount) {
    this.sanity = Math.max(0, this.sanity - amount);
  }

  restoreSanity(amount) {
    this.sanity = Math.min(100, this.sanity + amount);
  }

  collectKey() {
    this.keys++;
  }

  getSanityEffect() {
    if (this.sanity > 60) return 0;
    return (60 - this.sanity) / 60;
  }

  reset(spawnPoint) {
    this.setPosition(spawnPoint.x, spawnPoint.y, spawnPoint.z);
    this.camera.rotation.set(0, -Math.PI / 2, 0);
    this.battery = 100;
    this.sanity = 100;
    this.keys = 0;
    this.flashlightOn = true;
    this.flashlight.intensity = 5;
    this.isRunning = false;
    this.isCrouching = false;
    this.velocity.set(0, 0, 0);
  }
}
