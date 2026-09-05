from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.config import ARE_KEYWORDS
from app.sources.notices import NoticeStub, relevance_for


def parse_college_news(html: str, page_url: str) -> list[NoticeStub]:
    soup = BeautifulSoup(html, "lxml")
    items: list[NoticeStub] = []
    for link in soup.select("a[href*='/info/']"):
        title = re.sub(r"\s+", " ", link.get("title") or link.get_text()).strip()
        if len(title) < 8:
            continue
        href = urljoin(page_url, link["href"])
        relevant, _kind = relevance_for(title)
        if not relevant and not any(k in title for k in ARE_KEYWORDS + ("硕士", "研究生", "招生", "复试", "推免")):
            continue
        items.append(
            NoticeStub(
                title=title,
                url=href,
                published_at="",
                summary="",
                source="资环学院",
            )
        )
    seen: set[str] = set()
    unique: list[NoticeStub] = []
    for item in items:
        if item.url in seen:
            continue
        seen.add(item.url)
        unique.append(item)
    return unique
