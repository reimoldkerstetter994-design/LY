from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .utils import HttpClient, clean_text


class OfficialCatalogScraper:
    """抓取研究生院官方招生目录系统数据。"""

    def __init__(self, config: dict[str, Any], client: HttpClient | None = None):
        self.config = config
        self.client = client or HttpClient()
        catalog_cfg = config["sources"]["catalog_system"]
        self.base_url = catalog_cfg["base_url"]
        self.default_page = catalog_cfg["default_page"]
        self.college_code = config["target"]["college_code"]

    def _form_data(self, html: str) -> dict[str, str]:
        soup = BeautifulSoup(html, "lxml")
        return {
            inp.get("name"): inp.get("value", "")
            for inp in soup.select("input[name]")
            if inp.get("name")
        }

    def fetch_college_catalog(self) -> dict[str, Any]:
        page_url = urljoin(self.base_url, self.default_page)
        response = self.client.session.get(page_url, timeout=self.client.timeout)
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        data = self._form_data(response.text)
        data["__EVENTTARGET"] = "drpyx"
        data["__EVENTARGUMENT"] = ""
        data["drpyx"] = self.college_code

        response = self.client.session.post(
            page_url,
            data=data,
            timeout=self.client.timeout,
            headers={"Referer": page_url, **self.client.session.headers},
        )
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        return self._parse_catalog(response.text, page_url)

    def _parse_catalog(self, html: str, source_url: str) -> dict[str, Any]:
        soup = BeautifulSoup(html, "lxml")
        college_intro = ""
        majors: list[dict[str, Any]] = []
        current_major: dict[str, Any] | None = None

        for row in soup.find_all("tr"):
            cells = [clean_text(td.get_text(" ", strip=True)) for td in row.find_all("td")]
            if not cells:
                continue

            first = cells[0]
            if self.college_code in first and "学院" in first:
                college_intro = first
                continue

            major_match = re.match(r"(\d{6})\s+(.+)", first)
            if major_match and len(cells) >= 2:
                code, name = major_match.groups()
                if not code.startswith("0903"):
                    continue
                current_major = {
                    "code": code,
                    "name": name,
                    "planned_quota": cells[1] if len(cells) > 1 else "",
                    "directions": [],
                    "exam_subjects": {},
                    "remark": cells[-1] if len(cells) > 3 else "",
                }
                majors.append(current_major)
                continue

            if current_major and any(k in first for k in ("全日制", "01", "02", "03", "04")):
                exam_text = ""
                reexam = ""
                remark = ""
                for cell in cells:
                    if "复试科目" in cell:
                        parts = cell.split("复试科目:")
                        exam_text = clean_text(parts[0])
                        reexam = clean_text(parts[1]) if len(parts) > 1 else ""
                    elif "①" in cell or "101" in cell:
                        exam_text = cell
                    elif cell and cell not in (current_major.get("planned_quota", ""), first):
                        if len(cell) > 30:
                            remark = cell

                subject_links = {}
                for link in row.find_all("a", href=True):
                    if "zsml_ss_view" in link["href"]:
                        text = clean_text(link.get_text())
                        code_match = re.search(r"(\d{3,4})", text)
                        if code_match:
                            subject_links[code_match.group(1)] = {
                                "name": text,
                                "url": urljoin(self.base_url, link["href"]),
                            }

                current_major["directions"].append(
                    {
                        "name": first,
                        "initial_exam": exam_text,
                        "reexam_subjects": reexam,
                        "remark": remark,
                        "subject_links": subject_links,
                    }
                )

        target_codes = {m["code"] for m in self.config["target"].get("majors", [])}
        if target_codes:
            majors = [m for m in majors if m["code"] in target_codes]
            for major in majors:
                major["directions"] = [
                    d
                    for d in major.get("directions", [])
                    if "339" not in d.get("initial_exam", "") and "204" not in d.get("initial_exam", "")
                ]

        return {
            "source": source_url,
            "college_intro": college_intro,
            "majors": majors,
        }

    def fetch_subject_reference(self, subject_code: str) -> dict[str, Any]:
        page = self.config["sources"]["catalog_system"]["subject_view"].format(code=subject_code)
        url = urljoin(self.base_url, page)
        response = self.client.session.get(url, timeout=self.client.timeout)
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        html = response.text
        soup = BeautifulSoup(html, "lxml")
        text = clean_text(soup.get_text("\n"))
        title = ""
        for line in text.split("\n"):
            line = clean_text(line)
            if not line or "南京农业大学" in line or "参考书" in line or "2026" in line:
                continue
            if re.search(r"\d{3,4}", line) or len(line) <= 20:
                title = line
                break

        books_text = ""
        if "参考书目" in text:
            books_text = text.split("参考书目", 1)[1]
        elif "参考书如下" in text:
            books_text = text.split("参考书如下", 1)[1]
        elif "课程参考书" in text:
            books_text = text.split("课程参考书", 1)[1]

        from .utils import extract_books

        return {
            "code": subject_code,
            "name": title,
            "url": url,
            "raw_text": text,
            "books": extract_books(books_text),
        }

    def fetch_all_subject_references(self, subject_codes: list[str]) -> list[dict[str, Any]]:
        return [self.fetch_subject_reference(code) for code in subject_codes]
