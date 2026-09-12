#!/usr/bin/env python3
"""Procedural DevForge campus exporter for Blender 4.2+.

Builds a dusk-lit game-studio island (buildings, NPCs, props, lights), then
writes a glTF binary plus gameplay metadata in Three.js Y-up space.
"""

from __future__ import annotations

import json
import math
import os
import sys
from typing import Iterable

import bpy
import bmesh
from mathutils import Matrix, Vector


# ---------------------------------------------------------------------------
# CLI / scene bootstrap
# ---------------------------------------------------------------------------

def parse_out_dir() -> str:
    argv = sys.argv
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    out = os.path.join(os.getcwd(), "public", "assets", "models")
    for i, a in enumerate(args):
        if a == "--out" and i + 1 < len(args):
            out = args[i + 1]
    os.makedirs(out, exist_ok=True)
    return out


def reset_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    world = scene.world or bpy.data.worlds.new("DevForgeWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.035, 0.05, 0.09, 1)
        bg.inputs[1].default_value = 0.6


def collection(name: str) -> bpy.types.Collection:
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

def _set(bsdf, names: Iterable[str], value) -> None:
    for n in names:
        sock = bsdf.inputs.get(n)
        if sock is not None:
            sock.default_value = value
            return


def principled(name: str, **kwargs) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    color = kwargs.get("color", (0.18, 0.18, 0.2))
    _set(bsdf, ("Base Color",), (*color, 1.0))
    _set(bsdf, ("Roughness",), kwargs.get("roughness", 0.45))
    _set(bsdf, ("Metallic",), kwargs.get("metallic", 0.0))
    _set(bsdf, ("Specular IOR Level", "Specular"), kwargs.get("specular", 0.5))
    _set(bsdf, ("IOR",), kwargs.get("ior", 1.45))
    alpha = kwargs.get("alpha", 1.0)
    if alpha < 1.0:
        mat.blend_method = "BLEND"
        _set(bsdf, ("Alpha",), alpha)
    trans = kwargs.get("transmission", 0.0)
    if trans:
        _set(bsdf, ("Transmission Weight", "Transmission"), trans)
        _set(bsdf, ("Roughness",), kwargs.get("roughness", 0.06))
    emit = kwargs.get("emission")
    if emit is not None:
        _set(bsdf, ("Emission Color", "Emission"), (*emit, 1.0))
        _set(bsdf, ("Emission Strength",), kwargs.get("emission_strength", 4.0))
    return mat


def grid_image(name: str, size: int, base, line, step: int) -> bpy.types.Image:
    img = bpy.data.images.new(name, width=size, height=size)
    pixels = [0.0] * (size * size * 4)
    for y in range(size):
        for x in range(size):
            on = (x % step == 0) or (y % step == 0)
            c = line if on else base
            i = (y * size + x) * 4
            pixels[i] = c[0]
            pixels[i + 1] = c[1]
            pixels[i + 2] = c[2]
            pixels[i + 3] = 1.0
    img.pixels = pixels
    return img


def textured(mat: bpy.types.Material, img: bpy.types.Image) -> None:
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-400, 200)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapn = nt.nodes.new("ShaderNodeMapping")
    mapn.inputs["Scale"].default_value = (8.0, 8.0, 8.0)
    coord.location = (-750, 200)
    mapn.location = (-550, 200)
    nt.links.new(coord.outputs["Generated"], mapn.inputs["Vector"])
    nt.links.new(mapn.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])


