from __future__ import annotations

import argparse
import asyncio
import os

import uvicorn

from app.crawl import run_crawl, to_markdown
from app.db import init_db


def main() -> None:
    parser = argparse.ArgumentParser(description="南农农业资源与环境学硕资料雷达")
    parser.add_argument("command", nargs="?", default="serve", choices=["serve", "crawl"])
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    args = parser.parse_args()
    init_db()
    if args.command == "crawl":
        data = asyncio.run(run_crawl())
        print(to_markdown(data))
        return
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
