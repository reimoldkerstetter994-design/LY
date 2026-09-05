from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from njau_are import __version__
from njau_are.config import GUIDES_DIR, SOURCES, STATIC_DIR
from njau_are.scraper.official import load_snapshot, scrape_all, snapshot_mtime

app = FastAPI(title="南农农业资源与环境学硕考研资料", version=__version__)
app.mount("/assets", StaticFiles(directory=STATIC_DIR), name="assets")

GUIDE_TITLES = {
    "01-overview": "专业地图",
    "02-857": "857 复习地图",
    "03-public": "公共课与第三门",
    "04-retest": "复试与分数线",
    "05-timeline": "时间线与入口",
}


def _guides() -> list[dict[str, str]]:
    items = []
    if GUIDES_DIR.exists():
        for path in sorted(GUIDES_DIR.glob("*.md")):
            items.append(
                {
                    "id": path.stem,
                    "title": GUIDE_TITLES.get(path.stem, path.stem),
                    "markdown": path.read_text(encoding="utf-8"),
                }
            )
    return items


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "version": __version__, "snapshot": snapshot_mtime()}


@app.get("/api/snapshot")
def snapshot() -> dict:
    snap = load_snapshot()
    if snap is None:
        return {
            "scraped_at": None,
            "year": "2026",
            "programs": [],
            "subjects": {},
            "notices": [],
            "scores": [],
            "warnings": ["尚未抓取。点击「立即抓取」从南农官方站点更新。"],
            "sources": SOURCES,
            "extra": {},
            "guides": _guides(),
        }
    data = snap.model_dump()
    data["guides"] = _guides()
    return data


@app.post("/api/scrape")
def scrape(year: str = "2026") -> dict:
    try:
        snap = scrape_all(year=year)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    data = snap.model_dump()
    data["guides"] = _guides()
    return data
