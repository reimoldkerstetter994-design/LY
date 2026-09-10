"""Signed distance field primitives and blending operators.

A figure is described as an ordered list of :class:`Op` records.  Each record
pairs a primitive with a blend radius and a boolean mode.  The field is
evaluated by folding the ops into an accumulator grid::

    add        field = smin(field,  d, k)
    subtract   field = smax(field, -d, k)
    intersect  field = smax(field,  d, k)

Smooth minimum/maximum is what makes the result look organic: a limb welded to
a torso with a 25 mm blend radius grows out of it the way real tissue does
instead of intersecting it like two pipes.

Conventions used across the package:

* Units are metres, the world is Z-up (Blender's convention).
* The figure faces **+Y**, its left hand side is **+X**, and the soles of the
  feet rest on the Z = 0 plane.

Distances are only approximate for anisotropically scaled primitives, which is
harmless here: the blend operators just need a smooth, monotonically increasing
function that vanishes on the surface.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np

LARGE = 1.0e6
_EPS = 1.0e-9

Vec3 = np.ndarray


def v3(x: float, y: float, z: float) -> Vec3:
    """Build a float64 3-vector."""
    return np.array([x, y, z], dtype=np.float64)


def as_v3(value: Sequence[float] | np.ndarray) -> Vec3:
    arr = np.asarray(value, dtype=np.float64)
    if arr.shape != (3,):
        raise ValueError(f"expected a 3-vector, got shape {arr.shape}")
    return arr


def normalize(value: Sequence[float] | np.ndarray) -> Vec3:
    arr = as_v3(value)
    length = float(np.linalg.norm(arr))
    if length < _EPS:
        raise ValueError("cannot normalize a zero-length vector")
    return arr / length


def rotation(axis: Sequence[float], angle_deg: float) -> np.ndarray:
    """Right-handed rotation matrix about ``axis`` (Rodrigues' formula)."""
    a = normalize(axis)
    theta = np.radians(angle_deg)
    c, s = np.cos(theta), np.sin(theta)
    cross = np.array(
        [[0.0, -a[2], a[1]], [a[2], 0.0, -a[0]], [-a[1], a[0], 0.0]],
        dtype=np.float64,
    )
    return c * np.eye(3) + s * cross + (1.0 - c) * np.outer(a, a)


def frame_from_axis(axis: Sequence[float]) -> np.ndarray:
    """Orthonormal frame whose third column follows ``axis``.

    The remaining columns are chosen so that, for a vertical axis, column 0
    points along world +X (lateral) and column 1 along world +Y (forward).
    That keeps the meaning of elliptical cross sections stable for limbs: the
    first radius is always the lateral one.
    """
    z = normalize(axis)
    hint = v3(0.0, 1.0, 0.0)
    if abs(float(np.dot(hint, z))) > 0.98:
        hint = v3(0.0, 0.0, 1.0)
    x = np.cross(hint, z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.column_stack((x, y, z))


def frame_with_axis(axis: Sequence[float], side_hint: Sequence[float]) -> np.ndarray:
    """Frame along ``axis`` whose first column stays as close to ``side_hint``
    as orthogonality allows.

    Used where a primitive's roll matters but its direction is dictated by
    anatomy, such as the Achilles tendon, which runs vertically yet must stay
    flat across the back of the heel.
    """
    z = normalize(axis)
    hint = as_v3(side_hint)
    x = hint - z * float(np.dot(hint, z))
    if float(np.linalg.norm(x)) < 1e-6:
        return frame_from_axis(z)
    x = x / np.linalg.norm(x)
    return np.column_stack((x, np.cross(z, x), z))


def smin(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    """Polynomial smooth minimum (C1 continuous)."""
    if k <= 0.0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    """Polynomial smooth maximum, the dual of :func:`smin`."""
    if k <= 0.0:
        return np.maximum(a, b)
    return -smin(-a, -b, k)


class Primitive:
    """Base class for solids that can report bounds and signed distances.

    Subclasses implement :meth:`_origin`, :meth:`_orientation` and
    :meth:`_shape`; the base class then provides both a grid sampler (used by
    the surface extractor) and a point sampler (used for measuring girths and
    for any ray query) without duplicating the shape maths.
    """

    def bounds(self) -> tuple[Vec3, Vec3]:
        raise NotImplementedError

    def _origin(self) -> Vec3:
        raise NotImplementedError

    def _orientation(self) -> np.ndarray | None:
        return None

    def _shape(self, lx, ly, lz) -> np.ndarray:
        """Signed distance in the primitive's own coordinate frame."""
        raise NotImplementedError

    def distance(self, xs: np.ndarray, ys: np.ndarray, zs: np.ndarray) -> np.ndarray:
        """Signed distance sampled on the grid ``xs`` x ``ys`` x ``zs``."""
        return self._shape(
            *self._to_local(xs[:, None, None], ys[None, :, None], zs[None, None, :])
        )

    def distance_points(self, points: np.ndarray) -> np.ndarray:
        """Signed distance at arbitrary points, shaped ``(..., 3)``."""
        pts = np.asarray(points, dtype=np.float64)
        return self._shape(*self._to_local(pts[..., 0], pts[..., 1], pts[..., 2]))

    # -- helpers for subclasses -------------------------------------------
    def _to_local(self, px, py, pz):
        origin = self._origin()
        px = px - origin[0]
        py = py - origin[1]
        pz = pz - origin[2]
        rot = self._orientation()
        if rot is None:
            return px, py, pz
        inv = rot.T  # orthonormal frame, so the transpose is the inverse
        return (
            inv[0, 0] * px + inv[0, 1] * py + inv[0, 2] * pz,
            inv[1, 0] * px + inv[1, 1] * py + inv[1, 2] * pz,
            inv[2, 0] * px + inv[2, 1] * py + inv[2, 2] * pz,
        )

    @staticmethod
    def _rotated_bounds(
        center: Vec3, half: Vec3, rot: np.ndarray | None
    ) -> tuple[Vec3, Vec3]:
        if rot is None:
            return center - half, center + half
        # A box rotated by R has half-extents |R| @ half.
        extent = np.abs(rot) @ half
        return center - extent, center + extent


@dataclass
class Sphere(Primitive):
    center: Vec3
    radius: float

    def bounds(self) -> tuple[Vec3, Vec3]:
        c = as_v3(self.center)
        return c - self.radius, c + self.radius

    def _origin(self) -> Vec3:
        return as_v3(self.center)

    def _shape(self, lx, ly, lz):
        return np.sqrt(lx * lx + ly * ly + lz * lz) - self.radius


@dataclass
class Ellipsoid(Primitive):
    """Axis-aligned or rotated ellipsoid.

    Uses Inigo Quilez's two-term approximation, which tracks the true distance
    closely enough for blending while staying cheap to evaluate.
    """

    center: Vec3
    radii: Vec3
    rot: np.ndarray | None = None

    def bounds(self) -> tuple[Vec3, Vec3]:
        return self._rotated_bounds(as_v3(self.center), as_v3(self.radii), self.rot)

    def _origin(self) -> Vec3:
        return as_v3(self.center)

    def _orientation(self) -> np.ndarray | None:
        return self.rot

    def _shape(self, px, py, pz):
        r = as_v3(self.radii)
        qx, qy, qz = px / r[0], py / r[1], pz / r[2]
        k0 = np.sqrt(qx * qx + qy * qy + qz * qz)
        sx, sy, sz = qx / r[0], qy / r[1], qz / r[2]
        k1 = np.sqrt(sx * sx + sy * sy + sz * sz)
        return k0 * (k0 - 1.0) / np.maximum(k1, _EPS)


@dataclass
class RoundCone(Primitive):
    """Capsule with a different radius at each end -- the limb workhorse.

    ``section`` scales the cross section perpendicular to the axis, so a limb
    can be wider laterally than it is deep (``section=(1.0, 0.85)``).  The
    first component is the lateral axis for any non-horizontal cone, see
    :func:`frame_from_axis`.
    """

    a: Vec3
    b: Vec3
    radius_a: float
    radius_b: float
    section: tuple[float, float] = (1.0, 1.0)
    frame: np.ndarray | None = None
    """Optional roll control: columns are (section x, section y, axis)."""

    def __post_init__(self) -> None:
        a, b = as_v3(self.a), as_v3(self.b)
        self._axis_len = float(np.linalg.norm(b - a))
        if self._axis_len < _EPS:
            raise ValueError("round cone endpoints coincide")
        if self.frame is None:
            self._frame = frame_from_axis(b - a)
        else:
            self._frame = np.asarray(self.frame, dtype=np.float64)
            axis = (b - a) / self._axis_len
            if abs(float(np.dot(self._frame[:, 2], axis))) < 0.999:
                raise ValueError("frame column 2 must run along the cone axis")

    def bounds(self) -> tuple[Vec3, Vec3]:
        a, b = as_v3(self.a), as_v3(self.b)
        sx, sy = self.section
        # Widen each cap by the anisotropic section scale.
        ra = self.radius_a * max(sx, sy, 1.0)
        rb = self.radius_b * max(sx, sy, 1.0)
        lo = np.minimum(a - ra, b - rb)
        hi = np.maximum(a + ra, b + rb)
        return lo, hi

    def _origin(self) -> Vec3:
        return as_v3(self.a)

    def _orientation(self) -> np.ndarray | None:
        return self._frame

    def _shape(self, lx, ly, lz):
        sx, sy = self.section
        lx = lx / sx
        ly = ly / sy
        h = self._axis_len
        r1, r2 = self.radius_a, self.radius_b
        radial = np.sqrt(lx * lx + ly * ly)

        slope = (r1 - r2) / h
        horiz = np.sqrt(max(1.0 - slope * slope, _EPS))
        k = -slope * radial + horiz * lz

        cap_a = np.sqrt(radial * radial + lz * lz) - r1
        dz = lz - h
        cap_b = np.sqrt(radial * radial + dz * dz) - r2
        side = horiz * radial + slope * lz - r1

        out = np.where(k < 0.0, cap_a, np.where(k > horiz * h, cap_b, side))
        return out * min(sx, sy, 1.0)


@dataclass
class RoundBox(Primitive):
    """Box with rounded corners; used for palms, soles and nails."""

    center: Vec3
    half: Vec3
    radius: float = 0.0
    rot: np.ndarray | None = None

    def bounds(self) -> tuple[Vec3, Vec3]:
        half = as_v3(self.half) + self.radius
        return self._rotated_bounds(as_v3(self.center), half, self.rot)

    def _origin(self) -> Vec3:
        return as_v3(self.center)

    def _orientation(self) -> np.ndarray | None:
        return self.rot

    def _shape(self, px, py, pz):
        half = as_v3(self.half)
        qx = np.abs(px) - half[0]
        qy = np.abs(py) - half[1]
        qz = np.abs(pz) - half[2]
        outside = np.sqrt(
            np.maximum(qx, 0.0) ** 2
            + np.maximum(qy, 0.0) ** 2
            + np.maximum(qz, 0.0) ** 2
        )
        inside = np.minimum(np.maximum(qx, np.maximum(qy, qz)), 0.0)
        return outside + inside - self.radius


@dataclass
class HalfSpace(Primitive):
    """Everything on the negative side of a plane; unbounded on purpose."""

    point: Vec3
    normal: Vec3

    def bounds(self) -> tuple[Vec3, Vec3]:
        inf = np.full(3, np.inf)
        return -inf, inf

    def _origin(self) -> Vec3:
        return as_v3(self.point)

    def _shape(self, px, py, pz):
        n = normalize(self.normal)
        return n[0] * px + n[1] * py + n[2] * pz


@dataclass
class Op:
    """One primitive plus how it is combined with everything before it."""

    primitive: Primitive
    blend: float = 0.0
    mode: str = "add"  # add | subtract | intersect
    name: str = ""

    def pad(self, spacing: float) -> float:
        """Extra margin where this op can still influence the accumulator."""
        return max(2.5 * self.blend, 2.0 * spacing)


class Field:
    """Ordered collection of ops describing one solid."""

    def __init__(self, name: str = "field") -> None:
        self.name = name
        self.ops: list[Op] = []

    def add(self, primitive: Primitive, blend: float = 0.0, name: str = "") -> Primitive:
        self.ops.append(Op(primitive, blend, "add", name))
        return primitive

    def subtract(
        self, primitive: Primitive, blend: float = 0.0, name: str = ""
    ) -> Primitive:
        self.ops.append(Op(primitive, blend, "subtract", name))
        return primitive

    def intersect(
        self, primitive: Primitive, blend: float = 0.0, name: str = ""
    ) -> Primitive:
        self.ops.append(Op(primitive, blend, "intersect", name))
        return primitive

    def extend(self, other: "Field") -> None:
        self.ops.extend(other.ops)

    def __len__(self) -> int:
        return len(self.ops)

    def bounds(self, margin: float = 0.0) -> tuple[Vec3, Vec3]:
        """Bounds of the additive ops, which enclose the surface."""
        lo = np.full(3, np.inf)
        hi = np.full(3, -np.inf)
        for op in self.ops:
            if op.mode != "add":
                continue
            plo, phi = op.primitive.bounds()
            lo = np.minimum(lo, plo)
            hi = np.maximum(hi, phi)
        if not np.all(np.isfinite(lo)):
            raise ValueError(f"field '{self.name}' has no additive geometry")
        return lo - margin, hi + margin


def evaluate_points(ops: Iterable[Op], points: np.ndarray) -> np.ndarray:
    """Fold ``ops`` at arbitrary points, shaped ``(..., 3)``.

    Used to measure the body: girths are taken on planes cut perpendicular to a
    limb, which no axis-aligned grid can provide.
    """
    pts = np.asarray(points, dtype=np.float64)
    field = np.full(pts.shape[:-1], LARGE, dtype=np.float64)
    for op in ops:
        d = op.primitive.distance_points(pts)
        if op.mode == "add":
            field = smin(field, d, op.blend)
        elif op.mode == "subtract":
            field = smax(field, -d, op.blend)
        elif op.mode == "intersect":
            field = smax(field, d, op.blend)
        else:  # pragma: no cover
            raise ValueError(f"unknown op mode {op.mode!r}")
    return field


def evaluate(
    ops: Iterable[Op],
    xs: np.ndarray,
    ys: np.ndarray,
    zs: np.ndarray,
    out: np.ndarray | None = None,
) -> np.ndarray:
    """Fold ``ops`` into a distance grid over the given sample coordinates.

    Each op is only evaluated inside its own padded bounding box, so the cost
    scales with the geometry rather than with the size of the grid.  That is
    what makes a 3 mm sample spacing over a whole figure affordable.
    """
    xs = np.ascontiguousarray(xs, dtype=np.float64)
    ys = np.ascontiguousarray(ys, dtype=np.float64)
    zs = np.ascontiguousarray(zs, dtype=np.float64)
    shape = (xs.size, ys.size, zs.size)
    if out is None:
        field = np.full(shape, LARGE, dtype=np.float32)
    else:
        if out.shape != shape:
            raise ValueError("out has the wrong shape")
        field = out
        field.fill(LARGE)

    spacing = float(xs[1] - xs[0]) if xs.size > 1 else 0.0

    for op in ops:
        lo, hi = op.primitive.bounds()
        pad = op.pad(spacing)
        i0, i1 = np.searchsorted(xs, [lo[0] - pad, hi[0] + pad], side="left")
        j0, j1 = np.searchsorted(ys, [lo[1] - pad, hi[1] + pad], side="left")
        k0, k1 = np.searchsorted(zs, [lo[2] - pad, hi[2] + pad], side="left")
        i1 = min(i1 + 1, xs.size)
        j1 = min(j1 + 1, ys.size)
        k1 = min(k1 + 1, zs.size)
        if i0 >= i1 or j0 >= j1 or k0 >= k1:
            continue

        sub = (slice(i0, i1), slice(j0, j1), slice(k0, k1))
        d = op.primitive.distance(xs[i0:i1], ys[j0:j1], zs[k0:k1]).astype(
            np.float32, copy=False
        )
        current = field[sub]
        if op.mode == "add":
            field[sub] = smin(current, d, op.blend)
        elif op.mode == "subtract":
            field[sub] = smax(current, -d, op.blend)
        elif op.mode == "intersect":
            field[sub] = smax(current, d, op.blend)
        else:  # pragma: no cover - guarded by Op construction helpers
            raise ValueError(f"unknown op mode {op.mode!r}")

    return field
