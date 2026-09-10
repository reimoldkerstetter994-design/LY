"""Measure a built figure the way a tailor would.

Realism is easy to assert and hard to verify, so the geometry is checked
numerically instead: girths are measured on planes cut perpendicular to each
limb, the enclosed volume gives an implied body mass, and both are compared
against published anthropometric ranges.  This is what keeps the muscle and fat
parameters honest -- a change that makes a preset look beefier also has to keep
its arm circumference inside the range real arms occupy.

Reference values used in the tests come from ANSUR II percentiles and the
segment mass fractions in Winter, *Biomechanics and Motor Control of Human
Movement*.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .figure import Figure
from .sdf import Field, Vec3, evaluate_points, frame_with_axis, normalize, v3

# Whole-body density in kg/L; lean bodies sit near 1.07, obese ones near 0.98.
BODY_DENSITY = 1.010


@dataclass
class Section:
    """One measured cross section."""

    name: str
    area: float
    """Enclosed area in square metres."""

    width: float
    depth: float
    girth: float
    """Tape measurement: the perimeter of the slice's convex hull.

    A tape spans concavities rather than dipping into them, so the hull is what
    a tailor's measurement actually reports.
    """

    contour: float = 0.0
    """True boundary length, which exceeds ``girth`` on concave sections."""


def _contour_length(inside: np.ndarray, step: float) -> float:
    """Perimeter of a filled boolean slice, via the Cauchy--Crofton formula.

    Counting how often families of parallel lines cross the boundary gives the
    perimeter of any curve, convex or not, without tracing contours::

        P = (pi / 2) * mean over directions of (crossings * line spacing)

    Four directions (0, 45, 90 and 135 degrees) are enough to land within a
    couple of percent on limb-shaped sections, and the estimate is exact for a
    circle.
    """
    if not inside.any():
        return 0.0

    # Pad so a shape touching the edge still registers its boundary.
    grid = np.pad(inside, 1, constant_values=False)
    integrals = (
        np.count_nonzero(grid[1:, :] != grid[:-1, :]) * step,
        np.count_nonzero(grid[:, 1:] != grid[:, :-1]) * step,
        np.count_nonzero(grid[1:, 1:] != grid[:-1, :-1]) * step / np.sqrt(2.0),
        np.count_nonzero(grid[1:, :-1] != grid[:-1, 1:]) * step / np.sqrt(2.0),
    )
    return float(np.mean(integrals)) * np.pi / 2.0


def _hull_perimeter(u: np.ndarray, v: np.ndarray) -> float:
    """Perimeter of the convex hull of a point set (Andrew's monotone chain)."""
    if u.size < 3:
        return 0.0
    points = np.unique(np.column_stack((u, v)), axis=0)
    order = np.lexsort((points[:, 1], points[:, 0]))
    points = points[order]

    def half(seq: np.ndarray) -> list[np.ndarray]:
        stack: list[np.ndarray] = []
        for point in seq:
            while len(stack) >= 2:
                a, b = stack[-2], stack[-1]
                cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (
                    point[0] - a[0]
                )
                if cross > 0.0:
                    break
                stack.pop()
            stack.append(point)
        return stack

    hull = half(points)[:-1] + half(points[::-1])[:-1]
    if len(hull) < 3:
        return 0.0
    loop = np.array(hull + [hull[0]])
    return float(np.linalg.norm(np.diff(loop, axis=0), axis=1).sum())


def _flood(allowed: np.ndarray, seed: np.ndarray) -> np.ndarray:
    """Cells of ``allowed`` reachable from ``seed`` under 4-connectivity."""
    current = seed & allowed
    if not current.any():
        return current
    while True:
        grown = current.copy()
        grown[1:, :] |= current[:-1, :]
        grown[:-1, :] |= current[1:, :]
        grown[:, 1:] |= current[:, :-1]
        grown[:, :-1] |= current[:, 1:]
        grown &= allowed
        if np.array_equal(grown, current):
            return current
        current = grown


def _isolate(inside: np.ndarray) -> np.ndarray:
    """Solid part of a slice that belongs to the body part being measured.

    A horizontal cut at chest height also passes through both arms, and carved
    features such as the eye sockets can leave enclosed pockets.  Filling the
    pockets and keeping only the component that contains the centre of the plane
    turns the slice into the single closed curve a tape measure would follow.
    """
    border = np.zeros_like(inside)
    border[0, :] = border[-1, :] = True
    border[:, 0] = border[:, -1] = True
    outside = _flood(~inside, border)
    solid = ~outside  # holes are now filled

    centre = np.zeros_like(inside)
    centre[inside.shape[0] // 2, inside.shape[1] // 2] = True
    component = _flood(solid, centre)
    if component.any():
        return component
    # The plane's centre missed the body (a limb cut off axis): fall back to the
    # largest component by growing from the densest row.
    rows = solid.sum(axis=1)
    seed = np.zeros_like(inside)
    row = int(np.argmax(rows))
    seed[row, int(np.argmax(solid[row]))] = True
    return _flood(solid, seed)


def measure_section(
    field: Field,
    centre: Vec3,
    axis: Vec3,
    extent: float,
    samples: int = 220,
    name: str = "",
    side_hint: Vec3 | None = None,
) -> Section:
    """Cut ``field`` with a plane through ``centre`` normal to ``axis``."""
    frame = frame_with_axis(
        axis, side_hint if side_hint is not None else v3(1.0, 0.0, 0.0)
    )
    u_axis, v_axis = frame[:, 0], frame[:, 1]
    grid = np.linspace(-extent, extent, samples)
    step = float(grid[1] - grid[0])
    uu, vv = np.meshgrid(grid, grid, indexing="ij")
    points = (
        centre[None, None, :]
        + uu[..., None] * u_axis[None, None, :]
        + vv[..., None] * v_axis[None, None, :]
    )

    inside = evaluate_points(field.ops, points) < 0.0
    if not inside.any():
        return Section(name, 0.0, 0.0, 0.0, 0.0)
    inside = _isolate(inside)
    if not inside.any():
        return Section(name, 0.0, 0.0, 0.0, 0.0)

    u_hits = uu[inside]
    v_hits = vv[inside]
    return Section(
        name=name,
        area=float(np.count_nonzero(inside)) * step * step,
        width=float(u_hits.max() - u_hits.min()),
        depth=float(v_hits.max() - v_hits.min()),
        girth=_hull_perimeter(u_hits, v_hits),
        contour=_contour_length(inside, step),
    )


def _horizontal(figure: Figure, height: float, name: str, extent: float) -> Section:
    # Seed the slice on the spine, which is always inside the trunk.
    x, y = figure.skeleton.spine_offset_at(height)
    return measure_section(
        figure.body,
        v3(x, y, height),
        v3(0.0, 0.0, 1.0),
        extent,
        name=name,
        side_hint=v3(1.0, 0.0, 0.0),
    )


def _limb(
    figure: Figure, segment_name: str, side: float, t: float, name: str, extent: float
) -> Section:
    segment = figure.skeleton.s(segment_name, side)
    return measure_section(
        figure.body,
        segment.at(t),
        segment.axis,
        extent,
        name=name,
        side_hint=segment.side,
    )


def crotch_height(figure: Figure, samples: int = 140) -> float:
    """Height at which the thighs stop being one mass, as a fraction of stature.

    Thighs really do meet under the pelvis, so the useful question is where the
    gap opens.  On a standing adult that happens at roughly 47-50 % of stature;
    if the fusion runs lower the legs read as too short however correct the
    joint positions are.
    """
    H = figure.height
    grid = np.linspace(-0.16 * H, 0.16 * H, samples)
    step = float(grid[1] - grid[0])
    xx, yy = np.meshgrid(grid, grid, indexing="ij")
    min_area = (0.02 * H) ** 2  # ignore slivers left by the blend

    for z in np.linspace(0.54 * H, 0.34 * H, 80):
        points = np.stack((xx, yy, np.full_like(xx, z)), axis=-1)
        inside = evaluate_points(figure.body.ops, points) < 0.0
        if not inside.any():
            continue
        left = _isolate_at(inside, np.argmax(grid > 0.05 * H), samples // 2)
        right = _isolate_at(inside, np.argmax(grid > -0.05 * H) - 1, samples // 2)
        if not (left.any() and right.any()):
            continue
        separated = not (left & right).any()
        big_enough = min(
            left.sum(), right.sum()
        ) * step * step > min_area
        if separated and big_enough:
            return float(z / H)
    return 0.0


def _isolate_at(inside: np.ndarray, row: int, col: int) -> np.ndarray:
    """Component of ``inside`` containing one sample, holes filled."""
    border = np.zeros_like(inside)
    border[0, :] = border[-1, :] = True
    border[:, 0] = border[:, -1] = True
    solid = ~_flood(~inside, border)
    seed = np.zeros_like(inside)
    row = int(np.clip(row, 0, inside.shape[0] - 1))
    seed[row, int(np.clip(col, 0, inside.shape[1] - 1))] = True
    return _flood(solid, seed)


def body_metrics(figure: Figure) -> dict[str, float]:
    """Standard tape measurements plus the implied mass, all in metres and kg."""
    m = figure.measures
    H = m.height
    torso_extent = 0.35 * H
    out: dict[str, float] = {}

    # Trunk girths are taken on horizontal planes, as a tailor would.
    for key, height, extent in (
        ("chest", m.h("nipple") + 0.004 * H, torso_extent),
        ("waist", m.h("waist"), torso_extent),
        ("hip", 0.522 * H, torso_extent),
    ):
        section = _horizontal(figure, height, key, extent)
        out[f"{key}_girth"] = section.girth
        out[f"{key}_width"] = section.width
        out[f"{key}_depth"] = section.depth

    # The neck is measured across its own axis, not horizontally: the front of
    # the neck is far longer than the back, so a level cut would clip the jaw.
    # The neck is measured at its narrowest, just below the larynx and above
    # the trapezius flare; a level cut lower down would include the shoulders.
    out["neck_girth"] = _horizontal(figure, 0.862 * H, "neck", 0.090 * H).girth

    out["crotch_height"] = crotch_height(figure)

    # Limb girths use planes perpendicular to the limb, and only the left side
    # (the two differ by the deliberate millimetre-scale asymmetry).
    limbs = (
        ("upper_arm", "upper_arm", 0.50, 0.14),
        ("forearm", "forearm", 0.22, 0.13),
        ("wrist", "forearm", 0.95, 0.10),
        # Below the pubic mass, where the thigh is a free-standing limb.
        ("thigh", "thigh", 0.50, 0.14),
        ("mid_thigh", "thigh", 0.70, 0.14),
        ("knee", "thigh", 1.00, 0.15),
        ("calf", "shank", 0.28, 0.15),
        ("ankle", "shank", 0.93, 0.11),
    )
    for key, segment, t, extent in limbs:
        section = _limb(figure, segment, 1.0, t, key, extent * H / 1.75)
        out[f"{key}_girth"] = section.girth

    # Head circumference is taken above the ears, over the brow and occiput.
    head = _horizontal(figure, m.h("chin") + 0.66 * m.head_height, "head", 0.10 * H)
    out["head_girth"] = head.girth
    out["head_width"] = head.width
    out["head_depth"] = head.depth

    out["height"] = H
    out["heads_tall"] = H / m.head_height
    out["shoulder_width"] = _horizontal(
        figure, m.h("acromion") - 0.012 * H, "shoulders", torso_extent
    ).width
    return out


def implied_mass(volume: float) -> float:
    """Body mass in kg for an enclosed volume in cubic metres."""
    return volume * 1000.0 * BODY_DENSITY


def implied_bmi(volume: float, height: float) -> float:
    return implied_mass(volume) / (height * height)


def format_metrics(figure: Figure, volume: float | None = None) -> str:
    """One-line-per-measurement report, in centimetres."""
    metrics = body_metrics(figure)
    lines = [figure.measures.describe()]
    order = (
        "head_girth",
        "neck_girth",
        "shoulder_width",
        "chest_girth",
        "waist_girth",
        "hip_girth",
        "upper_arm_girth",
        "forearm_girth",
        "wrist_girth",
        "thigh_girth",
        "mid_thigh_girth",
        "knee_girth",
        "calf_girth",
        "ankle_girth",
    )
    for key in order:
        lines.append(f"    {key:18s} {metrics[key] * 100:6.1f} cm")
    if volume is not None:
        mass = implied_mass(volume)
        lines.append(
            f"    {'mass (implied)':18s} {mass:6.1f} kg   "
            f"BMI {implied_bmi(volume, figure.height):.1f}"
        )
    return "\n".join(lines)
