#!/usr/bin/env python3
"""Build the Devworld island in Blender 4.2 and export glTF + world.json.

Run:
  blender -b --factory-startup -noaudio --python tools/blender/build_devworld.py -- --out assets
"""

from __future__ import annotations

import json
import math
import os
import sys
from dataclasses import dataclass, field

import bpy
from mathutils import Vector


# ---------------------------------------------------------------------------
# Paths / CLI
# ---------------------------------------------------------------------------

def _argv_after_dash() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def parse_out_dir() -> str:
    argv = _argv_after_dash()
    out = "assets"
    i = 0
    while i < len(argv):
        if argv[i] == "--out" and i + 1 < len(argv):
            out = argv[i + 1]
            i += 2
        else:
            i += 1
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(script_dir, "..", ".."))
    return out if os.path.isabs(out) else os.path.join(repo, out)


OUT_DIR = parse_out_dir()
TEX_DIR = os.path.join(OUT_DIR, "textures")
MODEL_DIR = os.path.join(OUT_DIR, "models")
DATA_DIR = os.path.join(OUT_DIR, "data")
PREVIEW_DIR = os.path.join(OUT_DIR, "previews")


# ---------------------------------------------------------------------------
# Scene reset
# ---------------------------------------------------------------------------

def reset_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.fps = 30
    scene.world = bpy.data.worlds.new("DevworldSky")
    scene.world.use_nodes = True
    nt = scene.world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (0.18, 0.28, 0.42, 1.0)
    bg.inputs["Strength"].default_value = 0.55
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return scene


def collection(name: str) -> bpy.types.Collection:
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------

IMAGES: dict[str, bpy.types.Image] = {}


def load_images() -> None:
    if not os.path.isdir(TEX_DIR):
        return
    for fn in os.listdir(TEX_DIR):
        if fn.lower().endswith(".png"):
            path = os.path.join(TEX_DIR, fn)
            img = bpy.data.images.load(path)
            img.pack()
            IMAGES[os.path.splitext(fn)[0]] = img


