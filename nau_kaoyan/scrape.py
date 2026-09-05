from __future__ import annotations

from nau_kaoyan.config import SCHOOL_NAME, COLLEGE_NAME, DISCIPLINE_NAME, TARGET_PROGRAMS
from nau_kaoyan.http_client import Fetcher
from nau_kaoyan.models import ExamSubject, Snapshot, utc_now
from nau_kaoyan.sources.catalog import discover_catalog_years, fetch_college_catalog, parse_programs
from nau_kaoyan.sources.discipline import scrape_discipline
from nau_kaoyan.sources.faculty import scrape_faculty
from nau_kaoyan.sources.national import scrape_national_lines
from nau_kaoyan.sources.news import scrape_news
from nau_kaoyan.sources.subjects import enrich_subjects
from nau_kaoyan.store import save_snapshot


CONTACTS = {
    "学校": SCHOOL_NAME,
    "学院": COLLEGE_NAME,
    "学科": DISCIPLINE_NAME,
    "培养地点": "滨江校区（江苏省南京江北新区滨江大道666号，邮编211800）",
    "学院研究生办电话": "025-84395620",
    "研招办电话": "025-84395345",
    "研招网": "https://zsgz.njau.edu.cn/",
    "学院官网": "https://re.njau.edu.cn/",
    "官方目录系统": "https://yzglxt.njau.edu.cn/",
    "中国研招网": "https://yz.chsi.com.cn/",
}


def collect(save: bool = True) -> Snapshot:
    fetcher = Fetcher()
    source_hits = []
    notes = [
        "本工具只抓取高校研招网、学院官网、研招目录系统和研招网等公开网页，不登录、不绕过权限、不采集商业真题站。",
        "招生人数含推免，最终以教育部下达计划和当年复试录取文件为准。",
        "857 等自命题科目参考书来自学校目录系统；314/315 为全国农学门类联考，大纲以教育部/研招网公布为准。",
        "教材与真题受著作权保护，这里只汇总书目与官方入口，不提供盗版全文。",
    ]
    try:
        years, year_hits = discover_catalog_years(fetcher)
        source_hits.extend(year_hits)
        programs = []
        latest_year = years[0] if years else ""
        for year in years:
            html, url, hit = fetch_college_catalog(fetcher, year)
            source_hits.append(hit)
            if hit.ok:
                programs.extend(parse_programs(html, year, url))

        target = [p for p in programs if p.is_target]
        subject_pool: list[ExamSubject] = []
        for prog in target:
            subject_pool.extend(prog.initial_subjects)
            subject_pool.extend(prog.retest_subjects)

        subjects, sub_hits = enrich_subjects(fetcher, subject_pool, latest_year or "2026")
        source_hits.extend(sub_hits)
        by_url = {s.url: s for s in subjects if s.url}
        latest_by_code: dict[str, ExamSubject] = {}
        for sub in subjects:
            latest_by_code.setdefault(sub.code, sub)
        for prog in programs:
            for bucket in (prog.initial_subjects, prog.retest_subjects):
                for i, sub in enumerate(bucket):
                    filled = by_url.get(sub.url)
                    if filled is None and prog.year == latest_year:
                        filled = latest_by_code.get(sub.code)
                    if filled:
                        bucket[i].books = filled.books
                        bucket[i].url = filled.url or sub.url

        news, news_hits = scrape_news(fetcher)
        source_hits.extend(news_hits)
        teachers, teacher_hits = scrape_faculty(fetcher)
        source_hits.extend(teacher_hits)
        discipline, disc_hits = scrape_discipline(fetcher)
        source_hits.extend(disc_hits)
        national_lines, line_hits = scrape_national_lines(fetcher)
        source_hits.extend(line_hits)

        if not latest_year:
            notes.append("尚未探测到可用的招生目录系统年份，请稍后重试或直接打开研招网。")
        elif "2027" not in years:
            notes.append("2027 年正式目录系统尚未上线，当前展示最近可用年份，并保留 2027 预通知。")

        missing = [code for code in TARGET_PROGRAMS if not any(p.code == code and p.year == latest_year for p in programs)]
        if missing and latest_year:
            notes.append(f"{latest_year} 目录中未解析到：{', '.join(missing)}，请核对着官方目录系统。")

        snapshot = Snapshot(
            generated_at=utc_now(),
            years_available=years,
            latest_catalog_year=latest_year,
            programs=programs,
            subjects=_unique_latest_subjects(subjects),
            news=news,
            teachers=teachers,
            discipline=discipline,
            national_lines=national_lines,
            contacts=CONTACTS,
            source_hits=source_hits,
            notes=notes,
        )
        if save:
            save_snapshot(snapshot)
        return snapshot
    finally:
        fetcher.close()


def _unique_latest_subjects(subjects: list[ExamSubject]) -> list[ExamSubject]:
    seen: set[tuple[str, str]] = set()
    out: list[ExamSubject] = []
    for sub in subjects:
        key = (sub.kind, sub.code)
        if key in seen:
            continue
        seen.add(key)
        out.append(sub)
    return out
