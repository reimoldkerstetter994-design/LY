from __future__ import annotations

import html as html_lib
import re
from urllib.parse import urljoin

from njau_are.config import (
    COLLEGE_CODE,
    COLLEGE_NAME,
    CORE_ACADEMIC_CODES,
    RELATED_ACADEMIC_CODES,
    RELATED_PROFESSIONAL_CODES,
    catalog_url,
    subject_url,
)
from njau_are.models import CollegeSnapshot, ExamSubject, Program, ResearchDirection

_HIDDEN_RE = re.compile(
    r'<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]*value="([^"]*)"',
    re.I,
)
_MAJOR_RE = re.compile(
    r"<b>\s*(\d{6})\s+([^<]+?)\s*</b>"
    r"[\s\S]{0,400}?<td[^>]*>\s*(\d+)\s*</td>"
    r"[\s\S]{0,1200}?<td[^>]*>\s*((?:0\d|\d{2})\s*\([^<)]+\)[\s\S]*?)</td>"
    r"[\s\S]{0,800}?width=\"350\"[^>]*>([\s\S]*?)</td>"
    r"[\s\S]{0,400}?<!--科目-->[\s\S]{0,200}?<td[^>]*>([\s\S]*?)<!--研究方向备注-->",
    re.I,
)
_COLLEGE_RE = re.compile(
    r"(\d{3})\s+([^<(]+)\(电话:([^)]+)\)"
    r"[\s\S]{0,800}?<td[^>]*>\s*(\d+)\s*</td>"
    r"[\s\S]{0,400}?<td>\s*([^<][\s\S]*?)</td>",
    re.I,
)
_SUBJECT_LINK_RE = re.compile(
    r'<a href="([^"]+kmdm=([^"&]+))"[^>]*>\s*([^<]+?)\s*</a>',
    re.I,
)
_DIRECTION_RE = re.compile(r"(\d{2})\s*\(([^)]+)\)\s*(.+)")
_BOOK_HEAD_RE = re.compile(
    r"“\s*([^”]+)\s*”\s*课程参考书如下：\s*参考书目\s*(.*)",
    re.S,
)


def extract_hidden_fields(html: str) -> dict[str, str]:
    return {name: html_lib.unescape(value) for name, value in _HIDDEN_RE.findall(html)}


def _clean(text: str) -> str:
    text = html_lib.unescape(text)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\xa0", " ")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line).strip()


def _degree_type(name: str) -> str:
    return "专硕" if "专业学位" in name else "学硕"


def _category(code: str, name: str) -> str:
    if code in CORE_ACADEMIC_CODES:
        return "core"
    if code in RELATED_ACADEMIC_CODES and _degree_type(name) == "学硕":
        return "related_academic"
    if code in RELATED_PROFESSIONAL_CODES or _degree_type(name) == "专硕":
        return "related_professional"
    return "other"


def parse_directions(raw: str) -> list[ResearchDirection]:
    directions: list[ResearchDirection] = []
    for line in _clean(raw).splitlines():
        match = _DIRECTION_RE.match(line)
        if not match:
            continue
        directions.append(
            ResearchDirection(
                code=match.group(1),
                name=match.group(3).strip(),
                study_mode=match.group(2).strip(),
            )
        )
    return directions


def parse_subject_links(raw: str, year: int) -> tuple[list[ExamSubject], list[ExamSubject]]:
    initial: list[ExamSubject] = []
    retest: list[ExamSubject] = []
    split = re.split(r"复试科目\s*[:：]", raw, maxsplit=1)
    initial_html = split[0]
    retest_html = split[1] if len(split) > 1 else ""
    for html_part, bucket, kind in (
        (initial_html, initial, "initial"),
        (retest_html, retest, "retest"),
    ):
        for href, code, label in _SUBJECT_LINK_RE.findall(html_part):
            label = _clean(label)
            name = re.sub(r"^\d+\s*", "", label).strip()
            bucket.append(
                ExamSubject(
                    code=code,
                    name=name or label,
                    kind=kind,
                    url=urljoin(subject_url(year, code), href),
                )
            )
    return initial, retest


def parse_college_header(html: str, year: int) -> CollegeSnapshot | None:
    match = _COLLEGE_RE.search(html)
    if not match:
        return None
    return CollegeSnapshot(
        year=year,
        college_code=match.group(1),
        college_name=match.group(2).strip(),
        planned_quota=int(match.group(4)),
        intro=_clean(match.group(5)),
        phone=match.group(3).strip(),
        source_url=catalog_url(year),
    )


def parse_catalog_html(html: str, year: int, source_url: str = "") -> tuple[CollegeSnapshot | None, list[Program]]:
    college = parse_college_header(html, year)
    programs: list[Program] = []
    for match in _MAJOR_RE.finditer(html):
        code = match.group(1)
        name = _clean(match.group(2))
        initial, retest = parse_subject_links(match.group(5), year)
        programs.append(
            Program(
                year=year,
                college_code=college.college_code if college else COLLEGE_CODE,
                college_name=college.college_name if college else COLLEGE_NAME,
                major_code=code,
                major_name=name,
                degree_type=_degree_type(name),
                planned_quota=int(match.group(3)),
                directions=parse_directions(match.group(4)),
                initial_subjects=initial,
                retest_subjects=retest,
                notes=_clean(match.group(6)),
                source_url=source_url or catalog_url(year),
                category=_category(code, name),
            )
        )
    return college, programs


def parse_subject_page(html: str, code: str, url: str) -> ExamSubject:
    text = _clean(html)
    books = ""
    title = ""
    match = _BOOK_HEAD_RE.search(text)
    if match:
        title = match.group(1).strip()
        books = match.group(2).strip()
        books = re.sub(r"\s+", " ", books)
        books = books.replace("。", "。\n").strip()
    kind = "retest" if code.startswith("0") and len(code) == 4 else "initial"
    return ExamSubject(
        code=code,
        name=title or code,
        kind=kind,
        url=url,
        reference_books=books,
    )


def catalog_search_payload(hidden: dict[str, str], year: int, college_code: str) -> dict[str, str]:
    return {
        "__EVENTTARGET": hidden.get("__EVENTTARGET", ""),
        "__EVENTARGUMENT": hidden.get("__EVENTARGUMENT", ""),
        "__LASTFOCUS": hidden.get("__LASTFOCUS", ""),
        "__VIEWSTATE": hidden.get("__VIEWSTATE", ""),
        "__VIEWSTATEGENERATOR": hidden.get("__VIEWSTATEGENERATOR", ""),
        "__EVENTVALIDATION": hidden.get("__EVENTVALIDATION", ""),
        "drpnd": str(year),
        "drpyx": college_code,
        "btnSearch": "查 询",
    }
