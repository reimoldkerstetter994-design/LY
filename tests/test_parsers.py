from pathlib import Path

import pytest

from nau_kaoyan.sources.catalog import parse_programs, target_programs
from nau_kaoyan.sources.news import is_relevant, parse_list_page
from nau_kaoyan.sources.subjects import parse_subject_page
from nau_kaoyan.models import ExamSubject

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_catalog_target_academic_masters():
    html = (FIXTURES / "zsml_003.html").read_text(encoding="utf-8", errors="ignore")
    programs = parse_programs(html, "2026", "https://yzglxt.njau.edu.cn/gts2026/zsmlgl/zsml_ss_default.aspx")
    codes = {p.code: p for p in programs}
    assert "090301" in codes
    assert "090302" in codes
    soil = codes["090301"]
    plant = codes["090302"]
    assert soil.name.startswith("土壤学")
    assert plant.name.startswith("植物营养学")
    assert soil.degree_type == "学术学位"
    assert plant.degree_type == "学术学位"
    assert soil.planned == "21"
    assert plant.planned == "57"
    assert any("固碳" in d for d in soil.directions)
    assert any(s.code == "314" for s in soil.initial_subjects)
    assert any(s.code == "857" for s in soil.initial_subjects)
    assert any(s.code == "315" for s in plant.initial_subjects)
    assert any(s.code == "0307" for s in plant.retest_subjects)
    targets = target_programs(programs)
    assert {p.code for p in targets} == {"090301", "090302"}
    # 专硕应被标出来但不是目标学硕
    assert any(p.code == "085700" and p.degree_type == "专业学位" for p in programs)


def test_parse_857_reference_books():
    html = (FIXTURES / "kmdm_857.html").read_text(encoding="utf-8", errors="ignore")
    subject = parse_subject_page(html, ExamSubject(code="857", name="农业资源环境概论", kind="初试"))
    joined = " ".join(subject.books)
    assert "土壤学" in joined
    assert "徐建明" in joined
    assert "植物生理学" in joined
    assert len(subject.books) >= 3


def test_parse_zsgz_news_list():
    html = (FIXTURES / "sszxtz.html").read_text(encoding="utf-8", errors="ignore")
    items = parse_list_page(html, "https://zsgz.njau.edu.cn/zsxx/sszs/sszxtz.htm", "硕士最新通知", "zsgz")
    titles = [i.title for i in items]
    assert any("2027年硕士研究生招生考试专业目录的预通知" in t for t in titles)
    assert any(i.date.startswith("2026-07-08") or i.date.startswith("2026-07") for i in items)
    assert is_relevant("南京农业大学2026年硕士研究生招生专业目录")
    assert is_relevant("资源与环境科学学院2027年免试研究生推荐办法")
    assert not is_relevant("食堂菜谱更新通知")
    assert not is_relevant("资环学院关于2026-2027学年本科生“瑞华春雨助学金”拟推荐名单的公示")
