const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function simpleMarkdown(src) {
  const lines = src.replaceAll("\r\n", "\n").split("\n");
  const out = [];
  let inTable = false;
  let inList = false;

  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  const flushTable = () => {
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }
  };

  const inline = (t) => {
    t = escapeHtml(t);
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    return t;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("|")) {
      flushList();
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
      if (!inTable) {
        out.push("<table><thead><tr>" + cells.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>");
        inTable = true;
      } else {
        out.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
      }
      continue;
    }
    flushTable();
    if (line.startsWith("# ")) {
      flushList();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      flushList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === "" || line.trim() === "---") {
      flushList();
    } else {
      flushList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flushList();
  flushTable();
  return out.join("\n");
}

function renderPrograms(programs) {
  const root = $("#program-cards");
  if (!programs.length) {
    root.innerHTML = '<p class="empty">暂无目录数据。请先抓取。</p>';
    return;
  }
  root.innerHTML = programs
    .map((p) => {
      const dirs = (p.directions || []).map((d) => `<li>${escapeHtml(d.code)} ${escapeHtml(d.name)}</li>`).join("");
      const init = (p.initial_subjects || []).map((s) => `${s.code} ${s.name}`).join(" / ");
      const re = (p.retest_subjects || []).map((s) => `${s.code} ${s.name}`).join(" 或 ");
      return `<article class="card">
        <p class="code">${escapeHtml(p.code)} · ${escapeHtml(p.degree_type)}</p>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="planned">${p.planned ?? "—" }<small>人（拟招，含推免）</small></p>
        <p><strong>初试</strong> ${escapeHtml(init)}</p>
        <p><strong>复试</strong> ${escapeHtml(re)}</p>
        <ul>${dirs}</ul>
        <p>${escapeHtml(p.remark || "")}</p>
      </article>`;
    })
    .join("");
}

function renderScores(scores) {
  const body = $("#score-body");
  body.innerHTML = (scores || [])
    .map(
      (s) => `<tr>
        <td>${escapeHtml(s.year)}</td>
        <td>${escapeHtml(s.program_name)}</td>
        <td>${s.total}</td>
        <td>${s.politics}</td>
        <td>${s.foreign}</td>
        <td>${s.major1}</td>
        <td>${s.major2}</td>
        <td>${escapeHtml(s.note || "")}</td>
      </tr>`
    )
    .join("");
}

function renderSubjects(subjects) {
  const root = $("#subject-list");
  const list = Object.values(subjects || {});
  if (!list.length) {
    root.innerHTML = '<p class="empty">抓取后将显示官方参考书目。</p>';
    return;
  }
  list.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  root.innerHTML = list
    .map(
      (s) => `<article class="subject">
        <h3>${escapeHtml(s.code)} ${escapeHtml(s.name)} <small>${escapeHtml(s.kind)}</small></h3>
        <p>${escapeHtml(s.books || "全国统考科目，以教育部大纲为准。")}</p>
        ${s.official_url ? `<p><a href="${escapeHtml(s.official_url)}" target="_blank" rel="noopener">官方科目页</a></p>` : ""}
      </article>`
    )
    .join("");
}

function renderNotices(notices) {
  const root = $("#notice-list");
  if (!notices || !notices.length) {
    root.innerHTML = "<li class='empty'>暂无通知，或尚未抓取。</li>";
    return;
  }
  root.innerHTML = notices
    .map(
      (n) => `<li>
        <a href="${escapeHtml(n.url)}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a>
        <span class="src">${escapeHtml(n.source || "")} ${escapeHtml(n.date || "")}</span>
      </li>`
    )
    .join("");
}

function renderGuides(guides) {
  const tabs = $("#guide-tabs");
  const view = $("#guide-view");
  if (!guides || !guides.length) {
    view.innerHTML = "<p class='empty'>未找到复习资料。</p>";
    return;
  }
  tabs.innerHTML = guides
    .map((g, i) => `<button type="button" data-i="${i}" class="${i === 0 ? "active" : ""}">${escapeHtml(g.title)}</button>`)
    .join("");
  const show = (i) => {
    tabs.querySelectorAll("button").forEach((b, j) => b.classList.toggle("active", j === i));
    view.innerHTML = simpleMarkdown(guides[i].markdown);
  };
  tabs.onclick = (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;
    show(Number(btn.dataset.i));
  };
  show(0);
}

function renderAll(data) {
  const when = data.scraped_at ? `快照时间 ${data.scraped_at}` : "还没有成功快照";
  $("#scrape-meta").textContent = when;
  const box = $("#warnings");
  if (data.warnings && data.warnings.length) {
    box.hidden = false;
    box.innerHTML = data.warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join("");
  } else {
    box.hidden = true;
    box.innerHTML = "";
  }
  renderPrograms(data.programs || []);
  renderScores(data.scores || []);
  renderSubjects(data.subjects || {});
  renderNotices(data.notices || []);
  renderGuides(data.guides || []);
}

async function loadSnapshot() {
  const res = await fetch("/api/snapshot");
  renderAll(await res.json());
}

async function scrape() {
  const btn = $("#scrape-btn");
  btn.disabled = true;
  btn.textContent = "正在访问南农官网…";
  try {
    const res = await fetch("/api/scrape?year=2026", { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "抓取失败");
    }
    renderAll(await res.json());
  } catch (err) {
    $("#warnings").hidden = false;
    $("#warnings").innerHTML = `<p>${escapeHtml(err.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "立即抓取官方最新";
  }
}

$("#scrape-btn").addEventListener("click", scrape);
loadSnapshot();
