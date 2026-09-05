from __future__ import annotations

import time
from typing import Any

import requests

from njau_are.config import REQUEST_GAP_SECONDS, REQUEST_TIMEOUT, USER_AGENT


class FetchError(RuntimeError):
    def __init__(self, url: str, message: str):
        super().__init__(f"{url}: {message}")
        self.url = url
        self.message = message


class HttpClient:
    def __init__(
        self,
        session: requests.Session | None = None,
        gap_seconds: float = REQUEST_GAP_SECONDS,
        timeout: int = REQUEST_TIMEOUT,
    ) -> None:
        self.session = session or requests.Session()
        self.session.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            }
        )
        self.gap_seconds = gap_seconds
        self.timeout = timeout
        self._last_request_at = 0.0

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.gap_seconds:
            time.sleep(self.gap_seconds - elapsed)

    def get(self, url: str, **kwargs: Any) -> requests.Response:
        self._throttle()
        try:
            response = self.session.get(url, timeout=self.timeout, **kwargs)
        except requests.RequestException as exc:
            raise FetchError(url, str(exc)) from exc
        finally:
            self._last_request_at = time.monotonic()
        if response.status_code >= 400:
            raise FetchError(url, f"HTTP {response.status_code}")
        response.encoding = response.apparent_encoding or response.encoding
        return response

    def post(self, url: str, data: dict[str, str], **kwargs: Any) -> requests.Response:
        self._throttle()
        try:
            response = self.session.post(
                url,
                data=data,
                timeout=self.timeout,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                **kwargs,
            )
        except requests.RequestException as exc:
            raise FetchError(url, str(exc)) from exc
        finally:
            self._last_request_at = time.monotonic()
        if response.status_code >= 400:
            raise FetchError(url, f"HTTP {response.status_code}")
        response.encoding = response.apparent_encoding or response.encoding
        return response

    def get_text(self, url: str) -> str:
        return self.get(url).text
