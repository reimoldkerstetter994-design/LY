import { beatAt, palettes, previousBeat } from "./timeline.js";

let grain;

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function ease(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function hexAlpha(hex, alpha) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeGrain() {
  grain = document.createElement("canvas");
  grain.width = 160;
  grain.height = 160;
  const context = grain.getContext("2d");
  const image = context.createImageData(160, 160);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 110 + Math.floor(hash(i) * 145);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function wash(ctx, w, h, palette, local) {
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(1, palette[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const lx = w * (0.5 + 0.16 * Math.sin(local * 0.05));
  const ly = h * (0.46 + 0.08 * Math.cos(local * 0.037));
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, w * 0.48);
  glow.addColorStop(0, hexAlpha(palette[2], 0.16));
  glow.addColorStop(1, hexAlpha(palette[2], 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function vignette(ctx, w, h, light) {
  const gradient = ctx.createRadialGradient(w * 0.5, h * 0.48, w * 0.12, w * 0.5, h * 0.5, w * 0.62);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, light ? "rgba(48,36,24,0.2)" : "rgba(0,0,0,0.58)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function paintGrain(ctx, w, h, time, light) {
  if (!grain) makeGrain();
  ctx.save();
  ctx.globalAlpha = light ? 0.1 : 0.16;
  ctx.globalCompositeOperation = light ? "multiply" : "overlay";
  const shift = Math.floor(time * 8) % 80;
  for (let y = -80; y < h; y += 160) {
    for (let x = -80; x < w; x += 160) {
      ctx.drawImage(grain, x + shift, y + (shift % 40));
    }
  }
  ctx.restore();
}

function drawHorizon(ctx, w, h, p) {
  const y = h * 0.64;
  const half = w * 0.34 * ease(Math.min(1, p * 1.15));
  ctx.save();
  ctx.strokeStyle = "rgba(198,165,110,0.95)";
  ctx.lineWidth = 1.15;
  ctx.shadowColor = "rgba(198,165,110,0.85)";
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(w / 2 - half, y);
  ctx.lineTo(w / 2 + half, y);
  ctx.stroke();
  ctx.restore();
}

function drawRoom(ctx, w, h, local) {
  const x = w * 0.62;
  const y = h * 0.2;
  const ww = w * 0.14;
  const hh = h * 0.3;
  const flick = 0.78 + 0.22 * Math.sin(local * 0.35);
  ctx.fillStyle = `rgba(228,192,154,${0.2 * flick})`;
  ctx.fillRect(x, y, ww, hh);
  ctx.strokeStyle = "rgba(243,239,230,0.38)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, ww, hh);
  ctx.beginPath();
  ctx.moveTo(x + ww / 2, y);
  ctx.lineTo(x + ww / 2, y + hh);
  ctx.moveTo(x, y + hh / 2);
  ctx.lineTo(x + ww, y + hh / 2);
  ctx.stroke();
}

function drawWall(ctx, w, h) {
  ctx.strokeStyle = "rgba(243,239,230,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.78);
  ctx.lineTo(w * 0.9, h * 0.78);
  ctx.stroke();
}

function drawDust(ctx, w, h, local) {
  for (let i = 0; i < 42; i += 1) {
    const x = hash(i * 3.1) * w;
    const speed = 8 + hash(i * 1.7) * 16;
    const y = h + 12 - ((local * speed + hash(i) * h) % (h + 36));
    const radius = 0.7 + hash(i * 9) * 1.5;
    ctx.fillStyle = `rgba(236,231,223,${0.18 + hash(i * 2) * 0.4})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawChair(ctx, w, h, p) {
  const s = Math.min(w, h) * 0.2;
  ctx.save();
  ctx.translate(w * 0.5, h * 0.58);
  ctx.strokeStyle = "rgba(198,165,110,0.88)";
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const path = new Path2D();
  path.moveTo(-s, 0);
  path.lineTo(s * 0.82, 0);
  path.moveTo(-s * 0.78, 0);
  path.lineTo(-s * 0.92, s * 0.85);
  path.moveTo(s * 0.62, 0);
  path.lineTo(s * 0.78, s * 0.85);
  path.moveTo(-s * 0.7, 0);
  path.lineTo(-s * 0.7, -s * 1.05);
  path.moveTo(s * 0.55, 0);
  path.lineTo(s * 0.55, -s * 1.05);
  path.moveTo(-s * 0.7, -s * 1.05);
  path.lineTo(s * 0.55, -s * 1.05);
  ctx.setLineDash([520]);
  ctx.lineDashOffset = 520 * (1 - ease(p));
  ctx.stroke(path);
  ctx.restore();
}

function drawWindow(ctx, w, h, local) {
  const ww = w * 0.28;
  const hh = h * 0.42;
  const x = (w - ww) / 2;
  const y = h * 0.22;
  const sky = ctx.createLinearGradient(0, y, 0, y + hh);
  sky.addColorStop(0, `rgba(228,192,154,${0.18 + 0.06 * Math.sin(local * 0.2)})`);
  sky.addColorStop(1, "rgba(20,14,12,0.1)");
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, ww, hh);
  ctx.strokeStyle = "rgba(243,239,230,0.55)";
  ctx.lineWidth = 1.25;
  ctx.strokeRect(x, y, ww, hh);
  ctx.beginPath();
  ctx.moveTo(x + ww / 2, y);
  ctx.lineTo(x + ww / 2, y + hh);
  ctx.moveTo(x, y + hh / 2);
  ctx.lineTo(x + ww, y + hh / 2);
  ctx.stroke();
}

function drawStill(ctx, w, h) {
  ctx.fillStyle = "rgba(255,252,247,0.92)";
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.66, Math.min(w, h) * 0.011, 0, Math.PI * 2);
  ctx.fill();
}

function drawStone(ctx, w, h, p) {
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.5, w * 0.15, h * 0.3, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.46, h * 0.68);
  ctx.bezierCurveTo(w * 0.5, h * 0.52, w * 0.53, h * 0.4, w * 0.56, h * 0.28);
  ctx.strokeStyle = `rgba(198,165,110,${0.25 + ease(p) * 0.65})`;
  ctx.lineWidth = 1.25;
  ctx.stroke();
}

function drawWater(ctx, w, h, local) {
  for (let i = 0; i < 8; i += 1) {
    const y = h * (0.3 + i * 0.065);
    ctx.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const wave = Math.sin(x * 0.007 + local * 0.18 + i * 0.7) * (5 + i * 0.8);
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.strokeStyle = `rgba(169,212,214,${0.12 + i * 0.045})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawPaper(ctx, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = "rgba(90,74,60,0.45)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    const y = h * (0.18 + hash(i) * 0.64);
    const x = w * (0.16 + hash(i + 4) * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w * (0.08 + hash(i + 8) * 0.18), y + (hash(i + 2) - 0.5) * 8);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(27,23,20,0.35)";
  ctx.beginPath();
  ctx.moveTo(w * 0.28, h * 0.74);
  ctx.lineTo(w * 0.72, h * 0.74);
  ctx.stroke();
}

function drawMetal(ctx, w, h, p) {
  const x = -w * 0.4 + w * 1.8 * ease(p);
  const streak = ctx.createLinearGradient(x, 0, x + w * 0.16, h);
  streak.addColorStop(0, "rgba(255,255,255,0)");
  streak.addColorStop(0.5, "rgba(255,255,255,0.34)");
  streak.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = streak;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(213,219,230,0.35)";
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.22);
  ctx.lineTo(w * 0.82, h * 0.22);
  ctx.moveTo(w * 0.18, h * 0.78);
  ctx.lineTo(w * 0.82, h * 0.78);
  ctx.stroke();
}

function drawClock(ctx, w, h, p) {
  const cx = w * 0.5;
  const cy = h * 0.46;
  const radius = Math.min(w, h) * 0.2;
  ctx.strokeStyle = "rgba(243,239,230,0.62)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 12; i += 1) {
    const angle = -Math.PI / 2 + i * (Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (radius - 10), cy + Math.sin(angle) * (radius - 10));
    ctx.lineTo(cx + Math.cos(angle) * (radius - 2), cy + Math.sin(angle) * (radius - 2));
    ctx.stroke();
  }
  const hand = -Math.PI / 2 + p * Math.PI * 0.42;
  ctx.strokeStyle = "rgba(198,165,110,0.95)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hand) * radius * 0.68, cy + Math.sin(hand) * radius * 0.68);
  ctx.stroke();
}

function drawShadow(ctx, w, h, p) {
  const x = w * (0.16 + p * 0.12);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.moveTo(x, h);
  ctx.lineTo(x + w * 0.22, h);
  ctx.lineTo(x + w * 0.42, h * 0.16);
  ctx.lineTo(x + w * 0.16, h * 0.16);
  ctx.closePath();
  ctx.fill();
}

function drawWait(ctx, w, h, p) {
  const gap = (1 - ease(p)) * w * 0.1 + w * 0.045;
  const y = h * 0.62;
  const size = w * 0.055;
  ctx.strokeStyle = "rgba(236,231,223,0.75)";
  ctx.lineWidth = 1.1;
  ctx.strokeRect(w / 2 - gap - size, y, size, size);
  ctx.beginPath();
  ctx.arc(w / 2 + gap + size * 0.55, y + size * 0.5, size * 0.48, 0, Math.PI * 2);
  ctx.stroke();
}

function drawNightEdge(ctx, w, h) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "rgba(0,0,0,0.45)");
  gradient.addColorStop(0.45, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function drawHold(ctx, w, h) {
  ctx.strokeStyle = "rgba(198,165,110,0.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.38, h * 0.66);
  ctx.lineTo(w * 0.62, h * 0.66);
  ctx.stroke();
}

function drawWindows(ctx, w, h, local, lit) {
  const cols = 9;
  const rows = 5;
  const gap = Math.max(4, w * 0.008);
  const mw = w * 0.7;
  const mh = h * 0.58;
  const ox = (w - mw) / 2;
  const oy = h * 0.16;
  const cw = (mw - gap * (cols + 1)) / cols;
  const rh = (mh - gap * (rows + 1)) / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const index = r * cols + c;
      const x = ox + gap + c * (cw + gap);
      const y = oy + gap + r * (rh + gap);
      const on = lit.includes(index);
      ctx.fillStyle = on
        ? `rgba(230,177,92,${0.42 + 0.18 * Math.sin(local * 0.45 + index)})`
        : "rgba(244,239,228,0.035)";
      ctx.fillRect(x, y, cw, rh);
    }
  }
}

function drawRain(ctx, w, h, local) {
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i += 1) {
    const x = hash(i + 1) * w;
    const len = 12 + hash(i + 5) * 26;
    const speed = 36 + hash(i + 3) * 48;
    const y = ((hash(i + 2) * h + local * speed) % (h + 50)) - 24;
    ctx.strokeStyle = `rgba(169,212,214,${0.18 + hash(i + 6) * 0.28})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 1.4, y + len);
    ctx.stroke();
  }
}

function drawLamps(ctx, w, h) {
  const count = 8;
  for (let i = 0; i < count; i += 1) {
    const depth = i / (count - 1);
    const y = h * (0.74 - depth * 0.22);
    const spread = 0.045 + depth * 0.09;
    const x = w * (0.5 + (i - (count - 1) / 2) * spread);
    const radius = 1.6 + depth * 6;
    ctx.fillStyle = `rgba(230,177,92,${0.28 + depth * 0.55})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(244,239,228,0.28)";
    ctx.beginPath();
    ctx.moveTo(x, y + radius);
    ctx.lineTo(x, y + radius + 16 + depth * 36);
    ctx.stroke();
  }
}

function drawOneWindow(ctx, w, h, local) {
  drawWindows(ctx, w, h, local, [22]);
}

function drawFar(ctx, w, h, local) {
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.42);
  ctx.lineTo(w * 0.2, h * 0.92);
  ctx.lineTo(w * 0.8, h * 0.92);
  ctx.closePath();
  ctx.fill();
  const glow = 0.55 + 0.45 * Math.sin(local * 0.7);
  ctx.fillStyle = `rgba(230,177,92,${0.45 + glow * 0.5})`;
  ctx.shadowColor = "rgba(230,177,92,0.9)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.42, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawEnd(ctx, w, h, p) {
  ctx.fillStyle = `rgba(244,239,230,${ease(p) * 0.62})`;
  ctx.fillRect(0, 0, w, h);
}

const motifs = {
  room: (ctx, w, h, local) => drawRoom(ctx, w, h, local),
  wall: (ctx, w, h) => drawWall(ctx, w, h),
  dust: (ctx, w, h, local) => drawDust(ctx, w, h, local),
  chair: (ctx, w, h, local, p) => drawChair(ctx, w, h, p),
  window: (ctx, w, h, local) => drawWindow(ctx, w, h, local),
  still: (ctx, w, h) => drawStill(ctx, w, h),
  stone: (ctx, w, h, local, p) => drawStone(ctx, w, h, p),
  water: (ctx, w, h, local) => drawWater(ctx, w, h, local),
  paper: (ctx, w, h) => drawPaper(ctx, w, h),
  metal: (ctx, w, h, local, p) => drawMetal(ctx, w, h, p),
  clock: (ctx, w, h, local, p) => drawClock(ctx, w, h, p),
  shadow: (ctx, w, h, local, p) => drawShadow(ctx, w, h, p),
  wait: (ctx, w, h, local, p) => drawWait(ctx, w, h, p),
  nightedge: (ctx, w, h) => drawNightEdge(ctx, w, h),
  hold: (ctx, w, h) => drawHold(ctx, w, h),
  windows: (ctx, w, h, local) => drawWindows(ctx, w, h, local, [6, 17, 31]),
  rain: (ctx, w, h, local) => drawRain(ctx, w, h, local),
  lamps: (ctx, w, h) => drawLamps(ctx, w, h),
  onewindow: (ctx, w, h, local) => drawOneWindow(ctx, w, h, local),
  far: (ctx, w, h, local) => drawFar(ctx, w, h, local),
};

function drawBeat(ctx, w, h, beat, local) {
  const palette = palettes[beat.palette] ?? palettes.ink;
  const light = beat.palette === "paper";
  const progress = beat.dur === 0 ? 1 : local / beat.dur;
  wash(ctx, w, h, palette, local);
  if (beat.kind === "horizon") drawHorizon(ctx, w, h, progress);
  if (beat.kind === "end") drawEnd(ctx, w, h, progress);
  const motif = motifs[beat.motif];
  if (motif) motif(ctx, w, h, local, progress, beat);
  vignette(ctx, w, h, light);
}

export function render(ctx, w, h, filmTime) {
  const beat = beatAt(filmTime);
  const previous = previousBeat(beat);
  const local = filmTime - beat.start;
  const intro = Math.min(1, local / 2.6);
  ctx.clearRect(0, 0, w, h);
  if (previous && intro < 1) {
    drawBeat(ctx, w, h, previous, filmTime - previous.start);
    ctx.save();
    ctx.globalAlpha = ease(intro);
    drawBeat(ctx, w, h, beat, local);
    ctx.restore();
  } else {
    drawBeat(ctx, w, h, beat, local);
  }
  paintGrain(ctx, w, h, filmTime, beat.palette === "paper" && intro > 0.65);
}

export function textEnvelope(progress, kind) {
  if (kind === "void" || kind === "horizon") return 0;
  const fadeIn = kind === "title" ? 0.2 : 0.14;
  const fadeOut = kind === "end" ? 0.28 : 0.16;
  if (progress < fadeIn) return ease(progress / fadeIn);
  if (progress > 1 - fadeOut) return ease((1 - progress) / fadeOut);
  return 1;
}
