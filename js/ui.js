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
    this.pauseScreen = document.getElementById('pause-screen');
    this.loadingFill = document.getElementById('loading-fill');
    this.loadingText = document.getElementById('loading-text');
    this.keysCount = document.getElementById('keys-count');
    this.keysLabel = document.getElementById('keys-label');
    this.sanityBar = document.getElementById('sanity-bar');
    this.batteryBar = document.getElementById('battery-bar');
    this.staminaBar = document.getElementById('stamina-bar');
    this.timerEl = document.getElementById('timer-count');
    this.objectiveEl = document.getElementById('objective-text');
    this.interactionPrompt = document.getElementById('interaction-prompt');
    this.messageBox = document.getElementById('message-box');
    this.statusText = document.getElementById('status-text');
    this.heartbeatIndicator = document.getElementById('heartbeat-indicator');
    this.damageOverlay = document.getElementById('damage-overlay');
    this.sanityEffect = document.getElementById('sanity-effect');
    this.jumpscareOverlay = document.getElementById('jumpscare-overlay');
    this.vignette = document.getElementById('vignette');
    this.modeDesc = document.getElementById('mode-desc');

    this.selectedMap = 'hospital';
    this.selectedMode = 'escape';
    this.messageTimeout = null;
    this.onStartCallback = null;
    this.onRetryCallback = null;
    this.onMenuCallback = null;
    this._hudCache = {};
    this._heartShown = false;
    this._lastPrompt = '';

    this.setupButtons();
    this.setupSelectors();
  }

  setupButtons() {
    document.getElementById('btn-start').addEventListener('click', () => this.onStartCallback?.());
    document.getElementById('btn-retry').addEventListener('click', () => this.onRetryCallback?.());
    document.getElementById('btn-retry-win').addEventListener('click', () => this.onRetryCallback?.());
    document.querySelectorAll('[data-to-menu]').forEach(btn => {
      btn.addEventListener('click', () => this.onMenuCallback?.());
    });
    document.getElementById('btn-resume')?.addEventListener('click', () => this.onResumeCallback?.());
  }

  setupSelectors() {
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMode = btn.dataset.mode;
        const desc = {
          escape: '收集全部钥匙，打开出口逃离。蹲下、躲进柜子可以降低被发现的概率。',
          survive: '在倒计时结束前活下来。时间越久，苏醒的东西越多。',
          hunt: '每拿一件遗物就会再唤醒一只怪物。拿齐后冲向血红的大门。',
        };
        if (this.modeDesc) this.modeDesc.textContent = desc[this.selectedMode];
      });
    });
    document.querySelectorAll('[data-map]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-map]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMap = btn.dataset.map;
      });
    });
  }

  setLoadingProgress(percent, text) {
    this.loadingFill.style.width = `${percent}%`;
    if (text) this.loadingText.textContent = text;
  }

  hideLoading() { this.loadingScreen.classList.add('hidden'); }
  showMenu() {
    this.menuScreen.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.gameOverScreen.classList.add('hidden');
    this.winScreen.classList.add('hidden');
    this.pauseScreen?.classList.add('hidden');
  }
  hideMenu() { this.menuScreen.classList.add('hidden'); }
  showHUD() { this.hud.classList.remove('hidden'); }
  hideHUD() { this.hud.classList.add('hidden'); }

  showPause() { this.pauseScreen?.classList.remove('hidden'); }
  hidePause() { this.pauseScreen?.classList.add('hidden'); }

  updateHUD(player, extra = {}) {
    const need = player.requiredKeys;
    const keyText = `${player.keys} / ${need}`;
    if (this._hudCache.keys !== keyText) {
      this.keysCount.textContent = keyText;
      this._hudCache.keys = keyText;
    }
    if (extra.collectLabel && this._hudCache.label !== extra.collectLabel) {
      this.keysLabel.textContent = extra.collectLabel;
      this._hudCache.label = extra.collectLabel;
    }
    this.sanityBar.style.width = `${player.sanity}%`;
    this.batteryBar.style.width = `${player.battery}%`;
    if (this.staminaBar) this.staminaBar.style.width = `${player.stamina}%`;

    if (extra.timer != null && this.timerEl) {
      const m = Math.floor(extra.timer / 60);
      const s = Math.floor(extra.timer % 60);
      this.timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      this.timerEl.parentElement.classList.toggle('hidden', extra.hideTimer);
    }

    if (extra.objective && this.objectiveEl && this._hudCache.obj !== extra.objective) {
      this.objectiveEl.textContent = extra.objective;
      this._hudCache.obj = extra.objective;
    }

    const sanityEffect = player.getSanityEffect();
    if (sanityEffect > 0) {
      this.sanityEffect.style.opacity = String(sanityEffect * 0.55);
      const t = Date.now() * 0.001;
      this.sanityEffect.style.background = `radial-gradient(ellipse at ${50 + Math.sin(t) * 22}% ${50 + Math.cos(t * 1.7) * 18}%, rgba(90,0,140,0.35) 0%, transparent 70%)`;
    } else if (this.sanityEffect.style.opacity !== '0') {
      this.sanityEffect.style.opacity = '0';
    }

    this.batteryBar.style.background = player.battery < 20
      ? 'linear-gradient(90deg, #880000, #ff0000)'
      : 'linear-gradient(90deg, #886600, #ffcc00)';
  }

  showInteractionPrompt(show, text = '按 E 交互') {
    if (!show) {
      if (this._lastPrompt !== '') {
        this.interactionPrompt.classList.add('hidden');
        this._lastPrompt = '';
      }
      return;
    }
    if (this._lastPrompt !== text) {
      this.interactionPrompt.textContent = text;
      this.interactionPrompt.classList.remove('hidden');
      this._lastPrompt = text;
    }
  }

  showMessage(text, duration = 3000) {
    this.messageBox.textContent = text;
    this.messageBox.classList.remove('hidden');
    if (this.messageTimeout) clearTimeout(this.messageTimeout);
    this.messageTimeout = setTimeout(() => this.messageBox.classList.add('hidden'), duration);
  }

  setStatusText(text) {
    if (this._hudCache.status !== text) {
      this.statusText.textContent = text;
      this._hudCache.status = text;
    }
  }

  showHeartbeat(intensity) {
    if (intensity > 0.3) {
      if (!this._heartShown) {
        this.heartbeatIndicator.classList.remove('hidden');
        this._heartShown = true;
      }
      this.heartbeatIndicator.style.opacity = intensity;
      this.heartbeatIndicator.style.animationDuration = `${Math.max(0.3, 0.8 - intensity * 0.5)}s`;
    } else if (this._heartShown) {
      this.heartbeatIndicator.classList.add('hidden');
      this._heartShown = false;
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
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.ellipse(320, 220, 100, 140, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff0000';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.ellipse(285, 190, 22, 30, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(355, 190, 22, 30, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1a0000';
    ctx.beginPath();
    ctx.ellipse(320, 270, 34, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    document.getElementById('jumpscare-img').src = canvas.toDataURL();
    setTimeout(() => {
      this.jumpscareOverlay.classList.add('hidden');
      callback?.();
    }, 700);
  }

  showGameOver(message) {
    this.hud.classList.add('hidden');
    this.gameOverScreen.classList.remove('hidden');
    document.getElementById('end-message').textContent = message || '它在黑暗中找到了你...';
  }

  showWin(stats) {
    this.hud.classList.add('hidden');
    this.winScreen.classList.remove('hidden');
    if (stats) document.getElementById('win-stats').textContent = stats;
  }

  updateVignette(intensity) {
    const size = 64 - intensity * 16;
    this.vignette.style.background = `radial-gradient(ellipse at center, transparent ${size}%, rgba(0,0,0,${0.28 + intensity * 0.35}) 100%)`;
  }

  onStart(cb) { this.onStartCallback = cb; }
  onRetry(cb) { this.onRetryCallback = cb; }
  onMenu(cb) { this.onMenuCallback = cb; }
  onResume(cb) { this.onResumeCallback = cb; }
}
