const LAYERS = [
  { id: "素净", line: "窗光、粗纤维、几乎不加点缀。少，是这一层的方法。" },
  { id: "清丽", line: "浅色衣服和户外的空气。轻，人站得很稳。" },
  { id: "华美", line: "丝绸、织带、刺绣。密度高，姿态端正。" },
  { id: "冷峻", line: "剪裁压过装饰，建筑的影子进入画面。" },
  { id: "电影感", line: "一个具体的钟点。方向光把人从背景里切出来。" }
];

const REGIONS = ["全部地区", "东亚", "东南亚", "南亚", "中亚", "北亚", "西亚与北非", "欧洲", "非洲", "北美", "拉丁美洲", "大洋洲"];

const PLATES = [
  { id: "01", file: "01-japan.jpg", country: "日本", city: "京都", region: "东亚", layer: "素净", note: "靛蓝麻外套。障子把光线切成格子。" },
  { id: "02", file: "02-finland.jpg", country: "芬兰", city: "赫尔辛基", region: "欧洲", layer: "素净", note: "燕麦色羊毛，白桦窗框里的冬日。" },
  { id: "03", file: "03-ethiopia.jpg", country: "埃塞俄比亚", city: "亚的斯亚贝巴", region: "非洲", layer: "素净", note: "白棉只在领口留一圈细边。" },
  { id: "04", file: "04-canada.jpg", country: "加拿大", city: "蒙特利尔", region: "北美", layer: "素净", note: "炭色大衣，雪光从高窗进来。" },
  { id: "05", file: "05-korea.jpg", country: "韩国", city: "首尔", region: "东亚", layer: "素净", note: "燕麦色现代上衣，韩屋的纸门。" },
  { id: "06", file: "06-new-zealand.jpg", country: "新西兰", city: "惠灵顿", region: "大洋洲", layer: "素净", note: "鼠尾草绿的美利奴，雨打在玻璃上。" },
  { id: "07", file: "07-bhutan.jpg", country: "不丹", city: "廷布", region: "南亚", layer: "素净", note: "暗酒红的当代服饰，窗外是雪山。" },
  { id: "08", file: "08-chile.jpg", country: "智利", city: "蒙特港", region: "拉丁美洲", layer: "素净", note: "未染色羊毛，湖上有雾。" },
  { id: "09", file: "09-rwanda.jpg", country: "卢旺达", city: "基加利", region: "非洲", layer: "素净", note: "土色棉衬衫，赤道的窗光落在墙上。" },
  { id: "10", file: "10-norway.jpg", country: "挪威", city: "卑尔根", region: "欧洲", layer: "素净", note: "海军蓝针织，玻璃上全是雨。" },
  { id: "11", file: "11-italy.jpg", country: "意大利", city: "波西塔诺", region: "欧洲", layer: "清丽", note: "浅蓝棉布，柑橘和早晨的海。" },
  { id: "12", file: "12-greece.jpg", country: "希腊", city: "纳克索斯", region: "欧洲", layer: "清丽", note: "白亚麻，白墙，一条海平线。" },
  { id: "13", file: "13-morocco.jpg", country: "摩洛哥", city: "非斯", region: "西亚与北非", layer: "清丽", note: "浅鼠尾草长袍，庭院瓷砖虚在后面。" },
  { id: "14", file: "14-vietnam.jpg", country: "越南", city: "会安", region: "东南亚", layer: "清丽", note: "象牙色亚麻。早晨的黄墙，灯笼还没点。" },
  { id: "15", file: "15-philippines.jpg", country: "菲律宾", city: "宿务", region: "东南亚", layer: "清丽", note: "浅色织纹衬衫，海面的反光被压住。" },
  { id: "16", file: "16-ireland.jpg", country: "爱尔兰", city: "戈尔韦", region: "欧洲", layer: "清丽", note: "奶油色针织，灰云下面是绿地。" },
  { id: "17", file: "17-tunisia.jpg", country: "突尼斯", city: "西迪布赛义德", region: "西亚与北非", layer: "清丽", note: "白衫，身后一道蓝门。" },
  { id: "18", file: "18-colombia.jpg", country: "哥伦比亚", city: "麦德林", region: "拉丁美洲", layer: "清丽", note: "黄油黄衬衫，阳台上的植物。" },
  { id: "19", file: "19-georgia.jpg", country: "格鲁吉亚", city: "卡赫季", region: "欧洲", layer: "清丽", note: "袖口一小行刺绣，葡萄园在薄雾里。" },
  { id: "20", file: "20-malaysia.jpg", country: "马来西亚", city: "乔治市", region: "东南亚", layer: "清丽", note: "浅色蜡染上衣，店屋的晨光。" },
  { id: "21", file: "21-india.jpg", country: "印度", city: "斋浦尔", region: "南亚", layer: "华美", note: "栗色贝拿勒斯丝绸，万寿菊只在焦点之外。" },
  { id: "22", file: "22-china.jpg", country: "中国", city: "苏州", region: "东亚", layer: "华美", note: "高领长袖的朱红旗袍，园子是绿的。" },
  { id: "23", file: "23-nigeria.jpg", country: "尼日利亚", city: "拉各斯", region: "非洲", layer: "华美", note: "靛蓝阿迪尔，日光棚里的金耳环。" },
  { id: "24", file: "24-mexico.jpg", country: "墨西哥", city: "瓦哈卡", region: "拉丁美洲", layer: "华美", note: "黑裙，肩上一条彩色雷博索。" },
  { id: "25", file: "25-peru.jpg", country: "秘鲁", city: "库斯科", region: "拉丁美洲", layer: "华美", note: "羊驼毛大衣上的安第斯织纹。" },
  { id: "26", file: "26-thailand.jpg", country: "泰国", city: "清迈", region: "东南亚", layer: "华美", note: "深绿泰丝，柚木房子里的窗。" },
  { id: "27", file: "27-ghana.jpg", country: "加纳", city: "阿克拉", region: "非洲", layer: "华美", note: "黑色套装，一条肯特织带从肩上落下。" },
  { id: "28", file: "28-uzbekistan.jpg", country: "乌兹别克斯坦", city: "布哈拉", region: "中亚", layer: "华美", note: "红与靛蓝的艾卡特外套，瓷砖在身后。" },
  { id: "29", file: "29-spain.jpg", country: "西班牙", city: "塞维利亚", region: "欧洲", layer: "华美", note: "黑裙与绣花披肩，院子停在阴影里。" },
  { id: "30", file: "30-jordan.jpg", country: "约旦", city: "安曼", region: "西亚与北非", layer: "华美", note: "黑衣领口一圈红色塔特里兹刺绣。" },
  { id: "31", file: "31-germany.jpg", country: "德国", city: "柏林", region: "欧洲", layer: "冷峻", note: "黑色大衣，混凝土，平直的剪影。" },
  { id: "32", file: "32-uk.jpg", country: "英国", city: "伦敦", region: "欧洲", layer: "冷峻", note: "银色短发，炭色套装，湿石头。" },
  { id: "33", file: "33-south-africa.jpg", country: "南非", city: "约翰内斯堡", region: "非洲", layer: "冷峻", note: "黑白几何剪裁，混凝土投下硬影子。" },
  { id: "34", file: "34-poland.jpg", country: "波兰", city: "华沙", region: "欧洲", layer: "冷峻", note: "驼色结构大衣，身后是现代主义方块。" },
  { id: "35", file: "35-netherlands.jpg", country: "荷兰", city: "鹿特丹", region: "欧洲", layer: "冷峻", note: "钴蓝与黑的色块大衣。" },
  { id: "36", file: "36-singapore.jpg", country: "新加坡", city: "新加坡", region: "东南亚", layer: "冷峻", note: "高领黑西装，玻璃和混凝土。" },
  { id: "37", file: "37-argentina.jpg", country: "阿根廷", city: "布宜诺斯艾利斯", region: "拉丁美洲", layer: "冷峻", note: "长黑大衣，柱廊里的影子。" },
  { id: "38", file: "38-senegal.jpg", country: "塞内加尔", city: "达喀尔", region: "非洲", layer: "冷峻", note: "黑白图形的体积，后面是灰色大西洋。" },
  { id: "39", file: "39-australia.jpg", country: "澳大利亚", city: "墨尔本", region: "大洋洲", layer: "冷峻", note: "黑色大衣，青石巷的阴。" },
  { id: "40", file: "40-czechia.jpg", country: "捷克", city: "布拉格", region: "欧洲", layer: "冷峻", note: "墨色羊毛，冬日的浅石墙。" },
  { id: "41", file: "41-brazil.jpg", country: "巴西", city: "里约热内卢", region: "拉丁美洲", layer: "电影感", note: "锈色亚麻，山坡上的晚太阳。" },
  { id: "42", file: "42-egypt.jpg", country: "埃及", city: "开罗", region: "西亚与北非", layer: "电影感", note: "沙色大衣，石灰岩上的长影子。" },
  { id: "43", file: "43-turkey.jpg", country: "土耳其", city: "伊斯坦布尔", region: "西亚与北非", layer: "电影感", note: "深青大衣，博斯普鲁斯的暖色光斑。" },
  { id: "44", file: "44-kenya.jpg", country: "肯尼亚", city: "内罗毕", region: "非洲", layer: "电影感", note: "赭石外套，金合欢和城市边缘的黄金时刻。" },
  { id: "45", file: "45-indonesia.jpg", country: "印度尼西亚", city: "日惹", region: "东南亚", layer: "电影感", note: "深褐蜡染外套，黄昏的石墙。" },
  { id: "46", file: "46-iran.jpg", country: "伊朗", city: "伊斯法罕", region: "西亚与北非", layer: "电影感", note: "灰粉丝巾，绿松石瓷砖，侧光打在脸上。" },
  { id: "47", file: "47-iceland.jpg", country: "冰岛", city: "维克", region: "欧洲", layer: "电影感", note: "风吹乱的头发，黑沙滩上的低太阳。" },
  { id: "48", file: "48-mongolia.jpg", country: "蒙古", city: "草原", region: "北亚", layer: "电影感", note: "未染色羊毛德勒，地平线上的一轮太阳。" },
  { id: "49", file: "49-lebanon.jpg", country: "黎巴嫩", city: "贝鲁特", region: "西亚与北非", layer: "电影感", note: "酒红色大衣，室内的灯和蓝调的窗。" },
  { id: "50", file: "50-france.jpg", country: "法国", city: "巴黎", region: "欧洲", layer: "电影感", note: "海军蓝大衣，湿街，一盏路灯。" }
];

