from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="南农农业资源与环境学硕考研资料抓取")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sc = sub.add_parser("scrape", help="抓取官方招生目录、参考书与通知")
    sc.add_argument("--year", default="2026")
    sv = sub.add_parser("serve", help="启动本地资料站")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8765)
    args = parser.parse_args(argv)

    if args.cmd == "scrape":
        from njau_are.scraper.official import scrape_all

        snap = scrape_all(year=args.year)
        print(json.dumps({
            "scraped_at": snap.scraped_at,
            "programs": [f"{p.code} {p.name}" for p in snap.programs],
            "subjects": list(snap.subjects),
            "notices": len(snap.notices),
            "warnings": snap.warnings,
        }, ensure_ascii=False, indent=2))
        return 0 if not any("失败" in w for w in snap.warnings) else 1

    if args.cmd == "serve":
        import uvicorn

        uvicorn.run("njau_are.web:app", host=args.host, port=args.port, reload=False)
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
