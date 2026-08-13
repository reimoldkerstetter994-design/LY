(function (global) {
  "use strict";

  function HorrorAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.ctx.destination);

    this.amb = this.ctx.createGain();
    this.amb.gain.value = 0.22;
    this.amb.connect(this.master);

    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);

    this.noise = this.makeNoise(2);
    this.fear = 0;
    this._hb = 0;
    this._breath = 0;
    this._started = false;
    this.monsterPanner = this.ctx.createPanner();
    this.monsterPanner.panningModel = "HRTF";
    this.monsterPanner.distanceModel = "inverse";
    this.monsterPanner.refDistance = 2;
    this.monsterPanner.maxDistance = 40;
    this.monsterPanner.rolloffFactor = 1.1;
    this.monsterPanner.connect(this.sfx);
  }

  HorrorAudio.prototype.makeNoise = function (seconds) {
    const n = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };

  HorrorAudio.prototype.resume = function () {
    if (this.ctx.state === "suspended") return this.ctx.resume();
    return Promise.resolve();
  };

  HorrorAudio.prototype.setVolume = function (v) {
    this.master.gain.value = v;
  };

  HorrorAudio.prototype.startAmbient = function () {
    if (this._started) return;
    this._started = true;
    const ctx = this.ctx;

    const drone = ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 46;
    const droneG = ctx.createGain();
    droneG.gain.value = 0.55;
    drone.connect(droneG).connect(this.amb);
    drone.start();

    const drone2 = ctx.createOscillator();
    drone2.type = "triangle";
    drone2.frequency.value = 52.7;
    const d2g = ctx.createGain();
    d2g.gain.value = 0.12;
    drone2.connect(d2g).connect(this.amb);
    drone2.start();

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 180;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.08;
    src.connect(bp).connect(ng).connect(this.amb);
    src.start();

    const hi = ctx.createOscillator();
    hi.type = "sine";
    hi.frequency.value = 2400;
    const hg = ctx.createGain();
    hg.gain.value = 0.004;
    hi.connect(hg).connect(this.amb);
    hi.start();

    this._drone = drone;
    this._bp = bp;
  };

  HorrorAudio.prototype.tone = function (freq, type, dur, gain, atk, peak) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type || "sine";
    o.frequency.value = freq;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gain, now + (atk || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    if (peak) o.frequency.linearRampToValueAtTime(peak, now + dur);
    o.connect(g).connect(this.sfx);
    o.start(now);
    o.stop(now + dur + 0.05);
  };

  HorrorAudio.prototype.noiseBurst = function (dur, freq, q, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(now);
    src.stop(now + dur + 0.02);
  };

  HorrorAudio.prototype.footstep = function (running, wet) {
    const f = running ? 180 : 140;
    this.noiseBurst(running ? 0.09 : 0.12, f + Math.random() * 40, 2.2, running ? 0.22 : 0.14);
    if (wet) this.noiseBurst(0.08, 900, 0.8, 0.04);
  };

  HorrorAudio.prototype.door = function (open) {
    this.tone(open ? 140 : 90, "triangle", 0.55, 0.12, 0.02, open ? 80 : 60);
    this.noiseBurst(0.4, 420, 1.4, 0.1);
  };

  HorrorAudio.prototype.pickup = function () {
    this.tone(520, "sine", 0.25, 0.08, 0.01, 880);
    this.tone(780, "sine", 0.3, 0.05, 0.02, 420);
  };

  HorrorAudio.prototype.slam = function () {
    this.noiseBurst(0.35, 80, 1.1, 0.55);
    this.tone(55, "sawtooth", 0.4, 0.2, 0.005, 30);
  };

  HorrorAudio.prototype.sting = function () {
    this.noiseBurst(0.8, 1200, 0.4, 0.45);
    this.tone(180, "sawtooth", 0.9, 0.22, 0.001, 40);
    this.tone(1400, "square", 0.25, 0.08, 0.001, 90);
  };

  HorrorAudio.prototype.whisper = function () {
    this.noiseBurst(0.9, 1400, 3.5, 0.07);
    this.noiseBurst(0.5, 900, 6, 0.05);
  };

  HorrorAudio.prototype.metal = function () {
    this.tone(720 + Math.random() * 400, "square", 0.8, 0.06, 0.001, 200);
    this.noiseBurst(0.5, 2500, 2, 0.08);
  };

  HorrorAudio.prototype.phone = function () {
    const ctx = this.ctx;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = i % 2 ? 440 : 480;
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.42;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.04);
      g.gain.setValueAtTime(0.08, t + 0.18);
      g.gain.linearRampToValueAtTime(0, t + 0.22);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.25);
    }
  };

  HorrorAudio.prototype.click = function () {
    this.noiseBurst(0.05, 3000, 0.6, 0.08);
  };

  HorrorAudio.prototype.growl = function () {
    this.tone(70, "sawtooth", 0.7, 0.16, 0.05, 48);
    this.noiseBurst(0.6, 300, 1.2, 0.12);
  };

  HorrorAudio.prototype.update = function (dt, fear, running, hiding, listenerPos, monsterPos, forward) {
    this.fear = fear;
    if (this._bp) {
      this._bp.frequency.value = 160 + fear * 900;
    }
    this.amb.gain.value = 0.18 + fear * 0.16;

    this._hb -= dt;
    if (this._hb <= 0) {
      this._hb = 1.15 - fear * 0.7;
      const g = 0.04 + fear * 0.16;
      this.tone(48, "sine", 0.12, g, 0.005, 36);
      this.tone(62, "sine", 0.08, g * 0.5, 0.02, 40);
    }

    this._breath -= dt;
    if (this._breath <= 0) {
      this._breath = running ? 0.55 : hiding ? 1.6 : 1.15;
      this.noiseBurst(running ? 0.22 : 0.4, 900, 1.1, running ? 0.05 : 0.02);
    }

    if (this.ctx.listener.positionX) {
      this.ctx.listener.positionX.value = listenerPos.x;
      this.ctx.listener.positionY.value = listenerPos.y;
      this.ctx.listener.positionZ.value = listenerPos.z;
      this.ctx.listener.forwardX.value = forward.x;
      this.ctx.listener.forwardY.value = forward.y;
      this.ctx.listener.forwardZ.value = forward.z;
      this.ctx.listener.upX.value = 0;
      this.ctx.listener.upY.value = 1;
      this.ctx.listener.upZ.value = 0;
    }

    if (monsterPos && this.monsterPanner.positionX) {
      this.monsterPanner.positionX.value = monsterPos.x;
      this.monsterPanner.positionY.value = monsterPos.y;
      this.monsterPanner.positionZ.value = monsterPos.z;
    }
  };

  HorrorAudio.prototype.monsterVocals = function (chasing) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = chasing ? 90 : 62;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(chasing ? 0.12 : 0.05, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    o.connect(g).connect(this.monsterPanner);
    o.start(now);
    o.stop(now + 0.75);
  };

  global.WARD13 = global.WARD13 || {};
  global.WARD13.HorrorAudio = HorrorAudio;
})(window);
