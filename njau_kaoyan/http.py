from __future__ import annotations

import logging
import time
from typing import Any

import requests
from requests.adapters import HTTPAdapter

log = logging.getLogger(__name__)


class Http:
    """带重试、限速和编码修正的简单 HTTP 客户端。"""

    def __init__(self, cfg: dict[str, Any]):
        h = cfg.get("http", {})
        self.timeout = h.get("timeout", 20)
        self.retries = h.get("retries", 3)
        self.delay = h.get("delay", 0.8)
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": h.get("user_agent", "Mozilla/5.0"),
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
        )
        adapter = HTTPAdapter(pool_connections=8, pool_maxsize=8)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        self._last = 0.0

    def _throttle(self) -> None:
        wait = self.delay - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def request(self, method: str, url: str, **kw: Any) -> requests.Response | None:
        kw.setdefault("timeout", self.timeout)
        last_exc: Exception | None = None
        for attempt in range(1, self.retries + 1):
            self._throttle()
            try:
                resp = self.session.request(method, url, **kw)
                if resp.status_code >= 500:
                    raise requests.HTTPError(f"HTTP {resp.status_code}")
                return resp
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                log.warning("请求失败 (%d/%d) %s: %s", attempt, self.retries, url, exc)
                time.sleep(min(2**attempt, 8))
        log.error("放弃请求 %s: %s", url, last_exc)
        return None

    def get_text(self, url: str, **kw: Any) -> str | None:
        resp = self.request("GET", url, **kw)
        if resp is None or not (200 <= resp.status_code < 300):
            return None
        return _decode(resp)

    def post_text(self, url: str, data: dict[str, Any], **kw: Any) -> str | None:
        resp = self.request("POST", url, data=data, **kw)
        if resp is None or not (200 <= resp.status_code < 300):
            return None
        return _decode(resp)


def _decode(resp: requests.Response) -> str:
    # 很多国内站点 Content-Type 不带 charset，requests 会猜成 ISO-8859-1。
    enc = (resp.encoding or "").lower()
    if not enc or enc == "iso-8859-1":
        resp.encoding = resp.apparent_encoding or "utf-8"
    text = resp.text
    if "\ufffd" in text[:5000] and resp.encoding and resp.encoding.lower() != "utf-8":
        try:
            return resp.content.decode("utf-8")
        except UnicodeDecodeError:
            pass
    return text
