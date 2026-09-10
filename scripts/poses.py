"""姿势工具：把 MPFB 默认骨架（default rig）摆成自然的站姿，或导入 BVH 姿势。

两种姿势来源：
1. 内置预设（本文件 ``PRESETS``）：用“骨骼指向的世界方向”描述姿势，比直接填欧拉角直观得多。
   角色面朝 -Y，+X 为角色左侧，+Z 向上。
2. MakeHuman 资源包里的 BVH 姿势（poses01/poses02，坐姿、瑜伽、运动等），通过
   ``AnimationService.import_bvh_file_as_pose`` 导入。

用法（在 Blender 内）::

    from poses import apply_pose
    apply_pose(armature_object, {"preset": "relaxed"})
    apply_pose(armature_object, {"bvh": "callharvey3d_sittingnatural.bvh"})
"""

import math

import bpy
from mathutils import Matrix, Vector

from mpfb_bridge import dynamic_import


def _pose_matrix_world(armature, pose_bone):
    return armature.matrix_world @ pose_bone.matrix


def _update():
    bpy.context.view_layer.update()


def aim_bone(armature, bone_name, world_direction):
    """让骨骼（沿其局部 Y 轴）指向给定的世界方向，绕骨骼根部做最小旋转。"""
    pose_bone = armature.pose.bones.get(bone_name)
    if pose_bone is None:
        print(f"[poses] 骨骼不存在: {bone_name}")
        return
    matrix_world = _pose_matrix_world(armature, pose_bone)
    current = matrix_world.col[1].xyz.normalized()
    target = Vector(world_direction).normalized()
    rotation_world = current.rotation_difference(target).to_matrix()
    rot3 = matrix_world.to_3x3()
    rotation_local = rot3.inverted() @ rotation_world @ rot3
    pose_bone.rotation_mode = "QUATERNION"
    pose_bone.rotation_quaternion = (pose_bone.rotation_quaternion.to_matrix() @ rotation_local).to_quaternion()
    _update()


def twist_bone(armature, bone_name, degrees):
    """绕骨骼自身长轴（局部 Y）扭转。"""
    pose_bone = armature.pose.bones.get(bone_name)
    if pose_bone is None:
        return
    pose_bone.rotation_mode = "QUATERNION"
    rotation = Matrix.Rotation(math.radians(degrees), 3, "Y")
    pose_bone.rotation_quaternion = (pose_bone.rotation_quaternion.to_matrix() @ rotation).to_quaternion()
    _update()


def rotate_bone_local(armature, bone_name, axis, degrees):
    """绕骨骼局部坐标轴（'X'/'Y'/'Z'）旋转，用于手指弯曲等细节。"""
    pose_bone = armature.pose.bones.get(bone_name)
    if pose_bone is None:
        return
    pose_bone.rotation_mode = "QUATERNION"
    rotation = Matrix.Rotation(math.radians(degrees), 3, axis)
    pose_bone.rotation_quaternion = (pose_bone.rotation_quaternion.to_matrix() @ rotation).to_quaternion()


def rotate_bone_world(armature, bone_name, world_axis, degrees):
    """绕经过骨骼根部的世界坐标轴旋转（例如让头绕 Z 轴左右转）。"""
    pose_bone = armature.pose.bones.get(bone_name)
    if pose_bone is None:
        return
    matrix_world = _pose_matrix_world(armature, pose_bone)
    rot3 = matrix_world.to_3x3()
    rotation_world = Matrix.Rotation(math.radians(degrees), 3, Vector(world_axis).normalized())
    rotation_local = rot3.inverted() @ rotation_world @ rot3
    pose_bone.rotation_mode = "QUATERNION"
    pose_bone.rotation_quaternion = (pose_bone.rotation_quaternion.to_matrix() @ rotation_local).to_quaternion()
    _update()


