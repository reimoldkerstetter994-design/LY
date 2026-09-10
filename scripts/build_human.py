"""根据角色 JSON 描述文件，用 MPFB 在 Blender 中生成写实人体模型，并渲染。

用法::

    blender -b --python scripts/build_human.py -- --spec characters/mei_lin.json \
        [--shots full,portrait] [--samples 160] [--scale 1.0] [--outdir renders] [--no-save]

角色 JSON 字段见 characters/README.md。
"""

import argparse
import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from mpfb_bridge import dynamic_import, ensure_mpfb_enabled  # noqa: E402
import poses  # noqa: E402
import studio  # noqa: E402

PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

# 默认镜头方案。JSON 中 "shots" 可覆盖任意字段。
DEFAULT_SHOTS = {
    "full": {"lens": 50.0, "azimuth": 18.0, "elevation": 2.0, "margin": 1.12, "fstop": 5.6,
             "width": 1200, "height": 1800},
    "portrait": {"lens": 105.0, "azimuth": 18.0, "elevation": 4.0, "frame_height": 0.46, "fstop": 2.8,
                 "width": 1400, "height": 1400},
    "three_quarter": {"lens": 70.0, "azimuth": 30.0, "elevation": 3.0, "frame_height": 1.0, "fstop": 4.0,
                      "width": 1200, "height": 1600, "anchor": "torso"},
}

# 写实皮肤的默认微调（在 MPFB “Enhanced SSS” 材质基础上）
DEFAULT_SKIN_SETTINGS = {
    "body": {"Roughness": 0.43, "Clearcoat": 0.06, "Clearcoat Roughness": 0.35,
             "Pore strength": 0.42, "Pore scale": 2600.0,
             "SSS strength": 0.32, "SSS radius scale": 0.12},
    "ears": {"Roughness": 0.42, "SSS strength": 0.6, "SSS radius scale": 0.2},
    "lips": {"Roughness": 0.3, "Clearcoat": 0.25, "Clearcoat Roughness": 0.25, "SSS strength": 0.45},
    "fingernails": {"Roughness": 0.18, "Clearcoat": 0.5, "Clearcoat Roughness": 0.15},
    "toenails": {"Roughness": 0.18, "Clearcoat": 0.5, "Clearcoat Roughness": 0.15},
}


# ----------------------------------------------------------------------------- 参数
def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build a realistic human with MPFB and render it.")
    parser.add_argument("--spec", required=True, help="角色 JSON 文件")
    parser.add_argument("--shots", default="full,portrait", help="要渲染的镜头，逗号分隔；'none' 只建模不渲染")
    parser.add_argument("--samples", type=int, default=160)
    parser.add_argument("--scale", type=float, default=1.0, help="分辨率倍率（0.5 = 快速预览）")
    parser.add_argument("--outdir", default=os.path.join(PROJECT_DIR, "renders"))
    parser.add_argument("--blend-dir", default=os.path.join(PROJECT_DIR, "output"))
    parser.add_argument("--no-save", action="store_true", help="不保存 .blend")
    parser.add_argument("--time-limit", type=float, default=0.0, help="每张图的渲染秒数上限（0 = 不限）")
    return parser.parse_args(argv)


def load_spec(path):
    with open(path, "r", encoding="utf-8") as fh:
        spec = json.load(fh)
    spec.setdefault("name", os.path.splitext(os.path.basename(path))[0])
    return spec


# ----------------------------------------------------------------------------- 建模
def _mhclo_uuid(asset_name, subdir):
    AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
    path = AssetService.find_asset_absolute_path(asset_name, asset_subdir=subdir)
    if not path:
        return None
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            if line.startswith("uuid "):
                return line.split(None, 1)[1].strip()
    return None


def _deep_merge(base, override):
    result = {k: dict(v) if isinstance(v, dict) else v for k, v in base.items()}
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key].update(value)
        else:
            result[key] = value
    return result


