(() => {
  const scenes = window.WALLPAPER_SCENES;
  const stage = document.getElementById("stage");
  const parallax = document.getElementById("parallax");
  const sceneWrap = document.getElementById("sceneWrap");
  const sceneImg = document.getElementById("scene");
  const canvas = document.getElementById("fx");
  const hud = document.getElementById("hud");
  const hudTitle = document.getElementById("hudTitle");
  const hudSub = document.getElementById("hudSub");
  const picker = document.getElementById("picker");
  const flash = document.getElementById("flash");
  const ctx = canvas.getContext("2d", { alpha: true });

  const state = {
    index: 0,
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
    auto: true,
    autoAt: performance.now() + 14000,
  };

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function current() {
    return scenes[state.index];
  }

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = window.innerWidth;
    state.h = window.innerHeight;
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    canvas.style.width = `${state.w}px`;
    canvas.style.height = `${state.h}px`;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    seed();
  }

  function seed() {
    const area = Math.max(1, state.w * state.h);
    state.rain = Array.from({ length: Math.floor(area / 4500) }, () => makeRain(true));
    state.petals = Array.from({ length: Math.floor(area / 16000) }, () => makePetal(true));
    state.sparks = Array.from({ length: 70 }, () => makeSpark(true));
    state.spray = Array.from({ length: Math.floor(area / 9000) }, () => makeSpray(true));
    state.bursts = [];
    state.nextBurst = 0;
    state.nextFlash = performance.now() + 700;
  }

  function makeRain(anywhere) {
    return {
      x: rand(-40, state.w + 40),
      y: anywhere ? rand(-state.h, state.h) : rand(-180, -10),
      len: rand(18, 46),
      vy: rand(18, 34),
      vx: rand(-10, -4),
      w: rand(1.1, 2.2),
      a: rand(0.28, 0.7),
    };
  }

  function makePetal(anywhere) {
    const sakura = current().fx === "sakura";
    return {
      x: rand(0, state.w),
      y: anywhere ? rand(-40, state.h) : -rand(10, 160),
      r: sakura ? rand(11, 24) : rand(8, 18),
      vx: rand(-1.2, 2.4),
      vy: rand(0.9, 2.6),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.08, 0.08),
      sway: rand(0, Math.PI * 2),
      hue: sakura ? rand(328, 350) : rand(336, 356),
      a: rand(0.62, 0.98),
    };
  }

  function makeSpark(anywhere) {
    return {
      x: rand(0, state.w),
      y: anywhere ? rand(0, state.h * 0.75) : rand(0, state.h * 0.45),
      r: rand(1.2, 3.4),
      a: rand(0.25, 0.85),
      pulse: rand(0, Math.PI * 2),
      speed: rand(1.4, 3.2),
    };
  }

  function makeSpray(anywhere) {
    return {
      x: rand(state.w * 0.15, state.w * 0.95),
      y: anywhere ? rand(state.h * 0.35, state.h + 20) : state.h + rand(0, 40),
      vx: rand(-2.5, 6),
      vy: rand(-10, -3.5),
      r: rand(1.4, 4.2),
      life: anywhere ? rand(0.2, 1) : 1,
    };
  }

  function spawnBurst(now) {
    const x = rand(state.w * 0.45, state.w * 0.92);
    const y = rand(state.h * 0.05, state.h * 0.42);
    const colors = ["#ffd56a", "#ff5a7a", "#7ee8ff", "#ff9a3c", "#f4f1ff"];
    const color = colors[(Math.random() * colors.length) | 0];
    const n = 90;
    const parts = [];
    for (let i = 0; i < n; i += 1) {
      const ang = (Math.PI * 2 * i) / n + rand(-0.08, 0.08);
      const spd = rand(1.6, 7.2);
      parts.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1,
        color,
        r: rand(1.3, 2.8),
      });
    }
    state.bursts.push({ parts, born: now });
    if (state.bursts.length > 6) state.bursts.shift();
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.a;
    ctx.fillStyle = `hsla(${p.hue}, 82%, 68%, 0.95)`;
    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.quadraticCurveTo(p.r * 0.9, -p.r * 0.1, 0, p.r * 0.85);
    ctx.quadraticCurveTo(-p.r * 0.9, -p.r * 0.1, 0, -p.r);
    ctx.fill();
    ctx.restore();
  }

  function drawFx(now) {
    const fx = current().fx;
    ctx.clearRect(0, 0, state.w, state.h);

    if (fx === "storm") {
      if (now > state.nextFlash) {
        flash.classList.remove("on");
        void flash.offsetWidth;
        flash.classList.add("on");
        state.nextFlash = now + rand(900, 2200);
      }
      ctx.strokeStyle = "rgba(210, 232, 255, 0.85)";
      for (const d of state.rain) {
        d.x += d.vx;
        d.y += d.vy;
        if (d.y > state.h + 20 || d.x < -60) Object.assign(d, makeRain(false));
        ctx.globalAlpha = d.a;
        ctx.lineWidth = d.w;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.vx * 1.1, d.y + d.len);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "rgba(180, 220, 255, 0.18)";
      ctx.fillRect(0, 0, state.w, state.h * 0.18);
    }

    if (fx === "sakura" || fx === "moonlit") {
      for (const p of state.petals) {
        p.sway += 0.05;
        p.x += p.vx + Math.sin(p.sway) * (fx === "sakura" ? 1.6 : 0.9);
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > state.h + 30 || p.x < -50 || p.x > state.w + 50) {
          Object.assign(p, makePetal(false));
        }
        drawPetal(p);
      }
    }

    if (fx === "hanabi") {
      if (now > state.nextBurst) {
        spawnBurst(now);
        if (Math.random() > 0.45) spawnBurst(now + 80);
        state.nextBurst = now + rand(380, 820);
      }
      for (const burst of state.bursts) {
        for (const p of burst.parts) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.045;
          p.life -= 0.012;
          if (p.life <= 0) continue;
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const s of state.sparks) {
        s.y += 1.8;
        s.x += rand(-0.4, 0.4);
        s.pulse += 0.1;
        if (s.y > state.h) Object.assign(s, makeSpark(false), { y: -10 });
        ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(s.pulse));
        ctx.fillStyle = "rgba(255, 220, 140, 0.95)";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (fx === "tide") {
      for (const s of state.spray) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.16;
        s.life -= 0.012;
        if (s.life <= 0 || s.y > state.h + 30) Object.assign(s, makeSpray(false));
        ctx.globalAlpha = Math.max(0, s.life) * 0.85;
        ctx.fillStyle = "rgba(230, 246, 255, 0.95)";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.16 + 0.1 * Math.sin(now * 0.01);
      ctx.fillStyle = "rgba(180, 230, 255, 0.35)";
      ctx.fillRect(0, state.h * 0.72, state.w, state.h * 0.28);
    }

    if (fx === "storm" || fx === "tide" || fx === "sakura") {
      for (const s of state.sparks) {
        s.pulse += 0.08 * s.speed;
        const glow = 0.2 + 0.8 * Math.abs(Math.sin(s.pulse));
        ctx.globalAlpha = s.a * glow * 0.65;
        ctx.fillStyle = fx === "sakura" ? "rgba(255, 210, 230, 0.9)" : "rgba(220, 238, 255, 0.95)";
        ctx.beginPath();
        ctx.arc(s.x + Math.sin(s.pulse) * 8, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  }

  function tick(now) {
    const t = now * 0.001;
    const idleX = Math.sin(t * 0.85) * 0.7;
    const idleY = Math.cos(t * 0.62) * 0.45;
    state.mx += (state.tx + idleX - state.mx) * 0.08;
    state.my += (state.ty + idleY - state.my) * 0.08;
    parallax.style.transform = `translate3d(${state.mx * 42}px, ${state.my * 26}px, 0)`;
    drawFx(now);

    if (state.auto && now > state.autoAt) {
      show((state.index + 1) % scenes.length, true);
    }
    requestAnimationFrame(tick);
  }

  function show(index, fromAuto) {
    state.index = (index + scenes.length) % scenes.length;
    const scene = current();
    stage.dataset.theme = scene.id;
    sceneWrap.style.setProperty("--origin", scene.origin);
    sceneImg.src = scene.src;
    sceneImg.alt = scene.title;
    hudTitle.textContent = scene.title;
    hudSub.textContent = `${scene.sub} · 数字键 1–5 切换 · 空格${state.auto ? "停止" : "开启"}轮播`;
    hud.classList.remove("dim");
    document.querySelectorAll(".pick").forEach((btn, i) => {
      btn.classList.toggle("active", i === state.index);
    });
    seed();
    state.autoAt = performance.now() + (fromAuto ? 14000 : 16000);
    history.replaceState(null, "", `#${scene.id}`);
    setTimeout(() => hud.classList.add("dim"), 2600);
  }

  function buildPicker() {
    picker.innerHTML = scenes.map((scene, i) => `
      <button class="pick${i === 0 ? " active" : ""}" type="button" data-i="${i}" title="${scene.title}">
        <img src="${scene.thumb}" alt="${scene.title}" />
      </button>
    `).join("");
    picker.addEventListener("click", (e) => {
      const btn = e.target.closest(".pick");
      if (!btn) return;
      state.auto = false;
      show(Number(btn.dataset.i));
    });
  }

  function onMove(x, y) {
    state.tx = (x / state.w - 0.5) * 2;
    state.ty = (y / state.h - 0.5) * 2;
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
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
      hudSub.textContent = `${current().sub} · 轮播已${state.auto ? "开启" : "关闭"}`;
      hud.classList.remove("dim");
    }
    if (e.key === "f" || e.key === "F") toggleFullscreen();
  });

  stage.addEventListener("dblclick", toggleFullscreen);

  function toggleFullscreen() {
    if (!document.fullscreenElement) stage.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  buildPicker();
  const boot = scenes.findIndex((s) => s.id === location.hash.replace("#", ""));
  resize();
  show(boot >= 0 ? boot : 0);
  requestAnimationFrame(tick);
})();
