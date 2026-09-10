#!/usr/bin/env python3
"""Generate a gallery of clothed adult human characters in Blender + MPFB2.

All characters are adults (MakeHuman age >= 0.5, i.e. young / middle / old).
Bodies are fully clothed using MakeHuman system outfits (CC0).
"""
from __future__ import annotations

import argparse
import importlib
import math
import os
import sys
from typing import Any

import bpy
from mathutils import Matrix, Vector


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT_MODELS = os.path.join(ROOT, "human_models")
OUT_RENDERS = os.path.join(ROOT, "renders")
HDRI = os.environ.get(
    "STUDIO_HDRI",
    os.path.expanduser("~/tools/hdris/studio_small_09_1k.hdr"),
)


def dynamic_import(absolute_package_str: str, key: str):
    for amod in sys.modules:
        if amod.endswith(absolute_package_str):
            mod = importlib.import_module(amod)
            if not hasattr(mod, key):
                raise AttributeError(f"Module {amod} does not have attribute {key}")
            return getattr(mod, key)
    raise ValueError(f"No module found with name ending in {absolute_package_str}")


HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")


# MakeHuman age 0.5 = young adult (~25). Values below 0.5 blend toward child.
# Keep every preset at or above 0.5.
CHARACTERS: list[dict[str, Any]] = [
    {
        "id": "young_east_asian_woman",
        "title": "Young East Asian woman",
        "macro": {
            "gender": 0.0,
            "age": 0.52,
            "muscle": 0.42,
            "weight": 0.46,
            "height": 0.52,
            "proportions": 0.58,
            "cupsize": 0.42,
            "firmness": 0.55,
            "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0},
        },
        "details": {
            "head-oval": 0.45,
            "l-eye-epicanthus-in": 0.35,
            "r-eye-epicanthus-in": 0.35,
            "nose-scale-horiz-decr": 0.25,
            "nose-point-up": 0.15,
            "chin-width-decr": 0.2,
        },
        "skin": "young_asian_female.mhmat",
        "hair": "long01.mhclo",
        "brow": "eyebrow003.mhclo",
        "lash": "eyelashes01.mhclo",
        "outfit": "female_casualsuit01.mhclo",
        "shoes": "shoes01.mhclo",
    },
    {
        "id": "young_caucasian_man",
        "title": "Young Caucasian man",
        "macro": {
            "gender": 1.0,
            "age": 0.53,
            "muscle": 0.58,
            "weight": 0.50,
            "height": 0.64,
            "proportions": 0.55,
            "cupsize": 0.3,
            "firmness": 0.4,
            "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
        },
        "details": {
            "head-rectangular": 0.3,
            "chin-prominent-incr": 0.35,
            "nose-scale-vert-incr": 0.2,
        },
        "skin": "young_caucasian_male.mhmat",
        "hair": "short02.mhclo",
        "brow": "eyebrow008.mhclo",
        "lash": "eyelashes02.mhclo",
        "outfit": "male_casualsuit01.mhclo",
        "shoes": "shoes04.mhclo",
    },
    {
        "id": "young_african_woman",
        "title": "Young African woman",
        "macro": {
            "gender": 0.0,
            "age": 0.51,
            "muscle": 0.62,
            "weight": 0.52,
            "height": 0.58,
            "proportions": 0.60,
            "cupsize": 0.55,
            "firmness": 0.58,
            "race": {"asian": 0.0, "caucasian": 0.0, "african": 1.0},
        },
        "details": {
            "head-round": 0.25,
            "nose-width1-incr": 0.4,
            "nose-flaring-incr": 0.3,
            "mouth-scale-horiz-incr": 0.25,
            "l-eye-scale-incr": 0.15,
            "r-eye-scale-incr": 0.15,
        },
        "skin": "young_african_female.mhmat",
        "hair": "afro01.mhclo",
        "brow": "eyebrow006.mhclo",
        "lash": "eyelashes03.mhclo",
        "outfit": "female_sportsuit01.mhclo",
        "shoes": "shoes02.mhclo",
    },
    {
        "id": "young_african_man",
        "title": "Young African man",
        "macro": {
            "gender": 1.0,
            "age": 0.54,
            "muscle": 0.78,
            "weight": 0.56,
            "height": 0.70,
            "proportions": 0.62,
            "cupsize": 0.3,
            "firmness": 0.4,
            "race": {"asian": 0.0, "caucasian": 0.0, "african": 1.0},
        },
        "details": {
            "head-square": 0.3,
            "chin-width-incr": 0.25,
            "nose-width2-incr": 0.45,
            "nose-flaring-incr": 0.25,
            "mouth-scale-horiz-incr": 0.2,
        },
        "skin": "young_african_male.mhmat",
        "hair": "short04.mhclo",
        "brow": "eyebrow010.mhclo",
        "lash": "eyelashes02.mhclo",
        "outfit": "male_worksuit01.mhclo",
        "shoes": "shoes05.mhclo",
    },
    {
        "id": "middle_age_east_asian_man",
        "title": "Middle-aged East Asian man",
        "macro": {
            "gender": 1.0,
            "age": 0.72,
            "muscle": 0.40,
            "weight": 0.58,
            "height": 0.52,
            "proportions": 0.48,
            "cupsize": 0.3,
            "firmness": 0.35,
            "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0},
        },
        "details": {
            "head-round": 0.2,
            "head-fat-incr": 0.15,
            "l-eye-bag-incr": 0.25,
            "r-eye-bag-incr": 0.25,
            "nose-scale-horiz-decr": 0.15,
            "mouth-laugh-lines-out": 0.2,
        },
        "skin": "middleage_asian_male.mhmat",
        "hair": "short01.mhclo",
        "brow": "eyebrow007.mhclo",
        "lash": "eyelashes02.mhclo",
        "outfit": "male_elegantsuit01.mhclo",
        "shoes": "shoes03.mhclo",
    },
    {
        "id": "middle_age_caucasian_woman",
        "title": "Middle-aged Caucasian woman",
        "macro": {
            "gender": 0.0,
            "age": 0.70,
            "muscle": 0.38,
            "weight": 0.54,
            "height": 0.52,
            "proportions": 0.50,
            "cupsize": 0.48,
            "firmness": 0.40,
            "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
        },
        "details": {
            "head-oval": 0.3,
            "l-eye-bag-incr": 0.2,
            "r-eye-bag-incr": 0.2,
            "mouth-laugh-lines-out": 0.25,
            "nose-hump-incr": 0.15,
            "chin-height-decr": 0.1,
        },
        "skin": "middleage_caucasian_female.mhmat",
        "hair": "bob01.mhclo",
        "brow": "eyebrow004.mhclo",
        "lash": "eyelashes01.mhclo",
        "outfit": "female_elegantsuit01.mhclo",
        "shoes": "shoes01.mhclo",
    },
    {
        "id": "older_caucasian_man",
        "title": "Older Caucasian man",
        "macro": {
            "gender": 1.0,
            "age": 0.88,
            "muscle": 0.32,
            "weight": 0.55,
            "height": 0.54,
            "proportions": 0.42,
            "cupsize": 0.3,
            "firmness": 0.3,
            "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
        },
        "details": {
            "head-rectangular": 0.25,
            "head-age-incr": 0.45,
            "l-eye-bag-incr": 0.4,
            "r-eye-bag-incr": 0.4,
            "chin-prominent-incr": 0.2,
            "nose-hump-incr": 0.25,
            "mouth-laugh-lines-out": 0.35,
        },
        "skin": "old_caucasian_male.mhmat",
        "hair": "short03.mhclo",
        "brow": "eyebrow011.mhclo",
        "lash": "eyelashes04.mhclo",
        "outfit": "male_casualsuit03.mhclo",
        "shoes": "shoes04.mhclo",
    },
    {
        "id": "young_mixed_heritage_woman",
        "title": "Young mixed-heritage woman",
        "macro": {
            "gender": 0.0,
            "age": 0.52,
            "muscle": 0.48,
            "weight": 0.50,
            "height": 0.56,
            "proportions": 0.57,
            "cupsize": 0.50,
            "firmness": 0.52,
            "race": {"asian": 0.15, "caucasian": 0.40, "african": 0.45},
        },
        "details": {
            "head-oval": 0.3,
            "nose-width1-incr": 0.2,
            "mouth-scale-horiz-incr": 0.15,
            "l-eye-scale-incr": 0.12,
            "r-eye-scale-incr": 0.12,
            "chin-width-decr": 0.1,
        },
        "skin": "young_african_female.mhmat",
        "hair": "braid01.mhclo",
        "brow": "eyebrow005.mhclo",
        "lash": "eyelashes03.mhclo",
        "outfit": "female_casualsuit02.mhclo",
        "shoes": "shoes02.mhclo",
    },
]


