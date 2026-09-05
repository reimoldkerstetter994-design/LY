from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "njau_are.db"

USER_AGENT = (
    "NJAU-ARE-KaoyanRadar/1.0 "
    "(+https://github.com/reimoldkerstetter994-design/LY; educational aggregator of official public pages)"
)

REQUEST_TIMEOUT = 25.0
REQUEST_GAP_SECONDS = 0.35

CATALOG_URL = "https://yzglxt.njau.edu.cn/gts2026/zsmlgl/zsml_ss_default.aspx"
CATALOG_YEAR = "2026"
COLLEGE_CODE = "003"
COLLEGE_NAME = "资源与环境科学学院"

ACADEMIC_MASTER_CODES = {
    "090301": "土壤学",
    "090302": "植物营养学",
    "090300": "农业资源与环境",
}

RELATED_PROFESSIONAL_CODES = {
    "095132": "资源利用与植物保护(专业学位)",
}

ZSGZ_BASE = "https://zsgz.njau.edu.cn"
COLLEGE_BASE = "https://re.njau.edu.cn"
FACULTY_API = f"{COLLEGE_BASE}/system/resource/tsites/portal/queryteacher.jsp"

NOTICE_LISTS = [
    f"{ZSGZ_BASE}/zsxx/sszs/jzml.htm",
    f"{ZSGZ_BASE}/zsxx/sszs/sszxtz.htm",
    *[f"{ZSGZ_BASE}/zsxx/sszs/sszxtz/{i}.htm" for i in range(2, 6)],
    f"{ZSGZ_BASE}/xxgk/lnfsfs.htm",
    f"{ZSGZ_BASE}/xxgk/lnbkqk.htm",
]

COLLEGE_PAGES = [
    f"{COLLEGE_BASE}/xkjs/nyzyyhj.htm",
    f"{COLLEGE_BASE}/xkjs/xkdjs.htm",
    f"{COLLEGE_BASE}/xygk/xyjs.htm",
    f"{COLLEGE_BASE}/xygk/lxwm.htm",
    f"{COLLEGE_BASE}/yjsjy/zsgz.htm",
    f"{COLLEGE_BASE}/index.htm",
]

FACULTY_UNITS = [
    {"collegeid": "1234", "label": "土壤学系"},
    {"collegeid": "1224", "label": "植物营养学系"},
]

FACULTY_SITE_OWNER = "1344679703"
FACULTY_VIEW_ID = "1094666"

ARE_KEYWORDS = (
    "农业资源与环境",
    "土壤学",
    "植物营养",
    "资环",
    "资源与环境科学",
    "090301",
    "090302",
    "090300",
    "857",
    "农业资源环境概论",
    "土壤农化",
    "植物营养学",
)

SCHOOLWIDE_NOTICE_KEYWORDS = (
    "招生章程",
    "专业目录",
    "招生目录",
    "复试",
    "调剂",
    "分数线",
    "推免",
    "初试科目",
    "参考书目",
    "拟录取",
)

OFFICIAL_CONTACTS = [
    {
        "org": "南京农业大学研究生招生办公室",
        "person": "研招办",
        "phone": "025-84395345",
        "email": "yzb@njau.edu.cn",
        "address": "南京市江北新区滨江大道666号行政楼B305",
        "url": f"{ZSGZ_BASE}/lxwm/lxzb.htm",
    },
    {
        "org": "资源与环境科学学院",
        "person": "易老师",
        "phone": "025-84395620",
        "email": "yirongfei@njau.edu.cn",
        "address": "江苏省南京江北新区滨江大道666号",
        "url": f"{COLLEGE_BASE}/xygk/lxwm.htm",
    },
]

PORTALS = [
    {"name": "南农研究生招生网", "url": ZSGZ_BASE, "note": "章程、通知、复试办法、附件下载"},
    {"name": "2026硕士招生专业目录系统", "url": CATALOG_URL, "note": "考试科目、拟招生人数、参考书目入口"},
    {"name": "资环学院官网", "url": COLLEGE_BASE, "note": "学科介绍、导师、学院通知"},
    {"name": "中国研究生招生信息网", "url": "https://yz.chsi.com.cn", "note": "报名、成绩、调剂官方入口"},
    {"name": "南农教师主页", "url": "http://faculty.njau.edu.cn", "note": "导师个人主页"},
]
