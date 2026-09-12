"""
KERNEL RIDGE — Blender asset pipeline
Generates the open-world GLB models + world metadata.

Run:
  blender --background --python blender/generate_assets.py
"""
from __future__ import annotations

import json
import math
import os
import random
import sys

import bpy
from mathutils import Vector, noise


try:
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
except NameError:
    SCRIPT_DIR = os.path.join(os.getcwd(), "blender")

ROOT = os.path.dirname(SCRIPT_DIR)
OUT = os.path.join(ROOT, "public", "assets")
os.makedirs(OUT, exist_ok=True)

SEED = 11
rng = random.Random(SEED)

SITES = {
    "boot": {"p": (0.0, -54.0), "r": 16.0, "h": 1.05, "title": "引导营地 BOOT CAMP"},
    "spire": {"p": (0.0, 0.0), "r": 15.0, "h": 1.25, "title": "编译之塔 COMPILER SPIRE"},
    "market": {"p": (54.0, 10.0), "r": 16.0, "h": 1.05, "title": "包市场 PACKAGE BAZAAR"},
    "canyon": {"p": (-52.0, 6.0), "r": 18.0, "h": 0.85, "title": "版本峡谷 GIT CANYON"},
    "arena": {"p": (4.0, 58.0), "r": 16.0, "h": 1.1, "title": "运行时竞技场 RUNTIME ARENA"},
    "lake": {"p": (44.0, 42.0), "r": 15.0, "h": 0.15, "title": "内存湖 MEMORY LAKE"},
    "forest": {"p": (-42.0, 44.0), "r": 18.0, "h": 1.0, "title": "空值之林 NULL FOREST"},
}

PATHS = [
    ("boot", "spire"),
    ("spire", "market"),
    ("spire", "canyon"),
    ("spire", "arena"),
    ("spire", "lake"),
    ("spire", "forest"),
    ("market", "lake"),
    ("canyon", "forest"),
    ("arena", "lake"),
    ("arena", "forest"),
]


def log(msg: str) -> None:
    print(f"[kernel-ridge] {msg}", flush=True)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def mat(
    name: str,
    color,
    roughness: float = 0.55,
    metallic: float = 0.0,
    emission=None,
    emit_strength: float = 0.0,
    alpha: float = 1.0,
):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    col = (float(color[0]), float(color[1]), float(color[2]), 1.0)
    bsdf.inputs["Base Color"].default_value = col
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 1.0:
        m.blend_method = "BLEND"
        bsdf.inputs["Alpha"].default_value = alpha
    if emission is not None:
        ecol = (float(emission[0]), float(emission[1]), float(emission[2]), 1.0)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = ecol
            bsdf.inputs["Emission Strength"].default_value = emit_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = ecol
    return m


def active(ob) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def apply_scale(ob) -> None:
    active(ob)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def assign(ob, material) -> None:
    if ob.data.materials:
        ob.data.materials[0] = material
    else:
        ob.data.materials.append(material)


def cube(name, loc, size, material, solid=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    apply_scale(ob)
    assign(ob, material)
    if solid:
        ob.name = name if name.startswith("COL_") else name
    return ob


def cylinder(name, loc, radius, depth, material, verts=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot
    )
    ob = bpy.context.object
    ob.name = name
    assign(ob, material)
    return ob


def ico(name, loc, radius, material, subdivisions=1, scale=None):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions, radius=radius, location=loc
    )
    ob = bpy.context.object
    ob.name = name
    if scale:
        ob.scale = scale
        apply_scale(ob)
    assign(ob, material)
    return ob


def torus(name, loc, major, minor, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=loc, rotation=rot
    )
    ob = bpy.context.object
    ob.name = name
    assign(ob, material)
    return ob


def collider(name, loc, size):
    c = cube(name, loc, size, COL_MAT, solid=True)
    return c


