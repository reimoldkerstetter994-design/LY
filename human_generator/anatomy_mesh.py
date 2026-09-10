"""
Realistic Classical Anatomical Human Body Mesh Generator for Blender.
Constructs quad-dominant anatomical meshes with classical 8-head canon proportions,
detailed 3D sculpted facial features, living skin color zoning (Color Attribute),
articulated 5-finger hands, 5-toe feet, and organic curvature suitable for Subdivision Surface modeling.
"""

import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from .config import SKIN_PRESETS


def create_quad_cylinder(bm, cross_sections, caps=(True, True)):
    """
    Creates a smooth quad mesh from a series of (z, [(x, y), ...]) cross-sections.
    cross_sections: list of tuples: (z_height, list_of_xy_tuples)
    Each cross-section must have the same number of points.
    caps: (cap_bottom, cap_top)
    """
    num_rings = len(cross_sections)
    if num_rings < 2:
        return []

    num_segs = len(cross_sections[0][1])
    ring_verts = []

    for z, pts in cross_sections:
        ring = [bm.verts.new(Vector((x, y, z))) for x, y in pts]
        ring_verts.append(ring)

    # Faces between rings
    for r in range(num_rings - 1):
        for s in range(num_segs):
            s_next = (s + 1) % num_segs
            v1 = ring_verts[r][s]
            v2 = ring_verts[r][s_next]
            v3 = ring_verts[r + 1][s_next]
            v4 = ring_verts[r + 1][s]
            bm.faces.new((v1, v4, v3, v2))

    # Cap first cross section (bottom)
    if caps[0] and num_segs >= 4:
        center_bot = bm.verts.new(Vector((0, 0, cross_sections[0][0])))
        for s in range(num_segs):
            s_next = (s + 1) % num_segs
            bm.faces.new((center_bot, ring_verts[0][s_next], ring_verts[0][s]))

    # Cap last cross section (top)
    if caps[1] and num_segs >= 4:
        center_top = bm.verts.new(Vector((0, 0, cross_sections[-1][0])))
        for s in range(num_segs):
            s_next = (s + 1) % num_segs
            bm.faces.new((center_top, ring_verts[-1][s], ring_verts[-1][s_next]))

    return ring_verts


def create_uv_sphere(bm, center=(0, 0, 0), radius=1.0, u_segs=16, v_segs=12, scale=(1, 1, 1)):
    """Creates a quad-dominant UV sphere with optional non-uniform scaling."""
    cx, cy, cz = center
    sx, sy, sz = scale
    v_rings = []

    # Bottom pole
    v_bot = bm.verts.new(Vector((cx, cy, cz - radius * sz)))

    for v in range(1, v_segs):
        phi = -math.pi / 2 + (v / v_segs) * math.pi
        z = cz + radius * math.sin(phi) * sz
        r_xy = radius * math.cos(phi)
        ring = []
        for u in range(u_segs):
            theta = (u / u_segs) * 2 * math.pi
            x = cx + r_xy * math.cos(theta) * sx
            y = cy + r_xy * math.sin(theta) * sy
            ring.append(bm.verts.new(Vector((x, y, z))))
        v_rings.append(ring)

    # Top pole
    v_top = bm.verts.new(Vector((cx, cy, cz + radius * sz)))

    # Connect bottom pole
    for u in range(u_segs):
        u_next = (u + 1) % u_segs
        bm.faces.new((v_bot, v_rings[0][u_next], v_rings[0][u]))

    # Connect intermediate rings
    for v in range(len(v_rings) - 1):
        for u in range(u_segs):
            u_next = (u + 1) % u_segs
            bm.faces.new((v_rings[v][u], v_rings[v][u_next], v_rings[v + 1][u_next], v_rings[v + 1][u]))

    # Connect top pole
    for u in range(u_segs):
        u_next = (u + 1) % u_segs
        bm.faces.new((v_top, v_rings[-1][u], v_rings[-1][u_next]))


