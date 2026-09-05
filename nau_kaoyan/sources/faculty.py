from __future__ import annotations

from nau_kaoyan.config import DEPARTMENT_IDS, FACULTY_API, FACULTY_PAGE
from nau_kaoyan.http_client import Fetcher
from nau_kaoyan.models import SourceHit, Teacher, utc_now


def _clean(text: str | None, limit: int = 400) -> str:
    if not text:
        return ""
    return " ".join(str(text).split())[:limit]


def scrape_faculty(fetcher: Fetcher) -> tuple[list[Teacher], list[SourceHit]]:
    hits: list[SourceHit] = []
    teachers: list[Teacher] = []
    seen: set[str] = set()
    for dept_id, dept_name in DEPARTMENT_IDS.items():
        params = {
            "collegeid": dept_id,
            "isshowpage": "true",
            "postdutyid": "0",
            "postdutyname": "",
            "facultyid": "0",
            "disciplineid": "0",
            "rankcode": "",
            "ranklevel": "",
            "jobtypecode": "",
            "enrollid": "0",
            "pageindex": "1",
            "pagesize": "80",
            "login": "true",
            "profilelen": "180",
            "honorid": "0",
            "pinyin": "",
            "rankid": "0",
            "isbd": "0",
            "atschool": "0",
            "teacherName": "",
            "searchDirection": "",
            "viewmode": "10",
            "viewOwner": "",
            "viewid": "1094666",
            "siteOwner": "1344679703",
            "viewUniqueId": "u7",
            "showlang": "zh_CN",
            "ellipsis": "...",
            "actiontype": "advancesearch",
        }
        try:
            data = fetcher.get_json(FACULTY_API, params=params)
            rows = data.get("teacherData") or []
            hits.append(
                SourceHit(
                    "faculty",
                    FACULTY_API + f"?collegeid={dept_id}",
                    utc_now(),
                    True,
                    f"{dept_name} {len(rows)}/{data.get('totalnum', len(rows))}",
                )
            )
            for row in rows:
                name = _clean(row.get("showName") or row.get("name"), 40)
                if not name or name in seen:
                    continue
                seen.add(name)
                teachers.append(
                    Teacher(
                        name=name,
                        title=_clean(row.get("prorank"), 40),
                        department=dept_name,
                        unit=_clean(row.get("unit"), 80),
                        is_master_tutor=bool(row.get("gtutor")),
                        is_phd_tutor=bool(row.get("doctorTutor")),
                        profile=_clean(row.get("showProfile") or row.get("profile"), 280),
                        homepage=_clean(row.get("url"), 200),
                        research=_clean(row.get("discipline"), 80),
                    )
                )
        except Exception as exc:  # noqa: BLE001
            hits.append(SourceHit("faculty", FACULTY_API, utc_now(), False, f"{dept_name}: {exc}"))
    hits.append(SourceHit("faculty-page", FACULTY_PAGE, utc_now(), True, "学院师资介绍入口"))
    teachers.sort(key=lambda t: (t.department, not t.is_phd_tutor, not t.is_master_tutor, t.name))
    return teachers, hits
