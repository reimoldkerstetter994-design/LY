import { CATALOG, GROUP_ORDER, findObject, objectDistanceMpc } from "./catalog.js";
import { lightTravelGyr, mpcToGly } from "./cosmology.js";
import { drawDistances, drawExpansion } from "./charts.js";
import { formatDistance, formatDuration, formatHubble, formatNumber, formatScale, formatTemp, formatZ } from "./format.js";
import { aToU, epochMarkers, epochName, uToA } from "./timeline.js";

const SCALES = [
  { id: "universe", kicker: "01", name: "可观测宇宙", hint: "粒子视界" },
  { id: "supercluster", kicker: "02", name: "近域宇宙网", hint: "420 Mpc" },
  { id: "local", kicker: "03", name: "本星系群", hint: "1.15 Mpc" },
  { id: "galaxy", kicker: "04", name: "银河系", hint: "银心坐标" },
];

const PRESETS = [
  { id: "planck", name: "普朗克 2018", patch: { H0: 67.36, Om: 0.3153, Ob: 0.0493, w: -1, flat: true } },
  { id: "shoes", name: "SH0ES H₀", patch: { H0: 73.04, Om: 0.3153, Ob: 0.0493, w: -1, flat: true } },
  { id: "eds", name: "爱因斯坦–德西特", patch: { H0: 70, matterOnly: true, Ob: 0.045, w: -1, flat: true } },
  { id: "open", name: "开放低密", patch: { H0: 67.36, Om: 0.05, Ol: 0, Ob: 0.02, w: -1, flat: false } },
];

export function mountInterface(els, handlers) {
  els.left.innerHTML = leftMarkup();
  els.right.innerHTML = rightMarkup();
  els.timeline.innerHTML = timelineMarkup();
  els.about.innerHTML = aboutMarkup();
  const fields = collect(els.left, els.right, els.timeline);
  bind(fields, handlers);
  let paintedRev = -1;

  function paint(state, force = false) {
    const full = force || state.rev !== paintedRev;
    paintedRev = state.rev;
    paintDynamic(fields, state);
    if (full) paintStructure(fields, state);
  }

  function paintHud(hud, state) {
    const scale = SCALES.find((item) => item.id === state.scale);
    els.scaleTitle.textContent = scale?.name ?? "";
    const mode = state.proper ? "固有距离" : "共动坐标";
    let note = `${mode} · ${scale?.hint ?? ""}`;
    if ((state.scale === "local" || state.scale === "galaxy") && state.a < 0.12) {
      note = "图中是今天的结构。以当前宇宙时刻计，它还没有组装出来。";
    } else if (state.scale === "local") {
      note = "暗晕按大约 200 kpc 的真实比例，星盘放大了 3 倍。";
    } else if (state.scale === "galaxy") {
      note = "银心坐标。金环是太阳所在的 8.2 kpc 圆周。";
    } else if (hud.inside) {
      note = "视点在最后散射面之内。你看到的是那个时代之后的宇宙内部。";
    } else if (!state.proper) {
      note = "共动坐标：网格固定在今天的距离上，结构随时间长出来。";
    } else {
      note = "固有距离：整个舞台乘以尺度因子 a，会随膨胀变大。";
    }
    els.note.textContent = note;
    els.camera.textContent = `视点离地球 ${formatDistance(hud.fromOriginMpc)}`;
    const targetPx = 128;
    const raw = hud.mpcPerPx * targetPx;
    const mpc = niceStep(raw);
    const px = Math.max(28, Math.min(220, mpc / Math.max(hud.mpcPerPx, 1e-12)));
    els.scaleLine.style.width = `${px}px`;
    els.scaleLabel.textContent = formatDistance(mpc);
  }

  return { paint, paintHud, toast: (message) => showToast(els.toast, message) };
}

