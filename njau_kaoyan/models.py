from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Item:
    """一条抓取到的资料条目（官网通知、搜索结果、公众号文章等）。"""

    url: str
    title: str
    source_id: str
    source_name: str
    kind: str  # official | search | weixin | catalog
    published: str = ""  # YYYY-MM-DD，未知则为空
    summary: str = ""
    category: str = "其他"
    score: int = 0
    attachments: list[dict[str, str]] = field(default_factory=list)
    images: list[str] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)
    # 去重键；为空时用 url。搜狗微信的跳转链接每次都带不同 token，需要按标题去重。
    dedupe_key: str = ""

    @property
    def uid(self) -> str:
        key = self.dedupe_key or self.url.strip()
        return hashlib.sha1(key.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["uid"] = self.uid
        return d


@dataclass
class Program:
    """招生目录中的一个专业。"""

    code: str
    name: str
    quota: str = ""
    directions: list[str] = field(default_factory=list)
    subjects: list[dict[str, str]] = field(default_factory=list)  # {code,name,url}
    retest: str = ""
    retest_subjects: list[dict[str, str]] = field(default_factory=list)
    remark: str = ""
    degree_type: str = "学术学位"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
