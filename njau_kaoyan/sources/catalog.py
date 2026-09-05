"""研究生院在线招生目录（https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/）。

这是南农招生专业、拟招生人数、考试科目、复试科目、参考书目的权威来源。
页面是 ASP.NET WebForms，需要先 GET 拿 __VIEWSTATE，再 POST 选择院系。
"""

from __future__ import annotations

import logging
import re
from datetime import date
from typing import Any

from ..http import Http
from ..models import Program
from .htmlutil import clean_text, soup

log = logging.getLogger(__name__)

_PROGRAM_HEAD = re.compile(r"<b>\s*(\d{6}|\d{4}[A-Z]\d)\s*([^<]+?)\s*</b>", re.S)
_HIDDEN = re.compile(r'<input type="hidden" name="(\w+)" id="\w+" value="([^"]*)"')
_SUBJECT_LINK = re.compile(r'<a href="zsml_ss_view\.aspx\?kmdm=(\w+)"[^>]*>([^<]+)</a>')


def parse_college_header(html: str) -> dict[str, str]:
    m = re.search(r"(\d{3})\s*([^\s<(（]+学院[^<]*?)\(电话:([^)]+)\)", html)
    info = {"code": m.group(1), "name": m.group(2), "phone": m.group(3)} if m else {}
    s = soup(html)
    intro = ""
    for td in s.select("td"):
        if td.find("table") is not None:
            continue
        t = clean_text(td.get_text())
        if "学院是" in t and 40 < len(t) < 1000:
            intro = t
            break
    if intro:
        info["intro"] = intro
    return info


def parse_programs(html: str) -> list[Program]:
    """把院系目录页解析成 Program 列表。页面 HTML 嵌套不规范，这里按专业标题切片后正则提取。"""
    heads = list(_PROGRAM_HEAD.finditer(html))
    programs: list[Program] = []
    for i, m in enumerate(heads):
        start = m.end()
        end = heads[i + 1].start() if i + 1 < len(heads) else len(html)
        seg = html[start:end]
        code, name = m.group(1), clean_text(m.group(2))
        degree = "专业学位" if "专业学位" in name else "学术学位"
        name = clean_text(name.replace("(专业学位)", "").replace("（专业学位）", ""))

        quota = ""
        qm = re.search(r"<td\s*>\s*(\d+)\s*</td>", seg)
        if qm:
            quota = qm.group(1)

        seg_soup = soup(seg)
        directions: list[str] = []
        for td in seg_soup.select("td"):
            raw = td.decode_contents()
            if "(全日制)" in raw or "（全日制）" in raw or "(非全日制)" in raw:
                parts = re.split(r"<br\s*/?>", raw)
                directions = [clean_text(re.sub(r"<[^>]+>", "", p)) for p in parts]
                directions = [d for d in directions if d]
                break

        subjects: list[dict[str, str]] = []
        retest_subjects: list[dict[str, str]] = []
        retest = ""
        rs = seg.find("复试科目")
        pre, post = (seg, "") if rs < 0 else (seg[:rs], seg[rs:])
        for km, nm in _SUBJECT_LINK.findall(pre):
            subjects.append({"code": km, "name": _strip_code(km, nm), "url": f"zsml_ss_view.aspx?kmdm={km}"})
        if post:
            for km, nm in _SUBJECT_LINK.findall(post):
                retest_subjects.append({"code": km, "name": _strip_code(km, nm), "url": f"zsml_ss_view.aspx?kmdm={km}"})
            retest = clean_text(re.sub(r"<[^>]+>", "", post.split("</td>", 1)[0]).replace("复试科目:", ""))

        remark = ""
        for td in seg_soup.select("td"):
            if "研究方向备注" in td.decode_contents():
                remark = clean_text(td.get_text())
        if not remark:
            # 备注列没有标记时，取最后一个较长的纯文本单元格
            texts = [clean_text(td.get_text()) for td in seg_soup.select("td")]
            texts = [t for t in texts if len(t) > 10 and "①" not in t and "(全日制)" not in t]
            remark = texts[-1] if texts else ""

        programs.append(
            Program(
                code=code,
                name=name,
                quota=quota,
                directions=directions,
                subjects=subjects,
                retest=retest,
                retest_subjects=retest_subjects,
                remark=remark,
                degree_type=degree,
            )
        )
    return programs


def parse_reference_books(html: str) -> dict[str, str]:
    s = soup(html)
    text = s.get_text("\n")
    m = re.search(r"“(.+?)\s*”课程参考书如下", text, re.S)
    subject = clean_text(m.group(1)) if m else ""
    books = ""
    idx = text.find("参考书目")
    if idx >= 0:
        books = clean_text(text[idx + len("参考书目"):])
    return {"subject": subject, "books": books}


