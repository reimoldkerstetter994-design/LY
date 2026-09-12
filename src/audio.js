export function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let stepT = 0;

  function beep(freq, dur, type = "sine", gain = 0.05) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.stop(ctx.currentTime + dur);
  }

  function ambient() {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 110;
    g.gain.value = 0.012;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = 165;
    const g2 = ctx.createGain();
    g2.gain.value = 0.008;
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start();
  }

  return {
    resume: () => ctx.resume(),
    pickup: () => {
      beep(880, 0.12, "triangle", 0.06);
      setTimeout(() => beep(1320, 0.16, "sine", 0.05), 70);
    },
    talk: () => beep(420, 0.08, "square", 0.03),
    win: () => {
      beep(523, 0.2);
      setTimeout(() => beep(659, 0.2), 140);
      setTimeout(() => beep(784, 0.4), 280);
    },
    step(dt, sprint) {
      stepT += dt * (sprint ? 1.7 : 1);
      if (stepT > 0.42) {
        stepT = 0;
        beep(sprint ? 180 : 140, 0.05, "sine", 0.02);
      }
    },
    ambient,
  };
}
