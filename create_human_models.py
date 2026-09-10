"""Create four high-detail adult human studies with Blender and MB-Lab 1.8.1.

Preparation:
    git clone --depth 1 https://github.com/animate1978/MB-Lab.git /tmp/MB-Lab
Run:
    blender --background --python create_human_models.py

MB-Lab supplies anatomically modeled topology and texture maps. This script
automates variation, presentation garments, a studio, packing, and rendering.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


ROOT = os.path.dirname(os.path.abspath(__file__))
MBLAB_ROOT = os.environ.get("MBLAB_ROOT", "/tmp/MB-Lab")
OUTPUT_BLEND = os.path.join(ROOT, "realistic_human_lineup.blend")
OUTPUT_RENDER = os.path.join(ROOT, "realistic_human_lineup.png")

SPECS = [
    {
        "id": "m_ca01", "preset": "type_athletic", "name": "Athletic_Male",
        "label": "ATHLETIC MALE", "x": -3.15, "age": -0.15, "mass": 0.10,
        "tone": 0.72, "scale": 1.01, "hair": (0.012, 0.007, 0.004, 1),
        "cloth": (0.015, 0.025, 0.07, 1),
    },
    {
        "id": "f_as01", "preset": "type_hourglass01", "name": "Curvy_Female",
        "label": "CURVY FEMALE", "x": -1.05, "age": -0.28, "mass": 0.38,
        "tone": -0.10, "scale": 0.94, "hair": (0.025, 0.010, 0.004, 1),
        "cloth": (0.22, 0.012, 0.045, 1),
    },
    {
        "id": "f_af01", "preset": "type_slender01", "name": "Slender_Female",
        "label": "SLENDER FEMALE", "x": 1.05, "age": -0.22, "mass": -0.40,
        "tone": 0.28, "scale": 0.98, "hair": (0.006, 0.004, 0.003, 1),
        "cloth": (0.09, 0.14, 0.035, 1),
    },
    {
        "id": "m_la01", "preset": "type_heavybody", "name": "Mature_Male",
        "label": "MATURE MALE", "x": 3.15, "age": 0.86, "mass": 0.43,
        "tone": -0.32, "scale": 0.95, "hair": (0.34, 0.37, 0.40, 1),
        "cloth": (0.025, 0.028, 0.035, 1),
    },
]


def require_mblab():
    init_file = os.path.join(MBLAB_ROOT, "__init__.py")
    if not os.path.isfile(init_file):
        raise RuntimeError(
            "MB-Lab 1.8.1 not found. Clone it first:\n"
            "git clone --depth 1 https://github.com/animate1978/MB-Lab.git "
            + MBLAB_ROOT
        )
    package_path = os.path.join("/tmp", "mblab")
    if not os.path.lexists(package_path):
        os.symlink(MBLAB_ROOT, package_path)
    sys.path.insert(0, "/tmp")
    import mblab
    mblab.register()
    return mblab


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def make_material(name, color, roughness=0.55, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat


def load_character(mblab, spec):
    scene = bpy.context.scene
    scene.mblab_character_name = spec["id"]
    scene.mblab_use_eevee = True
    scene.mblab_use_cycles = False
    scene.mblab_use_ik = False
    scene.mblab_use_muscle = False

    # In headless mode MB-Lab has no add-on preferences entry. Its final
    # remove-censors check raises after the complete character is initialized.
    try:
        mblab.start_lab_session()
    except AttributeError as error:
        if "preferences" not in str(error):
            raise

    human = mblab.mblab_humanoid
    source = human.get_object()
    if source is None or not human.has_data:
        raise RuntimeError("MB-Lab failed to initialize " + spec["id"])

    preset_path = os.path.join(
        human.presets_path, spec["preset"] + ".json"
    )
    human.load_character(preset_path, mix=False)
    for prop, value, transform in (
        ("character_age", spec["age"], "AGE"),
        ("character_mass", spec["mass"], "FAT"),
        ("character_tone", spec["tone"], "MUSCLE"),
    ):
        setattr(source, prop, value)
        human.calculate_transformation(transform)
    human.update_materials()

    # Bake the evaluated morph result into an independent standard Blender mesh.
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(
        evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
    )
    result = bpy.data.objects.new(spec["name"] + "_Body", mesh)
    bpy.context.collection.objects.link(result)
    result.scale = (spec["scale"], spec["scale"], spec["scale"])
    result.location = (spec["x"], 0, 0.93 * spec["scale"])
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    # Remove MB-Lab's editable source and rig before creating the next model.
    for obj in list(bpy.data.objects):
        if obj != result and (
            obj == source or obj.type == "ARMATURE" or obj.name.startswith("MBLab_")
        ):
            bpy.data.objects.remove(obj, do_unlink=True)
    mblab.gui_status = "NEW_SESSION"
    return result


def add_uv(name, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=48, ring_count=32, location=location
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    return obj


def add_presentation_details(spec):
    scale = spec["scale"]
    x = spec["x"]
    cloth = make_material(spec["name"] + "_Garment", spec["cloth"], 0.68)
    hair_mat = make_material(spec["name"] + "_Hair", spec["hair"], 0.36)

    # A close-fitting neutral brief blocks intimate details without obscuring
    # the torso/leg proportions. Two forms give a cleaner waist and leg line.
    add_uv(
        spec["name"] + "_Brief_Waist",
        (x, -0.008, 0.99 * scale),
        (0.185 * scale, 0.135 * scale, 0.105 * scale),
        cloth,
    )
    add_uv(
        spec["name"] + "_Brief_Front",
        (x, -0.095 * scale, 0.925 * scale),
        (0.145 * scale, 0.060 * scale, 0.105 * scale),
        cloth,
    )

    # Restrained scalp volume; unlike the old mannequin build, the face,
    # ears, eyes, mouth, fingers, and toes all come from the anatomical mesh.
    head_z = (1.73 if spec["id"].startswith("m_") else 1.69) * scale
    hair = add_uv(
        spec["name"] + "_Hair",
        (x, 0.012, head_z),
        (0.105 * scale, 0.095 * scale, 0.075 * scale),
        hair_mat,
    )
    hair.scale.y = 1.05

    bpy.ops.object.text_add(location=(x, -0.02, 0.012))
    label = bpy.context.object
    label.name = spec["name"] + "_Label"
    label.data.body = spec["label"]
    label.data.align_x = "CENTER"
    label.data.size = 0.105
    label.data.extrude = 0.002
    label.data.materials.append(LABEL_MAT)


def look_at(obj, target):
    obj.rotation_euler = (
        Vector(target) - obj.location
    ).to_track_quat("-Z", "Y").to_euler()


def setup_studio():
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "Studio_Floor"
    floor.data.materials.append(FLOOR_MAT)

    bpy.ops.mesh.primitive_plane_add(
        size=18, location=(0, 1.65, 4), rotation=(math.pi / 2, 0, 0)
    )
    backdrop = bpy.context.object
    backdrop.name = "Studio_Backdrop"
    backdrop.data.materials.append(BACKDROP_MAT)

    world = bpy.context.scene.world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (
        0.018, 0.025, 0.042, 1
    )
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.28

    for name, location, energy, size, color in (
        ("Key_Softbox", (-4.5, -4.8, 6.0), 1750, 4.5, (1.0, 0.82, 0.70)),
        ("Fill_Softbox", (4.2, -3.0, 4.2), 1200, 4.0, (0.70, 0.82, 1.0)),
        ("Rim_Light", (0, 2.1, 5.2), 1450, 3.2, (0.75, 0.86, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        lamp = bpy.context.object
        lamp.name = name
        lamp.data.energy = energy
        lamp.data.shape = "DISK"
        lamp.data.size = size
        lamp.data.color = color
        look_at(lamp, (0, 0, 1.0))

    bpy.ops.object.camera_add(location=(0, -14.5, 2.35))
    camera = bpy.context.object
    camera.name = "Lineup_Camera"
    camera.data.lens = 58
    look_at(camera, (0, 0, 0.92))
    bpy.context.scene.camera = camera


mblab = require_mblab()
clear_scene()

FLOOR_MAT = make_material("Studio Floor", (0.045, 0.055, 0.075, 1), 0.40, 0.05)
BACKDROP_MAT = make_material("Studio Backdrop", (0.075, 0.095, 0.135, 1), 0.76)
LABEL_MAT = make_material("Labels", (0.56, 0.68, 0.86, 1), 0.48, 0.12)

for character_spec in SPECS:
    load_character(mblab, character_spec)
    add_presentation_details(character_spec)

setup_studio()

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1200
scene.render.resolution_y = 760
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = OUTPUT_RENDER
scene.render.film_transparent = False
scene.render.image_settings.color_depth = "8"
scene.eevee.taa_render_samples = 128
scene.eevee.use_gtao = True
scene.eevee.gtao_distance = 3
scene.eevee.gtao_factor = 1.3
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass

# Keep texture maps inside the .blend so the result is portable.
for image in bpy.data.images:
    if image.source == "FILE" and image.filepath:
        try:
            image.pack()
        except RuntimeError:
            pass

bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
bpy.ops.render.render(write_still=True)
print("Saved:", OUTPUT_BLEND)
print("Rendered:", OUTPUT_RENDER)
