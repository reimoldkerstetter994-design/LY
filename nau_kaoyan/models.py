from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime, timezone
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_dict(obj: Any) -> Any:
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: to_dict(v) for k, v in asdict(obj).items()}
    if isinstance(obj, list):
        return [to_dict(x) for x in obj]
    if isinstance(obj, dict):
        return {k: to_dict(v) for k, v in obj.items()}
    return obj


@dataclass
class SourceHit:
    source: str
    url: str
    fetched_at: str
    ok: bool
    detail: str = ""


@dataclass
class ExamSubject:
    code: str
    name: str
    kind: str  # 初试 / 复试
    books: list[str] = field(default_factory=list)
    outline: str = ""
    url: str = ""


@dataclass
class Program:
    year: str
    college_code: str
    college_name: str
    code: str
    name: str
    degree_type: str
    planned: str
    directions: list[str] = field(default_factory=list)
    initial_subjects: list[ExamSubject] = field(default_factory=list)
    retest_subjects: list[ExamSubject] = field(default_factory=list)
    remark: str = ""
    source_url: str = ""
    is_target: bool = False


@dataclass
class NewsItem:
    title: str
    url: str
    date: str
    summary: str
    source: str
    list_name: str
    relevant: bool = False
    attachments: list[dict[str, str]] = field(default_factory=list)
    body: str = ""


@dataclass
class Teacher:
    name: str
    title: str
    department: str
    unit: str
    is_master_tutor: bool
    is_phd_tutor: bool
    profile: str
    homepage: str
    research: str = ""


@dataclass
class Snapshot:
    generated_at: str
    years_available: list[str]
    latest_catalog_year: str
    programs: list[Program]
    subjects: list[ExamSubject]
    news: list[NewsItem]
    teachers: list[Teacher]
    discipline: dict[str, Any]
    national_lines: list[dict[str, Any]]
    contacts: dict[str, str]
    source_hits: list[SourceHit]
    notes: list[str]
