from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .models import Item

_SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    uid TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    published TEXT,
    summary TEXT,
    category TEXT,
    score INTEGER DEFAULT 0,
    attachments TEXT,
    images TEXT,
    extra TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind);
CREATE INDEX IF NOT EXISTS idx_items_published ON items(published);
CREATE INDEX IF NOT EXISTS idx_items_first_seen ON items(first_seen);

CREATE TABLE IF NOT EXISTS snapshots (
    key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    new_items INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    notes TEXT
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")


class Storage:
    def __init__(self, db_path: str | Path):
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)

    # ---- items -------------------------------------------------------------
    def upsert_items(self, items: Iterable[Item]) -> list[Item]:
        """写入条目，返回本次新增（之前未见过）的条目。"""
        new: list[Item] = []
        now = _now()
        cur = self.conn.cursor()
        for it in items:
            row = cur.execute("SELECT uid FROM items WHERE uid=?", (it.uid,)).fetchone()
            if row is None:
                cur.execute(
                    """INSERT INTO items (uid,url,title,source_id,source_name,kind,published,summary,
                       category,score,attachments,images,extra,first_seen,last_seen)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        it.uid,
                        it.url,
                        it.title,
                        it.source_id,
                        it.source_name,
                        it.kind,
                        it.published,
                        it.summary,
                        it.category,
                        it.score,
                        json.dumps(it.attachments, ensure_ascii=False),
                        json.dumps(it.images, ensure_ascii=False),
                        json.dumps(it.extra, ensure_ascii=False),
                        now,
                        now,
                    ),
                )
                new.append(it)
            else:
                cur.execute(
                    """UPDATE items SET title=?, published=CASE WHEN ?<>'' THEN ? ELSE published END,
                       summary=CASE WHEN ?<>'' THEN ? ELSE summary END, category=?, score=?,
                       attachments=?, images=?, extra=?, last_seen=? WHERE uid=?""",
                    (
                        it.title,
                        it.published,
                        it.published,
                        it.summary,
                        it.summary,
                        it.category,
                        it.score,
                        json.dumps(it.attachments, ensure_ascii=False),
                        json.dumps(it.images, ensure_ascii=False),
                        json.dumps(it.extra, ensure_ascii=False),
                        now,
                        it.uid,
                    ),
                )
        self.conn.commit()
        return new

    def list_items(
        self,
        kind: str | None = None,
        category: str | None = None,
        since_first_seen: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        sql = "SELECT * FROM items WHERE 1=1"
        args: list[Any] = []
        if kind:
            sql += " AND kind=?"
            args.append(kind)
        if category:
            sql += " AND category=?"
            args.append(category)
        if since_first_seen:
            sql += " AND first_seen>=?"
            args.append(since_first_seen)
        sql += " ORDER BY COALESCE(NULLIF(published,''), substr(first_seen,1,10)) DESC, score DESC LIMIT ?"
        args.append(limit)
        rows = self.conn.execute(sql, args).fetchall()
        return [_row_to_dict(r) for r in rows]

    def search_items(self, keyword: str, limit: int = 100) -> list[dict[str, Any]]:
        like = f"%{keyword}%"
        rows = self.conn.execute(
            """SELECT * FROM items WHERE title LIKE ? OR summary LIKE ?
               ORDER BY COALESCE(NULLIF(published,''), substr(first_seen,1,10)) DESC LIMIT ?""",
            (like, like, limit),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]

    def count_items(self) -> int:
        return int(self.conn.execute("SELECT COUNT(*) FROM items").fetchone()[0])

    # ---- snapshots (招生目录等结构化数据) -----------------------------------
    def save_snapshot(self, key: str, payload: Any) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO snapshots (key,payload,updated_at) VALUES (?,?,?)",
            (key, json.dumps(payload, ensure_ascii=False), _now()),
        )
        self.conn.commit()

    def load_snapshot(self, key: str) -> Any | None:
        row = self.conn.execute("SELECT payload FROM snapshots WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def list_snapshot_keys(self, prefix: str = "") -> list[str]:
        rows = self.conn.execute(
            "SELECT key FROM snapshots WHERE key LIKE ? ORDER BY key", (prefix + "%",)
        ).fetchall()
        return [r[0] for r in rows]

    # ---- runs --------------------------------------------------------------
    def start_run(self) -> int:
        cur = self.conn.execute("INSERT INTO runs (started_at) VALUES (?)", (_now(),))
        self.conn.commit()
        return int(cur.lastrowid)

    def finish_run(self, run_id: int, new_items: int, notes: str = "") -> None:
        self.conn.execute(
            "UPDATE runs SET finished_at=?, new_items=?, total_items=?, notes=? WHERE id=?",
            (_now(), new_items, self.count_items(), notes, run_id),
        )
        self.conn.commit()

    def last_run(self) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM runs ORDER BY id DESC LIMIT 1").fetchone()
        return dict(row) if row else None

    def close(self) -> None:
        self.conn.close()


def _row_to_dict(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    for k in ("attachments", "images", "extra"):
        try:
            d[k] = json.loads(d.get(k) or "null") or ([] if k != "extra" else {})
        except json.JSONDecodeError:
            d[k] = [] if k != "extra" else {}
    return d
