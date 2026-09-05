from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
import yaml
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}


def load_config(path: str | Path = "config.yaml") -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def ensure_dir(path: str | Path) -> Path:
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def decode_html(content: bytes, encoding: str | None = None) -> str:
    if encoding:
        return content.decode(encoding, errors="replace")
    for enc in ("gb18030", "gbk", "utf-8"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "")
    return text.strip()


def extract_books(text: str) -> list[str]:
    books: list[str] = []
    normalized = re.sub(r"\s+", " ", text or "")
    numbered = re.findall(r"\d+\.\s*[^0-9]+?(?=\d+\.|$)", normalized)
    for item in numbered:
        item = clean_text(item)
        if item and ("《" in item or "出版社" in item or "主编" in item):
            books.append(re.sub(r"^\d+\.\s*", "", item))

    if not books:
        for match in re.finditer(r"《[^》]+》[^。；;]*[。；;]?", normalized):
            books.append(clean_text(match.group(0)))

    if not books and text:
        books = [clean_text(line) for line in text.split("\n") if "《" in line]
    return books


class HttpClient:
    def __init__(self, timeout: int = 30, delay: float = 0.5):
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.timeout = timeout
        self.delay = delay

    def get(self, url: str, encoding: str | None = None, raise_on_error: bool = True, **kwargs) -> str:
        time.sleep(self.delay)
        response = self.session.get(url, timeout=self.timeout, **kwargs)
        if raise_on_error:
            response.raise_for_status()
        elif not response.ok:
            raise requests.HTTPError(response=response)
        return decode_html(response.content, encoding)

    def get_bytes(self, url: str, **kwargs) -> bytes:
        time.sleep(self.delay)
        response = self.session.get(url, timeout=self.timeout, **kwargs)
        response.raise_for_status()
        return response.content

    def download(self, url: str, dest: Path, referer: str | None = None) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        headers = {}
        if referer:
            headers["Referer"] = referer
        time.sleep(self.delay)
        response = self.session.get(url, timeout=self.timeout, headers=headers)
        response.raise_for_status()
        dest.write_bytes(response.content)
        return dest


def parse_article(html: str, page_url: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    title_el = soup.select_one("h1, .article-title, .title")
    title = clean_text(title_el.get_text()) if title_el else ""
    content_el = (
        soup.select_one(".v_news_content")
        or soup.select_one("#vsb_content")
        or soup.select_one(".article")
        or soup.select_one(".content")
    )
    content = clean_text(content_el.get_text("\n")) if content_el else ""
    date_el = soup.select_one(".time, .date, .article-time")
    published_at = clean_text(date_el.get_text()) if date_el else ""

    attachments: list[dict[str, str]] = []
    for link in soup.find_all("a", href=True):
        href = link["href"]
        text = clean_text(link.get_text())
        if (
            "DownloadAttachUrl" in href
            or href.lower().endswith((".pdf", ".xls", ".xlsx", ".doc", ".docx", ".zip"))
            or "附件" in text
        ):
            attachments.append(
                {
                    "title": text or Path(href).name,
                    "url": urljoin(page_url, href),
                }
            )

    return {
        "title": title,
        "url": page_url,
        "published_at": published_at,
        "content": content,
        "attachments": attachments,
    }


def save_json(data: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
