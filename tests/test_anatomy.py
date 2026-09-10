"""Checks that the built figures stay anatomical.

These are deliberately about shape rather than about code paths.  Every fault
this file guards against was one that left the program working perfectly: the
figures built, the surface was closed, the measurements were in range, and the
result was wrong in a way only a render showed.  Each test below encodes what
the render showed, so that the next change has to keep it true.
"""

from __future__ import annotations

import numpy as np
import pytest

from humanforge import presets
from humanforge.figure import build_figure
from humanforge.hair import STYLES
from humanforge.head import HEAD_STATIONS
from humanforge.sdf import evaluate_points, normalize, surface_along

# Building a whole figure is a second or so of numpy, so the presets are shared.
_CACHE: dict[str, object] = {}


def figure(name: str):
    if name not in _CACHE:
        _CACHE[name] = build_figure(presets.get(name))
    return _CACHE[name]


def radii(name: str, segment_name: str, along: float) -> dict[str, float]:
    """Where the skin is in four directions, as a fraction of the limb radius."""
    built = figure(name)
    segment = built.skeleton.s(segment_name, 1.0)
    reference = built.skeleton.measures.r(segment_name.replace("shank", "calf"))
    centre = segment.at(along)
    # Column 0 of a segment frame is not mirrored between sides; the limb's own
    # sign is what turns it into "medial".  See Segment.side.
    medial = normalize(segment.frame[:, 0])
    forward = normalize(segment.frame[:, 1])
    found = {}
    for label, direction in (
        ("front", forward),
        ("back", -forward),
        ("lateral", -medial),
        ("medial", medial),
    ):
        hit = surface_along(built.body.ops, centre, direction, reference * 4.0)
        found[label] = float(np.linalg.norm(hit - centre)) / reference
    return found


def test_every_preset_builds() -> None:
    for name in presets.names():
        built = figure(name)
        assert built.body.ops
        lo, hi = built.body.bounds()
        assert hi[2] - lo[2] > 0.5 * built.height


@pytest.mark.parametrize("name", ["male_average", "male_athletic", "female_average"])
def test_limbs_are_not_tubes(name: str) -> None:
    """A limb section must be visibly non-circular.

    The muscle masses were all offset from the limb axis by less than their own
    radius, so none of them broke the surface of the cone they were blended onto
    and the limbs came out as smooth tapering tubes with a named mass for every
    muscle group buried inside.  Four radii within a few percent of each other is
    the signature of that, and it is the only thing that catches it, because the
    girths, the volume and the silhouette were all correct throughout.
    """
    for segment_name, along in (("upper_arm", 0.42), ("thigh", 0.50), ("shank", 0.28)):
        found = radii(name, segment_name, along)
        spread = max(found.values()) - min(found.values())
        assert spread > 0.15, f"{name} {segment_name} is round: {found}"


@pytest.mark.parametrize("name", ["male_average", "male_athletic", "female_average"])
def test_thigh_is_deeper_than_it_is_wide(name: str) -> None:
    """The quadriceps and hamstrings together outrun the vastus laterally.

    True of every human thigh, and the cheapest single check that the front and
    back masses are reaching the surface at all.
    """
    found = radii(name, "thigh", 0.50)
    depth = found["front"] + found["back"]
    breadth = found["lateral"] + found["medial"]
    assert depth > breadth * 1.05, f"{name}: {found}"


@pytest.mark.parametrize("name", ["male_average", "female_average"])
def test_thigh_bulges_laterally_not_medially(name: str) -> None:
    """The vastus lateralis is on the outside.

    It was on the inside, and so were the peroneals, and the two heads of the
    gastrocnemius were swapped: a segment frame's transverse column points
    medially on both sides of the body, so ``side=side * x`` is medial, and every
    call site had read it as lateral.  A thigh with the bulge on the wrong side
    still looks like a thigh, which is why this needs asserting rather than
    looking at.
    """
    found = radii(name, "thigh", 0.50)
    assert found["lateral"] > found["medial"] + 0.10, f"{name}: {found}"


