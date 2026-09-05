from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from typing import Callable

logger = logging.getLogger(__name__)


def parse_hhmm(value: str) -> tuple[int, int]:
    hour_str, minute_str = value.strip().split(":", 1)
    hour = int(hour_str)
    minute = int(minute_str)
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"无效时间：{value}")
    return hour, minute


def next_run_at(hour: int, minute: int, now: datetime | None = None) -> datetime:
    now = now or datetime.now()
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate


def run_daily(
    job: Callable[[], None],
    at: str = "08:00",
    run_immediately: bool = True,
) -> None:
    hour, minute = parse_hhmm(at)
    logger.info("已启动每日定时抓取，每天 %s 执行。按 Ctrl+C 停止。", at)

    if run_immediately:
        logger.info("立即执行一次抓取，之后按每日计划继续。")
        job()

    while True:
        target = next_run_at(hour, minute)
        wait_seconds = max(1.0, (target - datetime.now()).total_seconds())
        logger.info("下次抓取时间：%s（约 %.1f 小时后）", target.strftime("%Y-%m-%d %H:%M:%S"), wait_seconds / 3600)
        time.sleep(wait_seconds)
        logger.info("到达计划时间，开始每日抓取...")
        try:
            job()
        except Exception:
            logger.exception("本次每日抓取失败，将在明天同一时间重试。")
