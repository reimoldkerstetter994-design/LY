"""Small meshes generated in numpy: eyeballs and nail plates.

Both are millimetre-scale pieces that would be wasteful and imprecise to carve
out of the body's voxel grid, so the geometry layer reports them as transforms
(see :class:`humanforge.parts.Attachment`) and they are built here at whatever
resolution they need.
"""

from __future__ import annotations

import numpy as np

from ..polygonize import Mesh


def sphere_mesh(segments: int = 56, rings: int = 28) -> Mesh:
    """A unit UV sphere, poles on the local Z axis.

    Kept unit-sized so the eyeball's object coordinates run -1..1, which is what
    the eye shader measures the polar angle in.
    """
    phi = np.linspace(0.0, np.pi, rings + 1)
    theta = np.linspace(0.0, 2.0 * np.pi, segments, endpoint=False)
    sin_phi, cos_phi = np.sin(phi), np.cos(phi)

    verts = [np.array([0.0, 0.0, 1.0])]
    for row in range(1, rings):
        r = sin_phi[row]
        verts.extend(
            np.column_stack((r * np.cos(theta), r * np.sin(theta), np.full(segments, cos_phi[row])))
        )
    verts.append(np.array([0.0, 0.0, -1.0]))

    def index(row: int, column: int) -> int:
        return 1 + (row - 1) * segments + column % segments

    tris = []
    for column in range(segments):
        tris.append((0, index(1, column), index(1, column + 1)))
    for row in range(1, rings - 1):
        for column in range(segments):
            a, b = index(row, column), index(row, column + 1)
            c, d = index(row + 1, column), index(row + 1, column + 1)
            tris.append((a, c, d))
            tris.append((a, d, b))
    last = len(verts) - 1
    for column in range(segments):
        tris.append((last, index(rings - 1, column + 1), index(rings - 1, column)))

    return Mesh(np.asarray(verts, dtype=np.float32), np.asarray(tris, dtype=np.int32))


def nail_mesh(
    width: float,
    length: float,
    thickness: float,
    curvature: float,
    across: int = 11,
    along: int = 15,
) -> Mesh:
    """A domed nail plate, closed so it can be lit like a real solid.

    The plate is curved across its width, narrows and rounds off at the free
    edge, and is only a fraction of a millimetre thick -- which matters, because
    the light that makes a nail look like keratin rather than paint is the light
    that gets through it.
    """
    u = np.linspace(-1.0, 1.0, across)
    w = np.linspace(-1.0, 1.0, along)
    grid_u, grid_w = np.meshgrid(u, w, indexing="ij")

    # Round the free edge: the plate keeps full width until 70 % of its length.
    taper = np.clip((grid_w - 0.70) / 0.30, 0.0, 1.0)
    half_width = width * 0.5 * np.sqrt(np.maximum(1.0 - taper * taper, 0.0))

    x = grid_u * half_width
    z = grid_w * length * 0.5
    dome = curvature * width * (1.0 - grid_u * grid_u)
    # A slight lengthwise curl as well, following the finger it sits on.
    dome = dome - 0.05 * width * np.maximum(grid_w, 0.0) ** 2

    top = np.stack((x, dome, z), axis=-1).reshape(-1, 3)
    bottom = np.stack((x, dome - thickness, z), axis=-1).reshape(-1, 3)
    verts = np.concatenate((top, bottom)).astype(np.float32)
    count = top.shape[0]

    def quad(a: int, b: int, c: int, d: int) -> list[tuple[int, int, int]]:
        return [(a, b, c), (a, c, d)]

    def node(i: int, j: int) -> int:
        return i * along + j

    tris: list[tuple[int, int, int]] = []
    for i in range(across - 1):
        for j in range(along - 1):
            a, b = node(i, j), node(i + 1, j)
            c, d = node(i + 1, j + 1), node(i, j + 1)
            tris += quad(a, b, c, d)
            tris += quad(count + a, count + d, count + c, count + b)

    # Stitch the rim: walk the boundary of the grid and bridge top to bottom.
    rim = (
        [node(i, 0) for i in range(across)]
        + [node(across - 1, j) for j in range(1, along)]
        + [node(i, along - 1) for i in range(across - 2, -1, -1)]
        + [node(0, j) for j in range(along - 2, 0, -1)]
    )
    for current, following in zip(rim, rim[1:] + rim[:1]):
        tris += quad(current, following, count + following, count + current)

    return Mesh(verts, np.asarray(tris, dtype=np.int32))
