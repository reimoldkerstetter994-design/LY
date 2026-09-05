from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ResearchDirection(BaseModel):
    code: str
    name: str
    full_time: bool = True


class ExamSubject(BaseModel):
    code: str
    name: str
    kind: str = "初试"  # 初试 / 复试
    books: str = ""
    official_url: str = ""


class Program(BaseModel):
    year: str
    college: str
    college_phone: str = ""
    code: str
    name: str
    degree_type: str
    planned: int | None = None
    directions: list[ResearchDirection] = Field(default_factory=list)
    initial_subjects: list[ExamSubject] = Field(default_factory=list)
    retest_subjects: list[ExamSubject] = Field(default_factory=list)
    remark: str = ""
    source_url: str = ""


class Notice(BaseModel):
    title: str
    url: str
    date: str = ""
    source: str = ""
    summary: str = ""


class ScoreLine(BaseModel):
    year: str
    program_code: str
    program_name: str
    total: int
    politics: int
    foreign: int
    major1: int
    major2: int
    planned: int | None = None
    note: str = ""
    source: str = ""


class Snapshot(BaseModel):
    scraped_at: str
    year: str
    programs: list[Program]
    subjects: dict[str, ExamSubject]
    notices: list[Notice]
    scores: list[ScoreLine]
    warnings: list[str] = Field(default_factory=list)
    sources: dict[str, str] = Field(default_factory=dict)
    extra: dict[str, Any] = Field(default_factory=dict)
