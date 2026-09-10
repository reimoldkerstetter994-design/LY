"""Turn a signed distance field into a triangle mesh.

Marching *tetrahedra* is used rather than marching cubes.  Splitting every
voxel into six tetrahedra (Kuhn's decomposition around the main diagonal)
removes the ambiguous cube cases entirely, so the output is always a closed,
watertight surface -- exactly what a body destined for subdivision and
subsurface scattering needs.  Neighbouring voxels agree on their shared face
diagonals because the decomposition is translation invariant, so no cracks
appear between cells.

The field is sampled in slabs along Z and, within each slab, only over the
bounding window of the geometry that actually reaches into it.  A whole figure
at 3 mm resolution therefore fits comfortably in a few hundred megabytes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np

from .sdf import Field, Op, evaluate

# Cube corner c has offsets (c & 1, (c >> 1) & 1, (c >> 2) & 1).
CORNER_OFFSETS = np.array(
    [[c & 1, (c >> 1) & 1, (c >> 2) & 1] for c in range(8)], dtype=np.int64
)

# Kuhn decomposition: every tetrahedron walks from corner 0 to corner 7 along a
# permutation of the three axes, which guarantees a consistent face split.
TETRAHEDRA = (
    (0, 1, 3, 7),
    (0, 1, 5, 7),
    (0, 2, 3, 7),
    (0, 2, 6, 7),
    (0, 4, 5, 7),
    (0, 4, 6, 7),
)

# Edges of a tetrahedron, as pairs of local corner indices.
TETRA_EDGES = ((0, 1), (1, 2), (2, 0), (0, 3), (1, 3), (2, 3))

# For every inside/outside pattern of the four corners, the polygon that cuts
# the tetrahedron, expressed as a cycle of edge indices.  Complementary cases
# share a polygon (the winding differs, and normals are recomputed downstream).
CASES: tuple[tuple[tuple[int, ...], tuple[int, ...]], ...] = (
    ((1, 14), (0, 2, 3)),
    ((2, 13), (0, 4, 1)),
    ((4, 11), (1, 5, 2)),
    ((8, 7), (3, 4, 5)),
    ((3, 12), (2, 3, 4, 1)),
    ((5, 10), (0, 1, 5, 3)),
    ((6, 9), (0, 2, 5, 4)),
)


@dataclass
class Mesh:
    """A triangle mesh with vertices in metres."""

    verts: np.ndarray  # (V, 3) float32
    tris: np.ndarray  # (T, 3) int32

    @property
    def n_verts(self) -> int:
        return int(self.verts.shape[0])

    @property
    def n_tris(self) -> int:
        return int(self.tris.shape[0])

    def bounds(self) -> tuple[np.ndarray, np.ndarray]:
        return self.verts.min(axis=0), self.verts.max(axis=0)

    def volume(self) -> float:
        """Signed volume via the divergence theorem (sign depends on winding)."""
        a = self.verts[self.tris[:, 0]].astype(np.float64)
        b = self.verts[self.tris[:, 1]].astype(np.float64)
        c = self.verts[self.tris[:, 2]].astype(np.float64)
        return float(np.abs(np.einsum("ij,ij->i", a, np.cross(b, c)).sum()) / 6.0)

    def is_closed(self) -> bool:
        """True when every edge is shared by exactly two triangles."""
        edges = np.concatenate(
            [self.tris[:, [0, 1]], self.tris[:, [1, 2]], self.tris[:, [2, 0]]]
        )
        edges = np.sort(edges, axis=1)
        _, counts = np.unique(edges, axis=0, return_counts=True)
        return bool(np.all(counts == 2))


def _grid_axis(lo: float, hi: float, voxel: float) -> np.ndarray:
    n = int(np.ceil((hi - lo) / voxel)) + 1
    return lo + voxel * np.arange(n, dtype=np.float64)


def _active_window(
    ops: Sequence[Op],
    xs: np.ndarray,
    ys: np.ndarray,
    z_lo: float,
    z_hi: float,
    spacing: float,
) -> tuple[int, int, int, int]:
    """X/Y index window touched by additive geometry inside a Z range."""
    lo = np.array([np.inf, np.inf])
    hi = np.array([-np.inf, -np.inf])
    for op in ops:
        if op.mode != "add":
            continue
        plo, phi = op.primitive.bounds()
        pad = op.pad(spacing)
        if phi[2] + pad < z_lo or plo[2] - pad > z_hi:
            continue
        lo = np.minimum(lo, plo[:2] - pad)
        hi = np.maximum(hi, phi[:2] + pad)
    if not np.all(np.isfinite(lo)):
        return 0, 0, 0, 0
    i0, i1 = np.searchsorted(xs, [lo[0], hi[0]], side="left")
    j0, j1 = np.searchsorted(ys, [lo[1], hi[1]], side="left")
    return int(i0), int(min(i1 + 1, xs.size)), int(j0), int(min(j1 + 1, ys.size))


def _edge_vertices(
    cell: tuple[np.ndarray, np.ndarray, np.ndarray],
    offsets: tuple[int, int, int],
    grid_shape: tuple[int, int, int],
    origin: np.ndarray,
    voxel: float,
    tetra: tuple[int, int, int, int],
    values: np.ndarray,
    edge: int,
    sel: np.ndarray,
    iso: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Interpolated vertex on one tetrahedron edge, for a set of cells.

    Returns ``(keys, positions)`` where the key uniquely identifies the grid
    edge the vertex sits on.  Because both endpoint values come straight out of
    the sampled field, cells and slabs that share an edge produce bit-identical
    positions, which makes welding by key exact.
    """
    ii, jj, kk = cell
    local_a, local_b = TETRA_EDGES[edge]
    ca, cb = tetra[local_a], tetra[local_b]

    ny_total, nz_total = grid_shape[1], grid_shape[2]
    base = np.stack(
        (ii[sel] + offsets[0], jj[sel] + offsets[1], kk[sel] + offsets[2])
    ).astype(np.int64)
    idx_a = base + CORNER_OFFSETS[ca][:, None]
    idx_b = base + CORNER_OFFSETS[cb][:, None]

    flat_a = idx_a[0] * (ny_total * nz_total) + idx_a[1] * nz_total + idx_a[2]
    flat_b = idx_b[0] * (ny_total * nz_total) + idx_b[1] * nz_total + idx_b[2]
    total = grid_shape[0] * ny_total * nz_total
    keys = np.minimum(flat_a, flat_b) * total + np.maximum(flat_a, flat_b)

    va = values[local_a][sel].astype(np.float64)
    vb = values[local_b][sel].astype(np.float64)
    denom = vb - va
    t = np.where(np.abs(denom) < 1e-12, 0.5, (iso - va) / np.where(denom == 0, 1.0, denom))
    np.clip(t, 0.0, 1.0, out=t)

    pos_a = origin[:, None] + idx_a * voxel
    pos_b = origin[:, None] + idx_b * voxel
    pos = pos_a + t[None, :] * (pos_b - pos_a)
    return keys, pos.T.astype(np.float32)


