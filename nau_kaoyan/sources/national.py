from __future__ import annotations

import re

from bs4 import BeautifulSoup

from nau_kaoyan.config import CHSI_NATIONAL_LINE_CANDIDATES
from nau_kaoyan.http_client import Fetcher
from nau_kaoyan.models import SourceHit, utc_now

# 教育部已公布的农学门类国家线（A类），仅作文档对照；实时抓取成功后会被覆盖。
FALLBACK_LINES = [
    {
        "year": "2026",
        "category": "农学[09] 学术学位 A类",
        "total": 240,
        "politics_or_100": 33,
        "major_gt_100": 50,
        "source": "https://yz.chsi.com.cn/kyzx/kp/202602/20260228/2293449093.html",
        "note": "江苏属一区，南农执行国家线或在此基础上划院线，以当年复试办法为准。",
    },
    {
        "year": "2025",
        "category": "农学[09] 学术学位 A类",
        "total": 245,
        "politics_or_100": 33,
        "major_gt_100": 50,
        "source": "https://yz.chsi.com.cn/",
        "note": "历史对照。",
    },
    {
        "year": "2024",
        "category": "农学[09] 学术学位 A类",
        "total": 251,
        "politics_or_100": 33,
        "major_gt_100": 50,
        "source": "https://yz.chsi.com.cn/",
        "note": "历史对照。",
    },
]


def scrape_national_lines(fetcher: Fetcher) -> tuple[list[dict], list[SourceHit]]:
    hits: list[SourceHit] = []
    parsed: list[dict] = []
    for url in CHSI_NATIONAL_LINE_CANDIDATES:
        try:
            html, status = fetcher.get_text(url)
            ok = status == 200
            hits.append(SourceHit("chsi", url, utc_now(), ok, f"HTTP {status}"))
            if not ok:
                continue
            found = _parse_agriculture_line(html, url)
            if found:
                parsed.extend(found)
                break
        except Exception as exc:  # noqa: BLE001
            hits.append(SourceHit("chsi", url, utc_now(), False, str(exc)))
    if parsed:
        return parsed, hits
    return FALLBACK_LINES, hits


def _parse_agriculture_line(html: str, url: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)
    year_m = re.search(r"(20\d{2})年", soup.title.get_text() if soup.title else text[:80])
    year = year_m.group(1) if year_m else ""
    # look for 农学 row like 240 33 50
    m = re.search(r"农学\[?09\]?[^\d]{0,40}?(\d{3})\s+(\d{2})\s+(\d{2,3})", text)
    if not m:
        return []
    return [
        {
            "year": year or "最新",
            "category": "农学[09] 学术学位 A类",
            "total": int(m.group(1)),
            "politics_or_100": int(m.group(2)),
            "major_gt_100": int(m.group(3)),
            "source": url,
            "note": "来自中国研究生招生信息网公开页面，院线以学校复试办法为准。",
        }
    ]