def smoothstep(a: float, b: float, x: float) -> float:
    if a == b:
        return 0.0 if x < a else 1.0
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def fbm(x: float, y: float, octaves: int = 5, scale: float = 0.035) -> float:
    v = 0.0
    amp = 1.0
    freq = scale
    for _ in range(octaves):
        v += amp * noise.noise(Vector((x * freq, y * freq, 4.2)))
        amp *= 0.5
        freq *= 2.05
    return v


def dist_seg(px, py, ax, ay, bx, by) -> float:
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy
    if l2 < 1e-8:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / l2))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def height_at(x: float, y: float) -> tuple[float, str]:
    r = math.hypot(x, y)
    ncoast = fbm(x + 40, y - 18, 3, 0.02)
    radius = 86.0 + ncoast * 10.0
    mask = 1.0 - smoothstep(radius - 14.0, radius + 2.0, r)
    n = fbm(x, y, 6, 0.028)
    n2 = fbm(x + 90, y + 20, 3, 0.08)
    h = 0.35 + n * 5.6 + n2 * 1.4

    biome = "wild"
    for key, site in SITES.items():
        sx, sy = site["p"]
        d = math.hypot(x - sx, y - sy)
        rad = site["r"]
        if d < rad:
            t = 1.0 - (d / rad) ** 2
            h = h * (1.0 - t) + site["h"] * t
            biome = key
            if key == "lake" and d < 9.5:
                basin = (1.0 - d / 9.5) ** 1.4
                h = h - basin * 1.55

    cx, cy = SITES["canyon"]["p"]
    if -72.0 < x < -28.0 and abs(y - cy) < 7.5 + abs(x + 50) * 0.02:
        trench = 1.0 - abs(y - cy) / 8.0
        h -= max(0.0, trench) * 3.4
        biome = "canyon"

    for a, b in PATHS:
        ax, ay = SITES[a]["p"]
        bx, by = SITES[b]["p"]
        d = dist_seg(x, y, ax, ay, bx, by)
        if d < 3.4:
            t = 1.0 - d / 3.4
            path_h = (SITES[a]["h"] + SITES[b]["h"]) * 0.5 + 0.04
            h = h * (1.0 - t * 0.85) + path_h * (t * 0.85)
            if d < 1.7:
                biome = "path"

    h *= mask
    if mask < 0.15:
        h -= (0.15 - mask) * 4.0
        biome = "ocean"
    return h, biome


def build_terrain(materials: dict) -> None:
    log("sculpting island terrain")
    res = 108
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=res, y_subdivisions=res, size=188)
    ob = bpy.context.object
    ob.name = "TERRAIN"
    assign(ob, materials["ground"])

    mesh = ob.data
    for v in mesh.vertices:
        h, _ = height_at(v.co.x, v.co.y)
        v.co.z = h
    mesh.update()
    bpy.ops.object.shade_smooth()

    mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    attr = mesh.color_attributes["Color"]
    palettes = {
        "wild": (0.18, 0.28, 0.22, 1),
        "path": (0.42, 0.36, 0.28, 1),
        "boot": (0.32, 0.33, 0.34, 1),
        "spire": (0.22, 0.28, 0.34, 1),
        "market": (0.38, 0.28, 0.18, 1),
        "canyon": (0.36, 0.22, 0.14, 1),
        "arena": (0.30, 0.26, 0.22, 1),
        "lake": (0.14, 0.32, 0.30, 1),
        "forest": (0.10, 0.08, 0.14, 1),
        "ocean": (0.10, 0.22, 0.24, 1),
    }
    for poly in mesh.polygons:
        vs = [mesh.vertices[i] for i in poly.vertices]
        cx = sum(v.co.x for v in vs) / len(vs)
        cy = sum(v.co.y for v in vs) / len(vs)
        cz = sum(v.co.z for v in vs) / len(vs)
        _, biome = height_at(cx, cy)
        col = palettes.get(biome, palettes["wild"])
        if cz < 0.25:
            u = max(0.0, min(1.0, (0.25 - cz) / 0.8))
            sand = (0.45, 0.40, 0.28, 1)
            col = tuple(col[i] * (1 - u) + sand[i] * u for i in range(4))
        n = poly.normal
        slope = 1.0 - abs(n.z)
        if slope > 0.45:
            rock = (0.22, 0.20, 0.18, 1)
            k = min(1.0, (slope - 0.45) / 0.4)
            col = tuple(col[i] * (1 - k) + rock[i] * k for i in range(4))
        for li in poly.loop_indices:
            attr.data[li].color = col


