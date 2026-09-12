import * as THREE from 'three';
import { Player } from './Player.js';
import { World } from './World.js';
import { BlockSystem } from './BlockSystem.js';
import { Terminal } from './Terminal.js';
import { QuestSystem } from './QuestSystem.js';
import { UI } from './UI.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.running = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 180);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      300
    );

    this.ui = new UI();
    this.quests = new QuestSystem(this.ui);
    this.world = new World(this.scene);
    this.blocks = new BlockSystem(this.scene, this.world);
    this.player = new Player(this.camera, this.canvas, this.world, this.blocks);
    this.terminal = new Terminal(this.ui, this.quests);

    this.setupLighting();
    this.setupInteractables();
    this.setupEvents();
    this.animate();
  }

  setupLighting() {
    const ambient = new THREE.AmbientLight(0x6688aa, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(40, 60, 30);
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

  setupInteractables() {
    const terminalPos = new THREE.Vector3(8, 2.5, -5);
    this.terminalMesh = this.world.createTerminal(terminalPos);
    this.terminalPos = terminalPos;

    const bugPositions = [
      new THREE.Vector3(-6, 1.5, 4),
      new THREE.Vector3(12, 1.5, 8),
      new THREE.Vector3(-10, 1.5, -8),
    ];
    this.bugMeshes = bugPositions.map((pos) => this.world.createBug(pos));
    this.collectedBugs = new Set();
  }

  setupEvents() {
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') this.tryInteract();
      if (e.code >= 'Digit1' && e.code <= 'Digit4') {
        const idx = parseInt(e.code.replace('Digit', '')) - 1;
        this.blocks.selectSlot(idx);
        this.ui.setActiveSlot(idx);
      }
    });
    this.blocks.onPlace = () => this.quests.onBlockPlaced();
    document.getElementById('terminal-close').addEventListener('click', () => {
      this.terminal.close();
      this.player.enable();
    });
  }

  tryInteract() {
    if (this.terminal.isOpen) return;

    const dist = this.camera.position.distanceTo(this.terminalPos);
    if (dist < 4) {
      this.player.disable();
      this.terminal.open();
      this.quests.onTerminalUsed();
      return;
    }

    for (let i = 0; i < this.bugMeshes.length; i++) {
      if (this.collectedBugs.has(i)) continue;
      const bug = this.bugMeshes[i];
      const bugDist = this.camera.position.distanceTo(bug.position);
      if (bugDist < 3) {
        this.collectedBugs.add(i);
        bug.visible = false;
        this.ui.addBug();
        this.quests.onBugCollected();
        this.ui.showToast('收集了一个 Bug! 🐛');
        return;
      }
    }
  }

  start() {
    this.running = true;
    this.player.enable();
    this.camera.position.set(0, 8, 15);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.running && !this.terminal.isOpen) {
      this.player.update(dt);
    }

    const t = this.clock.elapsedTime;
    this.sun.position.x = Math.cos(t * 0.05) * 50;
    this.sun.position.z = Math.sin(t * 0.05) * 50;

    for (let i = 0; i < this.bugMeshes.length; i++) {
      if (!this.collectedBugs.has(i)) {
        this.bugMeshes[i].position.y = 1.5 + Math.sin(t * 2 + i) * 0.2;
        this.bugMeshes[i].rotation.y += dt;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