def make_mat(
    name: str,
    color=(0.5, 0.5, 0.5),
    roughness: float = 0.55,
    metallic: float = 0.0,
    emission=None,
    emission_strength: float = 0.0,
    image: str | None = None,
    vertex_color: bool = False,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    out.location = (280, 0)
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    color_src = None
    if vertex_color:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        vc.layer_name = "Color"
        vc.location = (-360, 80)
        color_src = vc.outputs["Color"]
    elif image and image in IMAGES:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = IMAGES[image]
        tex.interpolation = "Smart"
        tex.location = (-380, 40)
        color_src = tex.outputs["Color"]
    if color_src is not None:
        nt.links.new(color_src, bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if emission is not None:
        mat.blend_method = "OPAQUE"
    return mat


# ---------------------------------------------------------------------------
# Mesh helpers
# ---------------------------------------------------------------------------

def link(ob: bpy.types.Object, col: bpy.types.Collection) -> bpy.types.Object:
    col.objects.link(ob)
    return ob


def cube(
    name: str,
    loc,
    size,
    col: bpy.types.Collection,
    mat: bpy.types.Material | None = None,
    apply: bool = True,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    ob.location = loc
    ob.scale = size
    link(ob, col)
    if mat:
        ob.data.materials.append(mat)
    if apply:
        apply_scale(ob)
        cube_uv(ob)
    return ob


def cylinder(
    name: str,
    loc,
    radius: float,
    depth: float,
    col: bpy.types.Collection,
    mat: bpy.types.Material | None = None,
    verts: int = 16,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=verts,
        radius1=radius,
        radius2=radius,
        depth=depth,
    )
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    ob.location = loc
    link(ob, col)
    if mat:
        ob.data.materials.append(mat)
    return ob


def cone(
    name: str,
    loc,
    radius: float,
    depth: float,
    col: bpy.types.Collection,
    mat: bpy.types.Material | None = None,
    verts: int = 10,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=verts,
        radius1=radius,
        radius2=0.02,
        depth=depth,
    )
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    ob.location = loc
    link(ob, col)
    if mat:
        ob.data.materials.append(mat)
    return ob


def icosphere(
    name: str,
    loc,
    radius: float,
    col: bpy.types.Collection,
    mat: bpy.types.Material | None = None,
    subdiv: int = 1,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(name, mesh)
    ob.location = loc
    link(ob, col)
    if mat:
        ob.data.materials.append(mat)
    return ob


def apply_scale(ob: bpy.types.Object) -> None:
    sx, sy, sz = ob.scale
    for v in ob.data.vertices:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    ob.scale = (1, 1, 1)
    ob.data.update()


def cube_uv(ob: bpy.types.Object) -> None:
    mesh = ob.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active.data
    # naive box unwrap from vertex positions
    for poly in mesh.polygons:
        n = poly.normal
        ax = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            if ax[2] >= ax[0] and ax[2] >= ax[1]:
                uv[li].uv = (co.x * 0.25 + 0.5, co.y * 0.25 + 0.5)
            elif ax[0] >= ax[1]:
                uv[li].uv = (co.y * 0.25 + 0.5, co.z * 0.25 + 0.5)
            else:
                uv[li].uv = (co.x * 0.25 + 0.5, co.z * 0.25 + 0.5)


def to_gltf(v: Vector) -> list[float]:
    return [round(float(v.x), 4), round(float(v.z), 4), round(float(-v.y), 4)]


def world_aabb(ob: bpy.types.Object) -> tuple[list[float], list[float]]:
    corners = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    # convert corners to glTF and take min/max in that space
    g = [to_gltf(c) for c in corners]
    gmin = [min(p[i] for p in g) for i in range(3)]
    gmax = [max(p[i] for p in g) for i in range(3)]
    return gmin, gmax


# ---------------------------------------------------------------------------
# Heightfield
# ---------------------------------------------------------------------------

PADS = [
    # x, y, radius, plateau height
    (0.0, -2.0, 9.0, 1.42),
    (-22.0, 8.0, 7.0, 1.28),
    (-18.0, -18.0, 7.5, 1.18),
    (24.0, -6.0, 7.0, 1.22),
    (18.0, 18.0, 7.0, 1.32),
    (0.0, 26.0, 6.0, 4.55),
    (8.0, -22.0, 6.0, 1.22),
]


def height(x: float, y: float) -> float:
    r = math.hypot(x, y)
    shore = 1.0 / (1.0 + math.exp((r - 35.5) * 0.62))
    h = 1.05
    h += 0.48 * math.sin(x * 0.11) * math.cos(y * 0.09)
    h += 0.28 * math.sin(x * 0.07 + 1.3) * math.sin(y * 0.08 + 0.4)
    h += 4.6 * math.exp(-((x) ** 2 + (y - 26.0) ** 2) / 78.0)
    h -= 0.85 * math.exp(-((x + 22.0) ** 2 + (y - 8.0) ** 2) / 48.0)
    h += 0.55 * math.exp(-((x - 24.0) ** 2 + (y + 6.0) ** 2) / 70.0)
    for px, py, rad, ph in PADS:
        d = math.hypot(x - px, y - py)
        if d < rad:
            w = (1.0 - (d / rad) ** 2) ** 2
            h = h * (1.0 - w) + ph * w
    return max(0.02, h * shore)


# ---------------------------------------------------------------------------
# World data
# ---------------------------------------------------------------------------

@dataclass
class WorldData:
    colliders: list = field(default_factory=list)
    interactables: list = field(default_factory=list)
    districts: list = field(default_factory=list)
    spawn: dict = field(default_factory=dict)

    def collider(self, ob: bpy.types.Object, kind: str = "box") -> None:
        mn, mx = world_aabb(ob)
        self.colliders.append({"id": ob.name, "kind": kind, "min": mn, "max": mx})

    def mark(self, ident: str, kind: str, loc: Vector, extra: dict | None = None) -> None:
        item = {"id": ident, "kind": kind, "pos": to_gltf(loc)}
        if extra:
            item.update(extra)
        self.interactables.append(item)


# ---------------------------------------------------------------------------
# Terrain
# ---------------------------------------------------------------------------

def build_terrain(col: bpy.types.Collection, mats: dict) -> bpy.types.Object:
    import bmesh

    res = 110
    size = 92.0
    mesh = bpy.data.meshes.new("Terrain_Island")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=res, y_segments=res, size=size / 2.0)
    for v in bm.verts:
        x, y = v.co.x, v.co.y
        v.co.z = height(x, y)
    bm.to_mesh(mesh)
    bm.free()
    mesh.color_attributes.new(name="Color", domain="POINT", type="BYTE_COLOR")
    attr = mesh.color_attributes["Color"]
    for i, v in enumerate(mesh.vertices):
        x, y, z = v.co
        r = math.hypot(x, y)
        slope = 0.0
        dzdx = abs(height(x + 0.4, y) - height(x - 0.4, y))
        dzdy = abs(height(x, y + 0.4) - height(x, y - 0.4))
        slope = dzdx + dzdy
        if z < 0.85:
            colr = (0.76, 0.66, 0.42, 1.0)  # sand
        elif slope > 0.55 or z > 3.6:
            colr = (0.42, 0.44, 0.46, 1.0)  # rock
        elif r > 31:
            colr = (0.55, 0.62, 0.38, 1.0)
        else:
            g = 0.42 + 0.18 * math.sin(x * 0.2) * math.cos(y * 0.18)
            colr = (0.18, 0.38 + g * 0.25, 0.28, 1.0)
        # plaza cobble tint
        if math.hypot(x, y + 2) < 8.5 and z > 1.1:
            colr = (0.55, 0.52, 0.46, 1.0)
        attr.data[i].color = colr
    ob = bpy.data.objects.new("Terrain_Island", mesh)
    link(ob, col)
    ob.data.materials.append(mats["terrain"])
    return ob


def build_water(col: bpy.types.Collection, mats: dict) -> bpy.types.Object:
    ob = cube("Water", (0, 0, 0.28), (96, 96, 0.08), col, mats["water"])
    return ob


def path_segment(a, b, width: float, col, mat, data: WorldData, name: str) -> None:
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    if length < 0.2:
        return
    ang = math.atan2(dy, dx)
    mx, my = (ax + bx) / 2, (ay + by) / 2
    z = height(mx, my) + 0.06
    ob = cube(name, (mx, my, z), (length, width, 0.12), col, mat)
    ob.rotation_euler = (0, 0, ang)
    # rotation after apply_scale: need to rotate object, not mesh
    # cube() already applied scale; rotation is object-level which is fine for export


def build_paths(col, mats, data: WorldData) -> None:
    routes = [
        ((0, -2), (-22, 8)),
        ((0, -2), (-18, -18)),
        ((0, -2), (24, -6)),
        ((0, -2), (18, 18)),
        ((0, -2), (0, 22)),
        ((0, -2), (8, -22)),
        ((18, 18), (0, 22)),
        ((24, -6), (18, 18)),
    ]
    for i, (a, b) in enumerate(routes):
        path_segment(a, b, 2.35, col, mats["cobble"], data, f"Path_{i:02d}")


# ---------------------------------------------------------------------------
# Props / landmarks
# ---------------------------------------------------------------------------

def tree(x, y, col, mats, rng_k: int) -> None:
    z = height(x, y)
    h = 1.7 + (rng_k % 5) * 0.22
    cylinder(f"Trunk_{rng_k}", (x, y, z + h * 0.28), 0.16, h * 0.55, col, mats["bark"], verts=8)
    icosphere(
        f"Canopy_{rng_k}",
        (x, y, z + h * 0.78),
        0.85 + (rng_k % 3) * 0.08,
        col,
        mats["leaves"],
        subdiv=1,
    )


def lantern(x, y, col, mats, k: int) -> None:
    z = height(x, y)
    cylinder(f"LampPole_{k}", (x, y, z + 1.05), 0.06, 2.1, col, mats["metal"], verts=8)
    icosphere(f"LampGlow_{k}", (x, y, z + 2.15), 0.18, col, mats["glow_cyan"], subdiv=1)


def monitor_wall(name, loc, size, col, mats) -> bpy.types.Object:
    panel = cube(name, loc, size, col, mats["metal"])
    screen = cube(
        name + "_Scr",
        (loc[0], loc[1] - size[1] * 0.51, loc[2] + 0.05),
        (size[0] * 0.86, 0.05, size[2] * 0.72),
        col,
        mats["glow_cyan"],
    )
    screen.rotation_euler = panel.rotation_euler
    return panel


def build_plaza(col, props, mats, data: WorldData) -> None:
    z = height(0, -2)
    # ring
    for i in range(12):
        ang = i * math.tau / 12
        x, y = math.cos(ang) * 7.4, -2 + math.sin(ang) * 7.4
        cylinder(f"PlazaCol_{i}", (x, y, z + 1.35), 0.22, 2.6, col, mats["plaster"], verts=10)
    # roof ring slabs
    for i in range(12):
        ang = i * math.tau / 12
        x, y = math.cos(ang) * 6.2, -2 + math.sin(ang) * 7.0
        cube(f"PlazaBeam_{i}", (x, y, z + 2.75), (2.2, 0.28, 0.18), col, mats["wood"])
    # giant terminal triptych
    for i, ox in enumerate((-2.4, 0.0, 2.4)):
        monitor_wall(f"Term_{i}", (ox, 1.6, z + 2.1), (2.1, 0.28, 3.4), col, mats)
    data.collider(cube("COL_Term", (0, 1.7, z + 1.8), (7.2, 1.1, 3.6), col, mats["collider"]))
    # benches
    for i, ox in enumerate((-4.5, 4.5)):
        cube(f"Bench_{i}", (ox, -4.2, z + 0.28), (1.8, 0.5, 0.42), props, mats["wood"])
    # Ada
    data.mark(
        "ada",
        "npc",
        Vector((2.2, -3.4, z + 0.2)),
        {
            "title": "艾达 · 内核守护者",
            "radius": 2.4,
            "yaw": 3.4,
        },
    )
    data.districts.append(
        {"id": "plaza", "title": "终端广场", "pos": to_gltf(Vector((0, -2, z)))}
    )
    # compile spire
    build_spire(col, mats, data, z)


def build_spire(col, mats, data: WorldData, plaza_z: float) -> None:
    x, y = 0.0, 3.8
    z = height(x, y)
    cylinder("SpireBase", (x, y, z + 0.5), 2.4, 1.0, col, mats["rock"], verts=12)
    cylinder("SpireShaft", (x, y, z + 5.2), 1.15, 8.6, col, mats["plaster"], verts=12)
    cube("SpireRing", (x, y, z + 7.4), (3.4, 3.4, 0.28), col, mats["glow_amber"])
    cone("SpireCap", (x, y, z + 10.4), 1.6, 2.4, col, mats["metal"], verts=12)
    icosphere("SpireCore", (x, y, z + 8.6), 0.55, col, mats["glow_amber"], subdiv=2)
    data.collider(cube("COL_Spire", (x, y, z + 4.8), (2.6, 2.6, 9.5), col, mats["collider"]))
    data.mark(
        "compile",
        "compile",
        Vector((x, y - 2.4, z + 0.2)),
        {"title": "编译尖塔", "radius": 2.8},
    )
    data.districts.append(
        {"id": "spire", "title": "编译尖塔", "pos": to_gltf(Vector((x, y, z + 4)))}
    )


def build_git(col, props, mats, data: WorldData) -> None:
    ox, oy = -22.0, 8.0
    z = height(ox, oy)
    # three branch walls
    for i, (dx, dy, yaw) in enumerate(((-2.8, 0, 0.2), (0.2, 2.4, -0.6), (2.2, -1.6, 0.9))):
        w = cube(
            f"GitBranch_{i}",
            (ox + dx, oy + dy, z + 1.4),
            (7.5, 0.42, 2.6),
            col,
            mats["metal"],
        )
        w.rotation_euler.z = yaw
        wall = cube(
            f"COL_Git_{i}",
            (ox + dx, oy + dy, z + 1.3),
            (7.5, 0.7, 2.5),
            col,
            mats["collider"],
        )
        wall.rotation_euler.z = yaw
    # commit platforms
    cube("GitPlat", (ox - 4.6, oy + 3.4, z + 1.35), (2.4, 2.4, 0.28), col, mats["cobble"])
    token_pos = Vector((ox - 4.6, oy + 3.4, z + 1.7))
    icosphere("GitTokenMesh", token_pos, 0.32, props, mats["glow_amber"], subdiv=1)
    data.mark(
        "token_git",
        "token",
        token_pos,
        {"title": "分支令牌", "token": "git", "radius": 1.8},
    )
    data.districts.append({"id": "git", "title": "Git 峡谷", "pos": to_gltf(Vector((ox, oy, z)))})
    # archive hut
    cube("GitHut", (ox + 5.5, oy - 4.2, z + 1.3), (4.2, 3.6, 2.5), col, mats["plaster"])
    cube("GitHutRoof", (ox + 5.5, oy - 4.2, z + 2.7), (4.6, 4.0, 0.35), col, mats["roof"])
    data.collider(cube("COL_GitHut", (ox + 5.5, oy - 4.2, z + 1.3), (4.2, 3.6, 2.5), col, mats["collider"]))


def build_marsh(col, props, mats, data: WorldData) -> None:
    ox, oy = -18.0, -18.0
    z = height(ox, oy)
    for i in range(9):
        ang = i * 0.7
        mx = ox + math.cos(ang) * (2.2 + i * 0.35)
        my = oy + math.sin(ang) * (2.0 + (i % 4) * 0.4)
        cone(f"Shroom_{i}", (mx, my, height(mx, my) + 0.55), 0.45, 0.9, props, mats["glow_magenta"], verts=8)
    for i in range(6):
        ang = i * math.tau / 6
        tree(ox + math.cos(ang) * 5.5, oy + math.sin(ang) * 5.5, col, mats, 200 + i)
    data.mark(
        "bugzone",
        "bugzone",
        Vector((ox, oy, z)),
        {"title": "空指针沼泽", "radius": 9.0, "count": 7},
    )
    data.districts.append({"id": "marsh", "title": "除虫沼泽", "pos": to_gltf(Vector((ox, oy, z)))})
    data.mark(
        "token_debug",
        "token",
        Vector((ox + 0.4, oy - 0.2, z + 0.5)),
        {"title": "调试令牌", "token": "debug", "radius": 1.6, "lockedBy": "bugs"},
    )


def build_harbor(col, props, mats, data: WorldData) -> None:
    ox, oy = 24.0, -6.0
    z = height(ox, oy)
    cube("Dock", (ox + 3.4, oy - 4.8, 0.55), (8.5, 3.2, 0.28), col, mats["wood"])
    data.collider(cube("COL_DockEdge", (ox + 3.4, oy - 6.5, 0.9), (8.5, 0.4, 1.1), col, mats["collider"]))
    cylinder("Lighthouse", (ox + 6.8, oy - 1.2, z + 4.2), 0.85, 8.2, col, mats["plaster"], verts=12)
    cone("LHCap", (ox + 6.8, oy - 1.2, z + 8.6), 1.3, 1.6, col, mats["roof"], verts=10)
    icosphere("LHLight", (ox + 6.8, oy - 1.2, z + 8.0), 0.42, col, mats["glow_amber"], subdiv=1)
    data.collider(cube("COL_LH", (ox + 6.8, oy - 1.2, z + 4.0), (1.8, 1.8, 8.2), col, mats["collider"]))
    beacons = [(ox - 2.5, oy + 2.8), (ox + 1.5, oy + 4.6), (ox + 5.2, oy + 2.2)]
    for i, (bx, by) in enumerate(beacons):
        bz = height(bx, by)
        cylinder(f"Beacon_{i}", (bx, by, bz + 1.4), 0.28, 2.6, col, mats["metal"], verts=8)
        icosphere(f"BeaconGlow_{i}", (bx, by, bz + 2.8), 0.22, col, mats["glow_cyan"], subdiv=1)
        data.mark(
            f"beacon_{i}",
            "beacon",
            Vector((bx, by, bz + 0.2)),
            {"title": f"API 信标 {i+1}", "radius": 1.8, "index": i},
        )
    data.mark(
        "curl",
        "npc",
        Vector((ox + 2.4, oy - 3.4, z + 0.2)),
        {"title": "舰长 Curl", "radius": 2.3, "yaw": 1.2},
    )
    data.mark(
        "token_api",
        "token",
        Vector((ox + 6.8, oy - 3.2, z + 0.5)),
        {"title": "接口令牌", "token": "api", "radius": 1.7, "lockedBy": "beacons"},
    )
    data.districts.append({"id": "harbor", "title": "API 港湾", "pos": to_gltf(Vector((ox, oy, z)))})


def build_factory(col, props, mats, data: WorldData) -> None:
    ox, oy = 18.0, 18.0
    z = height(ox, oy)
    cube("Factory", (ox, oy, z + 2.0), (9.5, 6.4, 3.8), col, mats["metal"])
    cube("FactoryRoof", (ox, oy, z + 4.15), (10.2, 6.9, 0.4), col, mats["roof"])
    data.collider(cube("COL_Factory", (ox, oy, z + 2.0), (9.5, 6.4, 3.8), col, mats["collider"]))
    # open doorway by not covering south face fully — player interacts from outside
    for i, ox2 in enumerate((-2.4, 0.0, 2.4)):
        cube(f"Stack_{i}", (ox + ox2, oy + 2.4, z + 5.4), (0.7, 0.7, 2.6), col, mats["metal"])
        icosphere(f"StackGlow_{i}", (ox + ox2, oy + 2.4, z + 6.8), 0.22, col, mats["glow_magenta"], subdiv=1)
        cube(
            f"Console_{i}",
            (ox + ox2, oy - 3.7, z + 0.85),
            (1.3, 0.7, 1.1),
            props,
            mats["metal"],
        )
        monitor_wall(
            f"ConsoleScr_{i}",
            (ox + ox2, oy - 3.95, z + 1.35),
            (1.05, 0.08, 0.7),
            props,
            mats,
        )
        data.mark(
            f"console_{i}",
            "console",
            Vector((ox + ox2, oy - 4.4, z + 0.2)),
            {"title": f"流水线节点 {chr(65+i)}", "radius": 1.9, "index": i},
        )
    data.mark(
        "token_ci",
        "token",
        Vector((ox, oy - 4.8, z + 0.5)),
        {"title": "流水线令牌", "token": "ci", "radius": 1.7, "lockedBy": "consoles"},
    )
    data.districts.append({"id": "factory", "title": "CI 工厂", "pos": to_gltf(Vector((ox, oy, z)))})


def build_peak(col, props, mats, data: WorldData) -> None:
    ox, oy = 0.0, 26.0
    z = height(ox, oy)
    # stairs from plaza-north toward peak
    for i in range(14):
        t = i / 13
        x = 0.0
        y = 12.0 + t * 12.5
        hz = height(x, y) + 0.08
        cube(f"Stair_{i}", (x, y, hz), (2.2, 1.05, 0.18), col, mats["rock"])
    cube("Shrine", (ox, oy, z + 1.1), (3.6, 3.6, 2.0), col, mats["plaster"])
    cube("ShrineRoof", (ox, oy, z + 2.4), (4.2, 3.9, 0.3), col, mats["roof"])
    data.collider(cube("COL_Shrine", (ox, oy, z + 1.1), (3.6, 3.6, 2.0), col, mats["collider"]))
    icosphere("Bloom", (ox, oy - 2.3, z + 1.15), 0.34, props, mats["glow_cyan"], subdiv=2)
    data.mark(
        "token_bloom",
        "token",
        Vector((ox, oy - 2.3, z + 1.15)),
        {"title": "辉光令牌", "token": "bloom", "radius": 1.8},
    )
    data.districts.append({"id": "peak", "title": "着色峰", "pos": to_gltf(Vector((ox, oy, z)))})


def build_grove(col, props, mats, data: WorldData) -> None:
    ox, oy = 8.0, -22.0
    z = height(ox, oy)
    for i in range(12):
        ang = i * math.tau / 12
        tree(ox + math.cos(ang) * 4.4, oy + math.sin(ang) * 4.4, col, mats, 300 + i)
    cube("Readme", (ox, oy, z + 0.85), (1.6, 0.22, 1.4), props, mats["plaster"])
    data.mark(
        "readme",
        "note",
        Vector((ox, oy, z + 0.2)),
        {
            "title": "README 石碑",
            "radius": 2.0,
            "body": "源码岛的内核在一次错误发布后熄灭。收集五枚令牌，回到编译尖塔，重新编译这个世界。",
        },
    )
    data.districts.append({"id": "grove", "title": "开源树林", "pos": to_gltf(Vector((ox, oy, z)))})


def build_ring_colliders(col, mats, data: WorldData) -> None:
    # keep the player on the island
    for i in range(20):
        ang = i * math.tau / 20
        x, y = math.cos(ang) * 38.5, math.sin(ang) * 38.5
        ob = cube(f"COL_Rim_{i}", (x, y, 3.0), (6.5, 3.2, 8.0), col, mats["collider"])
        ob.rotation_euler.z = ang
        data.collider(ob)


def populate_trees_and_lamps(col, props, mats, data: WorldData) -> None:
    spots = [
        (6, 8),
        (-8, 6),
        (-10, -6),
        (12, -10),
        (-28, 0),
        (10, 12),
        (-4, -12),
        (28, 8),
        (-14, 16),
        (4, -28),
        (-26, -12),
        (30, -16),
        (14, 26),
        (-8, 22),
    ]
    for i, (x, y) in enumerate(spots):
        if math.hypot(x, y) > 34:
            continue
        tree(x, y, col, mats, 10 + i)
    lamps = [
        (4, -2),
        (-4, -2),
        (-10, 4),
        (10, 6),
        (-14, -12),
        (16, -4),
        (10, 14),
        (-6, 14),
        (4, -16),
    ]
    for i, (x, y) in enumerate(lamps):
        lantern(x, y, col, mats, i)


def hide_colliders(col: bpy.types.Collection) -> None:
    for ob in col.objects:
        ob.hide_render = True
        ob.visible_camera = False
        ob.visible_shadow = False


# ---------------------------------------------------------------------------
# Lighting / cameras / export
# ---------------------------------------------------------------------------

def setup_lights(col: bpy.types.Collection) -> None:
    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 3.6
    sun.color = (1.0, 0.89, 0.74)
    sun.angle = math.radians(4.5)
    sob = bpy.data.objects.new("Sun", sun)
    sob.rotation_euler = (math.radians(48), math.radians(12), math.radians(28))
    link(sob, col)
    sky = bpy.data.lights.new("Fill", "AREA")
    sky.energy = 180
    sky.size = 18
    sky.color = (0.45, 0.62, 1.0)
    aob = bpy.data.objects.new("Fill", sky)
    aob.location = (8, -12, 16)
    aob.rotation_euler = (math.radians(70), 0, 0)
    link(aob, col)


def setup_cameras() -> None:
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 35
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    cam.location = (38, -42, 28)
    cam.rotation_euler = (math.radians(58), 0, math.radians(42))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam


def export_glb(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_yup=True,
        use_visible=True,
    )


def export_json(data: WorldData, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    spawn_z = height(0.0, -8.0)
    payload = {
        "name": "Devworld",
        "title": "源码岛",
        "up": "y",
        "waterLevel": 0.45,
        "spawn": {
            "x": 0.0,
            "y": round(spawn_z + 1.7, 3),
            "z": 8.0,
            "yaw": math.pi,
        },
        "player": {"radius": 0.38, "height": 1.7, "eye": 1.56, "speed": 6.2, "sprint": 9.4, "jump": 7.4},
        "colliders": data.colliders,
        "interactables": data.interactables,
        "districts": data.districts,
        "tokens": ["git", "debug", "api", "ci", "bloom"],
        "goal": "收集五枚令牌并在编译尖塔重新编译世界。",
    }
    # override spawn using glTF conversion of blender point (0, -8, spawn_z+1.7)
    payload["spawn"]["x"], payload["spawn"]["y"], payload["spawn"]["z"] = to_gltf(
        Vector((0.0, -8.0, spawn_z + 0.05))
    )
    payload["spawn"]["yaw"] = 0.0  # face +Z-ish toward plaza/spire
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"wrote {path} colliders={len(data.colliders)} marks={len(data.interactables)}")


def render_preview(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.filepath = path
    scene.render.image_settings.file_format = "PNG"
    try:
        bpy.ops.render.render(write_still=True)
        print(f"wrote {path}")
    except Exception as exc:
        print(f"preview render skipped: {exc}")


def build_all() -> None:
    print(f"[devworld] out={OUT_DIR}", flush=True)
    scene = reset_scene()
    load_images()
    terrain_c = collection("Terrain")
    arch = collection("Architecture")
    props = collection("Props")
    lights = collection("Lights")
    cols = collection("Colliders")
    mats = {
        "terrain": make_mat("M_Terrain", (0.25, 0.45, 0.32), 0.85, vertex_color=True),
        "water": make_mat("M_Water", (0.08, 0.22, 0.38), 0.12, metallic=0.18, emission=(0.05, 0.16, 0.28), emission_strength=0.15),
        "cobble": make_mat("M_Cobble", (0.48, 0.46, 0.42), 0.72, image="cobble"),
        "plaster": make_mat("M_Plaster", (0.82, 0.78, 0.72), 0.62, image="plaster"),
        "roof": make_mat("M_Roof", (0.12, 0.38, 0.4), 0.55, image="roof"),
        "metal": make_mat("M_Metal", (0.22, 0.26, 0.3), 0.32, metallic=0.72, image="metal"),
        "wood": make_mat("M_Wood", (0.42, 0.28, 0.16), 0.7, image="wood"),
        "bark": make_mat("M_Bark", (0.28, 0.18, 0.12), 0.86, image="bark"),
        "leaves": make_mat("M_Leaves", (0.12, 0.42, 0.28), 0.7, image="leaves"),
        "rock": make_mat("M_Rock", (0.4, 0.4, 0.42), 0.8, image="rock"),
        "glow_cyan": make_mat("M_GlowCyan", (0.2, 0.9, 0.85), 0.25, emission=(0.25, 0.95, 0.9), emission_strength=6.0),
        "glow_amber": make_mat("M_GlowAmber", (1.0, 0.72, 0.25), 0.3, emission=(1.0, 0.7, 0.2), emission_strength=5.5),
        "glow_magenta": make_mat("M_GlowMag", (0.9, 0.25, 0.75), 0.3, emission=(0.9, 0.2, 0.7), emission_strength=4.5),
        "collider": make_mat("M_Collider", (1, 0, 1), 1.0),
    }
    data = WorldData()
    build_terrain(terrain_c, mats)
    build_water(terrain_c, mats)
    build_paths(arch, mats, data)
    build_plaza(arch, props, mats, data)
    build_git(arch, props, mats, data)
    build_marsh(arch, props, mats, data)
    build_harbor(arch, props, mats, data)
    build_factory(col=arch, props=props, mats=mats, data=data)
    build_peak(col=arch, props=props, mats=mats, data=data)
    build_grove(col=arch, props=props, mats=mats, data=data)
    populate_trees_and_lamps(arch, props, mats, data)
    build_ring_colliders(cols, mats, data)
    hide_colliders(cols)
    setup_lights(lights)
    setup_cameras()
    bpy.context.view_layer.update()
    data.colliders = []
    for ob in bpy.data.objects:
        if ob.name.startswith("COL_"):
            data.collider(ob)
            ob.hide_set(True)
            ob.hide_render = True
            ob.visible_camera = False
    export_glb(os.path.join(MODEL_DIR, "devworld.glb"))
    export_json(data, os.path.join(DATA_DIR, "world.json"))
    if "--preview" in _argv_after_dash():
        render_preview(os.path.join(PREVIEW_DIR, "world_iso.png"))
    print("[devworld] done", flush=True)


if __name__ == "__main__":
    build_all()
