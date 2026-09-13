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
    t: 0,
    mx: 0,
    my: 0,
    tx: 0,
    ty: 0,
    petals: [],
    motes: [],
    sparks: [],
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
    const count = Math.max(28, Math.floor((state.w * state.h) / 52000));
    state.petals = Array.from({ length: count }, () => makePetal(true));
    state.motes = Array.from({ length: count * 2 }, () => makeMote(true));
    state.sparks = Array.from({ length: 18 }, () => makeSpark(true));
  }

  function makePetal(anywhere) {
    return {
      x: rand(0, state.w),
      y: anywhere ? rand(-40, state.h) : -rand(20, 160),
      r: rand(4, 11),
      vx: rand(-0.18, 0.32),
      vy: rand(0.18, 0.55),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.01, 0.018),
      sway: rand(0, Math.PI * 2),
      hue: rand(330, 355),
      a: rand(0.35, 0.78),
    };
  }

  function makeMote(anywhere) {
    return {
      x: rand(0, state.w),
      y: anywhere ? rand(0, state.h) : rand(state.h * 0.1, state.h * 0.85),
      r: rand(0.6, 2.2),
      vx: rand(-0.08, 0.12),
      vy: rand(-0.12, -0.02),
      a: rand(0.12, 0.45),
      pulse: rand(0, Math.PI * 2),
    };
  }

  function makeSpark(anywhere) {
    return {
      x: rand(state.w * 0.12, state.w * 0.42),
      y: anywhere ? rand(state.h * 0.08, state.h * 0.55) : rand(state.h * 0.1, state.h * 0.4),
      r: rand(1.2, 2.8),
      a: rand(0.2, 0.7),
      pulse: rand(0, Math.PI * 2),
      speed: rand(0.8, 1.8),
    };
  }

  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.a;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r);
    g.addColorStop(0, `hsla(${p.hue}, 72%, 78%, 0.95)`);
    g.addColorStop(1, `hsla(${p.hue}, 60%, 42%, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r, p.r * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function tick(ts) {
    state.t = ts * 0.001;
    state.mx += (state.tx - state.mx) * 0.045;
    state.my += (state.ty - state.my) * 0.045;
    parallax.style.transform = `translate3d(${state.mx * 18}px, ${state.my * 12}px, 0)`;

    ctx.clearRect(0, 0, state.w, state.h);

    for (const p of state.petals) {
      p.sway += 0.012;
      p.x += p.vx + Math.sin(p.sway) * 0.35;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > state.h + 24 || p.x < -30 || p.x > state.w + 30) {
        Object.assign(p, makePetal(false));
      }
      drawPetal(p);
    }

    for (const m of state.motes) {
      m.x += m.vx + state.mx * 0.15;
      m.y += m.vy;
      m.pulse += 0.02;
      if (m.y < -10) Object.assign(m, makeMote(false), { y: state.h + 8 });
      ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(m.pulse));
      ctx.fillStyle = "rgba(230, 240, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of state.sparks) {
      s.pulse += 0.03 * s.speed;
      const glow = 0.25 + 0.75 * Math.abs(Math.sin(s.pulse));
      ctx.globalAlpha = s.a * glow;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
      g.addColorStop(0, "rgba(210, 232, 255, 0.95)");
      g.addColorStop(1, "rgba(210, 232, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x + Math.sin(s.pulse) * 6, s.y, s.r * 6, 0, Math.PI * 2);
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
    if (e.key === "Escape") hud.classList.remove("hide");
  });

  stage.addEventListener("dblclick", toggleFullscreen);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      stage.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.();
    }
  }

  setTimeout(() => hud.classList.add("hide"), 4200);

  resize();
  requestAnimationFrame(tick);
})();