def spec_to_human_info(spec):
    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    TargetService = dynamic_import("mpfb.services.targetservice", "TargetService")

    info = HumanService._create_default_human_info_dict()  # pylint: disable=protected-access
    info["name"] = spec["name"]

    phenotype = TargetService.get_default_macro_info_dict()
    for key, value in spec.get("phenotype", {}).items():
        if key == "race":
            phenotype["race"].update(value)
        else:
            phenotype[key] = value
    info["phenotype"] = phenotype

    info["targets"] = [{"target": name, "value": value} for name, value in spec.get("targets", {}).items()]

    info["rig"] = spec.get("rig", "default")
    info["eyes"] = spec.get("eyes", "high-poly.mhclo")
    info["eyebrows"] = spec.get("eyebrows", "eyebrow001.mhclo")
    info["eyelashes"] = spec.get("eyelashes", "eyelashes01.mhclo")
    info["teeth"] = spec.get("teeth", "teeth_base.mhclo")
    info["tongue"] = spec.get("tongue", "tongue01.mhclo")
    info["hair"] = spec.get("hair", "")
    info["clothes"] = list(spec.get("clothes", []))

    info["skin_mhmat"] = spec["skin"]
    info["skin_material_type"] = "ENHANCED_SSS"
    info["skin_material_settings"] = _deep_merge(DEFAULT_SKIN_SETTINGS, spec.get("skin_settings"))
    info["eyes_material_type"] = "MAKESKIN"

    alternative_materials = dict(spec.get("alternative_materials", {}))
    eye_color = spec.get("eye_color")
    if eye_color:
        eye_uuid = _mhclo_uuid(info["eyes"], "eyes")
        if eye_uuid:
            alternative_materials[eye_uuid] = f"{eye_color}.mhmat"
    info["alternative_materials"] = alternative_materials

    return info


def apply_expression(basemesh, expression):
    """expression: {ARKit 面部单元名: 权重}，例如 {"mouthSmileLeft": 0.3}。需要 faceunits01 资源包。"""
    if not expression:
        return
    FaceService = dynamic_import("mpfb.services.faceservice", "FaceService")
    if not FaceService.is_faceunits01_installed():
        print("[build] 未安装 faceunits01，跳过表情")
        return
    FaceService.set_expression(basemesh, {k: float(v) for k, v in expression.items()})


def build_human(spec, subdiv_render_levels=2):
    HumanService = dynamic_import("mpfb.services.humanservice", "HumanService")
    ObjectService = dynamic_import("mpfb.services.objectservice", "ObjectService")

    human_info = spec_to_human_info(spec)
    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 1
    settings["material_instances"] = "ENHANCED"
    settings["load_clothes"] = True

    basemesh = HumanService.deserialize_from_dict(human_info, settings)
    armature = ObjectService.find_object_of_type_amongst_nearest_relatives(basemesh, "Skeleton")

    for modifier in basemesh.modifiers:
        if modifier.type == "SUBSURF":
            modifier.render_levels = subdiv_render_levels
            modifier.levels = 0
    return basemesh, armature


def _object_type(obj):
    GeneralObjectProperties = dynamic_import("mpfb.entities.objectproperties", "GeneralObjectProperties")
    try:
        return str(GeneralObjectProperties.get_value("object_type", entity_reference=obj) or "")
    except Exception:  # pylint: disable=broad-except
        return ""


def _asset_source(obj):
    GeneralObjectProperties = dynamic_import("mpfb.entities.objectproperties", "GeneralObjectProperties")
    try:
        return str(GeneralObjectProperties.get_value("asset_source", entity_reference=obj) or "")
    except Exception:  # pylint: disable=broad-except
        return ""


