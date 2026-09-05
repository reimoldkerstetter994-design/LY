from __future__ import annotations

import logging
from typing import Any

import requests

log = logging.getLogger(__name__)


def _payload(kind: str, title: str, text: str) -> dict[str, Any]:
    if kind == "wecom":
        return {"msgtype": "markdown", "markdown": {"content": f"**{title}**\n{text}"}}
    if kind == "dingtalk":
        return {"msgtype": "markdown", "markdown": {"title": title, "text": f"### {title}\n\n{text}"}}
    if kind == "feishu":
        return {"msg_type": "text", "content": {"text": f"{title}\n{text}"}}
    return {"title": title, "text": text}


def send_new_items(cfg: dict[str, Any], new_items: list[dict[str, Any]]) -> bool:
    ncfg = cfg.get("notify", {})
    url = (ncfg.get("webhook_url") or "").strip()
    if not url or not new_items:
        return False
    if ncfg.get("official_only", True):
        new_items = [i for i in new_items if i.get("kind") == "official"]
        if not new_items:
            return False
    lines = []
    for it in new_items[:15]:
        date = it.get("published") or ""
        lines.append(f"- {date} [{it['title']}]({it['url']})")
    if len(new_items) > 15:
        lines.append(f"- …另有 {len(new_items) - 15} 条，见报告")
    body = _payload(ncfg.get("webhook_type", "wecom"), f"南农资环考研资料更新（{len(new_items)} 条）", "\n".join(lines))
    try:
        r = requests.post(url, json=body, timeout=15)
        ok = r.status_code < 300
        if not ok:
            log.warning("推送失败 HTTP %s: %s", r.status_code, r.text[:200])
        return ok
    except requests.RequestException as exc:
        log.warning("推送失败: %s", exc)
        return False