const layersEl = document.querySelector("#layers");
const regionEl = document.querySelector("#region");
const queryEl = document.querySelector("#query");
const countEl = document.querySelector("#count");
const tocEl = document.querySelector("#toc");
const platesEl = document.querySelector("#plates");
const dialog = document.querySelector("#viewer");
const viewerImg = document.querySelector("#viewer-img");
const viewerNum = document.querySelector("#viewer-num");
const viewerLayer = document.querySelector("#viewer-layer");
const viewerCountry = document.querySelector("#viewer-country");
const viewerPlace = document.querySelector("#viewer-place");
const viewerNote = document.querySelector("#viewer-note");
const viewerPos = document.querySelector("#viewer-pos");

let openId = null;

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function readState() {
  const params = new URLSearchParams(location.search);
  const layer = params.get("layer");
  const region = params.get("region");
  return {
    layer: LAYERS.some((item) => item.id === layer) ? layer : "",
    region: REGIONS.includes(region) && region !== "全部地区" ? region : "",
    query: (params.get("q") || "").trim()
  };
}

function writeState(state, replace) {
  const params = new URLSearchParams();
  if (state.layer) params.set("layer", state.layer);
  if (state.region) params.set("region", state.region);
  if (state.query) params.set("q", state.query);
  const next = params.toString();
  const url = next ? `?${next}` : location.pathname;
  if (replace) history.replaceState(state, "", url);
  else history.pushState(state, "", url);
}

