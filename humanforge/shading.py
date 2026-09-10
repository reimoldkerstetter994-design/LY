"""Per-vertex skin attributes: where the body is tanned, flushed, oily or thin.

Skin is not one colour.  Forearms and faces carry years of sun that a torso
does not; cheeks, ears, knuckles and knees sit over dense capillary beds and run
pink; the forehead and nose are oilier and so glossier than the cheeks; eyelids,
lips and ears are thin enough that light passes through them.  Rendering all of
that with one flat base colour is the single most common reason a figure reads as
plastic, and none of it can be recovered procedurally from object coordinates,
because "this is a forearm" is a fact about the skeleton, not about a bounding
box.

So the attributes are baked here, where the skeleton and the face landmarks are
still available, and handed to the shader as named vertex attributes.  Values are
in 0..1 and are deliberately smooth: hard region boundaries are far more
noticeable than a slightly misplaced gradient.
"""

from __future__ import annotations

import numpy as np

from .figure import Figure
from .polygonize import Mesh, _vertex_neighbours

ATTRIBUTES = ("exposure", "flush", "oil", "thin", "crease")
"""Names written onto the mesh, in the order the shader expects them."""


def _falloff(distance: np.ndarray, inner: float, outer: float) -> np.ndarray:
    """1 inside ``inner``, 0 beyond ``outer``, smoothstep in between."""
    t = np.clip((distance - inner) / max(outer - inner, 1e-9), 0.0, 1.0)
    return 1.0 - t * t * (3.0 - 2.0 * t)


def _point_distance(points: np.ndarray, centre: np.ndarray) -> np.ndarray:
    return np.linalg.norm(points - centre[None, :], axis=1)


def _capsule_distance(
    points: np.ndarray, a: np.ndarray, b: np.ndarray
) -> np.ndarray:
    """Distance from each point to the segment ``a``--``b``."""
    axis = b - a
    length_sq = float(axis @ axis)
    if length_sq < 1e-12:
        return _point_distance(points, a)
    t = np.clip(((points - a[None, :]) @ axis) / length_sq, 0.0, 1.0)
    return np.linalg.norm(points - (a[None, :] + t[:, None] * axis[None, :]), axis=1)


def vertex_normals(mesh: Mesh) -> np.ndarray:
    """Area-weighted vertex normals, unit length."""
    v = mesh.verts.astype(np.float64)
    a, b, c = v[mesh.tris[:, 0]], v[mesh.tris[:, 1]], v[mesh.tris[:, 2]]
    face = np.cross(b - a, c - a)
    normals = np.zeros_like(v)
    for column in range(3):
        np.add.at(normals, mesh.tris[:, column], face)
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    return (normals / np.maximum(length, 1e-12)).astype(np.float32)


def _diffuse(
    values: np.ndarray,
    src: np.ndarray,
    dst: np.ndarray,
    degree: np.ndarray,
    iterations: int,
) -> np.ndarray:
    """Blur a per-vertex scalar over the mesh graph."""
    out = values.astype(np.float32, copy=True)
    for _ in range(iterations):
        summed = np.zeros_like(out)
        np.add.at(summed, src, out[dst])
        out = 0.5 * out + 0.5 * (summed / degree)
    return out


def crease_depth(mesh: Mesh, voxel: float, spread: int = 6) -> np.ndarray:
    """How concave the surface is around each vertex, in 0..1.

    Real skin collects shadow and grime wherever it folds -- between the fingers,
    in the armpit, around the nostrils, under the buttock.  A cheap and stable
    proxy is the mesh Laplacian projected onto the normal, which is positive in
    concavities and negative on bulges; blurring it over a few rings turns a
    noisy per-vertex number into something that behaves like a soft occlusion
    term.
    """
    normals = vertex_normals(mesh)
    src, dst, degree = _vertex_neighbours(mesh)
    verts = mesh.verts.astype(np.float32)
    summed = np.zeros_like(verts)
    np.add.at(summed, src, verts[dst])
    laplacian = summed / degree[:, None] - verts
    signed = np.einsum("ij,ij->i", laplacian, normals) / max(voxel, 1e-9)
    depth = np.clip(signed / 0.30, 0.0, 1.0)
    return _diffuse(depth, src, dst, degree, spread)


# Sun exposure by body region.  A clothed adult's face, neck, forearms and
# hands are the parts that see daylight; everything else is one to two shades
# lighter, which is exactly the contrast a single flat base colour destroys.
REGION_EXPOSURE = {
    "head": 1.00,
    "neck": 0.82,
    "upper_arm": 0.34,
    "forearm": 0.90,
    "hand": 0.95,
    "torso": 0.06,
    "thigh": 0.10,
    "shank": 0.30,
    "foot": 0.22,
}


