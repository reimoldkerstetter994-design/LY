from __future__ import annotations

import time
from typing import Any

import httpx

from nau_kaoyan.config import REQUEST_DELAY, REQUEST_TIMEOUT, USER_AGENT


class Fetcher:
    def __init__(self, delay: float = REQUEST_DELAY) -> None:
        self.delay = delay
        self._last = 0.0
        self.client = httpx.Client(
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
        )

    def close(self) -> None:
        self.client.close()

    def _pace(self) -> None:
        elapsed = time.monotonic() - self._last
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self._last = time.monotonic()

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        self._pace()
        return self.client.get(url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        self._pace()
        return self.client.post(url, **kwargs)

    def get_text(self, url: str) -> tuple[str, int]:
        resp = self.get(url)
        return resp.text, resp.status_code

    def get_json(self, url: str, params: dict[str, Any] | None = None) -> Any:
        self._pace()
        resp = self.client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()
