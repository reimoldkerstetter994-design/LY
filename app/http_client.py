from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.config import REQUEST_GAP_SECONDS, REQUEST_TIMEOUT, USER_AGENT


class PoliteClient:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            headers={"User-Agent": USER_AGENT, "Accept-Language": "zh-CN,zh;q=0.9"},
            timeout=REQUEST_TIMEOUT,
            follow_redirects=True,
        )
        self._lock = asyncio.Lock()

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        async with self._lock:
            await asyncio.sleep(REQUEST_GAP_SECONDS)
            return await self._client.get(url, **kwargs)

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        async with self._lock:
            await asyncio.sleep(REQUEST_GAP_SECONDS)
            return await self._client.post(url, **kwargs)

    async def aclose(self) -> None:
        await self._client.aclose()
