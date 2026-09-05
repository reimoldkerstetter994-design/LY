from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from nau_kaoyan import __version__
from nau_kaoyan.models import to_dict
from nau_kaoyan.scrape import collect
from nau_kaoyan.store import list_snapshots, load_cache

PKG = Path(__file__).resolve().parent
TEMPLATES = PKG / "templates"
STATIC = PKG / "static"

app = FastAPI(
    title="南农农业资源与环境学硕考研资料台",
    version=__version__,
    description="实时抓取南京农业大学农业资源与环境学术型硕士公开招生资料。",
)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def _payload() -> dict[str, Any]:
    cache = load_cache()
    if cache is None:
        return {
            "generated_at": None,
            "empty": True,
            "message": "尚未抓取。点击「立即抓取」从官网拉取最新公开资料。",
        }
    cache["empty"] = False
    return cache


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return (TEMPLATES / "index.html").read_text(encoding="utf-8")


@app.get("/api/data")
def api_data() -> dict[str, Any]:
    return _payload()


@app.post("/api/refresh")
async def api_refresh() -> dict[str, Any]:
    snapshot = await run_in_threadpool(collect, True)
    data = to_dict(snapshot)
    data["empty"] = False
    return data


@app.get("/api/snapshots")
def api_snapshots() -> dict[str, Any]:
    return {"items": list_snapshots()}


@app.get("/api/export.json")
def api_export() -> dict[str, Any]:
    cache = load_cache()
    if cache is None:
        raise HTTPException(status_code=404, detail="还没有抓取结果")
    return cache


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.get("/favicon.ico")
def favicon() -> FileResponse:
    ico = STATIC / "favicon.svg"
    return FileResponse(ico, media_type="image/svg+xml")
