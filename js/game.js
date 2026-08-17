import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';

import { Environment } from './environment.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { HorrorAudio } from './audio.js';
import { UI } from './ui.js';

// 自定义暗角+色差着色器
const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignetteIntensity: { value: 0.5 },
    aberration: { value: 0.002 },
    darkness: { value: 0 },
    time: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignetteIntensity;
    uniform float aberration;
    uniform float darkness;
    uniform float time;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      
      // 色差
      float r = texture2D(tDiffuse, uv + vec2(aberration, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(aberration, 0.0)).b;
      vec3 color = vec3(r, g, b);
      
      // 暗角
      vec2 center = uv - 0.5;
      float dist = length(center);
      float vignette = smoothstep(0.8, 0.2, dist);
      color *= mix(1.0 - vignetteIntensity, 1.0, vignette);
      
      // 黑暗
      color *= 1.0 - darkness;
      
      // 轻微噪点
      float noise = fract(sin(dot(uv * time, vec2(12.9898, 78.233))) * 43758.5453);
      color += noise * 0.02;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.running = false;
    this.paused = false;
    this.gameTime = 0;
    this.startTime = 0;
    this.eventTimer = 0;
    this.scareTimer = 15;
    this.blackoutTimer = 30;
    this.isBlackout = false;
    this.nearInteractable = null;

    this.audio = new HorrorAudio();
    this.ui = new UI();

    this.initRenderer();
    this.initScene();
    this.initPostProcessing();

    this.player = new Player(this.camera, this.canvas);
    this.environment = new Environment(this.scene);
    this.enemy = new Enemy(this.scene, this.audio);

    this.setupUI();
    this.setupInteraction();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const gl = this.renderer.getContext();
    this.isSoftwareWebGL = gl.getParameter(gl.RENDERER)?.includes('SwiftShader') ||
      gl.getParameter(gl.RENDERER)?.includes('llvmpipe');

    this.renderer.shadowMap.enabled = !this.isSoftwareWebGL;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.useComposer = false;

    window.addEventListener('resize', () => this.onResize());
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0808);

    const hemi = new THREE.HemisphereLight(0x334455, 0x1a1510, 0.35);
    this.scene.add(hemi);

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.scene.add(this.camera);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    if (!this.isSoftwareWebGL) {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.3, 0.4, 0.85
      );
      this.composer.addPass(this.bloomPass);

      this.filmPass = new FilmPass(0.35, 0.025, 648, false);
      this.composer.addPass(this.filmPass);
    }

    this.horrorPass = new ShaderPass(HorrorShader);
    this.composer.addPass(this.horrorPass);
  }

  setupUI() {
    this.ui.onStart(() => this.startGame());
    this.ui.onRetry(() => this.startGame());
    this.ui.onMenu(() => this.showMenu());
  }

  setupInteraction() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.running && !this.paused) {
        this.handleInteraction();
      }
    });
  }

  async load() {
    this.ui.setLoadingProgress(10, '初始化渲染引擎...');
    await this.delay(200);

    this.ui.setLoadingProgress(30, '构建废弃精神病院...');
    this.envData = this.environment.build();
    await this.delay(300);

    this.ui.setLoadingProgress(50, '召唤黑暗中的存在...');
    this.enemy.create();
    await this.delay(300);

    this.ui.setLoadingProgress(70, '加载恐怖音效...');
    await this.audio.init();
    await this.delay(200);

    this.ui.setLoadingProgress(90, '准备就绪...');
    this.player.setPosition(
      this.envData.spawnPoint.x,
      this.envData.spawnPoint.y,
      this.envData.spawnPoint.z
    );
    this.camera.rotation.set(0, -Math.PI / 2, 0);

    // 启动菜单背景渲染循环
    this.menuPreviewActive = true;
    this.startPreviewLoop();
    await this.delay(300);

    this.ui.setLoadingProgress(100, '完成');
    await this.delay(500);

    this.ui.hideLoading();
    this.ui.showMenu();
  }

  startPreviewLoop() {
    const preview = () => {
      if (!this.menuPreviewActive && !this.running) return;
      if (this.menuPreviewActive) {
        this.environment.update(0.016, performance.now() * 0.001);
        this.render();
      }
      if (this.menuPreviewActive || this.running) {
        requestAnimationFrame(preview);
      }
    };
    requestAnimationFrame(preview);
  }

  startGame() {
    this.menuPreviewActive = false;
    this.ui.hideMenu();
    this.ui.hideHUD();
    this.ui.gameOverScreen.classList.add('hidden');
    this.ui.winScreen.classList.add('hidden');

    // 重置
    this.player.reset(this.envData.spawnPoint);
    this.enemy.reset();
    this.gameTime = 0;
    this.startTime = Date.now();
    this.eventTimer = 0;
    this.scareTimer = 15 + Math.random() * 10;
    this.blackoutTimer = 30;
    this.isBlackout = false;
    this.running = true;
    this.paused = false;

    // 重置钥匙
    this.environment.keys.forEach(key => {
      key.userData.collected = false;
      key.visible = true;
    });

    this.audio.resume();
    this.audio.startAmbient();
    this.audio.startWhispers();

    this.player.lock();

    this.player.controls.addEventListener('lock', () => {
      this.ui.showHUD();
      this.ui.showMessage('找到3把钥匙，逃离这里...', 4000);
    });

    this.player.controls.addEventListener('unlock', () => {
      if (this.running) {
        this.paused = true;
      }
    });

    this.animate();
  }

  showMenu() {
    this.running = false;
    this.player.unlock();
    this.audio.stopAmbient();
    this.audio.stopHeartbeat();
    this.audio.stopWhispers();
    this.ui.showMenu();
  }

  handleInteraction() {
    if (!this.nearInteractable) return;

    const data = this.nearInteractable.userData;

    if (data.type === 'key' && !data.collected) {
      data.collected = true;
      this.nearInteractable.visible = false;
      this.player.collectKey();
      this.audio.playKeyPickup();
      this.ui.showMessage(`找到钥匙！(${this.player.keys}/3)`, 2000);

      if (this.player.keys >= 3) {
        this.ui.showMessage('所有钥匙已收集！前往出口！', 4000);
      }
    }

    if (data.type === 'door' || data.type === 'exit') {
      if (data.type === 'exit') {
        if (this.player.keys >= 3) {
          data.open = true;
          this.audio.playDoorCreak();
          this.winGame();
        } else {
          this.ui.showMessage(`需要 ${3 - this.player.keys} 把钥匙才能打开`, 2000);
        }
      } else if (!data.open) {
        data.open = true;
        this.audio.playDoorCreak();
        // 旋转门
        this.nearInteractable.rotation.y += Math.PI / 2;
      }
    }
  }

  winGame() {
    this.running = false;
    this.player.unlock();
    this.audio.stopHeartbeat();
    const time = Math.floor((Date.now() - this.startTime) / 1000);
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    this.ui.showWin(`用时: ${minutes}分${seconds}秒 | 剩余理智: ${Math.floor(this.player.sanity)}%`);
  }

  gameOver(reason) {
    this.running = false;
    this.player.unlock();
    this.audio.stopHeartbeat();
    this.audio.playJumpScare();
    this.ui.showJumpScare(() => {
      this.ui.showGameOver(reason);
    });
  }

  updateInteraction() {
    let nearest = null;
    let nearestDist = 2.5;

    this.environment.interactables.forEach(item => {
      if (item.userData.type === 'key' && item.userData.collected) return;
      const dist = this.player.position.distanceTo(item.position);
      if (dist < nearestDist) {
        nearest = item;
        nearestDist = dist;
      }
    });

    this.nearInteractable = nearest;

    if (nearest) {
      const data = nearest.userData;
      let text = '按 E 交互';
      if (data.type === 'key') text = '按 E 拾取钥匙';
      if (data.type === 'exit') text = this.player.keys >= 3 ? '按 E 逃离' : '按 E 检查大门 (需要钥匙)';
      if (data.type === 'door') text = data.open ? '' : '按 E 开门';
      this.ui.showInteractionPrompt(true, text);
    } else {
      this.ui.showInteractionPrompt(false);
    }
  }

  updateHorrorEvents(delta) {
    this.eventTimer += delta;
    this.scareTimer -= delta;
    this.blackoutTimer -= delta;

    // 随机恐怖事件
    if (this.scareTimer <= 0) {
      const event = Math.random();
      if (event < 0.3) {
        this.audio.playDistantScream();
        this.ui.showMessage('...你听到了尖叫声...', 2000);
        this.player.drainSanity(5);
      } else if (event < 0.5) {
        this.audio.playWhisper();
        this.player.drainSanity(3);
      } else if (event < 0.7) {
        // 灯光闪烁
        this.environment.flickeringLights.forEach(fl => {
          fl.light.intensity = 0;
          setTimeout(() => { fl.light.intensity = fl.baseIntensity; }, 200 + Math.random() * 500);
        });
        this.audio.playLightFlicker();
      }
      this.scareTimer = 10 + Math.random() * 20;
    }

    // 停电事件
    if (this.blackoutTimer <= 0 && !this.isBlackout) {
      this.isBlackout = true;
      this.environment.lights.forEach(l => { l.intensity *= 0.1; });
      this.ui.showMessage('灯光熄灭了...', 2000);
      this.player.drainSanity(10);

      setTimeout(() => {
        this.isBlackout = false;
        this.environment.lights.forEach((l, i) => {
          l.intensity = this.environment.flickeringLights.find(f => f.light === l)?.baseIntensity || 0.6;
        });
      }, 3000 + Math.random() * 5000);

      this.blackoutTimer = 40 + Math.random() * 30;
    }
  }

  update(delta) {
    if (!this.running || this.paused) return;

    this.gameTime += delta;

    const collisionBoxes = this.environment.getCollisionBoxes();
    this.player.update(delta, collisionBoxes, this.audio);

    const enemyInfo = this.enemy.update(
      delta,
      this.player.position,
      this.player.isCrouching,
      this.player.isRunning,
      this.player.flashlightOn,
      this.environment.walls
    );

    this.environment.update(delta, this.gameTime);
    this.updateInteraction();
    this.updateHorrorEvents(delta);

    // 敌人接近效果
    const dist = enemyInfo.distance;
    if (dist < 15) {
      const intensity = 1 - dist / 15;
      this.ui.showHeartbeat(intensity);
      this.ui.updateVignette(intensity);
      this.audio.startHeartbeat(intensity);

      // 理智下降
      if (dist < 8) {
        this.player.drainSanity(delta * 5);
      }

      if (enemyInfo.state === 'chasing') {
        this.ui.setStatusText('它在追你！快跑！');
      } else if (enemyInfo.state === 'stalking') {
        this.ui.setStatusText('你感觉到了... 什么东西在附近...');
      }
    } else {
      this.ui.showHeartbeat(0);
      this.ui.updateVignette(0);
      this.audio.stopHeartbeat();
      this.ui.setStatusText('');
    }

    // 攻击判定
    if (enemyInfo.attacking && dist < 2) {
      this.gameOver('影魔抓住了你...');
      return;
    }

    // 惊吓跳跃
    if (dist < 3 && enemyInfo.state === 'chasing' && !this.enemy.jumpscareTriggered) {
      if (this.enemy.triggerJumpScare()) {
        this.audio.playJumpScare();
        this.ui.showDamage();
        this.player.drainSanity(20);
      }
    }

    // 更新 HUD
    this.ui.updateHUD(this.player);

    // 理智耗尽
    if (this.player.sanity <= 0) {
      this.gameOver('你的理智已经崩溃...');
      return;
    }

    // 后处理效果
    const sanityEffect = this.player.getSanityEffect();
    if (this.horrorPass?.uniforms) {
      this.horrorPass.uniforms.vignetteIntensity.value = 0.4 + sanityEffect * 0.4;
      this.horrorPass.uniforms.aberration.value = 0.001 + sanityEffect * 0.005;
      this.horrorPass.uniforms.darkness.value = sanityEffect * 0.3;
      this.horrorPass.uniforms.time.value = this.gameTime;
    }

    if (this.filmPass?.uniforms?.noiseIntensity) {
      this.filmPass.uniforms.noiseIntensity.value = 0.2 + sanityEffect * 0.3;
    }
  }

  render() {
    try {
      if (this.useComposer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } catch {
      this.useComposer = false;
      this.renderer.render(this.scene, this.camera);
    }
  }

  animate() {
    if (!this.running) return;

    requestAnimationFrame(() => this.animate());

    const delta = Math.min(0.05, this.clock.getDelta());
    this.update(delta);
    this.render();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get clock() {
    if (!this._clock) this._clock = new THREE.Clock();
    return this._clock;
  }
}
