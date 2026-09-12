export class AudioBed {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.ctx.destination);
    this._ambient();
  }

  resume() {
    this.ensure();
    this.ctx.resume();
  }

  _ambient() {
    const osc = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 92;
    filt.type = "lowpass";
    filt.frequency.value = 240;
    g.gain.value = 0.35;
    osc.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    osc.start();
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = 18;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.start();
  }

  tone(freq, dur = 0.18, type = "triangle", gain = 0.4) {
    this.ensure();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  pickup() {
    this.tone(740, 0.12, "square", 0.25);
    setTimeout(() => this.tone(980, 0.16, "square", 0.22), 70);
  }

  zap() {
    this.tone(180, 0.22, "sawtooth", 0.3);
  }

  compile() {
    this.tone(220, 0.4, "sine", 0.3);
    setTimeout(() => this.tone(330, 0.4, "sine", 0.28), 160);
    setTimeout(() => this.tone(440, 0.7, "sine", 0.26), 320);
  }

  step() {
    this.tone(90 + Math.random() * 20, 0.05, "sine", 0.12);
  }
}