def fiber_road(materials: dict) -> None:
    log("laying fiber-optic roads")
    n = 0
    for a, b in PATHS:
        ax, ay = SITES[a]["p"]
        bx, by = SITES[b]["p"]
        dist = math.hypot(bx - ax, by - ay)
        steps = max(6, int(dist / 7.0))
        for i in range(steps):
            t = (i + 0.5) / steps
            x = ax + (bx - ax) * t
            y = ay + (by - ay) * t
            h, _ = height_at(x, y)
            yaw = math.atan2(bx - ax, by - ay)
            lamp = cube(
                f"FIBER_{n}",
                (x, y, h + 0.07),
                (0.55, 1.8, 0.08),
                materials["fiber"],
            )
            lamp.rotation_euler[2] = yaw
            n += 1
            if i % 3 == 0:
                pole = cylinder(
                    f"LAMP_{n}",
                    (x + 1.2, y, h + 1.1),
                    0.08,
                    2.2,
                    materials["metal"],
                    verts=8,
                )
                glow = ico(
                    f"LAMPGLOW_{n}",
                    (x + 1.2, y, h + 2.15),
                    0.18,
                    materials["fiber"],
                )
                _ = pole, glow


def build_spire(materials: dict) -> None:
    log("raising compiler spire")
    x, y = SITES["spire"]["p"]
    h = SITES["spire"]["h"]
    cylinder("SPIRE_plinth", (x, y, h + 0.4), 8.5, 0.8, materials["stone"], verts=10)
    collider("COL_spire_plinth", (x, y, h + 0.4), (16, 16, 0.9))
    for i, (r, d, z) in enumerate(
        [(6.2, 4.0, 3.2), (4.6, 7.0, 8.4), (3.2, 8.0, 15.6), (2.0, 7.5, 22.8), (1.1, 6.0, 29.2)]
    ):
        cylinder(f"SPIRE_shaft_{i}", (x, y, h + z), r, d, materials["spire"], verts=8)
    collider("COL_spire", (x, y, h + 14), (8.5, 8.5, 28))
    torus("SPIRE_ring_0", (x, y, h + 7.5), 5.4, 0.18, materials["cyan"])
    torus("SPIRE_ring_1", (x, y, h + 14.5), 4.0, 0.16, materials["magenta"])
    torus("SPIRE_ring_2", (x, y, h + 22.0), 2.8, 0.14, materials["amber"])
    ico("SPIRE_core", (x, y, h + 33.2), 1.35, materials["cyan"], subdivisions=2)
    cylinder("SPIRE_antenna", (x, y, h + 36.4), 0.12, 4.4, materials["metal"], verts=6)
    cube("TERM_spire", (x + 4.6, y + 3.2, h + 1.55), (1.1, 0.7, 1.6), materials["terminal"])
    ico("SPIRE_beacon", (x, y, h + 39.0), 0.35, materials["cyan"])


def building_block(name, loc, size, wall, trim, solid=True):
    b = cube(name, loc, size, wall)
    roof = cube(
        name + "_roof",
        (loc[0], loc[1], loc[2] + size[2] / 2 + 0.18),
        (size[0] + 0.5, size[1] + 0.5, 0.28),
        trim,
    )
    if solid:
        collider(f"COL_{name}", loc, (size[0], size[1], size[2] + 0.3))
    return b, roof