function currentState() {
  return {
    layer: layersEl.querySelector("[aria-pressed='true']")?.dataset.layer || "",
    region: regionEl.value === "全部地区" ? "" : regionEl.value,
    query: queryEl.value.trim()
  };
}

function matches(plate, state) {
  if (state.layer && plate.layer !== state.layer) return false;
  if (state.region && plate.region !== state.region) return false;
  if (!state.query) return true;
  const hay = `${plate.country}${plate.city}${plate.region}${plate.layer}${plate.id}`;
  return hay.toLowerCase().includes(state.query.toLowerCase());
}

function visiblePlates(state) {
  return PLATES.filter((plate) => matches(plate, state));
}

function renderLayers(state) {
  layersEl.innerHTML = LAYERS.map((layer) => {
    const pressed = state.layer === layer.id;
    return `<button type="button" data-layer="${esc(layer.id)}" aria-pressed="${pressed}">
      <strong>${esc(layer.id)}</strong>
      <span>${esc(layer.line)}</span>
    </button>`;
  }).join("");
}

function renderToc(state) {
  const visible = new Set(visiblePlates(state).map((plate) => plate.id));
  tocEl.innerHTML = PLATES.map((plate) => {
    const current = visible.has(plate.id) ? "true" : "false";
    return `<button type="button" data-jump="${plate.id}" aria-current="${current}">${esc(plate.id)} ${esc(plate.country)}</button>`;
  }).join("");
}

