import { timeToUnit } from "./timewarp.js";

const COLORS = {
  r: [227, 106, 69],
  b: [240, 215, 162],
  c: [126, 162, 196],
  l: [213, 146, 74],
};

export function drawHistory(canvas, cosmos, tGyr) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 280;
  const height = canvas.clientHeight || 88;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);

  const rows = cosmos.series(180);
  const age = cosmos.ageGyr;
  const pad = 4;
  const xOf = (t) => pad + timeToUnit(t, age) * (width - pad * 2);

  g.globalAlpha = 0.9;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    const x0 = xOf(a.tGyr);
    const x1 = xOf(b.tGyr);
    const mid = {
      r: Math.max(a.omega.r, 0),
      b: Math.max(a.omega.b, 0),
      c: Math.max(a.omega.c, 0),
      l: Math.max(a.omega.l, 0),
    };
    const sum = mid.r + mid.b + mid.c + mid.l || 1;
    let y = height - pad;
    for (const key of ["r", "b", "c", "l"]) {
      const h = (mid[key] / sum) * (height - pad * 2);
      g.fillStyle = `rgb(${COLORS[key].join(",")})`;
      g.fillRect(x0, y - h, Math.max(x1 - x0, 1) + 0.5, h);
      y -= h;
    }
  }

  const x = xOf(tGyr);
  g.strokeStyle = "rgba(243,236,223,0.9)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, pad);
  g.lineTo(x, height - pad);
  g.stroke();
}

export const CHART_LEGEND = [
  ["辐射", "#e36a45"],
  ["重子", "#f0d7a2"],
  ["暗物质", "#7ea2c4"],
  ["暗能量", "#d5924a"],
];
