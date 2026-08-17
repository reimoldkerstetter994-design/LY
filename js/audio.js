/* Procedural horror soundscape — rain, tide, drone, hunter, UI. */
(function (global) {
  let ctx = null;
  let master = null;
  let started = false;
  let rain = null;
  let drone = null;
  let tide = null;
  let heart = null;
  let whisperT = 0;

  function ensure() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }

  function setVolume(v) {
    ensure();
    master.gain.value = Math.max(0, Math.min(1, v));
  }

  function noiseBuffer(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function filterNoise(type, freq, q, gainVal) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(2);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
    return { src, f, g };
  }

  function startAmbience() {
    ensure();
    if (started) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    started = true;
    rain = filterNoise("highpass", 900, 0.7, 0.045);
    drone = filterNoise("lowpass", 90, 0.8, 0.07);
    tide = filterNoise("bandpass", 180, 0.6, 0.04);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 46;
    const og = ctx.createGain();
    og.gain.value = 0.018;
    osc.connect(og);
    og.connect(master);
    osc.start();
    heart = { osc: ctx.createOscillator(), g: ctx.createGain() };
    heart.osc.type = "sine";
    heart.osc.frequency.value = 55;
    heart.g.gain.value = 0;
    heart.osc.connect(heart.g);
    heart.g.connect(master);
    heart.osc.start();
  }

  function beep(freq, dur, type, vol, slide) {
    if (!started) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  function click() {
    beep(180, 0.06, "square", 0.05);
  }

  function flashlight() {
    beep(420, 0.05, "square", 0.04);
    beep(90, 0.08, "sine", 0.03);
  }

  function foot(run, wet) {
    const f = run ? 90 : 70;
    beep(f + Math.random() * 20, 0.07, "sine", run ? 0.05 : 0.03);
    if (wet) beep(220 + Math.random() * 40, 0.05, "triangle", 0.015);
  }

  function door(open) {
    beep(open ? 140 : 90, 0.35, "sawtooth", 0.04, open ? 80 : 50);
  }

  function pickup() {
    beep(520, 0.12, "sine", 0.05, 780);
  }

  function thunder() {
    if (!started) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(1.6);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  function sting() {
    beep(70, 0.8, "sawtooth", 0.12, 30);
    beep(880, 0.2, "square", 0.06, 200);
  }

  function jump() {
    beep(40, 1.1, "sawtooth", 0.22, 18);
    beep(1400, 0.15, "square", 0.1);
  }

  function phone() {
    beep(740, 0.18, "sine", 0.07);
    setTimeout(() => beep(740, 0.18, "sine", 0.07), 220);
  }

  function whisper(near) {
    if (!started) return;
    const now = ctx.currentTime;
    if (now < whisperT) return;
    whisperT = now + 2.4 + Math.random() * 3;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(0.7);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900 + Math.random() * 700;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(near ? 0.08 : 0.03, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  function update(dt, hunterDist, sanity, running, inWater) {
    if (!started) return;
    if (drone) {
      const pulse = 70 + Math.sin(ctx.currentTime * 0.4) * 18;
      drone.f.frequency.value = pulse + (1 - sanity) * 40;
      drone.g.gain.value = 0.05 + (1 - sanity) * 0.06 + (hunterDist < 8 ? 0.04 : 0);
    }
    if (tide) {
      tide.g.gain.value = 0.03 + (inWater ? 0.05 : 0);
    }
    if (heart) {
      const close = hunterDist < 10 ? (10 - hunterDist) / 10 : 0;
      heart.g.gain.value = close * 0.07 + (1 - sanity) * 0.02;
      heart.osc.frequency.value = 48 + close * 40 + (running ? 12 : 0);
    }
    if (hunterDist < 7 || sanity < 0.45) whisper(hunterDist < 4);
  }

  function resume() {
    ensure();
    if (ctx.state === "suspended") ctx.resume();
  }

  global.BTAudio = {
    startAmbience,
    setVolume,
    click,
    flashlight,
    foot,
    door,
    pickup,
    thunder,
    sting,
    jump,
    phone,
    whisper,
    update,
    resume,
  };
})(window);
