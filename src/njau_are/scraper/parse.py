from __future__ import annotations

import re
from html import unescape
from urllib.parse import urljoin

from bs4 import BeautifulSoup


def text_of(el) -> str:
    if el is None:
        return ""
    for br in el.find_all("br"):
        br.replace_with("\n")
    return re.sub(r"\s+\n", "\n", el.get_text("\n", strip=True)).strip()


def parse_aspnet_fields(html: str) -> dict[str, str]:
    soup = BeautifulSoup(html, "lxml")
    fields: dict[str, str] = {}
    for name in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"):
        node = soup.find("input", {"name": name})
        if node and node.get("value") is not None:
            fields[name] = node["value"]
    return fields


def parse_subject_html(html: str, code: str, url: str = "") -> dict[str, str]:
    soup = BeautifulSoup(html, "lxml")

    def span(sid: str) -> str:
        node = soup.find(id=sid)
        return text_of(node)

    return {
        "code": code,
        "title": span("lblTitle"),
        "name": span("lblkcmc") or code,
        "books": re.sub(r"\s+", " ", span("lblcksm")).strip(),
        "official_url": url,
    }


_SUBJECT_RE = re.compile(
    r"([①②③④⑤⑥⑦⑧])\s*(\d{3,4})\s*([^\n①②③④]+?)(?=(?:[①②③④⑤⑥⑦⑧])|$)"
)
_RETEST_RE = re.compile(r"复试科目[:：]\s*(.+)", re.S)
_CODE_NAME_RE = re.compile(r"(\d{6})\s*([^\d\n]+)")


