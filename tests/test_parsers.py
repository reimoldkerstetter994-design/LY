"""离线解析测试：使用 tests/fixtures 下保存的真实页面，不访问网络。"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from njau_kaoyan.classify import categorize, relevance_score  # noqa: E402
from njau_kaoyan.config import load_config  # noqa: E402
from njau_kaoyan.models import Item  # noqa: E402
from njau_kaoyan.sources.catalog import diff_catalog, parse_college_header, parse_programs  # noqa: E402
from njau_kaoyan.sources.search import parse_duckduckgo, parse_sogou_weixin  # noqa: E402
from njau_kaoyan.sources.vsb import find_next_pages, parse_detail, parse_list  # noqa: E402
from njau_kaoyan.storage import Storage  # noqa: E402

FIX = Path(__file__).parent / "fixtures"


def _read(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


def test_zsgz_list_parses_titles_and_dates():
    rows = parse_list(_read("zsgz_list.html"), "https://zsgz.njau.edu.cn/zsxx/sszs/sszxtz.htm")
    assert len(rows) >= 10
    by_url = {r["url"]: r for r in rows}
    r = by_url["https://zsgz.njau.edu.cn/info/1007/1732.htm"]
    assert r["title"] == "南京农业大学关于2027年硕士研究生招生考试专业目录的预通知"
    assert r["published"] == "2026-07-08"
    assert "2027年硕士研究生招生专业" in r["snippet"]


def test_vsb_pagination_rule():
    pages = find_next_pages(_read("re_list.html"), "https://re.njau.edu.cn/tzgg/xytz.htm", 3)
    assert pages == ["https://re.njau.edu.cn/tzgg/xytz/9.htm", "https://re.njau.edu.cn/tzgg/xytz/8.htm"]
    assert find_next_pages(_read("re_list.html"), "https://re.njau.edu.cn/tzgg/xytz.htm", 1) == []


def test_re_list_dates():
    rows = parse_list(_read("re_list.html"), "https://re.njau.edu.cn/tzgg/xytz.htm")
    r = next(x for x in rows if x["url"].endswith("12613.htm"))
    assert r["published"] == "2026-05-21"
    assert "拟录取名单" in r["title"]


def test_detail_extracts_body_attachments_images():
    d = parse_detail(_read("zsgz_detail.html"), "https://zsgz.njau.edu.cn/info/1007/1732.htm")
    assert d["published"] == "2026-07-08"
    assert "2027年硕士研究生招生专业进行调整优化" in d["text"]
    assert d["attachments"][0]["name"].startswith("附件1：2027年硕士研究生招生初试科目参考书目调整部分")
    assert "download.jsp" in d["attachments"][0]["url"]
    assert d["images"] and d["images"][0].startswith("https://zsgz.njau.edu.cn/__local/")


def test_catalog_programs():
    html = _read("catalog_003.html")
    header = parse_college_header(html)
    assert header["code"] == "003" and header["name"] == "资源与环境科学学院"
    assert header["intro"].startswith("学院是我国最早")

    progs = {p.code: p for p in parse_programs(html)}
    assert set(progs) == {"071300", "083001", "083002", "085700", "090301", "090302", "095132"}

    soil = progs["090301"]
    assert soil.name == "土壤学" and soil.degree_type == "学术学位" and soil.quota == "21"
    assert [s["code"] for s in soil.subjects] == ["101", "201", "314", "857"]
    assert soil.subjects[3]["name"] == "农业资源环境概论"
    assert [s["code"] for s in soil.retest_subjects] == ["0301", "0305"]
    assert "农业资源信息系统" in soil.retest and "土壤农化分析" in soil.retest
    assert len(soil.directions) == 4 and "土壤固碳减排与碳中和" in soil.directions[0]
    assert "双一流" in soil.remark

    pn = progs["090302"]
    assert [s["code"] for s in pn.subjects] == ["101", "201", "315", "857"]
    assert pn.quota == "57" and pn.retest.startswith("0307")

    assert progs["085700"].degree_type == "专业学位" and progs["085700"].name == "资源与环境"


def test_catalog_diff_detects_quota_and_subject_change():
    html = _read("catalog_003.html")
    new = {"programs": [p.to_dict() for p in parse_programs(html)], "reference_books": {}}
    old = {"programs": [dict(p) for p in new["programs"]], "reference_books": {}}
    old["programs"][4] = dict(old["programs"][4], quota="20", subjects=[
        {"code": "101", "name": "思想政治理论"},
        {"code": "201", "name": "英语（一）"},
        {"code": "315", "name": "化学（农）"},
        {"code": "857", "name": "农业资源环境概论"},
    ])
    changes = diff_catalog(old, new, {"090301", "090302"})
    assert any("拟招生人数 20 → 21" in c for c in changes)
    assert any("初试科目" in c and "314" in c for c in changes)
    assert diff_catalog(new, new, {"090301"}) == []


def test_duckduckgo_parser():
    rows = parse_duckduckgo(_read("ddg.html"))
    assert len(rows) == 10
    assert rows[0]["url"].startswith("https://www.docin.com/")
    assert "857" in rows[0]["snippet"]


def test_sogou_weixin_parser():
    rows = parse_sogou_weixin(_read("sogou_weixin.html"))
    assert rows and rows[0]["url"].startswith("https://weixin.sogou.com/link?url=")
    assert rows[0]["title"].startswith("复试关键信息|南京农业大学资源与环境科学学院0903")
    assert rows[0]["account"] == "农学考研中心"
    assert rows[0]["published"] == "2023-01-07"


def test_categorize_prefers_title():
    assert categorize("南京农业大学2026年硕士研究生招生章程", "……复试……调剂……") == "招生简章与目录"
    assert categorize("2026年资源与环境科学学院硕士研究生复试笔试考场安排") == "复试与录取"
    assert categorize("南京农业大学2026年推荐免试研究生拟录取名单") == "推免"
    assert categorize("南京农业大学2023年857农业资源环境概论考研真题（回忆版）") == "真题与资料"


def test_relevance_filters():
    rel = load_config(Path(__file__).parents[1] / "config.yaml")["relevance"]
    assert relevance_score("南京农业大学857农业资源环境概论考研真题", rel) > 0
    assert relevance_score("中国农业大学 土壤学 考研 真题", rel) == 0  # 不是南农
    assert relevance_score("南京农业大学资环学院2026年博士研究生复试通知", rel) == 0  # 排除博士


def test_storage_dedupes_and_reports_new(tmp_path):
    store = Storage(tmp_path / "t.sqlite3")
    a = Item(url="https://x/1", title="A", source_id="s", source_name="S", kind="official", published="2026-01-01")
    b = Item(url="https://weixin.sogou.com/link?token=1", title="同一篇文章", source_id="w", source_name="W", kind="weixin", dedupe_key="weixin:同一篇文章")
    b2 = Item(url="https://weixin.sogou.com/link?token=2", title="同一篇文章", source_id="w", source_name="W", kind="weixin", dedupe_key="weixin:同一篇文章")
    assert len(store.upsert_items([a, b, b2])) == 2
    assert store.upsert_items([a]) == []
    assert store.count_items() == 2
    store.save_snapshot("catalog:2026", {"year": 2026})
    assert store.load_snapshot("catalog:2026") == {"year": 2026}
    assert store.list_snapshot_keys("catalog:") == ["catalog:2026"]