def curl_fingers(armature, amount=1.0, thumb_amount=0.6):
    """自然微曲手指。amount=1 大约是放松垂手时的弯曲程度。"""
    for side in ("L", "R"):
        for finger in range(2, 6):
            for segment, base in ((1, 14.0), (2, 20.0), (3, 16.0)):
                rotate_bone_local(armature, f"finger{finger}-{segment}.{side}", "X", base * amount)
        for segment, base in ((1, 6.0), (2, 14.0), (3, 12.0)):
            rotate_bone_local(armature, f"finger1-{segment}.{side}", "X", base * thumb_amount)
    _update()


def mirror(direction):
    """把左侧方向镜像到右侧（X 取反）。"""
    return (-direction[0], direction[1], direction[2])


# --------------------------------------------------------------------------------------- 预设
# 每个预设是一个“步骤列表”，按顺序执行。步骤类型：
#   ("aim",   bone, (x, y, z))        让骨骼指向世界方向；bone 以 ".L" 结尾时会自动镜像到 .R
#   ("twist", bone, degrees)          绕骨骼长轴扭转（同上自动镜像，角度取反）
#   ("world", bone, (x, y, z), deg)   绕世界轴旋转
#   ("fingers", amount)               手指弯曲
DOWN = (0.0, 0.0, -1.0)

#
# 骨骼说明（MPFB default rig）：upperarm01/upperleg01 只是 6~9cm 的关节过渡骨，真正的大臂/大腿是
# upperarm02/upperleg02；前臂是 lowerarm01(+02 扭转段)，小腿是 lowerleg01(+02)。
PRESETS = {
    # 双臂自然下垂、微微外展，肘部略弯，头略转——标准“放松站姿”
    "relaxed": [
        ("aim", "upperarm02.L", (0.22, 0.04, -0.97)),
        ("aim", "lowerarm01.L", (0.16, -0.20, -0.96)),
        ("aim", "wrist.L", (0.14, -0.22, -0.96)),
        ("world", "head", (0, 0, 1), 7.0),
        ("world", "head", (1, 0, 0), -3.0),
        ("fingers", 1.0),
    ],
    # 对立式平衡：重心移到一侧腿，另一条腿放松微屈，肩髋反向微倾
    "contrapposto": [
        ("world", "root", (0, 1, 0), 3.0),
        ("world", "spine03", (0, 1, 0), -2.5),
        ("world", "spine01", (0, 1, 0), -1.5),
        ("aim", "upperleg02.L", (0.03, -0.03, -1.0)),
        ("aim", "upperleg02.R", (-0.16, -0.08, -0.98)),
        ("aim", "lowerleg01.R", (-0.10, 0.06, -0.99)),
        ("aim", "upperarm02.L", (0.24, 0.06, -0.97)),
        ("aim", "lowerarm01.L", (0.12, -0.24, -0.96)),
        ("aim", "upperarm02.R", (-0.30, 0.0, -0.95)),
        ("aim", "lowerarm01.R", (-0.06, -0.42, -0.90)),
        ("aim", "wrist.R", (-0.02, -0.45, -0.89)),
        ("world", "head", (0, 0, 1), -10.0),
        ("world", "head", (0, 1, 0), 3.0),
        ("fingers", 1.0),
    ],
    # 双手叉腰
    "hands_on_hips": [
        ("aim", "upperarm02.L", (0.72, 0.18, -0.67)),
        ("aim", "lowerarm01.L", (-0.66, 0.28, -0.70)),
        ("aim", "wrist.L", (-0.78, 0.32, -0.54)),
        ("twist", "lowerarm01.L", 35.0),
        ("aim", "upperleg02.L", (0.09, -0.03, -1.0)),
        ("world", "head", (0, 0, 1), 5.0),
        ("fingers", 0.7),
    ],
    # 一只手插兜、另一只手自然下垂的随意站姿
    "casual": [
        ("aim", "upperarm02.L", (0.22, -0.02, -0.97)),
        ("aim", "lowerarm01.L", (0.14, -0.28, -0.95)),
        ("aim", "upperarm02.R", (-0.30, 0.14, -0.94)),
        ("aim", "lowerarm01.R", (0.28, -0.34, -0.90)),
        ("aim", "wrist.R", (0.45, -0.20, -0.87)),
        ("twist", "lowerarm01.R", 20.0),
        ("aim", "upperleg02.L", (0.12, -0.04, -0.99)),
        ("aim", "upperleg02.R", (-0.03, 0.0, -1.0)),
        ("world", "spine03", (0, 1, 0), 2.0),
        ("world", "head", (0, 0, 1), 12.0),
        ("world", "head", (1, 0, 0), 4.0),
        ("fingers", 1.0),
    ],
    # 健身展示：双臂略外展、胸腔打开、双脚站开
    "athletic": [
        ("aim", "upperarm02.L", (0.42, 0.06, -0.90)),
        ("aim", "lowerarm01.L", (0.34, -0.42, -0.84)),
        ("twist", "lowerarm01.L", 25.0),
        ("aim", "upperleg02.L", (0.14, -0.03, -0.99)),
        ("world", "spine03", (1, 0, 0), -4.0),
        ("world", "head", (1, 0, 0), -4.0),
        ("fingers", 1.4),
    ],
    # 原始 A 字站姿（不做任何修改），用于对比/体型阵列
    "apose": [],
}


