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
ObjectService = dynamic_import("mpfb.services.objectservice", "ObjectService")
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
            "height": 0.48,
            "proportions": 0.58,
            "cupsize": 0.42,
            "firmness": 0.55,
            "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0},
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
            "height": 0.62,
            "proportions": 0.55,
            "cupsize": 0.3,
            "firmness": 0.4,
            "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
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
            "height": 0.55,
            "proportions": 0.60,
            "cupsize": 0.55,
            "firmness": 0.58,
            "race": {"asian": 0.0, "caucasian": 0.0, "african": 1.0},
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
            "height": 0.68,
            "proportions": 0.62,
            "cupsize": 0.3,
            "firmness": 0.4,
            "race": {"asian": 0.0, "caucasian": 0.0, "african": 1.0},
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
            "height": 0.50,
            "proportions": 0.48,
            "cupsize": 0.3,
            "firmness": 0.35,
            "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0},
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
            "height": 0.50,
            "proportions": 0.50,
            "cupsize": 0.48,
            "firmness": 0.40,
            "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
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
            "height": 0.52,
            "proportions": 0.42,
            "cupsize": 0.3,
            "firmness": 0.3,
            "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0},
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
            "height": 0.54,
            "proportions": 0.57,
            "cupsize": 0.50,
            "firmness": 0.52,
            "race": {"asian": 0.15, "caucasian": 0.40, "african": 0.45},
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


def character_objects(basemesh: bpy.types.Object) -> list[bpy.types.Object]:
    objs = [basemesh]
    objs.extend(list(basemesh.children_recursive))
    return objs


def shade_smooth(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    mesh = obj.data
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    if hasattr(mesh, "use_auto_smooth"):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = math.radians(60)


def create_character(spec: dict[str, Any], x: float) -> bpy.types.Object:
    macro = TargetService.get_default_macro_info_dict()
    for key, value in spec["macro"].items():
        if key == "race":
            macro["race"] = dict(value)
        else:
            macro[key] = value

    basemesh = HumanService.create_human(macro_detail_dict=macro)
    basemesh.name = spec["id"]
    if spec["id"] + ".body" in bpy.data.objects:
        bpy.data.objects[spec["id"] + ".body"].name = spec["id"]

    HumanService.set_character_skin(
        require_asset(spec["skin"], "skins"),
        basemesh,
        skin_type="ENHANCED_SSS",
    )

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

    for obj in character_objects(basemesh):
        shade_smooth(obj)
        obj.pass_index = 1

    # Move the whole hierarchy after parenting is in place.
    basemesh.location.x = x
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
    # Seamless cyc backdrop
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 2.4, 0))
    wall = bpy.context.active_object
    wall.name = "StudioWall"
    wall.rotation_euler[0] = math.radians(90)

    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    floor = bpy.context.active_object
    floor.name = "StudioFloor"

    mat = bpy.data.materials.new("StudioSurface")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.18, 0.18, 0.20, 1)
    bsdf.inputs["Roughness"].default_value = 0.55
    wall.data.materials.append(mat)
    floor.data.materials.append(mat)

    # Key / fill / rim
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

    area("KeyLight", (-2.2, -2.6, 2.4), (math.radians(55), 0, math.radians(-25)), 450, 1.6, (1.0, 0.97, 0.94))
    area("FillLight", (2.4, -1.8, 1.6), (math.radians(70), 0, math.radians(35)), 160, 2.2, (0.85, 0.90, 1.0))
    area("RimLight", (0.4, 2.2, 2.2), (math.radians(70), 0, math.radians(180)), 220, 1.2, (1.0, 0.98, 1.0))

    world = bpy.data.worlds.new("StudioWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = 0.35
    if os.path.isfile(HDRI):
        env = nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(HDRI)
        mapping = nodes.new("ShaderNodeMapping")
        texcoord = nodes.new("ShaderNodeTexCoord")
        links.new(texcoord.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], env.inputs["Vector"])
        links.new(env.outputs["Color"], background.inputs["Color"])
    else:
        background.inputs["Color"].default_value = (0.12, 0.13, 0.15, 1)
    links.new(background.outputs["Output"], output.inputs["Surface"])


def bounds_of(objects: list[bpy.types.Object]) -> tuple[list[float], list[float]]:
    bpy.context.view_layer.update()
    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ __import__("mathutils").Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], world[i])
                maxs[i] = max(maxs[i], world[i])
    return mins, maxs


