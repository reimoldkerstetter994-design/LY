/* Procedural horror bed, rain, footsteps, stingers. */
(function (global) {
  let ctx = null;
  let master = null;
  let rainGain = null;
  let droneGain = null;
  let heartGain = null;
  let started = false;
  let heartTimer = 0;
  let nextCreak = 4;
  let volume = 0.75;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }

  function resume() {
    ensure();
    if (ctx.state === "suspended") ctx.resume();
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  function noiseBuffer(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      d[i] = last;
    }
    return buf;
  }

  function startBed() {
    if (started) return;
    ensure();
    started = true;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3.2);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = 900;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0.16;
    src.connect(bp);
    bp.connect(rainGain);
    rainGain.connect(master);
    src.start();

    droneGain = ctx.createGain();
    droneGain.gain.value = 0.03;
    droneGain.connect(master);
    [46, 49.2, 92].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? "triangle" : "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.15 : 0.4;
      o.connect(g);
      g.connect(droneGain);
      o.start();
    });

    heartGain = ctx.createGain();
    heartGain.gain.value = 0;
    heartGain.connect(master);
  }

  function thump(t, freq, dur, gain) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noiseBurst(t, dur, freq, q, gain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.4);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function foot(surface, running) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const base = surface === "tile" ? 900 : surface === "concrete" ? 220 : 340;
    noiseBurst(t, running ? 0.08 : 0.12, base, 1.6, running ? 0.12 : 0.07);
    thump(t, surface === "tile" ? 90 : 70, 0.09, running ? 0.08 : 0.045);
  }

  function door(open) {
    if (!ctx) return;
    const t = ctx.currentTime;
    noiseBurst(t, 0.35, open ? 280 : 180, 2.2, 0.1);
    thump(t + 0.08, 60, 0.2, 0.06);
  }

  function pickup() {
    if (!ctx) return;
    const t = ctx.currentTime;
    thump(t, 520, 0.12, 0.05);
    thump(t + 0.07, 780, 0.1, 0.04);
  }

  function thunder() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    noiseBurst(t, 1.6, 80, 0.7, 0.28);
    noiseBurst(t + 0.12, 0.9, 180, 1.1, 0.16);
    thump(t, 40, 1.1, 0.18);
  }

  function stinger() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noiseBurst(t, 0.7, 1400, 0.8, 0.22);
    thump(t, 55, 0.5, 0.22);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.8);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.9);
  }

  function whisper() {
    if (!ctx) return;
    noiseBurst(ctx.currentTime, 0.9, 1600 + Math.random() * 800, 3.5, 0.045);
  }

  function tapeHiss(on) {
    if (!ctx) return;
    if (!tapeHiss._g) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(1.2);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1800;
      f.Q.value = 0.6;
      tapeHiss._g = ctx.createGain();
      tapeHiss._g.gain.value = 0;
      src.connect(f);
      f.connect(tapeHiss._g);
      tapeHiss._g.connect(master);
      src.start();
    }
    tapeHiss._g.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.08);
  }

  function update(dt, near, fear, hiding) {
    if (!started) return;
    const t = ctx.currentTime;
    if (droneGain) {
      const target = 0.025 + fear * 0.07 + (near ? 0.04 : 0);
      droneGain.gain.setTargetAtTime(target, t, 0.2);
    }
    if (rainGain) rainGain.gain.setTargetAtTime(hiding ? 0.08 : 0.16, t, 0.3);

    heartTimer -= dt;
    const interval = 0.92 - Math.min(0.5, near * 0.45 + fear * 0.25);
    if (heartGain) {
      heartGain.gain.setTargetAtTime(near > 0.15 || fear > 0.55 ? 0.12 + near * 0.18 : 0.0, t, 0.15);
    }
    if (heartTimer <= 0 && heartGain && heartGain.gain.value > 0.02) {
      heartTimer = interval;
      thump(t, 48, 0.08, 0.09 + near * 0.08);
      thump(t + 0.16, 40, 0.1, 0.07 + near * 0.06);
    }

    nextCreak -= dt;
    if (nextCreak <= 0) {
      nextCreak = 6 + Math.random() * 14;
      noiseBurst(t, 0.5, 220 + Math.random() * 400, 4, 0.035);
    }
  }

  function click() {
    if (!ctx) return;
    noiseBurst(ctx.currentTime, 0.04, 2400, 1.2, 0.05);
  }

  global.SHAudio = {
    resume,
    setVolume,
    startBed,
    foot,
    door,
    pickup,
    thunder,
    stinger,
    whisper,
    tapeHiss,
    update,
    click,
  };
})(window);
