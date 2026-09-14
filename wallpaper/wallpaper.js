(() => {
  const scenes = window.NIGHTFALL_SCENES;
  const stage = document.getElementById("stage");
  const frame = document.getElementById("frame");
  const parallax = document.getElementById("parallax");
  const sceneWrap = document.getElementById("sceneWrap");
  const sceneImg = document.getElementById("scene");
  const canvas = document.getElementById("fx");
  const hud = document.getElementById("hud");
  const hudTitle = document.getElementById("hudTitle");
  const hint = document.getElementById("hint");
  const picker = document.getElementById("picker");
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true })
    || canvas.getContext("2d", { alpha: true });

  const we = new URLSearchParams(location.search).has("we")
    || typeof window.wallpaperRequestRandomFile === "function";
  if (we) stage.classList.add("we");

  const state = {
    index: 0,
    phone: window.matchMedia("(orientation: portrait)").matches,
    intensity: 0.7,
    parallaxOn: true,
    showTitle: !we,
    autoCycle: false,
    cycleAt: 0,
    w: 0,
    h: 0,
    mx: 0,
    my: 0,
    tx: 0,
    ty: 0,
    rain: [],
    petals: [],
    sparks: [],
    spray: [],
    motes: [],
    bursts: [],
    bolt: null,
    nextFlash: 0,
    nextBurst: 0,
    flash: 0,
    running: true,
  };

  const TWO_PI = Math.PI * 2;
  const FIRE_HUES = ["#ffd27a", "#ff6b6b", "#7ae0ff", "#ff9ad5", "#fff4c2"];

  const petal = document.createElement("canvas");
  petal.width = 24;
  petal.height = 24;
  {
    const p = petal.getContext("2d");
    p.translate(12, 12);
    p.fillStyle = "rgba(255,150,180,.92)";
    p.beginPath();
    p.moveTo(0, -9);
    p.quadraticCurveTo(8, -1, 0, 9);
    p.quadraticCurveTo(-8, -1, 0, -9);
    p.fill();
  }

  const rose = document.createElement("canvas");
  rose.width = 20;
  rose.height = 20;
  {
    const p = rose.getContext("2d");
    p.translate(10, 10);
    p.fillStyle = "rgba(160,30,50,.88)";
    p.beginPath();
    p.moveTo(0, -7);
    p.quadraticCurveTo(6, 0, 0, 7);
    p.quadraticCurveTo(-6, 0, 0, -7);
    p.fill();
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const current = () => scenes[state.index];
  const isPhone = () => state.phone;

  function art(scene) {
    return isPhone()
      ? { src: scene.portrait, origin: scene.originP }
      : { src: scene.landscape, origin: scene.originL };
  }

  function budget() {
    const area = state.w * state.h;
    const k = state.intensity;
    return {
      rain: Math.floor((area / 14000) * k),
      petals: Math.floor((area / 38000) * k),
      spray: Math.floor((area / 22000) * k),
      sparks: Math.floor(16 * k),
      motes: Math.floor((area / 28000) * k),
    };
  }

  function resize() {
    const r = frame.getBoundingClientRect();
    state.w = Math.max(1, r.width | 0);
    state.h = Math.max(1, r.height | 0);
    const scale = Math.min(1, 960 / Math.max(state.w, state.h));
    canvas.width = Math.max(1, (state.w * scale) | 0);
    canvas.height = Math.max(1, (state.h * scale) | 0);
    canvas.style.width = `${state.w}px`;
    canvas.style.height = `${state.h}px`;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    seed();
  }

  function makeBolt() {
    const pts = [];
    let x = rand(state.w * 0.42, state.w * 0.92);
    let y = 0;
    pts.push([x, y]);
    while (y < state.h * 0.58) {
      x += rand(-38, 38);
      y += rand(18, 48);
      pts.push([x, y]);
    }
    return pts;
  }

  function spawnBurst(now) {
    const x = rand(state.w * 0.12, state.w * 0.88);
    const y = rand(state.h * 0.06, state.h * 0.4);
    const hue = FIRE_HUES[(Math.random() * FIRE_HUES.length) | 0];
    const n = 16 + ((20 * state.intensity) | 0);
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TWO_PI + rand(-0.12, 0.12);
      const sp = rand(1.2, 3.4);
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, r: rand(1.1, 2.2), hue,
      });
    }
    state.bursts.push({ parts, born: now });
    if (state.bursts.length > 5) state.bursts.shift();
  }

  function seed() {
    const b = budget();
    const fx = current().fx;
    state.rain = fx === "storm" ? Array.from({ length: b.rain }, () => ({
      x: rand(-20, state.w), y: rand(-state.h, state.h), len: rand(14, 30),
      vy: rand(15, 24), vx: -6,
    })) : [];
    state.petals = fx === "sakura" || fx === "moonlit" ? Array.from({ length: b.petals }, () => ({
      x: rand(0, state.w), y: rand(-20, state.h), s: rand(0.7, 1.2),
      vx: rand(-0.5, 1.2), vy: rand(0.6, 1.6), sway: rand(0, TWO_PI),
    })) : [];
    state.spray = fx === "tide" ? Array.from({ length: b.spray }, () => ({
      x: rand(state.w * 0.1, state.w), y: rand(state.h * 0.4, state.h),
      vx: rand(-1, 4), vy: rand(-7, -3), r: rand(1.1, 2.8), life: rand(0.3, 1),
    })) : [];
    state.sparks = fx === "hanabi" ? Array.from({ length: b.sparks }, () => ({
      x: rand(0, state.w), y: rand(0, state.h * 0.6), r: rand(1, 2.2), pulse: rand(0, TWO_PI),
    })) : [];
    state.motes = fx === "moonlit" || fx === "tide" ? Array.from({ length: b.motes }, () => ({
      x: rand(0, state.w), y: rand(0, state.h), r: rand(0.6, 1.6),
      vx: rand(-0.15, 0.15), vy: rand(-0.25, -0.05), a: rand(0.2, 0.7),
    })) : [];
    state.bursts = [];
    state.bolt = null;
    state.flash = 0;
    const now = performance.now();
    state.nextFlash = now + 900;
    state.nextBurst = now + 350;
  }

  function draw(now, dt) {
    const fx = current().fx;
    ctx.clearRect(0, 0, state.w, state.h);

    if (fx === "storm") {
      if (now > state.nextFlash) {
        state.flash = 0.46 * state.intensity;
        state.bolt = makeBolt();
        state.nextFlash = now + 1400 + Math.random() * 1600;
      }
      ctx.strokeStyle = "rgba(210,232,255,.7)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const d of state.rain) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.y > state.h + 12) { d.y = -20; d.x = rand(-20, state.w); }
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 7, d.y + d.len);
      }
      ctx.stroke();
      if (state.bolt && state.flash > 0.06) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, state.flash * 2.2);
        ctx.strokeStyle = "#e8f4ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(state.bolt[0][0], state.bolt[0][1]);
        for (let i = 1; i < state.bolt.length; i++) ctx.lineTo(state.bolt[i][0], state.bolt[i][1]);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (fx === "sakura" || fx === "moonlit") {
      const sprite = fx === "moonlit" ? rose : petal;
      for (const p of state.petals) {
        p.sway += 0.04 * dt;
        p.x += (p.vx + Math.sin(p.sway) * 0.9) * dt;
        p.y += p.vy * dt;
        if (p.y > state.h + 16) { p.y = -12; p.x = rand(0, state.w); }
        ctx.drawImage(sprite, p.x - 9 * p.s, p.y - 9 * p.s, 18 * p.s, 18 * p.s);
      }
    }

    if (fx === "tide") {
      ctx.fillStyle = "rgba(230,246,255,.86)";
      ctx.beginPath();
      for (const s of state.spray) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 0.13 * dt;
        s.life -= 0.01 * dt;
        if (s.life <= 0 || s.y > state.h + 16) {
          s.x = rand(state.w * 0.1, state.w); s.y = state.h + 6;
          s.vx = rand(-1, 4); s.vy = rand(-7, -3); s.life = 1;
        }
        ctx.moveTo(s.x + s.r, s.y);
        ctx.arc(s.x, s.y, s.r, 0, TWO_PI);
      }
      ctx.fill();
    }

    if (state.motes.length) {
      ctx.fillStyle = fx === "tide" ? "rgba(210,236,255,.55)" : "rgba(255,236,210,.5)";
      ctx.beginPath();
      for (const m of state.motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < -8) { m.y = state.h + 6; m.x = rand(0, state.w); }
        ctx.moveTo(m.x + m.r, m.y);
        ctx.arc(m.x, m.y, m.r, 0, TWO_PI);
      }
      ctx.fill();
    }

    if (fx === "hanabi") {
      if (now > state.nextBurst) {
        spawnBurst(now);
        state.nextBurst = now + 650 + Math.random() * 1200;
      }
      ctx.fillStyle = "rgba(255,220,140,.75)";
      ctx.beginPath();
      for (const s of state.sparks) {
        s.pulse += 0.08 * dt;
        s.y += 1.2 * dt;
        if (s.y > state.h) s.y = -6;
        const x = s.x + Math.sin(s.pulse) * 5;
        ctx.moveTo(x + s.r, s.y);
        ctx.arc(x, s.y, s.r, 0, TWO_PI);
      }
      ctx.fill();
      for (const burst of state.bursts) {
        for (const p of burst.parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 0.012 * dt;
          p.life -= 0.016 * dt;
          if (p.life > 0) {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.hue;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, TWO_PI);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
      state.bursts = state.bursts.filter((b) => b.parts.some((p) => p.life > 0));
    }

    if (state.flash > 0.02) {
      ctx.globalAlpha = state.flash;
      ctx.fillStyle = "#e8f3ff";
      ctx.fillRect(0, 0, state.w, state.h);
      ctx.globalAlpha = 1;
      state.flash *= 0.74;
    }
  }

  let last = performance.now();
  function tick(now) {
    if (!state.running) { requestAnimationFrame(tick); return; }
    const dt = Math.min(32, now - last) / 16.67;
    last = now;
    if (state.parallaxOn) {
      const t = now * 0.001;
      state.mx += (state.tx + Math.sin(t * 0.35) * 0.18 - state.mx) * 0.05;
      state.my += (state.ty + Math.cos(t * 0.28) * 0.12 - state.my) * 0.05;
      parallax.style.transform = `translate3d(${state.mx * 14}px, ${state.my * 9}px, 0)`;
    }
    if (state.autoCycle && now - state.cycleAt > 18000) {
      state.cycleAt = now;
      show(state.index + 1);
    }
    draw(now, dt);
    requestAnimationFrame(tick);
  }

  function show(i) {
    state.index = (i + scenes.length) % scenes.length;
    state.cycleAt = performance.now();
    const scene = current();
    const a = art(scene);
    stage.dataset.theme = scene.id;
    sceneWrap.style.setProperty("--origin", a.origin);
    sceneImg.style.setProperty("--origin", a.origin);
    if (sceneImg.getAttribute("src") !== a.src) {
      sceneImg.style.opacity = "0";
      const on = () => {
        sceneImg.style.opacity = "1";
        sceneImg.removeEventListener("load", on);
      };
      sceneImg.addEventListener("load", on);
      sceneImg.src = a.src;
    }
    hudTitle.textContent = scene.title;
    hud.classList.toggle("show", state.showTitle);
    hud.classList.toggle("force", we && state.showTitle);
    picker.querySelectorAll(".pick").forEach((el, n) => el.classList.toggle("active", n === state.index));
    seed();
    history.replaceState(null, "", `#${scene.id}${isPhone() ? "/p" : ""}`);
  }

  function applyOrient() {
    stage.classList.toggle("phone", isPhone() && window.innerWidth > window.innerHeight);
    buildPicker();
    show(state.index);
    requestAnimationFrame(resize);
  }

  function buildPicker() {
    picker.innerHTML = scenes.map((s, i) => (
      `<button class="pick${i === state.index ? " active" : ""}" type="button" data-i="${i}">
        <img src="${s.thumb}" alt="${s.title}" />
      </button>`
    )).join("");
  }

  picker.addEventListener("click", (e) => {
    const btn = e.target.closest(".pick");
    if (btn) show(Number(btn.dataset.i));
  });

  window.addEventListener("resize", () => {
    clearTimeout(state.rt);
    state.rt = setTimeout(() => { applyOrient(); }, 80);
  });
  window.addEventListener("mousemove", (e) => {
    const r = frame.getBoundingClientRect();
    state.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    state.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  document.addEventListener("visibilitychange", () => {
    state.running = document.visibilityState === "visible";
    last = performance.now();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "5") show(Number(e.key) - 1);
    if (e.key === "p" || e.key === "P") { state.phone = !state.phone; applyOrient(); }
    if (e.key === "f" || e.key === "F") {
      if (!document.fullscreenElement) stage.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    }
    if (e.key === "c" || e.key === "C") state.autoCycle = !state.autoCycle;
  });

  window.wallpaperPropertyListener = {
    applyUserProperties(props) {
      stage.classList.add("we");
      if (props.scene) {
        const id = props.scene.value;
        const i = scenes.findIndex((s) => s.id === id);
        if (i >= 0) show(i);
      }
      if (props.intensity) {
        state.intensity = Number(props.intensity.value) / 100;
        seed();
      }
      if (props.parallax) state.parallaxOn = !!props.parallax.value;
      if (props.autocycle) state.autoCycle = !!props.autocycle.value;
      if (props.showtitle) {
        state.showTitle = !!props.showtitle.value;
        hud.classList.toggle("show", state.showTitle);
        hud.classList.toggle("force", state.showTitle);
      }
    },
  };

  scenes.forEach((s) => { [s.landscape, s.portrait, s.thumb].forEach((src) => { const im = new Image(); im.src = src; }); });
  const hash = location.hash.replace("#", "").split("/");
  const boot = scenes.findIndex((s) => s.id === hash[0]);
  if (hash[1] === "p") state.phone = true;
  buildPicker();
  applyOrient();
  if (boot >= 0) show(boot);
  if (!we) {
    hud.classList.add("show");
    hint.classList.add("show");
    setTimeout(() => hud.classList.remove("show"), 3200);
    setTimeout(() => hint.classList.remove("show"), 4200);
  }
  requestAnimationFrame(tick);
})();
