#!/usr/bin/env python3
"""Find places where the solid has stopped being a distance field.

Marching tetrahedra locates the surface by interpolating linearly between grid
samples, which is only accurate where the field's gradient has magnitude one --
that is, where the value really is a distance.  Every primitive here satisfies
that on its own.  Smooth booleans do not: where two surfaces cross at a shallow
angle, the blend averages two nearly *opposite* normals, and the average of two
opposite vectors is nearly zero.  Through that band the field barely changes,
the interpolated crossing can be out by several times the true distance, and the
surface comes out as a rough broken line -- which is what the dotted line along
a jaw or around an ear actually is.

So this is the numeric form of the glancing-crossing rule that is quoted all
over the modelling code.  It needs no renders, which matters because at the voxel
spacing where these artefacts show, one clay close-up costs a couple of minutes.

Anything under about 0.4 will be visible as a broken line at a 1.5 mm voxel.

    python3 scripts/probe_field.py
    python3 scripts/probe_field.py --preset male_heavy --region jaw --worst 12
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from humanforge import presets
from humanforge.figure import Figure, build_figure
from humanforge.sdf import Field, Op, evaluate_points

# Boxes worth checking, each given relative to a landmark in head heights or
# stature so that they follow the figure.
REGIONS = {
    "jaw": ("head_centre", (-0.02, -0.30, -0.62), (0.42, 0.26, -0.16)),
    "ear": ("head_centre", (0.16, -0.34, -0.30), (0.58, 0.20, 0.14)),
    "eye": ("eye_mid", (-0.42, -0.10, -0.24), (0.42, 0.30, 0.28)),
    "mouth": ("nose_tip", (-0.34, -0.28, -0.60), (0.34, 0.14, 0.06)),
    "nose": ("nose_tip", (-0.26, -0.30, -0.30), (0.26, 0.14, 0.26)),
    "shoulder": ("shoulder_l", (-0.30, -0.30, -0.34), (0.30, 0.30, 0.20)),
    "groin": ("hip", (-0.40, -0.40, -0.40), (0.40, 0.40, 0.20)),
    "knee": ("root", (0.20, -0.30, 1.60), (0.80, 0.30, 2.30)),
}

EPS = 2.0e-4


def gradient(ops: list[Op], points: np.ndarray) -> np.ndarray:
    total = 0.0
    for axis in range(3):
        step = np.zeros(3)
        step[axis] = EPS
        slope = (
            evaluate_points(ops, points + step) - evaluate_points(ops, points - step)
        ) / (2.0 * EPS)
        total = total + slope * slope
    return np.sqrt(total)


def blame(ops: list[Op], point: np.ndarray) -> list[tuple[float, str]]:
    """Which ops actually decide the value at ``point``.

    Found by removing each one and seeing whether the value moves, which is the
    only reliable way once the ops have been folded through smooth minima.
    """
    base = float(evaluate_points(ops, point[None, :])[0])
    found = []
    for index, op in enumerate(ops):
        trimmed = Field("trimmed")
        trimmed.ops = ops[:index] + ops[index + 1 :]
        moved = abs(float(evaluate_points(trimmed.ops, point[None, :])[0]) - base)
        if moved > 1.0e-6:
            found.append((moved, op.name or f"op{index}"))
    found.sort(reverse=True)
    return found


def scan(figure: Figure, region: str, samples: int, worst: int) -> float:
    landmark, low, high = REGIONS[region]
    scale = figure.measures.b("head_height")
    origin = figure.landmarks[landmark]
    lo = origin + np.asarray(low) * scale
    hi = origin + np.asarray(high) * scale

    axes = [np.linspace(lo[i], hi[i], samples) for i in range(3)]
    grid = np.stack(np.meshgrid(*axes, indexing="ij"), axis=-1)
    value = evaluate_points(figure.body.ops, grid)
    magnitude = gradient(figure.body.ops, grid)

    # Only the shell that the mesher actually interpolates through matters.
    near = np.abs(value) < 0.0016
    if not near.any():
        print(f"  {region:9s} nothing near the surface in this box")
        return 1.0
    flat = magnitude[near]
    print(
        f"  {region:9s} |grad| min={flat.min():.3f} p01={np.percentile(flat, 1):.3f} "
        f"p05={np.percentile(flat, 5):.3f} median={np.median(flat):.3f}"
        f"   {'OK' if flat.min() > 0.40 else 'ROUGH'}"
    )

    if worst and flat.min() <= 0.40:
        points = grid.reshape(-1, 3)
        order = np.argsort(np.where(near.reshape(-1), magnitude.reshape(-1), np.inf))
        seen: set[str] = set()
        for index in order[:worst]:
            for moved, name in blame(figure.body.ops, points[index])[:2]:
                if name in seen:
                    continue
                seen.add(name)
                print(
                    f"      {name:26s} moves the value by {moved * 1000:6.3f} mm "
                    f"where |grad| = {magnitude.reshape(-1)[index]:.3f}"
                )
    return float(flat.min())


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preset", action="append", default=[])
    parser.add_argument("--region", action="append", default=[], choices=sorted(REGIONS))
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--worst", type=int, default=6)
    args = parser.parse_args(argv)

    for name in args.preset or ["male_average", "male_athletic"]:
        print(name)
        figure = build_figure(presets.get(name))
        for region in args.region or sorted(REGIONS):
            scan(figure, region, args.samples, args.worst)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
