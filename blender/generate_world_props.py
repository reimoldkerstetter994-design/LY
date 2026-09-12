"""
Blender script: Generate decorative world props (bench, lamp post, fountain).
Run: blender --background --python blender/generate_world_props.py
"""
import bpy
import os
import math

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'models')


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()


def make_material(name, color, metallic=0.0, roughness=0.6):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat


def create_bench():
    clear_scene()
    wood = make_material("bench_wood", (0.4, 0.25, 0.12, 1.0))
    metal = make_material("bench_metal", (0.3, 0.3, 0.32, 1.0), metallic=0.8)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.45))
    seat = bpy.context.active_object
    seat.scale = (1.2, 0.4, 0.08)
    seat.data.materials.append(wood)

    for x in [-0.5, 0.5]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.2))
        leg = bpy.context.active_object
        leg.scale = (0.08, 0.35, 0.4)
        leg.data.materials.append(metal)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.35, 0.7))
    back = bpy.context.active_object
    back.scale = (1.2, 0.06, 0.35)
    back.data.materials.append(wood)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.join()
    bench = bpy.context.active_object
    bench.name = "bench"
    return bench


def create_lamp_post():
    clear_scene()
    metal = make_material("lamp_metal", (0.25, 0.25, 0.28, 1.0), metallic=0.9)
    glow = make_material("lamp_glow", (1.0, 0.9, 0.5, 1.0), roughness=0.2)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=3, location=(0, 0, 1.5))
    pole = bpy.context.active_object
    pole.data.materials.append(metal)

    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.25, location=(0, 0, 3.2))
    bulb = bpy.context.active_object
    bulb.data.materials.append(glow)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.join()
    lamp = bpy.context.active_object
    lamp.name = "lamp_post"
    return lamp


def create_fountain():
    clear_scene()
    stone = make_material("fountain_stone", (0.6, 0.6, 0.62, 1.0))
    water = make_material("fountain_water", (0.2, 0.5, 0.8, 0.5), roughness=0.1)

    bpy.ops.mesh.primitive_cylinder_add(radius=1.5, depth=0.3, location=(0, 0, 0.15))
    base = bpy.context.active_object
    base.data.materials.append(stone)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.8, depth=0.8, location=(0, 0, 0.7))
    mid = bpy.context.active_object
    mid.data.materials.append(stone)

    bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=0.2, location=(0, 0, 0.2))
    pool = bpy.context.active_object
    pool.data.materials.append(water)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.join()
    fountain = bpy.context.active_object
    fountain.name = "fountain"
    return fountain


def export_gltf(obj, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(filepath=filepath, use_selection=True, export_format='GLB')


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    props = [
        ("bench", create_bench),
        ("lamp_post", create_lamp_post),
        ("fountain", create_fountain),
    ]
    for name, creator in props:
        obj = creator()
        path = os.path.join(OUTPUT_DIR, f"{name}.glb")
        export_gltf(obj, path)
        print(f"Exported {path}")
    print("=== Props generation complete ===")


if __name__ == "__main__":
    main()