function bind(fields, handlers) {
  fields.scales.forEach((button) => {
    button.addEventListener("click", () => handlers.setScale(button.dataset.scale));
  });
  fields.presets.forEach((button) => {
    button.addEventListener("click", () => {
      const preset = PRESETS.find((item) => item.id === button.dataset.preset);
      if (preset) handlers.setParams(preset.patch, preset.id);
    });
  });
  for (const input of fields.paramInputs) {
    input.addEventListener("input", () => handlers.setParams(readParams(fields), null));
  }
  fields.flat.addEventListener("change", () => handlers.setParams(readParams(fields), null));
  fields.time.addEventListener("input", () => {
    handlers.setTimeFraction(Number(fields.time.value) / 10000);
  });
  fields.play.addEventListener("click", handlers.togglePlay);
  fields.expand.addEventListener("click", handlers.watchExpansion);
  fields.frame.addEventListener("click", handlers.frame);
  fields.timeMode.addEventListener("click", handlers.toggleTimeMode);
  fields.proper.addEventListener("change", () => handlers.setFlag("proper", fields.proper.checked));
  fields.cage.addEventListener("change", () => handlers.setFlag("showCage", fields.cage.checked));
  fields.shell.addEventListener("change", () => handlers.setFlag("showShell", fields.shell.checked));
  fields.web.addEventListener("change", () => handlers.setFlag("showWeb", fields.web.checked));
  fields.labels.addEventListener("change", () => handlers.setFlag("showLabels", fields.labels.value));
  fields.quality.addEventListener("change", () => handlers.setFlag("quality", fields.quality.value));
  fields.seed.addEventListener("change", () => handlers.setFlag("seed", Number(fields.seed.value) || 1));
  fields.reseed.addEventListener("click", () => {
    fields.seed.value = String(1 + Math.floor(Math.random() * 9999));
    handlers.setFlag("seed", Number(fields.seed.value));
  });
  fields.search.addEventListener("input", () => handlers.setFlag("query", fields.search.value.trim()));
  fields.kinds.forEach((button) => {
    button.addEventListener("click", () => handlers.setFlag("kind", button.dataset.kind));
  });
  fields.aboutOpen.addEventListener("click", () => fields.about.showModal());
  fields.aboutClose.addEventListener("click", () => fields.about.close());
  fields.copy.addEventListener("click", () => handlers.copy());
  fields.exportPng.addEventListener("click", () => handlers.exportPng());
  fields.rows.forEach((row) => {
    row.addEventListener("click", () => handlers.select(row.dataset.id));
  });
}

function paintDynamic(fields, state) {
  const { cosmo, a } = state;
  const here = cosmo.atScale(a);
  fields.age.textContent = formatDuration(here.t);
  fields.redshift.textContent = formatZ(Math.max(cosmo.redshiftOfA(a), 0));
  fields.temp.textContent = formatTemp(cosmo.temperature(a));
  fields.epoch.textContent = epochName(a, cosmo);
  fields.play.textContent = state.playing ? "暂停" : "播放";
  fields.timeMode.textContent = state.timeMode === "linear" ? "线性时间" : "分段时间";
  if (document.activeElement !== fields.time) {
    fields.time.value = String(Math.round(timeFraction(state) * 10000));
  }
  fields.nowAge.textContent = formatDuration(here.t);
  fields.nowA.textContent = formatScale(a);
  fields.nowZ.textContent = formatZ(Math.max(cosmo.redshiftOfA(a), 0));
  fields.nowT.textContent = formatTemp(cosmo.temperature(a));
  fields.nowH.textContent = cosmo.valid ? `${formatHubble(cosmo.H0AtA(a))} km/s/Mpc` : "—";
  fields.growth.textContent = cosmo.valid ? formatNumber(cosmo.growth(Math.max(a, 1e-4)), 3) : "—";
  drawExpansion(fields.expansion, cosmo, a);
  paintSelection(fields, state, false);
  for (const row of fields.rows) {
    const item = findObject(row.dataset.id);
    row.classList.toggle("is-future", item && state.a + 1e-4 < formsAt(item));
    row.classList.toggle("is-active", row.dataset.id === state.selectedId);
  }
}

