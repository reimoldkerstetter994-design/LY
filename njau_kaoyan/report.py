from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import yaml

from .storage import Storage

KNOWLEDGE_PATH = Path(__file__).resolve().parent.parent / "data" / "knowledge_0903.yaml"


def load_knowledge(path: Path | None = None) -> dict[str, Any]:
    p = path or KNOWLEDGE_PATH
    if not p.exists():
        return {}
    with p.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _date_label(it: dict[str, Any]) -> str:
    if it.get("published"):
        return it["published"]
    seen = (it.get("first_seen") or "")[:10]
    return f"收录 {seen}" if seen else ""


def _fmt_item(it: dict[str, Any], with_summary: bool = False) -> str:
    line = f"- {_date_label(it)} [{it['title']}]({it['url']})"
    tag = it.get("source_name") or it.get("source_id")
    if tag:
        line += f" `{tag}`"
    cat = it.get("category")
    if cat and cat != "其他":
        line += f" `{cat}`"
    if it.get("attachments"):
        names = "、".join(a.get("name", "附件") for a in it["attachments"][:6])
        line += f"\n  - 附件：{names}"
    if with_summary and it.get("summary"):
        line += f"\n  - {it['summary'][:160]}…"
    return line


def _program_block(p: dict[str, Any], books: dict[str, Any]) -> list[str]:
    lines = [f"### {p['code']} {p['name']}（{p.get('degree_type','学术学位')}）", ""]
    lines.append(f"- 拟招生人数：**{p.get('quota') or '—'}**（含推免，最终以实际下达为准）")
    if p.get("directions"):
        lines.append("- 研究方向：" + "；".join(p["directions"]))
    if p.get("subjects"):
        lines.append("- 初试科目：" + " / ".join(f"{s['code']} {s['name']}" for s in p["subjects"]))
    if p.get("retest"):
        lines.append(f"- 复试科目：{p['retest']}")
    if p.get("remark"):
        lines.append(f"- 备注：{p['remark']}")
    codes = [s["code"] for s in p.get("subjects", []) + p.get("retest_subjects", [])]
    shown = False
    for km in codes:
        b = books.get(km)
        if b and b.get("books"):
            if not shown:
                lines.append("- 参考书目：")
                shown = True
            lines.append(f"  - {km} {b.get('subject') or ''}：{b['books']}")
    lines.append("")
    return lines