def make_materials() -> dict[str, bpy.types.Material]:
    mats = {
        "ground": principled("Ground", color=(0.07, 0.1, 0.12), roughness=0.92),
        "path": principled("Path", color=(0.16, 0.17, 0.2), roughness=0.7),
        "plaza": principled("Plaza", color=(0.12, 0.14, 0.18), roughness=0.55, metallic=0.15),
        "grass": principled("Grass", color=(0.05, 0.12, 0.07), roughness=0.95),
        "water": principled(
            "Water",
            color=(0.05, 0.18, 0.22),
            roughness=0.08,
            transmission=0.7,
            alpha=0.72,
            emission=(0.05, 0.25, 0.3),
            emission_strength=0.4,
        ),
        "concrete": principled("Concrete", color=(0.22, 0.23, 0.25), roughness=0.85),
        "kernel": principled("KernelFacade", color=(0.08, 0.16, 0.2), roughness=0.35, metallic=0.45),
        "atelier": principled("AtelierFacade", color=(0.18, 0.1, 0.16), roughness=0.4, metallic=0.2),
        "qa": principled("QAFacade", color=(0.2, 0.08, 0.07), roughness=0.5),
        "ship": principled("ShipFacade", color=(0.07, 0.09, 0.14), roughness=0.3, metallic=0.65),
        "trim": principled("Trim", color=(0.75, 0.78, 0.82), roughness=0.25, metallic=0.8),
        "glass": principled(
            "Glass",
            color=(0.35, 0.7, 0.85),
            roughness=0.05,
            transmission=0.9,
            alpha=0.35,
            emission=(0.2, 0.55, 0.7),
            emission_strength=0.8,
        ),
        "warm_glass": principled(
            "WarmGlass",
            color=(1.0, 0.72, 0.35),
            roughness=0.12,
            alpha=0.55,
            emission=(1.0, 0.7, 0.3),
            emission_strength=3.5,
        ),
        "metal": principled("Metal", color=(0.12, 0.13, 0.15), roughness=0.28, metallic=0.9),
        "wood": principled("Wood", color=(0.28, 0.16, 0.08), roughness=0.7),
        "screen": principled(
            "Screen",
            color=(0.02, 0.04, 0.06),
            roughness=0.12,
            emission=(0.15, 0.85, 0.95),
            emission_strength=8.0,
        ),
        "neon_cyan": principled(
            "NeonCyan",
            color=(0.1, 0.8, 0.9),
            roughness=0.2,
            emission=(0.2, 0.95, 1.0),
            emission_strength=12.0,
        ),
        "neon_amber": principled(
            "NeonAmber",
            color=(1.0, 0.55, 0.12),
            roughness=0.25,
            emission=(1.0, 0.55, 0.1),
            emission_strength=10.0,
        ),
        "commit": principled(
            "CommitCrystal",
            color=(0.4, 1.0, 0.7),
            roughness=0.1,
            transmission=0.4,
            emission=(0.3, 1.0, 0.55),
            emission_strength=9.0,
        ),
        "bark": principled("Bark", color=(0.12, 0.07, 0.04), roughness=0.9),
        "leaf": principled("Leaf", color=(0.08, 0.22, 0.1), roughness=0.8),
        "skin": principled("Skin", color=(0.62, 0.44, 0.34), roughness=0.55),
        "hair_dark": principled("HairDark", color=(0.06, 0.05, 0.05), roughness=0.45),
        "hair_amber": principled("HairAmber", color=(0.45, 0.22, 0.08), roughness=0.4),
        "hair_ink": principled("HairInk", color=(0.12, 0.08, 0.2), roughness=0.4),
        "cloth_amber": principled("ClothAmber", color=(0.72, 0.38, 0.1), roughness=0.7),
        "cloth_teal": principled("ClothTeal", color=(0.08, 0.28, 0.32), roughness=0.65),
        "cloth_purple": principled("ClothPurple", color=(0.28, 0.12, 0.34), roughness=0.65),
        "cloth_red": principled("ClothRed", color=(0.42, 0.1, 0.1), roughness=0.65),
        "cloth_dark": principled("ClothDark", color=(0.08, 0.08, 0.1), roughness=0.75),
        "duck": principled(
            "Duck",
            color=(0.95, 0.78, 0.12),
            roughness=0.4,
            emission=(0.6, 0.45, 0.05),
            emission_strength=0.6,
        ),
        "white": principled("White", color=(0.92, 0.93, 0.95), roughness=0.5),
    }
    img = grid_image("GroundGrid", 512, (0.055, 0.08, 0.09), (0.1, 0.16, 0.18), 64)
    textured(mats["ground"], img)
    return mats


# ---------------------------------------------------------------------------
# Mesh builders
# ---------------------------------------------------------------------------

def link(obj: bpy.types.Object, col: bpy.types.Collection) -> bpy.types.Object:
    col.objects.link(obj)
    return obj


def assign(obj: bpy.types.Object, mat: bpy.types.Material | None) -> bpy.types.Object:
    if mat:
        obj.data.materials.append(mat)
    return obj


def from_bm(name: str, bm: bmesh.types.BMesh, col, loc, rot, mat) -> bpy.types.Object:
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name + "Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rot
    assign(obj, mat)
    return link(obj, col)


def box(name, size, loc, col, mat=None, rot=(0.0, 0.0, 0.0)):
    bm = bmesh.new()
    sx, sy, sz = size
    matrix = Matrix.Diagonal((sx, sy, sz, 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=matrix)
    return from_bm(name, bm, col, loc, rot, mat)


def cylinder(name, radius, depth, loc, col, mat=None, rot=(0, 0, 0), segs=14):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=radius,
        radius2=radius,
        depth=depth,
    )
    return from_bm(name, bm, col, loc, rot, mat)


def cone(name, r1, r2, depth, loc, col, mat=None, rot=(0, 0, 0), segs=12):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=r1,
        radius2=r2,
        depth=depth,
    )
    return from_bm(name, bm, col, loc, rot, mat)


def ico(name, radius, loc, col, mat=None, subdiv=1, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    return from_bm(name, bm, col, loc, rot, mat)


def torus(name, major, minor, loc, col, mat=None, rot=(0, 0, 0), u=24, v=10):
    bm = bmesh.new()
    verts = []
    for i in range(u):
        ang_u = i / u * math.tau
        cu, su = math.cos(ang_u), math.sin(ang_u)
        row = []
        for j in range(v):
            ang_v = j / v * math.tau
            cv, sv = math.cos(ang_v), math.sin(ang_v)
            x = (major + minor * cv) * cu
            y = (major + minor * cv) * su
            z = minor * sv
            row.append(bm.verts.new((x, y, z)))
        verts.append(row)
    for i in range(u):
        i2 = (i + 1) % u
        for j in range(v):
            j2 = (j + 1) % v
            bm.faces.new((verts[i][j], verts[i2][j], verts[i2][j2], verts[i][j2]))
    return from_bm(name, bm, col, loc, rot, mat)


def empty(name, loc, col, rot=(0, 0, 0)) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.4
    obj.location = loc
    obj.rotation_euler = rot
    return link(obj, col)


def parent(child: bpy.types.Object, parent_obj: bpy.types.Object) -> None:
    child.parent = parent_obj
    child.matrix_parent_inverse = parent_obj.matrix_world.inverted()


def to_three(loc) -> list[float]:
    x, y, z = loc
    return [round(float(x), 3), round(float(z), 3), round(float(-y), 3)]


def aabb_three(minb, maxb) -> dict:
    corners = []
    for x in (minb[0], maxb[0]):
        for y in (minb[1], maxb[1]):
            for z in (minb[2], maxb[2]):
                corners.append(to_three((x, y, z)))
    xs, ys, zs = zip(*corners)
    return {
        "min": [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3)],
        "max": [round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)],
    }


