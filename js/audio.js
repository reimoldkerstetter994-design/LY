// 程序化恐怖音效引擎 —— 全部用 Web Audio 合成,无需音频文件

export class HorrorAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.started = false;
    this._heartTimer = 0;
    this.heartRate = 0;      // 0~1,由主循环根据鬼的距离设置
    this.staticLevel = 0;    // 0~1,近距离静电噪声
    this._whisperCooldown = 8;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    // 轻微压限防炸耳
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this._noiseBuffer = this._makeNoise();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // 棕色噪声(更低沉)
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  _whiteNoise(duration) {
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ------- 持续环境声 -------
  startAmbience() {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx;

    // 低频嗡鸣(建筑电流声)
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 48;
    const drone2 = ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 48.7; // 拍频制造不安感
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.035;
    drone.connect(droneGain); drone2.connect(droneGain);
    droneGain.connect(this.master);
    drone.start(); drone2.start();

    // 风声(棕噪 + 低通 + 缓慢波动)
    const wind = ctx.createBufferSource();
    wind.buffer = this._noiseBuffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 320;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain); lfoGain.connect(windGain.gain);
    wind.connect(windFilter); windFilter.connect(windGain);
    windGain.connect(this.master);
    wind.start(); lfo.start();

    // 静电噪声通道(音量由 staticLevel 控制)
    const stat = ctx.createBufferSource();
    stat.buffer = this._whiteNoise(2);
    stat.loop = true;
    const statFilter = ctx.createBiquadFilter();
    statFilter.type = 'highpass';
    statFilter.frequency.value = 1400;
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0;
    stat.connect(statFilter); statFilter.connect(this.staticGain);
    this.staticGain.connect(this.master);
    stat.start();
  }

  // 主循环每帧调用
  update(dt) {
    if (!this.started) return;
    const t = this.ctx.currentTime;

    // 静电
    this.staticGain.gain.setTargetAtTime(this.staticLevel * 0.16, t, 0.1);

    // 心跳
    if (this.heartRate > 0.02) {
      this._heartTimer -= dt;
      if (this._heartTimer <= 0) {
        const interval = 1.15 - this.heartRate * 0.72; // 越近越快
        this._heartTimer = interval;
        this._heartBeat(0.14 + this.heartRate * 0.3);
        setTimeout(() => this._heartBeat(0.1 + this.heartRate * 0.22), interval * 260);
      }
    }

    // 偶发环境怪声
    this._whisperCooldown -= dt;
    if (this._whisperCooldown <= 0) {
      this._whisperCooldown = 14 + Math.random() * 26;
      const roll = Math.random();
      if (roll < 0.35) this.creak();
      else if (roll < 0.6) this.distantBang();
      else if (roll < 0.8) this.whisper();
      else this.pipeKnock();
    }
  }

  _heartBeat(vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.18);
  }

  // ------- 单次音效 -------
  footstep(running, wet = false) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._whiteNoise(0.09);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = wet ? 900 : (420 + Math.random() * 160);
    const g = ctx.createGain();
    const vol = running ? 0.16 : 0.08;
    g.gain.setValueAtTime(vol + Math.random() * 0.03, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  ghostStep() {
    // 沉重拖拽声
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._whiteNoise(0.3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 190;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  pickup() {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(920, t);
    o.frequency.exponentialRampToValueAtTime(1380, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.3);
  }

  fusePlug() {
    const ctx = this.ctx, t = ctx.currentTime;
    // 电流接通声
    const src = ctx.createBufferSource();
    src.buffer = this._whiteNoise(0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 120;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.07, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g2); g2.connect(this.master);
    o.start(t); o.stop(t + 0.22);
  }

  flashlightClick() {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._whiteNoise(0.03);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  creak() {
    // 木头/门吱呀声
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = 170 + Math.random() * 130;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (0.6 + Math.random() * 0.3), t + 1.1);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = f0 * 2;
    f.Q.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.25);
  }

  distantBang() {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._whiteNoise(0.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 130;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  pipeKnock() {
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * (0.24 + Math.random() * 0.1);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 620 + Math.random() * 200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, tt);
      g.gain.exponentialRampToValueAtTime(0.001, tt + 0.12);
      o.connect(g); g.connect(this.master);
      o.start(tt); o.stop(tt + 0.14);
    }
  }

  whisper() {
    // 气声耳语:带通白噪 + 颤动包络
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this._whiteNoise(2.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1500, t);
    f.Q.value = 3.5;
    // 模拟音节
    let tt = t;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 9; i++) {
      const dur = 0.08 + Math.random() * 0.16;
      g.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.028, tt + dur * 0.4);
      g.gain.linearRampToValueAtTime(0.002, tt + dur);
      f.frequency.linearRampToValueAtTime(900 + Math.random() * 1600, tt + dur);
      tt += dur;
    }
    g.gain.linearRampToValueAtTime(0.0001, tt + 0.1);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(tt + 0.2);
  }

  scareSting() {
    // 突发弦乐式刺响(发现鬼时)
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = 480 + i * 130 + Math.random() * 60;
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.11, t + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.028, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 1.05);
    }
  }

  jumpscare() {
    const ctx = this.ctx, t = ctx.currentTime;
    // 尖叫层
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f0 = 700 + Math.random() * 900;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.4 + Math.random() * 0.8), t + 0.5);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 1.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 1.45);
    }
    // 噪声爆
    const src = ctx.createBufferSource();
    src.buffer = this._whiteNoise(1.4);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.3, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    src.connect(g2); g2.connect(this.master);
    src.start(t);
    // 超低音撞击
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(70, t);
    o2.frequency.exponentialRampToValueAtTime(26, t + 1.2);
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.5, t);
    g3.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o2.connect(g3); g3.connect(this.master);
    o2.start(t); o2.stop(t + 1.35);
  }

  doorOpen() {
    const ctx = this.ctx, t = ctx.currentTime;
    // 沉重金属门
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, t);
    o.frequency.linearRampToValueAtTime(38, t + 1.6);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.8);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 1.85);
    this.creak();
  }
}