function paintStructure(fields, state) {
  const { cosmo } = state;
  const active = document.activeElement;
  if (!fields.paramInputs.includes(active)) {
    fields.h0.value = String(round(state.params.H0, 2));
    fields.om.value = String(round(state.params.Om, 4));
    fields.ol.value = String(round(cosmo.params.Ol, 4));
    fields.ob.value = String(round(state.params.Ob, 4));
    fields.w.value = String(round(state.params.w, 3));
  }
  fields.flat.checked = state.params.flat !== false && !state.params.matterOnly;
  fields.ol.disabled = fields.flat.checked || state.params.matterOnly;
  fields.proper.checked = state.proper;
  fields.cage.checked = state.showCage;
  fields.shell.checked = state.showShell;
  fields.web.checked = state.showWeb;
  fields.labels.value = state.showLabels;
  fields.quality.value = state.quality;
  if (active !== fields.seed) fields.seed.value = String(state.seed);
  fields.scales.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.scale === state.scale);
  });
  fields.presets.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === state.presetId);
  });
  fields.kinds.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.kind === state.kind);
  });
  fields.todayAge.textContent = formatDuration(cosmo.ageGyr);
  fields.horizon.textContent = formatDistance(cosmo.horizonMpc);
  fields.eventH.textContent = formatDistance(cosmo.eventHorizonMpc);
  fields.hubbleR.textContent = formatDistance(cosmo.hubbleRadiusMpc);
  fields.q0.textContent = cosmo.valid ? formatNumber(cosmo.deceleration(1), 3) : "—";
  fields.accel.textContent = cosmo.accel
    ? `z = ${formatZ(cosmo.accel.z)} · ${formatDuration(cosmo.accel.t)}`
    : "尚未加速";
  fields.ok.textContent = formatNumber(cosmo.params.Ok, 4);
  fields.or.textContent = cosmo.params.Or.toExponential(2);
  const delta = cosmo.ageGyr - state.referenceAge;
  fields.delta.textContent = `${delta >= 0 ? "+" : "−"}${formatNumber(Math.abs(delta), 3)} Gyr`;
  fields.warn.hidden = cosmo.valid;
  drawDistances(fields.distances, cosmo);
  placeEpochs(fields, state);
  const query = state.query.toLowerCase();
  for (const row of fields.rows) {
    const item = findObject(row.dataset.id);
    const distance = objectDistanceMpc(item, cosmo);
    row.querySelector(".dist").textContent = item.z != null && item.distanceMpc == null
      ? `z ${formatZ(item.z)} · ${formatDistance(distance)}`
      : formatDistance(distance);
    const kindOk = state.kind === "all" || matchesKind(item, state.kind);
    const text = `${item.name} ${item.nameEn}`.toLowerCase();
    row.hidden = !kindOk || (query && !text.includes(query));
  }
  for (const group of fields.groups) {
    const visible = [...group.querySelectorAll(".catalog-item")].some((row) => !row.hidden);
    group.hidden = !visible;
  }
  paintSelection(fields, state, true);
}

function paintSelection(fields, state, full) {
  const item = findObject(state.selectedId);
  if (!item) {
    fields.cardTitle.textContent = "未选择天体";
    fields.cardBody.textContent = "在星图或目录里点一个天体。";
    return;
  }
  if (!full && fields.cardTitle.dataset.id === item.id) {
    const badge = fields.card.querySelector(".born");
    if (badge) badge.hidden = state.a + 1e-4 >= formsAt(item);
    return;
  }
  fields.cardTitle.dataset.id = item.id;
  fields.cardTitle.textContent = item.name;
  const distance = objectDistanceMpc(item, state.cosmo);
  const lines = [];
  lines.push(`<p class="en">${item.nameEn}</p>`);
  lines.push(`<p>${item.blurb}</p>`);
  if (item.approx) lines.push(`<p class="caution">方位或尺度是示意，不是巡天成员表。</p>`);
  const born = state.a + 1e-4 >= formsAt(item);
  lines.push(`<p class="born caution"${born ? " hidden" : ""}>以当前宇宙时刻计，这个天体还没有形成。</p>`);
  if (item.z != null && item.distanceMpc == null) {
    const d = state.cosmo.distancesAtZ(item.z);
    lines.push(metric("红移", formatZ(item.z)));
    lines.push(metric("径向共动距离 χ", formatDistance(d.chi)));
    lines.push(metric("光度距离", formatDistance(d.dL)));
    lines.push(metric("角径距离", formatDistance(d.dA)));
    lines.push(metric("回看时间", formatDuration(d.lookback)));
    lines.push(metric("发光时宇宙年龄", formatDuration(d.ageAtEmission)));
    if (d.dA > 0) {
      const arcsec = ((10 / 1000) / d.dA) * 206265;
      lines.push(metric("10 kpc 的张角", arcsec > 60 ? `${formatNumber(arcsec / 60, 2)} 角分` : `${formatNumber(arcsec, 2)} 角秒`));
    }
  } else if (item.kpc) {
    lines.push(metric("距银心", `${formatNumber(Math.hypot(...item.kpc), 2)} kpc`));
  } else {
    lines.push(metric("距离", formatDistance(distance)));
    if (distance > 0) lines.push(metric("光行时", formatDuration(lightTravelGyr(distance))));
    if (distance > 40 && item.z == null) {
      lines.push(`<p class="caution">近距锚点。本动速度很大，不用 cz/H₀ 换算红移。</p>`);
    }
  }
  if (item.kind === "cmb") {
    const chi = state.cosmo.chiOfZ(item.z);
    lines.push(metric("共动距离", `${formatDistance(chi)} · ${formatNumber(mpcToGly(chi), 2)} Gly`));
    lines.push(metric("今天的温度", formatTemp(state.cosmo.params.T)));
  }
  fields.cardBody.innerHTML = lines.join("");
}

