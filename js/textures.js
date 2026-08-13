const TextureFactory = {
  rng(seed) {
    let a = seed >>> 0;
    return () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  canvas(size) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    return { canvas, ctx };
  },

  noise2(x, y, seed) {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 19.19) * 43758.5453;
    return n - Math.floor(n);
  },

  fbm(x, y, seed, octaves = 5) {
    let value = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < octaves; i += 1) {
      value += this.noise2(x * freq, y * freq, seed + i * 17) * amp;
      amp *= 0.5;
      freq *= 2;
    }
    return value;
  },

  toTexture(canvas, options = {}) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    if (options.repeat) texture.repeat.set(options.repeat, options.repeat);
    return texture;
  },

  sun(size = 512) {
    const { canvas, ctx } = this.canvas(size);
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        const n = this.fbm(u * 8, v * 8, 3.2, 6);
        const i = (y * size + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 120 + n * 110;
        image.data[i + 2] = 30 + n * 40;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.toTexture(canvas);
  },

  mercury(size = 512) {
    const { canvas, ctx } = this.canvas(size);
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = this.fbm(x / 42, y / 42, 11, 6);
        const crater = Math.pow(this.noise2(x / 18, y / 18, 44), 8);
        const tone = 110 + n * 90 - crater * 50;
        const i = (y * size + x) * 4;
        image.data[i] = tone;
        image.data[i + 1] = tone - 4;
        image.data[i + 2] = tone - 10;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.toTexture(canvas);
  },

  venus(size = 512) {
    const { canvas, ctx } = this.canvas(size);
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const swirl = this.fbm(x / 70 + y / 180, y / 55, 8, 5);
        const i = (y * size + x) * 4;
        image.data[i] = 210 + swirl * 40;
        image.data[i + 1] = 160 + swirl * 50;
        image.data[i + 2] = 70 + swirl * 30;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.toTexture(canvas);
  },

  earth(size = 1024) {
    const { canvas, ctx } = this.canvas(size);
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        const lat = (v - 0.5) * 2;
        const land = this.fbm(u * 6, v * 4, 21, 6);
        const mountain = this.fbm(u * 10, v * 8, 77, 4);
        const i = (y * size + x) * 4;
        if (Math.abs(lat) > 0.82 + land * 0.08) {
          image.data[i] = 235;
          image.data[i + 1] = 245;
          image.data[i + 2] = 255;
        } else if (land > 0.52) {
          const green = 90 + mountain * 70;
          image.data[i] = 50 + mountain * 80;
          image.data[i + 1] = green;
          image.data[i + 2] = 45;
        } else {
          const deep = land * 40;
          image.data[i] = 10 + deep;
          image.data[i + 1] = 55 + deep;
          image.data[i + 2] = 140 + deep;
        }
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.toTexture(canvas);
  },

  clouds(size = 1024) {
    const { canvas, ctx } = this.canvas(size);
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = this.fbm(x / 90, y / 70, 5, 5);
        const alpha = n > 0.58 ? (n - 0.58) * 420 : 0;
        const i = (y * size + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = Math.min(190, alpha);
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.toTexture(canvas);
  },

  mars(size = 512) {
    const { canvas, ctx } = this.canvas(size);
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const v = y / size;
        const n = this.fbm(x / 48, y / 48, 31, 6);
        const i = (y * size + x) * 4;
        if (v < 0.08 || v > 0.92) {
          image.data[i] = 240;
          image.data[i + 1] = 244;
          image.data[i + 2] = 250;
        } else {
          image.data[i] = 150 + n * 70;
          image.data[i + 1] = 60 + n * 30;
          image.data[i + 2] = 35 + n * 18;
        }
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.toTexture(canvas);
  },

  gasGiant(size, bands, storm) {
    const { canvas, ctx } = this.canvas(size);
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const v = y / size;
        const warp = this.fbm(x / 80, y / 40, 14, 4) - 0.5;
        const band = (Math.sin((v + warp * 0.08) * Math.PI * bands) + 1) / 2;
        const n = this.fbm(x / 30, y / 30, 9, 3);
        const i = (y * size + x) * 4;
        image.data[i] = storm.r + band * storm.dr + n * 20;
        image.data[i + 1] = storm.g + band * storm.dg + n * 12;
        image.data[i + 2] = storm.b + band * storm.db;
        image.data[i + 3] = 255;
      }
    }
    if (storm.spot) {
      ctx.putImageData(image, 0, 0);
      ctx.fillStyle = "rgba(196, 82, 48, 0.85)";
      ctx.beginPath();
      ctx.ellipse(size * 0.68, size * 0.58, size * 0.08, size * 0.045, -0.4, 0, Math.PI * 2);
      ctx.fill();
      return this.toTexture(canvas);
    }
    ctx.putImageData(image, 0, 0);
    return this.toTexture(canvas);
  },

  moon(size = 256) {
    const { canvas, ctx } = this.canvas(size);
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n = this.fbm(x / 28, y / 28, 66, 5);
        const crater = Math.pow(this.noise2(x / 12, y / 12, 18), 10);
        const tone = 150 + n * 70 - crater * 40;
        const i = (y * size + x) * 4;
        image.data[i] = tone;
        image.data[i + 1] = tone;
        image.data[i + 2] = tone - 6;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    return this.toTexture(canvas);
  },

  rings(inner, outer, color, gap = 0.67) {
    const size = 1024;
    const { canvas, ctx } = this.canvas(size);
    const image = ctx.createImageData(size, size);
    const cx = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (x - cx) / cx;
        const dy = (y - cx) / cx;
        const r = Math.sqrt(dx * dx + dy * dy);
        const i = (y * size + x) * 4;
        if (r < inner || r > outer) {
          image.data[i + 3] = 0;
          continue;
        }
        const t = (r - inner) / (outer - inner);
        const cassini = Math.abs(t - gap) < 0.03 ? 0 : 1;
        const bands = 0.45 + 0.55 * Math.abs(Math.sin(t * 70));
        image.data[i] = color.r;
        image.data[i + 1] = color.g;
        image.data[i + 2] = color.b;
        image.data[i + 3] = 210 * bands * cassini * (1 - Math.abs(t - 0.5) * 0.5);
      }
    }
    ctx.putImageData(image, 0, 0);
    const texture = this.toTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  },

  glowSprite() {
    const { canvas, ctx } = this.canvas(256);
    const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    gradient.addColorStop(0, "rgba(255, 240, 180, 1)");
    gradient.addColorStop(0.25, "rgba(255, 170, 60, 0.55)");
    gradient.addColorStop(0.6, "rgba(255, 100, 20, 0.12)");
    gradient.addColorStop(1, "rgba(255, 80, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const texture = this.toTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }
};
