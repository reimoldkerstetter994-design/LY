from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Any

from .admission_news import AdmissionNewsScraper
from .college_site import CollegeSiteScraper
from .official_catalog import OfficialCatalogScraper
from .report import write_report
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

    json_path, md_path = write_report(result, out)
    logger.info("报告已生成：%s", md_path)
    logger.info("数据已保存：%s", json_path)
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="南京农业大学农业资源与环境学硕考研资料自动抓取工具",
    )
    parser.add_argument(
        "command",
        choices=["scrape"],
        help="执行抓取任务",
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
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    if args.command == "scrape":
        collect_all(
            config_path=args.config,
            output_dir=args.output,
            max_news_pages=args.max_pages,
            download_attachments=not args.no_download,
        )


if __name__ == "__main__":
    main()