def _region_weights(figure: Figure, points: np.ndarray) -> dict[str, np.ndarray]:
    """Soft membership of each vertex in each body region.

    Distances are taken to the bone segments rather than to bounding boxes, so
    the boundary between forearm and upper arm follows the elbow wherever the
    pose has put it.
    """
    skeleton = figure.skeleton
    H = figure.height
    sigma = 0.045 * H

    distances: dict[str, np.ndarray] = {}
    head_centre = figure.landmarks["head_centre"]
    distances["head"] = np.maximum(
        _point_distance(points, head_centre) - figure.measures.head_height * 0.42,
        0.0,
    )
    neck = skeleton.segments["neck"]
    distances["neck"] = _capsule_distance(points, neck.start, neck.end)

    for name in ("upper_arm", "forearm", "hand", "thigh", "shank", "foot"):
        both = [
            _capsule_distance(points, seg.start, seg.end)
            for seg in (skeleton.segments[f"{name}_l"], skeleton.segments[f"{name}_r"])
        ]
        distances[name] = np.minimum(*both)

    trunk = np.column_stack(
        [
            _capsule_distance(points, skeleton.p("sacrum"), skeleton.p("waist")),
            _capsule_distance(points, skeleton.p("waist"), skeleton.p("chest")),
            _capsule_distance(points, skeleton.p("chest"), skeleton.p("cervicale")),
        ]
    )
    distances["torso"] = trunk.min(axis=1)

    weights = {
        name: np.exp(-(distance / sigma) ** 2).astype(np.float32)
        for name, distance in distances.items()
    }
    total = np.zeros(points.shape[0], dtype=np.float32)
    for weight in weights.values():
        total += weight
    np.maximum(total, 1e-6, out=total)
    return {name: weight / total for name, weight in weights.items()}


def _exposure(figure: Figure, points: np.ndarray) -> np.ndarray:
    weights = _region_weights(figure, points)
    out = np.zeros(points.shape[0], dtype=np.float32)
    for name, weight in weights.items():
        out += weight * REGION_EXPOSURE[name]
    return np.clip(out, 0.0, 1.0)


def _flush(figure: Figure, points: np.ndarray) -> np.ndarray:
    """Capillary redness: cheeks, ears, nose, lips, knuckles, elbows, knees."""
    H = figure.height
    skeleton = figure.skeleton
    landmarks = figure.landmarks
    out = np.zeros(points.shape[0], dtype=np.float32)

    def bump(centre, inner, outer, amount) -> None:
        nonlocal out
        out = np.maximum(out, amount * _falloff(_point_distance(points, centre), inner, outer))

    for tag in ("l", "r"):
        bump(skeleton.p(f"cheek_{tag}"), 0.012 * H, 0.045 * H, 0.95)
        bump(skeleton.p(f"ear_{tag}"), 0.006 * H, 0.030 * H, 1.00)
        # Knuckles and finger tips, where the skin is thin over bone.
        bump(skeleton.p(f"hand_end_{tag}"), 0.010 * H, 0.055 * H, 0.70)
        bump(skeleton.p(f"elbow_{tag}"), 0.014 * H, 0.045 * H, 0.55)
        bump(skeleton.p(f"knee_{tag}"), 0.018 * H, 0.055 * H, 0.60)
        bump(skeleton.p(f"heel_{tag}"), 0.012 * H, 0.045 * H, 0.65)
        bump(skeleton.p(f"toe_{tag}"), 0.012 * H, 0.050 * H, 0.70)
    bump(skeleton.p("nose"), 0.008 * H, 0.030 * H, 0.85)
    bump(skeleton.p("mouth"), 0.008 * H, 0.026 * H, 1.00)
    bump(landmarks["chin"], 0.008 * H, 0.030 * H, 0.45)
    return out


def _oil(figure: Figure, points: np.ndarray) -> np.ndarray:
    """Sebaceous zones, which are glossier: forehead, nose, chin, upper back."""
    H = figure.height
    skeleton = figure.skeleton
    out = np.zeros(points.shape[0], dtype=np.float32)

    def bump(centre, inner, outer, amount) -> None:
        nonlocal out
        out = np.maximum(out, amount * _falloff(_point_distance(points, centre), inner, outer))

    bump(skeleton.p("brow"), 0.014 * H, 0.040 * H, 0.90)
    bump(skeleton.p("nose"), 0.010 * H, 0.028 * H, 1.00)
    bump(figure.landmarks["chin"], 0.008 * H, 0.028 * H, 0.55)
    # Upper back and the front of the chest, the other two oily regions.
    bump(skeleton.p("cervicale"), 0.020 * H, 0.075 * H, 0.40)
    return out


def _thin(figure: Figure, points: np.ndarray) -> np.ndarray:
    """Where light passes through: eyelids, ears, lips, nostrils, webbing."""
    H = figure.height
    skeleton = figure.skeleton
    out = np.zeros(points.shape[0], dtype=np.float32)

    def bump(centre, inner, outer, amount) -> None:
        nonlocal out
        out = np.maximum(out, amount * _falloff(_point_distance(points, centre), inner, outer))

    for tag in ("l", "r"):
        bump(figure.landmarks[f"eye_{tag}"], 0.006 * H, 0.020 * H, 0.85)
        bump(skeleton.p(f"ear_{tag}"), 0.004 * H, 0.028 * H, 1.00)
        bump(skeleton.p(f"hand_end_{tag}"), 0.008 * H, 0.050 * H, 0.55)
    bump(skeleton.p("mouth"), 0.006 * H, 0.022 * H, 0.90)
    bump(skeleton.p("nose"), 0.010 * H, 0.026 * H, 0.60)
    return out


def skin_attributes(
    figure: Figure, mesh: Mesh, voxel: float
) -> dict[str, np.ndarray]:
    """Per-vertex attributes for the skin shader, each in 0..1."""
    points = mesh.verts.astype(np.float64)
    return {
        "exposure": _exposure(figure, points),
        "flush": _flush(figure, points),
        "oil": _oil(figure, points),
        "thin": _thin(figure, points),
        "crease": crease_depth(mesh, voxel),
    }
