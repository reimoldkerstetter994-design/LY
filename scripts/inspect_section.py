#!/usr/bin/env python3
"""Print the raw cross sections behind one figure's trunk girths.

The girth numbers alone cannot tell a blend that has inflated the whole slice
apart from a neighbouring limb that has merged into it, so this dumps width,
depth, area and both perimeter estimates, plus an ASCII picture of the slice.

    python3 scripts/inspect_section.py male_average waist
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from humanforge import presets
from humanforge.figure import build_figure
from humanforge.metrics import _isolate, measure_section
from humanforge.sdf import evaluate_points, v3

LEVELS = {
    "neck": (0.862, 0.055),
    "shoulders": (0.806, 0.35),
    "chest": (0.724, 0.35),
    "waist": (0.620, 0.35),
    "hip": (0.522, 0.35),
    "crotch": (0.470, 0.35),
    "head": (0.955, 0.10),
}


def picture(figure, z: float, extent: float, cols: int = 64) -> str:
    grid = np.linspace(-extent, extent, cols)
    xx, yy = np.meshgrid(grid, grid, indexing="ij")
    points = np.stack((xx, yy, np.full_like(xx, z)), axis=-1)
    inside = evaluate_points(figure.body.ops, points) < 0.0
    kept = _isolate(inside)
    rows = []
    for j in range(cols - 1, -1, -1):  # +y (front) at the top
        rows.append(
            "".join(
                "#" if kept[i, j] else ("." if inside[i, j] else " ")
                for i in range(cols)
            )
        )
    return "\n".join(rows)


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "male_average"
    wanted = sys.argv[2:] or list(LEVELS)
    figure = build_figure(presets.get(name))
    H = figure.height
    print(f"{name}: {H * 100:.1f} cm")

    for key in wanted:
        fraction, extent = LEVELS[key]
        z = fraction * H
        x, y = figure.skeleton.spine_offset_at(z)
        section = measure_section(
            figure.body, v3(x, y, z), v3(0.0, 0.0, 1.0), extent * H, name=key
        )
        print(
            f"\n{key:10s} z={z:.3f} ({fraction:.3f} H)"
            f"  width {section.width * 100:5.1f}"
            f"  depth {section.depth * 100:5.1f}"
            f"  girth {section.girth * 100:6.1f}"
            f"  contour {section.contour * 100:6.1f}"
            f"  area {section.area * 1e4:7.1f} cm2"
        )
        print(picture(figure, z, extent * H))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
