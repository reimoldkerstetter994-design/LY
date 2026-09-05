from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .utils import HttpClient, clean_text


class CollegeSiteScraper:
    """抓取资源与环境科学学院官网公开信息。"""

    def __init__(self, config: dict[str, Any], client: HttpClient | None = None):
        self.config = config
        self.client = client or HttpClient()
        college_cfg = config["sources"]["college_site"]
        self.base_url = college_cfg["base_url"]
        self.discipline_page = college_cfg["discipline_page"]

    def fetch_discipline_page(self) -> dict[str, Any]:
        url = urljoin(self.base_url, self.discipline_page)
        html = self.client.get(url)
        soup = BeautifulSoup(html, "lxml")
        title = clean_text(soup.title.get_text()) if soup.title else ""
        content_el = soup.select_one(".v_news_content, .content, .article, #content")
        content = clean_text(content_el.get_text("\n")) if content_el else clean_text(soup.get_text("\n"))

        links: list[dict[str, str]] = []
        for link in soup.find_all("a", href=True):
            text = clean_text(link.get_text())
            href = urljoin(url, link["href"])
            if any(k in text for k in ("招生", "导师", "学科", "专业", "培养", "大纲")):
                links.append({"title": text, "url": href})

        return {
            "title": title,
            "url": url,
            "content_preview": content[:3000],
            "related_links": links[:30],
        }

    def collect(self) -> dict[str, Any]:
        try:
            discipline = self.fetch_discipline_page()
            return {"discipline": discipline, "status": "ok"}
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