def polygonize(
    field: Field,
    voxel: float,
    iso: float = 0.0,
    margin: float = 0.0,
    slab_cells: int = 24,
    region: tuple[np.ndarray, np.ndarray] | None = None,
) -> Mesh:
    """Extract the ``iso`` surface of ``field`` at the given sample spacing.

    ``region`` clips the sampled volume to a box.  Cost goes as the cube of the
    resolution, so a face needs a spacing the whole body cannot afford: eyelids and
    a lip seam are a millimetre or two of relief, and sampled at the 4 mm a full
    figure is comfortable at they come out as stair steps.  Meshing a head alone at
    1.3 mm costs less than the body does at 4 mm.  The surface is left open where
    the box cuts it, so keep the cut outside the frame.
    """
    ops = list(field.ops)
    if not ops:
        raise ValueError("cannot polygonize an empty field")

    lo, hi = field.bounds(margin=margin + 3.0 * voxel)
    if region is not None:
        lo = np.maximum(lo, np.asarray(region[0], dtype=np.float64))
        hi = np.minimum(hi, np.asarray(region[1], dtype=np.float64))
        if np.any(hi - lo <= 2.0 * voxel):
            raise ValueError("region does not overlap the field")
    xs = _grid_axis(lo[0], hi[0], voxel)
    ys = _grid_axis(lo[1], hi[1], voxel)
    zs = _grid_axis(lo[2], hi[2], voxel)
    grid_shape = (xs.size, ys.size, zs.size)
    origin = np.array([xs[0], ys[0], zs[0]], dtype=np.float64)

    key_chunks: list[np.ndarray] = []
    pos_chunks: list[np.ndarray] = []

    n_cells_z = zs.size - 1
    for z_start in range(0, n_cells_z, slab_cells):
        z_end = min(z_start + slab_cells, n_cells_z)
        zs_slab = zs[z_start : z_end + 1]
        i0, i1, j0, j1 = _active_window(
            ops, xs, ys, zs_slab[0], zs_slab[-1], voxel
        )
        if i1 - i0 < 2 or j1 - j0 < 2:
            continue

        f = evaluate(ops, xs[i0:i1], ys[j0:j1], zs_slab)
        chunk = _slab_polygons(
            f, iso, (i0, j0, z_start), grid_shape, origin, voxel
        )
        if chunk is not None:
            key_chunks.append(chunk[0])
            pos_chunks.append(chunk[1])

    if not key_chunks:
        return Mesh(np.zeros((0, 3), np.float32), np.zeros((0, 3), np.int32))

    keys = np.concatenate(key_chunks)
    positions = np.concatenate(pos_chunks)
    unique, first, inverse = np.unique(keys, return_index=True, return_inverse=True)
    verts = positions[first]
    tris = inverse.reshape(-1, 3).astype(np.int32)
    return Mesh(verts, tris)