def add_collider(colliders: list, minb, maxb) -> None:
    colliders.append(aabb_three(minb, maxb))


def wall_box(name, cx, cy, cz, sx, sy, sz, col, mat, colliders):
    obj = box(name, (sx, sy, sz), (cx, cy, cz), col, mat)
    add_collider(
        colliders,
        (cx - sx / 2, cy - sy / 2, cz - sz / 2),
        (cx + sx / 2, cy + sy / 2, cz + sz / 2),
    )
    return obj


# ---------------------------------------------------------------------------
# Campus pieces
# ---------------------------------------------------------------------------

def ground_and_paths(cols, mats, colliders):
    box("Ground", (90, 90, 0.4), (0, 0, -0.2), cols["world"], mats["ground"])
    box("GrassN", (90, 28, 0.12), (0, 31, 0.05), cols["world"], mats["grass"])
    box("GrassS", (90, 28, 0.12), (0, -31, 0.05), cols["world"], mats["grass"])
    box("GrassE", (28, 34, 0.12), (31, 0, 0.05), cols["world"], mats["grass"])
    box("GrassW", (28, 34, 0.12), (-31, 0, 0.05), cols["world"], mats["grass"])
    box("PathX", (86, 7.2, 0.16), (0, 0, 0.08), cols["world"], mats["path"])
    box("PathY", (7.2, 86, 0.16), (0, 0, 0.08), cols["world"], mats["path"])
    cylinder("PlazaRing", 13.5, 0.18, (0, 0, 0.12), cols["world"], mats["plaza"], segs=32)
    cylinder("PlazaInner", 8.2, 0.2, (0, 0, 0.14), cols["world"], mats["plaza"], segs=28)
    cylinder("FountainBasin", 3.4, 0.45, (0, 0, 0.35), cols["world"], mats["trim"], segs=24)
    cylinder("FountainWater", 2.7, 0.2, (0, 0, 0.5), cols["world"], mats["water"], segs=24)
    cylinder("FountainJet", 0.18, 1.6, (0, 0, 1.2), cols["world"], mats["neon_cyan"], segs=10)
    add_collider(colliders, (-3.2, -3.2, 0.0), (3.2, 3.2, 1.4))

    # Git-tree monument
    cylinder("MonumentTrunk", 0.35, 4.2, (0, 0, 2.6), cols["props"], mats["metal"], segs=12)
    for i, (ang, h, r) in enumerate(((20, 4.6, 1.8), (140, 5.2, 2.1), (260, 4.9, 1.6))):
        rad = math.radians(ang)
        branch = cylinder(
            f"MonumentBranch{i}",
            0.12,
            r * 2,
            (math.cos(rad) * r * 0.5, math.sin(rad) * r * 0.5, h),
            cols["props"],
            mats["trim"],
            rot=(math.radians(70), 0, rad),
            segs=8,
        )
        ico(
            f"MonumentOrb{i}",
            0.32,
            (math.cos(rad) * r, math.sin(rad) * r, h + 0.4),
            cols["props"],
            mats["neon_amber"] if i else mats["neon_cyan"],
            subdiv=2,
        )
    torus("HoloRing", 2.4, 0.06, (0, 0, 3.8), cols["props"], mats["neon_cyan"], rot=(math.radians(90), 0, 0))
    box("LogoSlab", (2.6, 0.18, 0.9), (0, -4.6, 1.1), cols["props"], mats["metal"])
    box("LogoGlow", (2.2, 0.08, 0.55), (0, -4.72, 1.15), cols["props"], mats["neon_amber"])


def lamp(i, x, y, cols, mats):
    cylinder(f"LampPole{i}", 0.08, 3.4, (x, y, 1.75), cols["props"], mats["metal"], segs=8)
    cone(f"LampHead{i}", 0.32, 0.08, 0.28, (x, y, 3.55), cols["props"], mats["trim"], segs=8)
    ico(f"LampBulb{i}", 0.12, (x, y, 3.38), cols["props"], mats["neon_amber"], subdiv=1)
    data = bpy.data.lights.new(f"LampLight{i}", "POINT")
    data.color = (1.0, 0.72, 0.42)
    data.energy = 180
    data.shadow_soft_size = 0.6
    obj = bpy.data.objects.new(f"LampLight{i}", data)
    obj.location = (x, y, 3.3)
    cols["lights"].objects.link(obj)


