from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CACHE_PATH = DATA_DIR / "cache.json"
SNAPSHOT_DIR = DATA_DIR / "snapshots"

USER_AGENT = (
    "NAU-ARE-KaoyanCollector/1.0 "
    "(+https://github.com/reimoldkerstetter994-design/LY; educational public-admissions aggregator)"
)

SCHOOL_NAME = "南京农业大学"
COLLEGE_NAME = "资源与环境科学学院"
DISCIPLINE_NAME = "农业资源与环境"
DISCIPLINE_CODE = "0903"
COLLEGE_CODE = "003"

TARGET_PROGRAMS = {
    "090301": "土壤学",
    "090302": "植物营养学",
}

DEPARTMENT_IDS = {
    "1234": "土壤学系",
    "1224": "植物营养学系",
}

CATALOG_BASE_CANDIDATES = [
    "https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/zsml_ss_default.aspx",
]
SUBJECT_VIEW = "https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/zsml_ss_view.aspx?kmdm={kmdm}"

ZSGZ_BASE = "https://zsgz.njau.edu.cn"
COLLEGE_BASE = "https://re.njau.edu.cn"

NEWS_LISTS = [
    {
        "name": "南农研招网-简章目录",
        "urls": [f"{ZSGZ_BASE}/zsxx/sszs/jzml.htm", f"{ZSGZ_BASE}/zsxx/sszs/jzml/2.htm"],
        "source": "zsgz",
    },
    {
        "name": "南农研招网-硕士最新通知",
        "urls": [
            f"{ZSGZ_BASE}/zsxx/sszs/sszxtz.htm",
            f"{ZSGZ_BASE}/zsxx/sszs/sszxtz/2.htm",
            f"{ZSGZ_BASE}/zsxx/sszs/sszxtz/3.htm",
        ],
        "source": "zsgz",
    },
    {
        "name": "南农研招网-录取公示",
        "urls": [f"{ZSGZ_BASE}/xxgk/lqgs.htm"],
        "source": "zsgz",
    },
    {
        "name": "南农研招网-历年复试分数",
        "urls": [f"{ZSGZ_BASE}/xxgk/lnfsfs.htm", f"{ZSGZ_BASE}/xxgk/lnfsfs/2.htm"],
        "source": "zsgz",
    },
    {
        "name": "南农研招网-历年报考情况",
        "urls": [f"{ZSGZ_BASE}/xxgk/lnbkqk.htm", f"{ZSGZ_BASE}/xxgk/lnbkqk/2.htm"],
        "source": "zsgz",
    },
    {
        "name": "资环学院-通知公告",
        "urls": [
            f"{COLLEGE_BASE}/tzgg.htm",
            f"{COLLEGE_BASE}/tzgg/2.htm",
            f"{COLLEGE_BASE}/tzgg/3.htm",
        ],
        "source": "college",
    },
    {
        "name": "资环学院-招生工作",
        "urls": [f"{COLLEGE_BASE}/yjsjy/zsgz.htm", f"{COLLEGE_BASE}/yjsjy/zsgz/2.htm"],
        "source": "college",
    },
    {
        "name": "资环学院-政策文件",
        "urls": [f"{COLLEGE_BASE}/yjsjy/zcwj.htm"],
        "source": "college",
    },
]

DISCIPLINE_URL = f"{COLLEGE_BASE}/xkjs/nyzyyhj.htm"
FACULTY_API = f"{COLLEGE_BASE}/system/resource/tsites/portal/queryteacher.jsp"
FACULTY_PAGE = f"{COLLEGE_BASE}/jsfc2.jsp?urltype=tree.TreeTempUrl&wbtreeid=1325"

CHSI_NATIONAL_LINE_CANDIDATES = [
    "https://yz.chsi.com.cn/kyzx/kp/202602/20260228/2293449093.html",
    "https://yz.chsi.com.cn/yzzt/kyfs",
]

KEYWORDS = [
    "农业资源与环境",
    "土壤学",
    "植物营养",
    "090301",
    "090302",
    "农业资源环境概论",
    "专业目录",
    "招生章程",
    "招生目录",
    "硕士研究生",
    "研究生招生",
    "复试",
    "调剂",
    "推免",
    "拟录取",
    "分数线",
    "参考书",
    "考试科目",
    "免试研究生",
]
UNDERGRAD_NOISE = ["本科生", "助学金", "班主任", "学生组织", "大类分流", "英语能力竞赛"]

REQUEST_TIMEOUT = 25.0
REQUEST_DELAY = 0.35
MAX_ARTICLE_FETCH = 18
