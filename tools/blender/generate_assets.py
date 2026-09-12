"""
Blender asset pipeline for DevWorld 3D game.
Generates GLB models: terrain blocks, decorative props, and environment assets.

Usage:
  blender --background --python tools/blender/generate_assets.py
"""

import bpy
import os
import math

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "models")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for mat in bpy.data.materials:
        bpy.data.materials.remove(mat)


def make_material(name, color, metallic=0.0, roughness=0.8):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def export_glb(name):
    path = os.path.join(OUTPUT_DIR, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    print(f"Exported: {path}")


def create_block(name, color, size=1.0, bevel=0.02, metallic=0.0, roughness=0.8):
    clear_scene()
    bpy.ops.mesh.primitive_cube_add(size=size, location=(0, 0, size / 2))
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.modifier_add(type="BEVEL")
    obj.modifiers["Bevel"].width = bevel
    obj.modifiers["Bevel"].segments = 2
    obj.data.materials.append(make_material(f"{name}_mat", color, metallic, roughness))
    bpy.ops.object.shade_smooth()
    export_glb(name)


def create_tree():
    clear_scene()
    trunk_mat = make_material("trunk", (0.35, 0.22, 0.1))
    leaf_mat = make_material("leaves", (0.15, 0.55, 0.2))

    bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=1.2, location=(0, 0, 0.6))
    trunk = bpy.context.active_object
    trunk.name = "TreeTrunk"
    trunk.data.materials.append(trunk_mat)

    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.7, location=(0, 0, 1.5))
    leaves = bpy.context.active_object
    leaves.name = "TreeLeaves"
    leaves.data.materials.append(leaf_mat)
    bpy.ops.object.shade_smooth()

    bpy.ops.object.select_all(action="SELECT")
    export_glb("tree")


def create_crystal():
    clear_scene()
    mat = make_material("crystal", (0.3, 0.7, 1.0), metallic=0.3, roughness=0.2)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.4, depth=1.0, location=(0, 0, 0.5))
    obj = bpy.context.active_object
    obj.name = "Crystal"
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    export_glb("crystal")


def create_workbench():
    clear_scene()
    wood = make_material("wood", (0.55, 0.38, 0.22))
    metal = make_material("metal", (0.6, 0.6, 0.65), metallic=0.8, roughness=0.3)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.4))
    top = bpy.context.active_object
    top.scale = (1.2, 0.8, 0.08)
    top.data.materials.append(wood)

    for x in [-0.5, 0.5]:
        for y in [-0.3, 0.3]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.4, location=(x, y, 0.2))
            leg = bpy.context.active_object
            leg.data.materials.append(metal)

    bpy.ops.mesh.primitive_cube_add(size=0.3, location=(0.3, 0, 0.55))
    screen = bpy.context.active_object
    screen.scale = (0.6, 0.05, 0.4)
    screen.data.materials.append(make_material("screen", (0.1, 0.15, 0.2), metallic=0.1))

    bpy.ops.object.select_all(action="SELECT")
    export_glb("workbench")


def create_lamp():
    clear_scene()
    metal = make_material("lamp_metal", (0.7, 0.7, 0.75), metallic=0.9, roughness=0.2)
    glow = make_material("lamp_glow", (1.0, 0.9, 0.6), metallic=0.0, roughness=0.5)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=0.05, location=(0, 0, 1.8))
    shade = bpy.context.active_object
    shade.data.materials.append(glow)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.02, depth=1.8, location=(0, 0, 0.9))
    pole = bpy.context.active_object
    pole.data.materials.append(metal)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.15, depth=0.05, location=(0, 0, 0.025))
    base = bpy.context.active_object
    base.data.materials.append(metal)

    bpy.ops.object.select_all(action="SELECT")
    export_glb("lamp")


def main():
    print("=== DevWorld Asset Pipeline ===")
    create_block("grass", (0.25, 0.65, 0.2))
    create_block("dirt", (0.45, 0.32, 0.18))
    create_block("stone", (0.5, 0.5, 0.52))
    create_block("wood", (0.55, 0.38, 0.22))
    create_block("glass", (0.6, 0.85, 0.95), metallic=0.1, roughness=0.05)
    create_block("brick", (0.7, 0.3, 0.22))
    create_block("metal", (0.65, 0.68, 0.72), metallic=0.85, roughness=0.25)
    create_block("glow", (0.2, 0.8, 1.0), metallic=0.2, roughness=0.1)
    create_tree()
    create_crystal()
    create_workbench()
    create_lamp()
    print("=== All assets generated ===")


if __name__ == "__main__":
    main()
