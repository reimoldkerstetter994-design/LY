from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any


def _section(title: str) -> str:
    return f"\n## {title}\n\n"


def generate_markdown_report(data: dict[str, Any]) -> str:
    target = data.get("target", {})
    lines = [
        f"# {target.get('university', '')}{target.get('discipline_name', '')}{target.get('degree_type', '')}考研资料汇总",
        "",
        f"> 自动生成时间：{data.get('generated_at', '')}",
        "> 抓取频率：每天自动抓取一次，并按日期归档",
        f"> 数据来源：南京农业大学研究生院官网、官方招生目录系统、资源与环境科学学院官网",
        "",
        "---",
        "",
        "## 一、目标专业概览",
        "",
        f"- **学校**：{target.get('university', '')}",
        f"- **学院**：{target.get('college_name', '')}（代码 {target.get('college_code', '')}）",
        f"- **学科**：{target.get('discipline_name', '')}（代码 {target.get('discipline_code', '')}）",
        f"- **学位类型**：{target.get('degree_type', '')}",
        "",
    ]

    catalog = data.get("catalog", {})
    if catalog.get("college_intro"):
        lines.append(f"**学院简介**：{catalog['college_intro']}")
        lines.append("")

    majors = catalog.get("majors", [])
    if majors:
        lines.append("### 学硕招生专业（官方目录）")
        lines.append("")
        for major in majors:
            lines.append(f"#### {major.get('code', '')} {major.get('name', '')}")
            lines.append("")
            lines.append(f"- **拟招生人数**：{major.get('planned_quota', '见官网')}")
            if major.get("remark"):
                lines.append(f"- **备注**：{major['remark']}")
            lines.append("")
            for direction in major.get("directions", []):
                lines.append(f"**研究方向**：{direction.get('name', '')}")
                lines.append("")
                if direction.get("initial_exam"):
                    lines.append(f"- 初试科目：{direction['initial_exam']}")
                if direction.get("reexam_subjects"):
                    lines.append(f"- 复试科目：{direction['reexam_subjects']}")
                lines.append("")

    refs = data.get("subject_references", [])
    if refs:
        lines.append(_section("二、考试科目参考书目（官方）"))
        for ref in refs:
            lines.append(f"### {ref.get('code', '')} {ref.get('name', '')}")
            lines.append("")
            lines.append(f"来源：[官方目录系统]({ref.get('url', '')})")
            lines.append("")
            books = ref.get("books", [])
            if books:
                for i, book in enumerate(books, 1):
                    lines.append(f"{i}. {book}")
            else:
                lines.append("_官网暂未列出详细书目，请持续关注招生目录更新。_")
            lines.append("")

    lines.append(_section("三、重要官方通知"))
    for article in data.get("key_articles", []):
        lines.append(f"### [{article.get('title', '')}]({article.get('url', '')})")
        if article.get("published_at"):
            lines.append(f"发布时间：{article['published_at']}")
        preview = (article.get("content") or "")[:500]
        if preview:
            lines.append("")
            lines.append(preview + ("..." if len(article.get("content", "")) > 500 else ""))
        lines.append("")

    attachments = data.get("downloaded_attachments", [])
    if attachments:
        lines.append(_section("四、已下载附件"))
        for att in attachments:
            status = att.get("status", "")
            if status == "ok":
                lines.append(f"- [{att.get('title', '')}]({att.get('local_path', '')})")
            else:
                lines.append(f"- {att.get('title', '')}（下载失败：{att.get('error', '')}）")
        lines.append("")

    college = data.get("college_site", {})
    if college.get("status") == "ok":
        discipline = college.get("discipline", {})
        lines.append(_section("五、学院官网学科信息"))
        lines.append(f"页面：[{discipline.get('title', '')}]({discipline.get('url', '')})")
        lines.append("")
        preview = discipline.get("content_preview", "")
        if preview:
            lines.append(preview[:1500] + ("..." if len(preview) > 1500 else ""))
            lines.append("")

    archive = data.get("archive", {})
    if archive.get("changes"):
        lines.append(_section("每日变更"))
        lines.append(f"归档日期：{archive.get('date', '')}")
        lines.append("")
        for item in archive.get("changes", []):
            lines.append(f"- {item}")
        lines.append("")

    news = data.get("related_news", [])
    if news:
        lines.append(_section("六、相关招生通知索引"))
        for item in news[:20]:
            lines.append(f"- [{item.get('title', '')}]({item.get('url', '')})")
        lines.append("")

    lines.append(_section("七、备考建议与说明"))
    lines.append(
        "1. **以官网为准**：所有招生人数、考试科目、参考书目以南京农业大学研究生院官网及官方招生目录系统最新公布为准。"
    )
    lines.append("2. **学硕方向**：农业资源与环境学硕下设土壤学（090301）、植物营养学（090302）等方向，初试专业课均为 857 农业资源环境概论。")
    lines.append("3. **复试准备**：土壤学方向复试可选 0301 农业资源信息系统或 0305 土壤农化分析；植物营养学方向复试为 0307 植物营养学。")
    lines.append("4. **每日更新**：本工具默认每天自动抓取一次，请关注「南农研招」微信公众号核对最新通知。")
    lines.append("5. **资料使用**：本报告仅供学习参考，不构成招生承诺。")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("**官方链接**")
    lines.append("")
    lines.append("- 研究生院招生网：https://zsgz.njau.edu.cn")
    lines.append("- 2026招生目录系统：https://yzglxt.njau.edu.cn/gts2026/zsmlgl/zsml_ss_default.aspx")
    lines.append("- 资源与环境科学学院：https://re.njau.edu.cn")
    lines.append("- 研招办电话：025-84395345")
    lines.append("- 资环学院招生联系人：易老师 025-84395620 / yirongfei@njau.edu.cn")
    lines.append("")

    return "\n".join(lines)


def write_report(data: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "kaoyan_data.json"
    md_path = output_dir / "考研资料汇总.md"

    import json

    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path.write_text(generate_markdown_report(data), encoding="utf-8")
    return json_path, md_path