@pytest.mark.parametrize("name", ["male_average", "female_average"])
def test_calf_bulges_behind_the_shin(name: str) -> None:
    found = radii(name, "shank", 0.28)
    assert found["back"] > found["front"] + 0.20, f"{name}: {found}"


def test_paired_features_are_mirrored() -> None:
    """The two halves of a figure must be reflections to within the asymmetry.

    Two forearm masses were placed without the limb's side factor, which put the
    ulnar styloid on the outside of one wrist and the inside of the other.  A
    deliberate millimetre of asymmetry is seeded into the skeleton, so this
    compares the *surface*, and allows for that much and no more.
    """
    built = figure("male_average")
    ops = built.body.ops
    reach = 0.30 * built.height

    for segment_name, along in (("forearm", 0.30), ("forearm", 0.96), ("thigh", 0.46)):
        for outward in (True, False):
            distances = []
            for side in (1.0, -1.0):
                segment = built.skeleton.s(segment_name, side)
                centre = segment.at(along)
                medial = side * normalize(segment.frame[:, 0])
                direction = -medial if outward else medial
                hit = surface_along(ops, centre, direction, reach)
                distances.append(float(np.linalg.norm(hit - centre)))
            gap = abs(distances[0] - distances[1])
            assert gap < 0.004, f"{segment_name} {along} {outward}: {distances}"


def test_head_is_widest_above_the_ear_and_below_the_crown() -> None:
    """The euryon.

    The width table once peaked at 0.74 of head height, which is most of the way
    to the crown, and the vault ballooned out above the ears.  A real head is
    widest just above and behind the ear, a little under two thirds of the way up.
    """
    heights = np.array([row[0] for row in HEAD_STATIONS])
    widths = np.array([row[1] for row in HEAD_STATIONS])
    assert np.all(np.diff(heights) > 0.0)
    euryon = heights[int(np.argmax(widths))]
    assert 0.55 < euryon < 0.68


def test_hair_clears_the_skull_without_a_stub_on_the_crown() -> None:
    """The shell has to close where the skull closes.

    Offsetting the station table outwards rather than scaling it leaves a stub of
    exactly the offset standing on the vertex, where the table has already tapered
    to a point.  The signature is a hair mesh whose topmost section is far wider
    than a scalp's, so this compares the two silhouettes near the top.
    """
    for name in ("male_average", "female_average", "female_curvy"):
        built = figure(name)
        assert built.hair is not None
        skin_lo, skin_hi = built.body.bounds()
        hair_lo, hair_hi = built.hair.bounds()

        clearance = hair_hi[2] - skin_hi[2]
        assert 0.002 < clearance < 0.045, f"{name}: {clearance}"

        # Just under the top of the shell it must still be narrow, the way a
        # crown is.  A stub is narrow too, but it stands well above the skull.
        near_top = hair_hi[2] - 0.004
        xs = np.linspace(hair_lo[0], hair_hi[0], 81)
        ys = np.linspace(hair_lo[1], hair_hi[1], 81)
        grid_x, grid_y = np.meshgrid(xs, ys, indexing="ij")
        points = np.stack(
            (grid_x, grid_y, np.full_like(grid_x, near_top)), axis=-1
        )
        inside = evaluate_points(built.hair.ops, points) < 0.0
        assert inside.any(), f"{name}: nothing at the top of the shell"
        width = xs[np.any(inside, axis=1)]
        assert width.max() - width.min() > 0.020, f"{name}: crown is a stub"
        del skin_lo


def test_every_hair_style_builds_and_has_brows() -> None:
    from humanforge.hair import build_hair

    skeleton = figure("male_average").skeleton
    for style in list(STYLES) + [None]:
        field = build_hair(skeleton, style, None)
        names = [op.name for op in field.ops]
        assert any(name and name.startswith("brow_") for name in names), style
        if style is not None:
            assert "scalp" in names
