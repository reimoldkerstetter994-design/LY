from __future__ import annotations

import json
from pathlib import Path

from njau_are.models import ScrapeReport

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
SNAPSHOT_PATH = DATA_DIR / "latest.json"
SITE_DIR = DATA_DIR / "site"


def save_snapshot(report: ScrapeReport, path: Path | None = None) -> Path:
    target = path or SNAPSHOT_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return target


def load_snapshot(path: Path | None = None) -> dict:
    target = path or SNAPSHOT_PATH
    return json.loads(target.read_text(encoding="utf-8"))
