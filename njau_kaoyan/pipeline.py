from __future__ import annotations

import logging
from typing import Any

from .http import Http
from .models import Item
from .notify import send_new_items
from .report import write_reports
from .sources import CatalogSource, SearchSource, VsbSource
from .sources.catalog import diff_catalog
from .storage import Storage

log = logging.getLogger(__name__)


def run_once(
    cfg: dict[str, Any],
    store: Storage,
    *,
    do_official: bool = True,
    do_catalog: bool = True,
    do_search: bool = True,
    fetch_detail: bool = True,
    notify: bool = True,
) -> dict[str, Any]:
    http = Http(cfg)
    run_id = store.start_run()
    all_items: list[Item] = []
    notes: list[str] = []

    if do_official:
        for sec in cfg.get("official", []):
            try:
                items = VsbSource(http, sec, cfg["relevance"], fetch_detail=fetch_detail).crawl()
                all_items.extend(items)
                notes.append(f"{sec['id']}={len(items)}")
            except Exception as exc:  # noqa: BLE001
                log.exception("官方栏目 %s 抓取异常: %s", sec.get("id"), exc)

    catalog_changes: list[str] = []
    years: list[int] = []
    if do_catalog and cfg["catalog"].get("enabled", True):
        try:
            cs = CatalogSource(http, cfg)
            years = cs.detect_years()
            log.info("招生目录可用年份: %s", years)
            snaps: dict[int, dict[str, Any]] = {}
            for y in years:
                previous = store.load_snapshot(f"catalog:{y}")
                snap = cs.fetch_year(y, with_books=True)
                if snap:
                    snaps[y] = snap
                    store.save_snapshot(f"catalog:{y}", snap)
                    # 同一年内容变化（如目录中途修订）也要提示
                    same_year_changes = diff_catalog(previous, snap, set(snap.get("target_codes") or []))
                    if same_year_changes:
                        catalog_changes += [f"[{y} 目录更新] {c}" for c in same_year_changes]
            if len(years) >= 2 and all(y in snaps for y in years[:2]):
                newest, prev = years[0], years[1]
                changes = diff_catalog(snaps[prev], snaps[newest], set(snaps[newest].get("target_codes") or []))
                store.save_snapshot("catalog_diff", {"from": prev, "to": newest, "changes": changes})
            notes.append(f"catalog={list(snaps)}")
        except Exception as exc:  # noqa: BLE001
            log.exception("招生目录抓取异常: %s", exc)

    if do_search and cfg["search"].get("enabled", True):
        try:
            items = SearchSource(http, cfg).crawl()
            all_items.extend(items)
            notes.append(f"search={len(items)}")
        except Exception as exc:  # noqa: BLE001
            log.exception("搜索抓取异常: %s", exc)

    new_items = store.upsert_items(all_items)
    new_dicts = [i.to_dict() for i in new_items]
    for c in catalog_changes:
        new_dicts.append(
            {
                "title": c,
                "url": cfg["catalog"]["base"].format(year=years[0] if years else "") + "zsml_ss_default.aspx",
                "kind": "official",
                "published": "",
                "source_name": "在线招生目录",
                "category": "招生简章与目录",
            }
        )
    store.finish_run(run_id, len(new_dicts), "; ".join(notes))

    md_path, json_path = write_reports(cfg, store, new_dicts)
    pushed = send_new_items(cfg, new_dicts) if notify else False
    log.info("完成：抓取 %d 条，新增 %d 条，报告 %s", len(all_items), len(new_dicts), md_path)
    return {
        "fetched": len(all_items),
        "new": len(new_dicts),
        "new_items": new_dicts,
        "report_md": str(md_path),
        "report_json": str(json_path),
        "notified": pushed,
    }
