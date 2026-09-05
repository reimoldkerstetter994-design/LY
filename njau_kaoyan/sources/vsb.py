"""南农官网（研究生招生网 zsgz.njau.edu.cn、资环学院 re.njau.edu.cn）使用的 VSB 建站系统爬虫。

列表页形如 https://zsgz.njau.edu.cn/zsxx/sszs/sszxtz.htm，翻页形如 sszxtz/3.htm（数字越大越靠前）。
详情页正文在 div.v_news_content 中；附件下载走 download.jsp（需要验证码，只记录链接）。
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any

from ..classify import categorize, relevance_score
from ..http import Http
from ..models import Item
from .htmlutil import absolutize, clean_text, extract_date, node_text, soup

log = logging.getLogger(__name__)

_ATTACH_EXT = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".rar", ".ppt", ".pptx")


def parse_list(html: str, base_url: str) -> list[dict[str, str]]:
    """解析列表页，返回 [{url,title,published}]。"""
    s = soup(html)
    results: list[dict[str, str]] = []
    seen: set[str] = set()
    year = date.today().year
    for a in s.select('a[href*="info/"], a[href*="/content"], a[href*="page.htm"]'):
        href = a.get("href") or ""
        if not href or href.startswith("javascript"):
            continue
        url = absolutize(base_url, href)
        if url in seen:
            continue
        title = clean_text(a.get("title") or a.get_text())
        if not title or len(title) < 4:
            continue
        container = a.find_parent("li") or a.find_parent("tr") or a.find_parent("div") or a
        ctx = clean_text(container.get_text(" "))
        published = extract_date(ctx, default_year=year)
        snippet = ctx.replace(title, "", 1)
        snippet = re.sub(r"^\s*\d{1,2}-\d{1,2}\s+20\d{2}\s*", "", snippet)
        snippet = re.sub(r"^\s*20\d{2}-\d{1,2}-\d{1,2}\s*", "", snippet).strip()
        seen.add(url)
        results.append({"url": url, "title": title, "published": published, "snippet": snippet[:300]})
    return results


def find_next_pages(html: str, list_url: str, max_pages: int) -> list[str]:
    """VSB 翻页规则：首页是 xxx.htm，第 2 页是 xxx/(N-1).htm，最后一页是 xxx/1.htm（N 为总页数）。"""
    if max_pages <= 1:
        return []
    m = re.search(r"([^/]+)\.htm$", list_url)
    if not m:
        return []
    stem = m.group(1)
    total = 0
    tm = re.search(r"_simple_list_gotopage_fun\((\d+),", html) or re.search(r"1/(\d+)\s*&nbsp;", html)
    if tm:
        total = int(tm.group(1))
    if total <= 1:
        nums = sorted({int(n) for n in re.findall(re.escape(stem) + r"/(\d+)\.htm", html)}, reverse=True)
        if not nums:
            return []
        total = nums[0] + 1
    pages = [total - k for k in range(1, max_pages) if total - k >= 1]
    return [absolutize(list_url, f"{stem}/{n}.htm") for n in pages]


def parse_detail(html: str, url: str) -> dict[str, Any]:
    s = soup(html)
    body = s.select_one(".v_news_content, #vsb_content, .article-content, .content")
    text = node_text(body) if body else ""
    published = ""
    m = re.search(r"发布时间[:：]?\s*(20\d{2}-\d{1,2}-\d{1,2})", s.get_text(" "))
    if m:
        published = extract_date(m.group(1))

    attachments: list[dict[str, str]] = []
    for a in s.select("a[href]"):
        href = a.get("href") or ""
        name = clean_text(a.get_text())
        low = href.lower()
        if "download.jsp" in low or low.endswith(_ATTACH_EXT):
            attachments.append({"name": name or href.rsplit("/", 1)[-1], "url": absolutize(url, href)})

    images: list[str] = []
    scope = body or s
    for img in scope.select("img"):
        src = img.get("orisrc") or img.get("src") or ""
        if "__local" in src or "img_vsb_content" in (img.get("class") or []):
            images.append(absolutize(url, src))

    return {"text": text, "published": published, "attachments": attachments, "images": images}


class VsbSource:
    def __init__(self, http: Http, section: dict[str, Any], rel_cfg: dict[str, Any], fetch_detail: bool = True):
        self.http = http
        self.section = section
        self.rel_cfg = rel_cfg
        self.fetch_detail = fetch_detail

    def crawl(self) -> list[Item]:
        sec = self.section
        url = sec["url"]
        html = self.http.get_text(url)
        if html is None:
            log.warning("[%s] 列表页获取失败: %s", sec["id"], url)
            return []
        entries = parse_list(html, url)
        for page in find_next_pages(html, url, int(sec.get("max_pages", 1))):
            h = self.http.get_text(page)
            if h:
                entries.extend(parse_list(h, page))
        log.info("[%s] 列表条目 %d", sec["id"], len(entries))

        items: list[Item] = []
        for e in entries:
            title = e["title"]
            if sec.get("filter"):
                if relevance_score(title, _loose(self.rel_cfg)) == 0:
                    continue
            it = Item(
                url=e["url"],
                title=title,
                source_id=sec["id"],
                source_name=sec.get("name", sec["id"]),
                kind="official",
                published=e.get("published", ""),
                summary=e.get("snippet", ""),
            )
            if self.fetch_detail:
                dh = self.http.get_text(it.url)
                if dh:
                    d = parse_detail(dh, it.url)
                    it.summary = d["text"][:1500] or it.summary
                    it.published = d["published"] or it.published
                    it.attachments = d["attachments"]
                    it.images = d["images"]
            it.category = categorize(it.title, it.summary)
            it.score = relevance_score(f"{it.title} {it.summary}", _loose(self.rel_cfg)) or 1
            items.append(it)
        return items


def _loose(rel_cfg: dict[str, Any]) -> dict[str, Any]:
    """官网页面天然属于南农，不要求命中 must_any；学院栏目用 official_topic_any（研究生招生相关词）过滤。"""
    c = dict(rel_cfg)
    c["must_any"] = []
    if rel_cfg.get("official_topic_any"):
        c["topic_any"] = rel_cfg["official_topic_any"]
    return c
