const SCALE = [220, 261.63, 293.66, 329.63, 392, 440];

export function createScore() {
  let context;
  let master;
  let started = false;
  let playing = false;
  let lastSlot = -1;

  function chime(frequency) {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + 2.5);
  }

  function start() {
    if (started) {
      context.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    context = new AudioCtx();
    master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);
    master.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 3.2);

    [110, 164.81, 220].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = index === 0 ? 0.34 : index === 1 ? 0.12 : 0.05;
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start();
    });

    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const noiseGain = context.createGain();
    noiseGain.gain.value = 0.035;
    source.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    source.start();
    started = true;
    playing = true;
  }

  function setPlaying(next) {
    if (!started || playing === next) return;
    playing = next;
    const target = next ? 0.08 : 0.0001;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(target, context.currentTime, 0.25);
  }

  function sync(filmTime, isPlaying) {
    if (!started) return;
    setPlaying(isPlaying);
    if (!isPlaying) return;
    const slot = Math.floor(filmTime / 22);
    if (slot !== lastSlot) {
      lastSlot = slot;
      if (slot > 0) chime(SCALE[slot % SCALE.length]);
    }
  }

  function align(filmTime) {
    lastSlot = Math.floor(filmTime / 22);
  }

  return { start, sync, align };
}
