"""
High-Level Character and Scene Builder.
Assembles complete human models (body, eyes, hair, facial hair, clothing, materials),
positions them in realistic stances, sets up studio lighting and cameras,
and provides saving/exporting to .blend, .glb, and .obj formats.
"""

import math
import os
import bpy
from mathutils import Vector

from .config import BODY_ARCHETYPES
from .anatomy_mesh import build_human_body_mesh, build_eyeballs
from .hair_styles import build_eyebrows_and_lashes, build_hair, build_beard_and_mustache
from .clothing import build_clothing
from .materials import (
    create_skin_material,
    create_eye_cornea_material,
    create_eye_iris_material,
    create_hair_material,
    create_eyebrow_eyelash_material,
    create_clothing_material,
)
from .studio import (
    build_studio_cyclorama,
    setup_studio_lighting,
    setup_cameras,
    create_camera_pointing_at,
    configure_render_engine,
)


def clear_scene():
    """Removes all objects, meshes, materials, and lights from the scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_complete_character(archetype_key, position_offset=(0, 0, 0), parent_to_root=True):
    """
    Builds a complete, realistic human character model:
    - Anatomical body mesh
    - Cornea & iris eyeballs
    - Eyebrows & eyelashes
    - Styled hair
    - Facial hair / beard (if configured)
    - Fitted clothing
    - High-realism PBR shaders
    - Optional root empty at position_offset
    """
    if archetype_key not in BODY_ARCHETYPES:
        raise ValueError(f"Unknown archetype key: {archetype_key}")

    arch = dict(BODY_ARCHETYPES[archetype_key])
    arch["archetype_key"] = archetype_key

    char_name = arch["display_name"].split(" (")[0]
    collection_name = f"Character_{archetype_key}"
    char_col = bpy.data.collections.new(collection_name)
    bpy.context.scene.collection.children.link(char_col)

    # 1. Body Mesh & Skin Material
    body_obj = build_human_body_mesh(arch)
    skin_mat = create_skin_material(f"Mat_Skin_{archetype_key}", arch["skin_preset"])
    body_obj.data.materials.append(skin_mat)

    # 2. Eyeballs & Eye Materials
    eye_objs = build_eyeballs(arch)
    iris_mat = create_eye_iris_material(f"Mat_Iris_{archetype_key}", arch["eye_preset"])
    for eye in eye_objs:
        eye.data.materials.append(iris_mat)

    # 3. Eyebrows, Eyelids & Eyelashes (Multi-material: Slot 0 = Skin, Slot 1 = Brow/Hair)
    brow_obj = build_eyebrows_and_lashes(arch)
    brow_mat = create_eyebrow_eyelash_material(f"Mat_Brows_{archetype_key}", arch["hair_preset"])
    brow_obj.data.materials.append(skin_mat)
    brow_obj.data.materials.append(brow_mat)

    # 4. Hair
    hair_obj = build_hair(arch)
    hair_mat = create_hair_material(f"Mat_Hair_{archetype_key}", arch["hair_preset"])
    hair_obj.data.materials.append(hair_mat)

    # 5. Facial Hair / Beard
    beard_obj = build_beard_and_mustache(arch)
    if beard_obj:
        beard_obj.data.materials.append(hair_mat)

    # 6. Clothing Garments
    garment_objs = build_clothing(arch)
    cloth_mat_main = create_clothing_material(f"Mat_Cloth_{archetype_key}", arch["outfit_preset"], is_accent=False)
    cloth_mat_acc = create_clothing_material(f"Mat_ClothAccent_{archetype_key}", arch["outfit_preset"], is_accent=True)
    for g in garment_objs:
        g.data.materials.append(cloth_mat_main)
        g.data.materials.append(cloth_mat_acc)

    # Collect all component objects
    all_objs = [body_obj] + eye_objs + [brow_obj, hair_obj]
    if beard_obj:
        all_objs.append(beard_obj)
    all_objs.extend(garment_objs)

    # Move to character collection
    for obj in all_objs:
        for c in obj.users_collection:
            c.objects.unlink(obj)
        char_col.objects.link(obj)

    # Create root empty for positioning and grouping
    root_obj = None
    if parent_to_root:
        root_obj = bpy.data.objects.new(f"Root_{archetype_key}", None)
        root_obj.empty_display_type = 'ARROWS'
        root_obj.empty_display_size = 0.4
        char_col.objects.link(root_obj)
        root_obj.location = position_offset

        for obj in all_objs:
            obj.parent = root_obj
    else:
        ox, oy, oz = position_offset
        for obj in all_objs:
            obj.location.x += ox
            obj.location.y += oy
            obj.location.z += oz

    return {
        "archetype_key": archetype_key,
        "archetype": arch,
        "root": root_obj,
        "body": body_obj,
        "eyes": eye_objs,
        "brows": brow_obj,
        "hair": hair_obj,
        "beard": beard_obj,
        "garments": garment_objs,
        "all_objects": all_objs,
        "collection": char_col,
    }


def build_single_model_scene(archetype_key, engine='BLENDER_EEVEE', samples=48):
    """
    Sets up a complete isolated scene for one model:
    - Character at center (0, 0, 0)
    - Studio cyclorama
    - 5-point studio lighting
    - Multi-angle cameras
    - Render configuration
    """
    clear_scene()
    char = build_complete_character(archetype_key, position_offset=(0, 0, 0), parent_to_root=False)
    cyc = build_studio_cyclorama()
    lights = setup_studio_lighting(center_target=(0, 0, 1.1))
    cams = setup_cameras(target_subject=char["body"], archetype=char["archetype"], center=(0, 0, 1.0))
    configure_render_engine(samples=samples, engine=engine)
    return char, cyc, lights, cams


def build_lineup_scene(engine='BLENDER_EEVEE', samples=48):
    """
    Sets up an exhibition studio lineup scene with all 5 models standing side-by-side:
    - Marcus (Athletic Male)
    - Elena (Natural Female)
    - Viktor (Stocky Muscular Male)
    - Chloe (Slender Fashion Female)
    - Arthur (Mature Distinguished Male)
    Plus wide studio cyclorama, expansive 5-point lighting, and a panoramic lineup camera.
    """
    clear_scene()

    lineup_order = [
        ("male_stocky", -2.4),
        ("female_natural", -1.2),
        ("male_athletic", 0.0),
        ("female_slender", 1.2),
        ("male_mature", 2.4),
    ]

    characters = {}
    for key, x_pos in lineup_order:
        char = build_complete_character(key, position_offset=(x_pos, 0, 0), parent_to_root=False)
        characters[key] = char

    # Studio Cyclorama
    cyc = build_studio_cyclorama()

    # Broad Studio Lighting for the Lineup
    lights = []
    # Left Key
    lights.append(setup_studio_lighting(center_target=(-1.5, 0, 1.1)))
    # Right Key
    lights.append(setup_studio_lighting(center_target=(1.5, 0, 1.1)))

    # Panoramic Lineup Camera (Positioned in front at -Y, looking back at 0)
    cam_lineup = create_camera_pointing_at(
        name="Camera_Lineup_Pano",
        location=(0.0, -6.2, 1.20),
        target=(0.0, 0.0, 1.00),
        focal_length=42.0,
    )

    configure_render_engine(samples=samples, resolution=(2048, 1024), engine=engine)
    bpy.context.scene.camera = cam_lineup

    return characters, cyc, lights, cam_lineup


def export_scene(blend_filepath, glb_filepath=None, obj_filepath=None, export_objects=None):
    """
    Saves the current scene to .blend, and optionally exports character meshes to .glb and .obj.
    If export_objects is given, only those objects are exported to .glb and .obj (omitting background/lights).
    """
    os.makedirs(os.path.dirname(os.path.abspath(blend_filepath)), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_filepath)

    use_sel = False
    if export_objects is not None:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in export_objects:
            if obj and obj.name in bpy.data.objects:
                obj.select_set(True)
        use_sel = True

    if glb_filepath:
        os.makedirs(os.path.dirname(os.path.abspath(glb_filepath)), exist_ok=True)
        try:
            bpy.ops.export_scene.gltf(
                filepath=glb_filepath,
                export_format='GLB',
                use_selection=use_sel,
                export_apply=True,
            )
        except Exception as e:
            print(f"GLB export warning: {e}")

    if obj_filepath:
        os.makedirs(os.path.dirname(os.path.abspath(obj_filepath)), exist_ok=True)
        try:
            bpy.ops.wm.obj_export(
                filepath=obj_filepath,
                export_selected_objects=use_sel,
                apply_modifiers=True,
            )
        except Exception as e:
            print(f"OBJ export warning: {e}")
