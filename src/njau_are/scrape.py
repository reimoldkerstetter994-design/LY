from __future__ import annotations

from datetime import datetime, timezone

from njau_are.config import (
    COLLEGE_CODE,
    COLLEGE_LISTS,
    COLLEGE_PINNED,
    ZSGZ_LISTS,
    ZSGZ_PINNED,
    candidate_catalog_years,
    catalog_url,
    is_relevant_notice,
    subject_url,
)
from njau_are.http_client import FetchError, HttpClient
from njau_are.models import ExamSubject, Notice, ScrapeReport
from njau_are.parse_catalog import (
    catalog_search_payload,
    extract_hidden_fields,
    parse_catalog_html,
    parse_subject_page,
)
from njau_are.parse_html import list_page_urls, parse_article, parse_college_list, parse_zsgz_list


def _merge_notices(existing: list[Notice], incoming: list[Notice]) -> list[Notice]:
    by_url = {item.url: item for item in existing}
    for item in incoming:
        prev = by_url.get(item.url)
        if prev is None:
            by_url[item.url] = item
            continue
        if len(item.summary) > len(prev.summary):
            prev.summary = item.summary
        if item.published and not prev.published:
            prev.published = item.published
        if item.attachments and not prev.attachments:
            prev.attachments = item.attachments
        prev.relevant = prev.relevant or item.relevant
    return list(by_url.values())


class NjauAreScraper:
    def __init__(self, client: HttpClient | None = None) -> None:
        self.client = client or HttpClient()

    def discover_catalog_years(self) -> list[int]:
        found: list[int] = []
        for year in candidate_catalog_years():
            try:
                self.client.get(catalog_url(year))
            except FetchError:
                continue
            found.append(year)
        return found

    def scrape_catalog(self, year: int) -> tuple:
        url = catalog_url(year)
        landing = self.client.get_text(url)
        payload = catalog_search_payload(extract_hidden_fields(landing), year, COLLEGE_CODE)
        html = self.client.post(url, payload).text
        return parse_catalog_html(html, year, url)

    def scrape_subjects(self, year: int, codes: set[str]) -> list[ExamSubject]:
        subjects: list[ExamSubject] = []
        for code in sorted(codes):
            url = subject_url(year, code)
            try:
                html = self.client.get_text(url)
            except FetchError:
                continue
            subjects.append(parse_subject_page(html, code, url))
        return subjects

    def scrape_zsgz_lists(self) -> list[Notice]:
        notices: list[Notice] = []
        for list_url in ZSGZ_LISTS:
            try:
                first = self.client.get_text(list_url)
            except FetchError:
                continue
            pages = list_page_urls(list_url, first, max_pages=4)
            htmls = [first]
            for page_url in pages[1:]:
                try:
                    htmls.append(self.client.get_text(page_url))
                except FetchError:
                    break
            for page_url, html in zip(pages, htmls):
                notices = _merge_notices(notices, parse_zsgz_list(html, page_url))
        return notices

    def scrape_college_lists(self) -> list[Notice]:
        notices: list[Notice] = []
        for list_url in COLLEGE_LISTS:
            try:
                first = self.client.get_text(list_url)
            except FetchError:
                continue
            # College Visual SiteBuilder numbered pages jump to old archives;
            # keep the current list plus pinned article URLs.
            pages = list_page_urls(list_url, first, max_pages=1)
            htmls = [first]
            for page_url in pages[1:]:
                try:
                    htmls.append(self.client.get_text(page_url))
                except FetchError:
                    break
            for page_url, html in zip(pages, htmls):
                notices = _merge_notices(
                    notices, parse_college_list(html, page_url, source="资环学院")
                )
        return notices

    def enrich_notices(self, notices: list[Notice], limit: int = 28) -> list[Notice]:
        ranked = sorted(
            notices,
            key=lambda n: (not n.relevant, n.published == "", n.published),
            reverse=False,
        )
        # Prefer relevant items, then newest dates.
        ranked.sort(key=lambda n: n.published, reverse=True)
        ranked.sort(key=lambda n: n.relevant, reverse=True)
        chosen = [n for n in ranked if n.relevant][:limit]
        extras = [url for url in (*ZSGZ_PINNED, *COLLEGE_PINNED)]
        have = {n.url for n in chosen}
        for url in extras:
            if url not in have:
                chosen.append(Notice(title="", url=url, source="官方固定入口", relevant=True))
                have.add(url)
        enriched: list[Notice] = []
        for item in chosen:
            source = "资环学院" if "re.njau.edu.cn" in item.url else "南农研招网"
            try:
                html = self.client.get_text(item.url)
            except FetchError:
                if item.title:
                    enriched.append(item)
                continue
            detail = parse_article(html, item.url, source=source)
            if item.title and not detail.title:
                detail.title = item.title
            if item.published and not detail.published:
                detail.published = item.published
            if item.summary and len(item.summary) > len(detail.summary):
                detail.summary = item.summary
            detail.relevant = detail.relevant or item.relevant or is_relevant_notice(
                detail.title, detail.summary
            )
            enriched.append(detail)
        return enriched

    def run(self) -> ScrapeReport:
        errors: list[str] = []
        sources: list[str] = []
        years = self.discover_catalog_years()
        colleges = []
        programs = []
        for year in years:
            try:
                college, year_programs = self.scrape_catalog(year)
            except FetchError as exc:
                errors.append(str(exc))
                continue
            sources.append(catalog_url(year))
            if college:
                colleges.append(college)
            programs.extend(year_programs)

        latest_year = years[0] if years else datetime.now().year
        subject_codes: set[str] = set()
        for program in programs:
            if program.year != latest_year:
                continue
            if program.category != "core":
                continue
            for subject in (*program.initial_subjects, *program.retest_subjects):
                subject_codes.add(subject.code)
        subjects = self.scrape_subjects(latest_year, subject_codes)
        book_by_code = {item.code: item for item in subjects}
        for program in programs:
            if program.year != latest_year:
                continue
            for subject in (*program.initial_subjects, *program.retest_subjects):
                if subject.code in book_by_code:
                    subject.reference_books = book_by_code[subject.code].reference_books
                    subject.url = book_by_code[subject.code].url or subject.url

        notices: list[Notice] = []
        try:
            notices = _merge_notices(notices, self.scrape_zsgz_lists())
        except FetchError as exc:
            errors.append(str(exc))
        try:
            notices = _merge_notices(notices, self.scrape_college_lists())
        except FetchError as exc:
            errors.append(str(exc))
        try:
            notices = self.enrich_notices(notices)
        except FetchError as exc:
            errors.append(str(exc))

        sources.extend(ZSGZ_LISTS)
        sources.extend(COLLEGE_LISTS)
        notices.sort(key=lambda n: (n.published, n.title), reverse=True)

        return ScrapeReport(
            scraped_at=datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
            catalog_years=years,
            college=colleges,
            programs=programs,
            notices=notices,
            subjects=subjects,
            errors=errors,
            sources=sources,
        )
