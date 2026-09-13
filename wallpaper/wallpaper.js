(() => {
  const scenes = window.WALLPAPER_SCENES;
  const stage = document.getElementById("stage");
  const frame = document.getElementById("frame");
  const parallax = document.getElementById("parallax");
  const sceneWrap = document.getElementById("sceneWrap");
  const clipA = document.getElementById("clipA");
  const clipB = document.getElementById("clipB");
  const canvas = document.getElementById("fx");
  const hud = document.getElementById("hud");
  const hudTitle = document.getElementById("hudTitle");
  const hudSub = document.getElementById("hudSub");
  const picker = document.getElementById("picker");
  const orientBtn = document.getElementById("orientBtn");
  const fpsEl = document.getElementById("fps");

  let ctx;
  try {
    ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  } catch {
    ctx = canvas.getContext("2d", { alpha: true });
  }

  const LEVELS = {
    high: { rain: 48, petals: 20, spray: 28, sparks: 12, burst: 24, bursts: 2 },
    med: { rain: 28, petals: 14, spray: 18, sparks: 8, burst: 16, bursts: 2 },
    low: { rain: 16, petals: 8, spray: 10, sparks: 5, burst: 10, bursts: 1 },
  };

  const nativePortrait = window.matchMedia("(orientation: portrait)").matches;
  const state = {
    index: 0,
    phone: nativePortrait,
    quality: "med",
    w: 0,
    h: 0,
    dpr: 1,
    mx: 0,
    my: 0,
    tx: 0,
    ty: 0,
    rain: [],
    petals: [],
    sparks: [],
    spray: [],
    bursts: [],
    nextBurst: 0,
    nextFlash: 0,
    flash: 0,
    auto: false,
    autoAt: 0,
    running: true,
    frames: 0,
    fps: 60,
    lastFps: performance.now(),
    slow: 0,
    fast: 0,
    live: clipA,
    next: clipB,
  };

  const TWO_PI = Math.PI * 2;
  const petalSprite = document.createElement("canvas");
  petalSprite.width = 28;
  petalSprite.height = 28;
  {
    const pctx = petalSprite.getContext("2d");
    pctx.translate(14, 14);
    pctx.fillStyle = "rgba(255, 150, 180, 0.95)";
    pctx.beginPath();
    pctx.moveTo(0, -11);
    pctx.quadraticCurveTo(9, -2, 0, 10);
    pctx.quadraticCurveTo(-9, -2, 0, -11);
    pctx.fill();
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function current() {
    return scenes[state.index];
  }

  function isPhone() {
    return state.phone;
  }

  function asset(scene) {
    return isPhone()
      ? { src: scene.portrait, thumb: scene.thumbP, origin: scene.originP, video: scene.videoP }
      : { src: scene.landscape, thumb: scene.thumbL, origin: scene.originL, video: scene.videoL };
  }

  function playClip(url) {
    if (state.live.getAttribute("src") === url && !state.live.paused) {
      state.live.play().catch(() => {});
      return;
    }
    const incoming = state.next;
    const outgoing = state.live;
    if (incoming.getAttribute("src") !== url) incoming.src = url;
    incoming.load();
    const start = () => {
      incoming.playbackRate = 1;
      incoming.play().catch(() => {});
      incoming.style.opacity = "1";
      outgoing.style.opacity = "0";
      outgoing.pause();
      state.live = incoming;
      state.next = outgoing;
    };
    if (incoming.readyState >= 2) start();
    else incoming.addEventListener("canplay", start, { once: true });
  }

  function resize() {
    const rect = frame.getBoundingClientRect();
    state.w = Math.max(1, Math.floor(rect.width));
    state.h = Math.max(1, Math.floor(rect.height));
    const maxEdge = state.quality === "high" ? 1280 : state.quality === "med" ? 960 : 720;
    const scale = Math.min(1, maxEdge / Math.max(state.w, state.h));
    canvas.width = Math.max(1, Math.floor(state.w * scale));
    canvas.height = Math.max(1, Math.floor(state.h * scale));
    canvas.style.width = `${state.w}px`;
    canvas.style.height = `${state.h}px`;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    stage.classList.toggle("lite", state.quality !== "high");
    seed();
  }

  function seed() {
    const q = LEVELS[state.quality];
    const fx = current().fx;
    state.rain = fx === "storm" ? Array.from({ length: q.rain }, () => makeRain(true)) : [];
    state.petals = fx === "sakura" || fx === "moonlit"
      ? Array.from({ length: q.petals }, () => makePetal(true))
      : [];
    state.sparks = fx === "hanabi" || fx === "storm" || fx === "tide"
      ? Array.from({ length: q.sparks }, () => makeSpark(true))
      : [];
    state.spray = fx === "tide" ? Array.from({ length: q.spray }, () => makeSpray(true)) : [];
    state.bursts = [];
    state.nextBurst = 0;
    state.nextFlash = performance.now() + 800;
    state.flash = 0;
  }

  function makeRain(anywhere) {
    return {
      x: rand(-20, state.w + 20),
      y: anywhere ? rand(-state.h, state.h) : rand(-120, -8),
      len: rand(16, 34),
      vy: rand(16, 26),
      vx: -7,
      a: rand(0.3, 0.62),
    };
  }

  function makePetal(anywhere) {
    return {
      x: rand(0, state.w),
      y: anywhere ? rand(-30, state.h) : -rand(8, 90),
      s: rand(0.7, 1.25),
      vx: rand(-0.6, 1.4),
      vy: rand(0.7, 1.8),
      rot: rand(0, TWO_PI),
      vr: rand(-0.05, 0.05),
      sway: rand(0, TWO_PI),
    };
  }

  function makeSpark(anywhere) {
    return {
      x: rand(0, state.w),
      y: anywhere ? rand(0, state.h * 0.7) : rand(0, state.h * 0.4),
      r: rand(1.1, 2.4),
      pulse: rand(0, TWO_PI),
      speed: rand(1.2, 2.4),
    };
  }

  function makeSpray(anywhere) {
    return {
      x: rand(state.w * 0.12, state.w * 0.95),
      y: anywhere ? rand(state.h * 0.4, state.h + 10) : state.h + 8,
      vx: rand(-1.6, 4.2),
      vy: rand(-8, -3),
      r: rand(1.2, 3.1),
      life: anywhere ? rand(0.25, 1) : 1,
    };
  }

  function recycleRain(d) {
    d.x = rand(-20, state.w + 20);
    d.y = rand(-120, -8);
  }

  function recyclePetal(p) {
    p.x = rand(0, state.w);
    p.y = -rand(8, 90);
  }

  function spawnBurst() {
    const q = LEVELS[state.quality];
    const x = rand(state.w * 0.2, state.w * 0.9);
    const y = rand(state.h * 0.06, state.h * 0.38);
    const colors = ["#ffd56a", "#ff5a7a", "#7ee8ff", "#ff9a3c"];
    const color = colors[(Math.random() * colors.length) | 0];
    const parts = [];
    for (let i = 0; i < q.burst; i += 1) {
      const ang = (TWO_PI * i) / q.burst;
      const spd = rand(1.4, 5.4);
      parts.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1,
        color,
        r: 1.8,
      });
    }
    state.bursts.push(parts);
    if (state.bursts.length > q.bursts) state.bursts.shift();
  }

  function drawFx(now, dt) {
    const fx = current().fx;
    ctx.clearRect(0, 0, state.w, state.h);

    if (fx === "storm") {
      if (now > state.nextFlash) {
        state.flash = 0.55;
        state.nextFlash = now + rand(1200, 2600);
      }
      ctx.strokeStyle = "rgba(210,232,255,0.72)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < state.rain.length; i += 1) {
        const d = state.rain[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.y > state.h + 16) recycleRain(d);
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 8, d.y + d.len);
      }
      ctx.stroke();
    }

    if (fx === "sakura" || fx === "moonlit") {
      const wind = fx === "sakura" ? 1.2 : 0.7;
      for (let i = 0; i < state.petals.length; i += 1) {
        const p = state.petals[i];
        p.sway += 0.04 * dt;
        p.x += (p.vx + Math.sin(p.sway) * wind) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.y > state.h + 20 || p.x < -40 || p.x > state.w + 40) recyclePetal(p);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(petalSprite, p.x - 10 * p.s, p.y - 10 * p.s, 20 * p.s, 20 * p.s);
      }
    }

    if (fx === "hanabi") {
      if (now > state.nextBurst) {
        spawnBurst();
        state.nextBurst = now + rand(520, 980);
      }
      for (let b = 0; b < state.bursts.length; b += 1) {
        const parts = state.bursts[b];
        for (let i = 0; i < parts.length; i += 1) {
          const p = parts[i];
          if (p.life <= 0) continue;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 0.035 * dt;
          p.life -= 0.01 * dt;
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, 2.2, 2.2);
        }
      }
      ctx.globalAlpha = 1;
    }

    if (fx === "tide") {
      ctx.fillStyle = "rgba(230,246,255,0.88)";
      ctx.beginPath();
      for (let i = 0; i < state.spray.length; i += 1) {
        const s = state.spray[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 0.14 * dt;
        s.life -= 0.01 * dt;
        if (s.life <= 0 || s.y > state.h + 20) {
          s.x = rand(state.w * 0.12, state.w * 0.95);
          s.y = state.h + 8;
          s.vx = rand(-1.6, 4.2);
          s.vy = rand(-8, -3);
          s.life = 1;
        }
        ctx.moveTo(s.x + s.r, s.y);
        ctx.arc(s.x, s.y, s.r, 0, TWO_PI);
      }
      ctx.fill();
    }

    if (state.sparks.length) {
      ctx.fillStyle = fx === "hanabi" ? "rgba(255,220,140,0.85)" : "rgba(220,238,255,0.8)";
      ctx.beginPath();
      for (let i = 0; i < state.sparks.length; i += 1) {
        const s = state.sparks[i];
        s.pulse += 0.07 * s.speed * dt;
        if (fx === "hanabi") {
          s.y += 1.4 * dt;
          if (s.y > state.h) s.y = -8;
        }
        const x = s.x + Math.sin(s.pulse) * 6;
        ctx.moveTo(x + s.r, s.y);
        ctx.arc(x, s.y, s.r, 0, TWO_PI);
      }
      ctx.fill();
    }

    if (state.flash > 0.02) {
      ctx.globalAlpha = state.flash;
      ctx.fillStyle = "#e8f3ff";
      ctx.fillRect(0, 0, state.w, state.h);
      ctx.globalAlpha = 1;
      state.flash *= 0.72;
    }
  }

  let last = performance.now();
  function tick(now) {
    if (!state.running) {
      requestAnimationFrame(tick);
      return;
    }
    const rawDt = Math.min(32, now - last);
    last = now;
    const dt = rawDt / 16.67;

    state.frames += 1;
    if (now - state.lastFps > 500) {
      state.fps = Math.round((state.frames * 1000) / (now - state.lastFps));
      state.frames = 0;
      state.lastFps = now;
      fpsEl.textContent = `${state.fps} FPS · ${state.quality === "high" ? "高" : state.quality === "med" ? "中" : "低"}`;
      if (state.fps < 50) state.slow += 1;
      else state.slow = 0;
      if (state.fps > 56) state.fast += 1;
      else state.fast = 0;
      if (state.slow >= 2 && state.quality !== "low") {
        state.quality = state.quality === "high" ? "med" : "low";
        resize();
      } else if (state.fast >= 8 && state.quality === "low") {
        state.quality = "med";
        resize();
      }
    }

    const t = now * 0.001;
    state.mx += (state.tx + Math.sin(t * 0.55) * 0.35 - state.mx) * 0.06;
    state.my += (state.ty + Math.cos(t * 0.4) * 0.22 - state.my) * 0.06;
    parallax.style.transform = `translate3d(${state.mx * 10}px, ${state.my * 6}px, 0)`;
    drawFx(now, dt);

    if (state.auto && now > state.autoAt) show((state.index + 1) % scenes.length, true);
    requestAnimationFrame(tick);
  }

  function applyOrient() {
    const phone = isPhone();
    stage.classList.toggle("phone", phone && window.innerWidth > window.innerHeight);
    orientBtn.classList.toggle("on", phone);
    orientBtn.textContent = phone ? "竖版" : "横版";
    buildPicker();
    show(state.index);
    requestAnimationFrame(resize);
  }

  function show(index, fromAuto) {
    state.index = (index + scenes.length) % scenes.length;
    const scene = current();
    const a = asset(scene);
    stage.dataset.theme = scene.id;
    sceneWrap.style.setProperty("--origin", a.origin);
    playClip(a.video);
    hudTitle.textContent = scene.title;
    hudSub.textContent = `${scene.sub} · ${isPhone() ? "竖版" : "横版"} · P 切换方向`;
    hud.classList.remove("dim");
    picker.querySelectorAll(".pick").forEach((btn, i) => {
      btn.classList.toggle("active", i === state.index);
    });
    seed();
    state.autoAt = performance.now() + (fromAuto ? 16000 : 18000);
    const hash = `${scene.id}${isPhone() ? "/p" : ""}`;
    history.replaceState(null, "", `#${hash}`);
    setTimeout(() => hud.classList.add("dim"), 2400);
  }

  function buildPicker() {
    picker.innerHTML = scenes.map((scene, i) => {
      const a = asset(scene);
      return `<button class="pick${i === state.index ? " active" : ""}" type="button" data-i="${i}" title="${scene.title}">
        <img src="${a.thumb}" alt="${scene.title}" />
      </button>`;
    }).join("");
  }

  function preload() {
    scenes.forEach((scene) => {
      [scene.thumbL, scene.thumbP].forEach((src) => {
        const img = new Image();
        img.src = src;
      });
      [scene.videoL, scene.videoP].forEach((src) => {
        const v = document.createElement("video");
        v.preload = "auto";
        v.muted = true;
        v.src = src;
      });
    });
  }

  function togglePhone() {
    state.phone = !state.phone;
    applyOrient();
  }

  picker.addEventListener("click", (e) => {
    const btn = e.target.closest(".pick");
    if (!btn) return;
    state.auto = false;
    show(Number(btn.dataset.i));
  });
  orientBtn.addEventListener("click", togglePhone);

  window.addEventListener("resize", () => {
    clearTimeout(state.resizeT);
    state.resizeT = setTimeout(resize, 80);
  });
  window.addEventListener("mousemove", (e) => {
    const r = frame.getBoundingClientRect();
    if (!r.width) return;
    state.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    state.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  document.addEventListener("visibilitychange", () => {
    state.running = document.visibilityState === "visible";
    last = performance.now();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "5") {
      state.auto = false;
      show(Number(e.key) - 1);
    }
    if (e.key === "ArrowRight") {
      state.auto = false;
      show(state.index + 1);
    }
    if (e.key === "ArrowLeft") {
      state.auto = false;
      show(state.index - 1);
    }
    if (e.key === " ") {
      e.preventDefault();
      state.auto = !state.auto;
      state.autoAt = performance.now() + 4000;
      hudSub.textContent = `轮播已${state.auto ? "开启" : "关闭"}`;
      hud.classList.remove("dim");
    }
    if (e.key === "p" || e.key === "P") togglePhone();
    if (e.key === "f" || e.key === "F") {
      if (!document.fullscreenElement) stage.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    }
  });

  const hash = location.hash.replace("#", "");
  const [id, orient] = hash.split("/");
  const boot = scenes.findIndex((s) => s.id === id);
  if (orient === "p") state.phone = true;
  if (orient === "l") state.phone = false;
  preload();
  buildPicker();
  applyOrient();
  if (boot >= 0) show(boot);
  requestAnimationFrame(tick);
})();
