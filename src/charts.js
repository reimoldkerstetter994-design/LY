function prep(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 280;
  const h = canvas.clientHeight || 96;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function axis(ctx, w, h, pad) {
  ctx.strokeStyle = "rgba(214, 196, 160, 0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, 8);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(w - 8, h - pad);
  ctx.stroke();
}

export function drawExpansion(canvas, cosmo, aNow) {
  const { ctx, w, h } = prep(canvas);
  const pad = 16;
  axis(ctx, w, h, pad);
  if (!cosmo.valid) return;
  ctx.beginPath();
  for (let i = 0; i <= 80; i += 1) {
    const t = (cosmo.ageGyr * i) / 80;
    const a = Math.min(cosmo.aAtTime(t), 1);
    const x = pad + ((w - pad - 8) * i) / 80;
    const y = h - pad - (h - pad - 10) * a;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#e0b56a";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  const nowT = Math.min(cosmo.timeAtA(aNow), cosmo.ageGyr);
  const x = pad + (w - pad - 8) * (nowT / cosmo.ageGyr);
  const y = h - pad - (h - pad - 10) * Math.min(aNow, 1);
  ctx.strokeStyle = "rgba(158, 203, 255, 0.8)";
  ctx.beginPath();
  ctx.moveTo(x, h - pad);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = "#d7e6ff";
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawDistances(canvas, cosmo) {
  const { ctx, w, h } = prep(canvas);
  const pad = 16;
  axis(ctx, w, h, pad);
  if (!cosmo.valid) return;
  const zMax = 4;
  let yMax = 1;
  const samples = [];
  for (let i = 0; i <= 60; i += 1) {
    const z = (zMax * i) / 60;
    const d = cosmo.distancesAtZ(z);
    samples.push(d);
    yMax = Math.max(yMax, d.dL);
  }
  const plot = (key, color) => {
    ctx.beginPath();
    samples.forEach((d, i) => {
      const x = pad + ((w - pad - 8) * i) / 60;
      const y = h - pad - ((h - pad - 10) * d[key]) / yMax;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  };
  plot("chi", "#9ecbff");
  plot("dL", "#e0b56a");
  plot("dA", "#e07a62");
}
