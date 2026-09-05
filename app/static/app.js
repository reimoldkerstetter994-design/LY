const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let STATE = null;

document.getElementById("tabs").addEventListener("click", (event) => {
  const btn = event.target.closest("button");
  if (!btn) return;
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b === btn));
  $$(".panel").forEach((p) => p.classList.toggle("on", p.id === btn.dataset.tab));
});

$("#crawlBtn").addEventListener("click", async () => {
  const btn = $("#crawlBtn");
  btn.disabled = true;
  btn.textContent = "正在抓取官方页面…";
  try {
    const res = await fetch("/api/crawl", { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "抓取失败");
    STATE = data;
    render(data);
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "立即抓取最新公开页";
  }
});

async function boot() {
  const res = await fetch("/api/snapshot");
  STATE = await res.json();
  render(STATE);
  if (!STATE.run || STATE.run.status !== "ok") {
    // first visit: pull live official pages automatically
    $("#crawlBtn").click();
  }
}

function render(data) {
  const run = data.run;
  $("#runMeta").textContent = run
    ? `最近抓取 ${run.finished_at || run.started_at || ""} · ${run.status}${run.summary ? " · " + run.summary : ""}`
    : "尚未抓取";
  renderOverview(data);
  renderExams(data);
  renderNotices(data);
  renderTeachers(data);
  renderDiscipline(data);
  renderSources(data);
}

function academic(data) {
  return (data.programs || []).filter((p) => p.is_academic);
}

function renderOverview(data) {
  const programs = academic(data);
  if (!programs.length) {
    $("#overview").innerHTML = `<div class="empty">还没有专业目录。点击「立即抓取最新公开页」。</div>`;
    return;
  }
  const cards = programs.map((p) => `
    <article class="card">
      <div><span class="badge">${p.degree_type}</span><span class="badge">${p.code}</span></div>
      <h2>${esc(p.name)}</h2>
      <p>拟招生 <strong>${esc(p.planned_seats)}</strong> 人（目录公布数，含推免）</p>
      <p class="muted">${esc(p.notes)}</p>
      <h3>研究方向</h3>
      <ul class="plain">${p.directions.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
      <h3>初试</h3>
      <ul class="plain">${p.subjects.filter(s => s.stage === "初试").map(s => `<li>${esc(s.slot)} ${esc(s.code)} ${esc(s.name)}</li>`).join("")}</ul>
      <h3>复试</h3>
      <ul class="plain">${p.subjects.filter(s => s.stage === "复试").map(s => `<li>${esc(s.code)} ${esc(s.name)}${s.optional_group ? "（可选）" : ""}</li>`).join("")}</ul>
    </article>`).join("");

  const rows = ["代码", "专业", "拟招", "第三单元", "第四单元", "复试"].map((_, idx, labels) => labels[idx]);
  const compareHead = ["项目", ...programs.map((p) => `${p.name}`)];
  const fields = [
    ["专业代码", (p) => p.code],
    ["拟招生人数", (p) => p.planned_seats],
    ["公共课", (p) => p.subjects.filter(s => s.stage==="初试" && ["101","201"].includes(s.code)).map(s => s.name).join(" / ")],
    ["第三单元", (p) => {
      const s = p.subjects.find(x => x.stage==="初试" && x.slot === "③");
      return s ? `${s.code} ${s.name}` : "—";
    }],
    ["专业课", (p) => {
      const s = p.subjects.find(x => x.code === "857");
      return s ? `${s.code} ${s.name}` : "—";
    }],
    ["复试科目", (p) => p.subjects.filter(s => s.stage==="复试").map(s => `${s.code} ${s.name}`).join(" 或 ")],
  ];
  const table = `
    <div class="card" style="margin-top:16px; overflow:auto">
      <h2>学硕对照</h2>
      <p class="muted">南农农业资源与环境学硕目前按二级学科招生：土壤学、植物营养学。二者专业课同为 857，第三单元不同。</p>
      <table>
        <thead><tr>${compareHead.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>
          ${fields.map(([label, fn]) => `<tr><th>${label}</th>${programs.map(p => `<td>${esc(fn(p) || "—")}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>`;

  const related = (data.programs || []).filter((p) => !p.is_academic);
  const relatedHtml = related.length ? `
    <div class="card" style="margin-top:16px">
      <h2>同学院相关专业（非本学硕，便于区分）</h2>
      <ul class="plain">${related.map(p => `<li><span class="badge pro">${esc(p.degree_type)}</span>${esc(p.code)} ${esc(p.name)} · 拟招 ${esc(p.planned_seats)}</li>`).join("")}</ul>
    </div>` : "";

  $("#overview").innerHTML = `<div class="grid">${cards}</div>${table}${relatedHtml}`;
}

function renderExams(data) {
  const programs = academic(data);
  const seen = new Map();
  for (const p of programs) {
    for (const s of p.subjects) {
      if (!seen.has(s.code)) seen.set(s.code, s);
    }
  }
  const rows = [...seen.values()].map((s) => `
    <tr>
      <td>${esc(s.stage)}</td>
      <td>${esc(s.code)}</td>
      <td>${esc(s.name)}</td>
      <td>${esc(s.books || "统考科目或目录未公布参考书。点击左侧官方科目页核对。")}</td>
      <td>${s.source_url ? `<a href="${esc(s.source_url)}" target="_blank" rel="noopener">官方科目页</a>` : "—"}</td>
    </tr>`).join("");
  $("#exams").innerHTML = `
    <div class="card">
      <h2>初试 / 复试科目与参考书</h2>
      <p class="muted">书目来自南农招生目录系统「点击科目查看参考书目考试大纲」。政治、英语、数学（农）/化学（农）为全国统考，大纲以教育部公布为准。</p>
      <div style="overflow:auto"><table>
        <thead><tr><th>阶段</th><th>代码</th><th>科目</th><th>参考书目</th><th>来源</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5">暂无数据</td></tr>`}</tbody>
      </table></div>
    </div>`;
}

function renderNotices(data) {
  const notices = data.notices || [];
  $("#notices").innerHTML = `
    <input class="search" id="noticeQ" placeholder="搜索通知、附件…" />
    <div id="noticeList"></div>`;
  const draw = () => {
    const q = ($("#noticeQ").value || "").trim();
    const filtered = notices.filter((n) => {
      const blob = `${n.title} ${n.body} ${(n.attachments||[]).map(a=>a.name).join(" ")}`;
      return !q || blob.includes(q);
    });
    $("#noticeList").innerHTML = filtered.map((n) => `
      <article class="notice">
        <div><span class="badge ${n.relevance === "are" ? "are" : ""}">${esc(n.relevance === "are" ? "资环相关" : n.relevance === "school" ? "全校研招" : n.source)}</span>
        <span class="muted">${esc(n.published_at || "")} · ${esc(n.source)}</span></div>
        <h3><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a></h3>
        <p class="muted">${esc((n.summary || n.body || "").slice(0, 180))}${(n.body||"").length>180?"…":""}</p>
        <div class="attach">${(n.attachments||[]).map(a =>
          `<div><a class="${a.highlighted ? "hot" : ""}" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)}</a></div>`
        ).join("")}</div>
      </article>`).join("") || `<div class="empty">没有匹配的通知。</div>`;
  };
  $("#noticeQ").addEventListener("input", draw);
  draw();
}

function renderTeachers(data) {
  const teachers = data.teachers || [];
  $("#teachers").innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <p>名录来自资环学院师资库公开接口，按土壤学系、植物营养学系抓取。是否招收当年硕士以导师主页和学院当年通知为准。</p>
      <input class="search" id="teacherQ" placeholder="搜索姓名、职称、学科…" />
    </div>
    <div id="teacherTable"></div>`;
  const draw = () => {
    const q = ($("#teacherQ").value || "").trim();
    const rows = teachers.filter((t) => `${t.name}${t.rank}${t.unit}${t.discipline}`.includes(q));
    $("#teacherTable").innerHTML = `<div style="overflow:auto"><table>
      <thead><tr><th>姓名</th><th>单位</th><th>职称</th><th>学科</th><th>导师</th><th>主页</th></tr></thead>
      <tbody>${rows.map((t) => `<tr>
        <td>${esc(t.name)}</td><td>${esc(t.unit)}</td><td>${esc(t.rank)}</td>
        <td>${esc(t.discipline)}</td>
        <td>${t.doctoral_tutor ? "博导" : t.master_tutor ? "硕导" : "—"}</td>
        <td>${t.homepage ? `<a href="${esc(t.homepage)}" target="_blank" rel="noopener">主页</a>` : "—"}</td>
      </tr>`).join("")}</tbody></table></div>
      <p class="muted">${rows.length} 人</p>`;
  };
  $("#teacherQ").addEventListener("input", draw);
  draw();
}

function renderDiscipline(data) {
  const docs = data.docs || {};
  const contacts = data.contacts || [];
  $("#discipline").innerHTML = `
    <div class="grid">
      <article class="card">
        <h2>联系报考</h2>
        ${contacts.map(c => `<p><strong>${esc(c.org)}</strong><br>${esc(c.person)} ${esc(c.phone)}<br>${esc(c.email)}<br>${esc(c.address)}<br><a href="${esc(c.url)}" target="_blank" rel="noopener">来源页</a></p>`).join("")}
      </article>
      <article class="card">
        <h2>${esc((docs.discipline||{}).title || "学科介绍")}</h2>
        <p style="white-space:pre-wrap">${esc(((docs.discipline||{}).text || "抓取后显示学院学科介绍。").slice(0, 1600))}</p>
        ${(docs.discipline||{}).url ? `<p><a href="${esc(docs.discipline.url)}" target="_blank" rel="noopener">阅读原文</a></p>` : ""}
      </article>
    </div>`;
}

function renderSources(data) {
  const portals = data.portals || [];
  const logs = data.logs || [];
  $("#sources").innerHTML = `
    <div class="card">
      <h2>抓取边界</h2>
      <ul class="plain">
        <li>只抓取南京农业大学研究生招生网、招生目录系统、资环学院官网的<strong>公开网页</strong>。</li>
        <li>保留原文链接与附件下载地址，不把 PDF 整站镜像进本仓库。</li>
        <li>不抓取考研培训机构、网盘、付费真题站；那些材料受版权保护，也不构成官方最新依据。</li>
        <li>政治 / 英语 / 数学农 / 化学农 以教育部考试大纲为准，本站只索引南农自命题科目书目。</li>
      </ul>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>官方入口</h2>
      <ul class="plain">${portals.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a> — ${esc(p.note)}</li>`).join("")}</ul>
    </div>
    <div class="card" style="margin-top:16px">
      <h2>本次抓取日志</h2>
      <ul class="plain">${logs.slice(0, 20).map(l => `<li>${l.ok ? "✓" : "✗"} ${esc(l.source)} · ${esc(l.detail || l.url)}</li>`).join("") || "<li>暂无</li>"}</ul>
    </div>`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

boot();
