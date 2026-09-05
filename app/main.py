from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.config import OFFICIAL_CONTACTS, PORTALS
from app.crawl import run_crawl, snapshot, to_markdown
from app.db import init_db

APP_DIR = Path(__file__).resolve().parent
init_db()

app = FastAPI(title="南农资环学硕雷达", version="1.0.0")
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")

_crawl_lock = asyncio.Lock()


@app.get("/", response_class=HTMLResponse)
async def index() -> str:
    return (APP_DIR / "templates" / "index.html").read_text(encoding="utf-8")


@app.get("/api/snapshot")
async def api_snapshot() -> dict:
    data = snapshot()
    data["contacts"] = OFFICIAL_CONTACTS
    data["portals"] = PORTALS
    data["crawling"] = _crawl_lock.locked()
    return data


@app.post("/api/crawl")
async def api_crawl() -> dict:
    if _crawl_lock.locked():
        return {"status": "running", "message": "正在抓取，请稍候刷新"}
    async with _crawl_lock:
        try:
            data = await run_crawl()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"抓取失败：{exc}") from exc
    data["contacts"] = OFFICIAL_CONTACTS
    data["portals"] = PORTALS
    data["crawling"] = False
    return data


@app.get("/api/export.md")
async def export_markdown() -> PlainTextResponse:
    data = snapshot()
    return PlainTextResponse(to_markdown(data), media_type="text/markdown; charset=utf-8")


@app.get("/favicon.ico")
async def favicon() -> FileResponse:
    return FileResponse(APP_DIR / "static" / "favicon.svg")


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
