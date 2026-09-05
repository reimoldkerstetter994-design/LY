from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any


def today_stamp() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _news_titles(data: dict[str, Any]) -> list[str]:
    titles = []
    for item in data.get("related_news", []):
        title = item.get("title")
        if title:
            titles.append(title)
    return titles


def _books(data: dict[str, Any]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for ref in data.get("subject_references", []):
        code = ref.get("code", "")
        result[code] = list(ref.get("books") or [])
    return result


def _quotas(data: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for major in data.get("catalog", {}).get("majors", []):
        key = f"{major.get('code', '')} {major.get('name', '')}".strip()
        result[key] = str(major.get("planned_quota", ""))
    return result


def detect_changes(previous: dict[str, Any] | None, current: dict[str, Any]) -> list[str]:
    if previous is None:
        return ["首次抓取，已建立每日归档基线。"]

    changes: list[str] = []

    old_news = set(_news_titles(previous))
    new_news = set(_news_titles(current))
    added_news = sorted(new_news - old_news)
    removed_news = sorted(old_news - new_news)
    if added_news:
        changes.append("新增通知：" + "；".join(added_news[:8]))
    if removed_news:
        changes.append("通知列表变化：" + "；".join(removed_news[:8]))

    old_books = _books(previous)
    new_books = _books(current)
    for code in sorted(set(old_books) | set(new_books)):
        if old_books.get(code) != new_books.get(code):
            changes.append(f"科目 {code} 参考书目有更新")

    old_quotas = _quotas(previous)
    new_quotas = _quotas(current)
    for key in sorted(set(old_quotas) | set(new_quotas)):
        if old_quotas.get(key) != new_quotas.get(key):
            changes.append(f"{key} 拟招生人数：{old_quotas.get(key, '无')} → {new_quotas.get(key, '无')}")

    if not changes:
        changes.append("官网公开信息无实质变化。")
    return changes


def load_previous_snapshot(output_dir: Path) -> dict[str, Any] | None:
    previous = _load_json(output_dir / "kaoyan_data.json")
    if previous is None:
        previous = _load_json(output_dir / "latest" / "kaoyan_data.json")
    return previous


def build_archive_info(
    output_dir: Path,
    data: dict[str, Any],
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if previous is None:
        previous = load_previous_snapshot(output_dir)
    stamp = today_stamp()
    changes = detect_changes(previous, data)
    return {
        "date": stamp,
        "archive_dir": str(output_dir / "archive" / stamp),
        "changes": changes,
        "has_updates": any("无实质变化" not in item for item in changes),
    }


def persist_archive(output_dir: Path, archive_info: dict[str, Any]) -> None:
    stamp = archive_info["date"]
    archive_dir = Path(archive_info["archive_dir"])
    archive_dir.mkdir(parents=True, exist_ok=True)

    for name in ("kaoyan_data.json", "考研资料汇总.md"):
        src = output_dir / name
        if src.exists():
            shutil.copy2(src, archive_dir / name)

    attachments = output_dir / "attachments"
    if attachments.exists():
        dest_attachments = archive_dir / "attachments"
        if dest_attachments.exists():
            shutil.rmtree(dest_attachments)
        shutil.copytree(attachments, dest_attachments)

    changelog_path = output_dir / "changelog.md"
    entry = (
        f"## {stamp}\n\n"
        + "\n".join(f"- {item}" for item in archive_info.get("changes", []))
        + "\n\n"
    )
    existing = changelog_path.read_text(encoding="utf-8") if changelog_path.exists() else "# 每日抓取变更日志\n\n"
    heading = "# 每日抓取变更日志\n\n"
    if f"## {stamp}\n" in existing:
        parts = existing.split(f"## {stamp}\n", 1)
        rest = parts[1]
        next_heading = rest.find("\n## ")
        tail = rest[next_heading + 1 :] if next_heading >= 0 else ""
        existing = parts[0] + entry + tail
    else:
        body = existing[len(heading) :] if existing.startswith(heading) else existing
        existing = heading + entry + body
    changelog_path.write_text(existing, encoding="utf-8")
