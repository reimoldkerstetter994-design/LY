"""Which ops are covering the eyeball?

Samples the body field on the surface of the placed globe: a positive value
means that point of the eye is outside the face and therefore visible.  Runs the
same probe with each op removed in turn, so the ops that are actually sealing
the aperture name themselves instead of having to be guessed at.

    python3 scripts/probe_eye.py [preset] [--ablate]
"""

from __future__ import annotations

import sys

import numpy as np

sys.path.insert(0, ".")

from humanforge.figure import build_figure
from humanforge.presets import PRESETS
from humanforge.sdf import evaluate_points, v3

# The globe is only 24 mm across and the lids leave a 10 mm slot, so this is the
# whole of the region that can be visible.
LATERAL = np.linspace(-0.011, 0.011, 7)
VERTICAL = np.linspace(-0.005, 0.005, 5)


def globe_samples(figure, tag: str = "l") -> np.ndarray:
    """Points on the front of the eyeball, laid out as (vertical, lateral, 3)."""
    attachment = next(a for a in figure.attachments if a.name == f"eye_{tag}")
    centre = attachment.centre
    radius = float(attachment.size[0])
    frame = attachment.frame
    side, out, up = frame[:, 0], frame[:, 1], frame[:, 2]

    points = np.zeros((VERTICAL.size, LATERAL.size, 3))
    for j, w in enumerate(VERTICAL):
        for i, u in enumerate(LATERAL):
            planar = min(u * u + w * w, radius * radius * 0.999)
            depth = np.sqrt(radius * radius - planar)
            points[j, i] = centre + side * u + up * w + out * depth
    return points


def exposure(ops, points: np.ndarray) -> np.ndarray:
    return evaluate_points(ops, points) * 1000.0


def show(title: str, values: np.ndarray) -> None:
    print(title)
    for row in values[::-1]:
        print("   " + " ".join(f"{v:+6.1f}" for v in row))


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    name = args[0] if args else "male_average"
    figure = build_figure(PRESETS[name])
    points = globe_samples(figure)
    base = exposure(figure.body.ops, points)

    print(f"{name}: exposure of the left globe in mm, rows top to bottom")
    print(f"lateral {LATERAL[0]*1000:+.0f}..{LATERAL[-1]*1000:+.0f} mm, "
          f"vertical {VERTICAL[0]*1000:+.0f}..{VERTICAL[-1]*1000:+.0f} mm")
    show("", base)
    print(f"visible samples: {int((base > 0).sum())} / {base.size}")

    if "--ablate" not in sys.argv:
        return

    print("\nremoving one op at a time (only ops that matter are listed):")
    ops = figure.body.ops
    rows = []
    for index, op in enumerate(ops):
        trimmed = ops[:index] + ops[index + 1:]
        values = exposure(trimmed, points)
        gain = values - base
        if float(np.abs(gain).max()) < 0.15:
            continue
        rows.append((float(gain.max()), op.name or f"op{index}", op.mode, values))
    rows.sort(reverse=True)
    for gain, opname, mode, values in rows:
        print(f"\n  drop {opname!r} ({mode}): best gain {gain:+.1f} mm, "
              f"visible {int((values > 0).sum())}/{values.size}")
        show("", values)


if __name__ == "__main__":
    main()