def parse_subject_tokens(blob: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    blob = unescape(blob)
    initial: list[dict[str, str]] = []
    retest: list[dict[str, str]] = []
    m = _RETEST_RE.search(blob)
    initial_blob = blob
    retest_blob = ""
    if m:
        initial_blob = blob[: m.start()]
        retest_blob = m.group(1)

    for _, code, name in _SUBJECT_RE.findall(initial_blob):
        initial.append({"code": code.strip(), "name": name.strip(" 、，;；"), "kind": "初试"})

    if retest_blob:
        parts = re.split(r"[或/／、]|或", retest_blob)
        for part in parts:
            part = re.sub(r"\s+", " ", part).strip(" 。；;，,")
            if not part:
                continue
            cm = re.match(r"(\d{4})\s*(.+)", part)
            if cm:
                retest.append(
                    {"code": cm.group(1), "name": cm.group(2).strip(), "kind": "复试"}
                )
            else:
                retest.append({"code": "", "name": part, "kind": "复试"})
    return initial, retest


_KMDM_RE = re.compile(r"kmdm=(\d+)", re.I)


def parse_subject_links(node) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Prefer official kmdm links in a catalog cell; fall back to circled-number text."""
    if node is None:
        return [], []
    html = str(node)
    text = text_of(node)

    def from_html_segment(segment_html: str, kind: str) -> list[dict[str, str]]:
        soup = BeautifulSoup(segment_html, "lxml")
        items: list[dict[str, str]] = []
        seen: set[str] = set()
        for a in soup.find_all("a"):
            href = a.get("href") or ""
            m = _KMDM_RE.search(href)
            if not m:
                continue
            code = m.group(1)
            if code in seen:
                continue
            seen.add(code)
            name = re.sub(r"^\d+\s*", "", a.get_text(" ", strip=True)).strip()
            items.append({"code": code, "name": name or code, "kind": kind})
        return items

    if "复试科目" in html:
        before, after = re.split(r"复试科目[:：]", html, maxsplit=1)
        initial = from_html_segment(before, "初试")
        retest = from_html_segment(after, "复试")
    else:
        initial = from_html_segment(html, "初试")
        retest = []

    if not initial:
        initial, parsed_retest = parse_subject_tokens(text)
        if not retest:
            retest = parsed_retest
    if not retest:
        _, retest = parse_subject_tokens(text)
    return initial, retest


def parse_directions(blob: str) -> list[dict[str, str | bool]]:
    out: list[dict[str, str | bool]] = []
    for line in blob.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        m = re.match(r"(\d{2})\s*[（(]?(全日制|非全日制)?[）)]?\s*(.+)", line)
        if m:
            out.append(
                {
                    "code": m.group(1),
                    "name": m.group(3).strip(),
                    "full_time": (m.group(2) or "全日制") == "全日制",
                }
            )
        else:
            out.append({"code": "", "name": line, "full_time": True})
    return out


def _degree_type(code: str, name: str) -> str:
    if "专业学位" in name or code.startswith(("085", "086", "095")):
        return "专业学位"
    return "学术学位"


def parse_catalog_html(html: str, year: str = "2026", source_url: str = "") -> list[dict]:
    """Parse the nested, slightly malformed catalog table used by NJAU yzglxt."""
    soup = BeautifulSoup(html, "lxml")
    college = "资源与环境科学学院"
    college_phone = ""
    page_text = soup.get_text(" ", strip=True)
    cm = re.search(r"(资源与环境科学学院)\s*\(?电话[:：]?\s*([\d-]+)", page_text)
    if cm:
        college, college_phone = cm.group(1), cm.group(2)

    programs: list[dict] = []
    seen: set[str] = set()
    for bold in soup.find_all("b"):
        raw = re.sub(r"\s+", " ", bold.get_text(" ", strip=True)).strip()
        m = re.match(r"(\d{6})\s+(.+)$", raw)
        if not m:
            continue
        code, name = m.group(1), m.group(2).strip()
        if code in seen:
            continue
        seen.add(code)

        header_tr = bold.find_parent("tr")
        planned = None
        if header_tr:
            for td in header_tr.find_all("td", recursive=False):
                t = text_of(td)
                if t.isdigit():
                    planned = int(t)
                    break

        detail_tr = None
        if header_tr:
            detail_tr = header_tr.find("tr")
            if detail_tr is None:
                nxt = header_tr.find_next_sibling("tr")
                if nxt and ("全日制" in nxt.get_text() or "思想政治" in nxt.get_text()):
                    detail_tr = nxt

        detail_texts = [text_of(td) for td in detail_tr.find_all("td")] if detail_tr else []
        joined = "\n".join(detail_texts)
        dir_blob = next(
            (t for t in detail_texts if re.search(r"\d{2}\s*[（(]?(全日制|非全日制)", t)),
            "",
        )
        subject_blob = next(
            (t for t in detail_texts if "思想政治" in t or "复试科目" in t),
            joined,
        )
        remark = ""
        for t in reversed(detail_texts):
            if t and "思想政治" not in t and not t.isdigit() and code not in t:
                if any(k in t for k in ("学科", "欢迎", "双一流", "重点", "依托")):
                    remark = t
                    break
        initial, retest = parse_subject_links(detail_tr)
        degree = _degree_type(code, name)
        name = name.replace("(专业学位)", "").replace("（专业学位）", "").strip()
        programs.append(
            {
                "year": year,
                "college": college,
                "college_phone": college_phone,
                "code": code,
                "name": name,
                "degree_type": degree,
                "planned": planned,
                "directions": parse_directions(dir_blob),
                "initial_subjects": initial,
                "retest_subjects": retest,
                "remark": remark,
                "source_url": source_url,
            }
        )
    return programs


def parse_notice_list(html: str, base: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "lxml")
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for a in soup.find_all("a"):
        title = a.get_text(strip=True)
        href = a.get("href") or ""
        if not title or not href:
            continue
        if "info/" not in href and "content.jsp" not in href:
            continue
        if len(title) < 8:
            continue
        url = urljoin(base, href)
        if url in seen:
            continue
        seen.add(url)
        date = ""
        parent = a.find_parent()
        if parent:
            dm = re.search(r"(20\d{2}[-./年]\d{1,2}[-./月]\d{1,2})", parent.get_text(" ", strip=True))
            if dm:
                date = dm.group(1)
        items.append({"title": title, "url": url, "date": date, "source": base})
    return items
