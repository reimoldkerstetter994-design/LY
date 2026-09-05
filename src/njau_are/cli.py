from __future__ import annotations

import argparse
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from njau_are.render import write_outputs
from njau_are.scrape import NjauAreScraper
from njau_are.store import DATA_DIR, SITE_DIR, SNAPSHOT_PATH, load_snapshot, save_snapshot


def cmd_scrape(_args: argparse.Namespace) -> int:
    print("开始抓取南京农业大学农业资源与环境学硕官方公开资料…", flush=True)
    report = NjauAreScraper().run()
    snapshot = save_snapshot(report)
    outputs = write_outputs(report)
    core = [p for p in report.programs if p.category == "core"]
    print(f"目录年份：{report.catalog_years}")
    print(f"专业条目：{len(report.programs)}（其中学硕核心 {len(core)}）")
    print(f"通知：{len(report.notices)}　科目书目：{len(report.subjects)}")
    if report.errors:
        print("告警：", *report.errors, sep="\n- ")
    print(f"JSON：{snapshot}")
    print(f"Markdown：{outputs['markdown']}")
    print(f"网页：{outputs['html']}")
    return 0 if not report.errors else 2


def cmd_serve(args: argparse.Namespace) -> int:
    if not SNAPSHOT_PATH.exists():
        print("尚未抓取数据，先执行 scrape。", file=sys.stderr)
        return 1
    if not (SITE_DIR / "index.html").exists():
        print("正在根据已有快照生成页面…")
        write_outputs(_report_from_dict(load_snapshot()))
    SITE_DIR.mkdir(parents=True, exist_ok=True)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(SITE_DIR), **k)

        def log_message(self, fmt: str, *log_args) -> None:
            sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % log_args))

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"打开 http://127.0.0.1:{args.port}/ 查看资料台")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    return 0


def _report_from_dict(raw: dict):
    # Re-render from JSON without needing full dataclass round-trip for serve fallback.
    from njau_are.models import (
        Attachment,
        CollegeSnapshot,
        ExamSubject,
        Notice,
        Program,
        ResearchDirection,
        ScrapeReport,
    )

    def subjects(items, kind=None):
        out = []
        for item in items:
            out.append(
                ExamSubject(
                    code=item["code"],
                    name=item["name"],
                    kind=item.get("kind") or kind or "initial",
                    url=item.get("url", ""),
                    reference_books=item.get("reference_books", ""),
                )
            )
        return out

    programs = []
    for item in raw.get("programs", []):
        programs.append(
            Program(
                year=item["year"],
                college_code=item["college_code"],
                college_name=item["college_name"],
                major_code=item["major_code"],
                major_name=item["major_name"],
                degree_type=item["degree_type"],
                planned_quota=item.get("planned_quota"),
                directions=[ResearchDirection(**d) for d in item.get("directions", [])],
                initial_subjects=subjects(item.get("initial_subjects", []), "initial"),
                retest_subjects=subjects(item.get("retest_subjects", []), "retest"),
                notes=item.get("notes", ""),
                source_url=item.get("source_url", ""),
                category=item.get("category", "other"),
            )
        )
    notices = []
    for item in raw.get("notices", []):
        notices.append(
            Notice(
                title=item["title"],
                url=item["url"],
                published=item.get("published", ""),
                source=item.get("source", ""),
                summary=item.get("summary", ""),
                attachments=[Attachment(**a) for a in item.get("attachments", [])],
                relevant=item.get("relevant", True),
            )
        )
    return ScrapeReport(
        scraped_at=raw.get("scraped_at", ""),
        catalog_years=raw.get("catalog_years", []),
        college=[CollegeSnapshot(**c) for c in raw.get("college", [])],
        programs=programs,
        notices=notices,
        subjects=subjects(raw.get("subjects", [])),
        errors=raw.get("errors", []),
        sources=raw.get("sources", []),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="抓取南京农业大学农业资源与环境学硕官方考研公开资料"
    )
    sub = parser.add_subparsers(dest="command", required=True)
    scrape = sub.add_parser("scrape", help="从官方网站抓取并生成 JSON/Markdown/网页")
    scrape.set_defaults(func=cmd_scrape)
    serve = sub.add_parser("serve", help="在本地打开资料台网页")
    serve.add_argument("--port", type=int, default=8765)
    serve.set_defaults(func=cmd_serve)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
