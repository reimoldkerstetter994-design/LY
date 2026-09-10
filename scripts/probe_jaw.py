#!/usr/bin/env python3
"""What sets the measured breadth at the jaw, and where the lip seam ends."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from humanforge import presets
from humanforge.figure import build_figure
from humanforge.head import FACE_Y, FACE_Z
from humanforge.sdf import evaluate_points

name = sys.argv[1] if len(sys.argv) > 1 else "male_average"
figure = build_figure(presets.get(name))
m = figure.measures
origin = figure.skeleton.p("head_origin")
basis = figure.skeleton.frames["head"]
hh, depth = m.head_height, m.face_depth
ops = figure.body.ops
print(f"{name}: {len(ops)} ops; jaw/lip ops present:")
print("  " + ", ".join(sorted({o.name for o in ops if "lip" in o.name or "goni" in o.name
                               or "scm" in o.name or "neck" in o.name}))) 

xs = np.arange(0.0, 0.090, 0.0009)
ys = np.arange(-0.12, 0.12, 0.0009)


def outermost(z_frac: float, ahead: float) -> tuple[float, str]:
    z = z_frac * hh
    local = np.stack(np.meshgrid(xs, ys, np.array([z]), indexing="ij"), axis=-1)
    world = origin + local @ basis.T
    inside = evaluate_points(ops, world) < 0.0
    keep = ys > ahead * depth
    inside = inside[:, keep, :]
    hit = np.flatnonzero(inside.any(axis=(1, 2)))
    if not hit.size:
        return 0.0, "-"
    reach = xs[hit[-1]]
    # Which op owns that point?
    j = np.flatnonzero(inside[hit[-1]].any(axis=1))[-1]
    point = (origin + np.array([reach, ys[keep][j], z]) @ basis.T)[None, :]
    owner = "-"
    for op in ops:
        if op.mode == "add" and float(op.primitive.distance_points(point)[0]) < 0.002:
            owner = op.name
    return reach * 1000.0, owner


print("\n  breadth at the gonion, by height (mm each side), and what reaches it:")
for off in (-0.03, -0.015, 0.0, 0.015, 0.03):
    reach, owner = outermost(FACE_Z["gonion"] + off, FACE_Y["gonion"] - 0.020)
    print(f"    z {FACE_Z['gonion'] + off:.3f}  reach {reach:6.1f}  {owner}")

print("\n  lip seam: front surface at three heights, by x (mm)")
for key, off in (("lip_upper", 0.0), ("lip_line", 0.0), ("lip_lower", 0.0)):
    z = (FACE_Z[key] + off) * hh
    local = np.stack(np.meshgrid(xs, ys, np.array([z]), indexing="ij"), axis=-1)
    inside = evaluate_points(ops, origin + local @ basis.T) < 0.0
    front = np.full(xs.size, np.nan)
    for i in range(xs.size):
        hit = np.flatnonzero(inside[i, :, 0])
        if hit.size:
            front[i] = ys[hit[-1]]
    print(f"    {key:10s} " + " ".join(
        f"{v * 1000:5.1f}" if np.isfinite(v) else "   --" for v in front[::4]
    ))
print("    x mm       " + " ".join(f"{v * 1000:5.0f}" for v in xs[::4]))