def build_boot(materials: dict) -> None:
    log("building boot camp")
    x, y = SITES["boot"]["p"]
    h = SITES["boot"]["h"]
    cube("BOOT_plaza", (x, y, h + 0.08), (18, 18, 0.16), materials["stone"])
    building_block("BOOT_hq", (x - 6.2, y - 4.5, h + 2.0), (7.5, 5.5, 3.8), materials["boot"], materials["cyan"])
    building_block("BOOT_shed", (x + 6.4, y - 3.2, h + 1.4), (5.2, 4.2, 2.6), materials["boot"], materials["metal"])
    cylinder("BOOT_flag", (x + 1.5, y + 6.2, h + 3.4), 0.08, 6.6, materials["metal"], verts=8)
    cube("BOOT_banner", (x + 1.5, y + 6.2, h + 6.4), (1.8, 0.08, 1.1), materials["cyan"])
    cube("TERM_boot", (x + 3.4, y + 2.2, h + 1.3), (1.2, 0.65, 1.5), materials["terminal"])
    ico("NPC_mentor", (x - 1.6, y + 3.4, h + 1.35), 0.55, materials["npc"], subdivisions=2, scale=(0.85, 0.85, 1.35))
    cube("NPC_mentor_body", (x - 1.6, y + 3.4, h + 0.55), (0.7, 0.45, 1.0), materials["npc"])
    ico("SPAWN_player", (x + 0.2, y + 6.8, h + 1.0), 0.3, materials["cyan"])
    cube("CHEST_boot", (x + 7.2, y + 4.4, h + 0.55), (0.9, 0.7, 0.7), materials["amber"])


def build_market(materials: dict) -> None:
    log("building package bazaar")
    x, y = SITES["market"]["p"]
    h = SITES["market"]["h"]
    specs = [
        (-5.5, -4.0, 6.5, 5.0, 4.2),
        (5.8, -3.4, 7.2, 5.4, 5.0),
        (-6.2, 5.2, 5.4, 4.6, 3.4),
        (6.0, 5.5, 6.0, 4.8, 3.8),
        (0.2, -7.2, 4.2, 3.2, 2.6),
    ]
    for i, (dx, dy, sx, sy, sz) in enumerate(specs):
        building_block(
            f"MKT_{i}",
            (x + dx, y + dy, h + sz / 2),
            (sx, sy, sz),
            materials["market"],
            materials["amber"],
        )
    for i in range(10):
        cube(
            f"CRATE_{i}",
            (x + rng.uniform(-4, 4), y + rng.uniform(-1, 3), h + 0.45),
            (0.8, 0.8, 0.8),
            materials["amber"],
        )
    ico("FRAG_syntax", (x + 5.8, y - 3.4, h + 5.7), 0.48, materials["frag_syntax"], subdivisions=1, scale=(0.7, 0.7, 1.6))
    cube("TERM_market", (x - 0.4, y + 1.2, h + 1.3), (1.1, 0.6, 1.5), materials["terminal"])
    cube("CHEST_market", (x - 6.8, y + 5.0, h + 0.55), (0.9, 0.7, 0.7), materials["amber"])


def build_canyon(materials: dict) -> None:
    log("carving git canyon")
    x, y = SITES["canyon"]["p"]
    h = SITES["canyon"]["h"]
    for i in range(9):
        rx = x - 8 + (i % 5) * 4.5
        ry = y + (8 if i < 5 else -8) + rng.uniform(-1.5, 1.5)
        hh = height_at(rx, ry)[0]
        ico(
            f"ROCK_{i}",
            (rx, ry, hh + 2.2),
            rng.uniform(1.6, 3.2),
            materials["canyon"],
            subdivisions=1,
            scale=(1.2, 1.0, rng.uniform(1.4, 2.4)),
        )
        collider(f"COL_rock_{i}", (rx, ry, hh + 1.6), (3.2, 3.2, 4.0))
    cube("BRIDGE", (x, y, h + 3.6), (4.2, 16.5, 0.45), materials["metal"])
    collider("COL_bridge_deck", (x, y, h + 3.6), (4.2, 16.5, 0.5))
    cube("BRIDGE_rail_a", (x - 1.9, y, h + 4.2), (0.16, 16.5, 0.7), materials["cyan"])
    cube("BRIDGE_rail_b", (x + 1.9, y, h + 4.2), (0.16, 16.5, 0.7), materials["cyan"])
    ico("FRAG_graph", (x, y, h + 4.6), 0.48, materials["frag_graph"], subdivisions=1, scale=(0.7, 0.7, 1.6))
    cube("TERM_canyon", (x + 3.8, y + 8.2, h + 1.5), (1.1, 0.6, 1.5), materials["terminal"])
    for i, t in enumerate((-4.5, -1.5, 1.5, 4.5)):
        cube(f"COMMIT_{i}", (x + t, y - 10, h + 1.0 + i * 0.4), (0.7, 0.7, 0.7), materials["magenta"])