function placeEpochs(fields, state) {
  const markers = epochMarkers(state.cosmo);
  fields.epochs.innerHTML = "";
  let last = -10;
  for (const marker of markers) {
    const fraction =
      state.timeMode === "linear" ? state.cosmo.timeAtA(marker.a) / state.cosmo.ageGyr : marker.u;
    if (fraction - last < 0.045 && marker.id !== "now") continue;
    last = fraction;
    addEpoch(fields, marker, fraction);
  }
}

function addEpoch(fields, marker, fraction) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "epoch";
  button.style.left = `${fraction * 100}%`;
  button.textContent = marker.name;
  button.addEventListener("click", () => {
    fields.time.value = String(Math.round(fraction * 10000));
    fields.time.dispatchEvent(new Event("input", { bubbles: true }));
  });
  fields.epochs.appendChild(button);
}

function timeFraction(state) {
  if (state.timeMode === "linear") {
    return Math.min(1, Math.max(0, state.cosmo.timeAtA(state.a) / state.cosmo.ageGyr));
  }
  return aToU(state.a);
}

export function fractionToA(fraction, state) {
  if (state.timeMode === "linear") return state.cosmo.aAtTime(fraction * state.cosmo.ageGyr);
  return uToA(fraction);
}

function readParams(fields) {
  return {
    H0: Number(fields.h0.value),
    Om: Number(fields.om.value),
    Ol: Number(fields.ol.value),
    Ob: Number(fields.ob.value),
    w: Number(fields.w.value),
    flat: fields.flat.checked,
    matterOnly: false,
  };
}

function collect(left, right, timeline) {
  const q = (root, sel) => root.querySelector(sel);
  return {
    scales: [...left.querySelectorAll("[data-scale]")],
    presets: [...right.querySelectorAll("[data-preset]")],
    paramInputs: [...right.querySelectorAll("[data-param]")],
    h0: q(right, "#p-h0"),
    om: q(right, "#p-om"),
    ol: q(right, "#p-ol"),
    ob: q(right, "#p-ob"),
    w: q(right, "#p-w"),
    flat: q(right, "#p-flat"),
    proper: q(left, "#opt-proper"),
    cage: q(left, "#opt-cage"),
    shell: q(left, "#opt-shell"),
    web: q(left, "#opt-web"),
    labels: q(left, "#opt-labels"),
    quality: q(left, "#opt-quality"),
    seed: q(left, "#opt-seed"),
    reseed: q(left, "#opt-reseed"),
    search: q(left, "#catalog-search"),
    kinds: [...left.querySelectorAll("[data-kind]")],
    rows: [...left.querySelectorAll(".catalog-item")],
    groups: [...left.querySelectorAll(".catalog-group")],
    time: q(timeline, "#time-slider"),
    play: q(timeline, "#play"),
    expand: q(timeline, "#expand"),
    frame: q(timeline, "#frame"),
    timeMode: q(timeline, "#time-mode"),
    epochs: q(timeline, "#epochs"),
    age: document.querySelector("#chip-age"),
    redshift: document.querySelector("#chip-z"),
    temp: document.querySelector("#chip-t"),
    epoch: document.querySelector("#chip-epoch"),
    aboutOpen: document.querySelector("#open-about"),
    exportPng: document.querySelector("#export-png"),
    about: document.querySelector("#about"),
    aboutClose: document.querySelector("#close-about"),
    nowAge: q(right, "#m-age"),
    nowA: q(right, "#m-a"),
    nowZ: q(right, "#m-z"),
    nowT: q(right, "#m-t"),
    nowH: q(right, "#m-h"),
    growth: q(right, "#m-growth"),
    todayAge: q(right, "#m-today"),
    horizon: q(right, "#m-horizon"),
    eventH: q(right, "#m-event"),
    hubbleR: q(right, "#m-hubble"),
    q0: q(right, "#m-q"),
    accel: q(right, "#m-accel"),
    ok: q(right, "#m-ok"),
    or: q(right, "#m-or"),
    delta: q(right, "#m-delta"),
    warn: q(right, "#model-warn"),
    expansion: q(right, "#chart-a"),
    distances: q(right, "#chart-d"),
    card: q(right, "#object-card"),
    cardTitle: q(right, "#object-title"),
    cardBody: q(right, "#object-body"),
    copy: q(right, "#copy-json"),
  };
}

