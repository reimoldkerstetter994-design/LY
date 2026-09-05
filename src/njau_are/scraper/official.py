from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import httpx

from njau_are.config import (
    ACADEMIC_MASTER_CODES,
    COLLEGE_CODE,
    REQUEST_GAP_SECONDS,
    REQUEST_TIMEOUT,
    SNAPSHOT_DIR,
    SOURCES,
    USER_AGENT,
)
from njau_are.models import ExamSubject, Notice, Program, ScoreLine, Snapshot
from njau_are.scraper.parse import (
    parse_aspnet_fields,
    parse_catalog_html,
    parse_notice_list,
    parse_subject_html,
)

BJ = timezone(timedelta(hours=8))


def _client() -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9"},
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
    )


def fetch_catalog(year: str = "2026") -> tuple[list[Program], dict[str, Any]]:
    warnings: list[str] = []
    meta: dict[str, Any] = {}
    url = SOURCES["catalog"]
    with _client() as client:
        first = client.get(url)
        first.raise_for_status()
        fields = parse_aspnet_fields(first.text)
        if not fields.get("__VIEWSTATE"):
            raise RuntimeError("招生目录页未拿到 ASP.NET VIEWSTATE，页面结构可能已改。")
        data = {
            "__EVENTTARGET": "",
            "__EVENTARGUMENT": "",
            "__LASTFOCUS": "",
            **fields,
            "drpnd": year,
            "drpyx": COLLEGE_CODE,
            "btnSearch": "查 询",
        }
        resp = client.post(
            url,
            data=data,
            headers={"Referer": url, "Origin": "https://yzglxt.njau.edu.cn"},
        )
        resp.raise_for_status()
        html = resp.text
        raw = parse_catalog_html(html, year=year, source_url=url)
        programs = [Program.model_validate(p) for p in raw]
        if not programs:
            warnings.append("目录解析结果为空，请检查官网表格结构。")
        meta["raw_program_count"] = len(programs)
        meta["html_chars"] = len(html)
        return programs, {"warnings": warnings, **meta}


def fetch_subjects(codes: list[str]) -> dict[str, ExamSubject]:
    out: dict[str, ExamSubject] = {}
    with _client() as client:
        for i, code in enumerate(codes):
            url = f"{SOURCES['subject']}?kmdm={code}"
            resp = client.get(url, headers={"Referer": SOURCES["catalog"]})
            resp.raise_for_status()
            rec = parse_subject_html(resp.text, code, url)
            out[code] = ExamSubject(
                code=code,
                name=rec.get("name") or code,
                kind="复试" if len(code) == 4 and code.startswith("0") else "初试",
                books=rec.get("books") or "",
                official_url=url,
            )
            if i + 1 < len(codes):
                import time

                time.sleep(REQUEST_GAP_SECONDS)
    return out


def fetch_notices() -> list[Notice]:
    notices: list[Notice] = []
    with _client() as client:
        for key in ("notices", "college"):
            url = SOURCES[key]
            try:
                resp = client.get(url)
                resp.raise_for_status()
                for item in parse_notice_list(resp.text, url):
                    title = item["title"]
                    if key == "notices" and not any(
                        k in title for k in ("硕士", "招生", "复试", "目录", "章程", "调剂", "推免")
                    ):
                        continue
                    if key == "college" and not any(
                        k in title for k in ("硕士", "研究生", "招生", "复试", "推免", "拟录取")
                    ):
                        continue
                    notices.append(Notice.model_validate(item | {"source": key}))
            except httpx.HTTPError as exc:
                notices.append(
                    Notice(
                        title=f"抓取失败：{url}",
                        url=url,
                        source=key,
                        summary=str(exc),
                    )
                )
    # de-dup by url
    seen: set[str] = set()
    uniq: list[Notice] = []
    for n in notices:
        if n.url in seen:
            continue
        seen.add(n.url)
        uniq.append(n)
    return uniq[:40]


def attach_books(programs: list[Program], subjects: dict[str, ExamSubject]) -> None:
    for prog in programs:
        for bucket in (prog.initial_subjects, prog.retest_subjects):
            for sub in bucket:
                hit = subjects.get(sub.code)
                if hit:
                    sub.books = hit.books
                    sub.official_url = hit.official_url


