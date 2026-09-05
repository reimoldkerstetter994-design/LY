const $ = (id) => document.getElementById(id);
const state = { data: null, tab: "overview" };

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === state.tab));
  });
});

$("refreshBtn").addEventListener("click", () => refresh());

function setStatus(text) {
  $("status").textContent = text;
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function targetPrograms(data, year) {
  const y = year || data.latest_catalog_year;
  return (data.programs || []).filter((p) => p.is_target && (!y || p.year === y));
}

function render(data) {
  state.data = data;
  if (data.empty) {
    const msg = `<div class="empty card">${esc(data.message || "尚无数据")}</div>`;
    ["overview", "catalog", "exams", "news", "faculty", "prep", "sources"].forEach((id) => {
      $(id).innerHTML = msg;
    });
    setStatus("还没有本地缓存，请先抓取。");
    return;
  }
  setStatus(`最近抓取：${data.generated_at || "未知"} · 目录年份 ${data.latest_catalog_year || "—"}`);
  renderOverview(data);
  renderCatalog(data);
  renderExams(data);
  renderNews(data);
  renderFaculty(data);
  renderPrep(data);
  renderSources(data);
}

function renderOverview(data) {
  const progs = targetPrograms(data);
  const teachers = data.teachers || [];
  const news = (data.news || []).filter((n) => n.relevant).slice(0, 6);
  const hits = data.source_hits || [];
  const ok = hits.filter((h) => h.ok).length;
  $("overview").innerHTML = `
    <div class="grid-4 serif-ui">
      <div class="stat"><div class="k">最新目录年份</div><div class="v">${esc(data.latest_catalog_year || "—")}</div><div class="tiny">已探测 ${esc((data.years_available || []).join(" / "))}</div></div>
      <div class="stat"><div class="k">学硕专业</div><div class="v">${progs.length}</div><div class="tiny">土壤学 + 植物营养学</div></div>
      <div class="stat"><div class="k">土壤/植营导师</div><div class="v">${teachers.length}</div><div class="tiny">来自学院师资公开接口</div></div>
      <div class="stat"><div class="k">源站探测</div><div class="v">${ok}/${hits.length}</div><div class="tiny">成功 / 尝试</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h2>学科速写</h2>
        <p class="meta">${esc((data.discipline && data.discipline.title) || "农业资源与环境")} · A+ / 双一流</p>
        <p>${esc((data.discipline && data.discipline.intro) || "暂无")}</p>
        <p>${((data.discipline && data.discipline.tags) || []).map((t) => `<span class="chip gold">${esc(t)}</span>`).join("")}</p>
        <p class="tiny"><a href="${esc((data.discipline && data.discipline.url) || "https://re.njau.edu.cn/xkjs/nyzyyhj.htm")}" target="_blank" rel="noopener">学院学科介绍原文</a></p>
      </div>
      <div class="card">
        <h2>官方入口</h2>
        <ul class="plain">
          ${Object.entries(data.contacts || {}).map(([k, v]) => `<li><strong>${esc(k)}</strong>：${String(v).startsWith("http") ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v)}</li>`).join("")}
        </ul>
      </div>
    </div>
    <div class="cards">
      ${progs.map(programCard).join("") || `<div class="empty card">当前年份尚未解析到土壤学/植物营养学目录。</div>`}
    </div>
    <div class="card">
      <h2>相关最新通知</h2>
      ${news.map((n) => `<div class="news" style="box-shadow:none;padding:10px 0;border:0;border-bottom:1px solid var(--line)"><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><div class="tiny">${esc(n.date)} · ${esc(n.list_name)}</div></div>`).join("") || "<p class='tiny'>暂无匹配通知</p>"}
    </div>
    <div class="note">${(data.notes || []).map((n) => `<p>${esc(n)}</p>`).join("")}</div>
  `;
}

function programCard(p) {
  return `<article class="card program">
    <h2>${esc(p.name)} <span class="chip">${esc(p.code)}</span></h2>
    <p class="meta">${esc(p.year)} · ${esc(p.degree_type)} · 拟招生 ${esc(p.planned)} 人（含推免）</p>
    <p>${(p.directions || []).map((d) => `<span class="chip">${esc(d)}</span>`).join("")}</p>
    <p class="tiny">初试：${(p.initial_subjects || []).map((s) => esc(s.code + " " + s.name)).join(" / ")}</p>
    <p class="tiny">复试：${(p.retest_subjects || []).map((s) => esc(s.code + " " + s.name)).join(" 或 ")}</p>
    ${p.remark ? `<p>${esc(p.remark)}</p>` : ""}
  </article>`;
}

