#!/usr/bin/env python3
"""Build and render realistic human body models with Blender + MB-Lab.

Run via scripts/run_generate.sh so the MB-Lab add-on is on Blender's path:

    ./scripts/run_generate.sh
    ./scripts/run_generate.sh --preview --only caucasian_male_adult
"""

from __future__ import annotations

import math
import os
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output"
RENDER_DIR = OUTPUT / "renders"
BLEND_DIR = OUTPUT / "blend"
MBLAB_POSES = Path.home() / "tools/MB-Lab/data/poses"

CHAR_SPACING = 1.35


@dataclass
class CharacterSpec:
    key: str
    title: str
    template: str
    preset: str
    gender: str
    age: float = 0.0
    mass: float = 0.0
    tone: float = 0.0
    seed: int = 1
    pose: str = "standing_symmetric.json"
    shirt: tuple[float, float, float, float] = (0.18, 0.22, 0.28, 1.0)
    shorts: tuple[float, float, float, float] = (0.10, 0.10, 0.12, 1.0)
    hair: tuple[float, float, float, float] = (0.04, 0.03, 0.02, 1.0)
    randomize: bool = True


CHARACTERS: list[CharacterSpec] = [
    CharacterSpec(
        key="caucasian_male_adult",
        title="Adult Caucasian male, athletic",
        template="m_ca01",
        preset="type_athletic",
        gender="male",
        age=0.04,
        mass=0.12,
        tone=0.32,
        seed=11,
        shirt=(0.16, 0.20, 0.26, 1.0),
        hair=(0.09, 0.06, 0.04, 1.0),
    ),
    CharacterSpec(
        key="caucasian_female_adult",
        title="Adult Caucasian female, average",
        template="f_ca01",
        preset="type_common01",
        gender="female",
        age=0.02,
        mass=0.02,
        tone=0.08,
        seed=21,
        shirt=(0.28, 0.18, 0.18, 1.0),
        hair=(0.22, 0.12, 0.05, 1.0),
    ),
    CharacterSpec(
        key="asian_male_adult",
        title="Adult Asian male, average",
        template="m_as01",
        preset="type_average01",
        gender="male",
        age=0.0,
        mass=0.05,
        tone=0.12,
        seed=31,
        shirt=(0.14, 0.22, 0.28, 1.0),
        hair=(0.03, 0.03, 0.03, 1.0),
    ),
    CharacterSpec(
        key="asian_female_adult",
        title="Adult Asian female, slender",
        template="f_as01",
        preset="type_slender01",
        gender="female",
        age=-0.05,
        mass=-0.08,
        tone=0.04,
        seed=41,
        shirt=(0.22, 0.20, 0.28, 1.0),
        hair=(0.02, 0.02, 0.02, 1.0),
    ),
    CharacterSpec(
        key="afro_male_adult",
        title="Adult Afro male, athletic",
        template="m_af01",
        preset="type_athletic",
        gender="male",
        age=0.06,
        mass=0.18,
        tone=0.36,
        seed=51,
        shirt=(0.12, 0.14, 0.12, 1.0),
        hair=(0.025, 0.02, 0.015, 1.0),
    ),
    CharacterSpec(
        key="afro_female_adult",
        title="Adult Afro female, average",
        template="f_af01",
        preset="type_common02",
        gender="female",
        age=0.0,
        mass=0.06,
        tone=0.10,
        seed=61,
        shirt=(0.32, 0.18, 0.12, 1.0),
        hair=(0.03, 0.02, 0.015, 1.0),
    ),
    CharacterSpec(
        key="latino_male_mature",
        title="Mature Latino male, heavier build",
        template="m_la01",
        preset="type_heavybody",
        gender="male",
        age=0.42,
        mass=0.28,
        tone=-0.04,
        seed=71,
        pose="standing_old_people.json",
        shirt=(0.20, 0.16, 0.12, 1.0),
        hair=(0.12, 0.10, 0.09, 1.0),
    ),
    CharacterSpec(
        key="latino_female_young",
        title="Young Latino female, common build",
        template="f_la01",
        preset="type_common03",
        gender="female",
        age=-0.32,
        mass=-0.02,
        tone=0.06,
        seed=81,
        shirt=(0.18, 0.24, 0.22, 1.0),
        hair=(0.05, 0.03, 0.02, 1.0),
    ),
]