def build_markdown(cfg: dict[str, Any], store: Storage, new_items: list[dict[str, Any]] | None = None) -> str:
    now = datetime.now()
    rcfg = cfg["report"]
    recent_cut = (now - timedelta(days=int(rcfg.get("recent_days", 45)))).strftime("%Y-%m-%d")
    limit = int(rcfg.get("max_items_per_section", 40))
    target = cfg["target"]
    kb = load_knowledge()

    L: list[str] = []
    L.append(f"# {target['school']} {target['college']} 农业资源与环境（0903 学硕）考研资料汇总")
    L.append("")
    L.append(f"> 生成时间：{now.strftime('%Y-%m-%d %H:%M')}　｜　数据库条目：{store.count_items()}　｜　"
             f"目标专业：{'、'.join(m['code'] + ' ' + m['name'] for m in target['majors'])}")
    L.append("")
    L.append("> 正式招生章程/目录以南农研招办每年 9 月公布的版本为准；本报告自动抓取，仅供备考参考。")
    L.append("")

    # ---- 本次新增 ----
    if new_items is not None:
        L.append(f"## 本次新增（{len(new_items)} 条）")
        L.append("")
        if not new_items:
            L.append("- 无新增内容")
        ordered = sorted(new_items, key=lambda x: x.get("published") or "", reverse=True)
        ordered.sort(key=lambda x: x.get("kind") != "official")
        for it in ordered[:limit]:
            L.append(_fmt_item(it))
        L.append("")

    # ---- 在线招生目录（实时） ----
    keys = sorted(store.list_snapshot_keys("catalog:"), reverse=True)
    if keys:
        latest = store.load_snapshot(keys[0])
        year = latest["year"]
        L.append(f"## 在线招生目录（实时抓取，{year} 年）")
        L.append("")
        col = latest.get("college", {})
        if col:
            L.append(f"- 学院：{col.get('code','')} {col.get('name','')}　电话：{col.get('phone','')}")
            if col.get("intro"):
                L.append(f"- 简介：{col['intro']}")
        L.append(f"- 来源：{latest['source_url']}")
        L.append("")
        target_codes = set(latest.get("target_codes") or [])
        books = latest.get("reference_books", {})
        for p in latest["programs"]:
            if p["code"] in target_codes:
                L.extend(_program_block(p, books))
        others = [p for p in latest["programs"] if p["code"] not in target_codes]
        if others:
            L.append("<details><summary>学院其他专业（对比/调剂参考）</summary>")
            L.append("")
            L.append("| 代码 | 专业 | 拟招 | 初试科目 | 复试 |")
            L.append("|---|---|---|---|---|")
            for p in others:
                subj = " / ".join(s["code"] + " " + s["name"] for s in p.get("subjects", []))
                L.append(f"| {p['code']} | {p['name']}（{p.get('degree_type','')}） | {p.get('quota','')} | {subj} | {p.get('retest','')} |")
            L.append("")
            L.append("</details>")
            L.append("")
        diff = store.load_snapshot("catalog_diff")
        if diff and diff.get("changes"):
            L.append(f"### 与 {diff['from']} 年目录对比的变化")
            L.append("")
            for c in diff["changes"]:
                L.append(f"- {c}")
            L.append("")
        elif diff:
            L.append(f"- 与 {diff['from']} 年目录对比：目标专业无变化")
            L.append("")

    # ---- 官方通知 ----
    official = store.list_items(kind="official", limit=500)
    L.append("## 官方通知（研究生招生网 + 资环学院）")
    L.append("")
    recent_official = [it for it in official if (it.get("published") or "") >= recent_cut]
    L.append(f"### 最近 {rcfg.get('recent_days', 45)} 天")
    L.append("")
    if recent_official:
        for it in recent_official[:limit]:
            L.append(_fmt_item(it, with_summary=True))
    else:
        L.append("- 暂无")
    L.append("")
    for cat in ["招生简章与目录", "成绩与分数线", "复试与录取", "调剂", "推免"]:
        rows = [it for it in official if it.get("category") == cat]
        if not rows:
            continue
        L.append(f"### {cat}")
        L.append("")
        for it in rows[:limit]:
            L.append(_fmt_item(it))
        L.append("")

    # ---- 全网资料 ----
    web = store.list_items(kind="search", limit=1000) + store.list_items(kind="weixin", limit=500)
    web.sort(key=lambda x: (x.get("score", 0), x.get("first_seen", "")), reverse=True)
    L.append("## 全网资料（搜索引擎 + 公众号）")
    L.append("")
    L.append("> 第三方来源仅供参考，付费资料请自行甄别；官网明确声明研招办不对外提供辅导资料。")
    L.append("")
    for cat in ["真题与资料", "经验与备考", "复试与录取", "成绩与分数线", "招生简章与目录", "导师与学科", "调剂", "其他"]:
        rows = [it for it in web if it.get("category") == cat]
        if not rows:
            continue
        L.append(f"### {cat}（{len(rows)}）")
        L.append("")
        for it in rows[:limit]:
            extra = it.get("extra") or {}
            site = extra.get("account") or extra.get("site") or it.get("source_name", "")
            L.append(f"- {_date_label(it)} [{it['title']}]({it['url']}) `{site}`")
            if it.get("summary"):
                L.append(f"  - {it['summary'][:140]}")
        L.append("")

    # ---- 知识库 ----
    if kb:
        L.append("## 核心事实速查（人工核对版）")
        L.append("")
        L.append(f"> 核对日期：{kb.get('meta', {}).get('verified_at', '')}。{kb.get('meta', {}).get('disclaimer', '')}")
        L.append("")
        for m in kb.get("discipline", {}).get("academic_masters", []):
            L.append(f"- **{m['code']} {m['name']}**：初试 {' / '.join(m['initial_exam'])}；复试 {m['retest']}；2026 拟招 {m.get('quota_2026')}")
        L.append("")
        rb = kb.get("reference_books_2026", {})
        if rb:
            L.append("<details><summary>参考书目（2026）</summary>")
            L.append("")
            for k, v in rb.items():
                if isinstance(v, list):
                    L.append(f"- {k}")
                    for b in v:
                        L.append(f"  - {b}")
                else:
                    L.append(f"- {k}：{v}")
            L.append("")
            L.append("</details>")
            L.append("")
        for key, title in (("official_notices_2027_cycle", "2027 考研周期官方预通知"), ("official_notices_2026_cycle", "2026 考研周期关键通知")):
            rows = kb.get(key, [])
            if rows:
                L.append(f"<details><summary>{title}</summary>")
                L.append("")
                for n in rows:
                    L.append(f"- {n['date']} [{n['title']}]({n['url']})")
                L.append("")
                L.append("</details>")
                L.append("")
        th = kb.get("timeline_hint", [])
        if th:
            L.append("<details><summary>年度时间线</summary>")
            L.append("")
            for t in th:
                L.append(f"- {t}")
            L.append("")
            L.append("</details>")
            L.append("")
    return "\n".join(L)


def write_reports(cfg: dict[str, Any], store: Storage, new_items: list[dict[str, Any]] | None = None) -> tuple[Path, Path]:
    out_dir = Path(cfg["report"]["out_dir"])
    out_dir.mkdir(parents=True, exist_ok=True)
    md = build_markdown(cfg, store, new_items)
    md_path = out_dir / "latest.md"
    md_path.write_text(md, encoding="utf-8")

    payload = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "new_items": new_items or [],
        "catalog": {k: store.load_snapshot(k) for k in store.list_snapshot_keys("catalog:")},
        "catalog_diff": store.load_snapshot("catalog_diff"),
        "official": store.list_items(kind="official", limit=1000),
        "search": store.list_items(kind="search", limit=1000),
        "weixin": store.list_items(kind="weixin", limit=1000),
    }
    json_path = out_dir / "latest.json"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return md_path, json_path
