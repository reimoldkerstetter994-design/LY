from __future__ import annotations

from datetime import datetime
from urllib.parse import urlencode

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import (
    ACADEMIC_MASTER_CODES,
    CATALOG_URL,
    CATALOG_YEAR,
    COLLEGE_CODE,
    COLLEGE_BASE,
    COLLEGE_PAGES,
    FACULTY_API,
    FACULTY_SITE_OWNER,
    FACULTY_UNITS,
    FACULTY_VIEW_ID,
    NOTICE_LISTS,
    RELATED_PROFESSIONAL_CODES,
)
from app.db import (
    Attachment,
    CrawlLog,
    CrawlRun,
    Notice,
    PageDoc,
    Program,
    ProgramSubject,
    Subject,
    Teacher,
    init_db,
    session as db_session,
)
from app.http_client import PoliteClient
from app.sources.catalog import parse_catalog_html, parse_hidden, parse_subject_books
from app.sources.college import parse_college_news
from app.sources.faculty import parse_teacher_payload
from app.sources.notices import (
    is_are_attachment,
    parse_notice_detail,
    parse_notice_list,
    parse_plain_page,
    relevance_for,
)


async def run_crawl() -> dict:
    init_db()
    db = db_session()
    run = CrawlRun(status="running")
    db.add(run)
    db.commit()
    db.refresh(run)
    client = PoliteClient()
    pages_ok = 0
    pages_fail = 0
    notes: list[str] = []
    try:
        catalog_count = await _crawl_catalog(client, db, run.id)
        pages_ok += 1
        notes.append(f"专业目录 {catalog_count} 条")
        subject_count = await _crawl_subjects(client, db, run.id)
        notes.append(f"科目参考书 {subject_count} 门")
        notice_count = await _crawl_notices(client, db, run.id)
        notes.append(f"通知 {notice_count} 条")
        pages_ok += 3
        teacher_count = await _crawl_faculty(client, db, run.id)
        notes.append(f"导师 {teacher_count} 人")
        pages_ok += 1
        await _crawl_college_pages(client, db, run.id)
        pages_ok += 1
        run.status = "ok"
        run.summary = "；".join(notes)
    except Exception as exc:  # noqa: BLE001
        run.status = "error"
        run.error = str(exc)
        pages_fail += 1
        raise
    finally:
        run.finished_at = datetime.utcnow()
        run.pages_ok = pages_ok
        run.pages_fail = pages_fail
        db.commit()
        await client.aclose()
        payload = snapshot(db)
        db.close()
    return payload


async def _log(db: Session, run_id: int, source: str, url: str, ok: bool, detail: str = "") -> None:
    db.add(CrawlLog(run_id=run_id, source=source, url=url, ok=ok, detail=detail[:1000]))
    db.commit()