def log(msg: str) -> None:
    print(f"[humans] {msg}", flush=True)


def parse_args(argv: Sequence[str]) -> dict:
    preview = "--preview" in argv
    only = None
    if "--only" in argv:
        idx = argv.index("--only")
        if idx + 1 < len(argv):
            only = argv[idx + 1]
    samples = 24 if preview else 72
    if "--samples" in argv:
        idx = argv.index("--samples")
        samples = int(argv[idx + 1])
    return {
        "preview": preview,
        "only": only,
        "samples": samples,
    }


def enable_mblab() -> None:
    import addon_utils

    addon_dir = Path.home() / ".config/blender/4.2/scripts/addons"
    if str(addon_dir) not in sys.path:
        sys.path.insert(0, str(addon_dir))
    try:
        bpy.ops.preferences.addon_enable(module="MBLab")
    except Exception as exc:
        log(f"addon_enable failed ({exc}), trying addon_utils")
        addon_utils.enable("MBLab", default_set=True, persistent=True)
    if "MBLab" not in bpy.context.preferences.addons:
        raise RuntimeError("Failed to enable MB-Lab add-on (module MBLab)")
    log("MB-Lab enabled")


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.armatures, bpy.data.cameras, bpy.data.lights, bpy.data.curves):
        for item in list(block):
            block.remove(item)


def set_socket(node, names: Iterable[str], value) -> None:
    for name in names:
        sock = node.inputs.get(name)
        if sock is not None:
            sock.default_value = value
            return