def build_arena(materials: dict) -> None:
    log("forging runtime arena")
    x, y = SITES["arena"]["p"]
    h = SITES["arena"]["h"]
    cylinder("ARENA_floor", (x, y, h + 0.2), 11.5, 0.4, materials["stone"], verts=16)
    torus("ARENA_ring", (x, y, h + 1.6), 11.2, 0.55, materials["arena"])
    collider("COL_arena_wall", (x, y + 11.2, h + 2.2), (4.5, 2.2, 4.0))
    for i in range(10):
        ang = i / 10 * math.tau
        cx, cy = x + math.cos(ang) * 11.0, y + math.sin(ang) * 11.0
        cylinder(f"ARENA_col_{i}", (cx, cy, h + 2.6), 0.55, 4.4, materials["arena"], verts=8)
        collider(f"COL_arena_col_{i}", (cx, cy, h + 2.6), (1.3, 1.3, 4.4))
    ico("FRAG_runtime", (x, y, h + 1.6), 0.5, materials["frag_runtime"], subdivisions=1, scale=(0.7, 0.7, 1.7))
    cube("TERM_arena", (x + 6.5, y - 6.5, h + 1.4), (1.1, 0.6, 1.5), materials["terminal"])
    cube("CHEST_arena", (x - 7.4, y + 2.2, h + 0.7), (0.9, 0.7, 0.7), materials["amber"])


def build_lake(materials: dict) -> None:
    log("forming memory lake islands")
    x, y = SITES["lake"]["p"]
    h = SITES["lake"]["h"]
    for i, (dx, dy, s) in enumerate([(-6.5, -5.2, 3.4), (5.8, -4.0, 2.8), (0.4, 6.2, 3.0), (7.2, 3.5, 2.4)]):
        hh = max(0.35, height_at(x + dx, y + dy)[0])
        cylinder(f"ISLE_{i}", (x + dx, y + dy, hh), s, 0.7, materials["stone"], verts=8)
        collider(f"COL_isle_{i}", (x + dx, y + dy, hh), (s * 1.6, s * 1.6, 1.2))
    ico("FRAG_memory", (x + 0.4, y + 6.2, 2.4), 0.5, materials["frag_memory"], subdivisions=1, scale=(0.7, 0.7, 1.6))
    cube("TERM_lake", (x - 6.5, y - 5.2, 1.6), (1.1, 0.6, 1.5), materials["terminal"])
    for i in range(8):
        ang = i / 8 * math.tau
        ico(
            f"MEMCHIP_{i}",
            (x + math.cos(ang) * 8.5, y + math.sin(ang) * 8.5, 0.9),
            0.35,
            materials["cyan"],
            scale=(1.6, 0.4, 0.8),
        )