def require_asset(filename: str, subdir: str) -> str:
    path = AssetService.find_asset_absolute_path(filename, asset_subdir=subdir)
    if not path:
        raise FileNotFoundError(f"Missing {subdir}/{filename}. Install makehuman_system_assets.")
    return path


def character_root(basemesh: bpy.types.Object) -> bpy.types.Object:
    obj = basemesh
    while obj.parent:
        obj = obj.parent
    return obj


def character_objects(basemesh: bpy.types.Object) -> list[bpy.types.Object]:
    root = character_root(basemesh)
    return [root] + list(root.children_recursive)


def world_height(basemesh: bpy.types.Object) -> float:
    mins, maxs = bounds_of(character_objects(basemesh))
    return maxs[2] - mins[2]


def shade_smooth(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    mesh = obj.data
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    if hasattr(mesh, "use_auto_smooth"):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = math.radians(60)


def apply_face_details(basemesh: bpy.types.Object, details: dict[str, float]) -> None:
    for name, weight in details.items():
        if not weight:
            continue
        path = TargetService.target_full_path(name)
        if not path:
            print(f"    skip missing morph {name}", flush=True)
            continue
        TargetService.load_target(basemesh, path, weight=float(weight))


def rotate_bone_world(armature: bpy.types.Object, bone_name: str, axis: Vector, angle: float) -> None:
    pb = armature.pose.bones.get(bone_name)
    if pb is None:
        return
    head = pb.matrix.to_translation()
    rot = Matrix.Rotation(angle, 4, axis)
    trans = Matrix.Translation(head)
    pb.matrix = trans @ rot @ trans.inverted() @ pb.matrix


def relax_standing_pose(armature: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    # Bring A-pose arms slightly closer to the torso.
    rotate_bone_world(armature, "upperarm01.L", Vector((0, 1, 0)), math.radians(24))
    rotate_bone_world(armature, "upperarm01.R", Vector((0, 1, 0)), math.radians(-24))
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")


def tweak_hair_materials(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    name = obj.name.lower()
    if "hair" not in name and not any(tag in name for tag in ("long", "short", "bob", "afro", "braid", "ponytail")):
        # Still tweak if the datablock looks like hair cards
        if "hair" not in (obj.data.name.lower() if obj.data else ""):
            if not any(k in name for k in ("long01", "short01", "short02", "short03", "short04", "bob01", "bob02", "afro01", "braid01", "ponytail01")):
                return
    for mat in obj.data.materials:
        if mat is None:
            continue
        mat.blend_method = "HASHED"
        if hasattr(mat, "shadow_method"):
            mat.shadow_method = "HASHED"
        if not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                if "Roughness" in node.inputs:
                    node.inputs["Roughness"].default_value = max(float(node.inputs["Roughness"].default_value), 0.38)
                if "Specular IOR Level" in node.inputs:
                    node.inputs["Specular IOR Level"].default_value = 0.12
                elif "Specular" in node.inputs:
                    node.inputs["Specular"].default_value = 0.12


def create_character(spec: dict[str, Any], x: float) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    macro = TargetService.get_default_macro_info_dict()
    for key, value in spec["macro"].items():
        if key == "race":
            macro["race"] = dict(value)
        else:
            macro[key] = value

    basemesh = HumanService.create_human(macro_detail_dict=macro)
    basemesh.name = spec["id"]
    apply_face_details(basemesh, spec.get("details") or {})

    HumanService.set_character_skin(
        require_asset(spec["skin"], "skins"),
        basemesh,
        skin_type="ENHANCED_SSS",
    )

    rig = HumanService.add_builtin_rig(basemesh, "default")
    if rig:
        rig.name = spec["id"] + ".rig"

    assets = [
        ("eyes", "high-poly.mhclo", "Eyes"),
        ("eyebrows", spec["brow"], "Eyebrows"),
        ("eyelashes", spec["lash"], "Eyelashes"),
        ("tongue", "tongue01.mhclo", "Tongue"),
        ("teeth", "teeth_base.mhclo", "Teeth"),
        ("hair", spec["hair"], "Hair"),
        ("clothes", spec["outfit"], "Clothes"),
        ("clothes", spec["shoes"], "Clothes"),
    ]
    for subdir, fname, atype in assets:
        path = require_asset(fname, subdir)
        HumanService.add_mhclo_asset(path, basemesh, asset_type=atype, material_type="MAKESKIN")

    if rig:
        relax_standing_pose(rig)

    for obj in character_objects(basemesh):
        shade_smooth(obj)
        tweak_hair_materials(obj)

    root = character_root(basemesh)
    root.location.x = x
    bpy.context.view_layer.update()
    return basemesh


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.armatures):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def make_studio() -> None:
    # Seamless cyclorama from a subdivided grid.
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=12, y_subdivisions=18, size=18, location=(0, 1.5, 0))
    cyc = bpy.context.active_object
    cyc.name = "StudioCyc"
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for vert in cyc.data.vertices:
        # Local Y positive is toward the back of the studio.
        if vert.co.y > 1.8:
            lift = (vert.co.y - 1.8) * 1.15
            vert.co.z += lift
            vert.co.y = 1.8 + (vert.co.y - 1.8) * 0.15
    cyc.data.update()
    shade_smooth(cyc)

    mat = bpy.data.materials.new("StudioSurface")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.16, 0.165, 0.18, 1)
    bsdf.inputs["Roughness"].default_value = 0.62
    cyc.data.materials.append(mat)

    def area(name, loc, rot, energy, size, color):
        light_data = bpy.data.lights.new(name, type="AREA")
        light_data.energy = energy
        light_data.size = size
        light_data.color = color
        light_data.shape = "RECTANGLE"
        light_data.size_y = size * 1.4
        obj = bpy.data.objects.new(name, light_data)
        obj.location = loc
        obj.rotation_euler = rot
        bpy.context.collection.objects.link(obj)
        return obj

    area("KeyLight", (-2.0, -2.8, 2.5), (math.radians(58), 0, math.radians(-22)), 380, 1.8, (1.0, 0.96, 0.90))
    area("FillLight", (2.6, -1.6, 1.7), (math.radians(72), 0, math.radians(38)), 120, 2.4, (0.78, 0.86, 1.0))
    area("RimLight", (0.2, 2.4, 2.4), (math.radians(65), 0, math.radians(180)), 180, 1.4, (1.0, 0.98, 1.0))

    world = bpy.data.worlds.new("StudioWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = 0.28
    if os.path.isfile(HDRI):
        env = nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(HDRI)
        mapping = nodes.new("ShaderNodeMapping")
        texcoord = nodes.new("ShaderNodeTexCoord")
        links.new(texcoord.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], env.inputs["Vector"])
        links.new(env.outputs["Color"], background.inputs["Color"])
    else:
        background.inputs["Color"].default_value = (0.10, 0.11, 0.13, 1)
    links.new(background.outputs["Background"], output.inputs["Surface"])