def tree(i, x, y, cols, mats, colliders, h=3.4):
    cylinder(f"Trunk{i}", 0.18, h * 0.55, (x, y, h * 0.28), cols["props"], mats["bark"], segs=8)
    ico(f"Crown{i}a", 1.05, (x, y, h * 0.72), cols["props"], mats["leaf"], subdiv=1)
    ico(f"Crown{i}b", 0.75, (x + 0.45, y - 0.2, h * 0.9), cols["props"], mats["leaf"], subdiv=1)
    add_collider(colliders, (x - 0.35, y - 0.35, 0.0), (x + 0.35, y + 0.35, 1.4))


def bench(i, x, y, yaw, cols, mats, colliders):
    rot = (0, 0, yaw)
    box(f"BenchSeat{i}", (1.6, 0.42, 0.1), (x, y, 0.48), cols["props"], mats["wood"], rot)
    box(f"BenchBack{i}", (1.6, 0.08, 0.55), (x - math.sin(yaw) * 0.2, y + math.cos(yaw) * 0.2, 0.82), cols["props"], mats["wood"], rot)
    add_collider(colliders, (x - 0.9, y - 0.4, 0.0), (x + 0.9, y + 0.4, 0.9))


def hall(cfg, cols, mats, colliders, interacts, npcs_meta):
    """Closed building with a door gap on one cardinal face."""
    name = cfg["name"]
    cx, cy = cfg["center"]
    w, d, h = cfg["size"]
    facade = mats[cfg["mat"]]
    door = cfg["door"]  # N S E W in blender XY
    t = 0.38
    door_w, door_h = 2.5, 2.85
    # Floor / roof
    box(f"{name}Floor", (w - 0.2, d - 0.2, 0.16), (cx, cy, 0.12), cols["buildings"], mats["concrete"])
    box(f"{name}Roof", (w + 0.4, d + 0.4, 0.28), (cx, cy, h), cols["buildings"], mats["metal"])
    box(f"{name}RoofTrim", (w + 0.7, d + 0.7, 0.12), (cx, cy, h + 0.22), cols["buildings"], mats["neon_cyan"] if name == "Kernel" else mats["neon_amber"])
    # Walls with door cut
    walls = {
        "N": (cx, cy + d / 2 - t / 2, w, t),
        "S": (cx, cy - d / 2 + t / 2, w, t),
        "E": (cx + w / 2 - t / 2, cy, t, d),
        "W": (cx - w / 2 + t / 2, cy, t, d),
    }
    for side, (wx, wy, sx, sy) in walls.items():
        wz = h / 2
        if side != door:
            wall_box(f"{name}Wall{side}", wx, wy, wz, sx, sy, h, cols["buildings"], facade, colliders)
            continue
        # Split wall around the door
        if side in ("N", "S"):
            span = (w - door_w) / 2
            wall_box(f"{name}Wall{side}L", wx - (door_w / 2 + span / 2), wy, wz, span, sy, h, cols["buildings"], facade, colliders)
            wall_box(f"{name}Wall{side}R", wx + (door_w / 2 + span / 2), wy, wz, span, sy, h, cols["buildings"], facade, colliders)
            lintel_z = door_h + (h - door_h) / 2
            wall_box(f"{name}Wall{side}Top", wx, wy, lintel_z, door_w, sy, h - door_h, cols["buildings"], facade, colliders)
            door_x, door_y = wx, wy + (-0.2 if side == "N" else 0.2)
        else:
            span = (d - door_w) / 2
            wall_box(f"{name}Wall{side}L", wx, wy - (door_w / 2 + span / 2), wz, sx, span, h, cols["buildings"], facade, colliders)
            wall_box(f"{name}Wall{side}R", wx, wy + (door_w / 2 + span / 2), wz, sx, span, h, cols["buildings"], facade, colliders)
            lintel_z = door_h + (h - door_h) / 2
            wall_box(f"{name}Wall{side}Top", wx, wy, lintel_z, sx, door_w, h - door_h, cols["buildings"], facade, colliders)
            door_x, door_y = wx + (-0.2 if side == "E" else 0.2), wy
        box(f"{name}DoorPad", (2.8, 2.2, 0.08), (door_x, door_y, 0.16), cols["buildings"], mats["neon_cyan"])
        box(f"{name}Sign", (2.4, 0.12, 0.5), (door_x, door_y, 3.4), cols["buildings"], mats["metal"])
        glow = mats["neon_amber"] if name in ("Atelier", "Ship") else mats["neon_cyan"]
        box(f"{name}SignGlow", (2.1, 0.06, 0.32), (door_x, door_y - 0.02, 3.4), cols["buildings"], glow)

    # Windows
    for i, ox in enumerate((-w * 0.28, w * 0.28)):
        for j, oy in enumerate((-d * 0.22, d * 0.22)):
            if abs(ox) < 1 and abs(oy) < 1:
                continue
            box(f"{name}Win{i}{j}", (1.6, 0.08, 1.3), (cx + ox, cy + oy + d / 2 - 0.05, 3.2), cols["buildings"], mats["warm_glass"])

    # Interior furniture
    desks = cfg.get("desks", [])
    for idx, (dx, dy, kind, label, iid) in enumerate(desks):
        px, py = cx + dx, cy + dy
        box(f"{name}Desk{idx}", (1.6, 0.7, 0.08), (px, py, 0.76), cols["interiors"], mats["wood"])
        box(f"{name}DeskLeg{idx}a", (0.08, 0.08, 0.72), (px - 0.7, py - 0.25, 0.36), cols["interiors"], mats["metal"])
        box(f"{name}DeskLeg{idx}b", (0.08, 0.08, 0.72), (px + 0.7, py + 0.25, 0.36), cols["interiors"], mats["metal"])
        box(f"{name}Monitor{idx}", (0.9, 0.08, 0.55), (px, py + 0.18, 1.18), cols["interiors"], mats["metal"])
        box(f"{name}Screen{idx}", (0.82, 0.04, 0.46), (px, py + 0.22, 1.18), cols["interiors"], mats["screen"])
        add_collider(colliders, (px - 0.85, py - 0.4, 0.0), (px + 0.85, py + 0.4, 1.2))
        marker = empty(f"INTERACT_{iid}", (px, py - 0.9, 0.2), cols["gameplay"])
        interacts.append(
            {
                "id": iid,
                "kind": kind,
                "label": label,
                "position": to_three((px, py - 0.9, 0.2)),
                "building": name,
            }
        )
        data = bpy.data.lights.new(f"{name}DeskLight{idx}", "POINT")
        data.color = (0.45, 0.9, 1.0)
        data.energy = 40
        lamp_obj = bpy.data.objects.new(f"{name}DeskLight{idx}", data)
        lamp_obj.location = (px, py, 1.5)
        cols["lights"].objects.link(lamp_obj)

    # Interior fill light
    data = bpy.data.lights.new(f"{name}Fill", "AREA")
    data.color = (1.0, 0.85, 0.7)
    data.energy = 250
    data.size = 6
    fill = bpy.data.objects.new(f"{name}Fill", data)
    fill.location = (cx, cy, h - 0.8)
    fill.rotation_euler = (0, 0, 0)
    cols["lights"].objects.link(fill)
    return marker if desks else None


