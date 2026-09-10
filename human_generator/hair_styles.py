"""
Realistic Hairstyles, Eyebrows, Eyelashes, and Facial Hair for Blender.
Constructs organic hair geometry tailored to each character archetype:
- Athletic Crew Cut with Fade
- Feminine High Ponytail with Hair Tie
- Modern Volumetric Undercut
- Long Flowing Shoulder-Length Wavy Hair
- Classic Mature Side-Part
- 3D Anatomical Beard, Stubble, and Mustache
- Delicate Eyebrows and Eyelashes
"""

import math
import bpy
import bmesh
from mathutils import Vector
from .anatomy_mesh import create_uv_sphere, create_quad_cylinder
from .config import SKIN_PRESETS


def build_eyebrows_and_lashes(archetype):
    """
    Creates anatomical eyelids (upper and lower fleshy rims), arched volumetric eyebrows,
    and delicate eyelashes conforming perfectly to the skull and eyeball positioning.
    Multi-material architecture:
    - Material slot 0: Skin material (fleshy eyelids with living color attribute)
    - Material slot 1: Eyebrow & eyelash hair material (dark keratin fiber)
    """
    h_top = archetype["height"]
    h_len = archetype["head_length"]
    ipd = 0.063
    eye_z = h_top - 0.56 * h_len
    eye_y = -0.048

    mesh = bpy.data.meshes.new("Eyebrows_Lashes")
    obj = bpy.data.objects.new("Eyebrows_Lashes", mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()

    for sign in (-1, 1):
        ex = sign * (ipd * 0.5)

        # -------------------------------------------------------------
        # A. UPPER EYELID (Fleshy hood overlapping top 18-20% of iris)
        # Material slot 0 (Skin)
        # -------------------------------------------------------------
        num_lid_pts = 12
        upper_lid_rings = []
        for i in range(num_lid_pts):
            t = i / (num_lid_pts - 1)
            ang = math.pi * (0.08 + 0.84 * t)
            lx = ex + math.cos(ang) * 0.0135 * sign
            # Apex peaks slightly medial of center, drops over iris top
            lz = eye_z + 0.0028 + math.sin(t * math.pi) * 0.0055
            ly = eye_y - math.sin(ang) * 0.0125 - 0.0012
            thick = 0.0020 * (1.0 - abs(t - 0.5) * 0.35)

            pts = []
            for s in range(6):
                a = s / 6.0 * 2 * math.pi
                pts.append(bm.verts.new(Vector((
                    lx + math.cos(a) * thick * 0.85,
                    ly + math.sin(a) * thick,
                    lz + math.sin(a) * thick * 0.65,
                ))))
            upper_lid_rings.append(pts)

        for r in range(len(upper_lid_rings) - 1):
            for s in range(6):
                s_next = (s + 1) % 6
                f = bm.faces.new((
                    upper_lid_rings[r][s],
                    upper_lid_rings[r + 1][s],
                    upper_lid_rings[r + 1][s_next],
                    upper_lid_rings[r][s_next],
                ))
                f.material_index = 0

        # Cap ends of upper eyelid
        v_u_start = bm.verts.new(Vector((upper_lid_rings[0][0].co.x, upper_lid_rings[0][0].co.y, upper_lid_rings[0][0].co.z)))
        v_u_end = bm.verts.new(Vector((upper_lid_rings[-1][0].co.x, upper_lid_rings[-1][0].co.y, upper_lid_rings[-1][0].co.z)))
        for s in range(6):
            s_next = (s + 1) % 6
            f1 = bm.faces.new((v_u_start, upper_lid_rings[0][s_next], upper_lid_rings[0][s]))
            f2 = bm.faces.new((v_u_end, upper_lid_rings[-1][s], upper_lid_rings[-1][s_next]))
            f1.material_index = 0
            f2.material_index = 0

        # -------------------------------------------------------------
        # B. LOWER EYELID (Fleshy cradle along bottom edge of eyeball)
        # Material slot 0 (Skin)
        # -------------------------------------------------------------
        lower_lid_rings = []
        for i in range(num_lid_pts):
            t = i / (num_lid_pts - 1)
            ang = math.pi * (0.10 + 0.80 * t)
            lx = ex + math.cos(ang) * 0.0132 * sign
            lz = eye_z - 0.0050 - math.sin(t * math.pi) * 0.0030
            ly = eye_y - math.sin(ang) * 0.0120 - 0.0008
            thick = 0.0016 * (1.0 - abs(t - 0.5) * 0.35)

            pts = []
            for s in range(6):
                a = s / 6.0 * 2 * math.pi
                pts.append(bm.verts.new(Vector((
                    lx + math.cos(a) * thick * 0.85,
                    ly + math.sin(a) * thick,
                    lz + math.sin(a) * thick * 0.65,
                ))))
            lower_lid_rings.append(pts)

        for r in range(len(lower_lid_rings) - 1):
            for s in range(6):
                s_next = (s + 1) % 6
                f = bm.faces.new((
                    lower_lid_rings[r][s],
                    lower_lid_rings[r + 1][s],
                    lower_lid_rings[r + 1][s_next],
                    lower_lid_rings[r][s_next],
                ))
                f.material_index = 0

        v_l_start = bm.verts.new(Vector((lower_lid_rings[0][0].co.x, lower_lid_rings[0][0].co.y, lower_lid_rings[0][0].co.z)))
        v_l_end = bm.verts.new(Vector((lower_lid_rings[-1][0].co.x, lower_lid_rings[-1][0].co.y, lower_lid_rings[-1][0].co.z)))
        for s in range(6):
            s_next = (s + 1) % 6
            f1 = bm.faces.new((v_l_start, lower_lid_rings[0][s_next], lower_lid_rings[0][s]))
            f2 = bm.faces.new((v_l_end, lower_lid_rings[-1][s], lower_lid_rings[-1][s_next]))
            f1.material_index = 0
            f2.material_index = 0

        # -------------------------------------------------------------
        # C. UPPER EYELASHES (Fine hair fiber rim along upper eyelid)
        # Material slot 1 (Brow/Hair)
        # -------------------------------------------------------------
        num_lash_pts = 10
        lash_rings = []
        for i in range(num_lash_pts):
            t = i / (num_lash_pts - 1)
            ang = math.pi * (0.09 + 0.82 * t)
            lx = ex + math.cos(ang) * 0.0137 * sign
            lz = eye_z + 0.0034 + math.sin(t * math.pi) * 0.0057
            ly = eye_y - math.sin(ang) * 0.0128 - 0.0022
            l_thick = 0.0011 * (1.0 - abs(t - 0.5) * 0.45)

            pts = []
            for s in range(6):
                a = s / 6.0 * 2 * math.pi
                pts.append(bm.verts.new(Vector((
                    lx + math.cos(a) * l_thick * 0.9,
                    ly + math.sin(a) * l_thick,
                    lz + math.sin(a) * l_thick * 0.6,
                ))))
            lash_rings.append(pts)

        for r in range(len(lash_rings) - 1):
            for s in range(6):
                s_next = (s + 1) % 6
                f = bm.faces.new((
                    lash_rings[r][s],
                    lash_rings[r + 1][s],
                    lash_rings[r + 1][s_next],
                    lash_rings[r][s_next],
                ))
                f.material_index = 1

        # -------------------------------------------------------------
        # D. ARCHED VOLUMETRIC EYEBROWS (Following supraorbital brow ridge)
        # Material slot 1 (Brow/Hair)
        # -------------------------------------------------------------
        brow_z = eye_z + 0.024
        brow_y = eye_y - 0.016
        num_brow_pts = 14
        brow_rings = []
        for i in range(num_brow_pts):
            t = i / (num_brow_pts - 1)
            bx = sign * (0.012 + t * 0.052)
            bz = brow_z + math.sin(t * math.pi) * 0.0080 - t * 0.0060
            by = brow_y - math.cos(t * math.pi * 0.5) * 0.0060 + (t ** 1.5) * 0.0180
            b_thick = (0.0046 if t < 0.35 else 0.0052) * (1.0 - t * 0.60)

            pts = []
            for s in range(8):
                ang = s / 8.0 * 2 * math.pi
                px = bx + math.cos(ang) * b_thick * 0.90
                py = by + math.sin(ang) * b_thick * 0.70
                pz = bz + math.cos(ang) * b_thick * 0.50
                pts.append(bm.verts.new(Vector((px, py, pz))))
            brow_rings.append(pts)

        for r in range(len(brow_rings) - 1):
            for s in range(8):
                s_next = (s + 1) % 8
                f = bm.faces.new((
                    brow_rings[r][s],
                    brow_rings[r + 1][s],
                    brow_rings[r + 1][s_next],
                    brow_rings[r][s_next],
                ))
                f.material_index = 1

        v_b_start = bm.verts.new(Vector((brow_rings[0][0].co.x, brow_rings[0][0].co.y, brow_rings[0][0].co.z)))
        v_b_end = bm.verts.new(Vector((brow_rings[-1][0].co.x, brow_rings[-1][0].co.y, brow_rings[-1][0].co.z)))
        for s in range(8):
            s_next = (s + 1) % 8
            f1 = bm.faces.new((v_b_start, brow_rings[0][s_next], brow_rings[0][s]))
            f2 = bm.faces.new((v_b_end, brow_rings[-1][s], brow_rings[-1][s_next]))
            f1.material_index = 1
            f2.material_index = 1

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    for p in mesh.polygons:
        p.use_smooth = True

    # Color attribute for eyelid skin shading
    skin_p = SKIN_PRESETS.get(archetype.get("skin_preset"), SKIN_PRESETS["fair_warm"])
    base_skin = skin_p["base_color"]
    color_attr = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    for i in range(len(mesh.vertices)):
        color_attr.data[i].color = base_skin

    subsurf = obj.modifiers.new(name="Subsurf", type="SUBSURF")
    subsurf.levels = 1
    subsurf.render_levels = 2
    return obj


def build_cranial_hair_shell(bm, archetype, style="crew_cut"):
    """
    Constructs an anatomical cranial hair shell conforming accurately to the skull,
    with generous volume above the cranium and a natural human hairline
    (forehead front, temporal recessions, sideburns, nape).
    Normals point strictly outwards.
    """
    h = archetype["height"]
    h_len = archetype["head_length"]
    h_chin = h - h_len
    h_top = h

    # Cranium dimensions (fitted with generous clearance outside skull to prevent any clipping)
    rx_base = 0.385 * h_len
    ry_front = 0.420 * h_len
    ry_back = 0.480 * h_len
    cy_off = 0.020 * h_len

    num_rings = 12
    num_segs = 32
    rings = []

    # Extra volume depending on hairstyle
    style_crown_lift = 0.022
    if style in ("undercut", "side_part"):
        style_crown_lift = 0.034
    elif style == "crew_cut":
        style_crown_lift = 0.024
    elif style in ("ponytail", "long_wavy"):
        style_crown_lift = 0.026

    for ir in range(num_rings):
        frac = ir / (num_rings - 1)  # 0 at crown vertex, 1 at hairline rim
        pts = []
        for s in range(num_segs):
            ang = s / num_segs * 2 * math.pi
            ca = math.cos(ang)
            sa = math.sin(ang)  # sa < 0 is anterior (-Y), sa > 0 is posterior (+Y)

            scale_r = math.sin(frac * math.pi * 0.5)

            rx = rx_base * (0.28 + 0.82 * scale_r)
            ry = (ry_front if sa <= 0 else ry_back) * (0.28 + 0.82 * scale_r)

            # Hairline boundary drop along Z:
            if sa < -0.15:
                # Anterior / Forehead: hairline sits natural and close to forehead
                temporal = 0.005 * math.cos(ca * math.pi * 1.5) if abs(ca) < 0.7 else -0.003
                z_drop = 0.36 * h_len + temporal
            elif sa < 0.2:
                # Sides / Sideburns
                z_drop = 0.44 * h_len
            else:
                # Posterior / Nape
                z_drop = 0.50 * h_len

            z = (h_top + style_crown_lift) - frac * z_drop

            # Style-specific volume shaping
            if style == "side_part":
                # Parting at x = -0.03, volume swept towards +X
                if ca > -0.3:
                    z += 0.012 * (1.0 - frac) * (ca + 0.3)
            elif style == "undercut":
                # High volume pompadour on top, tight sides
                if frac < 0.6:
                    z += 0.016 * ((0.6 - frac) / 0.6) ** 1.2
            elif style == "crew_cut":
                if frac < 0.5:
                    z += 0.006 * (1.0 - frac * 2.0)

            # Natural cranial curvature with subtle, smooth hairline feathering
            x = ca * rx * (0.97 if frac > 0.85 and sa < -0.15 else 1.0)
            y = cy_off + sa * ry + (0.002 if sa <= 0 else 0.002)

            pts.append(bm.verts.new(Vector((x, y, z))))
        rings.append(pts)

    # Faces between rings (ordered to ensure outward normals)
    for r in range(len(rings) - 1):
        for s in range(num_segs):
            s_next = (s + 1) % num_segs
            bm.faces.new((rings[r][s], rings[r + 1][s], rings[r + 1][s_next], rings[r][s_next]))

    # Cap top crown pole (ordered to ensure outward normals)
    v_crown = bm.verts.new(Vector((0, cy_off, h_top + style_crown_lift + 0.006)))
    for s in range(num_segs):
        s_next = (s + 1) % num_segs
        bm.faces.new((v_crown, rings[0][s], rings[0][s_next]))


def build_hair(archetype):
    """
    Generates the hairstyle designated in the archetype config.
    """
    h = archetype["height"]
    h_len = archetype["head_length"]
    h_chin = h - h_len
    h_center = h_chin + h_len * 0.55
    style = archetype.get("hair_style", "crew_cut")

    mesh = bpy.data.meshes.new(f"Hair_{style}")
    obj = bpy.data.objects.new(f"Hair_{style}", mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()

    skull_z = h_center + h_len * 0.12
    skull_y = h_len * 0.10

    # 1. Base Anatomical Cranial Hair Shell (Common to all styles, with outward normals)
    build_cranial_hair_shell(bm, archetype, style=style)

    # 2. Style-Specific Additional Flow Geometry
    if style == "ponytail":
        # Hair tie band
        tie_z = skull_z + h_len * 0.22
        tie_y = skull_y + h_len * 0.44
        create_uv_sphere(
            bm,
            center=(0, tie_y, tie_z),
            radius=h_len * 0.065,
            u_segs=12,
            v_segs=8,
            scale=(1.1, 0.6, 1.1),
        )
        # Cascading ponytail hair bundle flowing backwards and downwards
        pony_rings = [
            (tie_z, tie_y, 0.038, 0.038),
            (tie_z - 0.08, tie_y + 0.04, 0.048, 0.044),
            (tie_z - 0.18, tie_y + 0.06, 0.052, 0.042),
            (tie_z - 0.28, tie_y + 0.05, 0.040, 0.032),
            (tie_z - 0.38, tie_y + 0.03, 0.022, 0.016),
            (tie_z - 0.45, tie_y + 0.01, 0.010, 0.008),  # Tapered tip
        ]
        pony_secs = []
        for z, y, rx, rz in pony_rings:
            pts = []
            for s in range(12):
                ang = s / 12 * 2 * math.pi
                pts.append((rx * math.cos(ang), y + rz * math.sin(ang)))
            pony_secs.append((z, pts))
        create_quad_cylinder(bm, pony_secs, caps=(True, True))

    elif style == "long_wavy":
        # Left and Right cascading wavy locks over shoulders
        for sign in (-1, 1):
            lock_rings = [
                # (z, x, y, radius)
                (skull_z + 0.08, sign * 0.075, skull_y - 0.01, 0.036),
                (skull_z - 0.04, sign * 0.105, skull_y + 0.02, 0.045),
                (skull_z - 0.16, sign * 0.115, -0.01, 0.048),
                (skull_z - 0.28, sign * 0.120, -0.035, 0.044),
                (skull_z - 0.40, sign * 0.110, -0.040, 0.035),
                (skull_z - 0.50, sign * 0.095, -0.030, 0.018),
            ]
            lock_secs = []
            for z, x, y, r in lock_rings:
                pts = []
                for s in range(10):
                    ang = s / 10 * 2 * math.pi
                    pts.append((x + r * math.cos(ang), y + r * math.sin(ang)))
                lock_secs.append((z, pts))
            create_quad_cylinder(bm, lock_secs, caps=(True, True))

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    for p in mesh.polygons:
        p.use_smooth = True

    subsurf = obj.modifiers.new(name="Subsurf", type="SUBSURF")
    subsurf.levels = 1
    subsurf.render_levels = 1
    return obj


def build_beard_and_mustache(archetype):
    """
    Constructs 3D sculpted beard and mustache for characters configured with facial hair.
    """
    if not archetype.get("has_beard", False):
        return None

    h = archetype["height"]
    h_len = archetype["head_length"]
    h_chin = h - h_len
    has_full_beard = archetype.get("has_beard", False)

    mesh = bpy.data.meshes.new("Facial_Hair")
    obj = bpy.data.objects.new("Facial_Hair", mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()

    # 1. Continuous sculpted mustache
    z_mouth = h_chin + h_len * 0.22
    y_mouth = -h_len * 0.448
    thick_m = 0.0055 * (1.3 if has_full_beard else 0.7)
    must_rings = []
    num_m = 10
    for i in range(num_m):
        t = i / (num_m - 1)
        mx = (t - 0.5) * 2.0 * (0.028 if has_full_beard else 0.022)
        mz = z_mouth - (abs(t - 0.5) * 2.0) ** 2 * 0.005
        my = y_mouth - math.cos((t - 0.5) * math.pi) * 0.004
        cur_thick = thick_m * (1.0 - (abs(t - 0.5) * 2.0) ** 2 * 0.6)
        pts = []
        for s in range(6):
            a = s / 6 * 2 * math.pi
            pts.append(bm.verts.new(Vector((mx, my + math.cos(a) * cur_thick, mz + math.sin(a) * cur_thick))))
        must_rings.append(pts)

    for r in range(len(must_rings) - 1):
        for s in range(6):
            s_next = (s + 1) % 6
            bm.faces.new((must_rings[r][s], must_rings[r + 1][s], must_rings[r + 1][s_next], must_rings[r][s_next]))

    # 2. Chin Beard & Jawline Beard
    if has_full_beard:
        # Full chin beard projection
        create_uv_sphere(
            bm,
            center=(0, -h_len * 0.475, h_chin + h_len * 0.01),
            radius=h_len * 0.09,
            u_segs=12,
            v_segs=8,
            scale=(1.3, 1.1, 1.2),
        )
        # Left & Right Jawline beard wings
        for sign in (-1, 1):
            create_uv_sphere(
                bm,
                center=(sign * h_len * 0.20, -h_len * 0.22, h_chin + h_len * 0.10),
                radius=h_len * 0.075,
                u_segs=10,
                v_segs=8,
                scale=(0.7, 1.3, 1.1),
            )

    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    for p in mesh.polygons:
        p.use_smooth = True

    subsurf = obj.modifiers.new(name="Subsurf", type="SUBSURF")
    subsurf.levels = 1
    subsurf.render_levels = 1
    return obj
