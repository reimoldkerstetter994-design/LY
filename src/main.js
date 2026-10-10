import { findObject } from "./catalog.js";
import { PLANCK, createCosmology } from "./cosmology.js";
import { createView } from "./scene.js";
import { aToU, uToA } from "./timeline.js";
import { fractionToA, mountInterface } from "./ui.js";

const SCALES = ["universe", "supercluster", "local", "galaxy"];
const A_REC = 1 / 1089.9;

const planck = createCosmology(PLANCK);
const state = {
  params: { ...PLANCK, flat: true, matterOnly: false },
  cosmo: planck,
  referenceAge: planck.ageGyr,
  a: 1,
  proper: false,
  scale: "universe",
  quality: "mid",
  seed: 42,
  showLabels: "key",
  showCage: true,
  showShell: true,
  showWeb: true,
  playing: false,
  playLinear: false,
  timeMode: "piecewise",
  selectedId: "cmb",
  query: "",
  kind: "all",
  presetId: "planck",
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  rev: 1,
};

const viewport = document.querySelector("#viewport");
const view = createView(viewport);
const ui = mountInterface(
  {
    left: document.querySelector("#left"),
    right: document.querySelector("#right"),
    timeline: document.querySelector("#timeline"),
    about: document.querySelector("#about"),
    toast: document.querySelector("#toast"),
    scaleTitle: document.querySelector("#hud-scale"),
    note: document.querySelector("#hud-note"),
    camera: document.querySelector("#hud-camera"),
    scaleLine: document.querySelector("#scale-line"),
    scaleLabel: document.querySelector("#scale-label"),
  },
  {
    setScale,
    setParams,
    setTimeFraction,
    togglePlay,
    watchExpansion,
    frame() {
      view.frameSubject();
    },
    toggleTimeMode() {
      state.timeMode = state.timeMode === "linear" ? "piecewise" : "linear";
      state.rev += 1;
    },
    setFlag(key, value) {
      state[key] = value;
      state.presetId = key === "query" || key === "kind" ? state.presetId : state.presetId;
      state.rev += 1;
    },
    select,
    copy: copyParams,
    exportPng,
  },
);

const pointer = { x: 0, y: 0, moved: false };
view.dom.addEventListener("pointerdown", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.moved = false;
});
view.dom.addEventListener("pointermove", (event) => {
  const hit = view.pick(event);
  const tip = document.querySelector("#tooltip");
  const rect = viewport.getBoundingClientRect();
  if (!hit) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.textContent = hit.name;
  tip.style.left = `${event.clientX - rect.left + 14}px`;
  tip.style.top = `${event.clientY - rect.top + 14}px`;
});
view.dom.addEventListener("pointerup", (event) => {
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  if (dx * dx + dy * dy > 25) return;
  const hit = view.pick(event);
  if (hit) select(hit.id);
});

window.addEventListener("keydown", (event) => {
  const tag = event.target?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.key >= "1" && event.key <= "4") {
    setScale(SCALES[Number(event.key) - 1]);
  } else if (event.key === "f" || event.key === "F") {
    view.update(state, performance.now() / 1000);
    view.focusSelected(state);
  } else if (event.key === "c" || event.key === "C") {
    state.proper = !state.proper;
    state.rev += 1;
  }
});

const resize = new ResizeObserver(() => view.resize());
resize.observe(viewport);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  if (state.playing) advance(dt);
  view.update(state, now / 1000);
  ui.paint(state);
  ui.paintHud(view.hud(state), state);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function setScale(scale) {
  state.scale = scale;
  state.rev += 1;
  view.update(state, performance.now() / 1000);
  view.frameSubject();
}

function select(id) {
  const item = findObject(id);
  if (!item) return;
  state.selectedId = id;
  if (item.scale) state.scale = item.scale;
  state.rev += 1;
  view.update(state, performance.now() / 1000);
  view.focusSelected(state);
}

function setParams(patch, presetId = null) {
  const next = { ...state.params, ...patch };
  if (patch.matterOnly !== true) next.matterOnly = false;
  if (!Number.isFinite(next.H0) || next.H0 < 20 || !Number.isFinite(next.Om)) return;
  try {
    state.cosmo = createCosmology(next);
  } catch (error) {
    ui.toast(error.message);
    return;
  }
  state.params = {
    H0: next.H0,
    Om: state.cosmo.params.Om,
    Ol: state.cosmo.params.Ol,
    Ob: state.cosmo.params.Ob,
    w: state.cosmo.params.w,
    flat: next.flat !== false && !next.matterOnly,
    matterOnly: Boolean(next.matterOnly),
  };
  state.presetId = presetId;
  state.rev += 1;
}

function setTimeFraction(fraction) {
  state.playing = false;
  state.playLinear = false;
  state.a = fractionToA(fraction, state);
}

function togglePlay() {
  if (state.playing) {
    state.playing = false;
    return;
  }
  if (state.a > 0.999) state.a = uToA(0.04);
  state.playLinear = false;
  state.playing = true;
}

function watchExpansion() {
  state.scale = "universe";
  state.proper = true;
  state.timeMode = "linear";
  state.playLinear = true;
  state.playing = true;
  state.a = 0.08;
  state.showShell = true;
  state.showWeb = true;
  state.rev += 1;
  view.update(state, performance.now() / 1000);
  view.frameSubject();
  ui.toast("从红移约 11.5 开始，按固有距离播放。宇宙会膨胀并漫过视点。");
}

function advance(dt) {
  const before = state.a;
  if (state.playLinear) {
    const time = state.cosmo.timeAtA(state.a) + dt * (state.cosmo.ageGyr / 34);
    if (time >= state.cosmo.ageGyr) {
      state.a = 1;
      state.playing = false;
      state.playLinear = false;
    } else {
      state.a = state.cosmo.aAtTime(time);
    }
  } else {
    const u = Math.min(1, aToU(state.a) + dt * 0.028);
    state.a = uToA(u);
    if (u >= 1) state.playing = false;
  }
  if (before < A_REC && state.a >= A_REC) {
    ui.toast("复合：光子退耦，宇宙变得透明。壳层斑纹是示意，不是普朗克天图。");
  }
}

async function copyParams() {
  const payload = {
    ...state.cosmo.params,
    ageGyr: Number(state.cosmo.ageGyr.toFixed(4)),
    horizonGly: Number(state.cosmo.horizonGly.toFixed(3)),
    scaleFactor: Number(state.a.toExponential(4)),
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    ui.toast("已复制当前宇宙学参数。");
  } catch {
    ui.toast("浏览器没有允许写入剪贴板。");
  }
}

function exportPng() {
  view.update(state, performance.now() / 1000);
  const link = document.createElement("a");
  link.href = view.dom.toDataURL("image/png");
  link.download = "observable-universe.png";
  link.click();
}
