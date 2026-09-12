import * as THREE from 'three';
import { InputManager } from './InputManager';
import { Player } from './Player';
import { World } from './World';
import { SaveManager } from './SaveManager';
import { BlockType, getBlockByIndex } from './BlockRegistry';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private input: InputManager;
  private player: Player;
  private world: World;
  private saveManager = new SaveManager();

  private selectedBlock: BlockType = 'grass';
  private running = false;
  private paused = false;
  private lastTime = 0;
  private saveTimer = 0;
  private clickCooldown = 0;

  private onSaveIndicator: (pending: boolean) => void;
  private onBlockCount: (count: number) => void;
  private onPosition: (x: number, y: number, z: number) => void;
  private onPause: (paused: boolean) => void;

  constructor(
    canvas: HTMLCanvasElement,
    callbacks: {
      onSaveIndicator: (pending: boolean) => void;
      onBlockCount: (count: number) => void;
      onPosition: (x: number, y: number, z: number) => void;
      onPause: (paused: boolean) => void;
    }
  ) {
    this.onSaveIndicator = callbacks.onSaveIndicator;
    this.onBlockCount = callbacks.onBlockCount;
    this.onPosition = callbacks.onPosition;
    this.onPause = callbacks.onPause;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 120);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    this.input = new InputManager(canvas);
    this.world = new World(this.scene);
    this.player = new Player(this.input, this.world, this.camera);

    this.setupLighting();
    this.setupDecorations();
    this.loadOrGenerateWorld();

    window.addEventListener('resize', () => this.onResize());
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xb0c4de, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e6, 1.4);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  private setupDecorations(): void {
    // 装饰性 Blender 资产占位：使用程序化几何体模拟导入的 GLTF 模型
    const lampPost = this.createLampPost();
    lampPost.position.set(-6, 0, -4);
    this.scene.add(lampPost);

    const crystal = this.createCrystal();
    crystal.position.set(-4, 0, 8);
    this.scene.add(crystal);
  }

  private createLampPost(): THREE.Group {
    const group = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.6, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 8), poleMat);
    pole.position.y = 1.5;
    pole.castShadow = true;
    group.add(pole);

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.8,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), lampMat);
    lamp.position.y = 3.1;
    group.add(lamp);

    const pointLight = new THREE.PointLight(0xfbbf24, 2, 8);
    pointLight.position.y = 3.1;
    group.add(pointLight);

    return group;
  }

  private createCrystal(): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x818cf8,
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.7,
      thickness: 1,
      transparent: true,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), mat);
    crystal.position.y = 1.2;
    crystal.castShadow = true;
    group.add(crystal);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.8 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 12), baseMat);
    base.position.y = 0.15;
    base.receiveShadow = true;
    group.add(base);

    group.userData.animate = true;
    return group;
  }

  private loadOrGenerateWorld(): void {
    const saved = this.saveManager.load();
    if (saved && saved.blocks.length > 0) {
      this.world.loadFromSave(saved.blocks);
      this.player.position.set(saved.player.x, saved.player.y, saved.player.z);
    } else {
      this.world.generateTerrain();
      this.player.reset(0, 10);
    }
    this.onBlockCount(this.world.getBlockCount());
  }

  start(): void {
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    this.input.requestPointerLock();
    this.loop();
  }

  resume(): void {
    this.paused = false;
    this.onPause(false);
    this.input.requestPointerLock();
  }

  pause(): void {
    this.paused = true;
    this.onPause(true);
    this.input.exitPointerLock();
  }

  resetWorld(): void {
    this.saveManager.clear();
    this.world.clear();
    this.world.generateTerrain();
    this.player.reset(0, 10);
    this.onBlockCount(this.world.getBlockCount());
    this.scheduleSave();
  }

  exportSave(): void {
    const data = this.buildSaveData();
    this.saveManager.exportJson(data);
  }

  setSelectedBlock(type: BlockType): void {
    this.selectedBlock = type;
  }

  getSelectedBlock(): BlockType {
    return this.selectedBlock;
  }

  private buildSaveData() {
    const pos = this.player.getPosition();
    return {
      version: 1,
      blocks: this.world.serialize(),
      player: { x: pos.x, y: pos.y, z: pos.z },
      timestamp: Date.now(),
    };
  }

  private scheduleSave(): void {
    this.onSaveIndicator(true);
    this.saveTimer = 1.5;
  }

  private doSave(): void {
    this.saveManager.save(this.buildSaveData());
    this.onSaveIndicator(false);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private loop(): void {
    if (!this.running) return;
    requestAnimationFrame(() => this.loop());

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.input.isKeyDown('Escape') && this.input.isPointerLocked()) {
      this.pause();
      return;
    }

    if (this.paused || !this.input.isPointerLocked()) return;

    const numKey = this.input.getNumberKey();
    if (numKey !== null) {
      this.selectedBlock = getBlockByIndex(numKey - 1);
    }

    this.player.update(dt);
    this.world.updateHighlight(this.camera, this.player.getPosition());

    if (this.clickCooldown > 0) this.clickCooldown -= dt;

    if (this.clickCooldown <= 0) {
      if (this.input.isMouseDown(0)) {
        if (this.world.tryPlace(this.camera, this.player.getPosition(), this.selectedBlock)) {
          this.onBlockCount(this.world.getBlockCount());
          this.scheduleSave();
          this.clickCooldown = 0.15;
        }
      }
      if (this.input.isMouseDown(2)) {
        if (this.world.tryRemove(this.camera)) {
          this.onBlockCount(this.world.getBlockCount());
          this.scheduleSave();
          this.clickCooldown = 0.15;
        }
      }
    }

    const pos = this.player.getPosition();
    this.onPosition(Math.round(pos.x), Math.round(pos.y), Math.round(pos.z));

    if (this.saveTimer > 0) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) this.doSave();
    }

    // 动画装饰物
    this.scene.traverse((obj) => {
      if (obj.userData.animate && obj instanceof THREE.Group) {
        obj.rotation.y += dt * 0.5;
        obj.position.y = Math.sin(now * 0.001) * 0.1;
      }
    });

    this.renderer.render(this.scene, this.camera);
  }
}