def _principled_nodes(material):
    if material is None or not material.use_nodes:
        return []
    return [node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"]


def tint_material(material, hue=0.5, saturation=1.0, value=1.0):
    """在贴图和 Base Color 之间插一个 Hue/Saturation/Value 节点，用于改头发/衣服颜色。"""
    for principled in _principled_nodes(material):
        base_color = principled.inputs["Base Color"]
        if not base_color.is_linked:
            continue
        link = base_color.links[0]
        from_socket = link.from_socket
        tree = material.node_tree
        hsv = tree.nodes.new("ShaderNodeHueSaturation")
        hsv.location = (principled.location.x - 250, principled.location.y)
        hsv.inputs["Hue"].default_value = hue
        hsv.inputs["Saturation"].default_value = saturation
        hsv.inputs["Value"].default_value = value
        tree.links.remove(link)
        tree.links.new(from_socket, hsv.inputs["Color"])
        tree.links.new(hsv.outputs["Color"], base_color)


def tweak_materials(basemesh, spec):
    """在 MPFB 生成的材质基础上做一些渲染层面的增强。"""
    hair_color = spec.get("hair_color")
    clothes_colors = spec.get("clothes_colors", {})

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        object_type = _object_type(obj).lower()
        asset_source = _asset_source(obj)
        asset_file = asset_source.split("/")[-1]
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None or not mat.use_nodes:
                continue
            if object_type in ("hair", "eyebrows", "eyelashes"):
                # 头发/眉毛/睫毛：大量 alpha 贴图，去掉背面剔除，压低高光让它不那么“塑料”
                mat.blend_method = "HASHED"
                mat.use_backface_culling = False
                for node in _principled_nodes(mat):
                    node.inputs["Roughness"].default_value = max(node.inputs["Roughness"].default_value, 0.5)
                    node.inputs["Specular IOR Level"].default_value = 0.2
                if object_type == "hair" and hair_color:
                    tint_material(mat, **hair_color)
            elif object_type == "eyes":
                # 眼睛：清漆层模拟角膜湿润高光
                for node in _principled_nodes(mat):
                    node.inputs["Roughness"].default_value = 0.1
                    node.inputs["Coat Weight"].default_value = 1.0
                    node.inputs["Coat Roughness"].default_value = 0.03
                    node.inputs["Coat IOR"].default_value = 1.38
            elif object_type == "clothes":
                mat.blend_method = "HASHED"
                if asset_file in clothes_colors:
                    tint_material(mat, **clothes_colors[asset_file])
            elif obj is basemesh:
                mat.blend_method = "OPAQUE"


# ----------------------------------------------------------------------------- 取景
def _evaluated_bounds(objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    lo = Vector((math.inf, math.inf, math.inf))
    hi = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        for corner in evaluated.bound_box:
            world = evaluated.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, world.x), min(lo.y, world.y), min(lo.z, world.z)))
            hi = Vector((max(hi.x, world.x), max(hi.y, world.y), max(hi.z, world.z)))
    return lo, hi


def anchors(basemesh, armature):
    """返回若干有用的世界坐标：头部中心、眼睛高度、胸口、全身包围盒。"""
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and (o.parent is armature or o is basemesh)]
    lo, hi = _evaluated_bounds(meshes)
    result = {"bounds": (lo, hi), "center": (lo + hi) / 2}

    def bone_point(name, fraction):
        bone = armature.pose.bones.get(name)
        if bone is None:
            return None
        return armature.matrix_world @ (bone.head.lerp(bone.tail, fraction))

    # MPFB 的 head 骨从下颌/颅底附近一直到头顶，0.6 左右大约是眼睛高度
    head = bone_point("head", 0.7) or Vector((0, 0, hi.z - 0.10))
    eyes = bone_point("head", 0.6) or Vector((0, 0, hi.z - 0.12))
    # 脸在头骨前方：沿 -Y 向前偏一点，对焦会更准
    result["head"] = head
    result["face"] = eyes + Vector((0, -0.08, 0))
    result["torso"] = bone_point("spine02", 0.5) or Vector((0, 0, (lo.z + hi.z) * 0.6))
    return result