def qa_arena(cols, mats, colliders, bug_spawns):
    cx, cy = -22.0, -22.0
    # Low walls, open north door
    wall_box("QAWallE", cx + 10, cy, 1.1, 0.4, 18, 2.2, cols["buildings"], mats["qa"], colliders)
    wall_box("QAWallW", cx - 10, cy, 1.1, 0.4, 18, 2.2, cols["buildings"], mats["qa"], colliders)
    wall_box("QAWallS", cx, cy - 9, 1.1, 20.4, 0.4, 2.2, cols["buildings"], mats["qa"], colliders)
    wall_box("QAWallNL", cx - 6.2, cy + 9, 1.1, 8, 0.4, 2.2, cols["buildings"], mats["qa"], colliders)
    wall_box("QAWallNR", cx + 6.2, cy + 9, 1.1, 8, 0.4, 2.2, cols["buildings"], mats["qa"], colliders)
    box("QAFloor", (19.5, 17.5, 0.12), (cx, cy, 0.1), cols["buildings"], mats["concrete"])
    box("QAStripe", (12, 0.4, 0.04), (cx, cy, 0.18), cols["buildings"], mats["neon_amber"])
    torus("QARing", 4.5, 0.08, (cx, cy, 0.3), cols["buildings"], mats["neon_amber"])
    for i in range(10):
        ang = i / 10 * math.tau
        r = 5.5 if i % 2 == 0 else 3.2
        bx = cx + math.cos(ang) * r
        by = cy + math.sin(ang) * r
        empty(f"BUGSP_{i:02d}", (bx, by, 0.4), cols["gameplay"])
        bug_spawns.append(to_three((bx, by, 0.4)))
    box("QASign", (3.2, 0.14, 0.6), (cx, cy + 9.3, 2.6), cols["buildings"], mats["metal"])
    box("QASignGlow", (2.8, 0.08, 0.38), (cx, cy + 9.38, 2.6), cols["buildings"], mats["neon_amber"])