def generate_anatomical_head(bm, archetype):
    """
    Constructs an anatomically realistic head and neck based on classical 8-head canon:
    - Spherical vault cranium (neurocranium) with zero apex conical slope
    - Frontal bone & supraorbital brow ridge
    - Recessed orbital eye sockets perfectly accommodating 24mm eyeballs
    - Sculpted 3D nose with bridge, lobule tip, alar wings, and nostril cavities
    - Philtrum groove, Cupid's bow upper lip, oral cleft, and dual-cushion lower lip
    - Mentolabial sulcus, chin mental protuberance, and tapered mandible
    - Anatomical neck with thyroid cartilage (Adam's apple), SCM columns, and suprasternal notch
    - Ears placed accurately between brow line and nose base
    """
    h_top = archetype["height"]
    h_len = archetype["head_length"]
    h_chin = h_top - h_len
    z_pit = h_top - 1.28 * h_len  # Base of neck / Suprasternal notch
    gender = archetype["gender"]
    jaw_w = archetype.get("jaw_width", 1.0)
    jaw_sq = archetype.get("jaw_squareness", 0.5)
    chin_prom = archetype.get("chin_prominence", 1.0)

    num_z = 80
    num_th = 64
    rings = []

    for iz in range(num_z):
        if iz <= 60:
            # HEAD ZONE (Crown z=h_top down to Chin z=h_chin)
            fh = iz / 60.0  # 0.0 at crown, 1.0 at chin
            z = h_top - fh * h_len

            # C1 Continuous Cranium Dome and Facial Profile
            if fh < 0.40:
                t_dome = fh / 0.40
                rad_dome = math.sqrt(max(0.0, 1.0 - (1.0 - t_dome) ** 2))
                rx = 0.075 * (0.10 + 0.90 * rad_dome)
                ry_front = 0.082 * (0.10 + 0.90 * rad_dome)
                ry_back = 0.100 * (0.10 + 0.90 * rad_dome)
                y_center = 0.008 * rad_dome
            else:
                tf = (fh - 0.40) / 0.60
                w_jaw = 0.052 * jaw_w
                w_chin = 0.028 * jaw_sq + 0.008
                if tf < 0.20:
                    rx = 0.075 - 0.002 * math.sin(tf / 0.20 * math.pi)
                elif tf < 0.70:
                    tau = (tf - 0.20) / 0.50
                    rx = 0.075 * (1.0 - tau) + w_jaw * tau
                else:
                    tau = (tf - 0.70) / 0.30
                    rx = w_jaw * (1.0 - tau) + w_chin * tau
                ry_front = 0.082 - 0.012 * tf
                ry_back = 0.100 - 0.045 * tf
                y_center = 0.008 - 0.016 * tf
        else:
            # NECK ZONE (Chin z=h_chin down to Suprasternal Notch z=z_pit)
            tn = (iz - 60) / 19.0  # 0.0 under chin, 1.0 at clavicle/suprasternal notch
            z = h_chin - tn * (h_chin - z_pit)
            # Neck widens from r=46mm under chin to r=72mm at base
            rx = 0.046 + tn * 0.026
            ry_front = 0.052 + tn * 0.012
            ry_back = 0.055 + tn * 0.023
            y_center = -0.008 + tn * 0.024

        pts = []
        for it in range(num_th):
            th = it / num_th * 2 * math.pi
            ca = math.cos(th)
            sa = math.sin(th)  # sa < 0 is anterior (-Y), sa >= 0 is posterior (+Y)
            
            x = ca * rx
            y_base = y_center + sa * (ry_front if sa <= 0 else ry_back)
            
            y_disp = 0.0
            z_disp = 0.0
            
            # Facial Feature Sculpting (Head zone: iz <= 60, anterior: sa < -0.15)
            if iz <= 60 and sa < -0.15:
                fh = iz / 60.0
                
                # 1. Brow Ridge & Glabella (fh in [0.44, 0.52])
                if 0.44 <= fh <= 0.52 and abs(x) < 0.062:
                    b_prof = math.sin((fh - 0.44) / 0.08 * math.pi)
                    y_disp -= 0.018 * b_prof * math.exp(-((x / 0.038) ** 2))
                    
                # 2. Eye Orbit Recesses (fh in [0.50, 0.62], |x| in [0.015, 0.052])
                if 0.50 <= fh <= 0.62 and 0.015 < abs(x) < 0.052:
                    ex = (abs(x) - 0.0315) / 0.018
                    ey = (fh - 0.56) / 0.06
                    r_orb = math.sqrt(ex ** 2 + ey ** 2)
                    if r_orb < 1.0:
                        y_disp += 0.020 * (1.0 - r_orb ** 2)
                        
                # 3. Zygomatic Cheekbones (fh in [0.54, 0.70], |x| in [0.038, 0.075])
                if 0.54 <= fh <= 0.70 and 0.038 < abs(x) < 0.075:
                    ch_x = (abs(x) - 0.056) / 0.016
                    ch_y = (fh - 0.62) / 0.08
                    y_disp -= 0.014 * math.exp(-(ch_x ** 2 + ch_y ** 2))
                    
                # 4. 3D Sculpted Nose (fh in [0.48, 0.78], |x| < 0.035)
                if 0.48 <= fh <= 0.78 and abs(x) < 0.035:
                    # Nasal Bridge (fh in [0.50, 0.70])
                    if 0.50 <= fh <= 0.70:
                        nb_prof = math.sin((fh - 0.50) / 0.20 * math.pi)
                        nb_w = max(0.0, 1.0 - (abs(x) / 0.013) ** 2)
                        y_disp -= 0.030 * nb_prof * nb_w
                    # Nasal Tip Lobule (fh in [0.68, 0.76])
                    if 0.68 <= fh <= 0.76:
                        nt_prof = math.cos((fh - 0.72) / 0.04 * (math.pi * 0.5))
                        nt_w = max(0.0, 1.0 - (abs(x) / 0.014) ** 2)
                        y_disp -= 0.040 * max(0.0, nt_prof) * nt_w
                    # Alar Wings (fh in [0.70, 0.78], |x| in [0.010, 0.025])
                    if 0.70 <= fh <= 0.78 and 0.010 < abs(x) < 0.025:
                        aw_prof = math.sin((fh - 0.70) / 0.08 * math.pi)
                        aw_x = (abs(x) - 0.017) / 0.006
                        y_disp -= 0.024 * aw_prof * math.exp(-(aw_x ** 2))
                    # Nostril cavities (fh in [0.74, 0.79], 0.004 < |x| < 0.016)
                    if 0.74 <= fh <= 0.79 and 0.004 < abs(x) < 0.016:
                        y_disp += 0.014 * math.sin((fh - 0.74) / 0.05 * math.pi) * (1.0 - (((abs(x) - 0.010) / 0.006) ** 2))
                        
                # 5. Philtrum & Cupid's Bow Upper Lip (fh in [0.76, 0.86], |x| < 0.036)
                if 0.76 <= fh <= 0.86 and abs(x) < 0.036:
                    # Philtrum groove
                    if 0.76 <= fh <= 0.81 and abs(x) < 0.006:
                        y_disp += 0.005 * math.sin((fh - 0.76) / 0.05 * math.pi) * (1.0 - (abs(x) / 0.006) ** 2)
                    # Upper lip vermilion (fh in [0.80, 0.85])
                    if 0.80 <= fh <= 0.85:
                        ul_prof = math.sin((fh - 0.80) / 0.05 * math.pi)
                        cb = 1.0 + 0.38 * math.cos((abs(x) / 0.016) * math.pi) if abs(x) < 0.016 else 0.70
                        ul_w = max(0.0, 1.0 - (abs(x) / 0.026) ** 2)
                        y_disp -= 0.022 * ul_prof * ul_w * cb
                        
                # 6. Oral Cleft Indentation (fh in [0.84, 0.87], |x| < 0.030)
                if 0.84 <= fh <= 0.87 and abs(x) < 0.030:
                    y_disp += 0.010 * max(0.0, 1.0 - (abs(x) / 0.028) ** 2)
                    
                # 7. Lower Lip Cushions (fh in [0.86, 0.92], |x| < 0.032)
                if 0.86 <= fh <= 0.92 and abs(x) < 0.032:
                    ll_prof = math.sin((fh - 0.86) / 0.06 * math.pi)
                    ll_cushion = 1.0 + 0.28 * math.sin((abs(x) / 0.018) * math.pi)
                    ll_w = max(0.0, 1.0 - (abs(x) / 0.025) ** 2)
                    y_disp -= 0.024 * ll_prof * ll_w * ll_cushion
                    
                # 8. Mentolabial Sulcus (fh in [0.91, 0.95], |x| < 0.028)
                if 0.91 <= fh <= 0.95 and abs(x) < 0.028:
                    mls_prof = math.sin((fh - 0.91) / 0.04 * math.pi)
                    y_disp += 0.011 * mls_prof * (1.0 - (abs(x) / 0.025) ** 2)
                    
                # 9. Chin Mental Protuberance (fh in [0.93, 1.00], |x| < 0.035)
                if 0.93 <= fh <= 1.00 and abs(x) < 0.035:
                    chin_prof = math.sin((fh - 0.93) / 0.07 * math.pi)
                    chin_w = math.exp(-((x / 0.020) ** 2))
                    y_disp -= 0.026 * chin_prom * chin_prof * chin_w

            # Neck Sculpting (iz > 60)
            elif iz > 60:
                tn = (iz - 60) / 19.0
                # Adam's apple
                if 0.20 <= tn <= 0.60 and sa < -0.85 and abs(x) < 0.016:
                    adam_prof = math.sin((tn - 0.20) / 0.40 * math.pi)
                    adam_scale = (0.018 if gender == "male" else 0.005)
                    y_disp -= adam_scale * adam_prof * max(0.0, 1.0 - (abs(x) / 0.016) ** 2)
                # SCM muscle columns
                scm_x = 0.018 + (1.0 - tn) * 0.036
                scm_y = -0.035 + (1.0 - tn) * 0.040
                for sign in (-1, 1):
                    dx = abs(x) - scm_x
                    dy = (y_base - y_center) - scm_y
                    dist = math.sqrt(dx ** 2 + dy ** 2)
                    if dist < 0.022:
                        y_disp -= 0.010 * (1.0 - dist / 0.022)
                # Suprasternal notch (pit of neck)
                if tn > 0.80 and sa < -0.85 and abs(x) < 0.018:
                    y_disp += 0.018 * ((tn - 0.80) / 0.20) * (1.0 - (abs(x) / 0.018) ** 2)

            y = y_base + y_disp
            z_final = z + z_disp
            pts.append(bm.verts.new(Vector((x, y, z_final))))
        rings.append(pts)

    # Connect quads
    for r in range(len(rings) - 1):
        for s in range(num_th):
            s_next = (s + 1) % num_th
            v1 = rings[r][s]
            v2 = rings[r][s_next]
            v3 = rings[r + 1][s_next]
            v4 = rings[r + 1][s]
            bm.faces.new((v1, v4, v3, v2))

    # Top crown pole (normal strictly +Z upward)
    v_crown = bm.verts.new(Vector((0, 0.010, h_top)))
    for s in range(num_th):
        s_next = (s + 1) % num_th
        bm.faces.new((v_crown, rings[0][s], rings[0][s_next]))

    # Bottom neck cap (open interface - no cap to seamlessly join torso!)
    # No cap at bottom: eliminates inward pull when subdivision surface is applied!

    # Anatomical Left & Right Ears (accurately positioned between brow line and base of nose)
    z_ear = h_top - 0.64 * h_len
    ear_len = h_len * 0.24
    for sign in (-1, 1):
        ear_x = sign * (h_len * 0.32)
        ear_y = -h_len * 0.02
        create_uv_sphere(
            bm,
            center=(ear_x, ear_y, z_ear),
            radius=ear_len * 0.42,
            u_segs=10,
            v_segs=8,
            scale=(0.30, 0.68, 1.15),
        )