def _mirror_steps(steps):
    """把只写了 .L 的步骤自动补上 .R（如果预设里没有显式给出 .R）。"""
    explicit = {step[1] for step in steps if len(step) > 1 and isinstance(step[1], str)}
    result = []
    for step in steps:
        result.append(step)
        if len(step) > 1 and isinstance(step[1], str) and step[1].endswith(".L"):
            right = step[1][:-2] + ".R"
            if right in explicit:
                continue
            if step[0] == "aim":
                result.append(("aim", right, mirror(step[2])))
            elif step[0] == "twist":
                result.append(("twist", right, -step[2]))
            elif step[0] == "world":
                result.append(("world", right, mirror(step[2]), -step[3]))
    return result


def apply_preset(armature, name):
    steps = PRESETS.get(name)
    if steps is None:
        raise ValueError(f"未知姿势预设: {name}，可用: {sorted(PRESETS)}")
    for step in _mirror_steps(steps):
        kind = step[0]
        if kind == "aim":
            aim_bone(armature, step[1], step[2])
        elif kind == "twist":
            twist_bone(armature, step[1], step[2])
        elif kind == "world":
            rotate_bone_world(armature, step[1], step[2], step[3])
        elif kind == "fingers":
            curl_fingers(armature, step[1])
    _update()


def apply_bvh(armature, bvh_name):
    AssetService = dynamic_import("mpfb.services.assetservice", "AssetService")
    AnimationService = dynamic_import("mpfb.services.animationservice", "AnimationService")
    path = AssetService.find_asset_absolute_path(bvh_name, asset_subdir="poses")
    if path is None:
        raise FileNotFoundError(f"找不到 BVH 姿势: {bvh_name}")
    AnimationService.import_bvh_file_as_pose(armature, path)
    # 导入时会临时创建一个源骨架，删掉它
    for obj in list(bpy.data.objects):
        if obj.type == "ARMATURE" and obj is not armature and obj.name.lower().startswith(
            bvh_name.replace(".bvh", "").lower()[:8]
        ):
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    _update()


def apply_pose(armature, pose_spec):
    """pose_spec: {"preset": name} 或 {"bvh": "xxx.bvh"}，可叠加 "extra": [steps]。"""
    if not pose_spec:
        return
    if "bvh" in pose_spec:
        apply_bvh(armature, pose_spec["bvh"])
    if "preset" in pose_spec:
        apply_preset(armature, pose_spec["preset"])
    for step in pose_spec.get("extra", []):
        step = tuple(step)
        if step[0] == "aim":
            aim_bone(armature, step[1], step[2])
        elif step[0] == "twist":
            twist_bone(armature, step[1], step[2])
        elif step[0] == "world":
            rotate_bone_world(armature, step[1], step[2], step[3])
        elif step[0] == "fingers":
            curl_fingers(armature, step[1])
    _update()
