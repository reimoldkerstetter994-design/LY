/**
 * UI 管理系统
 */
export class UI {
  constructor() {
    this.loadingScreen = document.getElementById('loading-screen');
    this.menuScreen = document.getElementById('menu-screen');
    this.hud = document.getElementById('hud');
    this.gameOverScreen = document.getElementById('game-over-screen');
    this.winScreen = document.getElementById('win-screen');
    this.loadingFill = document.getElementById('loading-fill');
    this.loadingText = document.getElementById('loading-text');
    this.keysCount = document.getElementById('keys-count');
    this.sanityBar = document.getElementById('sanity-bar');
    this.batteryBar = document.getElementById('battery-bar');
    this.interactionPrompt = document.getElementById('interaction-prompt');
    this.messageBox = document.getElementById('message-box');
    this.statusText = document.getElementById('status-text');
    this.heartbeatIndicator = document.getElementById('heartbeat-indicator');
    this.damageOverlay = document.getElementById('damage-overlay');
    this.sanityEffect = document.getElementById('sanity-effect');
    this.jumpscareOverlay = document.getElementById('jumpscare-overlay');
    this.vignette = document.getElementById('vignette');

    this.messageTimeout = null;
    this.onStartCallback = null;
    this.onRetryCallback = null;
    this.onMenuCallback = null;

    this.setupButtons();
  }

  setupButtons() {
    document.getElementById('btn-start').addEventListener('click', () => {
      if (this.onStartCallback) this.onStartCallback();
    });

    document.getElementById('btn-retry').addEventListener('click', () => {
      if (this.onRetryCallback) this.onRetryCallback();
    });

    document.getElementById('btn-retry-win').addEventListener('click', () => {
      if (this.onRetryCallback) this.onRetryCallback();
    });

    document.getElementById('btn-menu').addEventListener('click', () => {
      if (this.onMenuCallback) this.onMenuCallback();
    });
  }

  setLoadingProgress(percent, text) {
    this.loadingFill.style.width = `${percent}%`;
    if (text) this.loadingText.textContent = text;
  }

  hideLoading() {
    this.loadingScreen.classList.add('hidden');
  }

  showMenu() {
    this.menuScreen.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.gameOverScreen.classList.add('hidden');
    this.winScreen.classList.add('hidden');
  }

  hideMenu() {
    this.menuScreen.classList.add('hidden');
  }

  showHUD() {
    this.hud.classList.remove('hidden');
  }

  hideHUD() {
    this.hud.classList.add('hidden');
  }

  updateHUD(player) {
    this.keysCount.textContent = `${player.keys} / 3`;
    this.sanityBar.style.width = `${player.sanity}%`;
    this.batteryBar.style.width = `${player.battery}%`;

    // 低理智效果
    const sanityEffect = player.getSanityEffect();
    if (sanityEffect > 0) {
      this.sanityEffect.style.opacity = sanityEffect * 0.5;
      this.sanityEffect.style.background = `radial-gradient(ellipse at ${50 + Math.sin(Date.now() * 0.001) * 20}% ${50 + Math.cos(Date.now() * 0.002) * 20}%, rgba(100,0,150,0.3) 0%, transparent 70%)`;
    } else {
      this.sanityEffect.style.opacity = 0;
    }

    // 低电量警告
    if (player.battery < 20) {
      this.batteryBar.style.background = 'linear-gradient(90deg, #880000, #ff0000)';
    }
  }

  showInteractionPrompt(show, text = '按 E 交互') {
    if (show) {
      this.interactionPrompt.textContent = text;
      this.interactionPrompt.classList.remove('hidden');
    } else {
      this.interactionPrompt.classList.add('hidden');
    }
  }

  showMessage(text, duration = 3000) {
    this.messageBox.textContent = text;
    this.messageBox.classList.remove('hidden');

    if (this.messageTimeout) clearTimeout(this.messageTimeout);
    this.messageTimeout = setTimeout(() => {
      this.messageBox.classList.add('hidden');
    }, duration);
  }

  setStatusText(text) {
    this.statusText.textContent = text;
  }

  showHeartbeat(intensity) {
    if (intensity > 0.3) {
      this.heartbeatIndicator.classList.remove('hidden');
      this.heartbeatIndicator.style.opacity = intensity;
      this.heartbeatIndicator.style.animationDuration = `${Math.max(0.3, 0.8 - intensity * 0.5)}s`;
    } else {
      this.heartbeatIndicator.classList.add('hidden');
    }
  }

  showDamage() {
    this.damageOverlay.style.opacity = '0.8';
    document.body.classList.add('shake');
    setTimeout(() => {
      this.damageOverlay.style.opacity = '0';
      document.body.classList.remove('shake');
    }, 500);
  }

  showJumpScare(callback) {
    this.jumpscareOverlay.classList.remove('hidden');

    // 创建惊吓画面
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    // 黑色背景
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 800, 600);

    // 恐怖面孔
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.ellipse(400, 280, 120, 160, 0, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛
    ctx.fillStyle = '#ff0000';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 30;
    ctx.beginPath();
    ctx.ellipse(360, 240, 25, 35, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(440, 240, 25, 35, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 瞳孔
    ctx.fillStyle = '#000';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(360, 240, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(440, 240, 8, 0, Math.PI * 2);
    ctx.fill();

    // 嘴巴
    ctx.fillStyle = '#1a0000';
    ctx.beginPath();
    ctx.ellipse(400, 330, 40, 60, 0, 0, Math.PI * 2);
    ctx.fill();

    // 牙齿
    ctx.fillStyle = '#ddd';
    for (let i = 0; i < 8; i++) {
      const angle = -0.5 + (i / 7) * 1;
      const x = 400 + Math.sin(angle) * 30;
      const y = 310 + Math.cos(angle) * 15;
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x, y + 15);
      ctx.lineTo(x + 4, y);
      ctx.fill();
    }

    const img = document.getElementById('jumpscare-img');
    img.src = canvas.toDataURL();

    setTimeout(() => {
      this.jumpscareOverlay.classList.add('hidden');
      if (callback) callback();
    }, 800);
  }

  showGameOver(message) {
    this.hud.classList.add('hidden');
    this.gameOverScreen.classList.remove('hidden');
    document.getElementById('end-message').textContent = message || '它在黑暗中找到了你...';
  }

  showWin(stats) {
    this.hud.classList.add('hidden');
    this.winScreen.classList.remove('hidden');
    if (stats) {
      document.getElementById('win-stats').textContent = stats;
    }
  }

  updateVignette(intensity) {
    const size = 40 - intensity * 20;
    this.vignette.style.background = `radial-gradient(ellipse at center, transparent ${size}%, rgba(0,0,0,${0.6 + intensity * 0.3}) 100%)`;
  }

  onStart(callback) { this.onStartCallback = callback; }
  onRetry(callback) { this.onRetryCallback = callback; }
  onMenu(callback) { this.onMenuCallback = callback; }
}
