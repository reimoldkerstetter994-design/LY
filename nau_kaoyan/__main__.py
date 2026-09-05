from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn

from nau_kaoyan import __version__


def main() -> None:
    parser = argparse.ArgumentParser(
        description="南京农业大学农业资源与环境学硕考研公开资料实时抓取"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    scrape_p = sub.add_parser("scrape", help="立即抓取并写入 data/cache.json")
    scrape_p.add_argument("--no-save", action="store_true")

    serve_p = sub.add_parser("serve", help="启动资料台网站")
    serve_p.add_argument("--host", default="127.0.0.1")
    serve_p.add_argument("--port", type=int, default=8000)

    sub.add_parser("version", help="显示版本")

    args = parser.parse_args()
    if args.cmd == "version":
        print(__version__)
        return
    if args.cmd == "scrape":
        from nau_kaoyan.scrape import collect

        snap = collect(save=not args.no_save)
        targets = [p for p in snap.programs if p.is_target]
        print(f"抓取完成 {snap.generated_at}")
        print(f"目录年份: {', '.join(snap.years_available) or '无'}")
        print(f"学硕专业条数: {len(targets)}  通知: {len(snap.news)}  导师: {len(snap.teachers)}")
        print(f"缓存: {Path('data/cache.json').resolve()}")
        return
    if args.cmd == "serve":
        uvicorn.run("nau_kaoyan.server:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
