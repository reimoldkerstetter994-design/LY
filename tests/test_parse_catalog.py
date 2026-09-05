from pathlib import Path

from njau_are.parse_catalog import parse_catalog_html, parse_subject_page

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_2026_college_catalog_core_programs():
    html = (FIXTURES / "catalog_2026_college003.html").read_text(encoding="utf-8")
    college, programs = parse_catalog_html(html, 2026, "https://example.test/catalog")
    assert college is not None
    assert college.college_code == "003"
    assert college.planned_quota == 280
    assert college.phone == "025-84395620"

    by_code = {p.major_code: p for p in programs}
    soil = by_code["090301"]
    plant = by_code["090302"]

    assert soil.major_name == "土壤学"
    assert soil.degree_type == "学硕"
    assert soil.category == "core"
    assert soil.planned_quota == 21
    assert [d.name for d in soil.directions] == [
        "土壤固碳减排与碳中和",
        "土壤生物与生态",
        "土壤污染控制与修复",
        "土壤资源环境遥感及信息技术",
    ]
    assert [s.code for s in soil.initial_subjects] == ["101", "201", "314", "857"]
    assert [s.code for s in soil.retest_subjects] == ["0301", "0305"]

    assert plant.major_name == "植物营养学"
    assert plant.planned_quota == 57
    assert [s.code for s in plant.initial_subjects] == ["101", "201", "315", "857"]
    assert [s.code for s in plant.retest_subjects] == ["0307"]
    assert by_code["085700"].category == "related_professional"
    assert by_code["071300"].category == "related_academic"


def test_parse_subject_reference_books():
    html = (FIXTURES / "subject_857.html").read_text(encoding="utf-8")
    subject = parse_subject_page(html, "857", "https://example.test/857")
    assert subject.name == "农业资源环境概论"
    assert "土壤学" in subject.reference_books
    assert "植物生理学" in subject.reference_books
    assert subject.kind == "initial"
