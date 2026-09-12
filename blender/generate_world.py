#!/usr/bin/env python3
"""Procedural Bytehaven world: island, districts, kit meshes, GLB + world.json."""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--preview", action="store_true")
    return p.parse_args(argv)


def reset_scene():
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    except TypeError:
        bpy.ops.wm.read_homefile(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.42, 0.68, 0.86, 1)
    bg.inputs[1].default_value = 1.0


def fract(x: float) -> float:
    return x - math.floor(x)


def hash2(x: float, y: float) -> float:
    return fract(math.sin(x * 127.1 + y * 311.7) * 43758.5453123)


def noise2(x: float, y: float) -> float:
    xi, yi = math.floor(x), math.floor(y)
    xf, yf = x - xi, y - yi
    u = xf * xf * (3 - 2 * xf)
    v = yf * yf * (3 - 2 * yf)

    def h(ix, iy):
        return hash2(ix, iy)

    n00, n10 = h(xi, yi), h(xi + 1, yi)
    n01, n11 = h(xi, yi + 1), h(xi + 1, yi + 1)
    return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v


def fbm(x: float, y: float, octaves: int = 5) -> float:
    total = 0.0
    amp = 0.5
    freq = 1.0
    for _ in range(octaves):
        total += amp * noise2(x * freq, y * freq)
        amp *= 0.5
        freq *= 2.05
    return total


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def to_three(x, y, z):
    return [round(x, 3), round(z, 3), round(-y, 3)]


def aabb_to_three(mn, mx):
    return {
        "min": [round(mn[0], 3), round(mn[2], 3), round(-mx[1], 3)],
        "max": [round(mx[0], 3), round(mx[2], 3), round(-mn[1], 3)],
    }


DISTRICTS = [
    {"id": "plaza", "name": "编译广场", "bl": (0.0, 0.0), "radius": 20.0, "color": (0.91, 0.76, 0.42)},
    {"id": "frontend", "name": "前端霓虹区", "bl": (50.0, 8.0), "radius": 22.0, "color": (0.35, 0.85, 0.95)},
    {"id": "backend", "name": "后端机房", "bl": (8.0, -50.0), "radius": 22.0, "color": (0.28, 0.78, 0.45)},
    {"id": "shader", "name": "着色花园", "bl": (6.0, 52.0), "radius": 22.0, "color": (0.72, 0.45, 0.95)},
    {"id": "foundry", "name": "引擎铸造厂", "bl": (-52.0, 6.0), "radius": 22.0, "color": (0.92, 0.45, 0.22)},
    {"id": "terminal", "name": "终端洞窟", "bl": (-42.0, -42.0), "radius": 20.0, "color": (0.95, 0.72, 0.22)},
    {"id": "forest", "name": "依赖森林", "bl": (42.0, 48.0), "radius": 20.0, "color": (0.38, 0.72, 0.32)},
]


def road_distance(x, y):
    plus = min(abs(x), abs(y)) if max(abs(x), abs(y)) < 62 else 99
    ring = abs(math.hypot(x, y) - 46.0)
    # connectors to satellite
    diag = abs(x - y) if 20 < x < 78 and 20 < y < 78 else 99
    return min(plus, ring, diag)


def island_mask(x, y):
    r = math.hypot(x, y)
    main = smoothstep(96, 78, r)
    # satellite island
    sx, sy = 88.0, -28.0
    sat = smoothstep(18, 11, math.hypot(x - sx, y - sy))
    # north lookout
    nx, ny = -82.0, 70.0
    look = smoothstep(14, 8, math.hypot(x - nx, y - ny))
    return max(main, sat * 0.92, look * 0.9)


def island_height(x, y):
    m = island_mask(x, y)
    if m <= 0.001:
        return -3.6
    n = fbm(x * 0.035, y * 0.035, 5)
    n2 = fbm(x * 0.09 + 20, y * 0.09 - 7, 3)
    h = 0.55 + 2.4 * (n - 0.42) + 0.55 * (n2 - 0.5)
    # flatten plaza
    r = math.hypot(x, y)
    plaza = smoothstep(24, 10, r)
    h = h * (1 - plaza) + 1.15 * plaza
    # district pads
    for d in DISTRICTS:
        if d["id"] == "plaza":
            continue
        dx, dy = d["bl"]
        pd = math.hypot(x - dx, y - dy)
        pad = smoothstep(d["radius"] + 4, d["radius"] * 0.45, pd)
        target = 1.35 + 0.35 * (hash2(dx, dy) - 0.5)
        h = h * (1 - pad) + target * pad
    # roads
    rd = road_distance(x, y)
    if rd < 3.4:
        k = 1 - smoothstep(1.5, 3.4, rd)
        h = h * (1 - 0.85 * k) + 1.18 * 0.85 * k
    # beach
    if m < 0.55:
        h = h * m + 0.05 * (1 - m)
    return h * m + (-3.2) * (1 - m)


def terrain_color(x, y, h):
    m = island_mask(x, y)
    rd = road_distance(x, y)
    if h < 0.12:
        return (0.16, 0.42, 0.48)
    if m < 0.42:
        return (0.86, 0.78, 0.55)
    if rd < 2.2:
        return (0.18, 0.18, 0.2)
    if rd < 3.2:
        return (0.32, 0.3, 0.28)
    # district tint
    best = None
    best_d = 1e9
    for d in DISTRICTS:
        dd = math.hypot(x - d["bl"][0], y - d["bl"][1])
        if dd < best_d:
            best_d = dd
            best = d
    grass = (0.30, 0.52, 0.28)
    if best and best_d < best["radius"] + 8:
        t = 1 - smoothstep(best["radius"] * 0.4, best["radius"] + 8, best_d)
        c = best["color"]
        grass = (
            grass[0] * (1 - 0.45 * t) + c[0] * 0.45 * t,
            grass[1] * (1 - 0.45 * t) + c[1] * 0.45 * t,
            grass[2] * (1 - 0.45 * t) + c[2] * 0.45 * t,
        )
    if h > 2.4:
        rock = (0.45, 0.44, 0.42)
        k = smoothstep(2.4, 3.4, h)
        grass = tuple(grass[i] * (1 - k) + rock[i] * k for i in range(3))
    return grass


