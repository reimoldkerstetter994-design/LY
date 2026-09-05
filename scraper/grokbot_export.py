from __future__ import annotations

from pathlib import Path
from typing import Any


GROKBOT_FILENAME = "GROKBOT_南农资环学硕考研资料包.md"


def _books_lines(refs: list[dict[str, Any]], codes: list[str]) -> list[str]:
    lines: list[str] = []
    by_code = {ref.get("code"): ref for ref in refs}
    names = {
        "101": "思想政治理论（统考）",
        "201": "英语（一）（统考）",
        "314": "数学（农）",
        "315": "化学（农）",
        "857": "农业资源环境概论",
        "0301": "农业资源信息系统",
        "0305": "土壤农化分析",
        "0307": "植物营养学",
    }
    for code in codes:
        ref = by_code.get(code, {})
        title = names.get(code, ref.get("name") or code)
        lines.append(f"### {code} {title}")
        books = ref.get("books") or []
        if books:
            for book in books:
                lines.append(f"- {book}")
        else:
            lines.append("- 官网未单列参考书（统考科目按教育部大纲备考）。")
        url = ref.get("url")
        if url:
            lines.append(f"- 官方页面：{url}")
        lines.append("")
    return lines


def generate_grokbot_pack(data: dict[str, Any]) -> str:
    target = data.get("target", {})
    catalog = data.get("catalog", {})
    refs = data.get("subject_references", [])
    news = data.get("related_news", [])
    archive = data.get("archive", {})
    generated_at = data.get("generated_at", "")

    majors_block: list[str] = []
    for major in catalog.get("majors", []):
        majors_block.append(f"#### {major.get('code', '')} {major.get('name', '')}")
        majors_block.append(f"- 拟招生人数（含推免，仅供参考）：{major.get('planned_quota', '见官网')}")
        for direction in major.get("directions", []):
            majors_block.append(f"- 研究方向：{direction.get('name', '')}")
            majors_block.append(f"- 初试：{direction.get('initial_exam', '')}")
            majors_block.append(f"- 复试：{direction.get('reexam_subjects', '')}")
            if direction.get("remark"):
                majors_block.append(f"- 备注：{direction['remark']}")
        majors_block.append("")

    news_lines = []
    seen = set()
    for item in news:
        title = (item.get("title") or "").strip()
        url = item.get("url") or ""
        if not title or title in seen:
            continue
        seen.add(title)
        news_lines.append(f"- {title} {url}".strip())

    change_lines = [f"- {item}" for item in archive.get("changes", [])] or ["- 暂无变更记录"]

    return "\n".join(
        [
            "# GrokBot 资料包：南京农业大学农业资源与环境学硕考研",
            "",
            "你是考研备考助手。下面是我整理好的**南京农业大学 / 资源与环境科学学院 / 农业资源与环境学硕**公开资料。请严格依据本文件回答；本文件没有的内容，明确说“资料里没有，请以官网为准”，不要编造分数线、录取名单或内部题。",
            "",
            "回答要求：",
            "1. 优先用 2026 年官方目录和招生章程。",
            "2. 区分学硕（090301 土壤学、090302 植物营养学）和专硕（085700 资源与环境），不要混。",
            "3. 给出复习计划、书单、对比两个方向时，用条目，尽量短。",
            "4. 涉及招生人数时注明：目录人数含推免，最终以教育部下达计划和推免录取为准。",
            "",
            f"资料抓取时间：{generated_at}",
            f"归档日期：{archive.get('date', '')}",
            "数据来源：南京农业大学研究生院官网、官方招生目录系统、资源与环境科学学院官网。",
            "",
            "---",
            "",
            "## 1. 目标专业",
            "",
            f"- 学校：{target.get('university', '南京农业大学')}",
            f"- 学院：{target.get('college_name', '资源与环境科学学院')}（代码 {target.get('college_code', '003')}）",
            f"- 学科：{target.get('discipline_name', '农业资源与环境')}（代码 {target.get('discipline_code', '0903')}）",
            f"- 学位类型：{target.get('degree_type', '学硕')}，全日制，学制 3 年",
            "- 培养地点：滨江校区（农学院、植保、资环、园艺等学院在滨江）",
            "- 学院电话：025-84395620",
            "",
            *majors_block,
            "## 2. 考试科目对照",
            "",
            "| 专业 | 代码 | 初试① | 初试② | 初试③ | 初试④ | 复试 |",
            "|---|---|---|---|---|---|---|",
            "| 土壤学 | 090301 | 101 政治 | 201 英语一 | 314 数学（农） | 857 农业资源环境概论 | 0301 或 0305 |",
            "| 植物营养学 | 090302 | 101 政治 | 201 英语一 | 315 化学（农） | 857 农业资源环境概论 | 0307 植物营养学 |",
            "",
            "说明：两个学硕方向专业课都是 857。土壤学第三门是数学（农），植物营养学第三门是化学（农）。",
            "",
            "## 3. 官方参考书",
            "",
            *_books_lines(refs, ["857", "0301", "0305", "0307", "314", "315", "101", "201"]),
            "## 4. 学科背景（学院官网）",
            "",
            "- 农业资源与环境由国家重点学科土壤学、植物营养学发展而来，黄瑞采、史瑞和、裴保义等开创。",
            "- 国家“双一流”建设学科、国家一级重点学科、江苏省 A 类优势学科。",
            "- 教育部第四轮、第五轮学科评估均为 A+，是学校生态环境学科进入 ESI 前 1‰ 的主要支撑学科。",
            "- 学院研究方向：耕地培肥与改良；植物营养与养分高效利用；农业绿色投入品创新与利用；农业环境保护与健康；农业应对气候变化与碳中和。",
            "- 土壤学官方备注：国家重点学科、省优势学科、双一流，国家和省部级平台 5 个及“111”创新引智基地。",
            "- 植物营养学官方备注：同上。",
            "- 学院学科页：https://re.njau.edu.cn/xkjs/nyzyyhj.htm",
            "",
            "## 5. 2026 招生章程要点",
            "",
            "- 全文：https://zsgz.njau.edu.cn/info/1007/1692.htm",
            "- 目录系统：https://yzglxt.njau.edu.cn/gts2026/zsmlgl/zsml_ss_default.aspx",
            "- 2026 年全校预计招硕士约 3500 人（含推免）：学硕约 1400，全日制专硕约 1700，非全日制约 400。最终以上级下达计划为准。",
            "- 目录公布人数含推免、统考、少民骨干、退役大学生士兵等，公开招考名额会随推免和报考情况调整。",
            "- 报名：中国研究生招生信息网 https://yz.chsi.com.cn",
            "- 2026 网上报名：2025-10-16 至 10-27，每天 9:00–22:00；预报名 2025-10-10 至 10-13。",
            "- 2026 初试：2025-12-20 至 21 日，笔试。",
            "- 学硕学制 3 年。资环学院研究生在滨江校区。",
            "- 全日制非定向一般安排住宿；非全日制不安排住宿、不享受奖助。",
            "- 奖助（全日制、无固定工资收入）：助学金 0.6 万/年，学业奖学金 0.5–0.7 万/年，导师助研津贴 0.24 万/年；另有国奖、校长奖等。",
            "- 暂不招单独考试。",
            "- 复试差额一般不低于 120%；综合成绩初试权重不低于 50%。",
            "- 同等学力复试须加试至少两门本科主干课，笔试，不合格不录取。",
            "- 外语听力口语在复试中进行，计入复试总成绩。",
            "",
            "## 6. 2026 复试办法要点",
            "",
            "- 全文：https://zsgz.njau.edu.cn/info/1007/1717.htm",
            "- 复试分数基本要求先看国家线，学院可结合生源和名额自划进入复试的成绩要求。",
            "- 复试成绩满分 300 分；初试 500 分专业综合满分 800 分。",
            "- 复试、思想政治、同等学力加试任一项不合格，不予录取。",
            "- 资环学院 2026 复试细则附件：003资源与环境科学学院2026年复试细则.pdf",
            "- 下载入口在复试办法页面附件列表。",
            "",
            "## 7. 联系方式",
            "",
            "- 研招办电话：025-84395345",
            "- 研招办邮箱：yzb@njau.edu.cn",
            "- 研招办地址：南京市江北新区滨江大道666号行政楼 B305",
            "- 资环学院招生：易老师 025-84395620 / yirongfei@njau.edu.cn",
            "- 学院官网电话：025-84395210",
            "- 学院地址：江苏省南京江北新区滨江大道666号，邮编 211800",
            "- 微信公众号：南农研招",
            "- 研究生院招生网：https://zsgz.njau.edu.cn",
            "- 学院官网：https://re.njau.edu.cn",
            "",
            "## 8. 官方通知索引（已抓取）",
            "",
            *news_lines,
            "",
            "## 9. 本次相对上次的变化",
            "",
            *change_lines,
            "",
            "## 10. 给 GrokBot 的常见任务",
            "",
            "用户可能会让你做这些事，请直接做：",
            "- 对比 090301 土壤学 和 090302 植物营养学该报哪个",
            "- 按 857 四本书列 12–16 周复习计划",
            "- 按土壤学或植物营养学分别列初试+复试书单和周计划",
            "- 解释 314 数学（农）和 315 化学（农）的差异",
            "- 根据用户本科背景（农学/环境/化学/跨考）给报考建议",
            "- 把本资料整理成清单、表格或背诵提纲",
            "",
            "不要做：编造往年录取最低分、内部真题、导师私下名额、未公布的 2027 目录。",
            "",
        ]
    )


def write_grokbot_pack(data: dict[str, Any], output_dir: Path, extra_paths: list[Path] | None = None) -> list[Path]:
    text = generate_grokbot_pack(data)
    paths = [output_dir / GROKBOT_FILENAME]
    if extra_paths:
        paths.extend(extra_paths)
    written: list[Path] = []
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        written.append(path)
    return written