def generate_anatomical_torso(bm, archetype):
    """
    Constructs the torso connecting seamlessly with the base of the neck:
    - Clavicles & trapezius slope originating at z_pit (h - 1.28 * h_len)
    - Pectoralis major / natural feminine breasts
    - Ribcage & epigastric arch
    - Rectus abdominis (six-pack) & external obliques
    - Umbilicus (navel) & iliac crest
    - Gluteus maximus & pelvic cradle down to crotch (h - 4.0 * h_len)
    """
    h = archetype["height"]
    h_len = archetype["head_length"]
    gender = archetype["gender"]
    sh_w = archetype["shoulder_width"]
    ch_w = archetype["chest_width"]
    ch_d = archetype["chest_depth"]
    w_w = archetype["waist_width"]
    w_d = archetype["waist_depth"]
    hip_w = archetype["hip_width"]
    hip_d = archetype["hip_depth"]
    musc = archetype.get("muscle_definition", 1.0)
    breast_sz = archetype.get("breast_size", 1.0)

    # Classical 8-head canon vertical torso levels
    z_clavicle = h - h_len * 1.28   # Pit of neck & clavicle line (meets neck!)
    z_acromion = h - h_len * 1.45   # Shoulder deltoid joint
    z_upper_chest = h - h_len * 1.70 # Upper pectoralis
    z_nipple = h - h_len * 2.00     # Mid-pectoral / nipple line (Head 2)
    z_underbust = h - h_len * 2.30  # Inframammary fold
    z_ribcage = h - h_len * 2.65    # Costal margin (bottom of ribs)
    z_navel = h - h_len * 3.05      # Umbilicus / waist narrowest (Head 3)
    z_iliac = h - h_len * 3.55      # Iliac crest / pelvic brim
    z_crotch = h - h_len * 4.00     # Pubic symphysis / gluteal fold (Head 4 - Midpoint!)

    num_segs = 24
    torso_rings = [
        # (z, width, depth, y_off, chest_bulge, abs_bulge, glute_bulge)
        (z_clavicle + 0.015, sh_w * 0.42, ch_d * 0.58, -0.018, 0.0, 0.0, 0.0), # Neck junction transition
        (z_clavicle, sh_w * 0.52, ch_d * 0.68, -0.015, 0.0, 0.0, 0.0),
        (z_acromion, sh_w * 0.82, ch_d * 0.80, -0.010, 0.01 * musc, 0.0, 0.0),
        (z_upper_chest, ch_w * 0.94, ch_d * 0.90, -0.005, 0.04 * musc, 0.0, 0.0),
        (z_nipple, ch_w, ch_d, 0.00, 0.06 * musc if gender == "male" else 0.01, 0.0, 0.0),
        (z_underbust, ch_w * 0.92, ch_d * 0.86, -0.005, 0.03 * musc, 0.01 * musc, 0.0),
        (z_ribcage, w_w * 1.08, w_d * 1.05, -0.005, 0.0, 0.03 * musc, 0.0),
        (z_navel, w_w, w_d, 0.00, 0.0, 0.04 * musc, 0.02),
        (z_iliac, hip_w * 0.90, hip_d * 0.90, 0.010, 0.0, 0.02 * musc, 0.05),
        (z_crotch + 0.06, hip_w * 0.98, hip_d * 0.98, 0.015, 0.0, 0.0, 0.08),
        (z_crotch, hip_w * 0.85, hip_d * 0.85, 0.015, 0.0, 0.0, 0.06),
    ]

    torso_rings.reverse()
    cross_sections = []
    for z, w, d, yo, cb, ab, gb in torso_rings:
        pts = []
        for i in range(num_segs):
            angle = i / num_segs * 2 * math.pi
            ca = math.cos(angle)
            sa = math.sin(angle)

            # Lateral shaping (flanks, lats, hips)
            x = ca * (w * 0.5)

            # Antero-posterior shaping
            if sa <= 0:
                # Anterior (chest / abs): -Y
                bulge = cb * (0.8 + 0.2 * math.cos(angle * 2)) if cb > 0 else 0
                bulge += ab * (-math.sin(angle)) * (1.0 - 0.3 * abs(ca)) if ab > 0 else 0
                y = sa * (d * 0.5 + bulge) - yo
            else:
                # Posterior (back / glutes): +Y
                back_bulge = gb * (1.0 + 0.3 * math.cos(angle * 2)) if gb > 0 else 0
                y = sa * (d * 0.5 + back_bulge) - yo

            pts.append((x, y))
        cross_sections.append((z, pts))

    # Torso: bottom cap True, top cap False so clavicles merge with neck!
    create_quad_cylinder(bm, cross_sections, caps=(True, False))

    # Natural Anatomical Breasts for Female Archetypes
    if gender == "female":
        breast_r = 0.075 * breast_sz
        breast_y = -(ch_d * 0.44 + breast_r * 0.40)
        breast_z = z_nipple + 0.005
        for sign in (-1, 1):
            breast_x = sign * (ch_w * 0.28)
            create_uv_sphere(
                bm,
                center=(breast_x, breast_y, breast_z),
                radius=breast_r,
                u_segs=16,
                v_segs=12,
                scale=(1.05, 1.30, 0.95),
            )


