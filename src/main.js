import { CHART_LEGEND, drawHistory } from "./charts.js";
import {
  BODIES,
  GROUPS,
  SCALES,
  focusRadius,
  placeAll,
  shellRadius,
} from "./catalog.js";
import {
  PLANCK2018,
  PRESETS,
  createCosmos,
  criticalDensityKgM3,
  normalizeParams,
  recessionOverC,
} from "./cosmology.js";
import { buildEpochs, nearestEpoch } from "./epochs.js";
import {
  KIND_LABEL,
  formatCosmicTime,
  formatFraction,
  formatH,
  formatLight,
  formatMass,
  formatMpc,
  formatRecession,
  formatRedshift,
  formatSci,
  formatTemp,
} from "./format.js";
import { createFallbackView, createUniverseView } from "./scene.js";
import { timeToUnit, unitToTime } from "./timewarp.js";
import { buildZeldovich } from "./zeldovich.js";

const MAP_LAYERS = [
  ["labels", "名称"],
  ["links", "连线"],
  ["disk", "星系盘"],
  ["plane", "超银平面"],
  ["axes", "坐标轴"],
  ["cmb", "微波背景"],
  ["horizon", "粒子视界"],
  ["hubble", "哈勃球"],
];
const WEB_LAYERS = [
  ["dm", "暗物质"],
  ["filaments", "纤维"],
  ["galaxies", "高密度峰"],
  ["box", "模拟盒"],
];

const METRICS = [
  ["age", "年龄"],
  ["a", "尺度因子"],
  ["z", "红移"],
  ["T", "温度"],
  ["H", "H(a)"],
  ["horizon", "粒子视界"],
  ["hubble", "哈勃半径"],
  ["cmb", "复合光子壳"],
  ["D", "增长 D"],
  ["q", "减速 q"],
  ["rho", "临界密度"],
  ["vc", "视界处退行"],
];

const state = {
  mode: "map",
  playing: false,
  speed: 1,
  follow: false,
  tour: false,
  tourMark: "",
  t: 13.8,
  selected: "laniakea",
  query: "",
  gain: 1.6,
  seed: 42,
  layers: {
    labels: true,
    links: true,
    disk: true,
    plane: false,
    axes: false,
    cmb: true,
    horizon: true,
    hubble: true,
    dm: true,
    filaments: true,
    galaxies: true,
    box: true,
  },
  params: { ...PLANCK2018 },
};

const $ = (id) => document.getElementById(id);
const canvas = $("view");
const host = $("stage");
let view;
try {
  view = createUniverseView(canvas, host);
} catch (error) {
  console.error(error);
  view = createFallbackView();
  queueMicrotask(() => {
    $("status-line").textContent = "WebGL 不可用，三维场景没有启动。右侧读数仍然来自同一套积分。";
  });
}

let cosmos = createCosmos(state.params);
let placed = [];
let epochs = [];
let simTimer = 0;
let fieldReady = false;
let currentSim = null;
let simReady = false;
let detailKey = "";
const metricEls = {};

init();
requestAnimationFrame(frame);

function init() {
  state.t = cosmos.ageGyr;
  buildMetrics();
  buildLayers();
  buildScales();
  buildLegend();
  bind();
  recompute(true);
  view.home(140);
  view.resize();
  window.addEventListener("resize", () => view.resize());
  new ResizeObserver(() => view.resize()).observe(host);
}

