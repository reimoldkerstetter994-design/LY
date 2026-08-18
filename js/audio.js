/**
 * 程序化恐怖音效系统 - 无需外部音频文件
 */
export class HorrorAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambientGain = null;
    this.sfxGain = null;
    this.initialized = false;
    this.ambientNodes = [];
    this.heartbeatInterval = null;
    this.whisperInterval = null;
    this.enabled = true;
  }

  async init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.7;
    this.masterGain.connect(this.ctx.destination);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.3;
    this.ambientGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.masterGain);

    this.initialized = true;
  }

  resume() {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // 低频环境嗡鸣
  startAmbient() {
    if (!this.initialized) return;
    this.stopAmbient();

    const drone = this.createDrone(55, 0.15);
    const drone2 = this.createDrone(82.5, 0.08);
    const wind = this.createWindNoise(0.06);
    const hum = this.createElectricalHum();

    this.ambientNodes = [drone, drone2, wind, hum];
  }

  createDrone(freq, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.value = freq;
    filter.type = 'lowpass';
    filter.frequency.value = 200;
    gain.gain.value = volume;

    // 缓慢频率漂移
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.1 + Math.random() * 0.2;
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start();

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    osc.start();

    return { osc, gain, lfo, filter };
  }

  createWindNoise(volume) {
    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    source.start();

    return { source, gain, filter };
  }

  createElectricalHum() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 60;
    gain.gain.value = 0.02;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 120;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    osc.start();

    // 随机闪烁
    const flicker = () => {
      if (!this.initialized) return;
      gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        Math.random() > 0.7 ? 0.06 : 0.01,
        this.ctx.currentTime + 0.05
      );
      setTimeout(flicker, 200 + Math.random() * 3000);
    };
    flicker();

    return { osc, gain };
  }

  stopAmbient() {
    this.ambientNodes.forEach(node => {
      try {
        node.osc?.stop();
        node.source?.stop();
        node.lfo?.stop();
      } catch {}
    });
    this.ambientNodes = [];
  }

  // 脚步声
  playFootstep(running = false) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.value = running ? 80 + Math.random() * 40 : 60 + Math.random() * 30;
    filter.type = 'lowpass';
    filter.frequency.value = running ? 400 : 250;

    gain.gain.setValueAtTime(running ? 0.15 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (running ? 0.15 : 0.2));

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // 心跳声
  startHeartbeat(intensity = 0.5) {
    const next = Math.round(intensity * 10) / 10;
    if (this._hbIntensity === next && this.heartbeatInterval) return;
    this._hbIntensity = next;
    this.stopHeartbeat();
    const beat = () => {
      if (!this.initialized) return;
      this.playHeartbeat(next);
    };
    const interval = Math.max(320, 920 - next * 600);
    this.heartbeatInterval = setInterval(beat, interval);
    beat();
  }

  playHeartbeat(intensity = 0.5) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const vol = 0.1 + intensity * 0.3;

    [0, 0.15].forEach(delay => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, now + delay);
      osc.frequency.exponentialRampToValueAtTime(40, now + delay + 0.1);
      gain.gain.setValueAtTime(vol, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.15);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + delay);
      osc.stop(now + delay + 0.2);
    });
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // 低语声
  startWhispers() {
    this.stopWhispers();
    const whisper = () => {
      if (!this.initialized) return;
      this.playWhisper();
      this.whisperInterval = setTimeout(whisper, 8000 + Math.random() * 20000);
    };
    this.whisperInterval = setTimeout(whisper, 5000);
  }

  playWhisper() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const duration = 1 + Math.random() * 2;

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.ctx.sampleRate;
      data[i] = Math.sin(t * (200 + Math.random() * 100)) *
                 Math.sin(t * 3) *
                 (Math.random() * 0.3) *
                 Math.sin(t * Math.PI / duration);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400 + Math.random() * 600;
    filter.Q.value = 5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.3);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.random() * 2 - 1;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(this.sfxGain);
    source.start(now);
  }

  stopWhispers() {
    if (this.whisperInterval) {
      clearTimeout(this.whisperInterval);
      this.whisperInterval = null;
    }
  }

  // 惊吓音效
  playJumpScare() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;

    // 刺耳尖叫
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.5);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 1);

    // 低频冲击
    const bass = this.ctx.createOscillator();
    const bassGain = this.ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(80, now);
    bass.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    bassGain.gain.setValueAtTime(0.6, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    bass.connect(bassGain);
    bassGain.connect(this.sfxGain);
    bass.start(now);
    bass.stop(now + 0.6);

    // 噪音爆发
    this.playNoiseBurst(0.4, 0.3);
  }

  playNoiseBurst(volume, duration) {
    const now = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start(now);
  }

  // 门吱呀声
  playDoorCreak() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.linearRampToValueAtTime(150, now + 1.5);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 2.5);
  }

  // 拾取钥匙
  playKeyPickup() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    [800, 1200, 1600].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.4);
    });
  }

  // 灯光闪烁音效
  playLightFlicker() {
    this.playNoiseBurst(0.05, 0.1);
  }

  // 敌人脚步声
  playEnemyFootstep() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 40 + Math.random() * 20;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  // 远处尖叫
  playDistantScream() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const duration = 2;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(400, now + 0.5);
    osc.frequency.linearRampToValueAtTime(800, now + 1);
    osc.frequency.exponentialRampToValueAtTime(300, now + duration);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.2);
    gain.gain.linearRampToValueAtTime(0.05, now + 1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 2;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    osc.start(now);
    osc.stop(now + duration + 0.1);
  }

  playLocker() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.25);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  playRadioStatic(duration = 1.2) {
    this.playNoiseBurst(0.07, duration);
  }

  playDrip() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playBehindSteps() {
    if (!this.initialized) return;
    let i = 0;
    const tick = () => {
      this.playEnemyFootstep();
      i++;
      if (i < 4) setTimeout(tick, 380);
    };
    tick();
  }

  playBreath() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.value = 90;
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.4);
    gain.gain.linearRampToValueAtTime(0.001, now + 1.2);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 1.3);
  }

  destroy() {
    this.stopAmbient();
    this.stopHeartbeat();
    this.stopWhispers();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
