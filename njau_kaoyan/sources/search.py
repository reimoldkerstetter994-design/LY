"""全网搜索源：DuckDuckGo（HTML 版）、Bing、搜狗微信（公众号文章）。

搜索引擎页面结构经常变化，各解析器都做了容错；解析不到结果只会记录日志，不会中断整体抓取。
"""

from __future__ import annotations

import html as _html
import logging
import random
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import parse_qs, unquote, urlparse

from ..classify import categorize, relevance_score
from ..http import Http
from ..models import Item
from .htmlutil import clean_text, soup

log = logging.getLogger(__name__)
_CST = timezone(timedelta(hours=8))

SearchResult = dict[str, str]  # {url,title,snippet}


# ---- 解析器（纯函数，便于测试） --------------------------------------------
def parse_duckduckgo(html: str) -> list[SearchResult]:
    s = soup(html)
    out: list[SearchResult] = []
    for res in s.select(".result"):
        a = res.select_one("a.result__a")
        if not a:
            continue
        href = a.get("href") or ""
        href = _ddg_unwrap(href)
        snippet = res.select_one(".result__snippet")
        out.append(
            {
                "url": href,
                "title": clean_text(a.get_text()),
                "snippet": clean_text(snippet.get_text()) if snippet else "",
            }
        )
    return out


def _ddg_unwrap(href: str) -> str:
    if href.startswith("//"):
        href = "https:" + href
    if "duckduckgo.com/l/" in href:
        q = parse_qs(urlparse(href).query)
        if "uddg" in q:
            return unquote(q["uddg"][0])
    return href


def parse_bing(html: str) -> list[SearchResult]:
    s = soup(html)
    out: list[SearchResult] = []
    for li in s.select("li.b_algo"):
        a = li.select_one("h2 a")
        if not a:
            continue
        p = li.select_one("p")
        out.append(
            {
                "url": a.get("href") or "",
                "title": clean_text(a.get_text()),
                "snippet": clean_text(p.get_text()) if p else "",
            }
        )
    return out


def parse_sogou_weixin(html: str) -> list[SearchResult]:
    s = soup(html)
    out: list[SearchResult] = []
    for li in s.select("ul.news-list li"):
        a = li.select_one("h3 a")
        if not a:
            continue
        href = a.get("href") or ""
        if href.startswith("/"):
            href = "https://weixin.sogou.com" + href
        snippet = li.select_one("p.txt-info")
        acct = li.select_one(".all-time-y2, .account, a.account")
        title = clean_text(a.get_text())
        published = ""
        tm = re.search(r"timeConvert\('(\d{9,10})'\)", li.decode())
        if tm:
            published = datetime.fromtimestamp(int(tm.group(1)), tz=_CST).strftime("%Y-%m-%d")
        out.append(
            {
                "url": _html.unescape(href),
                "title": title,
                "snippet": clean_text(snippet.get_text()) if snippet else "",
                "account": clean_text(acct.get_text()) if acct else "",
                "published": published,
            }
        )
    return out


# ---- 引擎 -----------------------------------------------------------------
class SearchSource:
    def __init__(self, http: Http, cfg: dict[str, Any]):
        self.http = http
        self.cfg = cfg
        self.rel_cfg = cfg["relevance"]
        self.max_results = int(cfg["search"].get("max_results_per_query", 10))

    # 单个引擎查询
    def duckduckgo(self, query: str) -> list[SearchResult]:
        html = self.http.post_text(
            "https://html.duckduckgo.com/html/",
            data={"q": query, "b": "", "kl": "cn-zh"},
            headers={"Referer": "https://html.duckduckgo.com/"},
        )
        return parse_duckduckgo(html) if html else []

    def bing(self, query: str) -> list[SearchResult]:
        html = self.http.get_text(
            "https://www.bing.com/search",
            params={"q": query, "setlang": "zh-cn", "cc": "CN", "ensearch": "0"},
        )
        return parse_bing(html) if html else []

    def sogou_weixin(self, query: str) -> list[SearchResult]:
        html = self.http.get_text(
            "https://weixin.sogou.com/weixin",
            params={"type": "2", "query": query, "ie": "utf8"},
            headers={"Referer": "https://weixin.sogou.com/"},
        )
        if html and "antispider" in html:
            log.warning("搜狗微信触发验证码，本轮跳过")
            return []
        return parse_sogou_weixin(html) if html else []

    def _query(self, fn: Callable[[str], list[SearchResult]], query: str, engine: str) -> list[SearchResult]:
        """搜索引擎对连续请求很敏感：查询之间加间隔，空结果时退避后重试一次。"""
        delay = float(self.cfg["search"].get("delay", 3))
        results = fn(query)
        if not results:
            log.info("[%s] %r 未解析到结果（可能被限流），%.0fs 后重试一次", engine, query, delay * 3)
            time.sleep(delay * 3)
            results = fn(query)
        time.sleep(delay + random.uniform(0, delay))
        return results

    def crawl(self) -> list[Item]:
        scfg = self.cfg["search"]
        engines: dict[str, Callable[[str], list[SearchResult]]] = {
            "duckduckgo": self.duckduckgo,
            "bing": self.bing,
        }
        items: dict[str, Item] = {}
        for name in scfg.get("engines", []):
            if name == "sogou_weixin":
                for q in scfg.get("weixin_queries", []) or scfg.get("queries", []):
                    res = self._query(self.sogou_weixin, q, name)
                    self._collect(items, res, "sogou_weixin", "搜狗微信搜索", "weixin", q)
                continue
            fn = engines.get(name)
            if not fn:
                log.warning("未知搜索引擎: %s", name)
                continue
            for q in scfg.get("queries", []):
                res = self._query(fn, q, name)
                self._collect(items, res, name, {"duckduckgo": "DuckDuckGo", "bing": "Bing"}[name], "search", q)
        return list(items.values())

    def _collect(
        self,
        bucket: dict[str, Item],
        results: list[SearchResult],
        source_id: str,
        source_name: str,
        kind: str,
        query: str,
    ) -> None:
        n = 0
        for r in results[: self.max_results]:
            url = r.get("url") or ""
            if not url.startswith("http"):
                continue
            title = r.get("title") or url
            text = f"{title} {r.get('snippet','')}"
            score = relevance_score(text, self.rel_cfg)
            if score == 0:
                continue
            n += 1
            dedupe_key = f"weixin:{_norm_title(title)}" if kind == "weixin" else ""
            key = dedupe_key or url
            if key in bucket:
                bucket[key].score = max(bucket[key].score, score)
                bucket[key].extra.setdefault("queries", []).append(query)
                continue
            bucket[key] = Item(
                url=url,
                title=title,
                source_id=source_id,
                source_name=source_name,
                kind=kind,
                published=r.get("published", ""),
                summary=r.get("snippet", ""),
                category=categorize(title, r.get("snippet", "")),
                score=score,
                extra={"queries": [query], "site": _site(url), "account": r.get("account", "")},
                dedupe_key=dedupe_key,
            )
        log.info("[%s] %r → %d 条相关结果", source_id, query, n)


def _site(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return re.sub(r"^(www|m)\.", "", host)


def _norm_title(title: str) -> str:
    return re.sub(r"[\s\W_]+", "", title).lower()