function bind() {
  $("mode-map").onclick = () => switchMode("map");
  $("mode-web").onclick = () => switchMode("web");
  $("play").onclick = () => {
    state.playing = !state.playing;
    if (state.playing && timeToUnit(state.t, cosmos.ageGyr) > 0.995) state.t = unitToTime(0, cosmos.ageGyr);
    paintTransport();
  };
  $("tour").onclick = startTour;
  $("follow").onclick = () => {
    state.follow = !state.follow;
    $("follow").classList.toggle("is-on", state.follow);
    if (state.follow) switchMode("map");
  };
  for (const button of document.querySelectorAll("[data-speed]")) {
    button.onclick = () => {
      state.speed = Number(button.dataset.speed);
      for (const peer of document.querySelectorAll("[data-speed]")) peer.classList.toggle("is-on", peer === button);
    };
  }
  $("time").addEventListener("input", () => {
    state.playing = false;
    state.tour = false;
    state.t = unitToTime(Number($("time").value) / 1000, cosmos.ageGyr);
    paintTransport();
  });
  $("search").addEventListener("input", () => {
    state.query = $("search").value.trim();
    renderCatalog();
  });
  $("h0").addEventListener("input", () => {
    state.params.H0 = Number($("h0").value);
    recompute(true);
  });
  $("om").addEventListener("input", () => {
    state.params.OmegaM = Number($("om").value);
    state.params.OmegaL = 1 - state.params.OmegaM - state.params.OmegaR;
    recompute(true);
  });
  $("ns").addEventListener("input", () => {
    state.params.ns = Number($("ns").value);
    recompute(true);
  });
  $("s8").addEventListener("input", () => {
    state.params.sigma8 = Number($("s8").value);
    recompute(true);
  });
  $("gain").addEventListener("input", () => {
    state.gain = Number($("gain").value);
    $("gain-val").textContent = state.gain.toFixed(1);
  });
  $("seed").addEventListener("change", () => {
    state.seed = Math.max(1, Number($("seed").value) || 1);
    recompute(true);
  });
  $("help-open").onclick = () => $("help").showModal();
  for (const button of document.querySelectorAll("[data-open]")) {
    button.onclick = () => {
      const id = button.dataset.open;
      const panel = $(id);
      const open = !panel.classList.contains("open");
      $("left").classList.remove("open");
      $("right").classList.remove("open");
      panel.classList.toggle("open", open);
    };
  }
  let down = null;
  canvas.addEventListener("pointerdown", (event) => {
    down = { x: event.clientX, y: event.clientY, t: performance.now() };
    state.follow = false;
    $("follow").classList.remove("is-on");
    view.stopAuto();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (moved < 6 && performance.now() - down.t < 500) {
      const id = view.pick(event.clientX, event.clientY);
      if (id) select(id, false);
    }
    down = null;
  });
  window.addEventListener("keydown", onKey);
}

function onKey(event) {
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (event.code === "Space") {
    event.preventDefault();
    $("play").click();
  } else if (event.key === "ArrowRight") {
    state.playing = false;
    state.t = unitToTime(Math.min(1, timeToUnit(state.t, cosmos.ageGyr) + 0.01), cosmos.ageGyr);
  } else if (event.key === "ArrowLeft") {
    state.playing = false;
    state.t = unitToTime(Math.max(0, timeToUnit(state.t, cosmos.ageGyr) - 0.01), cosmos.ageGyr);
  } else if (event.key === "]") stepEpoch(1);
  else if (event.key === "[") stepEpoch(-1);
  else if (event.key === "1") switchMode("map");
  else if (event.key === "2") switchMode("web");
  else if (event.key === "f" && state.selected) select(state.selected, true);
  else if (event.key === "?" || event.key === "h") $("help").showModal();
}

function stepEpoch(dir) {
  state.playing = false;
  const list = epochs;
  const index = list.findIndex((item) => item.id === nearestEpoch(list, state.t)?.id);
  const next = list[Math.min(list.length - 1, Math.max(0, index + dir))];
  if (next) state.t = next.tGyr;
}

function switchMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  $("mode-map").setAttribute("aria-selected", mode === "map" ? "true" : "false");
  $("mode-web").setAttribute("aria-selected", mode === "web" ? "true" : "false");
  view.setMode(mode);
  if (mode === "web" && simReady) {
    view.home((currentSim.box / currentSim.h) * 0.78);
  }
}

function recompute(rebuildSim) {
  state.params = normalizeParams({ ...state.params, flat: true });
  cosmos = createCosmos(state.params);
  if (state.t > cosmos.ageGyr) state.t = cosmos.ageGyr;
  epochs = buildEpochs(cosmos);
  placed = placeAll(BODIES, cosmos);
  view.setCatalog(placed);
  renderEpochs();
  renderPresets();
  renderCatalog();
  syncParamInputs();
  if (rebuildSim) scheduleField();
}

function scheduleField() {
  clearTimeout(simTimer);
  if (!fieldReady) {
    fieldReady = true;
    rebuildField();
    return;
  }
  $("status-line").textContent = "正在生成初始扰动…";
  simTimer = setTimeout(rebuildField, 120);
}

