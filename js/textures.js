/* Procedural PBR-ish materials for Stillhouse. */
(function (global) {
  const cache = {};

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function canvas(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return { c, ctx: c.getContext("2d", { willReadFrequently: true }) };
  }

  function noiseField(ctx, size, seed, alpha, scale) {
    const r = rng(seed);
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = r() * 255;
      d[i] = d[i + 1] = d[i + 2] = n;
      d[i + 3] = alpha;
    }
    ctx.putImageData(img, 0, 0);
    if (scale !== 1) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.scale(scale, scale);
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
    }
  }

  function grain(ctx, size, seed, amount) {
    const r = rng(seed);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = (r() - 0.5) * amount;
      d[i] = clamp(d[i] + g);
      d[i + 1] = clamp(d[i + 1] + g * 0.92);
      d[i + 2] = clamp(d[i + 2] + g * 0.8);
    }
    ctx.putImageData(img, 0, 0);
  }

  function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }

  function streaks(ctx, size, color, count, seed) {
    const r = rng(seed);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = color;
    for (let i = 0; i < count; i++) {
      ctx.lineWidth = 0.6 + r() * 2.2;
      ctx.beginPath();
      const x = r() * size;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (r() - 0.5) * 20, size * 0.4, x + (r() - 0.5) * 30, size * 0.7, x + (r() - 0.5) * 16, size);
      ctx.stroke();
    }
    ctx.restore();
  }

  function stains(ctx, size, seed, color, n) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * size;
      const y = r() * size;
      const rad = 18 + r() * 90;
      const g = ctx.createRadialGradient(x, y, 2, x, y, rad);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  function planks(ctx, size, cols, seed, c1, c2) {
    const r = rng(seed);
    const w = size / cols;
    for (let i = 0; i < cols; i++) {
      ctx.fillStyle = mix(c1, c2, r());
      ctx.fillRect(i * w, 0, w + 1, size);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(i * w, 0, 2, size);
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(i * w + r() * w, r() * size, 1, 20 + r() * 80);
      }
    }
  }

  function mix(a, b, t) {
    const pa = parse(a);
    const pb = parse(b);
    const m = (x, y) => Math.round(x + (y - x) * t);
    return `rgb(${m(pa[0], pb[0])},${m(pa[1], pb[1])},${m(pa[2], pb[2])})`;
  }

  function parse(c) {
    const h = c.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function toTex(c, repeat, srgb) {
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 8;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function normalFrom(src, strength) {
    const size = src.width;
    const sctx = src.getContext("2d");
    const srcData = sctx.getImageData(0, 0, size, size).data;
    const { c, ctx } = canvas(size);
    const out = ctx.createImageData(size, size);
    const lum = (x, y) => {
      const i = (((y + size) % size) * size + ((x + size) % size)) * 4;
      return (srcData[i] * 0.3 + srcData[i + 1] * 0.59 + srcData[i + 2] * 0.11) / 255;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
        const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
        const i = (y * size + x) * 4;
        out.data[i] = clamp(128 - dx * 255);
        out.data[i + 1] = clamp(128 - dy * 255);
        out.data[i + 2] = 255;
        out.data[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return toTex(c, 1, false);
  }

  function make(name, builder, repeat, size) {
    if (cache[name]) return cache[name];
    const { c, ctx } = canvas(size || 512);
    builder(ctx, c.width);
    grain(ctx, c.width, name.length * 997, 16);
    const map = toTex(c, repeat || 1, true);
    const normal = normalFrom(c, 2.4);
    normal.repeat.copy(map.repeat);
    cache[name] = { map, normal, canvas: c };
    return cache[name];
  }

  function mat(name, opts) {
    const t = TEX[name];
    const m = new THREE.MeshStandardMaterial({
      map: t.map,
      normalMap: t.normal,
      roughness: opts.roughness ?? 0.82,
      metalness: opts.metalness ?? 0.02,
      color: opts.color ?? 0xffffff,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
    if (opts.repeat) {
      m.map = t.map.clone();
      m.normalMap = t.normal.clone();
      m.map.repeat.set(opts.repeat[0], opts.repeat[1]);
      m.normalMap.repeat.set(opts.repeat[0], opts.repeat[1]);
      m.map.needsUpdate = true;
    }
    return m;
  }

  const TEX = {};

  function buildAll() {
    TEX.wood = make(
      "wood",
      (ctx, s) => {
        ctx.fillStyle = "#3a2416";
        ctx.fillRect(0, 0, s, s);
        planks(ctx, s, 7, 11, "#4a2c18", "#2a1810");
        streaks(ctx, s, "#1a0c08", 18, 3);
        stains(ctx, s, 19, "rgba(20,10,6,0.35)", 6);
      },
      4
    );

    TEX.woodLight = make(
      "woodLight",
      (ctx, s) => {
        ctx.fillStyle = "#5a3a22";
        ctx.fillRect(0, 0, s, s);
        planks(ctx, s, 6, 21, "#6a4a2c", "#3e2818");
        stains(ctx, s, 4, "rgba(40,20,10,0.25)", 5);
      },
      3
    );

    TEX.tile = make(
      "tile",
      (ctx, s) => {
        ctx.fillStyle = "#6a6860";
        ctx.fillRect(0, 0, s, s);
        const n = 8;
        const w = s / n;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const shade = 90 + ((x + y) % 2) * 12 + (x * 7 + y * 3) % 18;
            ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 10})`;
            ctx.fillRect(x * w + 2, y * w + 2, w - 4, w - 4);
          }
        }
        stains(ctx, s, 8, "rgba(30,40,20,0.28)", 7);
        streaks(ctx, s, "rgba(180,200,210,0.15)", 10, 2);
      },
      3
    );

    TEX.paper = make(
      "paper",
      (ctx, s) => {
        ctx.fillStyle = "#6b5340";
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < 18; y++) {
          ctx.fillStyle = y % 2 ? "#5a4334" : "#745844";
          ctx.fillRect(0, y * (s / 18), s, s / 18 - 1);
        }
        stains(ctx, s, 33, "rgba(40,20,10,0.3)", 8);
        ctx.globalAlpha = 0.08;
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = "#c9a882";
          ctx.beginPath();
          ctx.arc(Math.random() * s, Math.random() * s, 20, 0, 6.28);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      2
    );

    TEX.stripe = make(
      "stripe",
      (ctx, s) => {
        ctx.fillStyle = "#3d332c";
        ctx.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x += 18) {
          ctx.fillStyle = x % 36 === 0 ? "#2c241e" : "#4a3e34";
          ctx.fillRect(x, 0, 9, s);
        }
        stains(ctx, s, 12, "rgba(20,10,8,0.4)", 6);
      },
      2
    );

    TEX.plaster = make(
      "plaster",
      (ctx, s) => {
        ctx.fillStyle = "#8a8074";
        ctx.fillRect(0, 0, s, s);
        noiseField(ctx, s, 77, 28, 1);
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "#c8c0b4";
        ctx.fillRect(0, 0, s, s);
        ctx.globalCompositeOperation = "source-over";
        stains(ctx, s, 5, "rgba(90,70,40,0.22)", 8);
        stains(ctx, s, 9, "rgba(40,50,30,0.18)", 4);
      },
      2
    );

    TEX.concrete = make(
      "concrete",
      (ctx, s) => {
        ctx.fillStyle = "#3a3834";
        ctx.fillRect(0, 0, s, s);
        noiseField(ctx, s, 41, 40, 1);
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "#6a6660";
        ctx.fillRect(0, 0, s, s);
        ctx.globalCompositeOperation = "source-over";
        stains(ctx, s, 2, "rgba(0,0,0,0.35)", 10);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.moveTo(Math.random() * s, Math.random() * s);
          ctx.lineTo(Math.random() * s, Math.random() * s);
          ctx.stroke();
        }
      },
      3
    );

    TEX.brick = make(
      "brick",
      (ctx, s) => {
        ctx.fillStyle = "#2a2420";
        ctx.fillRect(0, 0, s, s);
        const bh = 28;
        const bw = 62;
        let row = 0;
        for (let y = 0; y < s; y += bh) {
          const off = row % 2 ? bw / 2 : 0;
          for (let x = -bw; x < s; x += bw) {
            ctx.fillStyle = mix("#4a2a22", "#2c1814", Math.random());
            ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
          }
          row++;
        }
      },
      2
    );

    TEX.fabric = make(
      "fabric",
      (ctx, s) => {
        ctx.fillStyle = "#3a2a22";
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 4) {
          ctx.fillStyle = y % 8 ? "#2e201a" : "#46322a";
          ctx.fillRect(0, y, s, 2);
        }
        stains(ctx, s, 14, "rgba(10,6,4,0.4)", 5);
      },
      2
    );

    TEX.metal = make(
      "metal",
      (ctx, s) => {
        const g = ctx.createLinearGradient(0, 0, s, s);
        g.addColorStop(0, "#6a6864");
        g.addColorStop(0.5, "#2e2c2a");
        g.addColorStop(1, "#8a8680");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        grain(ctx, s, 90, 40);
      },
      1
    );

    TEX.door = make(
      "door",
      (ctx, s) => {
        ctx.fillStyle = "#2a1810";
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = "#3c2418";
        ctx.fillRect(28, 28, s - 56, s / 2 - 40);
        ctx.fillRect(28, s / 2 + 12, s - 56, s / 2 - 40);
        ctx.strokeStyle = "#1a0e08";
        ctx.lineWidth = 8;
        ctx.strokeRect(16, 16, s - 32, s - 32);
        stains(ctx, s, 6, "rgba(0,0,0,0.3)", 4);
      },
      1
    );

    TEX.photo = make(
      "photo",
      (ctx, s) => {
        ctx.fillStyle = "#2a261e";
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = "#6a5a44";
        ctx.fillRect(40, 50, s - 80, s - 120);
        ctx.fillStyle = "#3a3028";
        ctx.fillRect(90, 90, 80, 110);
        ctx.beginPath();
        ctx.arc(130, 80, 28, 0, 6.28);
        ctx.fill();
        ctx.fillStyle = "#4a3a30";
        ctx.fillRect(200, 140, 70, 90);
        stains(ctx, s, 1, "rgba(80,0,0,0.25)", 3);
      },
      1
    );

    TEX.rain = make(
      "rain",
      (ctx, s) => {
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.clearRect(0, 0, s, s);
        ctx.strokeStyle = "rgba(190,210,230,0.35)";
        for (let i = 0; i < 90; i++) {
          const x = Math.random() * s;
          ctx.lineWidth = 0.7 + Math.random();
          ctx.beginPath();
          ctx.moveTo(x, Math.random() * s);
          ctx.lineTo(x - 4, Math.random() * s);
          ctx.stroke();
        }
      },
      2
    );

    return TEX;
  }

  function filmGrainCanvas() {
    const { c, ctx } = canvas(256);
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = 80 + Math.random() * 140;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  global.SHTex = { buildAll, mat, TEX, filmGrainCanvas, toTex };
})(window);
