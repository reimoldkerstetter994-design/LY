import unittest
from datetime import datetime

from scraper.scheduler import next_run_at, parse_hhmm


class SchedulerTests(unittest.TestCase):
    def test_parse_hhmm(self):
        self.assertEqual(parse_hhmm("08:00"), (8, 0))
        self.assertEqual(parse_hhmm("23:59"), (23, 59))

    def test_next_run_same_day(self):
        now = datetime(2026, 9, 5, 7, 0, 0)
        self.assertEqual(next_run_at(8, 0, now), datetime(2026, 9, 5, 8, 0, 0))

    def test_next_run_next_day(self):
        now = datetime(2026, 9, 5, 8, 0, 1)
        self.assertEqual(next_run_at(8, 0, now), datetime(2026, 9, 6, 8, 0, 0))


if __name__ == "__main__":
    unittest.main()
