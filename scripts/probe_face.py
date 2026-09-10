#!/usr/bin/env python3
"""Print the raw curves the nose and mouth measurements are derived from.

The metric report says a breadth is wrong; it cannot say whether the geometry is
wrong or the estimator is being fooled.  Both happen, and they need opposite
fixes, so the way to tell them apart is to look at the surface the estimator is
looking at: the front of the face across the alar bases, and how far the seam
between the lips falls behind the lips themselves.

    python3 scripts/probe_face.py [preset]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from humanforge import presets
from humanforge.figure import build_figure
from humanforge.head import FACE_Z
from scripts.face_metrics import Head, _axis


def main() -> int:
    name = sys.argv[1] if len(sys.argv) > 1 else "male_average"
    head = Head(build_figure(presets.get(name)))

    xs, ys, zs, block = head.section(head.z("subnasale", -0.008), head.z("subnasale", 0.008))
    print("front of the face at alar height, mm forward of mid head:")
    for i in range(xs.size):
        hit = np.flatnonzero(block[i].any(axis=1))
        if hit.size and xs[i] >= -0.0005:
            print(f"   x {xs[i] * 1000:6.1f}   front {ys[hit[-1]] * 1000:6.1f}")

    xs, ys, zs, block = head.section(
        head.z("lip_lower", -0.010), head.z("lip_upper", 0.010)
    )
    front = np.full((xs.size, zs.size), -np.inf)
    for i in range(xs.size):
        for k in range(zs.size):
            hit = np.flatnonzero(block[i, :, k])
            if hit.size:
                front[i, k] = ys[hit[-1]]
    seam = int(np.argmin(np.abs(zs - head.z("lip_line"))))
    print("\nlips against the seam between them, mm:")
    for i in range(xs.size):
        if not np.isfinite(front[i]).any() or xs[i] < -0.0005:
            continue
        lip = front[i].max()
        print(
            f"   x {xs[i] * 1000:6.1f}   lip {lip * 1000:6.1f}"
            f"   seam {front[i, seam] * 1000:6.1f}   recess {(lip - front[i, seam]) * 1000:5.1f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