def set_emission(bsdf, rgb, strength):
    key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
    bsdf.inputs[key].default_value = (rgb[0], rgb[1], rgb[2], 1)
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = strength


def make_mat(name, color, roughness=0.55, metallic=0.0, emission=None, emit_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1)
    bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    if emission and emit_strength > 0:
        set_emission(bsdf, emission, emit_strength)
    if alpha < 0.999:
        mat.blend_method = "BLEND"
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = alpha
    return mat


class Catalog:
    def __init__(self):
        self.mats = {}
        palettes = {
            "grass": ((0.32, 0.52, 0.28), 0.85, 0.0),
            "sand": ((0.84, 0.74, 0.52), 0.9, 0.0),
            "asphalt": ((0.12, 0.12, 0.14), 0.7, 0.05),
            "stone": ((0.62, 0.6, 0.56), 0.7, 0.0),
            "plaza": ((0.78, 0.72, 0.6), 0.55, 0.0),
            "gold": ((0.85, 0.65, 0.22), 0.35, 0.35),
            "wood": ((0.42, 0.26, 0.14), 0.8, 0.0),
            "bark": ((0.28, 0.18, 0.1), 0.9, 0.0),
            "leaf": ((0.22, 0.5, 0.22), 0.7, 0.0),
            "leaf2": ((0.18, 0.38, 0.2), 0.75, 0.0),
            "water": ((0.12, 0.35, 0.48), 0.12, 0.15),
            "white": ((0.92, 0.93, 0.95), 0.45, 0.0),
            "glass": ((0.45, 0.7, 0.85), 0.08, 0.1),
            "dark": ((0.08, 0.09, 0.1), 0.45, 0.2),
            "rust": ((0.45, 0.22, 0.12), 0.7, 0.15),
            "steel": ((0.38, 0.42, 0.45), 0.35, 0.7),
            "neon_c": ((0.2, 0.9, 1.0), 0.25, 0.05),
            "neon_m": ((0.95, 0.25, 0.75), 0.25, 0.05),
            "amber": ((0.95, 0.7, 0.2), 0.4, 0.05),
            "soil": ((0.28, 0.22, 0.14), 0.9, 0.0),
            "crystal": ((0.55, 0.85, 1.0), 0.12, 0.05),
            "skin": ((0.78, 0.58, 0.46), 0.55, 0.0),
            "cloth": ((0.2, 0.28, 0.4), 0.7, 0.0),
        }
        for k, (c, r, m) in palettes.items():
            self.mats[k] = make_mat(k, c, r, m)
        self.mats["water"].blend_method = "BLEND"
        if "Alpha" in self.mats["water"].node_tree.nodes["Principled BSDF"].inputs:
            self.mats["water"].node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = 0.72
        self.mats["window_warm"] = make_mat("window_warm", (0.9, 0.72, 0.35), 0.2, 0.0, (1.0, 0.75, 0.35), 6.0)
        self.mats["window_cool"] = make_mat("window_cool", (0.35, 0.9, 1.0), 0.15, 0.0, (0.3, 0.9, 1.0), 8.0)
        self.mats["window_green"] = make_mat("window_green", (0.3, 1.0, 0.45), 0.2, 0.0, (0.3, 1.0, 0.4), 5.0)
        self.mats["glow_gold"] = make_mat("glow_gold", (1.0, 0.82, 0.3), 0.2, 0.2, (1.0, 0.8, 0.25), 12.0)
        self.mats["glow_cyan"] = make_mat("glow_cyan", (0.3, 1.0, 1.0), 0.15, 0.1, (0.2, 1.0, 1.0), 14.0)
        self.mats["glow_pink"] = make_mat("glow_pink", (1.0, 0.3, 0.8), 0.15, 0.1, (1.0, 0.25, 0.8), 12.0)
        self.mats["glow_green"] = make_mat("glow_green", (0.3, 1.0, 0.45), 0.2, 0.0, (0.2, 1.0, 0.4), 10.0)
        self.mats["glow_purple"] = make_mat("glow_purple", (0.75, 0.4, 1.0), 0.2, 0.0, (0.7, 0.35, 1.0), 11.0)
        self.mats["glow_orange"] = make_mat("glow_orange", (1.0, 0.45, 0.15), 0.25, 0.1, (1.0, 0.4, 0.1), 10.0)
        self.mats["glow_amber"] = make_mat("glow_amber", (1.0, 0.75, 0.2), 0.25, 0.0, (1.0, 0.7, 0.15), 9.0)
        # district walls
        self.mats["wall_plaza"] = make_mat("wall_plaza", (0.86, 0.8, 0.68), 0.55, 0.0)
        self.mats["wall_front"] = make_mat("wall_front", (0.18, 0.22, 0.32), 0.35, 0.15)
        self.mats["wall_back"] = make_mat("wall_back", (0.16, 0.2, 0.18), 0.4, 0.45)
        self.mats["wall_shade"] = make_mat("wall_shade", (0.38, 0.28, 0.5), 0.5, 0.05)
        self.mats["wall_forge"] = make_mat("wall_forge", (0.42, 0.24, 0.16), 0.65, 0.2)
        self.mats["wall_term"] = make_mat("wall_term", (0.12, 0.12, 0.12), 0.45, 0.25)
        self.mats["wall_forest"] = make_mat("wall_forest", (0.45, 0.38, 0.24), 0.75, 0.0)
        self.mats["roof_red"] = make_mat("roof_red", (0.55, 0.18, 0.14), 0.55, 0.05)
        self.mats["roof_metal"] = make_mat("roof_metal", (0.3, 0.34, 0.38), 0.3, 0.75)
        self.mats["roof_green"] = make_mat("roof_green", (0.18, 0.4, 0.28), 0.6, 0.0)
        self.mats["roof_tile"] = make_mat("roof_tile", (0.28, 0.22, 0.32), 0.5, 0.0)

    def __getitem__(self, k):
        return self.mats[k]


