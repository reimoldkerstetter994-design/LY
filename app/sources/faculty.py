from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class TeacherRecord:
    teacher_id: str
    name: str
    unit: str
    rank: str
    discipline: str
    master_tutor: bool
    doctoral_tutor: bool
    profile: str
    homepage: str
    email: str


def parse_teacher_payload(payload: dict[str, Any]) -> list[TeacherRecord]:
    records: list[TeacherRecord] = []
    for item in payload.get("teacherData") or []:
        name = (item.get("showName") or item.get("name") or "").strip()
        if not name:
            continue
        records.append(
            TeacherRecord(
                teacher_id=str(item.get("teacherId") or ""),
                name=name,
                unit=(item.get("unit") or "").strip(),
                rank=(item.get("prorank") or item.get("job") or "").strip(),
                discipline=(item.get("discipline") or "").strip(),
                master_tutor=str(item.get("gtutor") or "0") == "1",
                doctoral_tutor=str(item.get("doctorTutor") or "0") == "1",
                profile=(item.get("profile") or item.get("showProfile") or "").strip()[:800],
                homepage=(item.get("url") or "").strip(),
                email=(item.get("email") or "").strip(),
            )
        )
    return records