def generate_anatomical_limbs(bm, archetype):
    """
    Constructs left & right arms, hands with 5 articulated fingers,
    thighs with quads & knees, and calves with ankles and 5-toed feet.
    """
    h = archetype["height"]
    h_len = archetype["head_length"]
    gender = archetype["gender"]
    sh_w = archetype["shoulder_width"]
    arm_thick = archetype.get("arm_thickness", 1.0)
    leg_thick = archetype.get("leg_thickness", 1.0)
    calf_thick = archetype.get("calf_thickness", 1.0)
    musc = archetype.get("muscle_definition", 1.0)
    hip_w = archetype["hip_width"]

    # -------------------------------------------------------------
    # 1. UPPER LIMBS (Shoulders, Biceps, Elbows, Forearms, Wrists)
    # -------------------------------------------------------------
    z_shoulder = h - h_len * 1.45
    z_elbow = h - h_len * 2.80
    z_wrist = h - h_len * 3.85

    for sign in (-1, 1):
        # Continuous Arm Cylinder (Deltoid Shoulder -> Biceps -> Elbow -> Forearm -> Wrist)
        arm_rings = [
            # (z, x_off, r_x, r_y)
            (z_shoulder + 0.05, sign * (sh_w * 0.44), 0.056 * arm_thick, 0.058 * arm_thick),                       # Deltoid top
            (z_shoulder, sign * (sh_w * 0.47), 0.062 * arm_thick, 0.065 * arm_thick),                              # Deltoid belly
            (z_shoulder - 0.08, sign * (sh_w * 0.49), 0.055 * arm_thick, 0.058 * arm_thick),
            (z_shoulder - 0.18, sign * (sh_w * 0.50), 0.056 * arm_thick * (1 + 0.14 * musc), 0.060 * arm_thick),  # Biceps
            (z_elbow + 0.06, sign * (sh_w * 0.51), 0.048 * arm_thick, 0.050 * arm_thick),
            (z_elbow, sign * (sh_w * 0.51), 0.045 * arm_thick, 0.046 * arm_thick),                                 # Elbow joint
            (z_elbow - 0.06, sign * (sh_w * 0.50), 0.049 * arm_thick * (1 + 0.10 * musc), 0.048 * arm_thick),
            (z_elbow - 0.16, sign * (sh_w * 0.49), 0.048 * arm_thick * (1 + 0.12 * musc), 0.046 * arm_thick),     # Brachioradialis
            (z_wrist + 0.08, sign * (sh_w * 0.48), 0.038 * arm_thick, 0.036 * arm_thick),
            (z_wrist, sign * (sh_w * 0.47), 0.032 * arm_thick, 0.026 * arm_thick),                                 # Wrist
        ]
        arm_rings.reverse()
        arm_secs = []
        for z, xo, rx, ry in arm_rings:
            pts = []
            for s in range(12):
                ang = s / 12 * 2 * math.pi
                pts.append((xo + rx * math.cos(ang), ry * math.sin(ang)))
            arm_secs.append((z, pts))
        create_quad_cylinder(bm, arm_secs, caps=(True, True))

        # -------------------------------------------------------------
        # Realistic 5-Finger Hand
        # Palm + Opposable Thumb + Index + Middle + Ring + Pinky
        # -------------------------------------------------------------
        palm_x = sign * (sh_w * 0.47)
        palm_z = z_wrist - 0.04
        # Palm Body
        create_uv_sphere(
            bm,
            center=(palm_x, -0.005, palm_z),
            radius=0.040 * arm_thick,
            u_segs=10,
            v_segs=8,
            scale=(0.85, 0.55, 1.15),
        )
        # Thenar Eminence (Thumb base muscle pad)
        create_uv_sphere(
            bm,
            center=(palm_x - sign * 0.015, -0.012, palm_z + 0.01),
            radius=0.020 * arm_thick,
            u_segs=8,
            v_segs=6,
            scale=(1.0, 0.8, 1.2),
        )

        # Thumb (Medial, angled forward-inward)
        for seg in range(2):
            tz = palm_z - 0.01 - seg * 0.020
            ty = -0.018 - seg * 0.008
            tx = palm_x - sign * (0.022 + seg * 0.008)
            create_uv_sphere(
                bm,
                center=(tx, ty, tz),
                radius=0.012 * arm_thick,
                u_segs=6,
                v_segs=6,
                scale=(0.9, 1.0, 1.2),
            )

        # 4 Articulated Fingers (Index, Middle, Ring, Pinky)
        finger_specs = [
            ("index", -0.015, 0.065, 0.010),
            ("middle", -0.004, 0.072, 0.011),
            ("ring", 0.006, 0.066, 0.010),
            ("pinky", 0.016, 0.050, 0.008),
        ]
        for _, fx, flen, fthick in finger_specs:
            base_x = palm_x + sign * fx
            base_z = palm_z - 0.036
            num_phalanges = 3
            seg_len = flen / num_phalanges
            for ph in range(num_phalanges):
                fz = base_z - ph * seg_len - seg_len * 0.5
                create_uv_sphere(
                    bm,
                    center=(base_x, -0.002, fz),
                    radius=fthick * arm_thick,
                    u_segs=6,
                    v_segs=6,
                    scale=(0.85, 0.95, 1.25),
                )

    # -------------------------------------------------------------
    # 2. LOWER LIMBS (Continuous Leg from Hip to Ankle, Feet)
    # -------------------------------------------------------------
    z_hip = h - h_len * 4.00
    z_knee = h - h_len * 5.95
    z_ankle = h - h_len * 7.55
    z_sole = 0.0

    for sign in (-1, 1):
        leg_x = sign * (hip_w * 0.25)

        # Continuous Leg Cylinder (Thigh -> Knee -> Calf -> Ankle, no gap at knee!)
        leg_rings = [
            (z_hip + 0.05, leg_x, 0.108 * leg_thick, 0.112 * leg_thick),                      # Pelvic socket insertion
            (z_hip, leg_x, 0.105 * leg_thick, 0.110 * leg_thick),
            (z_hip - 0.14, leg_x, 0.108 * leg_thick * (1 + 0.10 * musc), 0.112 * leg_thick),  # Mid-quad
            (z_knee + 0.14, leg_x, 0.095 * leg_thick * (1 + 0.12 * musc), 0.096 * leg_thick),  # Vastus medialis
            (z_knee + 0.04, leg_x, 0.076 * leg_thick, 0.080 * leg_thick),                      # Above knee
            (z_knee, leg_x, 0.068 * leg_thick, 0.072 * leg_thick),                             # Knee center
            (z_knee - 0.04, leg_x, 0.066 * calf_thick, 0.070 * calf_thick),                    # Below knee
            (z_knee - 0.14, leg_x, 0.082 * calf_thick * (1 + 0.14 * musc), 0.090 * calf_thick),# Twin calf belly
            (z_knee - 0.24, leg_x, 0.074 * calf_thick, 0.078 * calf_thick),                    # Lower calf
            (z_ankle + 0.10, leg_x, 0.050 * calf_thick, 0.052 * calf_thick),                   # Soleus / Achilles
            (z_ankle, leg_x, 0.040 * calf_thick, 0.044 * calf_thick),                          # Malleolus ankle
        ]
        leg_rings.reverse()
        leg_secs = []
        for z, xo, rx, ry in leg_rings:
            pts = []
            for s in range(16):
                ang = s / 16 * 2 * math.pi
                pts.append((xo + rx * math.cos(ang), ry * math.sin(ang)))
            leg_secs.append((z, pts))
        create_quad_cylinder(bm, leg_secs, caps=(True, True))

        # Patella (Kneecap)
        create_uv_sphere(
            bm,
            center=(leg_x, -0.068 * leg_thick, z_knee + 0.015),
            radius=0.035 * leg_thick,
            u_segs=10,
            v_segs=8,
            scale=(0.95, 0.60, 1.15),
        )

        # Inner & Outer Malleoli
        create_uv_sphere(
            bm,
            center=(leg_x - sign * 0.036 * calf_thick, -0.005, z_ankle + 0.012),
            radius=0.018 * calf_thick,
            u_segs=6,
            v_segs=6,
            scale=(0.6, 1.0, 1.0),
        )
        create_uv_sphere(
            bm,
            center=(leg_x + sign * 0.036 * calf_thick, 0.005, z_ankle - 0.008),
            radius=0.018 * calf_thick,
            u_segs=6,
            v_segs=6,
            scale=(0.6, 1.0, 1.0),
        )

        # -------------------------------------------------------------
        # Realistic Foot with Longitudinal Arch and 5 Toes
        # -------------------------------------------------------------
        foot_len = h_len * 1.15
        heel_y = 0.07 * (foot_len / 0.25)
        # Calcaneus (Heel at +Y, connecting with Achilles ankle)
        create_uv_sphere(
            bm,
            center=(leg_x, heel_y - 0.015, z_sole + 0.048),
            radius=0.048 * calf_thick,
            u_segs=10,
            v_segs=8,
            scale=(0.85, 1.25, 1.15),
        )
        # Midfoot & Ball of Foot (Metatarsal Arch towards -Y)
        create_uv_sphere(
            bm,
            center=(leg_x, heel_y - foot_len * 0.50, z_sole + 0.035),
            radius=0.052 * calf_thick,
            u_segs=10,
            v_segs=8,
            scale=(1.05, 1.40, 0.85),
        )

        # 5 Toes
        bx = leg_x - sign * 0.025
        create_uv_sphere(bm, center=(bx, heel_y - foot_len * 0.88, z_sole + 0.022), radius=0.016 * calf_thick, u_segs=8, v_segs=6, scale=(0.9, 1.4, 0.95))
        bx = leg_x - sign * 0.008
        create_uv_sphere(bm, center=(bx, heel_y - foot_len * 0.89, z_sole + 0.020), radius=0.014 * calf_thick, u_segs=8, v_segs=6, scale=(0.9, 1.4, 0.95))
        bx = leg_x + sign * 0.008
        create_uv_sphere(bm, center=(bx, heel_y - foot_len * 0.87, z_sole + 0.018), radius=0.013 * calf_thick, u_segs=8, v_segs=6, scale=(0.9, 1.3, 0.95))
        bx = leg_x + sign * 0.022
        create_uv_sphere(bm, center=(bx, heel_y - foot_len * 0.84, z_sole + 0.016), radius=0.012 * calf_thick, u_segs=8, v_segs=6, scale=(0.9, 1.2, 0.95))
        bx = leg_x + sign * 0.034
        create_uv_sphere(bm, center=(bx, heel_y - foot_len * 0.81, z_sole + 0.014), radius=0.011 * calf_thick, u_segs=8, v_segs=6, scale=(0.9, 1.1, 0.95))


