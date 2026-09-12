import * as THREE from 'three';
import { World } from './World.js';
import { Player } from './Player.js';
import { BLOCK_TYPES, BLOCK_DEFS, HOTBAR_BLOCKS, isSolid } from './BlockTypes.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.selectedBlock = 0;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.highlightMesh = null;
    this.initRenderer();
    this.initScene();
    this.initLights();
    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.world);
    this.initHighlight();
    this.initUI();
    this.bindEvents();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x87ceeb);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87ceeb, 30, 80);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );

    const skyGeo = new THREE.SphereGeometry(150, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0x89cff0) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
  }

  initLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e6, 1.2);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);
    this.sun = sun;
  }

  initHighlight() {
    const geo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const edges = new THREE.EdgesGeometry(geo);
    this.highlightMesh = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
    );
    this.highlightMesh.visible = false;
    this.scene.add(this.highlightMesh);
  }

  initUI() {
    this.hotbarEl = document.getElementById('hotbar');
    this.modeLabel = document.getElementById('mode-label');
    this.posLabel = document.getElementById('pos-label');
    this.blockLabel = document.getElementById('block-label');
    this.toastEl = document.getElementById('toast');
    this.renderHotbar();
  }

  renderHotbar() {
    this.hotbarEl.innerHTML = '';
    HOTBAR_BLOCKS.forEach((type, i) => {
      const slot = document.createElement('div');
      slot.className = `hotbar-slot${i === this.selectedBlock ? ' active' : ''}`;
      slot.innerHTML = `
        <span class="slot-number">${i + 1}</span>
        <div class="block-preview" style="background:${BLOCK_DEFS[type].color}"></div>
      `;
      slot.addEventListener('click', () => this.selectBlock(i));
      this.hotbarEl.appendChild(slot);
    });
  }

  selectBlock(index) {
    if (index >= 0 && index < HOTBAR_BLOCKS.length) {
      this.selectedBlock = index;
      this.renderHotbar();
      this.blockLabel.textContent = BLOCK_DEFS[HOTBAR_BLOCKS[index]].name;
    }
  }

  showToast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 2000);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
    document.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  onKeyDown(e) {
    if (!this.running) return;
    this.player.keys[e.code] = true;

    if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
      this.selectBlock(parseInt(e.code.replace('Digit', '')) - 1);
    }
    if (e.code === 'KeyE') {
      const flying = this.player.toggleFly();
      this.modeLabel.textContent = flying ? '飞行模式' : '行走模式';
      this.showToast(flying ? '已切换至飞行模式' : '已切换至行走模式');
    }
    if (e.code === 'KeyR') {
      this.resetWorld();
    }
    if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.saveWorld();
    }
  }

  onKeyUp(e) {
    this.player.keys[e.code] = false;
  }

  onMouseDown(e) {
    if (!this.running || !document.pointerLockElement) return;

    const dir = this.player.getLookDirection();
    const result = this.world.raycast(this.player.position, dir);

    if (!result.hit) return;

    if (e.button === 0) {
      this.world.setBlock(result.block.x, result.block.y, result.block.z, BLOCK_TYPES.AIR);
    } else if (e.button === 2 && result.place) {
      const blockType = HOTBAR_BLOCKS[this.selectedBlock];
      const px = result.place.x;
      const py = result.place.y;
      const pz = result.place.z;

      const playerBox = {
        minX: this.player.position.x - 0.3,
        maxX: this.player.position.x + 0.3,
        minY: this.player.position.y - 1.7,
        maxY: this.player.position.y,
        minZ: this.player.position.z - 0.3,
        maxZ: this.player.position.z + 0.3,
      };
      const placeBox = {
        minX: px, maxX: px + 1,
        minY: py, maxY: py + 1,
        minZ: pz, maxZ: pz + 1,
      };

      const overlaps =
        playerBox.minX < placeBox.maxX && playerBox.maxX > placeBox.minX &&
        playerBox.minY < placeBox.maxY && playerBox.maxY > placeBox.minY &&
        playerBox.minZ < placeBox.maxZ && playerBox.maxZ > placeBox.minZ;

      if (!overlaps) {
        this.world.setBlock(px, py, pz, blockType);
      }
    }
  }

  onMouseMove(e) {
    if (!this.running || !document.pointerLockElement) return;
    this.player.rotate(e.movementX, e.movementY);
  }

  start() {
    this.running = true;
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');

    this.world.loadChunksAround(0, 0);
    this.player.spawn();

    const saved = localStorage.getItem('devworld-save');
    if (saved) {
      this.world.deserialize(saved);
      this.world.loadChunksAround(this.player.position.x, this.player.position.z);
    }

    this.canvas.requestPointerLock();
    this.clock.start();
    this.animate();
  }

  resetWorld() {
    this.world.reset();
    this.world.loadChunksAround(this.player.position.x, this.player.position.z);
    this.player.spawn();
    localStorage.removeItem('devworld-save');
    this.showToast('世界已重置');
  }

  saveWorld() {
    localStorage.setItem('devworld-save', this.world.serialize());
    this.showToast('世界已保存');
  }

  updateHighlight() {
    const dir = this.player.getLookDirection();
    const result = this.world.raycast(this.player.position, dir);

    if (result.hit) {
      this.highlightMesh.visible = true;
      this.highlightMesh.position.set(
        result.block.x + 0.5,
        result.block.y + 0.5,
        result.block.z + 0.5
      );
    } else {
      this.highlightMesh.visible = false;
    }
  }

  updateHUD() {
    const p = this.player.position;
    this.posLabel.textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`;
    this.blockLabel.textContent = BLOCK_DEFS[HOTBAR_BLOCKS[this.selectedBlock]].name;

    if (this.sun) {
      this.sun.position.set(
        p.x + 50,
        80,
        p.z + 30
      );
      this.sun.target.position.copy(p);
      this.sun.target.updateMatrixWorld();
    }
  }

  animate() {
    if (!this.running) return;
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.player.update(dt);
    this.updateHighlight();
    this.updateHUD();
    this.renderer.render(this.scene, this.camera);
  }
}
