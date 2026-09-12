export class GameAudio {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.ambient = null;
    this.muted = false;
  }

  async boot() {
    this.ctx = new AudioContext();
    const names = [
      "pickup",
      "hurt",
      "hit",
      "jump",
      "step",
      "talk",
      "click",
      "compile",
      "win",
      "ambient",
    ];
    await Promise.all(
      names.map(async (name) => {
        const res = await fetch(`/assets/audio/${name}.wav`);
        const raw = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(raw);
        this.buffers.set(name, buf);
      })
    );
  }

  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  play(name, { volume = 0.7, loop = false, rate = 1 } = {}) {
    if (!this.ctx || this.muted) return null;
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
    return { src, gain };
  }

  startAmbient() {
    if (this.ambient) return;
    this.ambient = this.play("ambient", { volume: 0.22, loop: true });
  }
}
