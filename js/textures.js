(function (global) {
  "use strict";

  function hash(x, y) {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  function noise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0);
    const b = hash(x0 + 1, y0);
    const c = hash(x0, y0 + 1);
    const d = hash(x0 + 1, y0 + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }

  function fbm(x, y, oct) {
    let v = 0;
    let a = 0.5;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      v += a * noise(x * f, y * f);
      a *= 0.5;
      f *= 2;
    }
    return v;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function makeCanvas(size) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    return c;
  }

  function toTex(canvas, repeatX, repeatY) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX || 1, repeatY || 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  function toDataTex(canvas, repeatX, repeatY, linear) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX || 1, repeatY || 1);
    if (linear) tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  function heightToNormal(src, strength) {
    const w = src.width;
    const h = src.height;
    const ctx = src.getContext("2d");
    const srcData = ctx.getImageData(0, 0, w, h).data;
    const out = makeCanvas(w);
    const octx = out.getContext("2d");
    const img = octx.createImageData(w, h);
    const d = img.data;

    function lum(x, y) {
      x = (x + w) % w;
      y = (y + h) % h;
      const i = (y * w + x) * 4;
      return srcData[i] / 255;
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (lum(x - 1, y) - lum(x + 1, y)) * strength;
        const dy = (lum(x, y - 1) - lum(x, y + 1)) * strength;
        const len = Math.hypot(dx, dy, 1) || 1;
        const i = (y * w + x) * 4;
        d[i] = ((dx / len) * 0.5 + 0.5) * 255;
        d[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
        d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    return out;
  }

  function paintFloor(size) {
    const c = makeCanvas(size);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const tiles = 4;
    const tile = size / tiles;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tx = x % tile;
        const ty = y % tile;
        const grout = tx < 3 || ty < 3 || tx > tile - 3 || ty > tile - 3;
        const n = fbm(x * 0.03, y * 0.03, 5);
        const dirt = fbm(x * 0.01, y * 0.01, 4);
        const scuff = Math.pow(fbm(x * 0.08, y * 0.02, 3), 3);
        let r = 118 + n * 22;
        let g = 112 + n * 16;
        let b = 96 + n * 10;
        r = r * (0.78 + dirt * 0.28) - scuff * 18;
        g = g * (0.78 + dirt * 0.28) - scuff * 16;
        b = b * (0.72 + dirt * 0.22) - scuff * 12;
        if (grout) {
          r = 52 + dirt * 20;
          g = 48 + dirt * 16;
          b = 42 + dirt * 12;
        }
        if (dirt > 0.62) {
          r += 18;
          g -= 8;
          b -= 10;
        }
        const i = (y * size + x) * 4;
        d[i] = clamp(r, 0, 255);
        d[i + 1] = clamp(g, 0, 255);
        d[i + 2] = clamp(b, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function paintWall(size) {
    const c = makeCanvas(size);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x * 0.015, y * 0.02, 5);
        const peel = fbm(x * 0.04 + 8, y * 0.05, 4);
        const leak = Math.pow(fbm(x * 0.02, y * 0.01, 3), 4);
        const dado = y > size * 0.62;
        let r = 168 + n * 18;
        let g = 158 + n * 14;
        let b = 138 + n * 10;
        if (dado) {
          r = 78 + n * 12;
          g = 86 + n * 10;
          b = 84 + n * 8;
        }
        r -= leak * 50;
        g -= leak * 42;
        b -= leak * 20;
        if (peel > 0.72) {
          r *= 0.7;
          g *= 0.66;
          b *= 0.58;
        }
        const i = (y * size + x) * 4;
        d[i] = clamp(r, 0, 255);
        d[i + 1] = clamp(g, 0, 255);
        d[i + 2] = clamp(b, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = "rgba(40,36,30,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.62);
    ctx.lineTo(size, size * 0.62);
    ctx.stroke();
    return c;
  }

  function paintCeiling(size) {
    const c = makeCanvas(size);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const tile = size / 4;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const grout = x % tile < 2 || y % tile < 2;
        const stain = fbm(x * 0.02, y * 0.02, 4);
        let v = 92 + stain * 28;
        if (grout) v = 48;
        if (stain > 0.68) v -= 30;
        const i = (y * size + x) * 4;
        d[i] = v;
        d[i + 1] = v - 2;
        d[i + 2] = v - 6;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function paintMetal(size) {
    const c = makeCanvas(size);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x * 0.08, y * 0.01, 4);
        const rust = Math.pow(fbm(x * 0.03, y * 0.03, 3), 5);
        let r = 70 + n * 40;
        let g = 68 + n * 38;
        let b = 64 + n * 32;
        r += rust * 70;
        g += rust * 18;
        b -= rust * 10;
        const i = (y * size + x) * 4;
        d[i] = clamp(r, 0, 255);
        d[i + 1] = clamp(g, 0, 255);
        d[i + 2] = clamp(b, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function paintWood(size) {
    const c = makeCanvas(size);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const grain = Math.sin(x * 0.09 + fbm(x * 0.02, y * 0.04, 3) * 8);
        const n = 0.55 + grain * 0.12 + fbm(x * 0.05, y * 0.05, 3) * 0.1;
        const i = (y * size + x) * 4;
        d[i] = 48 * n + 22;
        d[i + 1] = 32 * n + 12;
        d[i + 2] = 22 * n + 8;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function paintBlood(size) {
    const c = makeCanvas(size);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 18; i++) {
      const x = hash(i, 1) * size;
      const y = hash(i, 2) * size;
      const r = 20 + hash(i, 3) * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(90,8,8,0.85)");
      g.addColorStop(0.5, "rgba(50,4,4,0.45)");
      g.addColorStop(1, "rgba(30,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }

  function paintSkin(size) {
    const c = makeCanvas(size);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = fbm(x * 0.04, y * 0.04, 4);
        const i = (y * size + x) * 4;
        d[i] = 28 + n * 18;
        d[i + 1] = 22 + n * 10;
        d[i + 2] = 20 + n * 8;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function paintFace() {
    const c = makeCanvas(512);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "#c9b39a";
    ctx.beginPath();
    ctx.ellipse(256, 270, 150, 190, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a0c0c";
    ctx.beginPath();
    ctx.ellipse(198, 250, 28, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(318, 250, 28, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2ead8";
    ctx.beginPath();
    ctx.arc(198, 252, 6, 0, Math.PI * 2);
    ctx.arc(318, 252, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a1010";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(256, 360, 70, 38, 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#200808";
    ctx.beginPath();
    ctx.ellipse(256, 372, 52, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  function paintSign(text, bg, fg) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = fg;
    ctx.font = "700 52px 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function makeRoughFromAlbedo(canvas, repeatX, repeatY) {
    const src = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const out = makeCanvas(canvas.width);
    const ctx = out.getContext("2d");
    const img = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < src.data.length; i += 4) {
      const l = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 3;
      const r = clamp(160 - l * 0.35 + (hash(i, 2) - 0.5) * 20, 40, 240);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = r;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toDataTex(out, repeatX, repeatY, true);
  }

  function createEnvMap() {
    const faces = [];
    const colors = ["#141010", "#0c0a0a", "#1a1210", "#080808", "#161210", "#050404"];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d");
      ctx.fillStyle = colors[i];
      ctx.fillRect(0, 0, 64, 64);
      faces.push(c);
    }
    const tex = new THREE.CubeTexture(faces);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  global.WARD13 = global.WARD13 || {};
  global.WARD13.createTextures = function createTextures() {
    const floor = paintFloor(512);
    const wall = paintWall(512);
    const ceil = paintCeiling(512);
    const metal = paintMetal(256);
    const wood = paintWood(256);
    const blood = paintBlood(256);
    const skin = paintSkin(256);
    const rx = 18;
    const ry = 12;
    return {
      floor: toTex(floor, rx, ry),
      floorNormal: toDataTex(heightToNormal(floor, 4.5), rx, ry, true),
      floorRough: makeRoughFromAlbedo(floor, rx, ry),
      wall: toTex(wall, 2.4, 1.2),
      wallNormal: toDataTex(heightToNormal(wall, 3.2), 2.4, 1.2, true),
      wallRough: makeRoughFromAlbedo(wall, 2.4, 1.2),
      ceiling: toTex(ceil, 14, 10),
      metal: toTex(metal, 2, 2),
      metalNormal: toDataTex(heightToNormal(metal, 2.4), 2, 2, true),
      wood: toTex(wood, 1, 1),
      blood: toTex(blood, 1, 1),
      skin: toTex(skin, 2, 2),
      face: toTex(paintFace(), 1, 1),
      env: createEnvMap(),
      exitSign: paintSign("安全出口", "#0b2e18", "#7CFFB2"),
      wardSign: paintSign("第十三病房  ·  禁入", "#2a0c0c", "#e8c9c9"),
    };
  };
})(window);