def build_forest(materials: dict) -> None:
    log("planting null forest")
    x, y = SITES["forest"]["p"]
    h = SITES["forest"]["h"]
    n_trees = 0
    for i in range(55):
        dx = rng.uniform(-16, 16)
        dy = rng.uniform(-16, 16)
        if math.hypot(dx, dy) < 3.5:
            continue
        tx, ty = x + dx, y + dy
        hh = height_at(tx, ty)[0]
        if hh < 0.3:
            continue
        scale = rng.uniform(0.8, 1.6)
        trunk = cylinder(
            f"TREE_{n_trees}",
            (tx, ty, hh + 1.3 * scale),
            0.22 * scale,
            2.6 * scale,
            materials["trunk"],
            verts=6,
        )
        ico(
            f"LEAF_{n_trees}",
            (tx, ty, hh + 2.7 * scale),
            1.15 * scale,
            materials["leaf"],
            subdivisions=1,
            scale=(1.0, 1.0, 1.15),
        )
        if scale > 1.25:
            collider(f"COL_tree_{n_trees}", (tx, ty, hh + 1.4), (0.9, 0.9, 2.8))
        n_trees += 1
        _ = trunk
    ico("FRAG_kernel", (x, y, h + 1.8), 0.55, materials["frag_kernel"], subdivisions=1, scale=(0.75, 0.75, 1.8))
    cube("TERM_forest", (x + 8.5, y - 6.2, h + 1.4), (1.1, 0.6, 1.5), materials["terminal"])
    cube("CHEST_forest", (x - 9.2, y + 7.0, h + 0.6), (0.9, 0.7, 0.7), materials["amber"])
    ico("NULL_heart", (x - 2.0, y + 2.2, h + 2.4), 0.9, materials["enemy"], subdivisions=1)


def scatter_stars(materials: dict) -> None:
    log("scattering commit stars")
    spots = [
        (12, -20),
        (-14, -18),
        (22, 8),
        (-22, -6),
        (18, 28),
        (-30, 22),
        (32, -8),
        (8, 40),
        (-8, 32),
        (40, 22),
        (-40, 12),
        (28, 48),
        (-16, 54),
        (10, -40),
        (-24, -36),
    ]
    for i, (x, y) in enumerate(spots):
        hh = height_at(x, y)[0]
        ico(f"STAR_{i}", (x, y, hh + 0.9), 0.28, materials["star"], subdivisions=1)


def extra_props(materials: dict) -> None:
    for i, (x, y) in enumerate([(18, -8), (-16, 14), (8, 20), (-28, -12)]):
        hh = height_at(x, y)[0]
        building_block(
            f"OUTPOST_{i}",
            (x, y, hh + 1.5),
            (3.6, 3.2, 2.8),
            materials["boot"],
            materials["metal"],
        )
        cube(f"TERM_outpost_{i}", (x + 1.8, y, hh + 1.3), (0.9, 0.5, 1.3), materials["terminal"])


