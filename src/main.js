import * as THREE from "three";
import { World } from "./game/World.js";
import { Player } from "./game/Player.js";
import { UI } from "./game/UI.js";

class Game {
  constructor() {
    this.started = false;
    this.canvas = document.getElementById("game-canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 30, 80);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      200
    );

    this.setupLights();
    this.setupGround();

    this.world = new World(this.scene);
    this.player = new Player(this.camera, this.world);
    this.player.setupInput();
    this.ui = new UI(this);

    this.clock = new THREE.Clock();
    this.saveInterval = null;

    this.setupActions();
    this.init();
    this.animate();

    window.addEventListener("resize", () => this.onResize());
  }

  setupLights() {
    const ambient = new THREE.AmbientLight(0x6688bb, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8888ff, 0.3);
    fill.position.set(-20, 10, -10);
    this.scene.add(fill);
  }

  setupGround() {
    const grid = new THREE.GridHelper(64, 64, 0x444466, 0x333355);
    grid.position.y = -0.01;
    this.scene.add(grid);
  }

  setupActions() {
    document.addEventListener("mousedown", (e) => {
      if (!this.started || !this.player.locked) return;
      const target = this.world.updateHighlight(this.camera);
      if (!target || target.distance > 8) return;

      if (e.button === 0) {
        if (this.ui.mode === "prop") {
          const propType = this.ui.getSelectedPropType();
          const { x, y, z } = target.place;
          this.world.addProp(propType, x, y, z);
          this.ui.notify(`放置了 ${propType}`);
        } else {
          const blockType = this.ui.getSelectedBlockType();
          const { x, y, z } = target.place;
          if (y >= 0 && y < 32) {
            this.world.setBlock(x, y, z, blockType);
          }
        }
        this.saveWorld();
      } else if (e.button === 2) {
        const { x, y, z } = target.block;
        this.world.removeBlock(x, y, z);
        this.saveWorld();
      }
    });

    document.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("keydown", (e) => {
      if (!this.started) return;
      if (this.ui.handleKey(e.code)) return;

      if (e.code === "KeyR") {
        this.world.reset().then(() => {
          this.ui.notify("世界已重置");
          this.saveWorld();
        });
      }
    });
  }

  async init() {
    await this.world.generateTerrain();
    const saved = localStorage.getItem("devworld-save");
    if (saved) {
      try {
        await this.world.deserialize(JSON.parse(saved));
      } catch {
        /* use generated terrain */
      }
    }
    this.saveInterval = setInterval(() => this.saveWorld(), 30000);
  }

  saveWorld() {
    const data = this.world.serialize();
    localStorage.setItem("devworld-save", JSON.stringify(data));
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.started && this.player.locked) {
      this.player.update(dt);
      this.world.updateHighlight(this.camera);
      this.ui.update(this.player, this.world);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

new Game();