function rebuildField() {
  currentSim = buildZeldovich({
    H0: state.params.H0,
    OmegaM: state.params.OmegaM,
    ns: state.params.ns,
    sigma8: state.params.sigma8,
    seed: state.seed,
    n: 32,
    boxMpch: 256,
  });
  view.setSimulation(currentSim);
  simReady = true;
  $("status-line").textContent = "共动空间，原点在太阳。外壳是此刻正抵达这里的复合光子。";
}

function startTour() {
  state.tour = true;
  state.tourMark = "";
  state.playing = true;
  state.speed = 1;
  state.follow = false;
  $("follow").classList.remove("is-on");
  state.t = unitToTime(0, cosmos.ageGyr);
  switchMode("web");
  paintTransport();
}

function advanceTour(snap) {
  const a = snap.a;
  if (state.tourMark === "" && a < 0.02) state.tourMark = "early";
  if (state.tourMark === "early" && a >= 0.02) {
    state.tourMark = "clear";
    switchMode("map");
    view.lookRadius(Math.max(snap.horizonMpc, 20) * 1.15);
  }
  if (state.tourMark === "clear" && a >= 0.8) {
    state.tour = false;
    switchMode("map");
    view.focusOn([0, 0, 0], 140);
    select("laniakea", true);
  }
}

function frame(now) {
  try {
  const snap = cosmos.sampleTime(state.t);
  if (state.playing) {
    const u = timeToUnit(state.t, cosmos.ageGyr);
    const nu = u + 0.013 * state.speed * Math.min(0.05, (now - (frame.last || now)) / 1000);
    if (nu >= 1) {
      state.t = cosmos.ageGyr;
      state.playing = false;
      state.tour = false;
      paintTransport();
    } else {
      state.t = unitToTime(nu, cosmos.ageGyr);
    }
  }
  frame.last = now;
  const live = cosmos.sampleTime(state.t);
  if (state.tour) advanceTour(live);
  if (state.follow && state.mode === "map") view.lookRadius(Math.max(live.horizonMpc, 0.4) * 1.22);
  view.sync(live, state.layers, state.selected, state.gain);
  const radius = view.render();
  paintHud(live, radius);
  } catch (error) {
    console.error(error);
    const line = $("status-line");
    if (line) line.textContent = `渲染中断：${error?.message || error}`;
    return;
  }
  requestAnimationFrame(frame);
}

function paintHud(snap, radius) {
  $("chip-age").textContent = formatCosmicTime(snap.tGyr);
  $("chip-temp").textContent = formatTemp(snap.T).split(" · ")[0];
  $("chip-z").textContent = `z ${formatRedshift(snap.z)}`;
  $("chip-h").textContent = formatH(snap.H);
  $("clock").textContent = formatCosmicTime(snap.tGyr);
  $("clock-sub").textContent = `a = ${snap.a.toExponential(2)} · z = ${formatRedshift(snap.z)} · D = ${snap.D.toFixed(3)}`;
  $("time").value = String(Math.round(timeToUnit(snap.tGyr, cosmos.ageGyr) * 1000));
  const epoch = nearestEpoch(epochs, snap.tGyr);
  $("epoch-name").textContent = epoch?.name ?? "—";
  $("epoch-text").textContent = epoch?.text ?? "";
  for (const button of $("epochs").querySelectorAll("button")) {
    button.classList.toggle("is-on", button.dataset.id === epoch?.id);
  }
  paintMetrics(snap);
  paintMix(snap);
  drawHistory($("chart"), cosmos, snap.tGyr);
  paintScale(radius, snap);
  paintDetail(snap);
  paintTransport();
}

function paintMetrics(snap) {
  const vc = recessionOverC(snap.H, snap.a, snap.horizonMpc);
  const values = {
    age: formatCosmicTime(snap.tGyr),
    a: snap.a >= 0.001 ? snap.a.toFixed(4) : snap.a.toExponential(2),
    z: formatRedshift(snap.z),
    T: formatTemp(snap.T),
    H: formatH(snap.H),
    horizon: `${formatMpc(snap.horizonMpc)}`,
    hubble: formatMpc(snap.hubbleComovingMpc),
    cmb: snap.cmbVisible ? formatMpc(snap.cmbRadiusMpc) : "尚未复合",
    D: snap.D.toFixed(3),
    q: snap.q.toFixed(3),
    rho: formatSci(criticalDensityKgM3(snap.H), "kg/m³"),
    vc: formatRecession(vc),
  };
  for (const [id, text] of Object.entries(values)) metricEls[id].textContent = text;
}

