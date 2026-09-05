from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

_DATE_FULL = re.compile(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})")
_DATE_MD_Y = re.compile(r"(\d{1,2})-(\d{1,2})\s+(20\d{2})")  # zsgz 列表页样式 "03-24 2022"
_DATE_MD = re.compile(r"(?<!\d)(\d{1,2})[/-](\d{1,2})(?!\d)")


def soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def extract_date(text: str, default_year: int | None = None) -> str:
    m = _DATE_FULL.search(text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = _DATE_MD_Y.search(text)
    if m:
        return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    if default_year:
        m = _DATE_MD.search(text)
        if m:
            return f"{default_year}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    return ""


def absolutize(base: str, href: str) -> str:
    return urljoin(base, href.strip())


def node_text(node: Tag, sep: str = "\n") -> str:
    """把正文节点转成可读文本，保留表格结构（单元格用 | 分隔）。"""
    for br in node.find_all("br"):
        br.replace_with("\n")
    for td in node.find_all(["td", "th"]):
        td.append(" | ")
    for tr in node.find_all("tr"):
        tr.append("\n")
    for p in node.find_all(["p", "div", "li", "h1", "h2", "h3", "h4"]):
        p.append("\n")
    text = node.get_text()
    lines = [clean_text(l) for l in text.splitlines()]
    return sep.join(l for l in lines if l)