def link(obj):
    if obj.name not in bpy.context.collection.objects:
        bpy.context.collection.objects.link(obj)
    return obj


def new_box(name, loc, size, mat):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    if mat:
        mesh.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def new_cyl(name, loc, radius, depth, mat, verts=12):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=radius, radius2=radius, depth=depth)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    if mat:
        mesh.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def new_ico(name, loc, radius, mat, subdivisions=1):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    if mat:
        mesh.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def new_cone(name, loc, r1, r2, depth, mat, verts=8):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r1, radius2=r2, depth=depth)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    if mat:
        mesh.materials.append(mat)
    bpy.context.collection.objects.link(obj)
    return obj


def origin_to_ground(obj):
    min_z = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
    dz = obj.location.z - min_z
    for v in obj.data.vertices:
        v.co.z += dz
        v.co.x -= 0  # keep
    obj.data.update()
    # After shifting verts up, world min becomes location.z. We want min at 0 relative,
    # and object location.z to be the ground. Simpler approach: leave as-is for kit
    # objects created at origin.
    return obj


def snap_origin_bottom(obj):
    if obj is None or obj.type != "MESH":
        return obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    min_z = min(v.co.z for v in obj.data.vertices)
    for v in obj.data.vertices:
        v.co.z -= min_z
    obj.data.update()
    obj.location = Vector((0, 0, 0))
    return obj


def join_objects(name, parts, ground=False):
    parts = [p for p in parts if p is not None]
    if not parts:
        return None
    if len(parts) == 1:
        parts[0].name = name
        return snap_origin_bottom(parts[0]) if ground else parts[0]
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    return snap_origin_bottom(obj) if ground else obj


def shade_smooth(obj, angle=0.6):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    mesh = obj.data
    if hasattr(mesh, "use_auto_smooth"):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = angle