function renderCatalog(data) {
  const years = [...new Set((data.programs || []).map((p) => p.year))];
  const related = (data.programs || []).filter((p) => !p.is_target && p.year === data.latest_catalog_year);
  $("catalog").innerHTML = `
    <div class="filters serif-ui" id="yearFilters">${years.map((y) => `<button type="button" class="${y === data.latest_catalog_year ? "primary" : "ghost"}" data-year="${esc(y)}">${esc(y)}</button>`).join("")}</div>
    <div id="catalogCards" class="cards">${targetPrograms(data).map(programCard).join("")}</div>
    <div class="card">
      <h2>学院同年其他专业（对照，非本学硕）</h2>
      <table class="serif-ui"><thead><tr><th>代码</th><th>专业</th><th>类型</th><th>拟招</th><th>初试业务课</th></tr></thead>
      <tbody>${related.map((p) => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.degree_type)}</td><td>${esc(p.planned)}</td><td>${esc((p.initial_subjects || []).slice(-2).map((s) => s.name).join(" / "))}</td></tr>`).join("")}</tbody></table>
    </div>
  `;
  $("catalog").querySelectorAll("[data-year]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("catalog").querySelectorAll("[data-year]").forEach((b) => b.className = b === btn ? "primary" : "ghost");
      $("catalogCards").innerHTML = targetPrograms(data, btn.dataset.year).map(programCard).join("");
    });
  });
}

function renderExams(data) {
  const seen = new Set();
  const subjects = (data.subjects || []).filter((s) => {
    const key = `${s.kind}-${s.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rows = subjects.map((s) => `
    <tr>
      <td>${esc(s.kind)}</td>
      <td>${esc(s.code)}</td>
      <td>${esc(s.name)}</td>
      <td>${(s.books || []).map((b) => esc(b)).join("<br>") || "全国统考/联考，以教育部大纲为准"}</td>
      <td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">官方书目页</a>` : ""}</td>
    </tr>`).join("");
  const lines = (data.national_lines || []).map((l) => `
    <tr><td>${esc(l.year)}</td><td>${esc(l.category)}</td><td>${esc(l.total)}</td><td>${esc(l.politics_or_100)}</td><td>${esc(l.major_gt_100)}</td><td class="tiny">${esc(l.note || "")}<br><a href="${esc(l.source)}" target="_blank" rel="noopener">来源</a></td></tr>
  `).join("");
  $("exams").innerHTML = `
    <div class="card">
      <h2>考试科目与官方参考书</h2>
      <p class="meta">书目抓自南农研究生招生目录系统，点击科目可回源核验。</p>
      <table class="serif-ui"><thead><tr><th>阶段</th><th>代码</th><th>科目</th><th>参考书</th><th>原文</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="card">
      <h2>农学门类国家线（A类）</h2>
      <table class="serif-ui"><thead><tr><th>年份</th><th>类别</th><th>总分</th><th>满分100</th><th>满分>100</th><th>说明</th></tr></thead><tbody>${lines}</tbody></table>
    </div>
  `;
}

function renderNews(data) {
  const items = data.news || [];
  $("news").innerHTML = `
    <input class="search serif-ui" id="newsQ" placeholder="搜索标题、摘要、日期…" />
    <div id="newsList" class="cards"></div>
  `;
  const paint = () => {
    const q = ($("newsQ").value || "").trim();
    const filtered = items.filter((n) => !q || `${n.title} ${n.summary} ${n.date}`.includes(q));
    $("newsList").innerHTML = filtered.slice(0, 80).map((n) => `
      <article class="news">
        <h3><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a> ${n.relevant ? '<span class="chip gold">相关</span>' : ""}</h3>
        <p class="meta">${esc(n.date || "日期未标")} · ${esc(n.list_name)}</p>
        <p>${esc(n.summary || "")}</p>
        ${(n.attachments || []).map((a) => `<div class="tiny">附件：<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a></div>`).join("")}
      </article>
    `).join("") || `<div class="empty card">没有匹配通知</div>`;
  };
  $("newsQ").addEventListener("input", paint);
  paint();
}

function renderFaculty(data) {
  const teachers = data.teachers || [];
  $("faculty").innerHTML = `
    <div class="filters serif-ui">
      <button class="primary" data-dept="all">全部 ${teachers.length}</button>
      <button class="ghost" data-dept="土壤学系">土壤学系</button>
      <button class="ghost" data-dept="植物营养学系">植物营养学系</button>
    </div>
    <div id="teacherCards" class="cards"></div>
  `;
  const paint = (dept) => {
    const list = dept === "all" ? teachers : teachers.filter((t) => t.department === dept);
    $("teacherCards").innerHTML = list.map((t) => `
      <article class="teacher">
        <h3>${t.homepage ? `<a href="${esc(t.homepage)}" target="_blank" rel="noopener">${esc(t.name)}</a>` : esc(t.name)}</h3>
        <p class="meta">${esc(t.department)} · ${esc(t.title || "职称未公开")}</p>
        <p>${t.is_phd_tutor ? '<span class="chip gold">博导</span>' : ""}${t.is_master_tutor ? '<span class="chip">硕导</span>' : ""}</p>
        <p>${esc(t.profile || t.research || t.unit)}</p>
      </article>
    `).join("");
  };
  $("faculty").querySelectorAll("[data-dept]").forEach((btn) => {
    btn.addEventListener("click", () => {
      $("faculty").querySelectorAll("[data-dept]").forEach((b) => b.className = b === btn ? "primary" : "ghost");
      paint(btn.dataset.dept);
    });
  });
  paint("all");
}

function renderPrep(data) {
  const progs = targetPrograms(data);
  $("prep").innerHTML = `
    <div class="card">
      <h2>怎么用这套资料</h2>
      <ol>
        <li>先看最新招生目录：确认土壤学考 314+857，植物营养学考 315+857（以当年目录为准）。</li>
        <li>857 按官方书目覆盖土壤学、环境学基础、微生物学、植物生理学四块。</li>
        <li>314/315 走全国农学门类联考，用教育部大纲，不要把南农自命题经验和联考混为一谈。</li>
        <li>复试书目已挂在目录系统里，过线后再按土壤学/植物营养学方向分科。</li>
        <li>导师主页只作研究方向参考，套磁与招生资格以学院当年导师名单为准。</li>
      </ol>
    </div>
    <div class="cards">
      ${progs.map((p) => `<article class="card"><h2>${esc(p.name)}备考骨架</h2>
        <p class="tiny">拟招 ${esc(p.planned)} · ${esc(p.year)}</p>
        <ul class="plain">${(p.initial_subjects || []).map((s) => `<li>初试 ${esc(s.code)} ${esc(s.name)}${s.books && s.books.length ? "：<br>" + s.books.map(esc).join("<br>") : ""}</li>`).join("")}
        ${(p.retest_subjects || []).map((s) => `<li>复试 ${esc(s.code)} ${esc(s.name)}${s.books && s.books.length ? "：<br>" + s.books.map(esc).join("<br>") : ""}</li>`).join("")}</ul>
      </article>`).join("")}
    </div>
    <div class="note">
      <p>真题：314/315 可在公开渠道查阅农学门类联考真题；857 为学校自命题，本工具不抓取商业题库或未公开试卷。</p>
      <p>权威顺序：南农研招网 / 目录系统 &gt; 资环学院通知 &gt; 中国研招网 &gt; 第三方汇总。</p>
    </div>
  `;
}

function renderSources(data) {
  const hits = data.source_hits || [];
  $("sources").innerHTML = `
    <div class="card serif-ui">
      <h2>抓取探测记录</h2>
      ${hits.map((h) => `<div class="source" style="box-shadow:none"><span class="${h.ok ? "ok" : "bad"}">${h.ok ? "成功" : "失败"}</span> · ${esc(h.source)} · <a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.url)}</a><div class="tiny">${esc(h.fetched_at)} ${esc(h.detail)}</div></div>`).join("")}
    </div>
  `;
}

async function load() {
  setStatus("读取本地缓存…");
  const res = await fetch("/api/data");
  render(await res.json());
}

async function refresh() {
  const btn = $("refreshBtn");
  btn.disabled = true;
  setStatus("正在抓取官网，大约需要几十秒…");
  try {
    const res = await fetch("/api/refresh", { method: "POST" });
    if (!res.ok) throw new Error("refresh failed " + res.status);
    render(await res.json());
    setStatus("抓取完成 " + (state.data.generated_at || ""));
  } catch (err) {
    setStatus("抓取失败：" + err.message);
  } finally {
    btn.disabled = false;
  }
}

load();