async def _crawl_catalog(client: PoliteClient, db: Session, run_id: int) -> int:
    first = await client.get(CATALOG_URL)
    first.raise_for_status()
    vs = parse_hidden(first.text, "__VIEWSTATE")
    ev = parse_hidden(first.text, "__EVENTVALIDATION")
    vg = parse_hidden(first.text, "__VIEWSTATEGENERATOR")
    resp = await client.post(
        CATALOG_URL,
        data={
            "__EVENTTARGET": "",
            "__EVENTARGUMENT": "",
            "__LASTFOCUS": "",
            "__VIEWSTATE": vs,
            "__VIEWSTATEGENERATOR": vg,
            "__EVENTVALIDATION": ev,
            "drpnd": CATALOG_YEAR,
            "drpyx": COLLEGE_CODE,
            "btnSearch": "查 询",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded", "Referer": CATALOG_URL},
    )
    resp.raise_for_status()
    await _log(db, run_id, "catalog", CATALOG_URL, True, f"status={resp.status_code}")
    records = parse_catalog_html(resp.text, CATALOG_URL)
    keep_codes = set(ACADEMIC_MASTER_CODES) | set(RELATED_PROFESSIONAL_CODES)
    records = [r for r in records if r.code in keep_codes]
    db.execute(delete(ProgramSubject))
    db.execute(delete(Program))
    for rec in records:
        program = Program(
            year=rec.year,
            code=rec.code,
            name=rec.name,
            degree_type=rec.degree_type,
            planned_seats=rec.planned_seats,
            directions="\n".join(rec.directions),
            notes=rec.notes,
            college=rec.college,
            source_url=rec.source_url,
        )
        db.add(program)
        db.flush()
        for sub in rec.subjects:
            db.add(
                ProgramSubject(
                    program_id=program.id,
                    subject_code=sub.code,
                    subject_name=sub.name,
                    stage=sub.stage,
                    slot=sub.slot,
                    optional_group=sub.optional_group,
                )
            )
            existing = db.scalar(select(Subject).where(Subject.code == sub.code))
            if existing is None:
                db.add(Subject(code=sub.code, name=sub.name, source_url=sub.url))
            elif not existing.name:
                existing.name = sub.name
    db.commit()
    return len(records)


async def _crawl_subjects(client: PoliteClient, db: Session, run_id: int) -> int:
    subjects = db.scalars(select(Subject)).all()
    count = 0
    for subject in subjects:
        if not subject.source_url:
            continue
        try:
            resp = await client.get(subject.source_url)
            resp.raise_for_status()
            subject.books = parse_subject_books(resp.text)
            subject.updated_at = datetime.utcnow()
            await _log(db, run_id, "subject", subject.source_url, True, subject.name)
            count += 1
        except Exception as exc:  # noqa: BLE001
            await _log(db, run_id, "subject", subject.source_url, False, str(exc))
    db.commit()
    return count


async def _crawl_notices(client: PoliteClient, db: Session, run_id: int) -> int:
    stubs = []
    seen_urls: set[str] = set()
    for list_url in NOTICE_LISTS:
        try:
            resp = await client.get(list_url)
            resp.raise_for_status()
            found = parse_notice_list(resp.text, list_url, "南农研招网")
            await _log(db, run_id, "notice-list", list_url, True, str(len(found)))
            for stub in found:
                if stub.url in seen_urls:
                    continue
                seen_urls.add(stub.url)
                stubs.append(stub)
        except Exception as exc:  # noqa: BLE001
            await _log(db, run_id, "notice-list", list_url, False, str(exc))

    try:
        home = await client.get(f"{COLLEGE_BASE}/index.htm")
        home.raise_for_status()
        college_stubs = parse_college_news(home.text, str(home.url))
        await _log(db, run_id, "college-home", str(home.url), True, str(len(college_stubs)))
        for stub in college_stubs:
            if stub.url in seen_urls:
                continue
            seen_urls.add(stub.url)
            stubs.append(stub)
    except Exception as exc:  # noqa: BLE001
        await _log(db, run_id, "college-home", "", False, str(exc))

    ranked = sorted(
        stubs,
        key=lambda s: (0 if relevance_for(s.title, s.summary)[1] == "are" else 1 if relevance_for(s.title, s.summary)[1] == "school" else 2, s.title),
    )
    to_fetch = ranked[:28]
    for stub in to_fetch:
        relevant, kind = relevance_for(stub.title, stub.summary)
        notice = db.scalar(select(Notice).where(Notice.url == stub.url))
        if notice is None:
            notice = Notice(url=stub.url, title=stub.title, source=stub.source)
            db.add(notice)
            db.flush()
        notice.title = stub.title or notice.title
        notice.source = stub.source
        notice.published_at = stub.published_at or notice.published_at
        notice.summary = stub.summary
        notice.relevant = relevant
        notice.relevance = kind
        notice.fetched_at = datetime.utcnow()
        try:
            resp = await client.get(stub.url)
            resp.raise_for_status()
            detail = parse_notice_detail(resp.text, stub.url)
            notice.body = detail.body
            notice.published_at = detail.published_at or notice.published_at
            if detail.title:
                notice.title = detail.title
            relevant, kind = relevance_for(notice.title, notice.body)
            notice.relevant = relevant
            notice.relevance = kind
            db.execute(delete(Attachment).where(Attachment.notice_id == notice.id))
            for name, url in detail.attachments:
                db.add(
                    Attachment(
                        notice_id=notice.id,
                        name=name,
                        url=url,
                        highlighted=is_are_attachment(name),
                    )
                )
            await _log(db, run_id, "notice", stub.url, True, notice.title)
        except Exception as exc:  # noqa: BLE001
            await _log(db, run_id, "notice", stub.url, False, str(exc))
    db.commit()
    return len(to_fetch)


async def _crawl_faculty(client: PoliteClient, db: Session, run_id: int) -> int:
    db.execute(delete(Teacher))
    total = 0
    for unit in FACULTY_UNITS:
        page = 1
        while page <= 8:
            params = {
                "collegeid": unit["collegeid"],
                "isshowpage": "false",
                "postdutyid": "0",
                "postdutyname": "",
                "facultyid": "0",
                "disciplineid": "0",
                "rankcode": "",
                "ranklevel": "0",
                "jobtypecode": "",
                "enrollid": "0",
                "pageindex": str(page),
                "pagesize": "50",
                "login": "false",
                "profilelen": "160",
                "honorid": "0",
                "pinyin": "",
                "rankid": "0",
                "isbd": "0",
                "atschool": "0",
                "teacherName": "",
                "searchDirection": "",
                "viewmode": "10",
                "viewOwner": FACULTY_SITE_OWNER,
                "viewid": FACULTY_VIEW_ID,
                "siteOwner": FACULTY_SITE_OWNER,
                "viewUniqueId": "u7",
                "showlang": "zh_CN",
                "ellipsis": "...",
                "actiontype": "advancesearch",
            }
            url = f"{FACULTY_API}?{urlencode(params)}"
            try:
                resp = await client.get(url, headers={"Referer": "https://re.njau.edu.cn/jsfc2.jsp"})
                resp.raise_for_status()
                payload = resp.json()
                records = parse_teacher_payload(payload)
                await _log(db, run_id, "faculty", url, True, f"{unit['label']} p{page} n={len(records)}")
                for rec in records:
                    if "土壤" not in rec.unit and "植物营养" not in rec.unit:
                        continue
                    if db.scalar(select(Teacher).where(Teacher.teacher_id == rec.teacher_id)):
                        continue
                    db.add(
                        Teacher(
                            teacher_id=rec.teacher_id,
                            name=rec.name,
                            unit=rec.unit or unit["label"],
                            rank=rec.rank,
                            discipline=rec.discipline,
                            master_tutor=rec.master_tutor,
                            doctoral_tutor=rec.doctoral_tutor,
                            profile=rec.profile,
                            homepage=rec.homepage,
                            email=rec.email,
                        )
                    )
                    total += 1
                total_pages = int(payload.get("totalpage") or 1)
                if page >= total_pages or not records:
                    break
                page += 1
            except Exception as exc:  # noqa: BLE001
                await _log(db, run_id, "faculty", url, False, str(exc))
                break
    db.commit()
    return total


async def _crawl_college_pages(client: PoliteClient, db: Session, run_id: int) -> None:
    mapping = {
        "discipline": COLLEGE_PAGES[0],
        "discipline_points": COLLEGE_PAGES[1],
        "college_intro": COLLEGE_PAGES[2],
        "contacts": COLLEGE_PAGES[3],
    }
    for key, url in mapping.items():
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            text = parse_plain_page(resp.text)
            doc = db.scalar(select(PageDoc).where(PageDoc.key == key))
            if doc is None:
                doc = PageDoc(key=key, url=url)
                db.add(doc)
            doc.title = {
                "discipline": "农业资源与环境学科",
                "discipline_points": "学科点介绍",
                "college_intro": "学院介绍",
                "contacts": "联系我们",
            }[key]
            doc.url = url
            doc.text = text
            doc.updated_at = datetime.utcnow()
            await _log(db, run_id, "page", url, True, key)
        except Exception as exc:  # noqa: BLE001
            await _log(db, run_id, "page", url, False, str(exc))
    db.commit()


def snapshot(db: Session | None = None) -> dict:
    close = False
    if db is None:
        init_db()
        db = db_session()
        close = True
    run = db.scalar(select(CrawlRun).order_by(CrawlRun.id.desc()))
    programs = db.scalars(select(Program).order_by(Program.code)).all()
    subjects = {s.code: s for s in db.scalars(select(Subject)).all()}
    program_payload = []
    for program in programs:
        links = db.scalars(
            select(ProgramSubject).where(ProgramSubject.program_id == program.id)
        ).all()
        program_payload.append(
            {
                "year": program.year,
                "code": program.code,
                "name": program.name,
                "degree_type": program.degree_type,
                "planned_seats": program.planned_seats,
                "directions": [d for d in program.directions.split("\n") if d],
                "notes": program.notes,
                "college": program.college,
                "source_url": program.source_url,
                "is_academic": program.code in ACADEMIC_MASTER_CODES,
                "subjects": [
                    {
                        "code": link.subject_code,
                        "name": link.subject_name,
                        "stage": link.stage,
                        "slot": link.slot,
                        "optional_group": link.optional_group,
                        "books": (subjects.get(link.subject_code).books if subjects.get(link.subject_code) else ""),
                        "source_url": (subjects.get(link.subject_code).source_url if subjects.get(link.subject_code) else ""),
                    }
                    for link in links
                ],
            }
        )
    notices = db.scalars(select(Notice).order_by(Notice.published_at.desc(), Notice.fetched_at.desc())).all()
    notice_payload = []
    for notice in notices:
        atts = db.scalars(select(Attachment).where(Attachment.notice_id == notice.id)).all()
        notice_payload.append(
            {
                "source": notice.source,
                "url": notice.url,
                "title": notice.title,
                "published_at": notice.published_at,
                "summary": notice.summary,
                "body": notice.body,
                "relevant": notice.relevant,
                "relevance": notice.relevance,
                "attachments": [
                    {"name": a.name, "url": a.url, "highlighted": a.highlighted} for a in atts
                ],
            }
        )
    teachers = db.scalars(select(Teacher).order_by(Teacher.unit, Teacher.name)).all()
    docs = {d.key: {"title": d.title, "url": d.url, "text": d.text} for d in db.scalars(select(PageDoc)).all()}
    logs = db.scalars(select(CrawlLog).order_by(CrawlLog.id.desc()).limit(40)).all()
    payload = {
        "run": None
        if run is None
        else {
            "id": run.id,
            "started_at": _iso(run.started_at),
            "finished_at": _iso(run.finished_at),
            "status": run.status,
            "summary": run.summary,
            "error": run.error,
        },
        "programs": program_payload,
        "notices": notice_payload,
        "teachers": [
            {
                "name": t.name,
                "unit": t.unit,
                "rank": t.rank,
                "discipline": t.discipline,
                "master_tutor": t.master_tutor,
                "doctoral_tutor": t.doctoral_tutor,
                "profile": t.profile,
                "homepage": t.homepage,
                "email": t.email,
            }
            for t in teachers
        ],
        "docs": docs,
        "logs": [{"source": l.source, "url": l.url, "ok": l.ok, "detail": l.detail} for l in logs],
    }
    if close:
        db.close()
    return payload


def _iso(value: datetime | None) -> str | None:
    return value.isoformat(sep=" ", timespec="seconds") if value else None


def to_markdown(data: dict) -> str:
    lines = [
        "# 南京农业大学 农业资源与环境学硕资料快照",
        "",
        "本文件由公开网页实时抓取生成，仅索引官方来源，不收录培训机构付费真题或讲义。",
        "",
    ]
    run = data.get("run") or {}
    lines += [f"- 抓取时间：{run.get('finished_at') or run.get('started_at') or '尚未抓取'}", f"- 状态：{run.get('status') or '-'}", ""]
    lines.append("## 学硕专业目录")
    for program in data.get("programs") or []:
        if not program.get("is_academic"):
            continue
        lines += [
            f"### {program['code']} {program['name']}",
            f"- 学位类型：{program['degree_type']}",
            f"- 拟招生人数（含推免，以当年目录为准）：{program['planned_seats']}",
            f"- 研究方向：{'；'.join(program['directions'])}",
            f"- 备注：{program['notes']}",
            "- 考试科目：",
        ]
        for sub in program["subjects"]:
            book = f" — {sub['books']}" if sub.get("books") else ""
            lines.append(f"  - [{sub['stage']}] {sub['code']} {sub['name']}{book}")
        lines.append("")
    lines.append("## 官方通知")
    for notice in data.get("notices") or []:
        if notice.get("relevance") not in {"are", "school"}:
            continue
        lines.append(f"- [{notice['published_at'] or '日期未解析'}] {notice['title']} ({notice['url']})")
        for att in notice.get("attachments") or []:
            mark = " ★资环相关" if att.get("highlighted") else ""
            lines.append(f"  - 附件{mark}：{att['name']} {att['url']}")
    lines += ["", "## 导师（土壤学系 / 植物营养学系）", ""]
    for teacher in data.get("teachers") or []:
        tutor = "博导" if teacher["doctoral_tutor"] else ("硕导" if teacher["master_tutor"] else "")
        lines.append(
            f"- {teacher['name']}  {teacher['rank']}  {teacher['unit']}  {tutor}  {teacher['homepage']}"
        )
    return "\n".join(lines) + "\n"
