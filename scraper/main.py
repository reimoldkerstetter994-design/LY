from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Any

from .admission_news import AdmissionNewsScraper
from .archive import build_archive_info, load_previous_snapshot, persist_archive
from .college_site import CollegeSiteScraper
from .grokbot_export import GROKBOT_FILENAME, write_grokbot_pack
from .official_catalog import OfficialCatalogScraper
from .report import write_report
from .scheduler import run_daily
from .supplementary import AttachmentDownloader, SupplementaryScraper
from .utils import load_config, now_iso

logger = logging.getLogger(__name__)


def collect_all(
    config_path: str = "config.yaml",
    output_dir: str = "output",
    max_news_pages: int = 5,
    download_attachments: bool = True,
) -> dict[str, Any]:
    config = load_config(config_path)
    out = Path(output_dir)

    catalog_scraper = OfficialCatalogScraper(config)
    news_scraper = AdmissionNewsScraper(config)
    college_scraper = CollegeSiteScraper(config)
    supplementary_scraper = SupplementaryScraper()

    logger.info("正在抓取官方招生目录...")
    catalog = catalog_scraper.fetch_college_catalog()

    subject_codes = list(config.get("exam_subjects", {}).get("common", []))
    subject_codes.extend(config.get("exam_subjects", {}).get("reexam", []))
    subject_codes = list(dict.fromkeys(subject_codes))

    logger.info("正在抓取考试科目参考书目...")
    subject_references = catalog_scraper.fetch_all_subject_references(subject_codes)

    logger.info("正在抓取招生通知...")
    news_data = news_scraper.collect(max_pages=max_news_pages)

    logger.info("正在抓取学院官网信息...")
    college_site = college_scraper.collect()

    logger.info("正在抓取补充参考资料...")
    supplementary = supplementary_scraper.collect()

    key_articles = [
        a
        for a in news_data.get("articles", [])
        if any(k in a.get("title", "") for k in ("章程", "复试", "招生专业目录", "招生章程"))
    ]

    related_news = [
        {"title": a.get("list_title") or a.get("title", ""), "url": a.get("url", "")}
        for a in news_data.get("articles", [])
        if a.get("url")
    ]

    result: dict[str, Any] = {
        "generated_at": now_iso(),
        "target": config["target"],
        "catalog": catalog,
        "subject_references": subject_references,
        "key_articles": key_articles,
        "related_news": related_news,
        "college_site": college_site,
        "supplementary": supplementary,
        "downloaded_attachments": [],
    }

    if download_attachments:
        attachments = [
            att
            for att in news_data.get("relevant_attachments", [])
            if "003" in att.get("title", "") or "资源与环境" in att.get("title", "")
        ]
        if attachments:
            logger.info("正在下载相关附件（%d 个）...", len(attachments))
            downloader = AttachmentDownloader()
            result["downloaded_attachments"] = downloader.download_all(attachments, out)

    previous = load_previous_snapshot(out)
    archive_info = build_archive_info(out, result, previous=previous)
    result["archive"] = archive_info
    json_path, md_path = write_report(result, out)
    persist_archive(out, archive_info)
    grokbot_paths = write_grokbot_pack(
        result,
        out,
        extra_paths=[Path(GROKBOT_FILENAME)],
    )
    logger.info("报告已生成：%s", md_path)
    logger.info("数据已保存：%s", json_path)
    logger.info("已归档到：%s", archive_info.get("archive_dir"))
    for path in grokbot_paths:
        logger.info("GrokBot 资料包：%s", path)
    for change in archive_info.get("changes", []):
        logger.info("变更：%s", change)
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="南京农业大学农业资源与环境学硕考研资料自动抓取工具",
    )
    parser.add_argument(
        "command",
        choices=["scrape", "schedule", "grokbot"],
        help="scrape 立即抓取；schedule 每天定时抓取；grokbot 用已有数据生成可发给 GrokBot 的单文件",
    )
    parser.add_argument(
        "-c",
        "--config",
        default="config.yaml",
        help="配置文件路径（默认 config.yaml）",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="output",
        help="输出目录（默认 output）",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=5,
        help="抓取招生通知的最大页数",
    )
    parser.add_argument(
        "--no-download",
        action="store_true",
        help="不下载附件",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="显示详细日志",
    )
    parser.add_argument(
        "--at",
        default=None,
        help="每日执行时间，格式 HH:MM，默认读取 config.yaml 中的 schedule.at",
    )
    parser.add_argument(
        "--skip-now",
        action="store_true",
        help="schedule 模式不立刻抓取，等到下一次计划时间再执行",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    def run_once() -> None:
        collect_all(
            config_path=args.config,
            output_dir=args.output,
            max_news_pages=args.max_pages,
            download_attachments=not args.no_download,
        )

    if args.command == "scrape":
        run_once()
    elif args.command == "schedule":
        config = load_config(args.config)
        at = args.at or config.get("schedule", {}).get("at", "08:00")
        run_daily(run_once, at=at, run_immediately=not args.skip_now)
    elif args.command == "grokbot":
        import json

        json_path = Path(args.output) / "kaoyan_data.json"
        if not json_path.exists():
            raise SystemExit(f"找不到 {json_path}，请先运行 python3 main.py scrape")
        data = json.loads(json_path.read_text(encoding="utf-8"))
        paths = write_grokbot_pack(data, Path(args.output), extra_paths=[Path(GROKBOT_FILENAME)])
        for path in paths:
            logger.info("已生成 GrokBot 资料包：%s", path)


if __name__ == "__main__":
    main()