def _slab_polygons(
    f: np.ndarray,
    iso: float,
    offsets: tuple[int, int, int],
    grid_shape: tuple[int, int, int],
    origin: np.ndarray,
    voxel: float,
) -> tuple[np.ndarray, np.ndarray] | None:
    nx, ny, nz = f.shape
    if nx < 2 or ny < 2 or nz < 2:
        return None

    corners = [
        f[dx : dx + nx - 1, dy : dy + ny - 1, dz : dz + nz - 1]
        for dx, dy, dz in CORNER_OFFSETS
    ]
    lowest = np.minimum.reduce(corners)
    highest = np.maximum.reduce(corners)
    active = (lowest < iso) & (highest >= iso)
    if not active.any():
        return None

    cell = tuple(a.astype(np.int64) for a in np.nonzero(active))
    corner_values = np.stack([c[active] for c in corners])

    keys_out: list[np.ndarray] = []
    pos_out: list[np.ndarray] = []

    for tetra in TETRAHEDRA:
        values = corner_values[list(tetra)]
        inside = values < iso
        mask = (
            inside[0].astype(np.uint8)
            | (inside[1].astype(np.uint8) << 1)
            | (inside[2].astype(np.uint8) << 2)
            | (inside[3].astype(np.uint8) << 3)
        )
        for case_ids, polygon in CASES:
            sel = np.nonzero((mask == case_ids[0]) | (mask == case_ids[1]))[0]
            if sel.size == 0:
                continue
            corner_data = [
                _edge_vertices(
                    cell,
                    offsets,
                    grid_shape,
                    origin,
                    voxel,
                    tetra,
                    values,
                    edge,
                    sel,
                    iso,
                )
                for edge in polygon
            ]
            # Cells matching the complementary case have inside and outside
            # swapped, so their polygons must be wound the other way round.
            outward = _outward_reference(tetra, case_ids[0], voxel)
            flip_sign = np.where(mask[sel] == case_ids[0], 1.0, -1.0)

            fans = ((0, 1, 2),) if len(polygon) == 3 else ((0, 1, 2), (0, 2, 3))
            for fan in fans:
                keys = np.stack([corner_data[c][0] for c in fan], axis=1)
                pos = np.stack([corner_data[c][1] for c in fan], axis=1)
                normal = np.cross(pos[:, 1] - pos[:, 0], pos[:, 2] - pos[:, 0])
                flip = normal @ outward * flip_sign < 0.0
                keys[flip] = keys[flip][:, [0, 2, 1]]
                pos[flip] = pos[flip][:, [0, 2, 1]]
                keys_out.append(keys.reshape(-1))
                pos_out.append(pos.reshape(-1, 3))

    if not keys_out:
        return None
    return np.concatenate(keys_out), np.concatenate(pos_out)