def make_materials() -> dict:
    return {
        "ground": mat("ground", (0.20, 0.28, 0.22), 0.85, 0.0),
        "stone": mat("stone", (0.38, 0.40, 0.42), 0.7, 0.05),
        "metal": mat("metal", (0.22, 0.24, 0.28), 0.28, 0.85),
        "spire": mat("spire", (0.18, 0.22, 0.28), 0.22, 0.72),
        "boot": mat("boot", (0.16, 0.22, 0.26), 0.4, 0.35),
        "market": mat("market", (0.28, 0.18, 0.10), 0.5, 0.15),
        "canyon": mat("canyon", (0.32, 0.16, 0.10), 0.78, 0.0),
        "arena": mat("arena", (0.34, 0.24, 0.12), 0.4, 0.45),
        "trunk": mat("trunk", (0.12, 0.07, 0.08), 0.8, 0.0),
        "leaf": mat("leaf", (0.12, 0.04, 0.16), 0.7, 0.0, emission=(0.4, 0.02, 0.08), emit_strength=0.25),
        "fiber": mat("fiber", (0.05, 0.7, 0.85), 0.2, 0.3, emission=(0.2, 0.9, 1.0), emit_strength=3.2),
        "cyan": mat("cyan", (0.2, 0.9, 1.0), 0.18, 0.4, emission=(0.2, 0.9, 1.0), emit_strength=4.5),
        "magenta": mat("magenta", (0.9, 0.2, 0.75), 0.18, 0.3, emission=(0.9, 0.15, 0.7), emit_strength=3.8),
        "amber": mat("amber", (1.0, 0.55, 0.12), 0.3, 0.2, emission=(1.0, 0.5, 0.1), emit_strength=2.4),
        "terminal": mat("terminal", (0.05, 0.08, 0.1), 0.2, 0.6, emission=(0.1, 0.8, 0.4), emit_strength=2.8),
        "npc": mat("npc", (0.85, 0.86, 0.9), 0.35, 0.2, emission=(0.4, 0.8, 1.0), emit_strength=0.6),
        "enemy": mat("enemy", (0.12, 0.02, 0.04), 0.4, 0.2, emission=(1.0, 0.05, 0.08), emit_strength=3.0),
        "star": mat("star", (1.0, 0.92, 0.45), 0.2, 0.1, emission=(1.0, 0.85, 0.3), emit_strength=5.0),
        "frag_syntax": mat("frag_syntax", (1.0, 0.6, 0.1), 0.15, 0.2, emission=(1.0, 0.55, 0.1), emit_strength=6.0),
        "frag_graph": mat("frag_graph", (0.9, 0.2, 0.85), 0.15, 0.2, emission=(0.9, 0.15, 0.8), emit_strength=6.0),
        "frag_runtime": mat("frag_runtime", (1.0, 0.82, 0.2), 0.15, 0.2, emission=(1.0, 0.8, 0.15), emit_strength=6.0),
        "frag_memory": mat("frag_memory", (0.2, 0.85, 1.0), 0.15, 0.2, emission=(0.2, 0.9, 1.0), emit_strength=6.0),
        "frag_kernel": mat("frag_kernel", (0.4, 1.0, 0.35), 0.15, 0.2, emission=(0.3, 1.0, 0.3), emit_strength=7.0),
    }


COL_MAT = None


def export_glb(path: str, selected=False) -> None:
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=selected,
        export_apply=True,
        export_cameras=False,
        export_extras=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_lights=False,
    )
    log(f"exported {path} ({os.path.getsize(path)} bytes)")


def build_player(materials_player=None) -> None:
    log("modeling player operator")
    reset_scene()
    body_m = mat("p_body", (0.12, 0.16, 0.20), 0.3, 0.65)
    visor_m = mat("p_visor", (0.1, 0.9, 1.0), 0.12, 0.4, emission=(0.2, 0.95, 1.0), emit_strength=5.0)
    accent = mat("p_accent", (0.95, 0.55, 0.1), 0.3, 0.4, emission=(1.0, 0.5, 0.1), emit_strength=1.6)
    cube("Player", (0, 0, 0.95), (0.72, 0.42, 1.05), body_m)
    ico("PlayerHead", (0, 0.05, 1.72), 0.34, body_m, subdivisions=2)
    cube("PlayerVisor", (0, 0.28, 1.72), (0.46, 0.12, 0.18), visor_m)
    cube("PlayerPack", (0, -0.28, 1.15), (0.5, 0.22, 0.7), accent)
    cube("PlayerLegL", (-0.2, 0, 0.32), (0.22, 0.24, 0.64), body_m)
    cube("PlayerLegR", (0.2, 0, 0.32), (0.22, 0.24, 0.64), body_m)
    cube("PlayerArmL", (-0.48, 0, 1.05), (0.16, 0.16, 0.7), body_m)
    cube("PlayerArmR", (0.48, 0, 1.05), (0.16, 0.16, 0.7), body_m)
    export_glb(os.path.join(OUT, "player.glb"))


def build_enemy() -> None:
    log("modeling null bug")
    reset_scene()
    shell = mat("e_shell", (0.08, 0.02, 0.04), 0.35, 0.25, emission=(0.8, 0.05, 0.1), emit_strength=1.2)
    eye = mat("e_eye", (1, 0.15, 0.1), 0.2, 0.1, emission=(1.0, 0.08, 0.05), emit_strength=6.0)
    ico("BugBody", (0, 0, 0.45), 0.55, shell, subdivisions=2, scale=(1.15, 0.8, 0.7))
    ico("BugHead", (0, 0.55, 0.5), 0.28, shell, subdivisions=1)
    ico("BugEyeL", (-0.12, 0.72, 0.55), 0.08, eye)
    ico("BugEyeR", (0.12, 0.72, 0.55), 0.08, eye)
    for i, sx in enumerate((-0.35, 0.35)):
        for j, y in enumerate((-0.15, 0.15, 0.4)):
            cube(f"BugLeg_{i}_{j}", (sx, y, 0.18), (0.12, 0.12, 0.45), shell)
    export_glb(os.path.join(OUT, "enemy.glb"))


