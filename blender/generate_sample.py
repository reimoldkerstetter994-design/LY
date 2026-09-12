"""
在无头模式下生成 DevWorld 示例 Blender 场景并导出 GLTF 资产。

用法:
  blender --background --python blender/generate_sample.py
"""

import bpy
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(SCRIPT_DIR, "..", "assets", "models")


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def create_material(name: str, color, metallic=0.0, roughness=0.5, emission=None):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 2.0
    return mat


def export_object(obj, filename):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = os.path.join(ASSETS_DIR, filename)
    os.makedirs(ASSETS_DIR, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
    )
    print(f"[DevWorld] Generated: {path}")


def make_lamp_post():
    clear_scene()
    mat_pole = create_material("Pole", (0.22, 0.25, 0.29), metallic=0.6, roughness=0.4)
    mat_lamp = create_material("Lamp", (0.98, 0.75, 0.14), emission=(0.98, 0.75, 0.14))

    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=3, location=(0, 0, 1.5))
    pole = bpy.context.active_object
    pole.data.materials.append(mat_pole)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=(0, 0, 3.1))
    lamp = bpy.context.active_object
    lamp.data.materials.append(mat_lamp)

    export_object(pole, "lamp_post.glb")


def make_crystal():
    clear_scene()
    mat = create_material("Crystal", (0.51, 0.55, 0.97), metallic=0.1, roughness=0.05)
    mat.blend_method = "BLEND"

    bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.3, location=(0, 0, 0.15))
    base = bpy.context.active_object
    base.data.materials.append(create_material("Base", (0.29, 0.33, 0.39)))

    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.6, depth=1.2, location=(0, 0, 1.2))
    crystal = bpy.context.active_object
    crystal.rotation_euler[2] = 0.785
    crystal.data.materials.append(mat)

    export_object(crystal, "crystal.glb")


def make_workbench():
    clear_scene()
    mat_wood = create_material("Wood", (0.63, 0.38, 0.03), roughness=0.7)
    mat_metal = create_material("Metal", (0.8, 0.82, 0.85), metallic=0.8, roughness=0.3)

    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0.9))
    top = bpy.context.active_object
    top.scale = (1.2, 0.6, 0.05)
    top.data.materials.append(mat_wood)

    for x in [-0.5, 0.5]:
        for y in [-0.25, 0.25]:
            bpy.ops.mesh.primitive_cube_add(size=0.2, location=(x, y, 0.45))
            leg = bpy.context.active_object
            leg.scale = (0.08, 0.08, 0.9)
            leg.data.materials.append(mat_wood)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=0.05, location=(0.4, 0, 0.98))
    gear = bpy.context.active_object
    gear.data.materials.append(mat_metal)

    export_object(top, "workbench.glb")


if __name__ == "__main__":
    make_lamp_post()
    make_crystal()
    make_workbench()
    print("[DevWorld] All sample assets generated.")
