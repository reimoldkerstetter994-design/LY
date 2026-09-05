from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from nau_kaoyan.config import CACHE_PATH, DATA_DIR, SNAPSHOT_DIR
from nau_kaoyan.models import Snapshot, to_dict


def load_cache(path: Path | None = None) -> dict[str, Any] | None:
    target = path or CACHE_PATH
    if not target.exists():
        return None
    return json.loads(target.read_text(encoding="utf-8"))


def save_snapshot(snapshot: Snapshot) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    payload = to_dict(snapshot)
    CACHE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snap_path = SNAPSHOT_DIR / f"snapshot-{stamp}.json"
    snap_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    _trim_snapshots()
    return snap_path


def _trim_snapshots(keep: int = 20) -> None:
    files = sorted(SNAPSHOT_DIR.glob("snapshot-*.json"))
    for old in files[:-keep]:
        old.unlink(missing_ok=True)


def list_snapshots() -> list[dict[str, str]]:
    if not SNAPSHOT_DIR.exists():
        return []
    items = []
    for path in sorted(SNAPSHOT_DIR.glob("snapshot-*.json"), reverse=True):
        items.append({"name": path.name, "path": str(path), "mtime": path.stat().st_mtime_ns})
    return items