function paintMix(snap) {
  const parts = [
    ["辐射", Math.max(snap.omega.r, 0), "#e36a45"],
    ["重子", Math.max(snap.omega.b, 0), "#f0d7a2"],
    ["暗物质", Math.max(snap.omega.c, 0), "#7ea2c4"],
    ["暗能量", Math.max(snap.omega.l, 0), "#d5924a"],
  ];
  const sum = parts.reduce((s, p) => s + p[1], 0) || 1;
  $("mix").innerHTML = parts.map((p) => `<span style="width:${(p[1] / sum) * 100}%;background:${p[2]}"></span>`).join("");
  $("mix-note").textContent = parts.map((p) => `${p[0]} ${formatFraction(p[1] / sum)}`).join("  ");
  const k = snap.omega.k;
  $("flat-note").textContent =
    Math.abs(state.params.OmegaK) < 1e-4
      ? `平坦宇宙，Ω_Λ = ${state.params.OmegaL.toFixed(3)}，Ωᵣ = ${state.params.OmegaR.toExponential(2)}`
      : `Ωₖ = ${k.toFixed(3)}。曲率项已经写进膨胀历史。`;
}

function paintScale(radius, snap) {
  const light = formatLight(radius);
  const horizon = formatMpc(snap.horizonMpc);
  $("scale-readout").textContent = `视野半径 ${formatMpc(radius)}${light ? " · " + light : ""} · 此刻视界 ${horizon}`;
  let best = SCALES[0];
  let score = Infinity;
  for (const scale of SCALES) {
    const target = scale.radius ?? snap.horizonMpc * 1.15;
    const d = Math.abs(Math.log(radius) - Math.log(Math.max(target, 1e-6)));
    if (d < score) {
      score = d;
      best = scale;
    }
  }
  for (const button of $("scales").querySelectorAll("button")) {
    button.classList.toggle("is-on", button.dataset.id === best.id);
  }
}

function paintDetail(snap) {
  const body = placed.find((item) => item.id === state.selected);
  const distance = body ? (body.shell ? shellRadius(body, snap) : body.d) : 0;
  const key = `${state.selected}|${snap.cmbVisible}|${formatMpc(distance)}|${body?.z ?? ""}`;
  if (key === detailKey) return;
  detailKey = key;
  const root = $("detail");
  if (!body) {
    root.innerHTML = `<p class="kicker">可观测宇宙</p><h3>从银心到粒子视界</h3><p>选择左侧天体，或直接点三维场景里的光点。时间轴停在今天时，你看到的是这个模型的现在。</p>`;
    return;
  }
  const light = formatLight(distance);
  const bits = [
    body.shell && !snap.cmbVisible && body.kind === "cmb" ? "复合还没发生" : `${formatMpc(distance)}${light ? " · " + light : ""}`,
    body.z != null ? `z = ${formatRedshift(body.z)}` : "",
    body.mass ? formatMass(body.mass) : "",
    body.radiusMpc && !body.shell ? `尺度 ${formatMpc(body.radiusMpc)}` : "",
  ].filter(Boolean);
  root.innerHTML = `
    <p class="kicker">${KIND_LABEL[body.kind] || "天体"}</p>
    <h3>${body.name}</h3>
    <p class="en">${body.en || ""}</p>
    <p class="meta">${bits.join(" · ")}</p>
    <p>${body.blurb}</p>
    ${body.schematic ? '<p class="badge">走向是示意</p>' : ""}
    ${body.kind === "cmb" && !snap.cmbVisible ? '<p><button type="button" id="jump-cmb" class="text-btn">跳到复合</button></p>' : ""}
  `;
  $("jump-cmb")?.addEventListener("click", () => {
    state.playing = false;
    state.t = cosmos.tRecGyr;
    view.focusOn([0, 0, 0], Math.max(cosmos.sampleTime(state.t).cmbRadiusMpc, 1) * 1.2);
  });
}

function paintTransport() {
  $("play").textContent = state.playing ? "暂停" : "播放";
}

function renderEpochs() {
  $("epochs").innerHTML = epochs
    .map((epoch) => `<button type="button" data-id="${epoch.id}">${epoch.name}</button>`)
    .join("");
  for (const button of $("epochs").querySelectorAll("button")) {
    button.onclick = () => {
      const epoch = epochs.find((item) => item.id === button.dataset.id);
      state.playing = false;
      state.tour = false;
      state.t = epoch.tGyr;
      paintTransport();
    };
  }
}

