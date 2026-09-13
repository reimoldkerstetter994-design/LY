(() => {
  const stage = document.getElementById("stage");
  const parallax = document.getElementById("parallax");
  const canvas = document.getElementById("fx");
  const hud = document.getElementById("hud");
  const ctx = canvas.getContext("2d", { alpha: true });

  const state = {
    w: 0,
    h: 0,
    dpr: 1,
    mx: 0,
    my: 0,
    tx: 0,
    ty: 0,
    petals: [],
    motes: [],
    sparks: [],
    lights: [],
  };

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

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function seed() {
    const area = state.w * state.h;
    const petalCount = Math.max(42, Math.floor(area / 28000));
    state.petals = Array.from({ length: petalCount }, () => makePetal(true));
    state.motes = Array.from({ length: petalCount * 2 }, () => makeMote(true));
    state.sparks = Array.from({ length: 26 }, () => makeSpark(true));
    state.lights = Array.from({ length: 36 }, () => makeCityLight());
  }

  function makePetal(anywhere) {
    return {
      x: rand(0, state.w),
      y: anywhere ? rand(-40, state.h) : -rand(20, 180),
      r: rand(10, 22),
      vx: rand(-0.35, 0.55),
      vy: rand(0.55, 1.35),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.03, 0.04),
      sway: rand(0, Math.PI * 2),
      hue: rand(336, 356),
      a: rand(0.55, 0.95),
    };
  }

  function makeMote(anywhere) {
    return {
      x: rand(0, state.w),
      y: anywhere ? rand(0, state.h) : rand(state.h * 0.1, state.h),
      r: rand(1.1, 3.2),
      vx: rand(-0.16, 0.22),
      vy: rand(-0.28, -0.04),
      a: rand(0.25, 0.7),
      pulse: rand(0, Math.PI * 2),
    };
  }

  function makeSpark(anywhere) {
    return {
      x: rand(state.w * 0.08, state.w * 0.5),
      y: anywhere ? rand(state.h * 0.04, state.h * 0.55) : rand(state.h * 0.08, state.h * 0.4),
      r: rand(1.6, 3.4),
      a: rand(0.35, 0.85),
      pulse: rand(0, Math.PI * 2),
      speed: rand(1.1, 2.2),
    };
  }

  function makeCityLight() {
    return {
      x: rand(state.w * 0.55, state.w * 0.96),
      y: rand(state.h * 0.04, state.h * 0.42),
      r: rand(1.2, 2.6),
      pulse: rand(0, Math.PI * 2),
      speed: rand(1.4, 3.2),
      color: Math.random() > 0.35 ? "255, 214, 140" : "190, 220, 255",
    };
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.a;
    ctx.fillStyle = `hsla(${p.hue}, 78%, 62%, 0.95)`;
    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.quadraticCurveTo(p.r * 0.85, -p.r * 0.15, 0, p.r * 0.85);
    ctx.quadraticCurveTo(-p.r * 0.85, -p.r * 0.15, 0, -p.r);
    ctx.fill();
    ctx.fillStyle = `hsla(${p.hue}, 90%, 78%, 0.55)`;
    ctx.beginPath();
    ctx.ellipse(-p.r * 0.12, -p.r * 0.1, p.r * 0.28, p.r * 0.18, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function tick(ts) {
    const t = ts * 0.001;
    const idleX = Math.sin(t * 0.55) * 0.55;
    const idleY = Math.cos(t * 0.4) * 0.35;
    state.mx += (state.tx + idleX - state.mx) * 0.06;
    state.my += (state.ty + idleY - state.my) * 0.06;
    parallax.style.transform = `translate3d(${state.mx * 36}px, ${state.my * 22}px, 0)`;

    ctx.clearRect(0, 0, state.w, state.h);

    for (const light of state.lights) {
      light.pulse += 0.04 * light.speed;
      const glow = 0.15 + 0.85 * Math.abs(Math.sin(light.pulse));
      ctx.globalAlpha = glow;
      ctx.fillStyle = `rgba(${light.color}, 0.95)`;
      ctx.beginPath();
      ctx.arc(light.x, light.y, light.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const p of state.petals) {
      p.sway += 0.03;
      p.x += p.vx + Math.sin(p.sway) * 0.85;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > state.h + 30 || p.x < -40 || p.x > state.w + 40) {
        Object.assign(p, makePetal(false));
      }
      drawPetal(p);
    }

    for (const m of state.motes) {
      m.x += m.vx + state.mx * 0.2;
      m.y += m.vy;
      m.pulse += 0.035;
      if (m.y < -12) Object.assign(m, makeMote(false), { y: state.h + 10 });
      ctx.globalAlpha = m.a * (0.45 + 0.55 * Math.sin(m.pulse));
      ctx.fillStyle = "rgba(236, 244, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of state.sparks) {
      s.pulse += 0.045 * s.speed;
      const glow = 0.2 + 0.8 * Math.abs(Math.sin(s.pulse));
      const x = s.x + Math.sin(s.pulse) * 10;
      ctx.globalAlpha = s.a * glow;
      const g = ctx.createRadialGradient(x, s.y, 0, x, s.y, s.r * 8);
      g.addColorStop(0, "rgba(220, 238, 255, 1)");
      g.addColorStop(1, "rgba(220, 238, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, s.y, s.r * 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }

  function onMove(clientX, clientY) {
    state.tx = (clientX / state.w - 0.5) * 2;
    state.ty = (clientY / state.h - 0.5) * 2;
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  window.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    if (t) onMove(t.clientX, t.clientY);
  }, { passive: true });

  window.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") toggleFullscreen();
  });

  stage.addEventListener("dblclick", toggleFullscreen);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      stage.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  setTimeout(() => hud.classList.add("hide"), 2800);

  resize();
  requestAnimationFrame(tick);
})();