function renderPlates(state) {
  const groups = LAYERS.map((layer) => {
    const plates = PLATES.filter((plate) => plate.layer === layer.id && matches(plate, state));
    return { layer, plates };
  }).filter((group) => group.plates.length);

  const total = groups.reduce((sum, group) => sum + group.plates.length, 0);
  countEl.textContent = `${String(total).padStart(2, "0")} 张`;

  if (!total) {
    platesEl.innerHTML = `<p class="empty">这一组里没有肖像。换一个层次，或清空检索。</p>`;
    return;
  }

  platesEl.innerHTML = groups.map(({ layer, plates }) => `
    <section class="chapter" id="layer-${esc(layer.id)}">
      <header class="chapter-head">
        <h2>${esc(layer.id)}</h2>
        <p>${esc(layer.line)}</p>
        <span class="count-sm">${String(plates.length).padStart(2, "0")}</span>
      </header>
      <div class="grid">
        ${plates.map((plate) => `
          <button type="button" class="plate" id="plate-${plate.id}" data-open="${plate.id}">
            <img src="portraits/${esc(plate.file)}" width="864" height="1152" alt="${esc(plate.country)}，${esc(plate.city)}。${esc(plate.note)}" loading="lazy" decoding="async">
            <span class="plate-meta">
              <span class="num">${esc(plate.id)}</span>
              <span class="plate-country">${esc(plate.country)}</span>
              <span class="plate-place">${esc(plate.city)} · ${esc(plate.layer)}</span>
            </span>
          </button>
        `).join("")}
      </div>
    </section>
  `).join("");
}

function render(state) {
  const filtering = Boolean(state.layer || state.region || state.query);
  const wasFiltering = document.body.dataset.filtering === "1";
  document.body.dataset.filtering = filtering ? "1" : "0";
  document.querySelector(".hero").hidden = filtering;
  tocEl.hidden = filtering;

  renderLayers(state);
  regionEl.value = state.region || "全部地区";
  if (queryEl.value !== state.query) queryEl.value = state.query;
  renderToc(state);
  renderPlates(state);
  if (openId) fillViewer(openId, state);

  if (filtering && !wasFiltering) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    layersEl.scrollIntoView({ behavior, block: "start" });
  }
}

function fillViewer(id, state) {
  const list = visiblePlates(state);
  const index = list.findIndex((plate) => plate.id === id);
  const plate = PLATES.find((item) => item.id === id);
  if (!plate || index < 0) {
    dialog.close();
    openId = null;
    return;
  }
  openId = id;
  viewerImg.src = `portraits/${plate.file}`;
  viewerImg.alt = `${plate.country}，${plate.city}。${plate.note}`;
  viewerNum.textContent = plate.id;
  viewerLayer.textContent = plate.layer;
  viewerCountry.textContent = plate.country;
  viewerPlace.textContent = `${plate.city} · ${plate.region}`;
  viewerNote.textContent = plate.note;
  viewerPos.textContent = `${index + 1} / ${list.length}`;
  document.querySelector("#viewer-prev").disabled = list.length < 2;
  document.querySelector("#viewer-next").disabled = list.length < 2;
}

function openViewer(id) {
  const state = currentState();
  if (!visiblePlates(state).some((plate) => plate.id === id)) return;
  fillViewer(id, state);
  if (!dialog.open) dialog.showModal();
  document.querySelector("#viewer-close").focus();
}

function step(direction) {
  const state = currentState();
  const list = visiblePlates(state);
  const index = list.findIndex((plate) => plate.id === openId);
  if (index < 0 || list.length < 2) return;
  const next = list[(index + direction + list.length) % list.length];
  fillViewer(next.id, state);
}

function jumpTo(id) {
  const plate = PLATES.find((item) => item.id === id);
  if (!plate) return;
  const state = currentState();
  const seen = matches(plate, state);
  if (!seen) {
    const cleared = { layer: "", region: "", query: "" };
    writeState(cleared, true);
    render(cleared);
  }
  const node = document.querySelector(`#plate-${id}`);
  if (node) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    node.scrollIntoView({ behavior, block: "center" });
    node.focus();
  }
}

layersEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-layer]");
  if (!button) return;
  const state = currentState();
  state.layer = state.layer === button.dataset.layer ? "" : button.dataset.layer;
  writeState(state, false);
  render(state);
});

regionEl.addEventListener("change", () => {
  const state = currentState();
  writeState(state, false);
  render(state);
});

queryEl.addEventListener("input", () => {
  const state = currentState();
  writeState(state, true);
  render(state);
});

tocEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-jump]");
  if (!button) return;
  jumpTo(button.dataset.jump);
});

platesEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open]");
  if (!button) return;
  openViewer(button.dataset.open);
});

document.querySelector(".cover-open").addEventListener("click", () => openViewer("50"));
document.querySelector("#viewer-close").addEventListener("click", () => dialog.close());
document.querySelector("#viewer-prev").addEventListener("click", () => step(-1));
document.querySelector("#viewer-next").addEventListener("click", () => step(1));

dialog.addEventListener("close", () => {
  openId = null;
});

dialog.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    step(-1);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    step(1);
  }
});

window.addEventListener("popstate", () => render(readState()));

regionEl.innerHTML = REGIONS.map((region) => `<option value="${esc(region)}">${esc(region)}</option>`).join("");
render(readState());
