"""
Realistic Form-Fitting Garments and Clothing for Blender Human Models.
Constructs apparel conforming to anatomical proportions:
- Athletic Compression Shorts
- Sports Bra & High-Waisted Seamless Leggings
- Heavyweight Cargo / Athletic Shorts
- Fashion Crop Top & Tights
- Smart Casual Crewneck & Chino Pants
"""

import math
import bpy
import bmesh
from mathutils import Vector
from .anatomy_mesh import create_quad_cylinder, create_uv_sphere


def build_clothing(archetype):
    """
    Constructs the garments specified in archetype['outfit_type'].
    Returns a list of garment Blender mesh objects.
    """
    outfit = archetype.get("outfit_type", "athletic_shorts")
    h = archetype["height"]
    h_len = archetype["head_length"]
    sh_w = archetype["shoulder_width"]
    ch_w = archetype["chest_width"]
    ch_d = archetype["chest_depth"]
    w_w = archetype["waist_width"]
    w_d = archetype["waist_depth"]
    hip_w = archetype["hip_width"]
    hip_d = archetype["hip_depth"]
    leg_thick = archetype.get("leg_thickness", 1.0)

    garment_objects = []

    # Reference anatomical landmarks
    z_chest = h - h_len * 2.15
    z_underbust = h - h_len * 2.50
    z_navel = h - h_len * 3.15
    z_iliac = h - h_len * 3.65
    z_crotch = h - h_len * 4.05
    z_midthigh = h - h_len * 4.90
    z_knee = h - h_len * 5.95
    z_ankle = h - h_len * 7.55

    if outfit in ("athletic_shorts", "cargo_shorts"):
        # Shorts covering waist down to mid-thigh/knee
        mesh = bpy.data.meshes.new("Garment_Shorts")
        obj = bpy.data.objects.new("Garment_Shorts", mesh)
        bpy.context.collection.objects.link(obj)

        bm = bmesh.new()
        # Waistband & Hip section
        z_bot_shorts = z_knee + 0.05 if outfit == "cargo_shorts" else z_midthigh
        clearance = 0.012 if outfit == "cargo_shorts" else 0.007

        shorts_rings = [
            # (z, width, depth)
            (z_navel + 0.02, w_w * 1.06 + clearance, w_d * 1.06 + clearance),
            (z_iliac, hip_w * 0.94 + clearance, hip_d * 0.94 + clearance),
            (z_crotch + 0.04, hip_w * 1.04 + clearance, hip_d * 1.04 + clearance),
            (z_crotch, hip_w * 0.92 + clearance, hip_d * 0.92 + clearance),
        ]
        shorts_rings.reverse()
        secs = []
        for z, w, d in shorts_rings:
            pts = []
            for s in range(16):
                ang = s / 16 * 2 * math.pi
                pts.append((math.cos(ang) * w * 0.5, math.sin(ang) * d * 0.5))
            secs.append((z, pts))
        create_quad_cylinder(bm, secs, caps=(True, False))

        # Left and Right Leg Sleeves
        for sign in (-1, 1):
            lx = sign * (hip_w * 0.25)
            leg_r = 0.115 * leg_thick + clearance
            sleeve_rings = [
                (z_crotch, lx, leg_r * 1.05),
                (z_crotch - 0.12, lx, leg_r * 1.02),
                (z_bot_shorts, lx, leg_r * 0.96),
            ]
            sleeve_rings.reverse()
            lsecs = []
            for z, x, r in sleeve_rings:
                pts = []
                for s in range(12):
                    ang = s / 12 * 2 * math.pi
                    pts.append((x + r * math.cos(ang), r * math.sin(ang)))
                lsecs.append((z, pts))
            create_quad_cylinder(bm, lsecs, caps=(False, True))

        bm.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()

        for p in mesh.polygons:
            p.use_smooth = True
        sub = obj.modifiers.new(name="Subsurf", type="SUBSURF")
        sub.levels = 1
        sub.render_levels = 1
        garment_objects.append(obj)

    elif outfit in ("sports_bra_leggings", "crop_top_tights"):
        # Top (Sports Bra / Crop Top)
        mesh_top = bpy.data.meshes.new("Garment_Top")
        obj_top = bpy.data.objects.new("Garment_Top", mesh_top)
        bpy.context.collection.objects.link(obj_top)

        bm_top = bmesh.new()
        z_top_start = z_chest + (0.08 if outfit == "crop_top_tights" else 0.03)
        z_top_end = z_navel + (0.05 if outfit == "crop_top_tights" else 0.14)
        top_rings = [
            (z_top_start, ch_w * 0.92 + 0.006, ch_d * 0.92 + 0.006),
            (z_chest, ch_w * 1.03 + 0.008, ch_d * 1.08 + 0.008),
            (z_underbust, ch_w * 0.94 + 0.006, ch_d * 0.94 + 0.006),
            (z_top_end, w_w * 1.04 + 0.006, w_d * 1.04 + 0.006),
        ]
        top_secs = []
        for z, w, d in top_rings:
            pts = []
            for s in range(16):
                ang = s / 16 * 2 * math.pi
                pts.append((math.cos(ang) * w * 0.5, math.sin(ang) * d * 0.5))
            top_secs.append((z, pts))
        create_quad_cylinder(bm_top, top_secs, caps=(True, True))

        bm_top.normal_update()
        bmesh.ops.recalc_face_normals(bm_top, faces=bm_top.faces)
        bm_top.to_mesh(mesh_top)
        bm_top.free()
        for p in mesh_top.polygons:
            p.use_smooth = True
        sub_top = obj_top.modifiers.new(name="Subsurf", type="SUBSURF")
        sub_top.levels = 1
        sub_top.render_levels = 1
        garment_objects.append(obj_top)

        # Bottom (Leggings / Tights down to ankle)
        mesh_bot = bpy.data.meshes.new("Garment_Leggings")
        obj_bot = bpy.data.objects.new("Garment_Leggings", mesh_bot)
        bpy.context.collection.objects.link(obj_bot)

        bm_bot = bmesh.new()
        # Waist / Pelvis
        bot_rings = [
            (z_navel + 0.04, w_w * 1.03 + 0.004, w_d * 1.03 + 0.004),
            (z_iliac, hip_w * 0.92 + 0.004, hip_d * 0.92 + 0.004),
            (z_crotch, hip_w * 0.88 + 0.004, hip_d * 0.88 + 0.004),
        ]
        bsecs = []
        for z, w, d in bot_rings:
            pts = []
            for s in range(16):
                ang = s / 16 * 2 * math.pi
                pts.append((math.cos(ang) * w * 0.5, math.sin(ang) * d * 0.5))
            bsecs.append((z, pts))
        create_quad_cylinder(bm_bot, bsecs, caps=(True, False))

        # Full Legs down to ankles
        for sign in (-1, 1):
            lx = sign * (hip_w * 0.25)
            leg_rings = [
                (z_crotch, lx, 0.110 * leg_thick + 0.004),
                (z_knee + 0.05, lx, 0.082 * leg_thick + 0.004),
                (z_knee, lx, 0.072 * leg_thick + 0.004),
                (z_knee - 0.15, lx, 0.086 * leg_thick + 0.004),
                (z_ankle + 0.04, lx, 0.048 * leg_thick + 0.004),
            ]
            lsecs = []
            for z, x, r in leg_rings:
                pts = []
                for s in range(12):
                    ang = s / 12 * 2 * math.pi
                    pts.append((x + r * math.cos(ang), r * math.sin(ang)))
                lsecs.append((z, pts))
            create_quad_cylinder(bm_bot, lsecs, caps=(False, True))

        bm_bot.normal_update()
        bmesh.ops.recalc_face_normals(bm_bot, faces=bm_bot.faces)
        bm_bot.to_mesh(mesh_bot)
        bm_bot.free()
        for p in mesh_bot.polygons:
            p.use_smooth = True
        sub_bot = obj_bot.modifiers.new(name="Subsurf", type="SUBSURF")
        sub_bot.levels = 1
        sub_bot.render_levels = 1
        garment_objects.append(obj_bot)

    elif outfit == "smart_casual":
        # T-Shirt + Chinos
        mesh_shirt = bpy.data.meshes.new("Garment_Shirt")
        obj_shirt = bpy.data.objects.new("Garment_Shirt", mesh_shirt)
        bpy.context.collection.objects.link(obj_shirt)

        bm_s = bmesh.new()
        z_acromion = h - h_len * 1.65
        shirt_rings = [
            (z_acromion - 0.02, ch_w * 0.98 + 0.012, ch_d * 0.95 + 0.012),
            (z_chest, ch_w * 1.05 + 0.014, ch_d * 1.04 + 0.014),
            (z_navel, w_w * 1.10 + 0.014, w_d * 1.08 + 0.014),
            (z_iliac, hip_w * 0.96 + 0.014, hip_d * 0.94 + 0.014),
        ]
        ssecs = []
        for z, w, d in shirt_rings:
            pts = []
            for s in range(16):
                ang = s / 16 * 2 * math.pi
                pts.append((math.cos(ang) * w * 0.5, math.sin(ang) * d * 0.5))
            ssecs.append((z, pts))
        create_quad_cylinder(bm_s, ssecs, caps=(True, True))
        bm_s.normal_update()
        bmesh.ops.recalc_face_normals(bm_s, faces=bm_s.faces)
        bm_s.to_mesh(mesh_shirt)
        bm_s.free()
        for p in mesh_shirt.polygons:
            p.use_smooth = True
        sub_s = obj_shirt.modifiers.new(name="Subsurf", type="SUBSURF")
        sub_s.levels = 1
        sub_s.render_levels = 1
        garment_objects.append(obj_shirt)

        # Chino Pants
        mesh_pants = bpy.data.meshes.new("Garment_Pants")
        obj_pants = bpy.data.objects.new("Garment_Pants", mesh_pants)
        bpy.context.collection.objects.link(obj_pants)

        bm_p = bmesh.new()
        pants_rings = [
            (z_iliac + 0.02, hip_w * 0.96 + 0.012, hip_d * 0.94 + 0.012),
            (z_crotch, hip_w * 0.92 + 0.012, hip_d * 0.90 + 0.012),
        ]
        psecs = []
        for z, w, d in pants_rings:
            pts = []
            for s in range(16):
                ang = s / 16 * 2 * math.pi
                pts.append((math.cos(ang) * w * 0.5, math.sin(ang) * d * 0.5))
            psecs.append((z, pts))
        create_quad_cylinder(bm_p, psecs, caps=(True, False))

        for sign in (-1, 1):
            lx = sign * (hip_w * 0.25)
            pleg_rings = [
                (z_crotch, lx, 0.118 * leg_thick + 0.010),
                (z_knee, lx, 0.088 * leg_thick + 0.010),
                (z_ankle + 0.03, lx, 0.062 * leg_thick + 0.010),
            ]
            plsecs = []
            for z, x, r in pleg_rings:
                pts = []
                for s in range(12):
                    ang = s / 12 * 2 * math.pi
                    pts.append((x + r * math.cos(ang), r * math.sin(ang)))
                plsecs.append((z, pts))
            create_quad_cylinder(bm_p, plsecs, caps=(False, True))

        bm_p.normal_update()
        bmesh.ops.recalc_face_normals(bm_p, faces=bm_p.faces)
        bm_p.to_mesh(mesh_pants)
        bm_p.free()
        for p in mesh_pants.polygons:
            p.use_smooth = True
        sub_p = obj_pants.modifiers.new(name="Subsurf", type="SUBSURF")
        sub_p.levels = 1
        sub_p.render_levels = 1
        garment_objects.append(obj_pants)

    return garment_objects
