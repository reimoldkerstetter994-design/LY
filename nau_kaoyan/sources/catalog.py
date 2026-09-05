from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from nau_kaoyan.config import COLLEGE_CODE, COLLEGE_NAME, TARGET_PROGRAMS
from nau_kaoyan.http_client import Fetcher
from nau_kaoyan.models import ExamSubject, Program, SourceHit, utc_now

YEAR_PROBE = list(range(2028, 2023, -1))


def _hidden(soup: BeautifulSoup, name: str) -> str:
    el = soup.find("input", {"name": name})
    return el.get("value", "") if el else ""


def discover_catalog_years(fetcher: Fetcher) -> tuple[list[str], list[SourceHit]]:
    hits: list[SourceHit] = []
    years: list[str] = []
    for year in YEAR_PROBE:
        url = f"https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/zsml_ss_default.aspx"
        try:
            resp = fetcher.get(url)
            ok = resp.status_code == 200 and "drpyx" in resp.text
            hits.append(
                SourceHit("catalog", url, utc_now(), ok, f"HTTP {resp.status_code}")
            )
            if ok:
                years.append(str(year))
        except Exception as exc:  # noqa: BLE001
            hits.append(SourceHit("catalog", url, utc_now(), False, str(exc)))
    return years, hits


def fetch_college_catalog(fetcher: Fetcher, year: str) -> tuple[str, str, SourceHit]:
    url = f"https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/zsml_ss_default.aspx"
    page = fetcher.get(url)
    soup = BeautifulSoup(page.text, "lxml")
    data = {
        "__EVENTTARGET": "",
        "__EVENTARGUMENT": "",
        "__LASTFOCUS": "",
        "__VIEWSTATE": _hidden(soup, "__VIEWSTATE"),
        "__VIEWSTATEGENERATOR": _hidden(soup, "__VIEWSTATEGENERATOR"),
        "__EVENTVALIDATION": _hidden(soup, "__EVENTVALIDATION"),
        "drpnd": year,
        "drpyx": COLLEGE_CODE,
        "btnSearch": "查 询",
    }
    posted = fetcher.post(url, data=data)
    hit = SourceHit(
        "catalog",
        url,
        utc_now(),
        posted.status_code == 200 and ("090301" in posted.text or "土壤学" in posted.text),
        f"HTTP {posted.status_code}, bytes={len(posted.text)}",
    )
    return posted.text, url, hit


def parse_programs(html: str, year: str, source_url: str) -> list[Program]:
    soup = BeautifulSoup(html, "lxml")
    programs: list[Program] = []
    for bold in soup.find_all("b"):
        text = " ".join(bold.get_text(" ", strip=True).split())
        match = re.match(r"(\d{6})\s+(.+)", text)
        if not match:
            continue
        code, name = match.group(1), match.group(2).strip()
        header_tr = bold.find_parent("tr")
        if header_tr is None:
            continue
        header_tds = header_tr.find_all("td", recursive=False)
        planned = ""
        if len(header_tds) >= 2:
            planned = header_tds[1].get_text(" ", strip=True)

        detail_tr = header_tr.find_next_sibling("tr")
        directions: list[str] = []
        initial: list[ExamSubject] = []
        retest: list[ExamSubject] = []
        remark = ""
        if detail_tr is not None:
            dtds = detail_tr.find_all("td", recursive=False)
            if dtds:
                raw_dirs = dtds[0].get_text("\n", strip=True)
                directions = [ln.strip() for ln in raw_dirs.split("\n") if ln.strip()]
            exam_td = None
            if len(dtds) >= 3:
                exam_td = dtds[2] if dtds[2].find("a") else (dtds[-2] if len(dtds) >= 2 else dtds[-1])
            if exam_td is None and dtds:
                for td in dtds:
                    if td.find("a", href=re.compile(r"kmdm=")):
                        exam_td = td
                        break
            if exam_td is not None:
                initial, retest = _parse_exam_cell(exam_td, year, source_url)
            if dtds:
                remark = dtds[-1].get_text(" ", strip=True)
                if remark.startswith("①") or "思想政治" in remark:
                    remark = ""

        degree_type = "专业学位" if "专业学位" in name else "学术学位"
        programs.append(
            Program(
                year=year,
                college_code=COLLEGE_CODE,
                college_name=COLLEGE_NAME,
                code=code,
                name=re.sub(r"\(专业学位\)", "", name).strip(),
                degree_type=degree_type,
                planned=planned,
                directions=directions,
                initial_subjects=initial,
                retest_subjects=retest,
                remark=remark,
                source_url=source_url,
                is_target=code in TARGET_PROGRAMS,
            )
        )
    return programs


def _parse_exam_cell(td, year: str, source_url: str) -> tuple[list[ExamSubject], list[ExamSubject]]:
    html = str(td)
    initial_html, retest_html = html, ""
    if "复试科目" in html:
        initial_html, retest_html = html.split("复试科目", 1)
    initial = _subjects_from_html(initial_html, "初试", year, source_url)
    retest = _subjects_from_html(retest_html, "复试", year, source_url) if retest_html else []
    return initial, retest


def _subjects_from_html(fragment: str, kind: str, year: str, source_url: str) -> list[ExamSubject]:
    soup = BeautifulSoup(fragment, "lxml")
    seen: set[str] = set()
    items: list[ExamSubject] = []
    for a in soup.find_all("a", href=True):
        label = a.get_text(" ", strip=True)
        match = re.match(r"(\d{3,4})\s+(.+)", label)
        if not match:
            continue
        code, name = match.group(1), match.group(2).strip()
        if code in seen:
            continue
        seen.add(code)
        href = a["href"]
        url = urljoin(source_url, href)
        if "kmdm=" not in url:
            url = f"https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/zsml_ss_view.aspx?kmdm={code}"
        items.append(ExamSubject(code=code, name=name, kind=kind, url=url))
    return items


def target_programs(programs: list[Program]) -> list[Program]:
    return [p for p in programs if p.is_target]
