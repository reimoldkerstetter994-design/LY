#!/usr/bin/env python3
"""Measure how round each limb is, in four directions, at named stations.

A limb built as a tapered cone with muscle masses blended onto it can look
plausible in a silhouette and still be a tube, because a mass whose centre is
offset by less than its own radius from the cone's surface never emerges from
it at all -- it adds volume the eye cannot see and changes nothing.  That is an
arithmetic mistake, not an aesthetic one, and this is what catches it: it walks
out from the limb's centre line in four directions and reports where the skin
actually is, as a fraction of the local bone-derived radius.

An anatomical thigh is not round.  The quadriceps carry it forward and the
vastus lateralis outward, so a section through mid-thigh is 10-15 % deeper than
it is wide and its widest point is above the middle.  Four numbers within a
percent or two of each other mean the muscles are not reaching the surface.

    python3 scripts/probe_limb.py
    python3 scripts/probe_limb.py male_athletic elder_female
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from humanforge import presets
from humanforge.figure import build_figure
from humanforge.sdf import normalize, surface_along

SIDE = 1.0  # the figure's left; the right is its mirror

# Segment, how far along it, and which measured radius to report against.
STATIONS = (
    ("upper_arm", 0.42, "upper_arm"),
    ("forearm", 0.26, "forearm"),
    ("thigh", 0.50, "thigh"),
    ("thigh", 0.72, "thigh"),
    ("shank", 0.28, "calf"),
)


def probe(name: str) -> None:
    figure = build_figure(presets.get(name))
    skeleton = figure.skeleton
    ops = figure.body.ops
    print(f"{name}")
    print(
        f"{'station':>18}  {'front':>7} {'back':>7} {'lateral':>7} {'medial':>7}"
        f"   {'spread':>7}"
    )
    for segment_name, along, radius_key in STATIONS:
        segment = skeleton.s(segment_name, SIDE)
        radius = skeleton.measures.r(radius_key)
        centre = segment.at(along)
        axis = normalize(segment.axis)
        # Column 0 is the frame's transverse axis, which points the same way in the
        # world on both sides of the body; multiplying by the limb's sign is what
        # makes it mean medial.  See Segment.side.  Getting that backwards silently
        # swaps two of the four numbers below and hides the fault this script exists
        # to find, so it is written out rather than assumed.
        medial = SIDE * normalize(segment.frame[:, 0])
        forward = normalize(segment.frame[:, 1])
        del axis

        found = {}
        for label, direction in (
            ("front", forward),
            ("back", -forward),
            ("lateral", -medial),
            ("medial", medial),
        ):
            hit = surface_along(ops, centre, direction, radius * 4.0)
            found[label] = float(np.linalg.norm(hit - centre)) / radius

        spread = max(found.values()) - min(found.values())
        label = f"{segment_name} {along:.2f}"
        print(
            f"{label:>18}  "
            + " ".join(f"{found[k]:7.3f}" for k in ("front", "back", "lateral", "medial"))
            + f"   {spread:7.3f}"
        )
    print()


def main(argv: list[str]) -> int:
    for name in argv or ["male_average", "male_athletic"]:
        probe(name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
