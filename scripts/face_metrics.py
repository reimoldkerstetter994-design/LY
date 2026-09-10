#!/usr/bin/env python3
"""Measure a built head against published craniofacial anthropometry.

Eyeballing clay renders is a bad way to judge a face.  The errors that make a
head look wrong are a few millimetres in one dimension, and at that scale the eye
reports "somehow off" without saying where, while the same error is obvious the
moment the bizygomatic breadth or the nose protrusion is printed next to the
figure it should be.

Only the sections that are actually measured get evaluated, which keeps the whole
report to a couple of seconds; and each breadth is taken over a window around the
landmark it belongs to, because the neck is genuinely wider than the jaw and the
ears are genuinely wider than the skull, so an unrestricted extent measures those
instead.

The midline profile is the most useful part of the output: the forehead slope, the
brow, the nose, the lip step and the chin all show up in one column of numbers.

    python3 scripts/face_metrics.py [preset ...] [--profile] [--where]
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from humanforge import presets
from humanforge.figure import build_figure
from humanforge.head import FACE_Y, FACE_Z, HEAD_STATIONS
from humanforge.sdf import evaluate_points

# Adult male ANSUR II means, in millimetres, with a band of roughly one standard
# deviation.  Other figures are compared against the same numbers scaled by their
# own head height, which is crude but catches gross errors.
TARGETS = {
    "head_breadth": (145.0, 160.0),
    "head_length": (188.0, 206.0),
    "bizygomatic": (128.0, 145.0),
    "bigonial": (100.0, 120.0),
    "menton_nasion": (113.0, 132.0),
    "menton_nose_tip": (76.0, 94.0),
    "nose_protrusion": (17.0, 26.0),
    "nose_breadth": (31.0, 41.0),
    "mouth_breadth": (45.0, 58.0),
    "ear_length": (55.0, 70.0),
    "ear_protrusion": (12.0, 26.0),
    "interpupillary": (58.0, 70.0),
}

REFERENCE_HEAD_HEIGHT = 232.0
STEP = 0.0018
# The midline is a single slice rather than a block, so it can afford a much
# finer grid -- and it needs one.  A nose tip is a point, and on a 2 mm grid
# whether a sample lands on it or a millimetre to one side changes the measured
# projection by more than the tolerance on the measurement itself.
FINE = 0.0006


def _axis(low: float, high: float, step: float = STEP) -> np.ndarray:
    """Samples from ``low`` to ``high`` inclusive, never past ``high``.

    Overshooting matters: a slab that reaches even one step above the subnasale
    picks up the side of the nose on its way to the tip, and since a breadth is
    the widest thing anywhere in the slab, that one stray level is what gets
    reported.
    """
    count = int(round((high - low) / step)) + 1
    return low + step * np.arange(count)


class Head:
    """Samples the body field around one head, in the head's own frame.

    Sampling axis-aligned slabs out of world space only works on a figure whose
    head faces straight down +Y.  Most of the presets are posed, and a head turned
    by even a few degrees measures wrong in every dimension at once: the slabs cut
    the skull obliquely so the breadths come out too wide, and the sagittal slice
    misses the midline, so the nose disappears and the profile turns into a flat
    wall.  Working in head-local coordinates -- lateral, forward and up as the head
    itself defines them -- makes every measurement independent of the pose, which
    is what lets one set of target bands apply to all twelve presets.

    Coordinates here are local metres from the head origin, which sits on the neck
    axis at chin height; dividing by the head's own height, breadth or face depth
    turns them into the fractions :data:`FACE_Z`, :data:`FACE_X` and
    :data:`FACE_Y` are written in.
    """

    def __init__(self, figure) -> None:
        self.figure = figure
        m = figure.measures
        self.hh = m.head_height
        self.ops = figure.body.ops
        self.origin = figure.skeleton.p("head_origin")
        self.basis = figure.skeleton.frames["head"]
        self.face_depth = m.face_depth
        self.breadth = m.b("head")

    def z(self, key: str, offset: float = 0.0) -> float:
        """A named height as local metres above the chin."""
        return (FACE_Z[key] + offset) * self.hh

    def forward(self, depth: float) -> float:
        """A face depth as local metres, so windows can be set on landmarks."""
        return depth * self.face_depth

    def relative(self, local_y: float) -> float:
        return local_y / self.face_depth

    def _inside(self, xs, ys, zs) -> np.ndarray:
        local = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), axis=-1)
        return evaluate_points(self.ops, self.origin + local @ self.basis.T) < 0.0

    def section(
        self, z_low: float, z_high: float, half_x: float = 0.115, y_step: float = STEP
    ):
        """Inside mask on an (x, y, z) block of local metres, plus its axes.

        ``y_step`` is separate because the nose and the mouth are measured by how
        far the surface stands in front of, or behind, another part of the same
        section -- by one or two millimetres.  On the coarse grid those readings
        come out quantised to a single step, so a threshold anywhere near one step
        is decided by floating point rather than by the geometry.  Sampling the
        depth axis at the fine spacing costs a few hundred thousand extra points
        and makes the comparison mean something.
        """
        xs = _axis(-half_x, half_x)
        ys = _axis(-0.14, 0.14, y_step)
        zs = _axis(z_low, z_high)
        return xs, ys, zs, self._inside(xs, ys, zs)

    def midline(self):
        """Front and back of the head down the midline, per height."""
        ys = _axis(-0.14, 0.14, FINE)
        zs = _axis(-0.020, self.hh + 0.020, FINE)
        inside = self._inside(np.zeros(1), ys, zs)[0]
        front = np.full(zs.size, np.nan)
        back = np.full(zs.size, np.nan)
        for k in range(zs.size):
            hit = np.flatnonzero(inside[:, k])
            if hit.size:
                front[k] = ys[hit[-1]]
                back[k] = ys[hit[0]]
        return zs / self.hh, front, back


def _flare(
    xs, ys, block, base: tuple[float, float], excess: float
) -> tuple[float, np.ndarray]:
    """Breadth of a feature standing proud of the surface it sits on, in mm.

    A nose has no edge.  Its front surface rises continuously out of the cheek,
    with no step to threshold on and no local minimum at the alar crease -- only a
    change of slope.  So measuring it as "everything within so many millimetres of
    the frontmost point" fails in both directions at once: the reference point is
    the columella, which moves whenever the tip does, so the reading changes when
    the nose gets longer and not when it gets wider.

    What is stable is the cheek itself, which is nearly straight across the width
    of a nose.  Fitting a line to it over ``base`` (a window of ``|x|``, in metres,
    outside the feature), extending that line inwards and taking the outermost
    point standing ``excess`` in front of it is what a caliper on the alar bases
    measures, and it does not care where the tip is.

    ``base`` has to sit immediately outboard of the wing and no further.  A cheek
    is only straight *locally*: fitting a line over the next centimetre and a half
    beyond that instead, where the section has begun to turn towards the ear, gives
    a slope half again as steep, and extended back to the midline that line passes
    in front of the nose tip -- so the nose comes out as no width at all.
    """
    front = np.full(xs.size, -np.inf)
    for i in range(xs.size):
        hit = np.flatnonzero(block[i].any(axis=1))
        if hit.size:
            front[i] = ys[hit[-1]]

    reach = []
    for sign in (-1.0, 1.0):
        side = sign * xs
        cheek = (side >= base[0]) & (side <= base[1]) & np.isfinite(front)
        if cheek.sum() < 3:
            return 0.0, front
        slope, intercept = np.polyfit(side[cheek], front[cheek], 1)
        inner = np.flatnonzero((side >= 0.0) & (side < base[0]) & np.isfinite(front))
        out = 0.0
        for i in inner[np.argsort(-side[inner])]:
            if front[i] - (slope * side[i] + intercept) >= excess:
                out = side[i]
                break
        reach.append(out)
    return float(sum(reach)) * 1000.0, front


def _breadth(xs, mask) -> tuple[float, float]:
    """Full breadth of ``mask`` and the x it is reached at."""
    columns = mask.reshape(xs.size, -1).any(axis=1)
    if not columns.any():
        return 0.0, 0.0
    hit = np.flatnonzero(columns)
    reach = max(abs(xs[hit[0]]), abs(xs[hit[-1]]))
    return 2000.0 * reach, 1000.0 * reach


def _seam(xs, ys, zs, block, seam_z: float, depth: float) -> tuple[float, np.ndarray]:
    """Breadth of the mouth, in millimetres, taken from the seam between the lips.

    The lips cannot be measured the way the nose is.  At mouth height the cheek
    curves away too fast for a straight line to stand in for it, and the corner of
    the mouth is not where the lips stop standing proud -- it is where the upper and
    lower lip meet, which is a *recess* between two rolls of tissue and not a
    high point at all.  So the reading here is how far behind the lips themselves
    the surface falls at the seam height: that difference is a couple of
    millimetres between the lips and nothing at all past the corner, which is
    exactly where a caliper is placed.
    """
    front = np.full((xs.size, zs.size), -np.inf)
    for i in range(xs.size):
        for k in range(zs.size):
            hit = np.flatnonzero(block[i, :, k])
            if hit.size:
                front[i, k] = ys[hit[-1]]
    seam = int(np.argmin(np.abs(zs - seam_z)))
    lips = np.where(np.isfinite(front).any(axis=1), front.max(axis=1), np.nan)
    recess = lips - front[:, seam]

    middle = int(np.argmin(np.abs(xs)))
    low = high = middle
    while low > 0 and recess[low - 1] >= depth:
        low -= 1
    while high < xs.size - 1 and recess[high + 1] >= depth:
        high += 1
    if high == low:
        return 0.0, recess
    return float(xs[high] - xs[low]) * 1000.0, recess


def measure_head(figure, where: bool = False) -> dict[str, float]:
    head = Head(figure)
    out: dict[str, float] = {}
    zs_frac, front, back = head.midline()
    out["_zs"], out["_front"], out["_back"] = zs_frac, front, back  # type: ignore[assignment]
    out["_face_depth"] = head.face_depth

    def profile_at(key: str, offset: float = 0.0, window: float = 0.002) -> float:
        """How far forward the midline reaches at a named height.

        ``window`` is a half height in metres, not head fractions, so that the
        same tolerance means the same thing on a child and on a tall adult, and
        so it can be read as "within so many millimetres of the landmark".
        """
        target = (FACE_Z[key] + offset) * head.hh
        level = np.abs(zs_frac * head.hh - target) <= max(window, FINE)
        return float(np.nanmax(front[level]))

    if where:
        print("    profile against FACE_Y, in face depths:")
        for key in ("chin", "lip_line", "subnasale", "nose_tip", "eye", "brow", "hairline"):
            want = FACE_Y.get({"lip_line": "lip", "hairline": "forehead"}.get(key, key))
            got = profile_at(key) / head.face_depth
            note = f"  want {want:+.3f}" if want is not None else ""
            print(f"      {key:11s} {got:+.3f}{note}")

    # Skull breadth and length, taken above the ears so they cannot contribute.
    xs, ys, zs, block = head.section(head.z("brow", 0.055), head.z("brow", 0.105))
    out["head_breadth"], _ = _breadth(xs, block)
    rows = block.reshape(-1, ys.size, zs.size).any(axis=0).any(axis=1)
    span = np.flatnonzero(rows)
    out["head_length"] = float(ys[span[-1]] - ys[span[0]]) * 1000.0

    # Face breadths.  Each is the widest point within three centimetres of the
    # landmark's own height, and the jaw is additionally clipped to the part of
    # the section in front of the ear canal, because at the angle of the jaw the
    # neck behind it really is the wider of the two.
    # The window on the cheekbones sits just in front of the ear, and no further
    # forward than that.  The zygion is a long way back -- it is the point of the
    # arch immediately ahead of the ear canal -- so a window set at the cheek
    # proper cuts off the widest part of the section and reports a face a
    # centimetre too narrow, while a window any further back lets the ear in,
    # which at this height really is the widest thing on the head.
    xs, ys, zs, block = head.section(head.z("zygomatic", -0.02), head.z("zygomatic", 0.02))
    ahead = ys > head.forward(0.050)
    out["bizygomatic"], zyg_at = _breadth(xs, block[:, ahead, :])

    xs, ys, zs, block = head.section(head.z("gonion", -0.008), head.z("gonion", 0.008))
    ahead = ys > head.forward(FACE_Y["gonion"]) - 0.004
    out["bigonial"], gon_at = _breadth(xs, block[:, ahead, :])

    # The nose and mouth are only the part of the section standing in front of the
    # face, so the cheeks behind them do not swamp the measurement.
    xs, ys, zs, block = head.section(
        head.z("subnasale", -0.008), head.z("subnasale", 0.008), y_step=FINE
    )
    out["nose_breadth"], nose_front = _flare(xs, ys, block, (0.021, 0.034), 0.0012)

    xs, ys, zs, block = head.section(
        head.z("lip_lower", -0.010), head.z("lip_upper", 0.010), y_step=FINE
    )
    # A couple of millimetres, which is the shallowest seam that reads as a seam
    # rather than as the cheek sloping away between the top and the bottom of the
    # window.  Below about a millimetre the latter wins and the mouth measures out
    # to the ear.
    out["mouth_breadth"], mouth_front = _seam(
        xs, ys, zs, block, head.z("lip_line"), 0.0025
    )

    # Ears.  Measured against the skull's own half breadth at each height, taken
    # from the loft table the skull is built from.  Comparing against the widest
    # part of the head instead reports no ear at all, since an ear sits well below
    # the parietals; comparing against the section behind it reports an ear
    # everywhere, since the section narrows towards the back on its own.
    xs, ys, zs, block = head.section(
        head.z("subnasale", -0.08), head.z("ear_top", 0.02), half_x=0.130
    )
    levels = [row[0] for row in HEAD_STATIONS]
    widths = [row[1] for row in HEAD_STATIONS]
    stand_off = np.zeros(zs.size)
    for k in range(zs.size):
        _, reach = _breadth(xs, block[:, :, k : k + 1])
        skull = float(np.interp(zs[k] / head.hh, levels, widths))
        stand_off[k] = reach - skull * head.breadth * 1000.0
    if stand_off.max() > 1.0:
        out["ear_protrusion"] = float(stand_off.max())
        showing = np.flatnonzero(stand_off > 4.0)
        out["ear_length"] = float(zs[showing[-1]] - zs[showing[0]]) * 1000.0
    else:
        out["ear_protrusion"] = out["ear_length"] = 0.0

    # Heights are read off the profile: the nasion is the deepest point of the
    # bridge and the subnasale the step at the base of the nose, so finding them
    # rather than assuming them is what checks that they exist at all.
    def extreme(low: float, high: float, deepest: bool) -> float:
        window = (zs_frac > low) & (zs_frac < high) & np.isfinite(front)
        if not window.any():
            return 0.0
        values = front[window]
        pick = np.argmin(values) if deepest else np.argmax(values)
        return float(zs_frac[window][pick]) * head.hh * 1000.0

    # The nasion is the dip between the brow ridge and the bridge of the nose, so
    # the search has to stop below the brow.  Letting it run past the ridge finds
    # the forehead falling away above it instead, which is deeper than the nasion
    # and a good two centimetres higher up.
    out["menton_nasion"] = extreme(FACE_Z["nasion"] - 0.06, FACE_Z["brow"] - 0.002, True)
    out["menton_nose_tip"] = extreme(FACE_Z["subnasale"], FACE_Z["nasion"], False)
    # Straight from subnasale to pronasale.  Taking the base as the deepest point
    # anywhere below the tip measures the philtrum instead, which is a groove and
    # is deeper than the notch under the nose.
    out["nose_protrusion"] = (
        profile_at("nose_tip", window=0.003) - profile_at("subnasale", window=0.001)
    ) * 1000.0

    left, right = figure.landmarks["eyeball_l"], figure.landmarks["eyeball_r"]
    out["interpupillary"] = float(np.linalg.norm(left - right)) * 1000.0

    if where:
        print(
            f"    breadth reached at x: zygomatic {zyg_at:.0f} mm, "
            f"gonion {gon_at:.0f} mm"
        )
        for label, curve in (
            ("nose front by x", nose_front),
            ("mouth seam recess by x", mouth_front),
        ):
            shown = [
                f"{v * 1000:.0f}" if np.isfinite(v) else "--"
                for v in curve[:: max(1, curve.size // 18)]
            ]
            print(f"    {label}: " + " ".join(shown))
    return out


def main() -> int:
    names = [a for a in sys.argv[1:] if not a.startswith("-")] or ["male_average"]
    failures = 0

    for name in names:
        figure = build_figure(presets.get(name))
        metrics = measure_head(figure, where="--where" in sys.argv)
        scale = figure.measures.head_height * 1000.0 / REFERENCE_HEAD_HEIGHT
        print(f"{name}: head height {figure.measures.head_height * 1000:.0f} mm")
        for key, (low, high) in TARGETS.items():
            value = metrics[key]
            lo, hi = low * scale, high * scale
            ok = lo <= value <= hi
            failures += 0 if ok else 1
            print(
                f"  {'  ' if ok else '<<'} {key:16s} {value:6.1f} mm"
                f"   want {lo:5.0f} - {hi:5.0f}"
            )

        if "--profile" in sys.argv:
            print("\n  midline profile: mm forward of mid head, per head height")
            zs = metrics["_zs"]  # type: ignore[index]
            front, back = metrics["_front"], metrics["_back"]  # type: ignore[index]
            labels = {round(v, 3): k for k, v in FACE_Z.items()}
            for index in range(0, zs.size, 3):
                if not np.isfinite(front[index]):
                    continue
                z = zs[index]
                near = min(labels, key=lambda v: abs(v - z))
                tag = labels[near] if abs(near - z) < 0.006 else ""
                depth = metrics["_face_depth"]  # type: ignore[index]
                bar = "#" * int(max(0.0, front[index] - back[index]) * 1000.0 / 4.0)
                print(
                    f"   {z:5.3f} back {back[index] / depth:+6.3f}"
                    f"  front {front[index] / depth:+6.3f}"
                    f"  ({front[index] * 1000:+6.1f} mm) {bar} {tag}"
                )
        print()

    print("all head measurements inside range" if not failures else f"{failures} out of range")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
