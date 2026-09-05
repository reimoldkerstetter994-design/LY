from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import datetime

from . import __version__
from .config import load_config
from .pipeline import run_once
from .report import write_reports
from .storage import Storage


def _setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def cmd_run(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    store = Storage(cfg["storage"]["db_path"])
    res = run_once(
        cfg,
        store,
        do_official=not args.no_official,
        do_catalog=not args.no_catalog,
        do_search=not args.no_search,
        fetch_detail=not args.no_detail,
        notify=not args.no_notify,
    )
    print(f"抓取 {res['fetched']} 条，新增 {res['new']} 条")
    for it in res["new_items"][:30]:
        print(f"  + [{it.get('kind')}] {it.get('published','')} {it['title']}  {it.get('url','')}")
    print(f"报告：{res['report_md']}\nJSON：{res['report_json']}")
    return 0


def cmd_watch(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    interval = (args.interval or cfg["watch"].get("interval_minutes", 60)) * 60
    store = Storage(cfg["storage"]["db_path"])
    logging.getLogger(__name__).info("进入监控模式，每 %d 分钟抓取一次，Ctrl+C 退出", interval // 60)
    n = 0
    while True:
        n += 1
        try:
            res = run_once(
                cfg,
                store,
                do_search=(n - 1) % max(1, args.search_every) == 0,
                fetch_detail=True,
            )
            print(f"[{datetime.now():%m-%d %H:%M}] 第 {n} 轮：新增 {res['new']} 条")
        except KeyboardInterrupt:
            raise
        except Exception as exc:  # noqa: BLE001
            logging.getLogger(__name__).exception("本轮抓取失败: %s", exc)
        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            print("已退出监控")
            return 0


def cmd_report(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    store = Storage(cfg["storage"]["db_path"])
    md, js = write_reports(cfg, store, None)
    print(f"报告：{md}\nJSON：{js}")
    return 0


def cmd_catalog(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    store = Storage(cfg["storage"]["db_path"])
    keys = sorted(store.list_snapshot_keys("catalog:"), reverse=True)
    if args.year:
        keys = [k for k in keys if k.endswith(str(args.year))]
    if not keys:
        print("数据库中还没有招生目录，请先运行 `njau-kaoyan run`")
        return 1
    snap = store.load_snapshot(keys[0])
    if args.json:
        print(json.dumps(snap, ensure_ascii=False, indent=2))
        return 0
    print(f"== {snap['year']} 年 {snap.get('college', {}).get('name', '')} 招生目录（{snap['source_url']}）")
    for p in snap["programs"]:
        if args.all or p["code"] in set(snap.get("target_codes") or []):
            print(f"\n{p['code']} {p['name']}（{p['degree_type']}）  拟招 {p['quota']}")
            for d in p["directions"]:
                print(f"   方向：{d}")
            print("   初试：" + " / ".join(f"{s['code']} {s['name']}" for s in p["subjects"]))
            print(f"   复试：{p['retest']}")
            for s in p["subjects"] + p["retest_subjects"]:
                b = snap.get("reference_books", {}).get(s["code"])
                if b and b.get("books"):
                    print(f"   参考书 {s['code']}：{b['books']}")
            if p.get("remark"):
                print(f"   备注：{p['remark']}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    cfg = load_config(args.config)
    store = Storage(cfg["storage"]["db_path"])
    rows = store.search_items(args.keyword, limit=args.limit) if args.keyword else store.list_items(
        kind=args.kind, category=args.category, limit=args.limit
    )
    for it in rows:
        date = it.get("published") or it.get("first_seen", "")[:10]
        print(f"{date}  [{it['kind']}/{it.get('category','')}]  {it['title']}\n    {it['url']}")
    print(f"共 {len(rows)} 条")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="njau-kaoyan",
        description="南京农业大学 农业资源与环境（0903 学硕）考研资料实时抓取工具",
    )
    p.add_argument("-c", "--config", default="config.yaml", help="配置文件路径（默认 config.yaml）")
    p.add_argument("-v", "--verbose", action="store_true", help="输出调试日志")
    p.add_argument("--version", action="version", version=__version__)
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="抓取一次：官网通知 + 在线招生目录 + 全网搜索，生成报告")
    r.add_argument("--no-official", action="store_true", help="跳过官网栏目")
    r.add_argument("--no-catalog", action="store_true", help="跳过在线招生目录")
    r.add_argument("--no-search", action="store_true", help="跳过搜索引擎/公众号")
    r.add_argument("--no-detail", action="store_true", help="官网只抓列表不进详情页（更快）")
    r.add_argument("--no-notify", action="store_true", help="不发送 webhook 推送")
    r.set_defaults(func=cmd_run)

    w = sub.add_parser("watch", help="常驻监控：按间隔循环抓取，发现新通知即推送")
    w.add_argument("-i", "--interval", type=int, help="间隔分钟（覆盖配置）")
    w.add_argument("--search-every", type=int, default=6, help="每 N 轮做一次全网搜索（默认 6）")
    w.set_defaults(func=cmd_watch)

    rp = sub.add_parser("report", help="不抓取，仅用数据库重新生成报告")
    rp.set_defaults(func=cmd_report)

    c = sub.add_parser("catalog", help="打印最新抓到的招生目录（考试科目/参考书/复试科目）")
    c.add_argument("--year", type=int)
    c.add_argument("--all", action="store_true", help="显示学院全部专业")
    c.add_argument("--json", action="store_true")
    c.set_defaults(func=cmd_catalog)

    ls = sub.add_parser("list", help="查询数据库中的条目")
    ls.add_argument("keyword", nargs="?", help="标题/摘要关键词")
    ls.add_argument("--kind", choices=["official", "search", "weixin"])
    ls.add_argument("--category")
    ls.add_argument("--limit", type=int, default=50)
    ls.set_defaults(func=cmd_list)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    _setup_logging(args.verbose)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
