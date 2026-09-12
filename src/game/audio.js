export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.muted = false;
  }

  boot() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(ctx.destination);
  }

  resume() {
    this.boot();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  tone(freq, dur = 0.12, type = "square", gain = 0.12, slide = 0) {
    this.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  ui() {
    this.tone(880, 0.08, "triangle", 0.08);
  }

  pickup() {
    this.tone(660, 0.09, "square", 0.1, 220);
    this.tone(990, 0.16, "triangle", 0.07);
  }

  laser() {
    this.tone(1400, 0.07, "sawtooth", 0.05, -900);
  }

  squash() {
    this.tone(180, 0.14, "square", 0.12, -80);
  }

  hurt() {
    this.tone(110, 0.2, "sawtooth", 0.14, -40);
  }

  ok() {
    this.tone(523, 0.1, "triangle", 0.1);
    this.tone(784, 0.18, "triangle", 0.08);
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.22, "triangle", 0.1), i * 140);
    });
  }

  startMusic() {
    this.resume();
    if (this.music) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    gain.connect(this.master);
    const pad = ctx.createOscillator();
    pad.type = "sine";
    pad.frequency.value = 110;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain);
    lfoGain.connect(pad.frequency);
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 420;
    pad.connect(filt);
    filt.connect(gain);
    pad.start();
    lfo.start();
    this.music = { pad, lfo, gain };
  }
}
