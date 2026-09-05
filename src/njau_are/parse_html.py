from __future__ import annotations

import html as html_lib
import re
from urllib.parse import urljoin

from njau_are.config import is_relevant_attachment, is_relevant_notice
from njau_are.models import Attachment, Notice

_TAG_RE = re.compile(r"<[^>]+>")
_ZSGZ_ITEM_RE = re.compile(
    r'<li class="clearfix[^"]*"[\s\S]*?'
    r'<div class="pull-left wz-ul-date"><span>([^<]+)</span><br>\s*(\d{4})</div>'
    r'[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)</a>'
    r'[\s\S]*?<div class="wz-ul-p[^"]*">([\s\S]*?)</div>',
    re.I,
)
_COLLEGE_ITEM_RE = re.compile(
    r'<li>\s*<span>\s*(\d{4}-\d{2}-\d{2})\s*</span>\s*'
    r'<a href="([^"]+)"[^>]*>([\s\S]*?)</a>',
    re.I,
)
_INFO_LINK_RE = re.compile(
    r'<a[^>]+href="([^"]*info/\d+/\d+\.htm)"[^>]*>([\s\S]*?)</a>',
    re.I,
)
_ATTACH_RE = re.compile(
    r'<a[^>]+href="([^"]*(?:download\.jsp|DownloadAttachUrl)[^"]*)"[^>]*>([\s\S]*?)</a>',
    re.I,
)
_TITLE_RE = re.compile(r"<title>([^<]+)</title>", re.I)
_PUBLISHED_RE = re.compile(r"发布时间[:：]\s*(\d{4}-\d{2}-\d{2})")
_META_DESC_RE = re.compile(
    r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']',
    re.I,
)
_BODY_RE = re.compile(
    r'<div[^>]+class="[^"]*v_news_content[^"]*"[^>]*>([\s\S]*?)</div>',
    re.I,
)
_SCRIPT_RE = re.compile(r"<(script|style)[\s\S]*?</\1>", re.I)
_PAGER_RE = re.compile(r"共(\d+)条")


def _clean(text: str) -> str:
    text = html_lib.unescape(text or "")
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = _TAG_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_date(month_day: str, year: str) -> str:
    parts = re.split(r"[-./]", month_day.strip())
    if len(parts) != 2:
        return f"{year}-{month_day}"
    return f"{year}-{int(parts[0]):02d}-{int(parts[1]):02d}"


def parse_zsgz_list(html: str, page_url: str, source: str = "南农研招网") -> list[Notice]:
    notices: list[Notice] = []
    for month_day, year, href, title_html, summary_html in _ZSGZ_ITEM_RE.findall(html):
        title = _clean(title_html)
        summary = _clean(summary_html)
        notices.append(
            Notice(
                title=title,
                url=urljoin(page_url, href),
                published=_normalize_date(month_day, year),
                source=source,
                summary=summary[:400],
                relevant=is_relevant_notice(title, summary),
            )
        )
    if notices:
        return notices
    # Fallback for simpler list pages (简章目录 / 录取公示).
    seen: set[str] = set()
    for href, title_html in _INFO_LINK_RE.findall(html):
        title = _clean(title_html)
        url = urljoin(page_url, href)
        if not title or url in seen:
            continue
        seen.add(url)
        notices.append(
            Notice(
                title=title,
                url=url,
                source=source,
                relevant=is_relevant_notice(title),
            )
        )
    return notices


def parse_college_list(html: str, page_url: str, source: str = "资环学院") -> list[Notice]:
    notices: list[Notice] = []
    for published, href, title_html in _COLLEGE_ITEM_RE.findall(html):
        title = _clean(title_html)
        notices.append(
            Notice(
                title=title,
                url=urljoin(page_url, href),
                published=published,
                source=source,
                relevant=is_relevant_notice(title),
            )
        )
    if notices:
        return notices
    seen: set[str] = set()
    for href, title_html in _INFO_LINK_RE.findall(html):
        title = _clean(title_html)
        url = urljoin(page_url, href)
        if not title or url in seen:
            continue
        seen.add(url)
        notices.append(
            Notice(
                title=title,
                url=url,
                source=source,
                relevant=is_relevant_notice(title),
            )
        )
    return notices


def parse_article(html: str, url: str, source: str = "") -> Notice:
    title = _clean(_TITLE_RE.search(html).group(1) if _TITLE_RE.search(html) else "")
    title = re.sub(r"-南京农业大学.*$", "", title).strip(" -")
    published = _PUBLISHED_RE.search(html)
    stripped = _SCRIPT_RE.sub(" ", html)
    summary = ""
    meta = _META_DESC_RE.search(html)
    if meta:
        summary = _clean(meta.group(1))
    body = _BODY_RE.search(stripped)
    if body:
        body_text = _clean(body.group(1))
        if len(body_text) > len(summary):
            summary = body_text
    summary = summary[:500]
    attachments = []
    for href, name_html in _ATTACH_RE.findall(html):
        name = _clean(name_html) or href
        if "附件" in name or name.lower().endswith((".pdf", ".xls", ".xlsx", ".doc", ".docx")):
            relevant = is_relevant_attachment(name, title)
            attachments.append(
                Attachment(name=name, url=urljoin(url, href), relevant=relevant)
            )
    return Notice(
        title=title or url,
        url=url,
        published=published.group(1) if published else "",
        source=source,
        summary=summary,
        attachments=attachments,
        relevant=is_relevant_notice(title, summary),
    )


def pager_total(html: str) -> int | None:
    match = _PAGER_RE.search(html)
    return int(match.group(1)) if match else None


def list_page_urls(base_url: str, html: str, max_pages: int = 6) -> list[str]:
    """Visual SiteBuilder list pages: foo.htm, foo/2.htm, foo/3.htm, ..."""
    total = pager_total(html) or 0
    # Keep the crawl bounded; notices are also filtered by keyword.
    estimated = min(max_pages, max(1, (total + 14) // 15)) if total else 1
    if estimated <= 1:
        return [base_url]
    stem = re.sub(r"\.htm$", "", base_url)
    urls = [base_url]
    for page in range(2, estimated + 1):
        urls.append(f"{stem}/{page}.htm")
    return urls
