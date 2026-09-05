from __future__ import annotations

import re

from bs4 import BeautifulSoup

from nau_kaoyan.http_client import Fetcher
from nau_kaoyan.models import ExamSubject, SourceHit, utc_now


def parse_subject_page(html: str, subject: ExamSubject) -> ExamSubject:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text("\n", strip=True)
    text = re.sub(r"\n{2,}", "\n", text)
    books: list[str] = []
    if "参考书目" in text:
        chunk = text.split("参考书目", 1)[1]
        chunk = re.split(r"校办电话|版权所有|苏ICP", chunk)[0]
        chunk = chunk.replace("&nbsp;", " ").strip()
        # split numbered items like 1.《... 2.《...
        parts = re.split(r"(?=\d+\.\s*《)", chunk)
        parts = [p.strip(" 。;；") for p in parts if p.strip()]
        if len(parts) <= 1:
            # maybe a single book without numbering
            one = re.sub(r"\s+", " ", chunk).strip(" 。;；")
            if one and "课程参考书如下" not in one:
                books = [one]
        else:
            books = [re.sub(r"\s+", " ", p).strip(" 。;；") for p in parts if "《" in p]
    subject.books = books
    # keep a short official excerpt, not a full copyrighted outline dump
    excerpt = ""
    if "课程参考书如下" in text:
        excerpt = text.split("课程参考书如下", 1)[0][-80:] + "课程参考书如下"
    subject.outline = excerpt.strip()
    return subject


def enrich_subjects(fetcher: Fetcher, subjects: list[ExamSubject], year: str) -> tuple[list[ExamSubject], list[SourceHit]]:
    hits: list[SourceHit] = []
    uniq: dict[str, ExamSubject] = {}
    for sub in subjects:
        if sub.code in {"101", "201", "204"}:
            continue
        key = sub.url or f"{sub.kind}:{sub.code}"
        if key not in uniq:
            uniq[key] = sub
    enriched: list[ExamSubject] = []
    for sub in uniq.values():
        url = sub.url or f"https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/zsml_ss_view.aspx?kmdm={sub.code}"
        sub.url = url
        try:
            html, status = fetcher.get_text(url)
            ok = status == 200 and ("参考书" in html or "课程" in html)
            hits.append(SourceHit("subject", url, utc_now(), ok, f"HTTP {status}"))
            if status == 200:
                sub = parse_subject_page(html, sub)
        except Exception as exc:  # noqa: BLE001
            hits.append(SourceHit("subject", url, utc_now(), False, str(exc)))
        enriched.append(sub)
    return enriched, hits
