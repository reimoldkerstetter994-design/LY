from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .utils import HttpClient, clean_text, parse_article


class AdmissionNewsScraper:
    """抓取研究生院官网硕士招生通知与附件。"""

    def __init__(self, config: dict[str, Any], client: HttpClient | None = None):
        self.config = config
        self.client = client or HttpClient()
        self.base_url = config["sources"]["official_admission"]["base_url"]
        self.keywords = config["keywords"]["news"]
        self.attachment_keywords = config["keywords"]["attachments"]

    def list_news(self, max_pages: int = 5) -> list[dict[str, str]]:
        items: list[dict[str, str]] = []
        seen: set[str] = set()
        list_template = self.config["sources"]["official_admission"]["news_list"]

        for page in range(1, max_pages + 1):
            page_url = list_template.format(page=page)
            try:
                html = self.client.get(page_url)
            except Exception:
                break
            soup = BeautifulSoup(html, "lxml")
            for link in soup.select("li a[href], .list a[href], .news-list a[href]"):
                title = clean_text(link.get_text())
                href = link.get("href", "")
                if not title or not href or "info/" not in href:
                    continue
                if not any(k in title for k in self.keywords):
                    continue
                full_url = urljoin(page_url, href)
                if full_url in seen:
                    continue
                seen.add(full_url)
                items.append({"title": title, "url": full_url})
        return items

    def fetch_article(self, url: str) -> dict[str, Any]:
        html = self.client.get(url)
        return parse_article(html, url)

    def fetch_key_pages(self) -> list[dict[str, Any]]:
        pages = [
            self.config["sources"]["official_admission"]["charter_url"],
            self.config["sources"]["official_admission"]["reexam_policy_url"],
            self.config["sources"]["official_admission"]["catalog_page"],
        ]
        return [self.fetch_article(url) for url in pages]

    def filter_relevant_attachments(self, articles: list[dict[str, Any]]) -> list[dict[str, str]]:
        attachments: list[dict[str, str]] = []
        seen: set[str] = set()
        for article in articles:
            for att in article.get("attachments", []):
                title = str(att.get("title", ""))
                url = att.get("url", "")
                if not url or url in seen:
                    continue
                if any(str(k) in title for k in self.attachment_keywords):
                    seen.add(url)
                    attachments.append(
                        {
                            "title": title,
                            "url": url,
                            "source_article": article.get("title", ""),
                        }
                    )
        return attachments

    def collect(self, max_pages: int = 5, fetch_content: bool = True) -> dict[str, Any]:
        news_items = self.list_news(max_pages=max_pages)
        articles: list[dict[str, Any]] = []
        if fetch_content:
            for item in news_items:
                try:
                    article = self.fetch_article(item["url"])
                    article["list_title"] = item["title"]
                    articles.append(article)
                except Exception as exc:
                    articles.append({**item, "error": str(exc)})

        key_pages = self.fetch_key_pages()
        all_articles = articles + key_pages
        return {
            "news_count": len(news_items),
            "articles": all_articles,
            "relevant_attachments": self.filter_relevant_attachments(all_articles),
        }