def build_eyeballs(archetype):
    """
    Creates left and right anatomical eyeball objects (sclera + cornea)
    accurately seated inside the orbital sockets.
    24mm diameter, IPD 63mm.
    """
    h_top = archetype["height"]
    h_len = archetype["head_length"]
    ipd = 0.063

    # Eye orbit center level: fh = 0.56 along head
    eye_z = h_top - 0.56 * h_len
    # Face skin inside socket is at y = -0.052; eyeball center at y = -0.048 puts corneal apex at -0.0605
    eye_y = -0.048

    eye_objects = []
    for side, sign in (("L", 1), ("R", -1)):
        eye_x = sign * (ipd * 0.5)

        mesh = bpy.data.meshes.new(f"Eyeball_{side}")
        obj = bpy.data.objects.new(f"Eyeball_{side}", mesh)
        bpy.context.collection.objects.link(obj)

        bm = bmesh.new()
        bmesh.ops.create_uvsphere(
            bm,
            u_segments=36,
            v_segments=24,
            radius=0.0125,
        )
        bm.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(mesh)
        bm.free()

        obj.location = (eye_x, eye_y, eye_z)
        obj.rotation_euler = (math.radians(90), 0, math.radians(sign * 2.5))

        for f in mesh.polygons:
            f.use_smooth = True

        eye_objects.append(obj)

    return eye_objects


