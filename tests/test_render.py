from njau_are.models import (
    CollegeSnapshot,
    ExamSubject,
    Program,
    ResearchDirection,
    ScrapeReport,
)
from njau_are.render import render_html, render_markdown


def _sample_report() -> ScrapeReport:
    return ScrapeReport(
        scraped_at="2026-09-05T12:00:00+08:00",
        catalog_years=[2026, 2025],
        college=[
            CollegeSnapshot(
                year=2026,
                college_code="003",
                college_name="资源与环境科学学院",
                planned_quota=280,
                intro="学院简介",
                phone="025-84395620",
                source_url="https://example.test",
            )
        ],
        programs=[
            Program(
                year=2026,
                college_code="003",
                college_name="资源与环境科学学院",
                major_code="090301",
                major_name="土壤学",
                degree_type="学硕",
                planned_quota=21,
                directions=[ResearchDirection("01", "土壤固碳减排与碳中和")],
                initial_subjects=[
                    ExamSubject("857", "农业资源环境概论", "initial"),
                ],
                retest_subjects=[ExamSubject("0307", "植物营养学", "retest")],
                notes="国家重点学科",
                source_url="https://example.test",
                category="core",
            )
        ],
        notices=[],
        subjects=[
            ExamSubject(
                "857",
                "农业资源环境概论",
                "initial",
                url="https://example.test/857",
                reference_books="《土壤学》",
            )
        ],
        errors=[],
        sources=["https://zsgz.njau.edu.cn/"],
    )


def test_markdown_mentions_core_major():
    text = render_markdown(_sample_report())
    assert "090301" in text
    assert "土壤学" in text
    assert "不含真题" in text


def test_html_dashboard_contains_core_major():
    html = render_html(_sample_report())
    assert "090301" in html
    assert "农业资源环境概论" in html
    assert "lang=\"zh-CN\"" in html