def aim_camera(objects: list[bpy.types.Object], *, portrait: bool) -> bpy.types.Object:
    mins, maxs = bounds_of(objects)
    center = [(a + b) / 2 for a, b in zip(mins, maxs)]
    height = maxs[2] - mins[2]
    width = max(maxs[0] - mins[0], 0.4)
    cam_data = bpy.data.cameras.new("HumanCamera")
    cam_data.lens = 85 if portrait else 50
    cam = bpy.data.objects.new("HumanCamera", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    if portrait:
        # 3/4 view, slightly above chest
        dist = max(2.15, height * 1.35)
        cam.location = (center[0] + dist * 0.42, center[1] - dist * 0.92, center[2] + height * 0.12)
        # Crop toward head/torso for a character portrait
        look = (center[0], center[1], mins[2] + height * 0.62)
    else:
        dist = max(3.2, height * 2.1 + width * 1.4)
        cam.location = (center[0] + 0.35, center[1] - dist, center[2] + 0.15)
        look = (center[0], center[1], mins[2] + height * 0.48)

    direction = __import__("mathutils").Vector(look) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam


def configure_cycles(scene: bpy.types.Scene, samples: int, res: tuple[int, int]) -> None:
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.04
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
    scene.view_settings.exposure = 0.15
    scene.render.threads_mode = "FIXED"
    scene.render.threads = max(1, os.cpu_count() or 4)
    scene.cycles.preview_samples = 16


def hide_except(keep: set[str]) -> None:
    for obj in bpy.data.objects:
        hide = obj.name not in keep and not obj.name.startswith("Studio") and obj.type not in {"CAMERA", "LIGHT"}
        if obj.name in {"HumanCamera", "KeyLight", "FillLight", "RimLight", "StudioWall", "StudioFloor"}:
            hide = False
        if obj.type in {"CAMERA", "LIGHT"}:
            hide = False
        if obj.name.startswith("Studio"):
            hide = False
        obj.hide_render = hide and obj.name not in keep
        obj.hide_viewport = obj.hide_render


def export_glb(basemesh: bpy.types.Object, path: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in character_objects(basemesh):
        obj.select_set(True)
        obj.hide_set(False)
    bpy.context.view_layer.objects.active = basemesh
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
    parser.add_argument("--samples", type=int, default=48)
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
    spacing = 1.35
    start_x = -spacing * (len(specs) - 1) / 2
    for i, spec in enumerate(specs):
        print(f"=== Creating {spec['id']} ===", flush=True)
        basemesh = create_character(spec, start_x + i * spacing)
        created.append((spec, basemesh))
        print(f"    height={basemesh.dimensions.z:.3f}m verts={len(basemesh.data.vertices)}", flush=True)

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
    configure_cycles(scene, args.samples, (1920, 1080))

    # Lineup
    all_chars = []
    for _, mesh in created:
        all_chars.extend(character_objects(mesh))
    for cam in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(cam, do_unlink=True)
    aim_camera(all_chars, portrait=False)
    scene.render.filepath = os.path.join(OUT_RENDERS, "lineup_fullbody.png")
    print("Rendering lineup...", flush=True)
    bpy.ops.render.render(write_still=True)

    # Individual portraits
    for spec, mesh in created:
        keep = {o.name for o in character_objects(mesh)}
        for obj in bpy.data.objects:
            if obj.type in {"MESH"} and obj.name not in keep and not obj.name.startswith("Studio"):
                obj.hide_render = True
            elif obj.name in keep:
                obj.hide_render = False
        for cam in [o for o in bpy.data.objects if o.type == "CAMERA"]:
            bpy.data.objects.remove(cam, do_unlink=True)
        configure_cycles(scene, args.samples, (1080, 1440))
        aim_camera(character_objects(mesh), portrait=True)
        scene.render.filepath = os.path.join(OUT_RENDERS, f"{spec['id']}_portrait.png")
        print(f"Rendering {spec['id']} portrait...", flush=True)
        bpy.ops.render.render(write_still=True)

        configure_cycles(scene, max(24, args.samples // 2), (900, 1600))
        for cam in [o for o in bpy.data.objects if o.type == "CAMERA"]:
            bpy.data.objects.remove(cam, do_unlink=True)
        aim_camera(character_objects(mesh), portrait=False)
        scene.render.filepath = os.path.join(OUT_RENDERS, f"{spec['id']}_fullbody.png")
        print(f"Rendering {spec['id']} full body...", flush=True)
        bpy.ops.render.render(write_still=True)

        for obj in bpy.data.objects:
            if obj.type == "MESH" and not obj.name.startswith("Studio"):
                obj.hide_render = False

    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
