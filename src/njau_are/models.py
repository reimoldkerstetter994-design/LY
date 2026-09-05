from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


def _to_dict(obj: Any) -> Any:
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    if isinstance(obj, list):
        return [_to_dict(x) for x in obj]
    return obj


@dataclass
class ExamSubject:
    code: str
    name: str
    kind: str  # initial | retest
    url: str = ""
    reference_books: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ResearchDirection:
    code: str
    name: str
    study_mode: str = "全日制"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Program:
    year: int
    college_code: str
    college_name: str
    major_code: str
    major_name: str
    degree_type: str  # 学硕 | 专硕
    planned_quota: int | None
    directions: list[ResearchDirection] = field(default_factory=list)
    initial_subjects: list[ExamSubject] = field(default_factory=list)
    retest_subjects: list[ExamSubject] = field(default_factory=list)
    notes: str = ""
    source_url: str = ""
    category: str = "core"  # core | related_academic | related_professional

    def to_dict(self) -> dict[str, Any]:
        return {
            "year": self.year,
            "college_code": self.college_code,
            "college_name": self.college_name,
            "major_code": self.major_code,
            "major_name": self.major_name,
            "degree_type": self.degree_type,
            "planned_quota": self.planned_quota,
            "directions": _to_dict(self.directions),
            "initial_subjects": _to_dict(self.initial_subjects),
            "retest_subjects": _to_dict(self.retest_subjects),
            "notes": self.notes,
            "source_url": self.source_url,
            "category": self.category,
        }


@dataclass
class CollegeSnapshot:
    year: int
    college_code: str
    college_name: str
    planned_quota: int | None
    intro: str
    phone: str = ""
    source_url: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Attachment:
    name: str
    url: str
    relevant: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Notice:
    title: str
    url: str
    published: str = ""
    source: str = ""
    summary: str = ""
    attachments: list[Attachment] = field(default_factory=list)
    relevant: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "url": self.url,
            "published": self.published,
            "source": self.source,
            "summary": self.summary,
            "attachments": _to_dict(self.attachments),
            "relevant": self.relevant,
        }


@dataclass
class ScrapeReport:
    scraped_at: str
    catalog_years: list[int]
    college: list[CollegeSnapshot]
    programs: list[Program]
    notices: list[Notice]
    subjects: list[ExamSubject]
    errors: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "scraped_at": self.scraped_at,
            "catalog_years": self.catalog_years,
            "college": _to_dict(self.college),
            "programs": _to_dict(self.programs),
            "notices": _to_dict(self.notices),
            "subjects": _to_dict(self.subjects),
            "errors": self.errors,
            "sources": self.sources,
        }
