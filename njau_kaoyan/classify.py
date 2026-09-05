from __future__ import annotations

from typing import Any

# 分类规则：按顺序匹配，先命中先得。先只看标题，标题分不出来再看摘要。
_CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("推免", ("推免", "免试")),
    ("调剂", ("调剂",)),
    ("成绩与分数线", ("分数线", "复试线", "国家线", "成绩基本要求", "初试成绩", "总分排名", "成绩复查", "成绩公示")),
    ("复试与录取", ("复试", "拟录取", "录取名单", "调档", "面试", "笔试考场")),
    ("招生简章与目录", ("招生章程", "招生简章", "专业目录", "招生目录", "考试科目", "参考书目", "初试科目", "报考点", "网上确认", "考场安排")),
    ("真题与资料", ("真题", "回忆版", "试题", "题库", "笔记", "讲义", "资料", "模拟卷", "大纲", "刷题")),
    ("经验与备考", ("经验", "复习", "备考", "上岸", "攻略", "分析", "报录比", "难度", "怎么样", "难不难")),
    ("导师与学科", ("导师", "学科", "实验室", "课题组", "专业介绍")),
]


def _match(text: str) -> str:
    for cat, keys in _CATEGORY_RULES:
        if any(k in text for k in keys):
            return cat
    return "其他"


def categorize(title: str, summary: str = "") -> str:
    cat = _match(title)
    if cat == "其他" and summary:
        cat = _match(summary[:300])
    return cat


def relevance_score(text: str, rel_cfg: dict[str, Any]) -> int:
    """返回相关性得分；0 表示不相关或被排除。"""
    t = text.lower()
    if any(k.lower() in t for k in rel_cfg.get("exclude_any", [])):
        return 0
    must = rel_cfg.get("must_any", [])
    if must and not any(k.lower() in t for k in must):
        return 0
    topics = rel_cfg.get("topic_any", [])
    hits = sum(1 for k in topics if k.lower() in t)
    if topics and hits == 0:
        return 0
    # 命中专业强相关词加权
    strong = ("857", "农业资源环境概论", "土壤学", "植物营养", "资环", "0903", "资源与环境")
    hits += 2 * sum(1 for k in strong if k in text)
    return hits
