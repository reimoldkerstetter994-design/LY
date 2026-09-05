from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from app.config import DATA_DIR, DB_PATH


class Base(DeclarativeBase):
    pass


class CrawlRun(Base):
    __tablename__ = "crawl_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="running")
    pages_ok: Mapped[int] = mapped_column(Integer, default=0)
    pages_fail: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[str] = mapped_column(String(8), index=True)
    code: Mapped[str] = mapped_column(String(16), index=True)
    name: Mapped[str] = mapped_column(String(128))
    degree_type: Mapped[str] = mapped_column(String(32))
    planned_seats: Mapped[str] = mapped_column(String(32), default="")
    directions: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    college: Mapped[str] = mapped_column(String(64), default="")
    source_url: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    subjects: Mapped[list["ProgramSubject"]] = relationship(
        back_populates="program", cascade="all, delete-orphan"
    )


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(256), default="")
    books: Mapped[str] = mapped_column(Text, default="")
    source_url: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProgramSubject(Base):
    __tablename__ = "program_subjects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    program_id: Mapped[int] = mapped_column(ForeignKey("programs.id"))
    subject_code: Mapped[str] = mapped_column(String(16), index=True)
    subject_name: Mapped[str] = mapped_column(String(256), default="")
    stage: Mapped[str] = mapped_column(String(16), default="初试")
    slot: Mapped[str] = mapped_column(String(8), default="")
    optional_group: Mapped[str] = mapped_column(String(32), default="")

    program: Mapped[Program] = relationship(back_populates="subjects")


class Notice(Base):
    __tablename__ = "notices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(64), index=True)
    url: Mapped[str] = mapped_column(Text, unique=True)
    title: Mapped[str] = mapped_column(String(512))
    published_at: Mapped[str] = mapped_column(String(32), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    body: Mapped[str] = mapped_column(Text, default="")
    relevant: Mapped[bool] = mapped_column(Boolean, default=False)
    relevance: Mapped[str] = mapped_column(String(32), default="general")
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="notice", cascade="all, delete-orphan"
    )


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    notice_id: Mapped[int | None] = mapped_column(ForeignKey("notices.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(512))
    url: Mapped[str] = mapped_column(Text)
    highlighted: Mapped[bool] = mapped_column(Boolean, default=False)

    notice: Mapped["Notice | None"] = relationship(back_populates="attachments")


class Teacher(Base):
    __tablename__ = "teachers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    teacher_id: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(64), index=True)
    unit: Mapped[str] = mapped_column(String(128), default="")
    rank: Mapped[str] = mapped_column(String(64), default="")
    discipline: Mapped[str] = mapped_column(String(64), default="")
    master_tutor: Mapped[bool] = mapped_column(Boolean, default=False)
    doctoral_tutor: Mapped[bool] = mapped_column(Boolean, default=False)
    profile: Mapped[str] = mapped_column(Text, default="")
    homepage: Mapped[str] = mapped_column(Text, default="")
    email: Mapped[str] = mapped_column(String(128), default="")


class PageDoc(Base):
    __tablename__ = "page_docs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(256), default="")
    url: Mapped[str] = mapped_column(Text, default="")
    text: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CrawlLog(Base):
    __tablename__ = "crawl_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int | None] = mapped_column(ForeignKey("crawl_runs.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(64))
    url: Mapped[str] = mapped_column(Text)
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


_engine = None
SessionLocal = None


def get_engine():
    global _engine, SessionLocal
    if _engine is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(f"sqlite:///{DB_PATH}", future=True)
        SessionLocal = sessionmaker(_engine, expire_on_commit=False)
    return _engine


def init_db() -> None:
    engine = get_engine()
    Base.metadata.create_all(engine)


def session():
    get_engine()
    assert SessionLocal is not None
    return SessionLocal()
