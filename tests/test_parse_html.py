from pathlib import Path

from njau_are.parse_html import parse_article, parse_zsgz_list

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_zsgz_notice_list():
    html = (FIXTURES / "zsgz_list.html").read_text(encoding="utf-8")
    notices = parse_zsgz_list(html, "https://zsgz.njau.edu.cn/zsxx/sszs/sszxtz.htm")
    assert len(notices) == 2
    assert notices[0].published == "2026-07-08"
    assert "2027年硕士研究生招生考试专业目录" in notices[0].title
    assert notices[0].url.endswith("info/1007/1732.htm")
    assert notices[1].title == "严正声明"


def test_parse_article_attachments():
    html = (FIXTURES / "article.html").read_text(encoding="utf-8")
    notice = parse_article(html, "https://re.njau.edu.cn/info/1078/12613.htm", "资环学院")
    assert "拟录取名单" in notice.title
    assert notice.published == "2026-05-21"
    assert notice.attachments
    assert notice.attachments[0].name.endswith(".pdf")
    assert "download.jsp" in notice.attachments[0].url
