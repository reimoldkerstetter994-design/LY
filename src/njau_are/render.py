from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from njau_are.models import Program, ScrapeReport
from njau_are.store import DATA_DIR, SITE_DIR

CATEGORY_LABEL = {
    "core": "农业资源与环境学硕",
    "related_academic": "同学院相关学硕",
    "related_professional": "同学院相关专硕",
    "other": "其他",
}


def _md_subjects(items: list) -> str:
    if not items:
        return "—"
    return "<br>".join(f"`{s.code}` {s.name}" for s in items)


def render_markdown(report: ScrapeReport) -> str:
    lines = [
        "# 南京农业大学 · 农业资源与环境学硕考研公开资料",
        "",
        f"- 抓取时间：{report.scraped_at}",
        f"- 覆盖招生目录年份：{', '.join(str(y) for y in report.catalog_years) or '无'}",
        "- 范围：官方公开信息（研招网、招生目录系统、资环学院）。不含真题/培训机构资料。",
        "",
        "## 学硕定位",
        "",
        "南京农业大学农业资源与环境（0903）目前按二级学科招收学术学位硕士：",
        "",
        "- `090301` 土壤学",
        "- `090302` 植物营养学",
        "",
        "学院培养地点：滨江校区。最终计划以教育部下达指标和推免实际录取为准。",
        "",
    ]
    latest = report.catalog_years[0] if report.catalog_years else None
    if latest:
        lines += [f"## {latest} 年招生目录（核心学硕）", ""]
        core = [p for p in report.programs if p.year == latest and p.category == "core"]
        for program in core:
            lines += _program_md(program)
        lines += [f"## {latest} 年同学院对照专业", ""]
        related = [p for p in report.programs if p.year == latest and p.category != "core"]
        for program in related:
            lines += _program_md(program, compact=True)

    if report.subjects:
        lines += ["## 最新初试/复试参考书目（官方）", ""]
        for subject in report.subjects:
            books = subject.reference_books or "官方页面未列出具体书目（公共课常见）。"
            lines += [
                f"### `{subject.code}` {subject.name}",
                "",
                books,
                "",
                f"来源：{subject.url}",
                "",
            ]

    if len(report.catalog_years) > 1:
        lines += ["## 近年计划人数对照", "", "| 年份 | 专业 | 拟招生人数 |", "| --- | --- | ---: |"]
        for program in sorted(report.programs, key=lambda p: (p.major_code, p.year)):
            if program.category != "core":
                continue
            lines.append(
                f"| {program.year} | `{program.major_code}` {program.major_name} | {program.planned_quota} |"
            )
        lines.append("")

    lines += ["## 最新官方通知", ""]
    relevant = [n for n in report.notices if n.relevant]
    for notice in relevant[:40]:
        date = notice.published or "日期未标"
        lines.append(f"- {date} [{notice.title}]({notice.url})（{notice.source}）")
        for att in notice.attachments:
            if att.relevant:
                lines.append(f"  - 附件：[{att.name}]({att.url})")
    lines += ["", "## 数据来源", ""]
    for url in report.sources:
        lines.append(f"- {url}")
    if report.errors:
        lines += ["", "## 抓取告警", ""]
        for err in report.errors:
            lines.append(f"- {err}")
    lines.append("")
    return "\n".join(lines)


def _program_md(program: Program, compact: bool = False) -> list[str]:
    dirs = "；".join(f"{d.code} {d.name}" for d in program.directions) or "—"
    lines = [
        f"### `{program.major_code}` {program.major_name}",
        "",
        f"- 类型：{program.degree_type} · {CATEGORY_LABEL.get(program.category, program.category)}",
        f"- 拟招生人数（含推免，仅供参考）：**{program.planned_quota}**",
        f"- 研究方向：{dirs}",
        f"- 初试科目：{_md_subjects(program.initial_subjects).replace('<br>', '；')}",
        f"- 复试科目：{_md_subjects(program.retest_subjects).replace('<br>', '；')}",
    ]
    if program.notes and not compact:
        lines.append(f"- 备注：{program.notes}")
    lines += [f"- 来源：{program.source_url}", ""]
    return lines


