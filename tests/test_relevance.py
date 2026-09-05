from njau_are.config import is_relevant_attachment, is_relevant_notice


def test_notice_keywords():
    assert is_relevant_notice("南京农业大学2026年硕士研究生招生专业目录")
    assert is_relevant_notice("南农资环学院2026级硕士研究生拟录取名单")


def test_attachment_does_not_keep_other_colleges():
    title = "南京农业大学2026年硕士研究生复试录取工作办法"
    assert is_relevant_attachment("003资源与环境科学学院2026年复试细则.pdf", title)
    assert not is_relevant_attachment("001农学院2026年硕士研究生复试录取工作细则.pdf", title)
