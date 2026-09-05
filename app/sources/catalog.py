from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.config import ACADEMIC_MASTER_CODES, CATALOG_URL, CATALOG_YEAR, COLLEGE_NAME


@dataclass
class SubjectLink:
    code: str
    name: str
    url: str
    stage: str
    slot: str = ""
    optional_group: str = ""


@dataclass
class ProgramRecord:
    year: str
    code: str
    name: str
    degree_type: str
    planned_seats: str
    directions: list[str]
    notes: str
    college: str
    source_url: str
    subjects: list[SubjectLink] = field(default_factory=list)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def parse_catalog_html(html: str, source_url: str = CATALOG_URL) -> list[ProgramRecord]:
    soup = BeautifulSoup(html, "lxml")
    programs: list[ProgramRecord] = []
    for bold in soup.find_all("b"):
        raw = _clean(bold.get_text(" ", strip=True))
        match = re.match(r"(\d{6})\s+(.+)", raw)
        if not match:
            continue
        code, name = match.group(1), match.group(2).strip()
        header_row = bold.find_parent("tr")
        if header_row is None:
            continue
        cells = header_row.find_all("td", recursive=False)
        seats = _clean(cells[1].get_text()) if len(cells) > 1 else ""

        next_row = header_row.find_next_sibling("tr")
        directions: list[str] = []
        notes = ""
        subjects: list[SubjectLink] = []
        if next_row:
            detail_cells = next_row.find_all("td", recursive=False)
            if detail_cells:
                dir_html = detail_cells[0].decode_contents()
                directions = [
                    _clean(BeautifulSoup(part, "lxml").get_text())
                    for part in re.split(r"<br\s*/?>", dir_html, flags=re.I)
                ]
                directions = [d for d in directions if d]
            subject_cell = None
            for cell in detail_cells:
                if cell.find("a", href=re.compile(r"kmdm=")):
                    subject_cell = cell
                    break
            if subject_cell:
                subjects = _parse_subject_cell(subject_cell, source_url)
            if len(detail_cells) >= 4:
                notes = _clean(detail_cells[-1].get_text(" ", strip=True))

        if code in ACADEMIC_MASTER_CODES:
            degree_type = "学术型硕士"
        elif "专业学位" in name:
            degree_type = "专业学位"
        else:
            degree_type = "其他"

        programs.append(
            ProgramRecord(
                year=CATALOG_YEAR,
                code=code,
                name=name,
                degree_type=degree_type,
                planned_seats=seats,
                directions=directions,
                notes=notes,
                college=COLLEGE_NAME,
                source_url=source_url,
                subjects=subjects,
            )
        )
    return programs


def _parse_subject_cell(cell, source_url: str) -> list[SubjectLink]:
    html = str(cell)
    parts = re.split(r"复试科目[:：]", html, maxsplit=1)
    initial_html = parts[0]
    retest_html = parts[1] if len(parts) > 1 else ""
    subjects: list[SubjectLink] = []
    subjects.extend(_extract_links(initial_html, source_url, "初试"))
    if retest_html:
        group = "或" if "或" in BeautifulSoup(retest_html, "lxml").get_text() else ""
        for item in _extract_links(retest_html, source_url, "复试"):
            item.optional_group = group
            subjects.append(item)
    return subjects


def _extract_links(html: str, source_url: str, stage: str) -> list[SubjectLink]:
    soup = BeautifulSoup(html, "lxml")
    items: list[SubjectLink] = []
    for idx, anchor in enumerate(soup.find_all("a", href=True), start=1):
        href = anchor["href"]
        code_match = re.search(r"kmdm=(\d+)", href)
        if not code_match:
            continue
        label = _clean(anchor.get_text())
        name = re.sub(r"^\d+\s*", "", label)
        slot = ""
        if stage == "初试":
            prefix = anchor.find_previous(string=True)
            circ = re.search(r"[①②③④⑤⑥]", str(prefix or ""))
            slot = circ.group(0) if circ else str(idx)
        items.append(
            SubjectLink(
                code=code_match.group(1),
                name=name or label,
                url=urljoin(source_url, href),
                stage=stage,
                slot=slot,
            )
        )
    return items


def parse_subject_books(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    text = _clean(soup.get_text("\n", strip=True))
    if "参考书目" in text:
        text = text.split("参考书目", 1)[1]
    text = re.sub(r"来源未注明.*$", "", text)
    text = re.sub(r"联系方式：.*$", "", text)
    books = _clean(text)
    books = re.sub(r"^[:：\s]+", "", books)
    return books


def parse_hidden(html: str, name: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    field = soup.find("input", {"name": name}) or soup.find("input", {"id": name})
    return field.get("value", "") if field else ""
