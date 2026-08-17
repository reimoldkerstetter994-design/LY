/**
 * Fully procedural audio engine — every sound in the game is synthesised at
 * runtime with the Web Audio API, so the repository ships zero audio assets.
 *
 * Signal flow:
 *   voices ──┬─► dry ─────────────────┐
 *            └─► sendGain ─► convolver┴─► bus ─► compressor ─► master ─► out
 *
 * The convolver uses a procedurally generated, deliberately dark impulse
 * response that sounds like a long concrete corridor.
 */

import { clamp, clamp01, lerp } from './utils.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volume = 0.8;
    this.buffers = {};
    this._voices = new Set();
    this._heartTimer = 0;
    this._breathTimer = 0;
    this._ambienceTimer = 3;
    this._dripTimer = 6;
    this.muted = false;
  }

  /* ------------------------------------------------------------------ setup */

  init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor({ latencyHint: 'interactive' });
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 7;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // Reverb network.
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.6, 2.6, 2600);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.85;
    this.verb.connect(this.verbGain).connect(this.comp);

    // Dry bus (low-shelved slightly so the mix stays muddy/oppressive).
    this.dry = ctx.createGain();
    this.dry.gain.value = 1;
    this.dryTone = ctx.createBiquadFilter();
    this.dryTone.type = 'highshelf';
    this.dryTone.frequency.value = 7000;
    this.dryTone.gain.value = -6;
    this.dry.connect(this.dryTone).connect(this.comp);

    // A "muffled" bus used while the player hides inside a locker.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.7;
    this.muffle.connect(this.dry);

    this.buffers.white = this._noise(2.5, 'white');
    this.buffers.pink = this._noise(3.5, 'pink');
    this.buffers.brown = this._noise(4.0, 'brown');

    this.ready = true;
    this._buildBeds();
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  setVolume(v) {
    this.volume = clamp01(v);
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  get t() {
    return this.ctx.currentTime;
  }

  /* --------------------------------------------------------- buffer factory */

  _noise(seconds, kind = 'white') {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      if (kind === 'white') {
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } else if (kind === 'pink') {
        // Paul Kellet's economical pink noise filter.
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
      } else {
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
    }
    return buf;
  }

  _impulse(seconds, decay, darkHz) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    // One-pole lowpass coefficient for the darkening.
    const a = Math.exp((-2 * Math.PI * darkHz) / ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Sparse early reflections give the tail a "big empty building" feel.
        const spike = Math.random() < 0.0006 ? 4 : 1;
        const env = Math.pow(1 - t, decay) * (1 - 0.35 * Math.sin(t * 40 + ch));
        const x = (Math.random() * 2 - 1) * env * spike;
        y = x * (1 - a) + y * a;
        d[i] = y;
      }
    }
    return buf;
  }

  /* ------------------------------------------------------------ voice utils */

  /**
   * Create a source → filter → gain → (dry + reverb send) chain.
   * Returns nodes so callers can shape envelopes.
   */
  _chain({ wet = 0.35, pan = 0, muffled = true } = {}) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    gain.connect(panner);
    panner.connect(muffled ? this.muffle : this.dry);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      panner.connect(send).connect(this.verb);
    }
    return gain;
  }

  _play(buffer, { rate = 1, loop = false, offset = null } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.loop = loop;
    if (offset === null) offset = Math.random() * Math.max(0.01, buffer.duration - 0.5);
    src._offset = offset;
    return src;
  }

  _envBurst(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  /* --------------------------------------------------------------- one-shots */

  /** Footstep: transient thump + surface-coloured noise scuff. */
  footstep({ intensity = 1, surface = 'concrete', pan = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.001;
    const wet = surface === 'metal' ? 0.55 : 0.3;
    const out = this._chain({ wet, pan });
    out.gain.value = 1;

    // Body thump.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const baseHz = surface === 'metal' ? 150 : surface === 'wood' ? 105 : 78;
    osc.frequency.setValueAtTime(baseHz * (0.9 + Math.random() * 0.25), t0);
    osc.frequency.exponentialRampToValueAtTime(baseHz * 0.42, t0 + 0.11);
    const og = ctx.createGain();
    this._envBurst(og, t0, 0.5 * intensity, 0.006, 0.1);
    osc.connect(og).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.2);

    // Scuff / grit.
    const src = this._play(this.buffers.pink, { rate: 0.9 + Math.random() * 0.5 });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value =
      surface === 'metal' ? 2600 + Math.random() * 1800
        : surface === 'glass' ? 4200 + Math.random() * 2500
          : 1000 + Math.random() * 900;
    bp.Q.value = surface === 'metal' ? 3.2 : 1.1;
    const ng = ctx.createGain();
    this._envBurst(ng, t0, 0.36 * intensity, 0.004, surface === 'metal' ? 0.3 : 0.075);
    src.connect(bp).connect(ng).connect(out);
    src.start(t0, src._offset);
    src.stop(t0 + 0.45);

    if (surface === 'glass') {
      // Broken glass crunch — a few tiny high-frequency pings.
      for (let i = 0; i < 4; i++) {
        const p = ctx.createOscillator();
        p.type = 'triangle';
        p.frequency.value = 3000 + Math.random() * 5000;
        const pg = ctx.createGain();
        const pt = t0 + Math.random() * 0.06;
        this._envBurst(pg, pt, 0.05 * intensity, 0.002, 0.05);
        p.connect(pg).connect(out);
        p.start(pt);
        p.stop(pt + 0.09);
      }
    }
  }

  heartbeat(intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.002;
    const out = this._chain({ wet: 0.12, pan: 0 });
    const thump = (at, amp, hz) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(hz, at);
      o.frequency.exponentialRampToValueAtTime(hz * 0.45, at + 0.16);
      const g = ctx.createGain();
      this._envBurst(g, at, amp, 0.012, 0.19);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      o.connect(g).connect(lp).connect(out);
      o.start(at);
      o.stop(at + 0.4);
    };
    thump(t0, 0.62 * intensity, 62);
    thump(t0 + 0.16, 0.34 * intensity, 52);
  }

  breath(kind = 'in', intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.002;
    const dur = kind === 'in' ? 0.34 : 0.46;
    const out = this._chain({ wet: 0.1, pan: (Math.random() - 0.5) * 0.12 });
    const src = this._play(this.buffers.white, { rate: 1 });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(kind === 'in' ? 520 : 760, t0);
    bp.frequency.linearRampToValueAtTime(kind === 'in' ? 980 : 380, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.1 * intensity, t0 + dur * 0.42);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(t0, src._offset);
    src.stop(t0 + dur + 0.05);
  }

  /** Unintelligible whispers — the core "am I losing it" sound. */
  whisper(pan = 0, intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.01;
    const dur = 1.1 + Math.random() * 1.6;
    const out = this._chain({ wet: 0.75, pan });
    const src = this._play(this.buffers.white, { rate: 1 });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 5.5;

    // Formant-ish wobble makes the noise read as speech.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.5 + Math.random() * 4;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 700;
    lfo.connect(lfoAmt).connect(bp.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.075 * intensity, t0 + 0.3);
    // Syllable chopping.
    const syl = ctx.createOscillator();
    syl.type = 'square';
    syl.frequency.value = 3.2 + Math.random() * 2.5;
    const sylAmt = ctx.createGain();
    sylAmt.gain.value = 0.03 * intensity;
    syl.connect(sylAmt).connect(g.gain);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);

    src.connect(bp).connect(g).connect(out);
    src.start(t0, src._offset);
    src.stop(t0 + dur + 0.1);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.1);
    syl.start(t0);
    syl.stop(t0 + dur + 0.1);
  }

  /** Jump-scare stinger: reverse swell + dissonant cluster + sub drop. */
  stinger(intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.005;
    const out = this._chain({ wet: 0.55, pan: 0, muffled: false });

    // Rising noise swell.
    const src = this._play(this.buffers.white, { rate: 1 });
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(300, t0);
    hp.frequency.exponentialRampToValueAtTime(5200, t0 + 0.42);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t0);
    sg.gain.exponentialRampToValueAtTime(0.3 * intensity, t0 + 0.4);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.95);
    src.connect(hp).connect(sg).connect(out);
    src.start(t0, src._offset);
    src.stop(t0 + 1.1);

    // Dissonant string-ish cluster.
    const roots = [146.8, 155.6, 220, 233.1, 311.1];
    roots.forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sawtooth' : 'square';
      o.frequency.setValueAtTime(hz * (1 + (Math.random() - 0.5) * 0.02), t0 + 0.38);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + 0.38);
      g.gain.exponentialRampToValueAtTime(0.07 * intensity, t0 + 0.42);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.9);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      o.connect(g).connect(lp).connect(out);
      o.start(t0 + 0.38);
      o.stop(t0 + 2.1);
    });

    // Sub drop.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(120, t0 + 0.38);
    sub.frequency.exponentialRampToValueAtTime(24, t0 + 2.2);
    const subg = ctx.createGain();
    subg.gain.setValueAtTime(0.0001, t0 + 0.38);
    subg.gain.exponentialRampToValueAtTime(0.5 * intensity, t0 + 0.46);
    subg.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
    sub.connect(subg).connect(out);
    sub.start(t0 + 0.38);
    sub.stop(t0 + 2.5);
  }

  /** Inhuman shriek used when the monster commits to a chase. */
  scream(intensity = 1, pan = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.005;
    const out = this._chain({ wet: 0.6, pan, muffled: false });

    const carrier = ctx.createOscillator();
    carrier.type = 'sawtooth';
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = 42;
    const modAmt = ctx.createGain();
    modAmt.gain.value = 260;
    mod.connect(modAmt).connect(carrier.frequency);

    carrier.frequency.setValueAtTime(310, t0);
    carrier.frequency.exponentialRampToValueAtTime(870, t0 + 0.22);
    carrier.frequency.exponentialRampToValueAtTime(180, t0 + 1.5);

    const dist = ctx.createWaveShaper();
    dist.curve = this._distortionCurve(28);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 1.4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.3 * intensity, t0 + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);

    carrier.connect(dist).connect(bp).connect(g).connect(out);
    carrier.start(t0);
    carrier.stop(t0 + 1.8);
    mod.start(t0);
    mod.stop(t0 + 1.8);

    // Breath-shred layer.
    const src = this._play(this.buffers.white, {});
    const shp = ctx.createBiquadFilter();
    shp.type = 'highpass';
    shp.frequency.value = 1800;
    const sg = ctx.createGain();
    this._envBurst(sg, t0, 0.16 * intensity, 0.03, 1.3);
    src.connect(shp).connect(sg).connect(out);
    src.start(t0, src._offset);
    src.stop(t0 + 1.6);
  }

  _distortionCurve(amount = 20) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((3 + amount) * x * 20 * Math.PI) / (Math.PI + amount * Math.abs(x));
      curve[i] = Math.tanh(curve[i] * 0.06);
    }
    return curve;
  }

  /** Distant metal impact — the "something moved over there" cue. */
  clang({ pan = 0, distance = 10, intensity = 1 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.005;
    const att = 1 / (1 + distance * 0.12);
    const out = this._chain({ wet: 0.8, pan });
    const partials = [232, 358, 517, 733, 1049, 1471];
    partials.forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz * (0.96 + Math.random() * 0.08);
      const g = ctx.createGain();
      this._envBurst(g, t0, (0.16 / (i + 1)) * intensity * att, 0.002, 1.4 + i * 0.2);
      o.connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + 2.2);
    });
    const src = this._play(this.buffers.white, {});
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    this._envBurst(ng, t0, 0.1 * intensity * att, 0.001, 0.18);
    src.connect(bp).connect(ng).connect(out);
    src.start(t0, src._offset);
    src.stop(t0 + 0.4);
  }

  /** Long groaning hinge. */
  creak({ pan = 0, duration = 1.4, intensity = 1 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.005;
    const out = this._chain({ wet: 0.5, pan });
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 90 + Math.random() * 70;
    o.frequency.setValueAtTime(base, t0);
    // Stick-slip stutter.
    for (let i = 0; i < 14; i++) {
      const tt = t0 + (i / 14) * duration;
      o.frequency.setValueAtTime(base * (0.8 + Math.random() * 0.9), tt);
    }
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.075 * intensity, t0 + 0.12);
    g.gain.linearRampToValueAtTime(0.0001, t0 + duration);
    o.connect(bp).connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + duration + 0.1);
  }

  click({ pitch = 1, intensity = 1 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.002;
    const out = this._chain({ wet: 0.15 });
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(1800 * pitch, t0);
    o.frequency.exponentialRampToValueAtTime(600 * pitch, t0 + 0.03);
    const g = ctx.createGain();
    this._envBurst(g, t0, 0.11 * intensity, 0.001, 0.035);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.08);
  }

  pickup() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.002;
    const out = this._chain({ wet: 0.3 });
    [660, 880, 1320].forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz;
      const g = ctx.createGain();
      this._envBurst(g, t0 + i * 0.045, 0.09, 0.004, 0.24);
      o.connect(g).connect(out);
      o.start(t0 + i * 0.045);
      o.stop(t0 + i * 0.045 + 0.35);
    });
    this.click({ pitch: 1.6, intensity: 0.5 });
  }

  /** Power restored: relay clack, then fluorescent tubes striking one by one. */
  powerUp() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.01;
    const out = this._chain({ wet: 0.6, muffled: false });
    // Breaker slam.
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(180, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + 0.12);
    const g = ctx.createGain();
    this._envBurst(g, t0, 0.35, 0.002, 0.2);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.4);

    // 100Hz hum swelling in.
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 100;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.0001, t0 + 0.1);
    hg.gain.exponentialRampToValueAtTime(0.05, t0 + 1.2);
    hg.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.5);
    const hlp = ctx.createBiquadFilter();
    hlp.type = 'lowpass';
    hlp.frequency.value = 900;
    hum.connect(hg).connect(hlp).connect(out);
    hum.start(t0 + 0.1);
    hum.stop(t0 + 4.6);

    for (let i = 0; i < 7; i++) {
      const tt = t0 + 0.25 + Math.random() * 1.6;
      const src = this._play(this.buffers.white, {});
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400 + Math.random() * 3000;
      bp.Q.value = 2;
      const sg = ctx.createGain();
      this._envBurst(sg, tt, 0.07, 0.001, 0.09);
      src.connect(bp).connect(sg).connect(out);
      src.start(tt, src._offset);
      src.stop(tt + 0.2);
    }
  }

  /** Water dripping in a far room. */
  drip({ pan = 0, distance = 12 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.005;
    const att = 1 / (1 + distance * 0.1);
    const out = this._chain({ wet: 0.9, pan });
    const o = ctx.createOscillator();
    o.type = 'sine';
    const hz = 900 + Math.random() * 700;
    o.frequency.setValueAtTime(hz * 0.6, t0);
    o.frequency.exponentialRampToValueAtTime(hz * 1.7, t0 + 0.05);
    const g = ctx.createGain();
    this._envBurst(g, t0, 0.075 * att, 0.001, 0.11);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.2);
  }

  /** Cloth / metal rustle for entering and leaving a locker. */
  rustle({ intensity = 1, metal = true } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.002;
    const out = this._chain({ wet: 0.35 });
    const src = this._play(this.buffers.pink, { rate: 1.4 });
    const bp = ctx.createBiquadFilter();
    bp.type = metal ? 'bandpass' : 'lowpass';
    bp.frequency.value = metal ? 3000 : 1200;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.16 * intensity, t0 + 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 0.45);
    src.connect(bp).connect(g).connect(out);
    src.start(t0, src._offset);
    src.stop(t0 + 0.5);
    if (metal) this.clang({ intensity: 0.28 * intensity, distance: 0, pan: 0 });
  }

  /** Camera-shaking impact used when the monster strikes. */
  impact(intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = this.t + 0.002;
    const out = this._chain({ wet: 0.4, muffled: false });
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(28, t0 + 0.5);
    const g = ctx.createGain();
    this._envBurst(g, t0, 0.7 * intensity, 0.003, 0.55);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.7);
    const src = this._play(this.buffers.brown, {});
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const sg = ctx.createGain();
    this._envBurst(sg, t0, 0.45 * intensity, 0.002, 0.35);
    src.connect(lp).connect(sg).connect(out);
    src.start(t0, src._offset);
    src.stop(t0 + 0.5);
  }

  /* ------------------------------------------------------------------- beds */

  _buildBeds() {
    const ctx = this.ctx;

    // 1) Sub drone bed — detuned saws through a slow low-pass.
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0001;
    const droneLP = ctx.createBiquadFilter();
    droneLP.type = 'lowpass';
    droneLP.frequency.value = 260;
    droneLP.Q.value = 1.2;
    this.droneLP = droneLP;
    this.droneGain.connect(droneLP).connect(this.dry);
    const sendD = ctx.createGain();
    sendD.gain.value = 0.4;
    droneLP.connect(sendD).connect(this.verb);

    this.droneOscs = [];
    [27.5, 41.2, 55, 82.4].forEach((hz, i) => {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sawtooth' : 'sine';
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = 0.4 / (i + 1);
      o.connect(g).connect(this.droneGain);
      o.start();
      this.droneOscs.push(o);
      // Slow detune wobble.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.03 + i * 0.017;
      const amt = ctx.createGain();
      amt.gain.value = hz * 0.012;
      lfo.connect(amt).connect(o.frequency);
      lfo.start();
    });

    // 2) Room-tone hiss (air handling in an empty building).
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = 0.0001;
    const roomLP = ctx.createBiquadFilter();
    roomLP.type = 'lowpass';
    roomLP.frequency.value = 620;
    const roomHP = ctx.createBiquadFilter();
    roomHP.type = 'highpass';
    roomHP.frequency.value = 90;
    const roomSrc = this._play(this.buffers.brown, { loop: true });
    roomSrc.connect(roomHP).connect(roomLP).connect(this.roomGain).connect(this.dry);
    roomSrc.start(0, 0);
    this.roomSrc = roomSrc;

    // 3) Monster presence voice — always alive, driven by distance/state.
    this.mGain = ctx.createGain();
    this.mGain.gain.value = 0.0001;
    this.mPan = ctx.createStereoPanner();
    this.mLP = ctx.createBiquadFilter();
    this.mLP.type = 'lowpass';
    this.mLP.frequency.value = 700;
    this.mGain.connect(this.mLP).connect(this.mPan);
    this.mPan.connect(this.dry);
    const mSend = ctx.createGain();
    mSend.gain.value = 0.7;
    this.mPan.connect(mSend).connect(this.verb);

    // Ragged breathing: noise gated by a slow LFO.
    const mSrc = this._play(this.buffers.pink, { loop: true });
    const mbp = ctx.createBiquadFilter();
    mbp.type = 'bandpass';
    mbp.frequency.value = 300;
    mbp.Q.value = 1.1;
    const mAmp = ctx.createGain();
    mAmp.gain.value = 0.35;
    const mLfo = ctx.createOscillator();
    mLfo.type = 'sine';
    mLfo.frequency.value = 0.55;
    const mLfoAmt = ctx.createGain();
    mLfoAmt.gain.value = 0.34;
    mLfo.connect(mLfoAmt).connect(mAmp.gain);
    mLfo.start();
    this.mBreathLfo = mLfo;
    mSrc.connect(mbp).connect(mAmp).connect(this.mGain);
    mSrc.start(0, 0);

    // Growl: low FM tone under the breathing.
    const gr = ctx.createOscillator();
    gr.type = 'sawtooth';
    gr.frequency.value = 46;
    const grMod = ctx.createOscillator();
    grMod.type = 'sine';
    grMod.frequency.value = 7.3;
    const grModAmt = ctx.createGain();
    grModAmt.gain.value = 18;
    grMod.connect(grModAmt).connect(gr.frequency);
    grMod.start();
    const grGain = ctx.createGain();
    grGain.gain.value = 0.35;
    gr.connect(grGain).connect(this.mGain);
    gr.start();
    this.growlOsc = gr;

    // 4) Tinnitus / low-sanity ringing.
    this.ringGain = ctx.createGain();
    this.ringGain.gain.value = 0.0001;
    const ring = ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.value = 5400;
    ring.connect(this.ringGain).connect(this.dry);
    ring.start();
  }

  setMuffled(amount) {
    if (!this.ready) return;
    const target = lerp(20000, 620, clamp01(amount));
    this.muffle.frequency.setTargetAtTime(target, this.t, 0.12);
  }

  /**
   * Per-frame bed mixing.
   * @param {object} s state snapshot from the game
   */
  update(dt, s) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const t = this.t;

    const tension = clamp01(s.tension ?? 0);
    const insanity = 1 - clamp01(s.sanity ?? 1);

    this.droneGain.gain.setTargetAtTime(0.05 + tension * 0.3 + insanity * 0.1, t, 0.5);
    this.droneLP.frequency.setTargetAtTime(160 + tension * 700, t, 0.6);
    this.roomGain.gain.setTargetAtTime(0.1 + insanity * 0.06, t, 1.2);
    this.ringGain.gain.setTargetAtTime(insanity > 0.55 ? (insanity - 0.55) * 0.012 : 0.00001, t, 0.8);

    // Monster proximity voice.
    const d = s.monsterDistance ?? 999;
    const audible = clamp01(1 - d / 26);
    const hunt = s.monsterHunting ? 1 : 0;
    const lvl = Math.pow(audible, 1.7) * (0.4 + hunt * 0.9) * (s.monsterVisible ? 1.25 : 1);
    this.mGain.gain.setTargetAtTime(0.0002 + lvl * 0.55, t, 0.25);
    this.mLP.frequency.setTargetAtTime(320 + audible * 1900 + hunt * 900, t, 0.3);
    this.mPan.pan.setTargetAtTime(clamp(s.monsterPan ?? 0, -1, 1), t, 0.15);
    if (this.growlOsc) {
      this.growlOsc.frequency.setTargetAtTime(38 + hunt * 26 + audible * 12, t, 0.4);
    }
    if (this.mBreathLfo) {
      this.mBreathLfo.frequency.setTargetAtTime(0.45 + hunt * 1.5 + audible * 0.6, t, 0.4);
    }

    // Heartbeat — rate follows tension, and it is *loud* when it matters.
    const bpm = lerp(56, 178, Math.pow(tension, 0.85));
    const interval = 60 / bpm;
    this._heartTimer -= dt;
    if (this._heartTimer <= 0) {
      this._heartTimer = interval;
      const amp = 0.22 + tension * 1.05 + insanity * 0.2;
      if (tension > 0.06 || insanity > 0.3) this.heartbeat(amp);
    }

    // Player breathing — faster when exhausted or terrified.
    const breathRate = lerp(4.6, 1.15, clamp01((s.stamina ?? 1) * 0.6 + (1 - tension) * 0.4));
    this._breathTimer -= dt;
    if (this._breathTimer <= 0) {
      this._breathTimer = breathRate * (s.holdingBreath ? 4 : 1);
      if (!s.holdingBreath) {
        this.breath(Math.random() < 0.5 ? 'in' : 'out', 0.35 + tension * 0.9 + (1 - (s.stamina ?? 1)) * 0.6);
      }
    }

    // Sparse environmental punctuation.
    this._dripTimer -= dt;
    if (this._dripTimer <= 0) {
      this._dripTimer = 2.5 + Math.random() * 7;
      this.drip({ pan: (Math.random() - 0.5) * 1.6, distance: 4 + Math.random() * 18 });
    }

    this._ambienceTimer -= dt;
    if (this._ambienceTimer <= 0) {
      this._ambienceTimer = 11 + Math.random() * 22 - tension * 6;
      const r = Math.random();
      const pan = (Math.random() - 0.5) * 1.7;
      if (r < 0.34) this.clang({ pan, distance: 12 + Math.random() * 22, intensity: 0.75 });
      else if (r < 0.6) this.creak({ pan, duration: 1 + Math.random() * 2, intensity: 0.7 });
      else if (r < 0.85) this.whisper(pan, 0.35 + insanity * 0.8);
      else this.footstep({ pan, intensity: 0.28, surface: 'concrete' });
    }
  }
}
