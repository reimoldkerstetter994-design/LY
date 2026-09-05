from pathlib import Path

from njau_are.scraper.parse import parse_catalog_html, parse_subject_html, parse_subject_tokens

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_catalog_academic_masters():
    html = (FIXTURES / "catalog_college003.html").read_text(encoding="utf-8", errors="ignore")
    programs = parse_catalog_html(html, year="2026")
    by_code = {p["code"]: p for p in programs}

    assert "090301" in by_code
    assert "090302" in by_code
    soil = by_code["090301"]
    assert soil["name"] == "土壤学"
    assert soil["degree_type"] == "学术学位"
    assert soil["planned"] == 21
    init_codes = [s["code"] for s in soil["initial_subjects"]]
    assert init_codes == ["101", "201", "314", "857"]
    retest_codes = [s["code"] for s in soil["retest_subjects"]]
    assert "0301" in retest_codes and "0305" in retest_codes
    assert any("固碳" in d["name"] for d in soil["directions"])

    plant = by_code["090302"]
    assert plant["name"] == "植物营养学"
    assert plant["planned"] == 57
    assert [s["code"] for s in plant["initial_subjects"]] == ["101", "201", "315", "857"]
    assert plant["retest_subjects"][0]["code"] == "0307"

    assert by_code["085700"]["degree_type"] == "专业学位"


def test_parse_857_books():
    html = (FIXTURES / "subject_857.html").read_text(encoding="utf-8", errors="ignore")
    rec = parse_subject_html(html, "857", url="https://example.test/857")
    assert rec["name"] == "农业资源环境概论"
    assert "徐建明" in rec["books"]
    assert "鞠美庭" in rec["books"]
    assert "沈萍" in rec["books"]
    assert "武维华" in rec["books"]


def test_parse_subject_tokens_or():
    blob = "①101 思想政治理论②201 英语（一）③314 数学（农）④857 农业资源环境概论\n复试科目:0301 农业资源信息系统或0305 土壤农化分析"
    initial, retest = parse_subject_tokens(blob)
    assert [s["code"] for s in initial] == ["101", "201", "314", "857"]
    assert [s["code"] for s in retest] == ["0301", "0305"]