def apply_scale_loc(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


class World:
    def __init__(self, rng: random.Random, cat: Catalog):
        self.rng = rng
        self.cat = cat
        self.colliders = []
        self.instances = []
        self.interactables = []
        self.npcs = []
        self.kit = {}

    def add_collider(self, mn, mx):
        self.colliders.append(aabb_to_three(mn, mx))

    def record_box_collider(self, x, y, z0, sx, sy, sz):
        self.add_collider(
            (x - sx / 2, y - sy / 2, z0),
            (x + sx / 2, y + sy / 2, z0 + sz),
        )

    def build_terrain(self, res=128, span=200.0):
        mesh = bpy.data.meshes.new("terrain")
        bm = bmesh.new()
        half = span / 2
        step = span / (res - 1)
        verts = []
        for iz in range(res):
            row = []
            y = -half + iz * step
            for ix in range(res):
                x = -half + ix * step
                z = island_height(x, y)
                row.append(bm.verts.new((x, y, z)))
            verts.append(row)
        bm.verts.ensure_lookup_table()
        for iz in range(res - 1):
            for ix in range(res - 1):
                v00 = verts[iz][ix]
                v10 = verts[iz][ix + 1]
                v01 = verts[iz + 1][ix]
                v11 = verts[iz + 1][ix + 1]
                bm.faces.new((v00, v10, v11, v01))
        color_layer = bm.loops.layers.color.new("Col")
        for face in bm.faces:
            for loop in face.loops:
                co = loop.vert.co
                rgb = terrain_color(co.x, co.y, co.z)
                loop[color_layer] = (rgb[0], rgb[1], rgb[2], 1.0)
        bm.normal_update()
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        obj = bpy.data.objects.new("terrain", mesh)
        mesh.materials.append(self.cat["grass"])
        bpy.context.collection.objects.link(obj)
        shade_smooth(obj, 0.85)
        # water
        water = new_box("water", (0, 0, 0.02), (260, 260, 0.08), self.cat["water"])
        # heightmap in three XZ
        hres = 160
        cell = 200.0 / (hres - 1)
        heights = []
        for iz in range(hres):
            tz = -100 + iz * cell
            for ix in range(hres):
                tx = -100 + ix * cell
                bx, by = tx, -tz
                h = island_height(bx, by)
                heights.append(int(max(-400, min(1200, round(h * 100)))))
        self.heightmap = {
            "res": hres,
            "originX": -100,
            "originZ": -100,
            "cell": cell,
            "unit": 0.01,
            "heights": heights,
        }
        return obj

    def make_kit(self):
        cat = self.cat
        # tree A
        trunk = new_cyl("treeA_trunk", (0, 0, 1.1), 0.18, 2.2, cat["bark"], 8)
        leaf1 = new_ico("treeA_l1", (0, 0, 2.5), 1.15, cat["leaf"], 1)
        leaf2 = new_ico("treeA_l2", (0.25, 0.1, 3.2), 0.85, cat["leaf2"], 1)
        leaf3 = new_ico("treeA_l3", (-0.2, -0.15, 3.7), 0.6, cat["leaf"], 1)
        self.kit["tree_a"] = join_objects("kit_tree_a", [trunk, leaf1, leaf2, leaf3], ground=True)
        # tree B pine
        pt = new_cyl("treeB_t", (0, 0, 1.0), 0.14, 2.0, cat["bark"], 7)
        c1 = new_cone("treeB_c1", (0, 0, 2.15), 1.2, 0.15, 1.6, cat["leaf2"], 8)
        c2 = new_cone("treeB_c2", (0, 0, 3.1), 0.85, 0.08, 1.3, cat["leaf"], 8)
        c3 = new_cone("treeB_c3", (0, 0, 3.9), 0.5, 0.02, 1.0, cat["leaf2"], 8)
        self.kit["tree_b"] = join_objects("kit_tree_b", [pt, c1, c2, c3], ground=True)
        # lamp
        pole = new_cyl("lamp_p", (0, 0, 1.6), 0.07, 3.2, cat["steel"], 8)
        head = new_box("lamp_h", (0, 0, 3.25), (0.45, 0.45, 0.18), cat["glow_gold"])
        base = new_cyl("lamp_b", (0, 0, 0.08), 0.22, 0.16, cat["stone"], 8)
        self.kit["lamp"] = join_objects("kit_lamp", [pole, head, base], ground=True)
        # bench
        seat = new_box("bench_s", (0, 0, 0.42), (1.6, 0.45, 0.1), cat["wood"])
        leg1 = new_box("bench_l1", (-0.65, 0, 0.2), (0.1, 0.4, 0.4), cat["steel"])
        leg2 = new_box("bench_l2", (0.65, 0, 0.2), (0.1, 0.4, 0.4), cat["steel"])
        back = new_box("bench_bk", (0, -0.18, 0.75), (1.6, 0.08, 0.55), cat["wood"])
        self.kit["bench"] = join_objects("kit_bench", [seat, leg1, leg2, back], ground=True)
        # crate
        crate = new_box("crate", (0, 0, 0.35), (0.7, 0.7, 0.7), cat["wood"])
        self.kit["crate"] = snap_origin_bottom(crate)
        # rock
        rock = new_ico("rock", (0, 0, 0.35), 0.55, cat["stone"], 1)
        rock.scale = (1.3, 0.9, 0.7)
        apply_scale_loc(rock)
        self.kit["rock"] = snap_origin_bottom(rock)
        # terminal kiosk
        body = new_box("term_b", (0, 0, 0.85), (0.9, 0.55, 1.7), cat["dark"])
        screen = new_box("term_s", (0, 0.28, 1.15), (0.72, 0.06, 0.7), cat["window_green"])
        self.kit["terminal"] = join_objects("kit_terminal", [body, screen], ground=True)
        # server rack
        rack = new_box("rack", (0, 0, 1.2), (0.7, 0.5, 2.4), cat["steel"])
        leds = []
        for i in range(6):
            leds.append(new_box(f"rack_led{i}", (0, 0.26, 0.35 + i * 0.35), (0.5, 0.04, 0.08), cat["window_green"]))
        self.kit["rack"] = join_objects("kit_rack", [rack] + leds, ground=True)
        # crystal fragment visual
        cr = new_ico("crystal", (0, 0, 0.55), 0.45, cat["glow_cyan"], 2)
        self.kit["crystal"] = snap_origin_bottom(cr)
        # coffee
        cup = new_cyl("coffee", (0, 0, 0.12), 0.1, 0.22, cat["white"], 10)
        self.kit["coffee"] = snap_origin_bottom(cup)
        # commit orb
        orb = new_ico("commit", (0, 0, 0.25), 0.18, cat["glow_gold"], 1)
        self.kit["commit"] = snap_origin_bottom(orb)
        # flower
        stem = new_cyl("fl_s", (0, 0, 0.25), 0.03, 0.5, cat["leaf"], 5)
        headf = new_ico("fl_h", (0, 0, 0.55), 0.12, cat["glow_pink"], 1)
        self.kit["flower"] = join_objects("kit_flower", [stem, headf], ground=True)
        # sign
        post = new_cyl("sign_p", (0, 0, 1.0), 0.06, 2.0, cat["wood"], 6)
        board = new_box("sign_b", (0, 0, 1.7), (1.1, 0.08, 0.55), cat["wall_front"])
        self.kit["sign"] = join_objects("kit_sign", [post, board], ground=True)
        # Move kit off-world so it is not in the playable island render
        xoff = 240
        for i, (k, obj) in enumerate(self.kit.items()):
            if obj is None:
                continue
            obj.location = Vector((xoff, i * 4.0, 0.0))
            obj.hide_set(True)
            obj["kit"] = k

    def export_kit(self, path):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in self.kit.values():
            if obj is None:
                continue
            try:
                obj.hide_set(False)
            except Exception:
                pass
            obj.select_set(True)
        export_glb(path, selected=True)
        for obj in self.kit.values():
            if obj is None:
                continue
            try:
                obj.hide_set(True)
            except Exception:
                pass

    def place_instance(self, kit, x, y, rot=0.0, scale=1.0, collide=None):
        z = island_height(x, y)
        self.instances.append(
            {
                "kit": kit,
                "pos": to_three(x, y, z),
                "rotY": round(rot, 3),
                "scale": round(scale, 3),
            }
        )
        if collide:
            sx, sy, sz = collide
            self.record_box_collider(x, y, z, sx * scale, sy * scale, sz * scale)

    def add_windows(self, name, x, y, z0, w, d, h, floors, mat, inset=0.04):
        parts = []
        ww, wh = 0.55, 0.7
        for fl in range(floors):
            wz = z0 + 1.15 + fl * (h / max(1, floors))
            count_w = max(1, int(w / 1.6))
            count_d = max(1, int(d / 1.6))
            for i in range(count_w):
                px = x - w / 2 + (i + 0.5) * (w / count_w)
                parts.append(new_box(f"{name}_wf{fl}_{i}", (px, y + d / 2 + inset, wz), (ww, 0.08, wh), mat))
                parts.append(new_box(f"{name}_wb{fl}_{i}", (px, y - d / 2 - inset, wz), (ww, 0.08, wh), mat))
            for i in range(count_d):
                py = y - d / 2 + (i + 0.5) * (d / count_d)
                parts.append(new_box(f"{name}_wl{fl}_{i}", (x - w / 2 - inset, py, wz), (0.08, ww, wh), mat))
                parts.append(new_box(f"{name}_wr{fl}_{i}", (x + w / 2 + inset, py, wz), (0.08, ww, wh), mat))
        return parts

    def building(self, name, x, y, w, d, floors, wall, roof_mat, roof="hip", win=None, door=True):
        z0 = island_height(x, y)
        h = 2.7 * floors + 0.4
        body = new_box(f"{name}_body", (x, y, z0 + h / 2), (w, d, h), wall)
        parts = [body]
        if door:
            parts.append(new_box(f"{name}_door", (x, y + d / 2 + 0.03, z0 + 1.05), (0.9, 0.08, 2.1), self.cat["dark"]))
        if win:
            parts.extend(self.add_windows(name, x, y, z0, w, d, h, floors, win))
        rh = 1.1 + 0.15 * floors
        if roof == "hip":
            parts.append(new_cone(f"{name}_roof", (x, y, z0 + h + rh / 2), max(w, d) * 0.62, 0.05, rh, roof_mat, 4))
        elif roof == "flat":
            parts.append(new_box(f"{name}_roof", (x, y, z0 + h + 0.15), (w + 0.3, d + 0.3, 0.3), roof_mat))
            parts.append(new_box(f"{name}_parapet", (x, y, z0 + h + 0.4), (w + 0.15, d + 0.15, 0.4), wall))
        elif roof == "saw":
            parts.append(new_box(f"{name}_roof", (x, y, z0 + h + 0.4), (w + 0.2, d + 0.2, 0.5), roof_mat))
            for i in range(3):
                px = x - w / 3 + i * (w / 3)
                parts.append(new_cone(f"{name}_saw{i}", (px, y, z0 + h + 1.0), 1.1, 0.05, 1.3, roof_mat, 4))
        obj = join_objects(name, parts)
        self.record_box_collider(x, y, z0, w, d, h + (0.6 if roof == "flat" else rh))
        return obj, z0, h

    def fountain(self):
        z0 = island_height(0, 0)
        base = new_cyl("fountain_base", (0, 0, z0 + 0.25), 3.2, 0.5, self.cat["stone"], 16)
        pool = new_cyl("fountain_pool", (0, 0, z0 + 0.45), 2.6, 0.35, self.cat["water"], 16)
        col = new_cyl("fountain_col", (0, 0, z0 + 1.3), 0.35, 1.8, self.cat["plaza"], 12)
        gem = new_ico("fountain_gem", (0, 0, z0 + 2.5), 0.55, self.cat["glow_gold"], 2)
        ring = new_cyl("fountain_ring", (0, 0, z0 + 0.7), 3.0, 0.18, self.cat["gold"], 16)
        join_objects("landmark_fountain", [base, pool, col, gem, ring])
        self.record_box_collider(0, 0, z0, 6.2, 6.2, 2.2)

    def clock_tower(self):
        x, y = -7.5, 10.5
        z0 = island_height(x, y)
        body = new_box("tower_b", (x, y, z0 + 6), (3.2, 3.2, 12), self.cat["wall_plaza"])
        roof = new_cone("tower_r", (x, y, z0 + 13.2), 2.4, 0.05, 3.2, self.cat["roof_red"], 4)
        clock = new_cyl("tower_c", (x, y + 1.7, z0 + 10.2), 0.9, 0.2, self.cat["glow_gold"], 16)
        clock.rotation_euler[0] = math.radians(90)
        spire = new_cyl("tower_s", (x, y, z0 + 15.2), 0.08, 1.6, self.cat["gold"], 6)
        join_objects("landmark_tower", [body, roof, clock, spire])
        self.record_box_collider(x, y, z0, 3.2, 3.2, 14)

    def pavilion(self):
        x, y = 8.5, -8.0
        z0 = island_height(x, y)
        floor = new_box("pav_floor", (x, y, z0 + 0.12), (7.5, 7.5, 0.24), self.cat["plaza"])
        roof = new_cone("pav_roof", (x, y, z0 + 4.4), 5.2, 0.2, 1.8, self.cat["roof_red"], 8)
        posts = []
        for dx, dy in ((-3, -3), (3, -3), (-3, 3), (3, 3)):
            posts.append(new_cyl(f"pav_p{dx}{dy}", (x + dx, y + dy, z0 + 2.1), 0.18, 4.0, self.cat["wood"], 8))
            self.record_box_collider(x + dx, y + dy, z0, 0.4, 0.4, 4.0)
        join_objects("landmark_pavilion", [floor, roof] + posts)

    def glass_gallery(self):
        x, y = 50.0, 8.0
        z0 = island_height(x, y)
        hall = new_box("gal_body", (x, y, z0 + 3.2), (14, 8, 6.4), self.cat["wall_front"])
        glass = new_box("gal_g", (x, y + 4.05, z0 + 3.0), (12, 0.12, 4.4), self.cat["window_cool"])
        roof = new_box("gal_r", (x, y, z0 + 6.7), (14.6, 8.6, 0.5), self.cat["roof_metal"])
        neon = new_box("gal_n", (x, y + 4.2, z0 + 5.6), (10, 0.12, 0.35), self.cat["glow_pink"])
        # open front: walls as three AABBs (back + two sides)
        join_objects("landmark_gallery", [hall, glass, roof, neon])
        self.record_box_collider(x, y, z0, 14, 8, 6.4)
        self.interactables.append(
            {
                "id": "frag_ui",
                "kind": "fragment",
                "district": "frontend",
                "label": "CSS 棱晶",
                "hint": "前端霓虹区玻璃展廊门口",
                "pos": to_three(x, y + 6.8, z0 + 1.1),
            }
        )

    def server_hall(self):
        x, y = 8.0, -50.0
        z0 = island_height(x, y)
        hall = new_box("srv_body", (x, y, z0 + 3.0), (16, 10, 6.0), self.cat["wall_back"])
        roof = new_box("srv_r", (x, y, z0 + 6.3), (16.8, 10.8, 0.6), self.cat["roof_metal"])
        strip = new_box("srv_s", (x, y + 5.1, z0 + 4.2), (12, 0.1, 0.25), self.cat["glow_green"])
        join_objects("landmark_server", [hall, roof, strip])
        self.record_box_collider(x, y, z0, 16, 10, 6.2)
        for i in range(4):
            self.place_instance("rack", x - 4 + i * 2.4, y + 6.2, 0, 1.0, (0.7, 0.5, 2.4))
        self.interactables.append(
            {
                "id": "frag_api",
                "kind": "fragment",
                "district": "backend",
                "label": "SQL 内核",
                "hint": "后端机房门口",
                "pos": to_three(x, y + 6.8, z0 + 1.1),
            }
        )

    def greenhouse(self):
        x, y = 6.0, 52.0
        z0 = island_height(x, y)
        hall = new_box("gh_body", (x, y, z0 + 2.6), (11, 11, 5.2), self.cat["wall_shade"])
        dome = new_ico("gh_dome", (x, y, z0 + 5.6), 5.4, self.cat["glass"], 2)
        ring = new_cyl("gh_ring", (x, y, z0 + 5.2), 5.0, 0.2, self.cat["glow_purple"], 16)
        join_objects("landmark_greenhouse", [hall, dome, ring])
        self.record_box_collider(x, y, z0, 11, 11, 6.0)
        self.interactables.append(
            {
                "id": "frag_gfx",
                "kind": "fragment",
                "district": "shader",
                "label": "GLSL 花蕾",
                "hint": "着色花园温室门口",
                "pos": to_three(x, y - 7.2, z0 + 1.15),
            }
        )

    def factory(self):
        x, y = -52.0, 6.0
        z0 = island_height(x, y)
        hall = new_box("fac_b", (x, y, z0 + 3.4), (18, 9, 6.8), self.cat["wall_forge"])
        roof = new_box("fac_r", (x, y, z0 + 7.0), (18.6, 9.6, 0.7), self.cat["roof_metal"])
        chim1 = new_cyl("fac_c1", (x - 6, y - 1.5, z0 + 9.0), 0.9, 5.5, self.cat["rust"], 10)
        chim2 = new_cyl("fac_c2", (x - 3.5, y - 1.5, z0 + 8.2), 0.7, 4.2, self.cat["rust"], 10)
        ember = new_box("fac_e", (x, y + 4.6, z0 + 3.2), (10, 0.12, 1.2), self.cat["glow_orange"])
        join_objects("landmark_foundry", [hall, roof, chim1, chim2, ember])
        self.record_box_collider(x, y, z0, 18, 9, 7.2)
        self.interactables.append(
            {
                "id": "frag_eng",
                "kind": "fragment",
                "district": "foundry",
                "label": "引擎齿轮",
                "hint": "引擎铸造厂门口",
                "pos": to_three(x + 2, y + 6.2, z0 + 1.1),
            }
        )

    def bunker(self):
        x, y = -42.0, -42.0
        z0 = island_height(x, y)
        hall = new_box("bunk_b", (x, y, z0 + 2.2), (10, 8, 4.4), self.cat["wall_term"])
        roof = new_box("bunk_r", (x, y, z0 + 4.6), (11, 8.8, 0.6), self.cat["steel"])
        antenna = new_cyl("bunk_a", (x + 3.2, y - 2.2, z0 + 7.2), 0.08, 5.0, self.cat["steel"], 6)
        dish = new_ico("bunk_d", (x + 3.2, y - 2.2, z0 + 9.6), 0.7, self.cat["glow_amber"], 1)
        join_objects("landmark_bunker", [hall, roof, antenna, dish])
        self.record_box_collider(x, y, z0, 10, 8, 4.6)
        self.interactables.append(
            {
                "id": "frag_sh",
                "kind": "fragment",
                "district": "terminal",
                "label": "Root Shell",
                "hint": "终端洞窟掩体门口",
                "pos": to_three(x, y + 5.6, z0 + 1.1),
            }
        )

    def totem(self):
        x, y = 42.0, 48.0
        z0 = island_height(x, y)
        stack = []
        colors = [self.cat["wall_forest"], self.cat["wood"], self.cat["leaf"], self.cat["glow_green"]]
        for i in range(4):
            stack.append(new_box(f"totem_{i}", (x, y, z0 + 0.7 + i * 1.35), (2.4 - i * 0.25, 2.4 - i * 0.25, 1.3), colors[i % 4]))
        gem = new_ico("totem_gem", (x, y, z0 + 6.2), 0.7, self.cat["glow_green"], 2)
        join_objects("landmark_totem", stack + [gem])
        self.record_box_collider(x, y, z0, 2.6, 2.6, 6.5)
        self.interactables.append(
            {
                "id": "frag_pkg",
                "kind": "fragment",
                "district": "forest",
                "label": "package.json 图腾",
                "hint": "依赖森林图腾",
                "pos": to_three(x + 2.8, y, z0 + 1.0),
            }
        )

    def lookout(self):
        x, y = -82.0, 70.0
        z0 = island_height(x, y)
        body = new_cyl("look_b", (x, y, z0 + 3.2), 1.4, 6.4, self.cat["stone"], 10)
        deck = new_cyl("look_d", (x, y, z0 + 6.5), 2.4, 0.25, self.cat["wood"], 12)
        rail = new_cyl("look_r", (x, y, z0 + 7.0), 2.35, 0.12, self.cat["wood"], 12)
        join_objects("landmark_lookout", [body, deck, rail])
        self.record_box_collider(x, y, z0, 2.8, 2.8, 6.6)
        self.interactables.append(
            {
                "id": "coffee_lookout",
                "kind": "coffee",
                "label": "瞭望台黑咖啡",
                "pos": to_three(x + 1.8, y, z0 + 1.0),
            }
        )

    def shrine_island(self):
        x, y = 88.0, -28.0
        z0 = island_height(x, y)
        base = new_cyl("shrine_b", (x, y, z0 + 0.3), 2.6, 0.6, self.cat["stone"], 12)
        gate_l = new_box("shrine_gl", (x - 1.2, y, z0 + 2.2), (0.35, 0.35, 3.6), self.cat["wood"])
        gate_r = new_box("shrine_gr", (x + 1.2, y, z0 + 2.2), (0.35, 0.35, 3.6), self.cat["wood"])
        lintel = new_box("shrine_t", (x, y, z0 + 4.1), (3.2, 0.4, 0.4), self.cat["gold"])
        gem = new_ico("shrine_g", (x, y, z0 + 2.4), 0.5, self.cat["glow_cyan"], 2)
        join_objects("landmark_shrine", [base, gate_l, gate_r, lintel, gem])
        self.record_box_collider(x, y, z0, 2.6, 2.6, 2.0)
        for i in range(3):
            self.interactables.append(
                {
                    "id": f"commit_shrine_{i}",
                    "kind": "commit",
                    "label": "提交",
                    "pos": to_three(x + (i - 1) * 1.4, y + 2.4, z0 + 0.6),
                }
            )

    def scatter_houses(self):
        specs = [
            ("frontend", 50, 8, self.cat["wall_front"], self.cat["roof_metal"], "flat", self.cat["window_cool"], 8),
            ("backend", 8, -50, self.cat["wall_back"], self.cat["roof_metal"], "flat", self.cat["window_green"], 6),
            ("shader", 6, 52, self.cat["wall_shade"], self.cat["roof_tile"], "hip", self.cat["glow_purple"], 6),
            ("foundry", -52, 6, self.cat["wall_forge"], self.cat["roof_metal"], "saw", self.cat["window_warm"], 6),
            ("terminal", -42, -42, self.cat["wall_term"], self.cat["steel"], "flat", self.cat["glow_amber"], 5),
            ("forest", 42, 48, self.cat["wall_forest"], self.cat["roof_green"], "hip", self.cat["window_warm"], 6),
            ("plaza", 0, 0, self.cat["wall_plaza"], self.cat["roof_red"], "hip", self.cat["window_warm"], 5),
        ]
        n = 0
        for dist, cx, cy, wall, roof, rstyle, win, count in specs:
            for i in range(count):
                ang = self.rng.random() * math.tau
                rad = 11 + self.rng.random() * 12
                x = cx + math.cos(ang) * rad
                y = cy + math.sin(ang) * rad
                if island_mask(x, y) < 0.7:
                    continue
                if math.hypot(x - cx, y - cy) < 8:
                    continue
                w = 4.2 + self.rng.random() * 2.4
                d = 3.6 + self.rng.random() * 2.0
                floors = 1 + (self.rng.random() > 0.45) + (self.rng.random() > 0.75)
                self.building(f"house_{dist}_{n}", x, y, w, d, floors, wall, roof, rstyle, win)
                n += 1

    def scatter_nature(self):
        # trees
        for i in range(90):
            x = self.rng.uniform(-90, 95)
            y = self.rng.uniform(-90, 90)
            if island_mask(x, y) < 0.62:
                continue
            if road_distance(x, y) < 4.0:
                continue
            # keep plaza clearer
            if math.hypot(x, y) < 16:
                continue
            kit = "tree_b" if (x < -20 or y > 30) and self.rng.random() < 0.5 else "tree_a"
            sc = 0.75 + self.rng.random() * 0.7
            self.place_instance(kit, x, y, self.rng.random() * math.tau, sc, (0.8, 0.8, 2.8))
        for i in range(40):
            x = self.rng.uniform(-90, 95)
            y = self.rng.uniform(-90, 90)
            if island_mask(x, y) < 0.55 or road_distance(x, y) < 3:
                continue
            self.place_instance("rock", x, y, self.rng.random() * math.tau, 0.7 + self.rng.random() * 0.8, (1.0, 0.8, 0.5))
        for i in range(28):
            x = self.rng.uniform(-90, 90)
            y = self.rng.uniform(-90, 90)
            if island_mask(x, y) < 0.7:
                continue
            self.place_instance("flower", x, y, 0, 1.0 + self.rng.random() * 0.4)

    def scatter_street(self):
        # lamps along plus roads
        for t in range(-55, 56, 10):
            if abs(t) < 6:
                continue
            self.place_instance("lamp", t, 3.1, 0, 1.0, (0.3, 0.3, 3.2))
            self.place_instance("lamp", 3.1, t, 0, 1.0, (0.3, 0.3, 3.2))
        # benches plaza
        for i, (x, y, r) in enumerate(((-5, -6, 0.4), (6, 4, -0.6), (-8, 2, 1.2))):
            self.place_instance("bench", x, y, r, 1.0, (1.6, 0.5, 0.9))
        # crates near foundry
        for i in range(8):
            x = -52 + self.rng.uniform(-8, 10)
            y = 6 + self.rng.uniform(-8, 8)
            if math.hypot(x + 52, y - 6) < 6:
                continue
            self.place_instance("crate", x, y, self.rng.random() * 1.5, 1.0, (0.7, 0.7, 0.7))
        # terminals
        spots = [(12, 6), (48, 18), (18, -40), (-20, -18), (-40, 12)]
        for i, (x, y) in enumerate(spots):
            self.place_instance("terminal", x, y, 0, 1.0, (0.9, 0.55, 1.7))
            self.interactables.append(
                {
                    "id": f"term_{i}",
                    "kind": "terminal",
                    "label": "开发终端",
                    "pos": to_three(x, y, island_height(x, y) + 1.0),
                    "lines": [
                        "> bytehaven --status",
                        "kernel: fragmented",
                        "hint: 收集六枚源码碎片并带回广场喷泉",
                    ],
                }
            )

    def collectibles(self):
        # coffee around map
        coffees = [(14, -4), (44, 0), (-12, -48), (2, 40), (-48, 14), (30, 40), (-70, 62)]
        for i, (x, y) in enumerate(coffees):
            self.interactables.append(
                {
                    "id": f"coffee_{i}",
                    "kind": "coffee",
                    "label": "热咖啡",
                    "pos": to_three(x, y, island_height(x, y) + 0.4),
                }
            )
        # commits
        for i in range(18):
            ang = i / 18 * math.tau
            rad = 22 + (i % 5) * 8
            x = math.cos(ang) * rad
            y = math.sin(ang) * rad * 0.92
            if island_mask(x, y) < 0.65:
                continue
            self.interactables.append(
                {
                    "id": f"commit_{i}",
                    "kind": "commit",
                    "label": "一次提交",
                    "pos": to_three(x, y, island_height(x, y) + 0.55),
                }
            )

    def make_npcs(self):
        z = island_height(0, -6)
        self.npcs.append(
            {
                "id": "kernel",
                "name": "KERNEL",
                "title": "世界内核",
                "kit": "npc_kernel",
                "pos": to_three(0, -6.5, z),
                "rotY": 0,
                "color": "#ffd45a",
                "lines": [
                    "欢迎来到源码港。世界的主核碎成了六片。",
                    "去六个区把碎片找回来，放到喷泉里，我就能重新编译这座岛。",
                    "WASD 移动，鼠标看，E 交互。Shift 跑，空格跳。",
                ],
            }
        )
        roster = [
            ("pixel", "PIXEL", "前端精灵", (50, 14), "#66e0ff", ["展廊里那块棱晶还在发光。", "把 CSS 棱晶带回广场。"]),
            ("daemon", "DAEMON", "守护进程", (14, -50), "#5dff88", ["机房需要一次干净的查询。", "SQL 内核就在机架中间。"]),
            ("shade", "SHADE", "着色诗人", (10, 56), "#c080ff", ["温室会把光编译成花。", "GLSL 花蕾很娇气，轻拿。"]),
            ("forge", "FORGE", "引擎铁匠", (-52, 14), "#ff7a3a", ["齿轮还热着。铸造厂车间里有引擎碎片。"]),
            ("root", "ROOT", "系统管理员", (-38, -38), "#ffcc44", ["权限够了就能看到 Root Shell。", "洞窟掩体里有最后的钥匙。"]),
            ("npm", "NPM", "包管理员", (46, 42), "#88dd66", ["依赖森林很容易迷失。跟着图腾走。"]),
        ]
        for nid, name, title, (x, y), color, lines in roster:
            self.npcs.append(
                {
                    "id": nid,
                    "name": name,
                    "title": title,
                    "kit": "npc_generic",
                    "pos": to_three(x, y, island_height(x, y)),
                    "rotY": 0,
                    "color": color,
                    "lines": lines,
                }
            )

    def make_npc_meshes(self):
        def person(name, cloth, accent):
            legs = new_box(f"{name}_l", (0, 0, 0.45), (0.42, 0.28, 0.9), self.cat["dark"])
            body = new_box(f"{name}_b", (0, 0, 1.15), (0.7, 0.38, 0.9), cloth)
            head = new_ico(f"{name}_h", (0, 0, 1.85), 0.28, self.cat["skin"], 1)
            hair = new_ico(f"{name}_hr", (0, 0.02, 2.05), 0.3, accent, 1)
            arm_l = new_box(f"{name}_al", (-0.48, 0, 1.1), (0.16, 0.16, 0.7), cloth)
            arm_r = new_box(f"{name}_ar", (0.48, 0, 1.1), (0.16, 0.16, 0.7), cloth)
            return join_objects(name, [legs, body, head, hair, arm_l, arm_r], ground=True)

        k = person("npc_kernel", self.cat["gold"], self.cat["glow_gold"])
        g = person("npc_generic", self.cat["cloth"], self.cat["glow_cyan"])
        k.location = Vector((240, 48, 0))
        g.location = Vector((240, 52, 0))
        self.kit["npc_kernel"] = k
        self.kit["npc_generic"] = g

    def districts_json(self):
        out = []
        for d in DISTRICTS:
            cx, cy = d["bl"]
            cz = island_height(cx, cy)
            c = d["color"]
            hexcol = "#{:02x}{:02x}{:02x}".format(int(c[0] * 255), int(c[1] * 255), int(c[2] * 255))
            pos = to_three(cx, cy, cz)
            out.append(
                {
                    "id": d["id"],
                    "name": d["name"],
                    "center": [pos[0], pos[2]],
                    "radius": d["radius"],
                    "color": hexcol,
                }
            )
        return out


def make_camera():
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (42, -48, 38)
    cam.rotation_euler = (math.radians(58), 0, math.radians(38))
    cam.data.lens = 28
    bpy.context.scene.camera = cam
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 4.5
    sun_obj = bpy.data.objects.new("Sun", sun)
    sun_obj.rotation_euler = (math.radians(42), math.radians(12), math.radians(-30))
    bpy.context.collection.objects.link(sun_obj)


def render_preview(path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)


def export_glb(path, selected=True):
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=selected,
        export_apply=True,
        export_extras=True,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_yup=True)
    except TypeError:
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=selected)


