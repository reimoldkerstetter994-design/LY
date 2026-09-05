from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.config import ARE_KEYWORDS, SCHOOLWIDE_NOTICE_KEYWORDS


@dataclass
class NoticeStub:
    title: str
    url: str
    published_at: str
    summary: str
    source: str


@dataclass
class NoticeDetail:
    title: str
    url: str
    published_at: str
    body: str
    attachments: list[tuple[str, str]]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def relevance_for(title: str, text: str = "") -> tuple[bool, str]:
    blob = f"{title} {text}"
    if any(k in blob for k in ARE_KEYWORDS):
        return True, "are"
    if any(k in blob for k in SCHOOLWIDE_NOTICE_KEYWORDS):
        return True, "school"
    return False, "general"


def parse_notice_list(html: str, page_url: str, source: str = "南农研招网") -> list[NoticeStub]:
    soup = BeautifulSoup(html, "lxml")
    items: list[NoticeStub] = []
    for block in soup.select("ul.wz-ul li"):
        link = block.select_one("a[href]")
        if not link:
            continue
        title = _clean(link.get_text())
        href = urljoin(page_url, link["href"])
        date_el = block.select_one(".wz-ul-date")
        published = ""
        if date_el:
            bits = [t.strip() for t in date_el.stripped_strings]
            if len(bits) >= 2:
                published = f"{bits[-1]}-{bits[0]}"
            elif bits:
                published = bits[0]
        summary_el = block.select_one(".wz-ul-p")
        items.append(
            NoticeStub(
                title=title,
                url=href,
                published_at=published,
                summary=_clean(summary_el.get_text()) if summary_el else "",
                source=source,
            )
        )
    if items:
        return items
    for link in soup.select("a[href*='/info/']"):
        title = _clean(link.get_text())
        if len(title) < 6:
            continue
        items.append(
            NoticeStub(
                title=title,
                url=urljoin(page_url, link["href"]),
                published_at="",
                summary="",
                source=source,
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


def parse_notice_detail(html: str, page_url: str) -> NoticeDetail:
    soup = BeautifulSoup(html, "lxml")
    title_el = soup.select_one("h1, .tit, .article-tit")
    title = _clean(title_el.get_text()) if title_el else _clean(soup.title.get_text() if soup.title else "")
    date_match = re.search(r"发布时间[:：]?\s*(\d{4}-\d{2}-\d{2})", soup.get_text(" ", strip=True))
    published = date_match.group(1) if date_match else ""
    content = soup.select_one(".v_news_content") or soup.select_one("form[name='_newscontent_fromname']")
    body = _clean(content.get_text("\n", strip=True)) if content else ""
    if len(body) > 12000:
        body = body[:12000] + "…"
    attachments: list[tuple[str, str]] = []
    for anchor in soup.select("a[href*='DownloadAttachUrl'], a[href*='download.jsp']"):
        name = _clean(anchor.get_text()) or "附件"
        attachments.append((name, urljoin(page_url, anchor["href"])))
    return NoticeDetail(
        title=title,
        url=page_url,
        published_at=published,
        body=body,
        attachments=attachments,
    )


def parse_plain_page(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer"]):
        tag.decompose()
    content = soup.select_one(".v_news_content") or soup.select_one(".content") or soup.body
    text = content.get_text("\n", strip=True) if content else ""
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:16000]


def is_are_attachment(name: str) -> bool:
    return any(k in name for k in ("资源与环境", "资环", "土壤", "植物营养", "农业资源"))