def bounds_of(objects: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    bpy.context.view_layer.update()
    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], world[i])
                maxs[i] = max(maxs[i], world[i])
    return mins, maxs


def remove_cameras() -> None:
    for cam in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(cam, do_unlink=True)


def aim_camera(objects: list[bpy.types.Object], *, portrait: bool) -> bpy.types.Object:
    mins, maxs = bounds_of(objects)
    center = [(a + b) / 2 for a, b in zip(mins, maxs)]
    height = max(maxs[2] - mins[2], 1.4)
    cam_data = bpy.data.cameras.new("HumanCamera")
    cam_data.lens = 80 if portrait else 55
    cam_data.dof.use_dof = False
    cam = bpy.data.objects.new("HumanCamera", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    if portrait:
        look = (center[0], center[1], maxs[2] - height * 0.16)
        dist = max(1.55, height * 0.95)
        cam.location = (look[0] + dist * 0.32, look[1] - dist * 0.78, look[2] + 0.04)
    else:
        width = max(maxs[0] - mins[0], 0.8)
        cam_data.lens = 28 if width > 4.0 else 55
        look = (center[0], center[1], mins[2] + height * 0.50)
        fov = 2 * math.atan((36 / 2) / max(cam_data.lens, 1))
        dist = max((width * 0.58) / math.tan(fov / 2), height * 1.9, 2.8)
        cam.location = (look[0], look[1] - dist, look[2] + 0.18)

    direction = Vector(look) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def configure_cycles(scene: bpy.types.Scene, samples: int, res: tuple[int, int]) -> None:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.03
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.transmission_bounces = 8
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 4
    scene.cycles.volume_bounces = 0
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.2
    scene.render.threads_mode = "FIXED"
    scene.render.threads = max(1, os.cpu_count() or 4)


def set_character_visibility(keep_meshes: set[str], visible: bool) -> None:
    for obj in bpy.data.objects:
        if obj.type in {"CAMERA", "LIGHT"} or obj.name.startswith("Studio"):
            continue
        if obj.name in keep_meshes or any(obj.name.startswith(k + ".") for k in keep_meshes):
            obj.hide_render = not visible
            obj.hide_viewport = not visible
        elif obj.type in {"MESH", "ARMATURE"}:
            obj.hide_render = visible
            obj.hide_viewport = visible


def export_glb(basemesh: bpy.types.Object, path: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in character_objects(basemesh):
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = character_root(basemesh)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_animations=False,
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-render", action="store_true")
    parser.add_argument("--samples", type=int, default=40)
    parser.add_argument("--only", nargs="*", default=None)
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args(sys.argv)
    os.makedirs(OUT_MODELS, exist_ok=True)
    os.makedirs(OUT_RENDERS, exist_ok=True)

    specs = CHARACTERS
    if args.only:
        wanted = set(args.only)
        specs = [s for s in CHARACTERS if s["id"] in wanted]
        if not specs:
            raise SystemExit(f"No matching characters: {args.only}")

    clear_scene()
    make_studio()

    created: list[tuple[dict[str, Any], bpy.types.Object]] = []
    spacing = 1.4
    start_x = -spacing * (len(specs) - 1) / 2
    for i, spec in enumerate(specs):
        print(f"=== Creating {spec['id']} ===", flush=True)
        basemesh = create_character(spec, start_x + i * spacing)
        created.append((spec, basemesh))
        print(f"    world_height={world_height(basemesh):.3f}m verts={len(basemesh.data.vertices)}", flush=True)

    blend_path = os.path.join(OUT_MODELS, "realistic_humans_lineup.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"Saved {blend_path}", flush=True)

    for spec, basemesh in created:
        glb_path = os.path.join(OUT_MODELS, f"{spec['id']}.glb")
        export_glb(basemesh, glb_path)
        print(f"Exported {glb_path}", flush=True)

    if args.skip_render:
        print("Skipping renders")
        return

    scene = bpy.context.scene

    all_chars: list[bpy.types.Object] = []
    for _, mesh in created:
        all_chars.extend(character_objects(mesh))
    for obj in bpy.data.objects:
        if obj.type in {"MESH", "ARMATURE"} and not obj.name.startswith("Studio"):
            obj.hide_render = False
            obj.hide_viewport = False

    remove_cameras()
    configure_cycles(scene, args.samples, (1920, 1080))
    aim_camera(all_chars, portrait=False)
    scene.render.filepath = os.path.join(OUT_RENDERS, "lineup_fullbody.png")
    print("Rendering lineup...", flush=True)
    bpy.ops.render.render(write_still=True)

    for spec, mesh in created:
        keep = {o.name for o in character_objects(mesh)}
        for obj in bpy.data.objects:
            if obj.type in {"CAMERA", "LIGHT"} or obj.name.startswith("Studio"):
                continue
            hidden = obj.name not in keep
            obj.hide_render = hidden
            obj.hide_viewport = hidden

        remove_cameras()
        configure_cycles(scene, args.samples, (1080, 1440))
        aim_camera(character_objects(mesh), portrait=True)
        scene.render.filepath = os.path.join(OUT_RENDERS, f"{spec['id']}_portrait.png")
        print(f"Rendering {spec['id']} portrait...", flush=True)
        bpy.ops.render.render(write_still=True)

        remove_cameras()
        configure_cycles(scene, max(28, args.samples - 8), (900, 1600))
        aim_camera(character_objects(mesh), portrait=False)
        scene.render.filepath = os.path.join(OUT_RENDERS, f"{spec['id']}_fullbody.png")
        print(f"Rendering {spec['id']} full body...", flush=True)
        bpy.ops.render.render(write_still=True)

    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
