from njau_are.config import GUIDES_DIR
from njau_are.scraper.official import default_scores


def test_guides_exist():
    names = sorted(p.stem for p in GUIDES_DIR.glob("*.md"))
    assert names == ["01-overview", "02-857", "03-public", "04-retest", "05-timeline"]
    for p in GUIDES_DIR.glob("*.md"):
        assert "南农" in p.read_text(encoding="utf-8") or "857" in p.read_text(encoding="utf-8")


def test_college_lines_above_national():
    scores = default_scores()
    national = next(s for s in scores if s.year == "2026" and s.program_code == "0903")
    soil = next(s for s in scores if s.program_code == "090301")
    plant = next(s for s in scores if s.program_code == "090302")
    assert soil.total > national.total
    assert plant.total > national.total
    assert soil.foreign > national.foreign