def principled(mat_name: str):
    mat = bpy.data.materials.new(mat_name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    return mat, bsdf


def world_bounds(obj) -> tuple[Vector, Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    coords = [eval_obj.matrix_world @ Vector(corner) for corner in eval_obj.bound_box]
    xs, ys, zs = zip(*coords)
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def body_height_range(obj) -> tuple[float, float]:
    lo, hi = world_bounds(obj)
    return lo.z, hi.z


def ensure_object_mode() -> None:
    obj = bpy.context.object
    if obj is not None and obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    elif bpy.context.mode != "OBJECT":
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass


def deselect_all() -> None:
    ensure_object_mode()
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)


def set_active(obj) -> None:
    ensure_object_mode()
    deselect_all()
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def find_body_and_armature(prefix: str):
    meshes = []
    armatures = []
    for obj in bpy.data.objects:
        if not (obj.name.startswith(prefix) or prefix in obj.name):
            continue
        if obj.type == "MESH":
            meshes.append(obj)
        elif obj.type == "ARMATURE":
            armatures.append(obj)
    body = max(meshes, key=lambda o: len(o.data.vertices)) if meshes else None
    armature = armatures[0] if armatures else None
    if body is None:
        all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        body = max(all_meshes, key=lambda o: len(o.data.vertices)) if all_meshes else None
    if armature is None:
        all_arm = [o for o in bpy.data.objects if o.type == "ARMATURE"]
        armature = all_arm[-1] if all_arm else None
    return body, armature


def create_character(spec: CharacterSpec):
    import MBLab

    scn = bpy.context.scene
    scn.mblab_character_name = spec.template
    scn.mblab_use_ik = False
    scn.mblab_use_muscle = False
    scn.mblab_use_cycles = True
    scn.mblab_use_eevee = False
    scn.mblab_use_lamps = False
    scn.mblab_remove_all_modifiers = False
    scn.mblab_final_prefix = spec.key + "_"

    random.seed(spec.seed)
    try:
        import numpy as np

        np.random.seed(spec.seed)
    except Exception:
        pass

    log(f"Creating {spec.key} from template {spec.template}")
    bpy.ops.mbast.init_character()

    humanoid = MBLab.mblab_humanoid
    obj = humanoid.get_object()
    if obj is None:
        raise RuntimeError(f"MB-Lab did not create a body for {spec.key}")

    set_active(obj)

    if spec.preset:
        try:
            obj.preset = spec.preset
            log(f"  preset {spec.preset}")
        except Exception as exc:
            log(f"  preset {spec.preset} skipped: {exc}")

    if spec.randomize:
        scn.mblab_random_engine = "RE"
        scn.mblab_preserve_body = True
        scn.mblab_preserve_mass = True
        scn.mblab_preserve_tone = True
        scn.mblab_preserve_height = True
        scn.mblab_preserve_face = False
        scn.mblab_preserve_phenotype = True
        scn.mblab_preserve_fantasy = True
        bpy.ops.mbast.character_generator()
        log("  realistic face variation applied")

    obj.character_age = spec.age
    obj.character_mass = spec.mass
    obj.character_tone = spec.tone
    humanoid.update_character(mode="update_all")
    humanoid.update_materials()

    armature = humanoid.get_armature()
    if armature is not None:
        try:
            armature.rest_pose = "a-pose"
            log("  rest pose a-pose")
        except Exception as exc:
            log(f"  rest pose skipped: {exc}")

    bpy.ops.mbast.finalize_character()
    log(f"  finalized {spec.key}")

    body, armature = find_body_and_armature(spec.key)
    if body is None:
        raise RuntimeError(f"Could not find finalized body for {spec.key}")
    return body, armature


def evaluated_base_mesh(obj):
    hidden = []
    for mod in obj.modifiers:
        if mod.type in {"SUBSURF", "DISPLACE", "CORRECTIVE_SMOOTH"}:
            hidden.append((mod, mod.show_viewport))
            mod.show_viewport = False
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(eval_obj)
    for mod, state in hidden:
        mod.show_viewport = state
    return mesh


def cloth_material(name: str, color):
    mat, bsdf = principled(name)
    set_socket(bsdf, ("Base Color",), color)
    set_socket(bsdf, ("Roughness",), 0.58)
    set_socket(bsdf, ("Specular IOR Level", "Specular"), 0.16)
    set_socket(bsdf, ("Sheen Weight", "Sheen"), 0.4)
    set_socket(bsdf, ("Sheen Roughness",), 0.4)
    set_socket(bsdf, ("Coat Weight", "Clearcoat"), 0.03)
    noise = mat.node_tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 90.0
    noise.inputs["Detail"].default_value = 6.0
    bump = mat.node_tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.04
    mat.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    if "Normal" in bsdf.inputs:
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def apply_object_modifiers(obj) -> None:
    set_active(obj)
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            obj.modifiers.remove(mod)


def bisect_z_slab(mesh, matrix, zmin: float, zmax: float, xmax: float | None) -> None:
    import bmesh

    inv = matrix.inverted()
    z_axis = (inv.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
    x_axis = (inv.to_3x3() @ Vector((1.0, 0.0, 0.0))).normalized()
    origin = matrix.translation

    bm = bmesh.new()
    bm.from_mesh(mesh)

    def geom():
        return list(bm.verts) + list(bm.edges) + list(bm.faces)

    bmesh.ops.bisect_plane(
        bm,
        geom=geom(),
        dist=1e-4,
        plane_co=inv @ Vector((origin.x, origin.y, zmin)),
        plane_no=z_axis,
        clear_inner=True,
    )
    bmesh.ops.bisect_plane(
        bm,
        geom=geom(),
        dist=1e-4,
        plane_co=inv @ Vector((origin.x, origin.y, zmax)),
        plane_no=z_axis,
        clear_outer=True,
    )
    if xmax is not None:
        bmesh.ops.bisect_plane(
            bm,
            geom=geom(),
            dist=1e-4,
            plane_co=inv @ Vector((origin.x + xmax, origin.y, (zmin + zmax) * 0.5)),
            plane_no=x_axis,
            clear_outer=True,
        )
        bmesh.ops.bisect_plane(
            bm,
            geom=geom(),
            dist=1e-4,
            plane_co=inv @ Vector((origin.x - xmax, origin.y, (zmin + zmax) * 0.5)),
            plane_no=x_axis,
            clear_inner=True,
        )
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(mesh)
    bm.free()


def add_garment(body, name: str, zmin: float, zmax: float, color, inflate: float, sleeve_limit: float | None):
    # Kept for compatibility; clothing is painted onto the body mesh instead.
    return None


def paint_body_clothing(body, spec: CharacterSpec):
    """Assign athletic-wear materials on torso/pelvis faces so coverage cannot tear."""
    zmin, zmax = body_height_range(body)
    height = max(zmax - zmin, 0.01)
    shorts_lo = zmin + height * 0.47
    shorts_hi = zmin + height * 0.62
    shirt_lo = zmin + height * 0.56
    shirt_hi = zmin + height * 0.81

    shirt_mat = cloth_material(f"{spec.key}_shirt_mat", spec.shirt)
    shorts_mat = cloth_material(f"{spec.key}_shorts_mat", spec.shorts)
    shirt_idx = len(body.data.materials)
    body.data.materials.append(shirt_mat)
    shorts_idx = len(body.data.materials)
    body.data.materials.append(shorts_mat)

    # Do not override eye / tooth / nail slots.
    skip_names = ("eye", "iris", "sclera", "teeth", "tooth", "nail", "tongue", "lash")
    skip = set()
    for i, mat in enumerate(body.data.materials):
        name = (mat.name if mat else "").lower()
        if any(token in name for token in skip_names):
            skip.add(i)

    cx = (world_bounds(body)[0].x + world_bounds(body)[1].x) * 0.5
    mesh = body.data
    for poly in mesh.polygons:
        if poly.material_index in skip:
            continue
        center = body.matrix_world @ poly.center
        if shorts_lo <= center.z <= shorts_hi and abs(center.x - cx) < 0.23:
            poly.material_index = shorts_idx
        elif shirt_lo <= center.z <= shirt_hi and abs(center.x - cx) < 0.28:
            poly.material_index = shirt_idx


def add_short_hair(body, name: str, color):
    return None


def apply_pose(armature, spec: CharacterSpec):
    import MBLab

    if armature is None:
        return
    pose_dir = MBLAB_POSES / f"{spec.gender}_poses"
    pose_path = pose_dir / spec.pose
    if not pose_path.exists():
        pose_path = pose_dir / "standing_symmetric.json"
    if not pose_path.exists():
        log("  no pose file found")
        return
    set_active(armature)
    ok = MBLab.mblab_retarget.load_pose(str(pose_path), target_armature=armature, use_retarget=True)
    bpy.context.view_layer.update()
    ensure_object_mode()
    log(f"  pose {pose_path.name}: {ok}")


def dress_character(body, spec: CharacterSpec):
    paint_body_clothing(body, spec)
    return []


def fix_eye_shaders() -> None:
    """Replace missing-texture magenta in eye shaders with a brown iris."""
    for mat in bpy.data.materials:
        if not mat or not mat.use_nodes:
            continue
        name = mat.name.lower()
        related = any(token in name for token in ("eye", "iris", "sclera", "cornea"))
        for node in mat.node_tree.nodes:
            for ident in ("Base Color", "Color", "Emission Color"):
                sock = node.inputs.get(ident) if hasattr(node, "inputs") else None
                if sock is None or not hasattr(sock, "default_value"):
                    continue
                try:
                    r, g, b = sock.default_value[0], sock.default_value[1], sock.default_value[2]
                except Exception:
                    continue
                magenta = r > 0.45 and b > 0.45 and g < 0.28
                if magenta or (related and node.type in {"BSDF_PRINCIPLED", "EMISSION", "BSDF_GLASS"}):
                    if magenta:
                        sock.default_value = (0.20, 0.11, 0.06, 1.0)


def nod_head_down(armature) -> None:
    if armature is None:
        return
    ensure_object_mode()
    set_active(armature)
    try:
        bpy.ops.object.mode_set(mode="POSE")
        for name, degrees in (("neck", 10.0), ("head", 16.0)):
            bone = armature.pose.bones.get(name)
            if bone is None:
                continue
            bone.rotation_mode = "XYZ"
            bone.rotation_euler[0] += math.radians(degrees)
        bpy.ops.object.mode_set(mode="OBJECT")
        log("  nodded head down")
    except Exception as exc:
        log(f"  head nod skipped: {exc}")
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass


def move_character(objects: Sequence, x: float):
    roots = [o for o in objects if o.parent is None]
    for obj in roots:
        obj.location.x += x


def collect_character_objects(body, armature, extras) -> list:
    objs = [body]
    if armature:
        objs.append(armature)
    objs.extend(extras)
    seen = set()
    out = []
    for obj in objs:
        if obj.name not in seen:
            seen.add(obj.name)
            out.append(obj)
    return out


def make_collection(name: str, objects: Sequence):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    for obj in objects:
        for c in list(obj.users_collection):
            c.objects.unlink(obj)
        coll.objects.link(obj)
    return coll


def build_studio():
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "studio_floor"
    bpy.ops.object.shade_smooth()
    mat, bsdf = principled("studio_floor_mat")
    set_socket(bsdf, ("Base Color",), (0.18, 0.18, 0.19, 1.0))
    set_socket(bsdf, ("Roughness",), 0.55)
    floor.data.materials.append(mat)

    bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 7.0, 4))
    backdrop = bpy.context.object
    backdrop.name = "studio_backdrop"
    backdrop.rotation_euler[0] = math.radians(90)
    mat2, bsdf2 = principled("studio_backdrop_mat")
    set_socket(bsdf2, ("Base Color",), (0.55, 0.56, 0.58, 1.0))
    set_socket(bsdf2, ("Roughness",), 1.0)
    backdrop.data.materials.append(mat2)

    def add_area(name, loc, rot, energy, size, color):
        bpy.ops.object.light_add(type="AREA", location=loc)
        lamp = bpy.context.object
        lamp.name = name
        lamp.rotation_euler = rot
        lamp.data.energy = energy
        lamp.data.size = size
        lamp.data.color = color
        lamp.data.shape = "RECTANGLE"
        lamp.data.size_y = size * 0.75
        lamp.data.spread = math.radians(150)
        return lamp

    # MB-Lab figures face -Y, so the camera and key light live on that side.
    add_area("key_light", (2.2, -3.4, 2.8), (math.radians(65), 0, math.radians(35)), 4200, 2.8, (1.0, 0.97, 0.92))
    add_area("fill_light", (-3.2, -2.6, 1.9), (math.radians(70), 0, math.radians(-40)), 1600, 3.6, (0.86, 0.91, 1.0))
    add_area("rim_light", (-0.4, 3.4, 2.6), (math.radians(55), 0, math.radians(180)), 2200, 2.0, (1.0, 0.98, 1.0))
    add_area("top_light", (0.0, -0.6, 4.2), (math.radians(0), 0, 0), 900, 3.0, (1.0, 0.98, 0.95))

    world = bpy.data.worlds.new("studio_world")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.22, 0.23, 0.25, 1.0)
    bg.inputs[1].default_value = 1.15
    return floor