function renderPresets() {
  $("presets").innerHTML = PRESETS.map((preset) => `<button type="button">${preset.name}</button>`).join("");
  const buttons = [...$("presets").querySelectorAll("button")];
  buttons.forEach((button, index) => {
    const preset = PRESETS[index];
    const on =
      Math.abs(preset.H0 - state.params.H0) < 0.02 &&
      Math.abs(preset.OmegaM - state.params.OmegaM) < 0.002 &&
      Math.abs(preset.OmegaL - state.params.OmegaL) < 0.01;
    button.classList.toggle("is-on", on);
    button.onclick = () => {
      state.params = { ...preset };
      recompute(true);
    };
  });
}

function renderCatalog() {
  const q = state.query.toLowerCase();
  const groups = GROUPS.map((group) => {
    const items = placed.filter((body) => {
      if (body.group !== group) return false;
      if (!q) return true;
      return `${body.name} ${body.en}`.toLowerCase().includes(q);
    });
    if (!items.length) return "";
    return `<section><h3>${group}</h3>${items
      .map((body) => {
        const d = body.shell ? "" : formatMpc(body.d);
        return `<button type="button" data-id="${body.id}" class="${body.id === state.selected ? "is-on" : ""}"><span>${body.name}</span><span class="ds">${d}</span></button>`;
      })
      .join("")}</section>`;
  }).join("");
  $("catalog").innerHTML = groups;
  for (const button of $("catalog").querySelectorAll("button")) {
    button.onclick = () => select(button.dataset.id, true);
  }
}

function select(id, fly) {
  state.selected = id;
  const body = placed.find((item) => item.id === id);
  renderCatalog();
  if (!fly || !body) return;
  if (state.mode !== "map") switchMode("map");
  const snap = cosmos.sampleTime(state.t);
  if (body.shell) {
    const radius = shellRadius(body, snap);
    if (radius > 0) view.focusOn([0, 0, 0], radius * 1.18);
    return;
  }
  view.focusOn(body.p, focusRadius(body) || 30);
}

function buildMetrics() {
  const root = $("metrics");
  for (const [id, label] of METRICS) {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<dt>${label}</dt><dd></dd>`;
    root.appendChild(wrap);
    metricEls[id] = wrap.querySelector("dd");
  }
}

function buildLayers() {
  const root = $("layers");
  for (const [id, label] of [...MAP_LAYERS, ...WEB_LAYERS]) {
    const row = document.createElement("label");
    row.className = MAP_LAYERS.some((item) => item[0] === id) ? "only-map" : "only-web";
    row.innerHTML = `<input type="checkbox" ${state.layers[id] ? "checked" : ""} /> ${label}`;
    row.querySelector("input").addEventListener("change", (event) => {
      state.layers[id] = event.target.checked;
    });
    root.appendChild(row);
  }
}

function buildScales() {
  $("scales").innerHTML = SCALES.map((scale) => `<button type="button" data-id="${scale.id}">${scale.name}</button>`).join("");
  for (const button of $("scales").querySelectorAll("button")) {
    button.onclick = () => {
      const scale = SCALES.find((item) => item.id === button.dataset.id);
      const snap = cosmos.sampleTime(state.t);
      const radius = scale.radius ?? snap.horizonMpc * 1.15;
      if (state.mode !== "map") switchMode("map");
      view.focusOn([0, 0, 0], radius);
    };
  }
}

function buildLegend() {
  $("legend").innerHTML = CHART_LEGEND.map(([name, color]) => `<span><i style="background:${color}"></i>${name}</span>`).join("");
}

function syncParamInputs() {
  $("h0").value = String(state.params.H0);
  $("om").value = String(state.params.OmegaM);
  $("ns").value = String(state.params.ns);
  $("s8").value = String(state.params.sigma8);
  $("gain").value = String(state.gain);
  $("seed").value = String(state.seed);
  $("h0-val").textContent = `${state.params.H0.toFixed(2)} km/s/Mpc`;
  $("om-val").textContent = state.params.OmegaM.toFixed(3);
  $("ns-val").textContent = state.params.ns.toFixed(3);
  $("s8-val").textContent = state.params.sigma8.toFixed(3);
  $("gain-val").textContent = state.gain.toFixed(1);
}
