"""Official public sources and crawl policy.

Only official university pages are scraped. Past exam papers, paid course
packs, and third-party pirated materials are intentionally out of scope.
The graduate admissions office has publicly stated it does not provide
past papers and does not authorize exam-prep institutes.
"""

from __future__ import annotations

from datetime import datetime

USER_AGENT = (
    "NJAU-ARE-KaoyanAggregator/0.1 "
    "(+https://zsgz.njau.edu.cn; academic public-information aggregator; "
    "respects robots and rate limits)"
)

REQUEST_TIMEOUT = 25
REQUEST_GAP_SECONDS = 0.9

COLLEGE_CODE = "003"
COLLEGE_NAME = "资源与环境科学学院"

# 农业资源与环境一级学科（0903）学硕目前按二级学科招生
CORE_ACADEMIC_CODES = {"090301", "090302"}
CORE_ACADEMIC_NAMES = {
    "090301": "土壤学",
    "090302": "植物营养学",
}

# 同学院相关专业，用于对照，不与 0903 学硕混为一谈
RELATED_ACADEMIC_CODES = {"071300", "083001", "083002"}
RELATED_PROFESSIONAL_CODES = {"085700", "095132"}

KEYWORDS = (
    "农业资源与环境",
    "土壤学",
    "植物营养",
    "090301",
    "090302",
    "0903",
    "857",
    "资环",
    "资源与环境科学学院",
    "硕士研究生",
    "学硕",
    "复试",
    "调剂",
    "拟录取",
    "推免",
    "招生目录",
    "招生章程",
    "参考书",
    "分数线",
    "进入复试",
)

ATTACHMENT_KEYWORDS = (
    "农业资源与环境",
    "土壤学",
    "植物营养",
    "090301",
    "090302",
    "资环",
    "资源与环境科学学院",
    "003资源与环境",
    "参考书",
)

CATALOG_YEAR_START = 2024


def catalog_url(year: int) -> str:
    return f"https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/zsml_ss_default.aspx"


def subject_url(year: int, kmdm: str) -> str:
    return f"https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/zsml_ss_view.aspx?kmdm={kmdm}"


ZSGZ_HOME = "https://zsgz.njau.edu.cn"
COLLEGE_HOME = "https://re.njau.edu.cn"

ZSGZ_LISTS = (
    f"{ZSGZ_HOME}/zsxx/sszs/jzml.htm",
    f"{ZSGZ_HOME}/zsxx/sszs/sszxtz.htm",
    f"{ZSGZ_HOME}/xxgk/lqgs.htm",
    f"{ZSGZ_HOME}/xxgk/lnfsfs.htm",
    f"{ZSGZ_HOME}/xxgk/lnbkqk.htm",
)

# Extra official article URLs that remain useful even when a list page is empty.
ZSGZ_PINNED = (
    f"{ZSGZ_HOME}/info/1006/1656.htm",  # 2026 专业目录公告
    f"{ZSGZ_HOME}/info/1006/1655.htm",  # 2026 招生章程（目录栏目）
    f"{ZSGZ_HOME}/info/1007/1692.htm",  # 2026 招生章程
    f"{ZSGZ_HOME}/info/1007/1717.htm",  # 2026 复试录取办法
    f"{ZSGZ_HOME}/info/1007/1732.htm",  # 2027 目录预通知
    f"{ZSGZ_HOME}/info/1007/1726.htm",  # 初试科目调整预通知
    f"{ZSGZ_HOME}/info/1007/1081.htm",  # 学院联系方式
    f"{ZSGZ_HOME}/info/1007/1080.htm",  # 严正声明（不提供真题）
)

COLLEGE_LISTS = (
    f"{COLLEGE_HOME}/tzgg.htm",
    f"{COLLEGE_HOME}/yjsjy/zsgz.htm",
    f"{COLLEGE_HOME}/xkjs/nyzyyhj.htm",
)

COLLEGE_PINNED = (
    f"{COLLEGE_HOME}/info/1078/12613.htm",  # 2026 硕士拟录取公示
    f"{COLLEGE_HOME}/info/1078/12572.htm",  # 2026 复试面试安排
    f"{COLLEGE_HOME}/info/1078/12570.htm",  # 2026 复试笔试考场
)


def candidate_catalog_years(now: datetime | None = None) -> list[int]:
    current = (now or datetime.now()).year
    # Admissions catalogs are named by enrollment year; a preview for year+1
    # may appear in summer/autumn of the current year.
    years = list(range(current + 1, CATALOG_YEAR_START - 1, -1))
    return years


def is_relevant_notice(title: str, summary: str = "") -> bool:
    blob = f"{title} {summary}"
    return any(key in blob for key in KEYWORDS)


def is_relevant_attachment(name: str, title: str = "") -> bool:
    blob = f"{name} {title}"
    return any(key in blob for key in ATTACHMENT_KEYWORDS)
