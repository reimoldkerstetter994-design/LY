"""Correctness checks for the SDF sampler and the surface extractor."""

from __future__ import annotations

import math

import numpy as np

from humanforge import sdf
from humanforge.polygonize import Mesh, polygonize, taubin_smooth


def _sphere_field(radius: float = 0.5) -> sdf.Field:
    field = sdf.Field("sphere")
    field.add(sdf.Sphere(sdf.v3(0.0, 0.0, 0.0), radius))
    return field


def test_sphere_surface_is_closed_and_accurate() -> None:
    radius = 0.5
    mesh = polygonize(_sphere_field(radius), voxel=0.02)

    assert mesh.n_tris > 1000
    assert mesh.is_closed()

    distances = np.linalg.norm(mesh.verts, axis=1)
    assert abs(distances.max() - radius) < 0.004
    assert abs(distances.min() - radius) < 0.004

    expected = 4.0 / 3.0 * math.pi * radius**3
    assert abs(mesh.volume() - expected) / expected < 0.01


def test_slab_boundaries_do_not_leave_cracks() -> None:
    # A slab height that does not divide the grid exercises the seam logic.
    mesh = polygonize(_sphere_field(0.4), voxel=0.02, slab_cells=7)
    assert mesh.is_closed()


def test_smooth_union_bridges_two_solids() -> None:
    # Two spheres that merely touch: without blending the waist radius is zero.
    field = sdf.Field("blend")
    field.add(sdf.Sphere(sdf.v3(-0.08, 0.0, 0.0), 0.08))
    field.add(sdf.Sphere(sdf.v3(0.08, 0.0, 0.0), 0.08), blend=0.05)

    mesh = polygonize(field, voxel=0.005)
    assert mesh.is_closed()

    # The blend fills the waist between the spheres, so the surface never
    # pinches back to the axis in the middle.
    waist = mesh.verts[np.abs(mesh.verts[:, 0]) < 0.004]
    assert waist.size > 0
    radial = np.linalg.norm(waist[:, 1:], axis=1)
    assert radial.max() > 0.02


def test_subtraction_opens_a_cavity() -> None:
    solid = sdf.Field("solid")
    solid.add(sdf.RoundBox(sdf.v3(0, 0, 0), sdf.v3(0.1, 0.1, 0.1), 0.01))
    reference = polygonize(solid, voxel=0.01).volume()

    carved = sdf.Field("carved")
    carved.add(sdf.RoundBox(sdf.v3(0, 0, 0), sdf.v3(0.1, 0.1, 0.1), 0.01))
    carved.subtract(sdf.Sphere(sdf.v3(0, 0, 0.1), 0.06))
    assert polygonize(carved, voxel=0.01).volume() < reference


def test_round_cone_tapers() -> None:
    field = sdf.Field("cone")
    field.add(sdf.RoundCone(sdf.v3(0, 0, 0), sdf.v3(0, 0, 0.3), 0.06, 0.02))
    mesh = polygonize(field, voxel=0.005)
    assert mesh.is_closed()

    near_bottom = mesh.verts[np.abs(mesh.verts[:, 2] - 0.02) < 0.004]
    near_top = mesh.verts[np.abs(mesh.verts[:, 2] - 0.28) < 0.004]
    bottom_radius = np.linalg.norm(near_bottom[:, :2], axis=1).max()
    top_radius = np.linalg.norm(near_top[:, :2], axis=1).max()
    assert bottom_radius > top_radius * 1.8


def test_elliptical_section_is_wider_than_deep() -> None:
    field = sdf.Field("limb")
    field.add(
        sdf.RoundCone(
            sdf.v3(0, 0, 0), sdf.v3(0, 0, 0.2), 0.05, 0.05, section=(1.0, 0.6)
        )
    )
    mesh = polygonize(field, voxel=0.004)
    mid = mesh.verts[np.abs(mesh.verts[:, 2] - 0.1) < 0.005]
    assert np.abs(mid[:, 0]).max() > 1.4 * np.abs(mid[:, 1]).max()


def test_taubin_smoothing_preserves_volume() -> None:
    mesh = polygonize(_sphere_field(0.5), voxel=0.02)
    before = mesh.volume()
    smoothed = taubin_smooth(mesh, iterations=10)

    assert smoothed.n_verts == mesh.n_verts
    assert abs(smoothed.volume() - before) / before < 0.02
    assert smoothed.is_closed()


def test_smin_matches_min_away_from_the_seam() -> None:
    a = np.array([0.0, 1.0, -1.0])
    b = np.array([5.0, 6.0, 4.0])
    assert np.allclose(sdf.smin(a, b, 0.0), np.minimum(a, b))
    assert np.allclose(sdf.smin(a, b, 0.05), np.minimum(a, b))


def test_rotation_of_an_ellipsoid_moves_its_bounds() -> None:
    upright = sdf.Ellipsoid(sdf.v3(0, 0, 0), sdf.v3(0.02, 0.02, 0.2))
    tipped = sdf.Ellipsoid(
        sdf.v3(0, 0, 0), sdf.v3(0.02, 0.02, 0.2), rot=sdf.rotation((1, 0, 0), 90.0)
    )
    assert upright.bounds()[1][2] > 0.19
    assert tipped.bounds()[1][1] > 0.19
    assert tipped.bounds()[1][2] < 0.05


def test_mesh_helpers() -> None:
    verts = np.array(
        [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], dtype=np.float32
    )
    tris = np.array([[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]], dtype=np.int32)
    tetra = Mesh(verts, tris)
    assert tetra.is_closed()
    assert abs(tetra.volume() - 1.0 / 6.0) < 1e-6