def ship_dock(cols, mats, colliders, interacts):
    cx, cy = 22.0, -22.0
    box("ShipDeck", (16, 16, 0.4), (cx, cy, 0.25), cols["buildings"], mats["ship"])
    add_collider(colliders, (cx - 1.1, cy - 1.1, 0.0), (cx + 1.1, cy + 1.1, 3.4))
    for i, (ox, oy, sx, sy) in enumerate(((-8, 0, 0.4, 16), (8, 0, 0.4, 16), (0, -8, 16, 0.4))):
        wall_box(f"ShipRim{i}", cx + ox, cy + oy, 0.7, sx, sy, 0.5, cols["buildings"], mats["trim"], colliders)
    cylinder("ShipTower", 0.6, 6.5, (cx + 5.5, cy - 5.2, 3.4), cols["buildings"], mats["metal"], segs=10)
    torus("ShipHalo", 2.8, 0.12, (cx, cy, 2.2), cols["buildings"], mats["neon_cyan"], rot=(math.radians(90), 0, 0))
    torus("ShipHalo2", 1.6, 0.08, (cx, cy, 3.4), cols["buildings"], mats["neon_amber"], rot=(math.radians(90), 0, 0))
    cone("ShipCore", 0.9, 0.05, 3.2, (cx, cy, 2.4), cols["buildings"], mats["neon_cyan"], segs=16)
    empty("INTERACT_SHIP_LAUNCH", (cx, cy + 4.5, 0.6), cols["gameplay"])
    interacts.append(
        {
            "id": "SHIP_LAUNCH",
            "kind": "launch",
            "label": "提交构建 · 点火发版",
            "position": to_three((cx, cy + 4.5, 0.6)),
            "building": "Ship",
        }
    )
    box("ShipConsole", (1.8, 0.8, 0.9), (cx, cy + 5.2, 0.7), cols["interiors"], mats["metal"])
    box("ShipScreen", (1.4, 0.06, 0.5), (cx, cy + 5.5, 1.25), cols["interiors"], mats["screen"])
    data = bpy.data.lights.new("ShipBeacon", "POINT")
    data.color = (0.3, 0.9, 1.0)
    data.energy = 400
    beacon = bpy.data.objects.new("ShipBeacon", data)
    beacon.location = (cx, cy, 5.5)
    cols["lights"].objects.link(beacon)


def humanoid(name, loc, col, mats, pal):
    root = empty(name, loc, col)
    torso = box(f"{name}_Torso", (0.42, 0.24, 0.58), (loc[0], loc[1], loc[2] + 1.18), col, pal["body"])
    head = ico(f"{name}_Head", 0.18, (loc[0], loc[1], loc[2] + 1.62), col, mats["skin"], subdiv=2)
    hair = ico(f"{name}_Hair", 0.19, (loc[0], loc[1] - 0.01, loc[2] + 1.7), col, pal["hair"], subdiv=1)
    hip = box(f"{name}_Hip", (0.4, 0.22, 0.16), (loc[0], loc[1], loc[2] + 0.84), col, pal["legs"])
    for side, sx in (("L", -0.12), ("R", 0.12)):
        box(f"{name}_Leg{side}", (0.12, 0.14, 0.7), (loc[0] + sx, loc[1], loc[2] + 0.42), col, pal["legs"])
        box(f"{name}_Arm{side}", (0.09, 0.1, 0.55), (loc[0] + sx * 2.2, loc[1], loc[2] + 1.15), col, pal["body"])
        ico(f"{name}_Hand{side}", 0.055, (loc[0] + sx * 2.2, loc[1], loc[2] + 0.84), col, mats["skin"], subdiv=1)
    ico(f"{name}_Badge", 0.05, (loc[0] + 0.16, loc[1] + 0.13, loc[2] + 1.28), col, pal["accent"], subdiv=1)
    return root


def make_npcs(cols, mats, npcs_meta):
    roster = [
        {
            "id": "producer",
            "obj": "NPC_PRODUCER",
            "name": "Mira Chen",
            "role": "制作人",
            "loc": (3.2, 8.4, 0.0),
            "pal": {
                "body": mats["cloth_amber"],
                "legs": mats["cloth_dark"],
                "hair": mats["hair_amber"],
                "accent": mats["neon_amber"],
            },
            "lines": [
                "欢迎来到源码港。今晚我们要把 v1.0 送上线。",
                "先把散落的 Commit 晶体捡齐，别让版本树断枝。",
                "引擎馆编译、美术馆烘焙、QA 压测，最后去码头点火。",
                "你是今晚的值班制作人。走吧，世界等一个可玩的构建。",
            ],
        },
        {
            "id": "engineer",
            "obj": "NPC_ENGINEER",
            "name": "Ken Okada",
            "role": "引擎工程师",
            "loc": (-22.0, 13.6, 0.0),
            "pal": {
                "body": mats["cloth_teal"],
                "legs": mats["cloth_dark"],
                "hair": mats["hair_dark"],
                "accent": mats["neon_cyan"],
            },
            "lines": [
                "内核还在热重载。三台终端都要跑绿才能过编译门。",
                "看见发光的屏幕就按 E。别一次点三台，管线会抢锁。",
                "编译通过后把产物交给 QA，Rex 今晚心情一般。",
            ],
        },
        {
            "id": "artist",
            "obj": "NPC_ARTIST",
            "name": "Lina Voss",
            "role": "美术总监",
            "loc": (22.0, 13.6, 0.0),
            "pal": {
                "body": mats["cloth_purple"],
                "legs": mats["cloth_dark"],
                "hair": mats["hair_ink"],
                "accent": mats["neon_cyan"],
            },
            "lines": [
                "灯光还没bake。两座雕塑都要烘焙，不然发版会粉扑扑。",
                "Blender 里的法线你已经看见了——现在让游戏里也看见。",
                "藏了一只橡胶鸭在灌木里。调试的时候它很灵。",
            ],
        },
        {
            "id": "qa",
            "obj": "NPC_QA",
            "name": "Rex Alvarez",
            "role": "QA 主理",
            "loc": (-22.0, -11.4, 0.0),
            "pal": {
                "body": mats["cloth_red"],
                "legs": mats["cloth_dark"],
                "hair": mats["hair_dark"],
                "accent": mats["neon_amber"],
            },
            "lines": [
                "竞技场里全是漏网 Bug。左键调试器，打中就 squash。",
                "被咬到会掉专注。专注归零就从入口重来，Bug 不会等你。",
                "十只清完，我放行发版。别把崩溃带上飞船。",
            ],
        },
    ]
    for n in roster:
        humanoid(n["obj"], n["loc"], cols["characters"], mats, n["pal"])
        npcs_meta.append(
            {
                "id": n["id"],
                "object": n["obj"],
                "name": n["name"],
                "role": n["role"],
                "position": to_three(n["loc"]),
                "lines": n["lines"],
            }
        )


