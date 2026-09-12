"""
Blender script: Generate block textures and models for Dev World 3D.
Run headlessly: blender --background --python blender/generate_blocks.py
"""
import bpy
import os
import math

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'models')
TEXTURE_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'textures')

BLOCKS = [
    {"name": "grass", "color": (0.35, 0.62, 0.24, 1.0), "top": (0.42, 0.72, 0.29, 1.0)},
    {"name": "dirt", "color": (0.55, 0.41, 0.08, 1.0)},
    {"name": "stone", "color": (0.53, 0.53, 0.53, 1.0)},
    {"name": "wood", "color": (0.42, 0.26, 0.15, 1.0)},
    {"name": "leaves", "color": (0.18, 0.42, 0.18, 1.0)},
    {"name": "sand", "color": (0.83, 0.77, 0.54, 1.0)},
    {"name": "brick", "color": (0.63, 0.32, 0.18, 1.0)},
    {"name": "glass", "color": (0.67, 0.87, 1.0, 0.3)},
    {"name": "water", "color": (0.2, 0.53, 0.8, 0.6)},
]


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for mat in bpy.data.materials:
        bpy.data.materials.remove(mat)


def create_block(name, color, top_color=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    obj = bpy.context.active_object
    obj.name = f"block_{name}"

    mat = bpy.data.materials.new(name=f"mat_{name}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = color
    if len(color) > 3 and color[3] < 1.0:
        bsdf.inputs['Alpha'].default_value = color[3]
        mat.blend_method = 'BLEND'
    bsdf.inputs['Roughness'].default_value = 0.8
    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    obj.data.materials.append(mat)

    if top_color:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
        for poly in obj.data.polygons:
            if poly.normal.z > 0.9:
                poly.select = True
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.duplicate()
        bpy.ops.object.mode_set(mode='OBJECT')

    return obj


def export_gltf(obj, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        use_selection=True,
        export_format='GLB',
    )


def generate_tree():
    clear_scene()

    bpy.ops.mesh.primitive_cylinder_add(radius=0.3, depth=4, location=(0, 0, 2))
    trunk = bpy.context.active_object
    trunk.name = "tree_trunk"
    trunk_mat = bpy.data.materials.new(name="trunk_mat")
    trunk_mat.use_nodes = True
    trunk_mat.node_tree.nodes["Principled BSDF"].inputs['Base Color'].default_value = (0.35, 0.2, 0.1, 1.0)
    trunk.data.materials.append(trunk_mat)

    bpy.ops.mesh.primitive_ico_sphere_add(radius=2, location=(0, 0, 5), subdivisions=2)
    leaves = bpy.context.active_object
    leaves.name = "tree_leaves"
    leaves_mat = bpy.data.materials.new(name="leaves_mat")
    leaves_mat.use_nodes = True
    leaves_mat.node_tree.nodes["Principled BSDF"].inputs['Base Color'].default_value = (0.15, 0.45, 0.15, 1.0)
    leaves.data.materials.append(leaves_mat)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.join()
    tree = bpy.context.active_object
    tree.name = "tree"

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    export_gltf(tree, os.path.join(OUTPUT_DIR, "tree.glb"))
    print(f"Exported tree.glb")


def generate_all_blocks():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for block in BLOCKS:
        clear_scene()
        top = block.get("top")
        obj = create_block(block["name"], block["color"], top)
        filepath = os.path.join(OUTPUT_DIR, f"block_{block['name']}.glb")
        export_gltf(obj, filepath)
        print(f"Exported {filepath}")


def main():
    print("=== Dev World 3D Asset Generator ===")
    generate_all_blocks()
    generate_tree()
    print("=== Done ===")


if __name__ == "__main__":
    main()
