from __future__ import annotations

from bs4 import BeautifulSoup

from nau_kaoyan.config import DISCIPLINE_URL
from nau_kaoyan.http_client import Fetcher
from nau_kaoyan.models import SourceHit, utc_now


def scrape_discipline(fetcher: Fetcher) -> tuple[dict, list[SourceHit]]:
    try:
        html, status = fetcher.get_text(DISCIPLINE_URL)
        ok = status == 200
        hit = SourceHit("discipline", DISCIPLINE_URL, utc_now(), ok, f"HTTP {status}")
        if not ok:
            return {}, [hit]
        soup = BeautifulSoup(html, "lxml")
        body = soup.select_one(".v_news_content") or soup.select_one("#vsb_content")
        if body is None:
            # college static page: main column
            body = soup.select_one(".listmain") or soup
        paragraphs = [p.get_text(" ", strip=True) for p in body.find_all(["p", "div", "li"]) if p.get_text(strip=True)]
        intro = ""
        directions: list[str] = []
        current_dir = ""
        for para in paragraphs:
            if para.startswith("►") or para.endswith("研究方向"):
                current_dir = para.lstrip("► ").strip()
                directions.append(current_dir)
            elif current_dir and 2 <= len(para) <= 40 and "友情链接" not in para:
                directions.append(f"{current_dir} · {para}")
            elif "本学科" in para and not intro:
                intro = para
        if not intro:
            text = body.get_text("\n", strip=True)
            intro = next((ln for ln in text.split("\n") if "本学科" in ln), text[:500])
        # unique keep order
        seen = set()
        clean_dirs = []
        for d in directions:
            if d not in seen and "友情" not in d and "网站首页" not in d:
                seen.add(d)
                clean_dirs.append(d)
        return {
            "title": "农业资源与环境",
            "url": DISCIPLINE_URL,
            "intro": intro[:1200],
            "directions": clean_dirs[:40],
            "tags": ["双一流", "一级重点学科", "A+", "ESI 前1‰支撑学科"],
        }, [hit]
    except Exception as exc:  # noqa: BLE001
        return {}, [SourceHit("discipline", DISCIPLINE_URL, utc_now(), False, str(exc))]