class CatalogSource:
    def __init__(self, http: Http, cfg: dict[str, Any]):
        self.http = http
        self.cfg = cfg
        self.base_tpl: str = cfg["catalog"].get("base", "https://yzglxt.njau.edu.cn/gts{year}/zsmlgl/")
        self.college_code: str = str(cfg["target"].get("college_code", "003"))

    def detect_years(self) -> list[int]:
        years = [int(y) for y in self.cfg["catalog"].get("years") or []]
        if years:
            return years
        this = date.today().year
        found: list[int] = []
        for y in range(this + 1, this - 3, -1):
            url = self.base_tpl.format(year=y) + "zsml_ss_default.aspx"
            resp = self.http.request("GET", url)
            if resp is not None and resp.status_code == 200 and "drpyx" in resp.text:
                found.append(y)
                if len(found) >= (2 if self.cfg["catalog"].get("compare_previous_year") else 1):
                    break
        return found

    def fetch_year(self, year: int, with_books: bool = True) -> dict[str, Any] | None:
        base = self.base_tpl.format(year=year)
        url = base + "zsml_ss_default.aspx"
        html = self.http.get_text(url)
        if not html:
            return None
        form = {n: v for n, v in _HIDDEN.findall(html)}
        form = {k: _unescape(v) for k, v in form.items()}
        form.update({"drpnd": str(year), "drpyx": self.college_code, "btnSearch": "查 询"})
        result = self.http.post_text(url, data=form, headers={"Referer": url})
        if not result:
            return None
        programs = parse_programs(result)
        if not programs:
            log.warning("[catalog %s] 未解析到专业，页面结构可能变化", year)
            return None
        target_codes = {m["code"] for m in self.cfg["target"].get("majors", [])}
        books: dict[str, dict[str, str]] = {}
        if with_books:
            codes: list[str] = []
            for p in programs:
                if target_codes and p.code not in target_codes:
                    continue
                codes += [s["code"] for s in p.subjects] + [s["code"] for s in p.retest_subjects]
            for km in sorted(set(codes)):
                h = self.http.get_text(base + f"zsml_ss_view.aspx?kmdm={km}")
                if h:
                    books[km] = parse_reference_books(h)
        return {
            "year": year,
            "source_url": url,
            "college": parse_college_header(result),
            "programs": [p.to_dict() for p in programs],
            "reference_books": books,
            "target_codes": sorted(target_codes),
        }


def _unescape(v: str) -> str:
    import html as _h

    return _h.unescape(v)


def _strip_code(code: str, name: str) -> str:
    """链接文本形如 '857 农业资源环境概论'，去掉前置科目代码只留名称。"""
    return clean_text(re.sub(r"^\s*" + re.escape(code) + r"\s*", "", clean_text(name)))


def diff_catalog(old: dict[str, Any] | None, new: dict[str, Any] | None, target_codes: set[str] | None = None) -> list[str]:
    """比较两年（或两次抓取）的目录，输出人可读的差异。"""
    if not old or not new:
        return []
    o = {p["code"]: p for p in old["programs"]}
    n = {p["code"]: p for p in new["programs"]}
    out: list[str] = []
    codes = set(o) | set(n)
    if target_codes:
        codes &= target_codes
    for c in sorted(codes):
        if c not in o:
            out.append(f"新增专业 {c} {n[c]['name']}")
            continue
        if c not in n:
            out.append(f"取消专业 {c} {o[c]['name']}")
            continue
        po, pn = o[c], n[c]
        label = f"{c} {pn['name']}"
        if po.get("quota") != pn.get("quota"):
            out.append(f"{label}：拟招生人数 {po.get('quota')} → {pn.get('quota')}")
        so = [s["code"] + " " + s["name"] for s in po.get("subjects", [])]
        sn = [s["code"] + " " + s["name"] for s in pn.get("subjects", [])]
        if so != sn:
            out.append(f"{label}：初试科目 {'、'.join(so)} → {'、'.join(sn)}")
        if po.get("retest") != pn.get("retest"):
            out.append(f"{label}：复试科目 {po.get('retest')} → {pn.get('retest')}")
        if po.get("directions") != pn.get("directions"):
            out.append(f"{label}：研究方向有调整 → {'；'.join(pn.get('directions', []))}")
        bo, bn = old.get("reference_books", {}), new.get("reference_books", {})
        for km in {s["code"] for s in pn.get("subjects", []) + pn.get("retest_subjects", [])}:
            if km in bo and km in bn and bo[km].get("books") != bn[km].get("books"):
                out.append(f"{label}：科目 {km} 参考书目变化 → {bn[km].get('books')}")
    return out
