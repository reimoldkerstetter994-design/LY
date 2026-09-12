"""
DevWorld Blender Asset Pipeline
================================
Run inside Blender (3.6+):

  blender --background --python blender/generate_assets.py

Or open Blender, go to Scripting tab, and run this script.

Exports GLB models to public/models/ for use in the Three.js game.
"""

import bpy
import os
import math

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "..", "public", "models")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for mat in bpy.data.materials:
        if mat.users == 0:
            bpy.data.materials.remove(mat)


def export_glb(name):
    path = os.path.join(OUTPUT_DIR, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    print(f"  Exported: {path}")


def create_material(name, color, metallic=0.0, roughness=0.5, emission=None):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 0.5
    return mat


def build_tree():
    clear_scene()
    trunk_mat = create_material("Trunk", (0.35, 0.22, 0.1))
    leaves_mat = create_material("Leaves", (0.17, 0.48, 0.17))

    bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=1.8, location=(0, 0, 0.9))
    trunk = bpy.context.active_object
    trunk.data.materials.append(trunk_mat)

    bpy.ops.mesh.primitive_cone_add(radius1=1.2, depth=2.5, location=(0, 0, 2.5))
    leaves = bpy.context.active_object
    leaves.data.materials.append(leaves_mat)

    bpy.ops.object.select_all(action="SELECT")
    export_glb("tree")


def build_terminal():
    clear_scene()
    desk_mat = create_material("Desk", (0.23, 0.23, 0.29))
    screen_mat = create_material("Screen", (0.1, 0.1, 0.17), emission=(0.04, 0.19, 0.38))

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.4))
    desk = bpy.context.active_object
    desk.scale = (1.6, 0.8, 0.8)
    desk.data.materials.append(desk_mat)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.1))
    monitor = bpy.context.active_object
    monitor.scale = (1.0, 0.65, 0.08)
    monitor.data.materials.append(screen_mat)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.3, 0.82))
    kb = bpy.context.active_object
    kb.scale = (0.6, 0.25, 0.04)
    kb.data.materials.append(desk_mat)

    bpy.ops.object.select_all(action="SELECT")
    export_glb("terminal")


def build_bug():
    clear_scene()
    body_mat = create_material("BugBody", (0.8, 0.2, 0.2), emission=(0.4, 0.07, 0.07))

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=(0, 0, 0))
    body = bpy.context.active_object
    body.data.materials.append(body_mat)

    for i in range(6):
        angle = (i / 6) * math.pi * 2
        x = math.cos(angle) * 0.2
        z = math.sin(angle) * 0.2
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.02, depth=0.3, location=(x, -0.08, z)
        )
        leg = bpy.context.active_object
        leg.rotation_euler = (math.sin(angle) * 0.7, 0, math.cos(angle) * 0.7)
        leg.data.materials.append(body_mat)

    bpy.ops.object.select_all(action="SELECT")
    export_glb("bug")


def build_crystal():
    clear_scene()
    crystal_mat = create_material(
        "Crystal", (0.39, 0.71, 1.0), metallic=0.8, roughness=0.2, emission=(0.13, 0.38, 0.75)
    )

    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.5, location=(0, 0, 0.5))
    crystal = bpy.context.active_object
    crystal.data.materials.append(crystal_mat)

    bpy.ops.object.select_all(action="SELECT")
    export_glb("crystal")


if __name__ == "__main__":
    print("DevWorld Blender Asset Pipeline")
    print("=" * 40)
    build_tree()
    build_terminal()
    build_bug()
    build_crystal()
    print("All assets exported!")