def _outward_reference(
    tetra: tuple[int, int, int, int], mask: int, voxel: float
) -> np.ndarray:
    """Direction from the inside corners to the outside corners of a tetra.

    The vector only depends on which corners are inside, never on the cell, so
    it is a constant per (tetrahedron, case) pair.  Orienting each triangle
    along it yields consistent outward normals for the whole surface, which the
    volume computation and Blender's shading both rely on.
    """
    inside = [
        CORNER_OFFSETS[tetra[i]] for i in range(4) if mask & (1 << i)
    ]
    outside = [
        CORNER_OFFSETS[tetra[i]] for i in range(4) if not mask & (1 << i)
    ]
    centre_in = np.mean(inside, axis=0)
    centre_out = np.mean(outside, axis=0)
    return (centre_out - centre_in) * voxel


def largest_component(mesh: Mesh) -> Mesh:
    """Keep only the biggest connected shell.

    Carving the eye sockets and the mouth leaves small closed pockets inside the
    head that never show, but they are not free: subsurface scattering traces
    real paths through the volume, so a stray shell floating behind an eye
    darkens it.  Connectivity is resolved by repeatedly relabelling each
    triangle with the smallest label among its three corners, which converges in
    a number of passes proportional to the graph diameter rather than to the
    vertex count.
    """
    if mesh.n_tris == 0:
        return mesh

    label = np.arange(mesh.n_verts, dtype=np.int64)
    while True:
        corner = label[mesh.tris]
        lowest = corner.min(axis=1)
        updated = label.copy()
        np.minimum.at(updated, mesh.tris.reshape(-1), np.repeat(lowest, 3))
        # Collapse chains so a long thin shell does not need one pass per edge.
        updated = updated[updated]
        if np.array_equal(updated, label):
            break
        label = updated

    keep = np.bincount(label[mesh.tris[:, 0]]).argmax()
    tris = mesh.tris[label[mesh.tris[:, 0]] == keep]
    used = np.unique(tris)
    remap = np.full(mesh.n_verts, -1, dtype=np.int32)
    remap[used] = np.arange(used.size, dtype=np.int32)
    return Mesh(mesh.verts[used], remap[tris].astype(np.int32))


def _vertex_neighbours(mesh: Mesh) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    edges = np.concatenate(
        [mesh.tris[:, [0, 1]], mesh.tris[:, [1, 2]], mesh.tris[:, [2, 0]]]
    )
    edges = np.unique(np.sort(edges, axis=1), axis=0)
    src = np.concatenate([edges[:, 0], edges[:, 1]])
    dst = np.concatenate([edges[:, 1], edges[:, 0]])
    degree = np.bincount(src, minlength=mesh.n_verts).astype(np.float32)
    np.maximum(degree, 1.0, out=degree)
    return src, dst, degree


def taubin_smooth(
    mesh: Mesh,
    iterations: int = 6,
    lam: float = 0.5,
    mu: float = -0.53,
) -> Mesh:
    """Volume-preserving mesh relaxation.

    Marching tetrahedra leaves a faint diagonal ripple on nearly flat regions.
    Plain Laplacian smoothing removes it but also deflates the figure; Taubin's
    alternating shrink/inflate pass keeps the silhouette while cleaning up the
    surface, which matters a lot once glancing studio light rakes across skin.
    """
    if mesh.n_verts == 0 or iterations <= 0:
        return mesh
    src, dst, degree = _vertex_neighbours(mesh)
    verts = mesh.verts.astype(np.float32, copy=True)

    for _ in range(iterations):
        for factor in (lam, mu):
            summed = np.zeros_like(verts)
            np.add.at(summed, src, verts[dst])
            laplacian = summed / degree[:, None] - verts
            verts += np.float32(factor) * laplacian

    return Mesh(verts, mesh.tris)