def add_camera(name: str, location, look_at) -> bpy.types.Object:
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = 85
    cam_data.dof.use_dof = True
    cam_data.dof.aperture_fstop = 2.8
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = location
    direction = Vector(look_at) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    empty = bpy.data.objects.new(name + "_target", None)
    empty.location = look_at
    bpy.context.collection.objects.link(empty)
    cam_data.dof.focus_object = empty
    return cam


def configure_cycles(samples: int, preview: bool) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_min_samples = 16 if not preview else 4
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.denoising_use_gpu = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Filmic"
    scene.view_settings.look = "Medium Contrast"
    scene.view_settings.exposure = 0.85
    try:
        scene.cycles.max_bounces = 8
        scene.cycles.diffuse_bounces = 3
        scene.cycles.glossy_bounces = 3
        scene.cycles.transmission_bounces = 6
        scene.cycles.volume_bounces = 0
        scene.cycles.caustics_reflective = False
        scene.cycles.caustics_refractive = False
    except Exception:
        pass
    prefs = bpy.context.preferences.addons.get("cycles")
    if prefs:
        prefs.preferences.compute_device_type = "NONE"


def hide_collections_except(keep: set[str]) -> None:
    for coll in bpy.data.collections:
        hide = coll.name not in keep and not coll.name.startswith("studio")
        coll.hide_render = hide
        coll.hide_viewport = hide


