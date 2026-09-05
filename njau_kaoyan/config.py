from __future__ import annotations

import copy
import os
from pathlib import Path
from typing import Any

import yaml

DEFAULT_CONFIG_PATH = Path("config.yaml")

_DEFAULTS: dict[str, Any] = {
    "target": {
        "school": "南京农业大学",
        "school_code": "10307",
        "college": "资源与环境科学学院",
        "college_code": "003",
        "majors": [
            {"code": "090301", "name": "土壤学"},
            {"code": "090302", "name": "植物营养学"},
        ],
    },
    "storage": {"db_path": "data/njau_kaoyan.sqlite3"},
    "http": {
        "timeout": 20,
        "retries": 3,
        "delay": 0.8,
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ),
    },
    "official": [],
    "catalog": {
        "enabled": True,
        "base": "https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/",
        "years": [],
        "compare_previous_year": True,
    },
    "search": {
        "enabled": True,
        "engines": ["duckduckgo", "sogou_weixin", "bing"],
        "max_results_per_query": 10,
        "delay": 3,
        "queries": [],
        "weixin_queries": [],
    },
    "relevance": {
        "must_any": ["南京农业大学", "南农", "南京农大", "njau"],
        "topic_any": ["资环", "土壤学", "植物营养", "857", "0903", "考研", "硕士"],
        "exclude_any": [],
    },
    "report": {"out_dir": "reports", "recent_days": 45, "max_items_per_section": 40},
    "notify": {"webhook_url": "", "webhook_type": "wecom", "official_only": True},
    "watch": {"interval_minutes": 60},
}


def _deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(path: str | os.PathLike | None = None) -> dict[str, Any]:
    p = Path(path) if path else DEFAULT_CONFIG_PATH
    data: dict[str, Any] = {}
    if p.exists():
        with p.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    cfg = _deep_merge(_DEFAULTS, data)

    env_webhook = os.environ.get("NJAU_WEBHOOK_URL")
    if env_webhook:
        cfg["notify"]["webhook_url"] = env_webhook
    env_type = os.environ.get("NJAU_WEBHOOK_TYPE")
    if env_type:
        cfg["notify"]["webhook_type"] = env_type
    return cfg
