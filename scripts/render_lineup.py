"""体型阵列：把多种体型（瘦/标准/健壮/丰满 × 男/女，以及儿童和老人）并排渲染成一张对比图。

为了在不暴露身体的前提下展示解剖比例，这里使用 MakeHuman 自带的“紧身衣”皮肤
（young_caucasian_*_special_suit），它把一件深色连体衣直接画在皮肤贴图上。

用法::

    blender -b --python scripts/render_lineup.py -- [--samples 128] [--scale 1.0] [--out renders/body_types_lineup.png]
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from mpfb_bridge import dynamic_import, ensure_mpfb_enabled  # noqa: E402
import build_human  # noqa: E402
import poses  # noqa: E402
import studio  # noqa: E402

PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

FEMALE_SUIT = "young_caucasian_female_special_suit.mhmat"
MALE_SUIT = "young_caucasian_male_special_suit.mhmat"

HEAVY_TARGETS = {
    "measure-waist-circ-incr": 0.6, "measure-hips-circ-incr": 0.5, "torso-scale-depth-incr": 0.3,
    "neck-double-incr": 0.5, "stomach-pregnant-incr": 0.25,
    "l-upperarm-fat-incr": 0.6, "r-upperarm-fat-incr": 0.6, "l-lowerarm-fat-incr": 0.4, "r-lowerarm-fat-incr": 0.4,
    "l-upperleg-fat-incr": 0.6, "r-upperleg-fat-incr": 0.6, "l-lowerleg-fat-incr": 0.4, "r-lowerleg-fat-incr": 0.4,
    "l-cheek-volume-incr": 0.5, "r-cheek-volume-incr": 0.5, "head-fat-incr": 0.4,
}
SLIM_TARGETS = {
    "measure-waist-circ-decr": 0.3, "l-upperarm-fat-decr": 0.3, "r-upperarm-fat-decr": 0.3,
    "l-upperleg-fat-decr": 0.3, "r-upperleg-fat-decr": 0.3, "l-cheek-volume-decr": 0.3, "r-cheek-volume-decr": 0.3,
}

# (标签, 表型, 皮肤, 头发, 额外修形目标)
BODY_TYPES = [
    ("女性 · 纤瘦", {"gender": 0.0, "age": 0.5, "muscle": 0.4, "weight": 0.25, "height": 0.55, "proportions": 0.6,
                    "race": {"asian": 0.4, "caucasian": 0.6, "african": 0.0}}, FEMALE_SUIT, "ponytail01.mhclo", SLIM_TARGETS),
    ("女性 · 标准", {"gender": 0.0, "age": 0.5, "muscle": 0.5, "weight": 0.5, "height": 0.5, "proportions": 0.5,
                    "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}}, FEMALE_SUIT, "bob01.mhclo", {}),
    ("女性 · 健美", {"gender": 0.0, "age": 0.5, "muscle": 0.85, "weight": 0.45, "height": 0.6, "proportions": 0.7,
                    "race": {"asian": 0.0, "caucasian": 0.3, "african": 0.7}}, FEMALE_SUIT, "short01.mhclo",
     {"torso-vshape-incr": 0.3, "l-upperarm-muscle-incr": 0.4, "r-upperarm-muscle-incr": 0.4, "stomach-tone-incr": 0.5}),
    ("女性 · 丰满", {"gender": 0.0, "age": 0.55, "muscle": 0.4, "weight": 1.0, "height": 0.5, "proportions": 0.5,
                    "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}}, FEMALE_SUIT, "long01.mhclo", HEAVY_TARGETS),
    ("男性 · 纤瘦", {"gender": 1.0, "age": 0.5, "muscle": 0.35, "weight": 0.28, "height": 0.6, "proportions": 0.5,
                    "race": {"asian": 1.0, "caucasian": 0.0, "african": 0.0}}, MALE_SUIT, "short02.mhclo", SLIM_TARGETS),
    ("男性 · 标准", {"gender": 1.0, "age": 0.5, "muscle": 0.5, "weight": 0.5, "height": 0.6, "proportions": 0.5,
                    "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}}, MALE_SUIT, "short03.mhclo", {}),
    ("男性 · 肌肉", {"gender": 1.0, "age": 0.5, "muscle": 0.95, "weight": 0.6, "height": 0.7, "proportions": 0.7,
                    "race": {"asian": 0.0, "caucasian": 0.5, "african": 0.5}}, MALE_SUIT, "short04.mhclo",
     {"torso-vshape-incr": 0.6, "torso-muscle-pectoral-incr": 0.5, "torso-muscle-dorsi-incr": 0.5,
      "l-upperarm-muscle-incr": 0.5, "r-upperarm-muscle-incr": 0.5, "measure-neck-circ-incr": 0.3}),
    ("男性 · 肥胖", {"gender": 1.0, "age": 0.6, "muscle": 0.4, "weight": 1.0, "height": 0.55, "proportions": 0.5,
                    "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}}, MALE_SUIT, "short01.mhclo", HEAVY_TARGETS),
    ("儿童 · 8 岁", {"gender": 0.5, "age": 0.13, "muscle": 0.5, "weight": 0.5, "height": 0.5, "proportions": 0.5,
                    "race": {"asian": 0.5, "caucasian": 0.5, "african": 0.0}}, MALE_SUIT, "short03.mhclo", {}),
    ("老人 · 80 岁", {"gender": 1.0, "age": 0.95, "muscle": 0.35, "weight": 0.45, "height": 0.45, "proportions": 0.4,
                     "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}}, MALE_SUIT, "short02.mhclo",
     {"head-age-incr": 0.5, "l-eye-bag-incr": 0.4, "r-eye-bag-incr": 0.4, "mouth-laugh-lines-out": 0.4}),
]

SPACING = 0.78

CJK_FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "C:/Windows/Fonts/msyh.ttc",
]


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=128)
    parser.add_argument("--scale", type=float, default=1.0)
    parser.add_argument("--out", default=os.path.join(PROJECT_DIR, "renders", "body_types_lineup.png"))
    parser.add_argument("--save-blend", default=None, help="可选：保存 .blend 到该路径")
    return parser.parse_args(argv)


def add_label(text, location, size=0.11):
    curve = bpy.data.curves.new(f"Label_{text}", type="FONT")
    curve.body = text
    curve.size = size
    curve.align_x = "CENTER"
    for candidate in CJK_FONT_CANDIDATES:
        if os.path.exists(candidate):
            curve.font = bpy.data.fonts.load(candidate, check_existing=True)
            break
    obj = bpy.data.objects.new(curve.name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.radians(90), 0, 0)
    mat = bpy.data.materials.new("LabelMaterial")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.9, 0.9, 0.9, 1.0)
    bsdf.inputs["Emission Color"].default_value = (0.9, 0.9, 0.9, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 0.6
    obj.data.materials.append(mat)
    return obj


def main():
    args = parse_args()
    ensure_mpfb_enabled()
    bpy.ops.wm.read_homefile(use_empty=True)
    studio.reset_scene()

    total_width = SPACING * (len(BODY_TYPES) - 1)
    all_meshes = []
    for index, (label, phenotype, skin, hair, targets) in enumerate(BODY_TYPES):
        spec = {
            "name": f"bodytype_{index:02d}",
            "phenotype": phenotype,
            "targets": targets,
            "skin": skin,
            "skin_settings": {"body": {"Roughness": 0.45, "SSS strength": 0.25}},
            "eye_color": "brown",
            "hair": hair,
            "hair_color": {"hue": 0.5, "saturation": 0.6, "value": 0.45},
            "clothes": [],
        }
        print(f"[lineup] 生成 {label}")
        basemesh, armature = build_human.build_human(spec, subdiv_render_levels=1)
        build_human.tweak_materials(basemesh, spec)
        poses.apply_pose(armature, {"preset": "relaxed"})
        bpy.context.view_layer.update()

        x = -total_width / 2 + index * SPACING
        armature.location.x = x
        bpy.context.view_layer.update()
        meshes = [o for o in bpy.data.objects if o.type == "MESH" and (o.parent is armature or o is basemesh)]
        lo, _hi = build_human._evaluated_bounds(meshes)  # pylint: disable=protected-access
        armature.location.z -= lo.z
        all_meshes.extend(meshes)
        add_label(label, (x, -0.45, 0.01), size=0.13)

    bpy.context.view_layer.update()
    lo, hi = build_human._evaluated_bounds(all_meshes)  # pylint: disable=protected-access

    studio.build_cyclorama(color=(0.2, 0.2, 0.22), width=24.0)
    studio.setup_world(hdri="studio.exr", strength=0.25)
    center = Vector((0.0, 0.0, (lo.z + hi.z) / 2))
    studio.add_portrait_lighting((0.0, 0.0, 1.0), key_energy=600.0, scale=2.0)

    frame_height = (hi.z - lo.z) * 1.25 + 0.15
    distance = studio.distance_for_frame_height(frame_height, 60.0)
    studio.add_camera(center + Vector((0, 0, -0.05)), distance, lens=60.0, azimuth_deg=0.0, elevation_deg=1.5,
                      fstop=None)

    aspect = (total_width + 1.4) / frame_height
    height = int(1100 * args.scale)
    width = int(height * aspect)
    studio.configure_render(width, height, samples=args.samples)

    if args.save_blend:
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=args.save_blend, compress=True)

    print(f"[lineup] 渲染 {width}x{height} -> {args.out}")
    studio.render_to(args.out)
    print("[lineup] 完成")


if __name__ == "__main__":
    main()