function leftMarkup() {
  const scales = SCALES.map(
    (scale) => `<button type="button" class="scale" data-scale="${scale.id}">
      <span>${scale.kicker}</span><strong>${scale.name}</strong><em>${scale.hint}</em>
    </button>`,
  ).join("");
  const catalog = GROUP_ORDER.map((group) => {
    const items = CATALOG.filter((item) => item.group === group.id)
      .map(
        (item) => `<button type="button" class="catalog-item" data-id="${item.id}">
          <span class="kind kind-${item.kind}"></span>
          <span><b>${item.name}</b><small>${item.nameEn}</small></span>
          <em class="dist"></em>
        </button>`,
      )
      .join("");
    return `<section class="catalog-group"><h3>${group.title}</h3>${items}</section>`;
  }).join("");
  return `
    <section>
      <h2>尺度</h2>
      <div class="scales">${scales}</div>
    </section>
    <section class="options">
      <h2>显示</h2>
      <label><input id="opt-proper" type="checkbox" /> 固有距离</label>
      <label><input id="opt-web" type="checkbox" checked /> 宇宙网</label>
      <label><input id="opt-shell" type="checkbox" checked /> 最后散射面</label>
      <label><input id="opt-cage" type="checkbox" checked /> 赤经赤纬网格</label>
      <label>标注
        <select id="opt-labels">
          <option value="key" selected>关键</option>
          <option value="all">全部</option>
          <option value="off">仅选中</option>
        </select>
      </label>
      <label>密度
        <select id="opt-quality">
          <option value="low">精简</option>
          <option value="mid" selected>标准</option>
          <option value="high">精细</option>
        </select>
      </label>
      <label>随机种子 <input id="opt-seed" type="number" min="1" max="999999" value="42" /></label>
      <button type="button" id="opt-reseed" class="text-btn">换一条宇宙网</button>
    </section>
    <section class="catalog-wrap">
      <h2>目录</h2>
      <input id="catalog-search" type="search" placeholder="搜索天体" />
      <div class="kinds">
        <button type="button" data-kind="all" class="is-active">全部</button>
        <button type="button" data-kind="galaxy">星系</button>
        <button type="button" data-kind="cluster">星系团</button>
        <button type="button" data-kind="structure">结构</button>
        <button type="button" data-kind="quasar">类星体</button>
      </div>
      <div class="catalog">${catalog}</div>
    </section>`;
}

function rightMarkup() {
  const presets = PRESETS.map(
    (preset) => `<button type="button" data-preset="${preset.id}">${preset.name}</button>`,
  ).join("");
  return `
    <section>
      <h2>宇宙学参数</h2>
      <div class="presets">${presets}</div>
      <label class="slider"><span>H₀</span><input id="p-h0" data-param type="number" min="40" max="90" step="0.01" /></label>
      <label class="slider"><span>Ωₘ</span><input id="p-om" data-param type="number" min="0.01" max="1.2" step="0.001" /></label>
      <label class="checkline"><input id="p-flat" type="checkbox" checked /> 平坦，ΩΛ = 1 − Ωₘ − Ωᵣ</label>
      <label class="slider"><span>ΩΛ</span><input id="p-ol" data-param type="number" min="-0.4" max="1.3" step="0.001" /></label>
      <label class="slider"><span>Ωᵦ</span><input id="p-ob" data-param type="number" min="0.01" max="0.12" step="0.0001" /></label>
      <label class="slider"><span>w</span><input id="p-w" data-param type="number" min="-1.5" max="0" step="0.01" /></label>
      <p id="model-warn" class="caution" hidden>这组参数到不了今天，膨胀历史没有定义完整。</p>
    </section>
    <section>
      <h2>此刻</h2>
      <dl class="metrics">
        <div><dt>年龄</dt><dd id="m-age"></dd></div>
        <div><dt>尺度因子</dt><dd id="m-a"></dd></div>
        <div><dt>红移</dt><dd id="m-z"></dd></div>
        <div><dt>光子温度</dt><dd id="m-t"></dd></div>
        <div><dt>H(a)</dt><dd id="m-h"></dd></div>
        <div><dt>D/D₀</dt><dd id="m-growth"></dd></div>
      </dl>
      <canvas id="chart-a" class="chart" width="320" height="96"></canvas>
      <p class="caption">尺度因子 a(t)，竖线是时间轴所在的时刻。</p>
    </section>
    <section>
      <h2>今天的背景</h2>
      <dl class="metrics">
        <div><dt>年龄</dt><dd id="m-today"></dd></div>
        <div><dt>相对普朗克</dt><dd id="m-delta"></dd></div>
        <div><dt>粒子视界</dt><dd id="m-horizon"></dd></div>
        <div><dt>事件视界</dt><dd id="m-event"></dd></div>
        <div><dt>哈勃半径 c/H₀</dt><dd id="m-hubble"></dd></div>
        <div><dt>q₀</dt><dd id="m-q"></dd></div>
        <div><dt>开始加速</dt><dd id="m-accel"></dd></div>
        <div><dt>Ωₖ</dt><dd id="m-ok"></dd></div>
        <div><dt>Ωᵣ</dt><dd id="m-or"></dd></div>
      </dl>
      <p class="caption">这些距离是今天的固有距离。平坦模型里它等于共动距离。哈勃半径不是视界。</p>
      <canvas id="chart-d" class="chart" width="320" height="96"></canvas>
      <p class="caption"><i class="swatch chi"></i>共动 <i class="swatch dl"></i>光度 <i class="swatch da"></i>角径 · z = 0–4</p>
    </section>
    <section id="object-card">
      <h2>所选天体</h2>
      <h3 id="object-title"></h3>
      <div id="object-body"></div>
      <button type="button" id="copy-json" class="text-btn">复制当前参数 JSON</button>
    </section>`;
}

