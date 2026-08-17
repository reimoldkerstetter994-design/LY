/* Procedural PBR-ish materials for Blacktide Inn. */
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

  function clamp(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }

  function grain(ctx, size, seed, amount) {
    const r = rng(seed);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = (r() - 0.5) * amount;
      d[i] = clamp(d[i] + g);
      d[i + 1] = clamp(d[i + 1] + g * 0.9);
      d[i + 2] = clamp(d[i + 2] + g * 0.75);
    }
    ctx.putImageData(img, 0, 0);
  }

  function stains(ctx, size, seed, color, n) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * size;
      const y = r() * size;
      const rad = 16 + r() * 88;
      const g = ctx.createRadialGradient(x, y, 2, x, y, rad);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  function streaks(ctx, size, color, count, seed) {
    const r = rng(seed);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = color;
    for (let i = 0; i < count; i++) {
      ctx.lineWidth = 0.6 + r() * 2.4;
      ctx.beginPath();
      const x = r() * size;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(
        x + (r() - 0.5) * 22,
        size * 0.4,
        x + (r() - 0.5) * 32,
        size * 0.7,
        x + (r() - 0.5) * 16,
        size
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function tex(key, size, draw, repeatX, repeatY) {
    if (cache[key]) return cache[key];
    const { c, ctx } = canvas(size);
    draw(ctx, size);
    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeatX || 1, repeatY || 1);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    cache[key] = map;
    return map;
  }

  function std(map, opts) {
    opts = opts || {};
    const shiny = opts.roughness != null ? (1 - opts.roughness) * 48 : 8;
    return new THREE.MeshPhongMaterial({
      map,
      color: opts.color != null ? opts.color : 0xffffff,
      specular: opts.metalness ? 0x666666 : 0x222222,
      shininess: Math.max(4, shiny),
      emissive: opts.emissive || 0x1a1612,
      emissiveIntensity: opts.emissiveIntensity != null ? opts.emissiveIntensity : 0.22,
      transparent: !!opts.transparent,
      opacity: opts.opacity != null ? opts.opacity : 1,
      side: opts.side || THREE.FrontSide,
      flatShading: false,
    });
  }

  function wallpaper(seed, base, stripe) {
    return tex("wp" + seed, 512, (ctx, s) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, s, s);
      if (stripe) {
        ctx.fillStyle = stripe;
        for (let x = 0; x < s; x += 28) ctx.fillRect(x, 0, 3, s);
      }
      stains(ctx, s, seed, "rgba(20,12,8,0.22)", 10);
      streaks(ctx, s, "rgba(10,8,6,0.35)", 18, seed + 3);
      grain(ctx, s, seed + 9, 28);
    }, 2.4, 2.2);
  }

  function wood(seed, a, b) {
    return tex("wd" + seed, 512, (ctx, s) => {
      const r = rng(seed);
      for (let y = 0; y < s; y++) {
        const t = (Math.sin(y * 0.08 + r() * 2) + 1) * 0.5;
        ctx.fillStyle = t > 0.5 ? a : b;
        ctx.fillRect(0, y, s, 1);
      }
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = "rgba(20,12,6,0.18)";
        ctx.fillRect(0, r() * s, s, 2 + r() * 6);
      }
      stains(ctx, s, seed, "rgba(40,10,8,0.2)", 6);
      grain(ctx, s, seed, 22);
    }, 1.6, 1.6);
  }

  function tile(seed) {
    return tex("tl" + seed, 512, (ctx, s) => {
      ctx.fillStyle = "#1a2226";
      ctx.fillRect(0, 0, s, s);
      const n = 8;
      const cell = s / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const shade = 70 + ((x + y) % 2) * 10;
          ctx.fillStyle = `rgb(${shade - 8},${shade},${shade + 6})`;
          ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
        }
      }
      stains(ctx, s, seed, "rgba(8,20,18,0.35)", 8);
      streaks(ctx, s, "rgba(180,200,210,0.12)", 10, seed);
      grain(ctx, s, seed, 18);
    }, 3, 3);
  }

  function concrete(seed) {
    return tex("cc" + seed, 512, (ctx, s) => {
      ctx.fillStyle = "#3a3c40";
      ctx.fillRect(0, 0, s, s);
      stains(ctx, s, seed, "rgba(0,0,0,0.35)", 16);
      stains(ctx, s, seed + 4, "rgba(40,50,40,0.18)", 8);
      grain(ctx, s, seed, 40);
    }, 2, 2);
  }

  function carpet(seed) {
    return tex("cp" + seed, 512, (ctx, s) => {
      ctx.fillStyle = "#4a2428";
      ctx.fillRect(0, 0, s, s);
      const r = rng(seed);
      ctx.strokeStyle = "rgba(80,20,24,0.35)";
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.moveTo(r() * s, r() * s);
        ctx.lineTo(r() * s, r() * s);
        ctx.stroke();
      }
      stains(ctx, s, seed, "rgba(10,0,0,0.4)", 12);
      grain(ctx, s, seed, 26);
    }, 3, 3);
  }

  function rust(seed) {
    return tex("rs" + seed, 256, (ctx, s) => {
      ctx.fillStyle = "#2a221c";
      ctx.fillRect(0, 0, s, s);
      stains(ctx, s, seed, "rgba(90,30,10,0.5)", 14);
      stains(ctx, s, seed + 2, "rgba(20,20,20,0.4)", 8);
      grain(ctx, s, seed, 30);
    }, 2, 2);
  }

  function glass() {
    return tex("gl", 256, (ctx, s) => {
      ctx.fillStyle = "rgba(20,28,36,0.35)";
      ctx.fillRect(0, 0, s, s);
      streaks(ctx, s, "rgba(200,220,240,0.25)", 26, 11);
      grain(ctx, s, 3, 10);
    }, 1, 1);
  }

  function filmGrainCanvas() {
    const { c, ctx } = canvas(256);
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function makeMats() {
    return {
      paper: std(wallpaper(1, "#6a5a48", "rgba(80,68,54,0.5)"), { roughness: 0.92 }),
      paperDark: std(wallpaper(2, "#4a3a32", "rgba(40,28,22,0.55)"), { roughness: 0.9 }),
      stripe: std(wallpaper(3, "#4a3034", "rgba(120,40,48,0.35)"), { roughness: 0.88 }),
      seaWall: std(wallpaper(4, "#3a4a52", null), { roughness: 0.9 }),
      wood: std(wood(5, "#6a4a32", "#4a3220"), { roughness: 0.72 }),
      woodLight: std(wood(6, "#7a5a38", "#5a4028"), { roughness: 0.7 }),
      tile: std(tile(7), { roughness: 0.35, metalness: 0.08 }),
      tileWall: std(tile(8), { roughness: 0.4 }),
      concrete: std(concrete(9), { roughness: 0.95 }),
      brick: std(concrete(10), { color: 0x6a4a3a, roughness: 0.9 }),
      carpet: std(carpet(11), { roughness: 1 }),
      rust: std(rust(12), { roughness: 0.55, metalness: 0.35 }),
      metal: std(rust(13), { color: 0x888890, roughness: 0.4, metalness: 0.7 }),
      glass: std(glass(), { roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
      water: new THREE.MeshPhongMaterial({
        color: 0x0a1a1c,
        specular: 0x88aacc,
        shininess: 60,
        transparent: true,
        opacity: 0.55,
      }),
      black: new THREE.MeshPhongMaterial({ color: 0x080808, shininess: 4 }),
      gold: new THREE.MeshPhongMaterial({ color: 0x8a6a32, specular: 0xaa8844, shininess: 42 }),
      cloth: new THREE.MeshPhongMaterial({ color: 0x2a1a1c, shininess: 2 }),
      skin: new THREE.MeshPhongMaterial({ color: 0x1a2422, shininess: 18, specular: 0x223322 }),
      glowRed: new THREE.MeshPhongMaterial({ color: 0x220000, emissive: 0xff2211, emissiveIntensity: 1.4 }),
      glowCyan: new THREE.MeshPhongMaterial({ color: 0x001018, emissive: 0x44aacc, emissiveIntensity: 0.9 }),
    };
  }

  global.BTTex = { makeMats, filmGrainCanvas, tex };
})(window);
