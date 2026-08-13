// 程序化贴图生成 —— 无需任何外部图片资源
import * as THREE from 'three';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function tex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 通用:在画布上叠加颗粒噪点
function grain(ctx, size, amount, alpha) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// 通用:污渍斑块
function stains(ctx, size, count, hueBase) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 12 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = 10 + Math.random() * 30;
    g.addColorStop(0, `rgba(${hueBase[0] - dark},${hueBase[1] - dark},${hueBase[2] - dark},${0.12 + Math.random() * 0.22})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- 墙面:发霉的旧医院墙(上灰绿漆、下部瓷砖) ----------
export function makeWallTexture() {
  const S = 512;
  const [c, ctx] = canvas(S);

  // 底色:褪色的灰绿
  ctx.fillStyle = '#6e7264';
  ctx.fillRect(0, 0, S, S);

  // 大面积不均匀褪色
  stains(ctx, S, 40, [110, 114, 100]);

  // 下半部瓷砖带
  const tileTop = S * 0.55;
  ctx.fillStyle = '#83857a';
  ctx.fillRect(0, tileTop, S, S - tileTop);
  const tw = S / 8, th = (S - tileTop) / 3.5;
  ctx.strokeStyle = 'rgba(30,32,28,0.65)';
  ctx.lineWidth = 3;
  for (let x = 0; x <= S; x += tw) {
    ctx.beginPath(); ctx.moveTo(x, tileTop); ctx.lineTo(x, S); ctx.stroke();
  }
  for (let y = tileTop; y <= S; y += th) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }
  // 瓷砖高光
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let x = 2; x <= S; x += tw) {
    ctx.beginPath(); ctx.moveTo(x, tileTop); ctx.lineTo(x, S); ctx.stroke();
  }

  // 分隔线(踢脚线)
  ctx.fillStyle = '#3a3c34';
  ctx.fillRect(0, tileTop - 8, S, 10);

  // 墙皮剥落
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S, y = Math.random() * tileTop * 0.9;
    ctx.fillStyle = `rgba(${52 + Math.random() * 20},${48 + Math.random() * 16},${40},${0.35 + Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + Math.random() * 26, 4 + Math.random() * 14, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // 从顶部流下的水渍
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * S;
    const w = 4 + Math.random() * 18;
    const h = 60 + Math.random() * 240;
    const g = ctx.createLinearGradient(x, 0, x, h);
    g.addColorStop(0, 'rgba(30,28,22,0.4)');
    g.addColorStop(1, 'rgba(30,28,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, 0, w, h);
  }

  // 霉斑(深绿黑)
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 3 + Math.random() * 16;
    ctx.fillStyle = `rgba(${14 + Math.random() * 18},${22 + Math.random() * 18},${12},${0.18 + Math.random() * 0.3})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  grain(ctx, S, 2600, 0.05);
  return tex(c, 1, 1);
}

// ---------- 地面:破旧方格地砖 ----------
export function makeFloorTexture() {
  const S = 512;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#4c483e';
  ctx.fillRect(0, 0, S, S);

  const n = 4, t = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const shade = 66 + Math.random() * 26;
      ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 12})`;
      ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      // 每块砖内的磨损
      for (let k = 0; k < 24; k++) {
        const v = 40 + Math.random() * 60;
        ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},0.25)`;
        ctx.fillRect(i * t + Math.random() * t, j * t + Math.random() * t, 2 + Math.random() * 8, 1 + Math.random() * 4);
      }
      // 部分砖有裂纹
      if (Math.random() < 0.4) {
        ctx.strokeStyle = 'rgba(20,18,14,0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let x = i * t + Math.random() * t, y = j * t;
        ctx.moveTo(x, y);
        for (let s = 0; s < 5; s++) {
          x += (Math.random() - 0.5) * 30;
          y += t / 5;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  stains(ctx, S, 34, [70, 66, 56]);
  grain(ctx, S, 3200, 0.06);
  return tex(c, 24, 24);
}

// ---------- 天花板:发霉的石膏板 ----------
export function makeCeilingTexture() {
  const S = 512;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#57534a';
  ctx.fillRect(0, 0, S, S);

  const t = S / 2;
  ctx.strokeStyle = 'rgba(20,18,15,0.7)';
  ctx.lineWidth = 4;
  for (let x = 0; x <= S; x += t) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(S, x); ctx.stroke();
  }
  stains(ctx, S, 46, [80, 76, 66]);
  // 大片水渍发黄
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 40 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(96,80,44,0.4)');
    g.addColorStop(0.7, 'rgba(80,66,36,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  grain(ctx, S, 2400, 0.05);
  return tex(c, 20, 20);
}

// ---------- 血迹贴花 ----------
export function makeBloodTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;
  // 主血泊
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, S * 0.32);
  g.addColorStop(0, 'rgba(70,6,4,0.92)');
  g.addColorStop(0.75, 'rgba(52,4,3,0.8)');
  g.addColorStop(1, 'rgba(40,3,2,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  // 不规则边缘
  ctx.moveTo(cx + S * 0.3, cy);
  for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.25) {
    const r = S * (0.2 + Math.random() * 0.16);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.fill();
  // 溅射点
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = S * (0.2 + Math.random() * 0.28);
    ctx.fillStyle = `rgba(${55 + Math.random() * 25},4,3,${0.4 + Math.random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 墙上的字(血书) ----------
export function makeWallWritingTexture(text) {
  const S = 512;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  ctx.font = '900 96px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate((Math.random() - 0.5) * 0.14);
  ctx.fillStyle = 'rgba(88,8,5,0.9)';
  ctx.shadowColor = 'rgba(60,4,2,0.8)';
  ctx.shadowBlur = 8;
  ctx.fillText(text, 0, 0);
  ctx.restore();
  // 流淌效果
  for (let i = 0; i < 22; i++) {
    const x = S * 0.15 + Math.random() * S * 0.7;
    const y = S * 0.5 + Math.random() * 40;
    const h = 20 + Math.random() * 90;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(80,6,4,0.75)');
    g.addColorStop(1, 'rgba(60,4,3,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 2 + Math.random() * 3, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 鬼的脸(用于近距离贴图与 jumpscare) ----------
export function drawScareFace(ctx, W, H, intensity) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  const fw = Math.min(W, H) * (0.34 + intensity * 0.1);

  // 苍白的脸
  const fg = ctx.createRadialGradient(cx, cy, fw * 0.1, cx, cy, fw);
  fg.addColorStop(0, '#cfc4b4');
  fg.addColorStop(0.55, '#9d9184');
  fg.addColorStop(0.85, '#4a4038');
  fg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.ellipse(cx, cy, fw * 0.72, fw, 0, 0, Math.PI * 2);
  ctx.fill();

  // 凹陷的黑眼窝
  for (const sx of [-1, 1]) {
    const ex = cx + sx * fw * 0.3, ey = cy - fw * 0.24;
    const eg = ctx.createRadialGradient(ex, ey, 2, ex, ey, fw * 0.26);
    eg.addColorStop(0, '#000');
    eg.addColorStop(0.6, 'rgba(10,6,4,0.95)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.ellipse(ex, ey, fw * 0.2, fw * 0.24, sx * 0.2, 0, Math.PI * 2);
    ctx.fill();
    // 眼窝深处的小白点
    ctx.fillStyle = `rgba(220,215,205,${0.5 + intensity * 0.5})`;
    ctx.beginPath();
    ctx.arc(ex + sx * 2, ey + 3, fw * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }

  // 撕裂的大嘴
  const my = cy + fw * 0.4;
  ctx.fillStyle = '#050302';
  ctx.beginPath();
  ctx.ellipse(cx, my, fw * (0.3 + intensity * 0.12), fw * (0.34 + intensity * 0.22), 0, 0, Math.PI * 2);
  ctx.fill();
  // 嘴边裂纹
  ctx.strokeStyle = 'rgba(30,15,10,0.9)';
  ctx.lineWidth = fw * 0.02;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * fw * 0.3, my + Math.sin(a) * fw * 0.32);
    ctx.lineTo(cx + Math.cos(a) * fw * 0.44, my + Math.sin(a) * fw * 0.48);
    ctx.stroke();
  }

  // 脸上的裂痕/血管
  ctx.strokeStyle = 'rgba(60,40,34,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 16; i++) {
    let x = cx + (Math.random() - 0.5) * fw * 1.2;
    let y = cy + (Math.random() - 0.5) * fw * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * fw * 0.2;
      y += (Math.random() - 0.5) * fw * 0.2;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 噪点
  for (let i = 0; i < 3200; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},0.06)`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
}

// ---------- 鬼脸贴图(贴在鬼头部) ----------
export function makeGhostFaceTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;
  // 苍白面部底色
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, S * 0.5);
  g.addColorStop(0, 'rgba(185,175,160,1)');
  g.addColorStop(0.7, 'rgba(130,120,108,0.9)');
  g.addColorStop(1, 'rgba(40,34,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // 眼窝
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 38, ey = cy - 22;
    const eg = ctx.createRadialGradient(ex, ey, 1, ex, ey, 30);
    eg.addColorStop(0, '#000');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.ellipse(ex, ey, 22, 27, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 嘴
  const mg = ctx.createRadialGradient(cx, cy + 48, 2, cx, cy + 48, 36);
  mg.addColorStop(0, '#000');
  mg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.ellipse(cx, cy + 48, 22, 32, 0, 0, Math.PI * 2); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