def show_all_character_collections() -> None:
    for coll in bpy.data.collections:
        coll.hide_render = False
        coll.hide_viewport = False


def character_look_at(body) -> Vector:
    lo, hi = world_bounds(body)
    return Vector(((lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5, lo.z + (hi.z - lo.z) * 0.55))


def render_view(filepath: Path, camera, resolution: tuple[int, int]) -> None:
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = str(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    log(f"Rendering {filepath.name} ({resolution[0]}x{resolution[1]})")
    bpy.ops.render.render(write_still=True)


def lower_subsurf():
    for obj in bpy.data.objects:
        for mod in obj.modifiers:
            if mod.type == "SUBSURF":
                mod.levels = 1
                mod.render_levels = 2


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parse_args(argv)
    specs = CHARACTERS
    if args["only"]:
        specs = [c for c in CHARACTERS if c.key == args["only"]]
        if not specs:
            raise SystemExit(f"Unknown character key: {args['only']}")

    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    BLEND_DIR.mkdir(parents=True, exist_ok=True)

    enable_mblab()
    clear_scene()
    build_studio()
    configure_cycles(args["samples"], args["preview"])
    res_full = (720, 1080) if args["preview"] else (1080, 1620)
    res_port = (720, 900) if args["preview"] else (1080, 1350)
    res_gal = (1280, 720) if args["preview"] else (1920, 1080)

    built = []
    for i, spec in enumerate(specs):
        body, armature = create_character(spec)
        extras = dress_character(body, spec)
        apply_pose(armature, spec)
        nod_head_down(armature)
        fix_eye_shaders()
        ensure_object_mode()
        objs = collect_character_objects(body, armature, extras)
        x = (i - (len(specs) - 1) / 2) * CHAR_SPACING
        move_character(objs, x)
        coll = make_collection(spec.key, objs)
        built.append((spec, body, armature, coll))
        log(f"Placed {spec.key} at x={x:.2f}")

    lower_subsurf()

    for spec, body, armature, coll in built:
        hide_collections_except({coll.name, "studio_floor", "studio_backdrop"})
        look = character_look_at(body)
        lo, hi = world_bounds(body)
        height = max(hi.z - lo.z, 0.1)
        dist = max(2.6, height * 2.05)
        cam_full = add_camera(
            f"cam_full_{spec.key}",
            (look.x + 0.10, look.y - dist, lo.z + height * 0.52),
            Vector((look.x, look.y, lo.z + height * 0.50)),
        )
        cam_full.data.lens = 55
        cam_full.data.dof.use_dof = False
        render_view(RENDER_DIR / f"{spec.key}_fullbody.png", cam_full, res_full)

        head = Vector((look.x, look.y, hi.z - height * 0.12))
        cam_port = add_camera(
            f"cam_port_{spec.key}",
            (head.x + 0.05, head.y - 1.25, head.z),
            head,
        )
        cam_port.data.lens = 85
        cam_port.data.dof.use_dof = False
        render_view(RENDER_DIR / f"{spec.key}_portrait.png", cam_port, res_port)

    if len(built) > 1:
        show_all_character_collections()
        bodies = [b for _, b, _, _ in built]
        xs = [character_look_at(b).x for b in bodies]
        zs = [world_bounds(b)[1].z for b in bodies]
        center = Vector((sum(xs) / len(xs), 0.0, max(zs) * 0.45))
        span = max(xs) - min(xs) + 1.8
        cam_gal = add_camera("cam_gallery", (center.x, -span * 1.15, center.z + 0.2), center)
        cam_gal.data.lens = 50
        render_view(RENDER_DIR / "gallery_full_lineup.png", cam_gal, res_gal)

    blend_path = BLEND_DIR / ("humans_preview.blend" if args["preview"] else "realistic_humans.blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    log(f"Saved {blend_path}")
    log("Done.")


if __name__ == "__main__":
    main()
