from pathlib import Path

from app.sources.catalog import parse_catalog_html, parse_subject_books
from app.sources.notices import parse_notice_list, relevance_for

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_catalog_academic_masters():
    html = (FIXTURES / "zsml003.html").read_text(encoding="utf-8", errors="replace")
    programs = parse_catalog_html(html)
    by_code = {p.code: p for p in programs}
    soil = by_code["090301"]
    plant = by_code["090302"]
    assert soil.name == "土壤学"
    assert plant.name == "植物营养学"
    assert soil.degree_type == "学术型硕士"
    assert plant.degree_type == "学术型硕士"
    assert soil.planned_seats == "21"
    assert plant.planned_seats == "57"
    soil_codes = [s.code for s in soil.subjects if s.stage == "初试"]
    plant_codes = [s.code for s in plant.subjects if s.stage == "初试"]
    assert soil_codes == ["101", "201", "314", "857"]
    assert plant_codes == ["101", "201", "315", "857"]
    assert {s.code for s in soil.subjects if s.stage == "复试"} == {"0301", "0305"}
    assert {s.code for s in plant.subjects if s.stage == "复试"} == {"0307"}
    assert any("固碳减排" in d for d in soil.directions)
    assert any("新型肥料" in d for d in plant.directions)


def test_parse_subject_857_books():
    html = (FIXTURES / "subject_857.html").read_text(encoding="utf-8")
    books = parse_subject_books(html)
    assert "土壤学" in books
    assert "徐建明" in books
    assert "植物生理学" in books
    assert "武维华" in books


def test_notice_relevance():
    assert relevance_for("资源与环境科学学院2026年复试细则")[1] == "are"
    assert relevance_for("南京农业大学2026年硕士研究生招生章程")[1] == "school"
    assert relevance_for("食堂开放通知")[1] == "general"


def test_are_attachment_flag():
    from app.sources.notices import is_are_attachment

    assert is_are_attachment("003资源与环境科学学院2026年复试细则.pdf")
    assert not is_are_attachment("001农学院2026年硕士研究生复试录取工作细则.pdf")


def test_parse_notice_list_items():
    html = """
    <ul class="wz-ul">
      <li class="clearfix">
        <div class="wz-ul-date"><span>07-08</span><br>2026</div>
        <div class="wz-ul-right">
          <div class="wz-ul-tt"><a href="../../info/1007/1732.htm">南京农业大学关于2027年硕士研究生招生考试专业目录的预通知</a></div>
          <div class="wz-ul-p">其余专业请暂时参考2026年招生目录</div>
        </div>
      </li>
    </ul>
    """
    items = parse_notice_list(html, "https://zsgz.njau.edu.cn/zsxx/sszs/sszxtz.htm")
    assert len(items) == 1
    assert items[0].title.startswith("南京农业大学关于2027年")
    assert items[0].url.endswith("/info/1007/1732.htm")
    assert items[0].published_at == "2026-07-08"