def frame_shot(kind, params, anchor_points):
    lo, hi = anchor_points["bounds"]
    if kind == "full":
        height = hi.z - lo.z
        target = Vector((anchor_points["center"].x, anchor_points["center"].y, (lo.z + hi.z) / 2))
        frame_height = height * params["margin"]
        distance = studio.distance_for_frame_height(frame_height, params["lens"])
        focus = anchor_points["torso"]
    else:
        anchor_name = params.get("anchor", "face" if kind == "portrait" else "torso")
        target = anchor_points[anchor_name].copy()
        if kind == "portrait":
            # 让眼睛落在画面上三分之一附近，而不是正中
            target.z -= params["frame_height"] * 0.12
        distance = studio.distance_for_frame_height(params["frame_height"], params["lens"])
        focus = anchor_points["face"]
    return studio.add_camera(target, distance, lens=params["lens"], azimuth_deg=params["azimuth"],
                             elevation_deg=params["elevation"], fstop=params.get("fstop"), focus_target=focus,
                             name=f"Camera_{kind}")


# ----------------------------------------------------------------------------- 主流程
def main():
    args = parse_args()
    spec = load_spec(args.spec)
    name = spec["name"]
    started = time.time()

    ensure_mpfb_enabled()
    bpy.ops.wm.read_homefile(use_empty=True)
    studio.reset_scene()

    print(f"[build] 生成角色 {name} ...")
    basemesh, armature = build_human(spec)
    tweak_materials(basemesh, spec)
    apply_expression(basemesh, spec.get("expression"))

    if spec.get("pose"):
        print(f"[build] 应用姿势 {spec['pose']}")
        poses.apply_pose(armature, spec["pose"])

    bpy.context.view_layer.update()
    # 姿势改变后重新把脚放到地面
    lo, _hi = _evaluated_bounds([o for o in bpy.data.objects if o.type == "MESH"])
    if abs(lo.z) > 1e-3:
        armature.location.z -= lo.z
        bpy.context.view_layer.update()

    scene_cfg = spec.get("scene", {})
    studio.build_cyclorama(color=tuple(scene_cfg.get("backdrop_color", (0.22, 0.22, 0.24))))
    studio.setup_world(hdri=scene_cfg.get("hdri", "studio.exr"), strength=scene_cfg.get("hdri_strength", 0.2),
                       rotation_deg=scene_cfg.get("hdri_rotation", 0.0))
    anchor_points = anchors(basemesh, armature)
    studio.add_portrait_lighting(anchor_points["torso"], key_energy=scene_cfg.get("key_energy", 240.0),
                                 warm=scene_cfg.get("warm_key", True))

    if not args.no_save:
        os.makedirs(args.blend_dir, exist_ok=True)
        blend_path = os.path.join(args.blend_dir, f"{name}.blend")
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
        print(f"[build] 已保存 {blend_path}")

    shots = [s.strip() for s in args.shots.split(",") if s.strip() and s.strip() != "none"]
    shot_overrides = spec.get("shots", {})
    for shot in shots:
        params = dict(DEFAULT_SHOTS.get(shot, DEFAULT_SHOTS["full"]))
        params.update(shot_overrides.get(shot, {}))
        camera = frame_shot(shot, params, anchor_points)
        width = int(params["width"] * args.scale)
        height = int(params["height"] * args.scale)
        studio.configure_render(width, height, samples=args.samples, time_limit=args.time_limit)
        output = os.path.join(args.outdir, f"{name}_{shot}.png")
        print(f"[render] {shot} -> {output} ({width}x{height}, {args.samples} spp)")
        render_started = time.time()
        studio.render_to(output)
        print(f"[render] 完成 {shot}，耗时 {time.time() - render_started:.0f}s")
        bpy.data.objects.remove(camera, do_unlink=True)

    print(f"[build] {name} 全部完成，总耗时 {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
