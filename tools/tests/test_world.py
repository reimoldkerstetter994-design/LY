#!/usr/bin/env python3
"""Validate exported Devworld data without launching the engine."""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PATH = os.path.join(ROOT, "assets", "data", "world.json")
GLB = os.path.join(ROOT, "assets", "models", "devworld.glb")


def main() -> int:
    errors = []
    if not os.path.isfile(GLB) or os.path.getsize(GLB) < 50_000:
        errors.append(f"missing glb: {GLB}")
    with open(PATH, encoding="utf-8") as f:
        world = json.load(f)
    for key in ("spawn", "colliders", "interactables", "districts", "tokens", "player"):
        if key not in world:
            errors.append(f"missing {key}")
    spawn = world.get("spawn", {})
    for k in ("x", "y", "z"):
        if k not in spawn:
            errors.append(f"spawn missing {k}")
    kinds = {m.get("id"): m.get("kind") for m in world.get("interactables", [])}
    for ident in ("ada", "compile", "token_git", "token_debug", "token_api", "token_ci", "token_bloom"):
        if ident not in kinds:
            errors.append(f"missing interactable {ident}")
    if len(world.get("tokens", [])) != 5:
        errors.append("need 5 tokens")
    if len(world.get("colliders", [])) < 8:
        errors.append("too few colliders")
    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 1
    print(
        "OK",
        f"colliders={len(world['colliders'])}",
        f"marks={len(world['interactables'])}",
        f"districts={len(world['districts'])}",
        f"glb={os.path.getsize(GLB)}",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
