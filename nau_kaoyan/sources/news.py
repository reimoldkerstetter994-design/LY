from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from nau_kaoyan.config import KEYWORDS, MAX_ARTICLE_FETCH, NEWS_LISTS, UNDERGRAD_NOISE
from nau_kaoyan.http_client import Fetcher
from nau_kaoyan.models import NewsItem, SourceHit, utc_now

SKIP_TITLES = {"更多", "首页", "下页", "上页", "尾页", "跳转"}


def is_relevant(title: str, summary: str = "") -> bool:
    blob = f"{title} {summary}"
    if any(k in blob for k in UNDERGRAD_NOISE) and not any(
        k in blob for k in ("硕士", "研究生", "复试", "推免", "招生目录")
    ):
        return False
    return any(k in blob for k in KEYWORDS)


def parse_list_page(html: str, page_url: str, list_name: str, source: str) -> list[NewsItem]:
    soup = BeautifulSoup(html, "lxml")
    items: list[NewsItem] = []
    seen: set[str] = set()

    for li in soup.select("li"):
        a = li.find("a", href=True)
        if a is None:
            continue
        href = a["href"].strip()
        title = a.get_text(" ", strip=True)
        if not title or title in SKIP_TITLES:
            continue
        if "info/" not in href and not href.endswith(".htm"):
            continue
        if any(skip in href for skip in ["/css/", "/js/", "index.htm", "sszs.htm"]):
            continue
        url = urljoin(page_url, href)
        if url in seen or url == page_url:
            continue
        if not re.search(r"/info/\d+/\d+", url):
            continue
        seen.add(url)
        date = _extract_date(li)
        summary_el = li.select_one(".wz-ul-p") or li.select_one(".txt-elise")
        summary = ""
        if summary_el and summary_el != a:
            summary = summary_el.get_text(" ", strip=True)
        items.append(
            NewsItem(
                title=title,
                url=url,
                date=date,
                summary=summary[:300],
                source=source,
                list_name=list_name,
                relevant=is_relevant(title, summary),
            )
        )

    if not items:
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if not re.search(r"/info/\d+/\d+", href):
                continue
            title = a.get_text(" ", strip=True)
            if not title or title in SKIP_TITLES:
                continue
            url = urljoin(page_url, href)
            if url in seen:
                continue
            seen.add(url)
            items.append(
                NewsItem(
                    title=title,
                    url=url,
                    date="",
                    summary="",
                    source=source,
                    list_name=list_name,
                    relevant=is_relevant(title),
                )
            )
    return items


def _extract_date(li) -> str:
    date_el = li.select_one(".wz-ul-date")
    if date_el:
        parts = [p.strip() for p in date_el.get_text(" ", strip=True).split() if p.strip()]
        md = next((p for p in parts if re.match(r"\d{1,2}-\d{1,2}", p)), "")
        year = next((p for p in parts if re.match(r"20\d{2}$", p)), "")
        if md and year:
            return f"{year}-{md}"
        return " ".join(parts)
    text = li.get_text(" ", strip=True)
    match = re.search(r"(20\d{2}-\d{1,2}-\d{1,2})", text)
    if match:
        return match.group(1)
    match = re.search(r"(20\d{2}-\d{1,2})", text)
    return match.group(1) if match else ""


def parse_article(html: str, item: NewsItem) -> NewsItem:
    soup = BeautifulSoup(html, "lxml")
    body_el = soup.select_one(".v_news_content") or soup.select_one("#vsb_content") or soup.select_one(".content")
    if body_el:
        text = body_el.get_text("\n", strip=True)
        item.body = re.sub(r"\n{3,}", "\n\n", text)[:6000]
        if not item.summary:
            item.summary = re.sub(r"\s+", " ", text)[:280]
        for a in body_el.find_all("a", href=True):
            href = a["href"]
            if any(href.lower().endswith(ext) or "DownloadAttach" in href or "download.jsp" in href for ext in (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip")):
                item.attachments.append({"name": a.get_text(" ", strip=True) or href, "url": urljoin(item.url, href)})
    if not item.date:
        meta = soup.get_text(" ", strip=True)
        match = re.search(r"发布时间[:：]\s*(20\d{2}-\d{1,2}-\d{1,2})", meta)
        if match:
            item.date = match.group(1)
    item.relevant = item.relevant or is_relevant(item.title, item.body or item.summary)
    return item


def scrape_news(fetcher: Fetcher) -> tuple[list[NewsItem], list[SourceHit]]:
    hits: list[SourceHit] = []
    collected: dict[str, NewsItem] = {}
    for group in NEWS_LISTS:
        for index, url in enumerate(group["urls"]):
            try:
                html, status = fetcher.get_text(url)
                if status == 404 and index > 0:
                    break
                ok = status == 200 and "html" in html.lower() and "404错误" not in html[:200]
                hits.append(SourceHit("news-list", url, utc_now(), ok, f"{group['name']} HTTP {status}"))
                if status != 200 or not ok:
                    break
                page_items = parse_list_page(html, url, group["name"], group["source"])
                for item in page_items:
                    collected.setdefault(item.url, item)
                if index == 0 and not _has_next_page(html, url):
                    break
            except Exception as exc:  # noqa: BLE001
                hits.append(SourceHit("news-list", url, utc_now(), False, str(exc)))
                break

    ranked = sorted(
        collected.values(),
        key=lambda n: (n.relevant, n.date or "", n.title),
        reverse=True,
    )
    to_fetch = [n for n in ranked if n.relevant][:MAX_ARTICLE_FETCH]
    for item in to_fetch:
        try:
            html, status = fetcher.get_text(item.url)
            hits.append(SourceHit("news-article", item.url, utc_now(), status == 200, f"HTTP {status}"))
            if status == 200:
                parse_article(html, item)
        except Exception as exc:  # noqa: BLE001
            hits.append(SourceHit("news-article", item.url, utc_now(), False, str(exc)))
    return ranked, hits


def _has_next_page(html: str, url: str) -> bool:
    if "下页" in html or ">下一页<" in html:
        return True
    if url.endswith(".htm") and "/2.htm" in html:
        return True
    return False
