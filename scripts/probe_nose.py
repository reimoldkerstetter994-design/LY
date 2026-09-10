#!/usr/bin/env python3
"""Dump the front surface across the nose, to choose a breadth definition."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from humanforge import presets
from humanforge.figure import build_figure
from humanforge.head import FACE_Z
from humanforge.sdf import evaluate_points

STEP = 0.0008

for name in sys.argv[1:] or ["male_average"]:
    figure = build_figure(presets.get(name))
    m = figure.measures
    origin = figure.skeleton.p("head_origin")
    basis = figure.skeleton.frames["head"]
    hh = m.head_height

    xs = np.arange(-0.040, 0.0401, STEP)
    ys = np.arange(-0.02, 0.14, STEP)
    print(f"{name}: front surface by x, mm, at heights around the subnasale")
    for offset in (-0.010, -0.005, 0.0, 0.005):
        z = (FACE_Z["subnasale"] + offset) * hh
        local = np.stack(
            np.meshgrid(xs, ys, np.array([z]), indexing="ij"), axis=-1
        )
        inside = evaluate_points(figure.body.ops, origin + local @ basis.T) < 0.0
        front = np.full(xs.size, np.nan)
        for i in range(xs.size):
            hit = np.flatnonzero(inside[i, :, 0])
            if hit.size:
                front[i] = ys[hit[-1]]
        print(f"  z {offset:+.3f}: " + " ".join(
            f"{v * 1000:5.1f}" if np.isfinite(v) else "   --" for v in front[::2]
        ))
    print("     x mm : " + " ".join(f"{v * 1000:5.0f}" for v in xs[::2]))