def export_world(path, kit_objects=None):
    skip = set()
    if kit_objects:
        skip = {o.name for o in kit_objects if o is not None}
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if obj.name in skip:
            continue
        if obj.name.startswith("kit_") or obj.name.startswith("npc_"):
            continue
        if obj.hide_get():
            continue
        if obj.location.x > 200:
            continue
        obj.select_set(True)
    export_glb(path, selected=True)


def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)
    rng = random.Random(args.seed)
    reset_scene()
    cat = Catalog()
    world = World(rng, cat)
    print("terrain...")
    world.build_terrain()
    print("kit...")
    world.make_kit()
    world.make_npc_meshes()
    print("landmarks...")
    world.fountain()
    world.clock_tower()
    world.pavilion()
    world.glass_gallery()
    world.server_hall()
    world.greenhouse()
    world.factory()
    world.bunker()
    world.totem()
    world.lookout()
    world.shrine_island()
    print("houses...")
    world.scatter_houses()
    print("props...")
    world.scatter_nature()
    world.scatter_street()
    world.collectibles()
    world.make_npcs()
    print("export...")
    world.export_kit(os.path.join(args.out, "kit.glb"))
    export_world(os.path.join(args.out, "world.glb"), world.kit.values())
    data = {
        "title": "源码港 Bytehaven",
        "seed": args.seed,
        "waterLevel": 0.08,
        "spawn": to_three(0.0, 10.5, island_height(0.0, 10.5) + 1.7),
        "player": {"radius": 0.38, "height": 1.7, "eye": 1.55},
        "heightmap": world.heightmap,
        "districts": world.districts_json(),
        "colliders": world.colliders,
        "instances": world.instances,
        "interactables": world.interactables,
        "npcs": world.npcs,
        "quests": {
            "main": {
                "id": "restore",
                "title": "重新编译世界",
                "fragments": ["frag_ui", "frag_api", "frag_gfx", "frag_eng", "frag_sh", "frag_pkg"],
            }
        },
    }
    with open(os.path.join(args.out, "world.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    if args.preview:
        print("preview render...")
        make_camera()
        render_preview(os.path.join(args.out, "preview.png"))
    print("done", args.out)
    print("instances", len(world.instances), "colliders", len(world.colliders), "items", len(world.interactables))


if __name__ == "__main__":
    main()