def build_human_body_mesh(archetype):
    """
    Generates the complete anatomical human body mesh for the given archetype:
    - Head & Neck (with classical proportions & facial features)
    - Torso & Shoulders
    - Upper & Lower Limbs
    - Color Attribute layer for living facial color zoning (lips vermilion, blush, stubble)
    """
    arch_key = archetype.get("archetype_key", "human")
    name = f"Body_{arch_key}"
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()

    # 1. Generate Head & Neck
    generate_anatomical_head(bm, archetype)

    # 2. Generate Torso & Breasts
    generate_anatomical_torso(bm, archetype)

    # 3. Generate Shoulders, Arms, 5-Finger Hands, Legs, 5-Toe Feet
    generate_anatomical_limbs(bm, archetype)

    # Convert BMesh to Blender Mesh
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    # Smooth shading across all faces
    for poly in mesh.polygons:
        poly.use_smooth = True

    # Subdivision Surface modifier for photorealistic organic smoothness
    subsurf = obj.modifiers.new(name="Subdivision", type="SUBSURF")
    subsurf.levels = 1
    subsurf.render_levels = 2

    # -------------------------------------------------------------
    # 4. LIVING SKIN COLOR ZONING (Color Attribute)
    # -------------------------------------------------------------
    h_top = archetype["height"]
    h_len = archetype["head_length"]
    h_chin = h_top - h_len
    gender = archetype["gender"]

    skin_p = SKIN_PRESETS.get(archetype.get("skin_preset"), SKIN_PRESETS["fair_warm"])
    base_skin = skin_p["base_color"]
    if gender == "male":
        lip_color = (min(1.0, base_skin[0] * 1.05), base_skin[1] * 0.44, base_skin[2] * 0.40, 1.0)
    else:
        lip_color = (min(1.0, base_skin[0] * 1.15), base_skin[1] * 0.50, base_skin[2] * 0.48, 1.0)
    blush_color = (min(1.0, base_skin[0] * 1.06), base_skin[1] * 0.72, base_skin[2] * 0.66, 1.0)
    shadow_color = (base_skin[0] * 0.68, base_skin[1] * 0.58, base_skin[2] * 0.52, 1.0)
    stubble_color = (base_skin[0] * 0.62, base_skin[1] * 0.62, base_skin[2] * 0.62, 1.0)

    color_attr = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")

    z_lip_min = h_top - 0.86 * h_len
    z_lip_max = h_top - 0.78 * h_len

    for i, v in enumerate(mesh.vertices):
        x, y, z = v.co
        col = list(base_skin)

        # 1. Lips (Vermilion flush)
        if z_lip_min <= z <= z_lip_max and abs(x) < 0.026 and y < -0.055:
            fac = math.sin((z - z_lip_min) / (z_lip_max - z_lip_min) * math.pi) * (1.0 - (abs(x) / 0.026) ** 2)
            fac = min(1.0, max(0.0, fac * 1.5))
            for c in range(3):
                col[c] = (1.0 - fac) * col[c] + fac * lip_color[c]

        # 2. Cheeks & Nose Tip Warmth
        z_ch_min = h_top - 0.70 * h_len
        z_ch_max = h_top - 0.54 * h_len
        if z_ch_min <= z <= z_ch_max and 0.030 < abs(x) < 0.065 and y < -0.045:
            fac = math.sin((z - z_ch_min) / (z_ch_max - z_ch_min) * math.pi) * math.exp(-(((abs(x) - 0.050) / 0.015) ** 2))
            fac = min(0.65, max(0.0, fac))
            for c in range(3):
                col[c] = (1.0 - fac) * col[c] + fac * blush_color[c]

        # Nose tip warmth
        z_nt_min = h_top - 0.76 * h_len
        z_nt_max = h_top - 0.68 * h_len
        if z_nt_min <= z <= z_nt_max and abs(x) < 0.014 and y < -0.070:
            fac = math.sin((z - z_nt_min) / (z_nt_max - z_nt_min) * math.pi) * (1.0 - (abs(x) / 0.014) ** 2)
            fac = min(0.70, max(0.0, fac))
            for c in range(3):
                col[c] = (1.0 - fac) * col[c] + fac * blush_color[c]

        # 3. Masculine 5 o'clock stubble around jaw & upper lip
        if gender == "male":
            z_stub_min = h_chin - 0.020
            z_stub_max = h_top - 0.75 * h_len
            if z_stub_min <= z <= z_stub_max and abs(x) < 0.055 and y < -0.040:
                fac = 0.38 * (1.0 - abs(x) / 0.060)
                for c in range(3):
                    col[c] = (1.0 - fac) * col[c] + fac * stubble_color[c]

        # 4. Eye orbital shading
        z_orb_min = h_top - 0.62 * h_len
        z_orb_max = h_top - 0.50 * h_len
        if z_orb_min <= z <= z_orb_max and 0.016 < abs(x) < 0.050 and y < -0.045:
            fac = 0.35 * math.sin((z - z_orb_min) / (z_orb_max - z_orb_min) * math.pi)
            for c in range(3):
                col[c] = (1.0 - fac) * col[c] + fac * shadow_color[c]

        color_attr.data[i].color = col

    return obj
