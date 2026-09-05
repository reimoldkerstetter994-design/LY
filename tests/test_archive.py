import unittest

from scraper.archive import detect_changes


class ArchiveTests(unittest.TestCase):
    def test_first_snapshot(self):
        current = {"related_news": [{"title": "招生章程"}]}
        changes = detect_changes(None, current)
        self.assertTrue(any("首次抓取" in item for item in changes))

    def test_new_notice(self):
        previous = {"related_news": [{"title": "旧通知"}]}
        current = {"related_news": [{"title": "旧通知"}, {"title": "2026复试办法"}]}
        changes = detect_changes(previous, current)
        self.assertTrue(any("2026复试办法" in item for item in changes))

    def test_quota_change(self):
        previous = {"catalog": {"majors": [{"code": "090301", "name": "土壤学", "planned_quota": "21"}]}}
        current = {"catalog": {"majors": [{"code": "090301", "name": "土壤学", "planned_quota": "25"}]}}
        changes = detect_changes(previous, current)
        self.assertTrue(any("21 → 25" in item for item in changes))


if __name__ == "__main__":
    unittest.main()
