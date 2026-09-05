from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
SNAPSHOT_DIR = DATA_DIR / "snapshot"
GUIDES_DIR = DATA_DIR / "guides"
STATIC_DIR = Path(__file__).resolve().parent / "static"

SCHOOL = "南京农业大学"
SCHOOL_CODE = "10307"
COLLEGE = "资源与环境科学学院"
COLLEGE_CODE = "003"
DISCIPLINE = "农业资源与环境"
DISCIPLINE_CODE = "0903"

# 一级学科 0903 下的学术型硕士（学硕）二级学科
ACADEMIC_MASTER_CODES = ("090301", "090302")

USER_AGENT = (
    "NJAU-ARE-KaoyanBot/1.0 (+https://github.com/reimoldkerstetter994-design/LY; "
    "educational research; respects robots and official public pages)"
)

SOURCES = {
    "zsgz": "https://zsgz.njau.edu.cn",
    "catalog": "https://yzglxt.njau.edu.cn/gts2026/zsmlgl/zsml_ss_default.aspx",
    "subject": "https://yzglxt.njau.edu.cn/gts2026/zsmlgl/zsml_ss_view.aspx",
    "notices": "https://zsgz.njau.edu.cn/zsxx/sszs/sszxtz.htm",
    "catalog_page": "https://zsgz.njau.edu.cn/info/1006/1656.htm",
    "charter": "https://zsgz.njau.edu.cn/info/1007/1692.htm",
    "preview_2027": "https://zsgz.njau.edu.cn/info/1007/1732.htm",
    "subjects_2027": "https://zsgz.njau.edu.cn/info/1007/1726.htm",
    "retest_2026": "https://zsgz.njau.edu.cn/info/1007/1717.htm",
    "college": "https://re.njau.edu.cn",
    "college_news": "https://re.njau.edu.cn/tzgg/yjszs.htm",
    "chsi": "https://yz.chsi.com.cn",
    "national_line_2026": "https://yz.chsi.com.cn/kyzx/kp/202602/20260228/2293449093.html",
}

REQUEST_TIMEOUT = 25.0
REQUEST_GAP_SECONDS = 0.4
