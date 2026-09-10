"""Generate a studio lineup of varied, realistic adult human studies in Blender.

Run with:
    blender --background --python create_human_models.py

The script intentionally keeps intimate anatomy covered while concentrating on
silhouette, proportion, skin response, facial landmarks, and body diversity.
"""

import math
import os

import bpy
from mathutils import Vector


ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT_BLEND = os.path.join(ROOT, "realistic_human_lineup.blend")
OUTPUT_RENDER = os.path.join(ROOT, "realistic_human_lineup.png")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.curves, bpy.data.metaballs):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, base, roughness=0.45, metallic=0.0, subsurface=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*base, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
    elif "Subsurface" in bsdf.inputs:
        bsdf.inputs["Subsurface"].default_value = subsurface
    if subsurface:
        if "Subsurface Radius" in bsdf.inputs:
            bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.45, 0.22)
        noise = mat.node_tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 38
        noise.inputs["Detail"].default_value = 4
        noise.inputs["Roughness"].default_value = 0.7
        noise.inputs["Distortion"].default_value = 0.12
        bump = mat.node_tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.075
        bump.inputs["Distance"].default_value = 0.025
        mat.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def add_uv(name, location, scale, mat, segments=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, location=location
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Soft anatomical transitions", "BEVEL")
    bevel.width = 0.008
    bevel.segments = 2
    return obj


def add_capsule(name, a, b, radius_a, radius_b, mat):
    a, b = Vector(a), Vector(b)
    vec = b - a
    length = vec.length
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=32,
        radius1=radius_a,
        radius2=radius_b,
        depth=length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(vec.normalized())
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Rounded muscle transition", "BEVEL")
    bevel.width = min(radius_a, radius_b) * 0.52
    bevel.segments = 4
    return obj


def add_joint(name, point, radius, mat):
    return add_uv(name, point, (radius, radius, radius), mat, 24, 16)


def add_eye(name, loc, scale, iris_mat, side):
    white = add_uv(name + "_white", loc, scale, EYE_WHITE, 24, 16)
    iris_loc = (loc[0] + side * 0.002, loc[1] - scale[1] * 0.94, loc[2])
    iris = add_uv(name + "_iris", iris_loc, (0.012, 0.006, 0.012), iris_mat, 20, 12)
    pupil_loc = (iris_loc[0], iris_loc[1] - 0.006, iris_loc[2])
    add_uv(name + "_pupil", pupil_loc, (0.005, 0.003, 0.005), PUPIL, 16, 10)
    return white, iris


def create_human(spec):
    """Build one adult study from overlapping, smoothly shaded anatomical forms."""
    x = spec["x"]
    h = spec["height"]
    w = spec["build"]
    skin = spec["skin"]
    prefix = spec["name"]
    female = spec["shape"] == "female"
    elderly = spec.get("elderly", False)
    athletic = spec.get("athletic", False)
    sway = spec.get("sway", 0.0)

    foot_z = 0.08
    pelvis_z = h * 0.50
    shoulder_z = h * 0.80
    head_z = h * 0.925
    hip_half = (0.16 if female else 0.145) * w
    shoulder_half = (0.205 if female else 0.235) * w
    torso_depth = (0.105 if female else 0.115) * w

    # Feet and legs: femur angles naturally inward toward the knees.
    feet_y = -0.025
    for side, tag in ((-1, "L"), (1, "R")):
        hip = (x + side * hip_half, 0, pelvis_z)
        knee = (x + side * hip_half * 0.72, 0.01, h * 0.285)
        ankle = (x + side * hip_half * 0.76, 0.005, h * 0.105)
        add_capsule(prefix + "_thigh_" + tag, hip, knee, 0.092 * w, 0.068 * w, skin)
        add_joint(prefix + "_knee_" + tag, knee, 0.071 * w, skin)
        calf_r = 0.066 * w * (1.12 if athletic else 1.0)
        add_capsule(prefix + "_calf_" + tag, knee, ankle, calf_r, 0.045 * w, skin)
        add_joint(prefix + "_ankle_" + tag, ankle, 0.047 * w, skin)
        foot = add_uv(
            prefix + "_foot_" + tag,
            (ankle[0], feet_y - 0.055, foot_z),
            (0.061 * w, 0.145 * w, 0.052 * w),
            skin,
        )
        foot.rotation_euler.x = math.radians(-8)

    # Pelvis, abdomen, rib cage and chest form a continuous readable silhouette.
    add_uv(
        prefix + "_pelvis",
        (x, 0.01, pelvis_z),
        (hip_half * 1.16, torso_depth * 1.04, h * 0.105),
        skin,
    )
    waist_w = (0.135 if female else 0.155) * w
    add_uv(
        prefix + "_abdomen",
        (x + sway * 0.25, 0.002, h * 0.62),
        (waist_w, torso_depth * 0.93, h * 0.14),
        skin,
    )
    rib_w = shoulder_half * (0.79 if female else 0.83)
    add_uv(
        prefix + "_ribcage",
        (x + sway * 0.55, 0, h * 0.72),
        (rib_w, torso_depth * 1.08, h * 0.145),
        skin,
    )
    add_uv(
        prefix + "_upper_chest",
        (x + sway, -0.003, h * 0.785),
        (shoulder_half * 0.86, torso_depth, h * 0.095),
        skin,
    )
    if female:
        # Subtle breast volume, without explicit anatomical detail.
        for side in (-1, 1):
            add_uv(
                prefix + "_chest_volume",
                (x + side * shoulder_half * 0.38 + sway, -torso_depth * 0.78, h * 0.748),
                (0.078 * w, 0.055 * w, 0.068 * w),
                skin,
            )
    elif athletic:
        for side in (-1, 1):
            add_uv(
                prefix + "_pectoral",
                (x + side * shoulder_half * 0.38 + sway, -torso_depth * 0.72, h * 0.76),
                (0.088 * w, 0.042 * w, 0.065 * w),
                skin,
            )

    # Covered garment keeps the studies suitable for general presentation.
    garment = add_uv(
        prefix + "_shorts",
        (x, -0.006, pelvis_z - h * 0.025),
        (hip_half * 1.19, torso_depth * 1.08, h * 0.082),
        spec["garment"],
    )
    garment.scale.z = 0.94

    # Shoulder girdle and relaxed arms.
    shoulder_drop = h * (0.011 if elderly else 0)
    arm_pose = spec.get("arm_pose", 0.0)
    for side, tag in ((-1, "L"), (1, "R")):
        shoulder = (
            x + side * shoulder_half + sway,
            0,
            shoulder_z - shoulder_drop,
        )
        elbow = (
            x + side * (shoulder_half + 0.055 * w + arm_pose),
            0.012,
            h * 0.59,
        )
        wrist = (
            x + side * (shoulder_half + 0.035 * w + arm_pose * 0.6),
            -0.005,
            h * 0.445,
        )
        deltoid_r = 0.085 * w * (1.12 if athletic else 1.0)
        add_joint(prefix + "_deltoid_" + tag, shoulder, deltoid_r, skin)
        add_capsule(prefix + "_upperarm_" + tag, shoulder, elbow, 0.068 * w, 0.051 * w, skin)
        add_joint(prefix + "_elbow_" + tag, elbow, 0.052 * w, skin)
        add_capsule(prefix + "_forearm_" + tag, elbow, wrist, 0.054 * w, 0.038 * w, skin)
        add_joint(prefix + "_wrist_" + tag, wrist, 0.039 * w, skin)
        hand = add_uv(
            prefix + "_hand_" + tag,
            (wrist[0], wrist[1] - 0.005, wrist[2] - 0.065 * w),
            (0.044 * w, 0.025 * w, 0.082 * w),
            skin,
        )
        hand.rotation_euler.y = math.radians(side * 4)

    # Neck and face: cranium, jaw, ears, nose, eyes, brows, lips, and hair.
    neck_x = x + sway * 1.04
    neck_r = 0.068 * w * (1.10 if athletic else 1.0)
    add_uv(prefix + "_neck", (neck_x, 0, h * 0.835), (neck_r, neck_r, h * 0.082), skin)
    face_y = -0.012
    add_uv(
        prefix + "_cranium",
        (neck_x, face_y, head_z),
        (0.102 * w, 0.088 * w, h * 0.086),
        skin,
    )
    add_uv(
        prefix + "_jaw",
        (neck_x, face_y - 0.022, h * 0.888),
        (0.083 * w, 0.075 * w, h * 0.063),
        skin,
    )
    for side, tag in ((-1, "L"), (1, "R")):
        add_uv(
            prefix + "_ear_" + tag,
            (neck_x + side * 0.101 * w, face_y, h * 0.917),
            (0.016 * w, 0.010 * w, 0.029 * w),
            skin,
            20,
            12,
        )
    nose = add_uv(
        prefix + "_nose",
        (neck_x, face_y - 0.084 * w, h * 0.918),
        (0.018 * w, 0.028 * w, 0.031 * w),
        skin,
        20,
        12,
    )
    nose.rotation_euler.x = math.radians(-8)
    iris = spec["iris"]
    eye_z = h * 0.936
    for side, tag in ((-1, "L"), (1, "R")):
        ex = neck_x + side * 0.038 * w
        add_eye(
            prefix + "_eye_" + tag,
            (ex, face_y - 0.078 * w, eye_z),
            (0.024 * w, 0.012 * w, 0.014 * w),
            iris,
            side,
        )
        brow = add_uv(
            prefix + "_brow_" + tag,
            (ex, face_y - 0.091 * w, eye_z + 0.028 * w),
            (0.030 * w, 0.004 * w, 0.005 * w),
            spec["hair"],
            16,
            8,
        )
        brow.rotation_euler.y = math.radians(side * -6)
    add_uv(
        prefix + "_lips",
        (neck_x, face_y - 0.088 * w, h * 0.891),
        (0.032 * w, 0.007 * w, 0.009 * w),
        spec["lips"],
        20,
        10,
    )
    hair_z = head_z + h * 0.035
    hair = add_uv(
        prefix + "_hair",
        (neck_x, face_y + 0.018, hair_z),
        (0.107 * w, 0.090 * w, h * (0.058 if elderly else 0.062)),
        spec["hair"],
    )
    hair.scale.y = 1.02

    # A restrained age cue: silver brows/hair, stoop, and slightly softer waist.
    if elderly:
        add_uv(
            prefix + "_cheek_L",
            (neck_x - 0.057 * w, face_y - 0.072 * w, h * 0.909),
            (0.026 * w, 0.009 * w, 0.023 * w),
            skin,
            20,
            12,
        )
        add_uv(
            prefix + "_cheek_R",
            (neck_x + 0.057 * w, face_y - 0.072 * w, h * 0.909),
            (0.026 * w, 0.009 * w, 0.023 * w),
            skin,
            20,
            12,
        )

    # Floating studio label.
    bpy.ops.object.text_add(location=(x, 0.20, 0.012), rotation=(0, 0, 0))
    label = bpy.context.object
    label.name = prefix + "_label"
    label.data.body = spec["label"]
    label.data.align_x = "CENTER"
    label.data.size = 0.115
    label.data.extrude = 0.003
    label.data.materials.append(LABEL_MAT)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_studio():
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Studio floor"
    floor.data.materials.append(FLOOR_MAT)

    # Curved backdrop impression from a large vertical plane.
    bpy.ops.mesh.primitive_plane_add(
        size=18, location=(0, 1.6, 4.0), rotation=(math.radians(90), 0, 0)
    )
    backdrop = bpy.context.object
    backdrop.name = "Neutral backdrop"
    backdrop.data.materials.append(BACKDROP_MAT)

    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.035, 0.05, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.22

    def area(name, loc, energy, size, color):
        bpy.ops.object.light_add(type="AREA", location=loc)
        lamp = bpy.context.object
        lamp.name = name
        lamp.data.energy = energy
        lamp.data.shape = "DISK"
        lamp.data.size = size
        lamp.data.color = color
        look_at(lamp, (0, 0, 1.0))

    area("Key softbox", (-4.2, -4.6, 6.2), 1500, 5.0, (1.0, 0.82, 0.70))
    area("Fill softbox", (4.6, -2.8, 4.1), 1050, 4.0, (0.67, 0.80, 1.0))
    area("Rim light", (0, 2.0, 5.0), 1300, 3.0, (0.78, 0.88, 1.0))

    bpy.ops.object.camera_add(location=(0, -11.8, 2.25))
    camera = bpy.context.object
    camera.name = "Lineup camera"
    camera.data.lens = 54
    look_at(camera, (0, 0, 0.91))
    bpy.context.scene.camera = camera


clear_scene()

# Palette uses physically plausible roughness and modest subsurface scattering.
SKIN_1 = material("Skin warm fair", (0.63, 0.33, 0.22), 0.48, subsurface=0.12)
SKIN_2 = material("Skin golden", (0.47, 0.23, 0.13), 0.50, subsurface=0.13)
SKIN_3 = material("Skin deep", (0.20, 0.075, 0.038), 0.52, subsurface=0.14)
SKIN_4 = material("Skin mature", (0.50, 0.27, 0.19), 0.58, subsurface=0.10)
HAIR_BLACK = material("Hair black", (0.008, 0.006, 0.005), 0.28)
HAIR_BROWN = material("Hair brown", (0.055, 0.018, 0.008), 0.32)
HAIR_GREY = material("Hair silver", (0.32, 0.34, 0.36), 0.40, metallic=0.05)
LIPS_1 = material("Lips rose", (0.34, 0.075, 0.065), 0.48)
LIPS_2 = material("Lips umber", (0.18, 0.045, 0.035), 0.50)
IRIS_BROWN = material("Iris brown", (0.055, 0.018, 0.006), 0.24)
IRIS_BLUE = material("Iris blue", (0.025, 0.12, 0.18), 0.22)
EYE_WHITE = material("Eye sclera", (0.78, 0.75, 0.68), 0.22)
PUPIL = material("Pupil", (0.002, 0.002, 0.002), 0.18)
GARMENT_NAVY = material("Garment navy", (0.015, 0.025, 0.055), 0.70)
GARMENT_CHARCOAL = material("Garment charcoal", (0.025, 0.027, 0.03), 0.72)
GARMENT_BURGUNDY = material("Garment burgundy", (0.12, 0.012, 0.025), 0.68)
GARMENT_OLIVE = material("Garment olive", (0.055, 0.075, 0.025), 0.72)
FLOOR_MAT = material("Floor", (0.055, 0.065, 0.085), 0.38, metallic=0.08)
BACKDROP_MAT = material("Backdrop", (0.085, 0.105, 0.14), 0.72)
LABEL_MAT = material("Labels", (0.58, 0.66, 0.78), 0.55, metallic=0.12)

SPECS = [
    dict(
        name="athletic_male", label="ATHLETIC", x=-3.0, height=1.82, build=1.08,
        shape="male", athletic=True, skin=SKIN_2, hair=HAIR_BLACK, lips=LIPS_2,
        iris=IRIS_BROWN, garment=GARMENT_NAVY, arm_pose=0.045,
    ),
    dict(
        name="curvy_female", label="CURVY", x=-1.0, height=1.70, build=1.13,
        shape="female", skin=SKIN_1, hair=HAIR_BROWN, lips=LIPS_1,
        iris=IRIS_BLUE, garment=GARMENT_BURGUNDY, sway=0.018,
    ),
    dict(
        name="slender_female", label="SLENDER", x=1.0, height=1.76, build=0.91,
        shape="female", skin=SKIN_3, hair=HAIR_BLACK, lips=LIPS_2,
        iris=IRIS_BROWN, garment=GARMENT_OLIVE, sway=-0.012, arm_pose=0.025,
    ),
    dict(
        name="mature_male", label="MATURE", x=3.0, height=1.72, build=1.02,
        shape="male", elderly=True, skin=SKIN_4, hair=HAIR_GREY, lips=LIPS_1,
        iris=IRIS_BLUE, garment=GARMENT_CHARCOAL, sway=-0.025,
    ),
]

for human_spec in SPECS:
    create_human(human_spec)

setup_studio()

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT" if hasattr(bpy.types, "EEVEE_NEXT") else "BLENDER_EEVEE"
scene.render.resolution_x = 1100
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUTPUT_RENDER
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.look = "AgX - Medium High Contrast" if "AgX - Medium High Contrast" else scene.view_settings.look
scene.render.resolution_percentage = 100

# Contact shadows and high-quality screen-space shading.
if hasattr(scene, "eevee"):
    scene.eevee.use_gtao = True
    scene.eevee.gtao_distance = 3
    scene.eevee.gtao_factor = 1.25
    scene.eevee.taa_render_samples = 96

bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
bpy.ops.render.render(write_still=True)
print("Saved:", OUTPUT_BLEND)
print("Rendered:", OUTPUT_RENDER)