function timelineMarkup() {
  return `
    <div class="time-head">
      <strong id="chip-epoch">今天</strong>
      <div class="time-actions">
        <button type="button" id="time-mode">分段时间</button>
        <button type="button" id="play">播放</button>
        <button type="button" id="expand">观看膨胀</button>
        <button type="button" id="frame">适配画面</button>
      </div>
    </div>
    <div class="time-track">
      <input id="time-slider" type="range" min="0" max="10000" value="10000" />
      <div id="epochs"></div>
    </div>
    <p class="keys">拖拽旋转 · 滚轮缩放 · 右键平移 · 空格播放 · 1–4 切换尺度</p>`;
}

function aboutMarkup() {
  return `
    <article>
      <header><h2>这套模拟在算什么</h2><button type="button" id="close-about">关闭</button></header>
      <p>背景膨胀是平坦或带曲率的 ΛCDM：哈勃参数 E(a) 来自弗里德曼方程，暗能量用常数物态 w。年龄、共动距离、光度距离和角径距离按 Hogg (1999) 的定义做数值积分。默认参数是普朗克 2018 的 H₀ = 67.36、Ωₘ = 0.3153。</p>
      <p>光子温度按 T = 2.725 K / a 外推，电子对湮灭之前只是等效温度。辐射密度含光子和 Nₑff = 3.046 的中微子，不含 0.06 eV 的中微子质量。</p>
      <p>宇宙网不是 N 体，也不是某次巡天的复原。粒子在均匀场和一张统计等效的纤维网上按增长因子插值，并做 γ = 0.45 的可视化压缩，好让宇宙正午前后就能看出节点和纤维。增长因子用 Carroll–Press–Turner 近似。</p>
      <p>高红移天体的距离随你改的宇宙学参数重算。室女、天炉、矩尺这些近距天体用距离锚，因为本动比哈勃流大。最后散射面上的冷热斑是噪声，不是普朗克天图。</p>
    </article>`;
}

function metric(label, value) {
  return `<p class="metric-line"><span>${label}</span><b>${value}</b></p>`;
}

function formsAt(item) {
  if (!item || item.kind === "cmb") return 0;
  if (item.z != null && item.z > 0.4) return 1 / (1 + item.z);
  if (item.group === "local" || item.group === "galaxy") return 0.12;
  return 0.18;
}

function matchesKind(item, kind) {
  if (kind === "galaxy") return item.kind === "galaxy" || item.kind === "star" || item.kind === "blackhole";
  if (kind === "cluster") return item.kind === "cluster" || item.kind === "group";
  if (kind === "structure") return ["wall", "supercluster", "void", "cmb"].includes(item.kind);
  if (kind === "quasar") return item.kind === "quasar";
  return true;
}

function niceStep(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = value / 10 ** exp;
  const nice = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10;
  return nice * 10 ** exp;
}

function round(value, digits) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function showToast(el, message) {
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    el.hidden = true;
  }, 4600);
}