def atelier_sculptures(cols, mats, colliders):
    cx, cy = 22.0, 22.0
    # Stylized "mesh" sculptures the player bakes
    ico("SculptHero", 0.85, (cx - 4.2, cy + 2.0, 1.2), cols["interiors"], mats["trim"], subdiv=2)
    cone("SculptHeroStand", 0.45, 0.45, 0.7, (cx - 4.2, cy + 2.0, 0.4), cols["interiors"], mats["metal"], segs=10)
    torus("SculptKnot", 0.7, 0.18, (cx + 4.0, cy + 2.2, 1.3), cols["interiors"], mats["neon_amber"], rot=(0.6, 0.2, 0.4))
    cylinder("SculptKnotStand", 0.4, 0.7, (cx + 4.0, cy + 2.2, 0.4), cols["interiors"], mats["metal"], segs=10)
    add_collider(colliders, (cx - 4.8, cy + 1.4, 0.0), (cx - 3.6, cy + 2.6, 2.0))
    add_collider(colliders, (cx + 3.4, cy + 1.6, 0.0), (cx + 4.6, cy + 2.8, 2.0))
    # Blender-ish monkey stand-in: stacked spheres
    ico("SuzanneHead", 0.55, (cx, cy - 3.4, 1.35), cols["interiors"], mats["cloth_purple"], subdiv=2)
    ico("SuzanneEarL", 0.22, (cx - 0.55, cy - 3.4, 1.55), cols["interiors"], mats["cloth_purple"], subdiv=1)
    ico("SuzanneEarR", 0.22, (cx + 0.55, cy - 3.4, 1.55), cols["interiors"], mats["cloth_purple"], subdiv=1)


def commits_and_secret(cols, mats, collects, secret):
    spots = [
        (8.5, 2.2, 0.7),
        (-9.2, -1.8, 0.7),
        (1.5, 16.5, 0.7),
        (-16.0, 6.4, 0.7),
        (16.5, 7.0, 0.7),
        (-6.0, -16.8, 0.7),
        (7.4, -15.2, 0.7),
        (0.0, 22.5, 0.7),
    ]
    for i, loc in enumerate(spots, 1):
        obj = ico(f"COLLECT_COMMIT_{i:02d}", 0.22, loc, cols["gameplay"], mats["commit"], subdiv=2)
        collects.append({"id": f"COMMIT_{i:02d}", "position": to_three(loc), "object": obj.name})
    duck_loc = (31.5, 8.6, 0.35)
    body = ico("SECRET_DUCK", 0.22, duck_loc, cols["props"], mats["duck"], subdiv=2)
    cone("SECRET_DUCK_BEAK", 0.08, 0.01, 0.18, (duck_loc[0] + 0.22, duck_loc[1], duck_loc[2] + 0.02), cols["props"], mats["neon_amber"], rot=(0, math.radians(90), 0), segs=8)
    ico("SECRET_DUCK_HEAD", 0.14, (duck_loc[0] + 0.12, duck_loc[1], duck_loc[2] + 0.16), cols["props"], mats["duck"], subdiv=1)
    secret.append({"id": "DUCK", "position": to_three(duck_loc), "object": body.name})


def sun_and_moon(cols):
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.color = (1.0, 0.55, 0.32)
    sun.energy = 4.5
    sun.angle = math.radians(6)
    sun_obj = bpy.data.objects.new("Sun", sun)
    sun_obj.location = (18, -22, 28)
    sun_obj.rotation_euler = (math.radians(48), math.radians(15), math.radians(-35))
    cols["lights"].objects.link(sun_obj)

    moon = bpy.data.lights.new("Moon", "SUN")
    moon.color = (0.45, 0.62, 1.0)
    moon.energy = 0.9
    moon.angle = math.radians(12)
    moon_obj = bpy.data.objects.new("Moon", moon)
    moon_obj.location = (-20, 18, 24)
    moon_obj.rotation_euler = (math.radians(55), math.radians(-20), math.radians(140))
    cols["lights"].objects.link(moon_obj)


def export_glb(path: str) -> None:
    try:
        bpy.ops.preferences.addon_enable(module="io_scene_gltf2")
    except Exception:
        pass
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_lights=True,
        export_cameras=False,
        export_extras=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )


