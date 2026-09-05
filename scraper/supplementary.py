from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .utils import HttpClient, clean_text


class SupplementaryScraper:
    """抓取第三方公开参考资料（需与官网交叉验证）。"""

    CHINAKAOYAN_857_URL = "https://www.chinakaoyan.com/info/article/id/643389.shtml"

    def __init__(self, client: HttpClient | None = None):
        self.client = client or HttpClient()

    def fetch_chinakaoyan_857(self) -> dict[str, Any]:
        try:
            html = self.client.get(self.CHINAKAOYAN_857_URL)
            text = clean_text(re.sub(r"<[^>]+>", " ", html))
            books = []
            for match in re.finditer(r"《[^》]+》[^。]*。", text):
                books.append(match.group(0))
            return {
                "source": "中国考研网",
                "url": self.CHINAKAOYAN_857_URL,
                "books": books,
                "disclaimer": "第三方来源，请以南京农业大学研究生院官网公布为准。",
            }
        except Exception as exc:
            return {"source": "中国考研网", "error": str(exc)}

    def collect(self) -> dict[str, Any]:
        return {
            "chinakaoyan_857": self.fetch_chinakaoyan_857(),
            "note": "补充资料仅作参考，正式备考以官网信息为准。",
        }


class AttachmentDownloader:
    def __init__(self, client: HttpClient | None = None):
        self.client = client or HttpClient()

    def download_all(self, attachments: list[dict[str, str]], output_dir: Path) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        attach_dir = output_dir / "attachments"
        attach_dir.mkdir(parents=True, exist_ok=True)

        for att in attachments:
            title = att.get("title", "attachment")
            url = att.get("url", "")
            if not url:
                continue
            safe_name = re.sub(r"[\\/:*?\"<>|]+", "_", title)
            if not safe_name.lower().endswith((".pdf", ".xls", ".xlsx", ".doc", ".docx", ".zip")):
                if "pdf" in url.lower() or title.lower().endswith(".pdf"):
                    safe_name += ".pdf"
                elif "xls" in url.lower():
                    safe_name += ".xls"
                else:
                    safe_name += ".bin"

            dest = attach_dir / safe_name
            try:
                self.client.download(
                    url,
                    dest,
                    referer="https://zsgz.njau.edu.cn/info/1007/1717.htm",
                )
                content = dest.read_bytes()
                if content[:4].lower() == b"<htm" or content[:5] == b"<!doc":
                    results.append(
                        {
                            "title": title,
                            "url": url,
                            "status": "error",
                            "error": "下载内容不是有效附件，可能是登录或权限页面",
                        }
                    )
                    dest.unlink(missing_ok=True)
                    continue
                results.append({"title": title, "url": url, "local_path": str(dest), "status": "ok"})
            except Exception as exc:
                results.append({"title": title, "url": url, "status": "error", "error": str(exc)})
        return results
