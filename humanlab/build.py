"""Turn a preset into Blender objects: skin mesh, eyes, hair."""

from __future__ import annotations

import time

import numpy as np

import bpy

from . import bl, figure, materials, proportions, sdf


def _log(msg, t0=None):
    if t0 is None:
        print(f"[build] {msg}", flush=True)
    else:
        print(f"[build] {msg} ({time.time() - t0:.1f}s)", flush=True)


def build_mesh(P, voxel=0.0022, smooth_iters=2, smooth_factor=0.5, name="body", blend=0.24):
    t0 = time.time()
    field, lm = figure.build_figure(P, blend=blend)
    _log(f"{P.name}: {len(field.ops)} csg ops", t0)
    t0 = time.time()
    verts, quads = sdf.polygonise(field, voxel=voxel)
    _log(f"polygonised {len(verts)} verts / {len(quads)} quads at {voxel*1000:.1f}mm", t0)
    if smooth_iters:
        verts = sdf.laplacian_smooth(verts, quads, smooth_iters, smooth_factor)
    ob = bl.mesh_from_arrays(name, verts, quads)
    ob = bl.keep_largest_part(ob)
    bl.shade_smooth(ob)
    verts = np.empty(len(ob.data.vertices) * 3, np.float32)
    ob.data.vertices.foreach_get("co", verts)
    verts = verts.reshape(-1, 3)
    return ob, verts, quads, lm


def vertex_normals(ob):
    me = ob.data
    n = np.empty(len(me.vertices) * 3, np.float32)
    me.vertex_normals.foreach_get("vector", n)
    return n.reshape(-1, 3)


def add_eyes(P, lm, iris="brown", gaze=(0.0, -6.0, 0.0)):
    ex, ey, ez = lm["eye_centre"]
    r = lm["eye_radius"]
    mat = materials.eye_material(iris)
    out = []
    for sign in (1.0, -1.0):
        ob = bl.uv_sphere(f"eye_{'l' if sign > 0 else 'r'}", (sign * ex, ey, ez), r,
                          segments=64, rings=32)
        ob.rotation_euler = (
            np.deg2rad(gaze[0]),
            0.0,
            np.deg2rad(sign * gaze[1] + gaze[2]),
        )
        ob.data.materials.append(mat)
        out.append(ob)
    return out


def build_character(preset="adult_male", voxel=0.0022, clay=False, with_hair=True,
                    with_eyes=True, smooth_iters=2, iris="brown", hair_detail=1.0,
                    blend=0.24):
    P = preset if isinstance(preset, proportions.Proportions) else proportions.get(preset)
    ob, verts, quads, lm = build_mesh(P, voxel=voxel, smooth_iters=smooth_iters,
                                     blend=blend)
    mat = materials.clay_material() if clay else materials.skin_material(P, lm)
    ob.data.materials.append(mat)
    result = {"P": P, "body": ob, "landmarks": lm, "verts": verts, "quads": quads}
    if with_eyes:
        result["eyes"] = add_eyes(P, lm, iris=iris)
        if clay:
            for e in result["eyes"]:
                e.data.materials.clear()
                e.data.materials.append(materials.clay_material("clay_eye", 0.30))
    if with_hair:
        from . import hair as hair_mod

        t0 = time.time()
        normals = vertex_normals(ob)
        result["hair"] = hair_mod.build_hair(P, lm, verts, normals, density=hair_detail,
                                            clay=clay)
        _log(f"hair: {len(result['hair'])} systems", t0)
    return result


def bounds_of(objs):
    lo = np.full(3, 1e9)
    hi = np.full(3, -1e9)
    for ob in objs:
        if ob.type != "MESH":
            continue
        co = np.empty(len(ob.data.vertices) * 3, np.float32)
        ob.data.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        lo = np.minimum(lo, co.min(0))
        hi = np.maximum(hi, co.max(0))
    return lo, hi