def build() -> None:
    out = parse_out_dir()
    reset_scene()
    mats = make_materials()
    cols = {
        "world": collection("World"),
        "buildings": collection("Buildings"),
        "interiors": collection("Interiors"),
        "props": collection("Props"),
        "characters": collection("Characters"),
        "gameplay": collection("Gameplay"),
        "lights": collection("Lights"),
    }
    colliders: list[dict] = []
    interacts: list[dict] = []
    npcs_meta: list[dict] = []
    collects: list[dict] = []
    bug_spawns: list[list[float]] = []
    secret: list[dict] = []

    ground_and_paths(cols, mats, colliders)
    sun_and_moon(cols)

    lamp_id = 0
    for x in range(-36, 37, 18):
        if abs(x) < 10:
            continue
        lamp(lamp_id, x, 4.8, cols, mats)
        lamp_id += 1
        lamp(lamp_id, x, -4.8, cols, mats)
        lamp_id += 1
    for y in range(-36, 37, 18):
        if abs(y) < 10:
            continue
        lamp(lamp_id, 4.8, y, cols, mats)
        lamp_id += 1
        lamp(lamp_id, -4.8, y, cols, mats)
        lamp_id += 1

    tree_spots = [
        (-12, 12),
        (12, 12),
        (-12, -12),
        (12, -12),
        (-32, 6),
        (32, 6),
        (-32, -8),
        (34, -10),
        (8, 32),
        (-8, 32),
        (8, -32),
        (-8, -32),
        (31.5, 11.5),
    ]
    for i, (tx, ty) in enumerate(tree_spots):
        tree(i, tx, ty, cols, mats, colliders)

    bench(0, -6.5, 6.8, math.radians(20), cols, mats, colliders)
    bench(1, 6.8, 6.2, math.radians(-25), cols, mats, colliders)
    bench(2, -6.2, -7.1, math.radians(160), cols, mats, colliders)

    hall(
        {
            "name": "Kernel",
            "center": (-22.0, 22.0),
            "size": (18.0, 14.0, 6.4),
            "mat": "kernel",
            "door": "S",
            "desks": [
                (-4.5, -1.0, "compile", "编译 · 渲染线程", "ENGINE_1"),
                (0.0, -1.0, "compile", "编译 · 物理核心", "ENGINE_2"),
                (4.5, -1.0, "compile", "编译 · 网络层", "ENGINE_3"),
            ],
        },
        cols,
        mats,
        colliders,
        interacts,
        npcs_meta,
    )
    hall(
        {
            "name": "Atelier",
            "center": (22.0, 22.0),
            "size": (16.0, 14.0, 6.0),
            "mat": "atelier",
            "door": "S",
            "desks": [
                (-4.2, 0.6, "bake", "烘焙 · 英雄雕塑", "ART_1"),
                (4.0, 0.8, "bake", "烘焙 · 结拓扑", "ART_2"),
            ],
        },
        cols,
        mats,
        colliders,
        interacts,
        npcs_meta,
    )
    atelier_sculptures(cols, mats, colliders)
    qa_arena(cols, mats, colliders, bug_spawns)
    ship_dock(cols, mats, colliders, interacts)
    make_npcs(cols, mats, npcs_meta)
    commits_and_secret(cols, mats, collects, secret)

    empty("SPAWN_PLAYER", (0.0, -12.0, 0.0), cols["gameplay"])

    meta = {
        "title": "DevForge · 源码港",
        "coordinateSpace": "three-yup",
        "blender": "4.2",
        "playerSpawn": to_three((0.0, -12.0, 0.0)),
        "playerYaw": 0.0,
        "npcs": npcs_meta,
        "interacts": interacts,
        "collects": collects,
        "bugSpawns": bug_spawns,
        "secrets": secret,
        "colliders": colliders,
        "zones": {
            "plaza": {"center": [0, 0, 0], "radius": 14},
            "kernel": {"center": to_three((-22.0, 22.0, 0.0)), "radius": 12},
            "atelier": {"center": to_three((22.0, 22.0, 0.0)), "radius": 12},
            "qa": {"center": to_three((-22.0, -22.0, 0.0)), "radius": 12},
            "ship": {"center": to_three((22.0, -22.0, 0.0)), "radius": 12},
        },
        "missions": [
            {"id": "briefing", "title": "领取简报", "detail": "和制作人 Mira 对话"},
            {"id": "commits", "title": "收集 Commit", "detail": "捡齐 6 枚版本晶体", "count": 6},
            {"id": "compile", "title": "编译引擎", "detail": "引擎馆三台终端全部跑绿", "count": 3},
            {"id": "bake", "title": "烘焙美术", "detail": "为两座雕塑完成材质烘焙", "count": 2},
            {"id": "qa", "title": "压测 QA", "detail": "在竞技场 squash 10 只 Bug", "count": 10},
            {"id": "ship", "title": "发版上线", "detail": "到码头提交构建并点火"},
        ],
    }

    glb_path = os.path.join(out, "devworld.glb")
    meta_path = os.path.join(out, "devworld_meta.json")
    export_glb(glb_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    blend_path = os.path.join(out, "devworld.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    size = os.path.getsize(glb_path)
    print(f"[devforge] wrote {glb_path} ({size} bytes)")
    print(f"[devforge] wrote {meta_path}")
    print(f"[devforge] objects={len(bpy.data.objects)} colliders={len(colliders)}")


if __name__ == "__main__":
    build()
