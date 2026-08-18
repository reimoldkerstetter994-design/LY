import * as THREE from 'three';
import { Environment } from './environment.js';
import { Player } from './player.js';
import { EnemyManager } from './enemy.js';
import { HorrorAudio } from './audio.js';
import { UI } from './ui.js';
import { getMode } from './maps.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.paused = false;
    this.gameTime = 0;
    this.frame = 0;
    this.startTime = 0;
    this.scareTimer = 12;
    this.blackoutTimer = 28;
    this.isBlackout = false;
    this.nearInteractable = null;
    this.surviveLeft = 0;
    this.mode = null;
    this.mapId = 'hospital';
    this.listenersBound = false;
    this.heartbeatOn = false;
    this.ghostTimer = 8;

    this.audio = new HorrorAudio();
    this.ui = new UI();

    this.initRenderer();
    this.initScene();

    this.player = new Player(this.camera, this.canvas);
    this.environment = new Environment(this.scene);
    this.enemies = new EnemyManager(this.scene, this.audio);
    this.ghost = this.createGhost();

    this._clock = new THREE.Clock();
    this.setupUI();
    this.setupInteraction();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    window.addEventListener('resize', () => this.onResize());
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1410);
    const hemi = new THREE.HemisphereLight(0x8899aa, 0x2a2018, 0.5);
    hemi.name = 'hemi-fill';
    this.scene.add(hemi);
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.12, 70);
    this.scene.add(this.camera);
  }

  createGhost() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.1, 6), mat);
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, mat, life: 0 };
  }

  setupUI() {
    this.ui.onStart(() => this.startGame());
    this.ui.onRetry(() => this.startGame());
    this.ui.onMenu(() => this.showMenu());
    this.ui.onResume(() => this.resumeGame());
  }

  setupInteraction() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.running && !this.paused) this.handleInteraction();
      if (e.code === 'Escape' && this.running) this.pauseGame();
    });
    this.player.controls.addEventListener('lock', () => {
      this.paused = false;
      this.ui.hidePause();
      this.ui.showHUD();
    });
    this.player.controls.addEventListener('unlock', () => {
      if (this.running) this.pauseGame();
    });
  }

  async load() {
    this.ui.setLoadingProgress(20, '初始化渲染引擎...');
    await this.delay(120);
    this.ui.setLoadingProgress(55, '编织回廊...');
    this.envData = this.environment.build('hospital');
    this.player.setPosition(this.envData.spawnPoint.x, this.envData.spawnPoint.y, this.envData.spawnPoint.z);
    await this.delay(120);
    this.ui.setLoadingProgress(80, '加载恐怖音效...');
    await this.audio.init();
    this.ui.setLoadingProgress(100, '完成');
    await this.delay(200);
    this.ui.hideLoading();
    this.ui.showMenu();
  }

  startGame() {
    this.mapId = this.ui.selectedMap;
    this.mode = getMode(this.ui.selectedMode);
    this.ui.hideMenu();
    this.ui.hideHUD();
    this.ui.gameOverScreen.classList.add('hidden');
    this.ui.winScreen.classList.add('hidden');
    this.ui.hidePause();

    this.envData = this.environment.build(this.mapId);
    const types = this.envData.map.enemies[this.mode.id] || ['stalker', 'crawler'];
    this.enemies.setup(types, this.environment);

    const required = this.mode.id === 'survive' ? 0 : this.environment.keys.length;
    this.player.reset(this.envData.spawnPoint, required, this.environment.getSpawnYaw());

    this.gameTime = 0;
    this.frame = 0;
    this.startTime = Date.now();
    this.scareTimer = 16 + Math.random() * 10;
    this.blackoutTimer = 48;
    this.isBlackout = false;
    this.surviveLeft = this.mode.duration || 0;
    this.waveTimer = 38;
    this.running = true;
    this.paused = false;
    this.heartbeatOn = false;
    this.ghost.mesh.visible = false;
    this.ghost.life = 0;
    this._clock.getDelta();

    this.environment.keys.forEach(k => { k.userData.collected = false; k.visible = true; });
    this.environment.batteries.forEach(b => { b.userData.collected = false; b.visible = true; });

    this.audio.resume();
    this.audio.startAmbient();
    this.audio.startWhispers();

    const tips = {
      escape: `找到 ${required} 把钥匙，逃出${this.envData.map.name}。`,
      survive: `活过 ${Math.floor(this.surviveLeft / 60)} 分 ${this.surviveLeft % 60} 秒。柜子可以藏。`,
      hunt: `夺取全部遗物。每拿一件，就会多一只东西醒来。`,
    };
    this.player.lock();
    this.ui.showMessage(tips[this.mode.id], 4200);
    if (!this._animating) this.animate();
  }

  pauseGame() {
    if (!this.running) return;
    this.paused = true;
    this.ui.showPause();
  }

  resumeGame() {
    this.paused = false;
    this.ui.hidePause();
    this.player.lock();
  }

  showMenu() {
    this.running = false;
    this.paused = false;
    this.player.unlock();
    this.player.exitHide();
    this.audio.stopAmbient();
    this.audio.stopHeartbeat();
    this.audio.stopWhispers();
    this.heartbeatOn = false;
    this.ui.showMenu();
  }

  handleInteraction() {
    if (!this.nearInteractable) return;
    const data = this.nearInteractable.userData;

    if (data.type === 'key' && !data.collected) {
      if (this.mode.id === 'survive') {
        data.collected = true;
        this.nearInteractable.visible = false;
        this.player.restoreSanity(14);
        this.audio.playKeyPickup();
        this.ui.showMessage('你握紧它，脑子清醒了一点。', 2000);
        return;
      }
      data.collected = true;
      this.nearInteractable.visible = false;
      this.player.collectKey();
      this.audio.playKeyPickup();
      const label = this.mode.id === 'hunt' ? '遗物' : '钥匙';
      this.ui.showMessage(`找到${label}！(${this.player.keys}/${this.player.requiredKeys})`, 2000);
      if (this.mode.id === 'hunt') {
        this.enemies.spawnExtra('crawler', this.environment, this.player.position);
        this.ui.showMessage('什么东西被唤醒了...', 2500);
        this.player.drainSanity(8);
      }
      if (this.player.keys >= this.player.requiredKeys && this.mode.id !== 'survive') {
        this.ui.showMessage('东西齐了。去找出口。', 3500);
      }
    }

    if (data.type === 'battery' && !data.collected) {
      data.collected = true;
      this.nearInteractable.visible = false;
      this.player.addBattery(45);
      this.audio.playKeyPickup();
      this.ui.showMessage('电池还有电...', 1800);
    }

    if (data.type === 'note') {
      this.audio.playRadioStatic(0.4);
      this.ui.showMessage(data.text, 5000);
      this.player.notesRead++;
      this.player.restoreSanity(4);
    }

    if (data.type === 'hide') {
      if (this.player.isHiding) {
        this.player.exitHide();
        this.audio.playLocker();
      } else {
        this.player.enterHide(this.nearInteractable);
        this.audio.playLocker();
        this.ui.showMessage('你屏住了呼吸...', 1800);
      }
    }

    if (data.type === 'exit') {
      if (this.mode.id === 'survive') {
        this.ui.showMessage('现在还不能走。先活下来。', 2000);
        return;
      }
      if (this.player.keys >= this.player.requiredKeys) {
        data.open = true;
        this.audio.playDoorCreak();
        this.winGame();
      } else {
        this.ui.showMessage(`还差 ${this.player.requiredKeys - this.player.keys} 件`, 2000);
      }
    }
  }

  winGame() {
    this.running = false;
    this.player.unlock();
    this.audio.stopHeartbeat();
    const time = Math.floor((Date.now() - this.startTime) / 1000);
    this.ui.showWin(`用时 ${Math.floor(time / 60)}分${time % 60}秒  ·  理智 ${Math.floor(this.player.sanity)}%  ·  怪物 ${this.enemies.enemies.length} 只`);
  }

  gameOver(reason) {
    this.running = false;
    this.player.unlock();
    this.player.exitHide();
    this.audio.stopHeartbeat();
    this.audio.playJumpScare();
    this.ui.showJumpScare(() => this.ui.showGameOver(reason));
  }

  updateInteraction() {
    if (this.player.isHiding) {
      this.ui.showInteractionPrompt(true, '按 E 离开藏身处');
      this.nearInteractable = this.environment.hidingSpots.find(h =>
        h.position.distanceTo(this.player.hideOrigin) < 2
      ) || this.environment.hidingSpots[0];
      return;
    }

    let nearest = null;
    let nearestDist = 2.2;
    const items = this.environment.interactables;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if ((item.userData.type === 'key' || item.userData.type === 'battery') && item.userData.collected) continue;
      const dist = this.player.position.distanceTo(item.position);
      if (dist < nearestDist) {
        nearest = item;
        nearestDist = dist;
      }
    }
    this.nearInteractable = nearest;
    if (!nearest) {
      this.ui.showInteractionPrompt(false);
      return;
    }
    const data = nearest.userData;
    let text = '按 E 交互';
    if (data.type === 'key') text = this.mode.id === 'hunt' ? '按 E 拾取遗物' : '按 E 拾取钥匙';
    if (data.type === 'battery') text = '按 E 拾取电池';
    if (data.type === 'note') text = '按 E 阅读纸条';
    if (data.type === 'hide') text = '按 E 躲进柜子';
    if (data.type === 'exit') {
      text = this.player.keys >= this.player.requiredKeys && this.mode.id !== 'survive'
        ? '按 E 逃离'
        : '按 E 检查大门';
    }
    this.ui.showInteractionPrompt(true, text);
  }

  updateHorrorEvents(delta) {
    this.scareTimer -= delta;
    this.blackoutTimer -= delta;
    this.ghostTimer -= delta;

    if (this.scareTimer <= 0) {
      const roll = Math.random();
      if (roll < 0.22) {
        this.audio.playDistantScream();
        this.ui.showMessage('远处有人在叫。或者那不是人。', 2200);
        this.player.drainSanity(4);
      } else if (roll < 0.4) {
        this.audio.playWhisper();
        this.player.drainSanity(2);
      } else if (roll < 0.55) {
        this.environment.flickeringLights.forEach(fl => { fl.light.intensity = 0; fl.nextFlicker = 0.15; });
        this.audio.playLightFlicker();
      } else if (roll < 0.7) {
        this.audio.playBehindSteps();
        this.ui.showMessage('背后有脚步。', 1800);
        this.player.drainSanity(5);
      } else if (roll < 0.85) {
        this.audio.playDrip();
        this.audio.playBreath();
      } else {
        this.audio.playRadioStatic(1.6);
        this.ui.showMessage('……听不清的广播……', 2000);
      }
      this.scareTimer = 7 + Math.random() * 14;
    }

    if (this.blackoutTimer <= 0 && !this.isBlackout) {
      this.isBlackout = true;
      this.environment.setLightsDim(0.08);
      this.ui.showMessage('灯全灭了。', 2000);
      this.player.drainSanity(8);
      setTimeout(() => {
        this.isBlackout = false;
        this.environment.restoreLights();
      }, 2800 + Math.random() * 3200);
      this.blackoutTimer = 32 + Math.random() * 24;
    }

    if (this.ghostTimer <= 0 && this.ghost.life <= 0) {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.ghost.mesh.position.copy(this.player.position).add(dir.multiplyScalar(6));
      this.ghost.mesh.position.y = 1.1;
      this.ghost.mesh.visible = true;
      this.ghost.mat.opacity = 0.7;
      this.ghost.life = 1.1;
      this.ghostTimer = 14 + Math.random() * 18;
      this.player.drainSanity(3);
    }
    if (this.ghost.life > 0) {
      this.ghost.life -= delta;
      this.ghost.mat.opacity = Math.max(0, this.ghost.life);
      if (this.ghost.life <= 0) this.ghost.mesh.visible = false;
    }
  }

  update(delta) {
    if (!this.running || this.paused) return;
    this.gameTime += delta;
    this.frame++;

    this.player.update(delta, this.environment, this.audio);
    const info = this.enemies.update(delta, this.player, this.environment);
    this.environment.update(delta, this.gameTime, this.frame);
    this.updateInteraction();
    if (this.frame % 2 === 0) this.updateHorrorEvents(delta * 2);

    if (this.mode.id === 'survive') {
      this.surviveLeft -= delta;
      this.waveTimer -= delta;
      if (this.waveTimer <= 0) {
        this.enemies.spawnExtra(Math.random() > 0.5 ? 'crawler' : 'whisperer', this.environment, this.player.position);
        this.ui.showMessage('又有东西醒了...', 2200);
        this.waveTimer = 36;
      }
      if (this.surviveLeft <= 0) {
        this.winGame();
        return;
      }
    }

    const dist = info.distance;
    if (dist < 14) {
      const intensity = 1 - dist / 14;
      this.ui.showHeartbeat(intensity);
      this.ui.updateVignette(intensity);
      this.audio.startHeartbeat(intensity);
      this.heartbeatOn = true;
      if (dist < 8) this.player.drainSanity(delta * 4);
      if (info.sanityAura) this.player.drainSanity(delta * info.sanityAura);
      if (info.state === 'chasing') this.ui.setStatusText(`${info.name} 在追你`);
      else this.ui.setStatusText(`${info.name} 就在附近...`);
    } else {
      this.ui.showHeartbeat(0);
      this.ui.updateVignette(this.player.getSanityEffect() * 0.4);
      if (this.heartbeatOn) {
        this.audio.stopHeartbeat();
        this.heartbeatOn = false;
      }
      this.ui.setStatusText(this.player.isHiding ? '它在外面走动。别出声。' : '');
    }

    const shake = this.player.getSanityEffect();
    if (shake > 0.25) {
      this.camera.position.x += (Math.random() - 0.5) * shake * 0.04;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.03;
    }

    if (info.attacking && dist < 2 && !this.player.isHiding) {
      this.gameOver(`${info.name} 抓住了你...`);
      return;
    }
    if (info.scareEnemy && !this.player.isHiding) {
      if (info.scareEnemy.triggerJumpScare()) {
        this.audio.playJumpScare();
        this.ui.showDamage();
        this.player.drainSanity(16);
      }
    }

    if (this.player.sanity <= 0) {
      this.gameOver('你的理智已经崩溃...');
      return;
    }

    const objective = this.mode.id === 'survive'
      ? '活下去'
      : this.player.keys >= this.player.requiredKeys
        ? '前往出口'
        : `收集 ${this.player.requiredKeys - this.player.keys} ${this.mode.id === 'hunt' ? '件遗物' : '把钥匙'}`;

    this.ui.updateHUD(this.player, {
      collectLabel: this.mode.id === 'hunt' ? '遗物' : '钥匙',
      timer: this.mode.id === 'survive' ? this.surviveLeft : this.gameTime,
      hideTimer: false,
      objective,
    });
  }

  animate() {
    this._animating = true;
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(0.05, this._clock.getDelta());
    if (this.running) {
      this.update(delta);
      this.renderer.render(this.scene, this.camera);
    }
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