def write_world_json() -> None:
    meta = {
        "title": "KERNEL RIDGE",
        "subtitle": "源码岭",
        "waterLevel": 0.18,
        "worldRadius": 90,
        "sites": {
            k: {
                "x": v["p"][0],
                "z": -v["p"][1],
                "title": v["title"],
            }
            for k, v in SITES.items()
        },
        "fragments": [
            {
                "id": "syntax",
                "object": "FRAG_syntax",
                "title": "语法核心 SYNTAX",
                "hint": "包市场货仓屋顶上，琥珀光在呼吸。",
            },
            {
                "id": "graph",
                "object": "FRAG_graph",
                "title": "图谱核心 GRAPH",
                "hint": "版本峡谷的桥心，品红节点悬停在半空。",
            },
            {
                "id": "runtime",
                "object": "FRAG_runtime",
                "title": "运行时核心 RUNTIME",
                "hint": "北侧竞技场圆心，金色环正在空转。",
            },
            {
                "id": "memory",
                "object": "FRAG_memory",
                "title": "内存核心 MEMORY",
                "hint": "内存湖浮岛，青色倒影会出卖它。",
            },
            {
                "id": "kernel",
                "object": "FRAG_kernel",
                "title": "内核核心 KERNEL",
                "hint": "空值之林正中，红脉树木看守着最后一块。",
            },
        ],
        "mentor": {
            "object": "NPC_mentor",
            "name": "引导者 · BOOT",
            "lines": [
                "欢迎回到源码岭。内核已经碎成五块，散落在岛上。",
                "去包市场、版本峡谷、竞技场、内存湖和空值之林。",
                "带回五枚核心，在编译之塔重新链接。小心空值虫。",
            ],
        },
        "terminals": {
            "TERM_boot": "BOOT：移动 WASD，鼠标视角，空格跳跃，Shift 冲刺，E 交互，左键驱虫。",
            "TERM_spire": "SPIRE：把五枚核心带回这里，编译即可重建内核。",
            "TERM_market": "REGISTRY：依赖像货物一样堆着。语法核心在东侧高仓。",
            "TERM_canyon": "GIT：历史被切成两岸。走桥，别掉进未合并的深渊。",
            "TERM_arena": "RUNTIME：每一帧都在决斗。圆心的金核属于最快的人。",
            "TERM_lake": "HEAP：记忆会泄漏。跳上浮岛，别在数据里溺水。",
            "TERM_forest": "NULL：未初始化的森林。红眼虫子会追着引用跑。",
        },
        "win": {
            "object": "SPIRE_core",
            "title": "编译内核",
        },
    }
    path = os.path.join(OUT, "world.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    log(f"wrote {path}")


def build_world() -> None:
    global COL_MAT
    reset_scene()
    materials = make_materials()
    COL_MAT = mat("col", (1, 0, 1), 0.5, 0.0, alpha=0.0)
    COL_MAT.blend_method = "BLEND"
    build_terrain(materials)
    fiber_road(materials)
    build_boot(materials)
    build_spire(materials)
    build_market(materials)
    build_canyon(materials)
    build_arena(materials)
    build_lake(materials)
    build_forest(materials)
    scatter_stars(materials)
    extra_props(materials)
    write_world_json()
    export_glb(os.path.join(OUT, "world.glb"))


def main() -> None:
    log(f"output → {OUT}")
    build_world()
    build_player()
    build_enemy()
    log("asset pipeline complete")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"FAILED: {exc}")
        raise