def render_html(report: ScrapeReport) -> str:
    latest = report.catalog_years[0] if report.catalog_years else None
    core = [p for p in report.programs if latest and p.year == latest and p.category == "core"]
    related = [p for p in report.programs if latest and p.year == latest and p.category != "core"]
    college = next((c for c in report.college if c.year == latest), None)
    history_rows = []
    grouped: dict[str, dict[int, int | None]] = defaultdict(dict)
    years = sorted({p.year for p in report.programs if p.category == "core"})
    for program in report.programs:
        if program.category != "core":
            continue
        grouped[f"{program.major_code} {program.major_name}"][program.year] = program.planned_quota
    for name, by_year in grouped.items():
        cells = "".join(f"<td>{by_year.get(year, '—')}</td>" for year in years)
        history_rows.append(f"<tr><th>{name}</th>{cells}</tr>")

    program_cards = "".join(_program_card(p) for p in core)
    related_cards = "".join(_program_card(p, compact=True) for p in related)
    subject_cards = "".join(
        f"""<article class="card">
          <h3><code>{s.code}</code> {s.name}</h3>
          <p class="books">{_esc(s.reference_books or "官方页面未列出具体书目。")}</p>
          <p class="muted"><a href="{_esc(s.url)}" target="_blank" rel="noopener">官方参考书页面</a></p>
        </article>"""
        for s in report.subjects
    )
    notice_items = []
    for notice in [n for n in report.notices if n.relevant][:50]:
        atts = "".join(
            f'<li><a href="{_esc(a.url)}" target="_blank" rel="noopener">{_esc(a.name)}</a></li>'
            for a in notice.attachments
            if a.relevant
        )
        attach_html = f"<ul class='atts'>{atts}</ul>" if atts else ""
        notice_items.append(
            f"""<article class="notice">
              <div class="meta">{_esc(notice.published or "日期未标")} · {_esc(notice.source)}</div>
              <h3><a href="{_esc(notice.url)}" target="_blank" rel="noopener">{_esc(notice.title)}</a></h3>
              <p>{_esc(notice.summary[:220])}</p>
              {attach_html}
            </article>"""
        )

    year_heads = "".join(f"<th>{year}</th>" for year in years)
    error_banner = ""
    if report.errors:
        lis = "".join(f"<li>{_esc(e)}</li>" for e in report.errors)
        error_banner = f'<div class="banner warn"><strong>部分来源抓取失败</strong><ul>{lis}</ul></div>'

    college_html = ""
    if college:
        college_html = f"""
        <section class="hero-note">
          <p><strong>{_esc(college.college_name)}</strong>　招生咨询：{_esc(college.phone)}　
          {latest} 年学院硕士拟招生合计 <strong>{college.planned_quota}</strong> 人（含推免，仅供参考）。</p>
          <p>{_esc(college.intro)}</p>
        </section>"""

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>南农农业资源与环境学硕 · 官方公开资料</title>
  <style>
    :root {{
      --bg: #f4f1ea;
      --ink: #1c2b24;
      --muted: #5c6b63;
      --card: #fffdf8;
      --line: #d7cfc2;
      --accent: #1f6f4a;
      --accent-2: #c45c26;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0; font-family: "Iwanami Mincho","Source Han Serif SC","Noto Serif SC", Georgia, serif;
      background: var(--bg); color: var(--ink); line-height: 1.65;
    }}
    header {{
      background: linear-gradient(160deg, #16382b, #1f6f4a 55%, #3d8b63);
      color: #f7f3ea; padding: 40px 20px 36px;
    }}
    header .wrap, main, footer .wrap {{ max-width: 1080px; margin: 0 auto; }}
    h1 {{ font-size: 28px; margin: 0 0 8px; letter-spacing: .04em; }}
    .sub {{ opacity: .9; margin: 0; }}
    .pills {{ display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }}
    .pill {{ background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22);
      padding: 4px 10px; border-radius: 999px; font-size: 13px; }}
    main {{ padding: 28px 20px 64px; }}
    h2 {{ font-size: 22px; border-bottom: 2px solid var(--accent); display: inline-block;
      padding-bottom: 4px; margin: 28px 0 14px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }}
    .card, .notice {{
      background: var(--card); border: 1px solid var(--line); border-radius: 16px;
      padding: 16px 18px; box-shadow: 0 8px 24px rgba(28,43,36,.04);
    }}
    .card h3, .notice h3 {{ margin: 0 0 8px; font-size: 18px; }}
    .card ul {{ margin: 8px 0; padding-left: 18px; }}
    .muted, .meta {{ color: var(--muted); font-size: 13px; }}
    a {{ color: var(--accent); }}
    table {{ width: 100%; border-collapse: collapse; background: var(--card); }}
    th, td {{ border: 1px solid var(--line); padding: 8px 10px; text-align: left; }}
    th {{ background: #e8efe9; }}
    .notice {{ margin-bottom: 12px; }}
    .atts {{ font-size: 14px; }}
    .banner {{ padding: 12px 14px; border-radius: 12px; background: #fff4e8; border: 1px solid #ead0b4; }}
    .banner.warn {{ background: #fff1f0; border-color: #f0c4c0; }}
    .hero-note {{ background: var(--card); border-left: 4px solid var(--accent-2); padding: 12px 16px; margin: 12px 0 20px; }}
    footer {{ padding: 24px 20px 40px; color: var(--muted); font-size: 13px; }}
    code {{ background: #eef4ef; padding: 1px 6px; border-radius: 6px; }}
    .books {{ white-space: pre-wrap; }}
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <p class="sub">南京农业大学 · 资源与环境科学学院</p>
      <h1>农业资源与环境学硕考研公开资料台</h1>
      <p class="sub">实时汇总官方招生目录、考试科目、参考书目与学院/研招网通知。不含真题与任何培训机构资料。</p>
      <div class="pills">
        <span class="pill">抓取时间 { _esc(report.scraped_at) }</span>
        <span class="pill">目录年份 { _esc("、".join(str(y) for y in report.catalog_years) or "无") }</span>
        <span class="pill">090301 土壤学</span>
        <span class="pill">090302 植物营养学</span>
      </div>
    </div>
  </header>
  <main>
    {error_banner}
    {college_html}
    <h2>{latest or ""} 年核心学硕</h2>
    <div class="grid">{program_cards or "<p>未抓到当年目录。</p>"}</div>
    <h2>官方参考书目</h2>
    <div class="grid">{subject_cards or "<p>未抓到科目书目。</p>"}</div>
    <h2>近年拟招生人数</h2>
    <table>
      <thead><tr><th>专业</th>{year_heads}</tr></thead>
      <tbody>{''.join(history_rows) or "<tr><td colspan='4'>暂无</td></tr>"}</tbody>
    </table>
    <p class="muted">人数含推免生，仅供参考；最终以教育部下达计划和当年推免录取为准。</p>
    <h2>同学院对照专业</h2>
    <p class="muted">以下专业不属于农业资源与环境学硕，仅便于区分土壤学/植物营养学与学院其他招生方向。</p>
    <div class="grid">{related_cards}</div>
    <h2>最新官方通知</h2>
    {''.join(notice_items) or "<p>未抓到相关通知。</p>"}
    <h2>使用说明</h2>
    <div class="card">
      <ul>
        <li>以南京农业大学研究生招生网和招生目录系统为准。</li>
        <li>学校研招办公开声明：不对外提供往年考研真题，也未授权任何考研培训。</li>
        <li>重新抓取：<code>python3 -m njau_are scrape</code>；本地查看：<code>python3 -m njau_are serve</code>。</li>
      </ul>
    </div>
  </main>
  <footer><div class="wrap">资料来源于 njau.edu.cn 公开网页，抓取时限流并标明出处，仅供报考信息整理。</div></footer>
</body>
</html>
"""


def _program_card(program: Program, compact: bool = False) -> str:
    dirs = "".join(f"<li>{_esc(d.code)} {_esc(d.study_mode)} {_esc(d.name)}</li>" for d in program.directions)
    init = "<br>".join(f"<code>{_esc(s.code)}</code> {_esc(s.name)}" for s in program.initial_subjects)
    retest = "<br>".join(f"<code>{_esc(s.code)}</code> {_esc(s.name)}" for s in program.retest_subjects)
    note = "" if compact or not program.notes else f"<p>{_esc(program.notes)}</p>"
    return f"""<article class="card">
      <h3><code>{_esc(program.major_code)}</code> {_esc(program.major_name)}</h3>
      <p class="meta">{_esc(program.degree_type)} · 拟招生 {program.planned_quota} 人</p>
      <p><strong>初试</strong><br>{init}</p>
      <p><strong>复试</strong><br>{retest}</p>
      <p><strong>方向</strong></p>
      <ul>{dirs}</ul>
      {note}
      <p class="muted"><a href="{_esc(program.source_url)}" target="_blank" rel="noopener">招生目录原页</a></p>
    </article>"""


def _esc(value: object) -> str:
    text = "" if value is None else str(value)
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def write_outputs(report: ScrapeReport) -> dict[str, Path]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    md_path = DATA_DIR / "latest.md"
    html_path = SITE_DIR / "index.html"
    md_path.write_text(render_markdown(report), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    return {"markdown": md_path, "html": html_path}