def default_scores() -> list[ScoreLine]:
    """官方公开的国家线 + 学院 2026 复试细则划线（见 snapshot 原文）。"""
    return [
        ScoreLine(
            year="2026",
            program_code="0903",
            program_name="农学门类国家A线（学硕适用下限）",
            total=240,
            politics=33,
            foreign=33,
            major1=50,
            major2=50,
            note="教育部《2026年全国硕士研究生招生考试考生进入复试的初试成绩基本要求》农学[09]",
            source=SOURCES["national_line_2026"],
        ),
        ScoreLine(
            year="2025",
            program_code="0903",
            program_name="农学门类国家A线",
            total=245,
            politics=33,
            foreign=33,
            major1=50,
            major2=50,
            note="教育部公布的农学门类A类考生要求",
            source="https://yz.chsi.com.cn/",
        ),
        ScoreLine(
            year="2024",
            program_code="0903",
            program_name="农学门类国家A线",
            total=251,
            politics=33,
            foreign=33,
            major1=50,
            major2=50,
            note="教育部公布的农学门类A类考生要求",
            source="https://yz.chsi.com.cn/",
        ),
        ScoreLine(
            year="2026",
            program_code="090301",
            program_name="土壤学（学院复试线）",
            total=273,
            politics=33,
            foreign=45,
            major1=50,
            major2=50,
            planned=31,
            note="资源与环境科学学院2026年硕士研究生复试录取工作细则；计划数含推免及专项",
            source=SOURCES["retest_2026"],
        ),
        ScoreLine(
            year="2026",
            program_code="090302",
            program_name="植物营养学（学院复试线）",
            total=275,
            politics=33,
            foreign=45,
            major1=50,
            major2=50,
            planned=59,
            note="资源与环境科学学院2026年硕士研究生复试录取工作细则；计划数含推免及专项",
            source=SOURCES["retest_2026"],
        ),
    ]


def scrape_all(year: str = "2026") -> Snapshot:
    warnings: list[str] = []
    extra: dict[str, Any] = {}
    try:
        programs, meta = fetch_catalog(year)
        extra.update(meta)
        warnings.extend(meta.get("warnings") or [])
    except Exception as exc:  # noqa: BLE001 — surface scrape errors in snapshot
        programs = []
        warnings.append(f"招生目录抓取失败：{exc}")

    academic = [p for p in programs if p.code in ACADEMIC_MASTER_CODES]
    extra["college_all_programs"] = [p.model_dump() for p in programs]
    extra["academic_count"] = len(academic)

    codes: list[str] = []
    for p in academic or programs:
        for s in p.initial_subjects + p.retest_subjects:
            if s.code and s.code not in codes:
                codes.append(s.code)
    subjects: dict[str, ExamSubject] = {}
    if codes:
        try:
            subjects = fetch_subjects(codes)
            attach_books(academic or programs, subjects)
        except Exception as exc:  # noqa: BLE001
            warnings.append(f"参考书目抓取失败：{exc}")

    try:
        notices = fetch_notices()
    except Exception as exc:  # noqa: BLE001
        notices = []
        warnings.append(f"通知抓取失败：{exc}")

    snapshot = Snapshot(
        scraped_at=datetime.now(BJ).isoformat(timespec="seconds"),
        year=year,
        programs=academic,
        subjects=subjects,
        notices=notices,
        scores=default_scores(),
        warnings=warnings,
        sources=SOURCES,
        extra=extra,
    )
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    path = SNAPSHOT_DIR / "latest.json"
    path.write_text(json.dumps(snapshot.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")
    return snapshot


def load_snapshot() -> Snapshot | None:
    path = SNAPSHOT_DIR / "latest.json"
    if not path.exists():
        return None
    return Snapshot.model_validate_json(path.read_text(encoding="utf-8"))


def load_guides() -> dict[str, str]:
    from njau_are.config import GUIDES_DIR

    out: dict[str, str] = {}
    if not GUIDES_DIR.exists():
        return out
    for p in sorted(GUIDES_DIR.glob("*.md")):
        out[p.stem] = p.read_text(encoding="utf-8")
    return out


def snapshot_mtime() -> str | None:
    path = SNAPSHOT_DIR / "latest.json"
    if not path.exists():
        return None
    return datetime.fromtimestamp(path.stat().st_mtime, BJ).isoformat(timespec="seconds")
