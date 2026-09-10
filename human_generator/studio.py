"""
Studio Environment, Lighting Rig, Multi-Angle Cameras, and Render Configuration.
Creates:
- Seamless curved studio cyclorama backdrop
- 5-point professional portrait & figure studio lighting
- Multiple production cameras (3/4 Beauty, Full Front, Portrait Close-up, Side Profile, Lineup)
- Production Cycles rendering pipeline
"""

import math
import bpy
import bmesh
from mathutils import Vector
from .materials import create_cyclorama_material


def build_studio_cyclorama():
    """
    Creates a seamless curved studio cyclorama (floor + seamless wall curve).
    The wall curves up at the back (+Y).
    """
    mesh = bpy.data.meshes.new("Studio_Cyclorama")
    obj = bpy.data.objects.new("Studio_Cyclorama", mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    width = 18.0
    half_w = width * 0.5

    # Curved profile points along (y, z)
    # Floor in front (-Y) extends to -8, back at +1.0 curves up to z = 6.0 at y = +4.0
    profile = [
        (-8.0, 0.0),
        (-4.0, 0.0),
        (-1.0, 0.0),
        (1.0, 0.0),
        (1.8, 0.05),
        (2.6, 0.35),
        (3.3, 1.00),
        (3.8, 2.00),
        (4.0, 3.20),
        (4.0, 6.00),
    ]

    grid_verts = []
    num_x_divs = 8
    for y, z in profile:
        row = []
        for xi in range(num_x_divs):
            x = -half_w + (xi / (num_x_divs - 1)) * width
            row.append(bm.verts.new(Vector((x, y, z))))
        grid_verts.append(row)

    for r in range(len(grid_verts) - 1):
        for c in range(num_x_divs - 1):
            v1 = grid_verts[r][c]
            v2 = grid_verts[r][c + 1]
            v3 = grid_verts[r + 1][c + 1]
            v4 = grid_verts[r + 1][c]
            bm.faces.new((v1, v2, v3, v4))

    bm.to_mesh(mesh)
    bm.free()

    for p in mesh.polygons:
        p.use_smooth = True

    sub = obj.modifiers.new(name="Subsurf", type="SUBSURF")
    sub.levels = 1
    sub.render_levels = 1

    mat = create_cyclorama_material("Mat_Studio_Cyclorama")
    obj.data.materials.append(mat)
    return obj


def create_point_or_area_light(name, light_type, color, energy, location, rotation=(0, 0, 0), size=1.0):
    """Creates an area or point light with specified parameters."""
    light_data = bpy.data.lights.new(name=name, type=light_type)
    light_data.color = color
    light_data.energy = energy
    if light_type == 'AREA':
        light_data.shape = 'RECTANGLE'
        light_data.size = size
        light_data.size_y = size * 1.3
    obj = bpy.data.objects.new(name=name, object_data=light_data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = [math.radians(a) for a in rotation]
    return obj


def setup_studio_lighting(center_target=(0, 0, 1.1)):
    """
    Sets up a 5-point studio lighting rig facing the front (-Y):
    - Warm Key Light (Main soft directional modeling light in front-left)
    - Cool Soft Fill Light (Front-right soft fill)
    - Rim / Kicker Light Left (Behind subject left at +Y)
    - Rim / Kicker Light Right (Behind subject right at +Y)
    - Overhead Hair / Top Light (Hair gloss & shoulder definition)
    """
    tx, ty, tz = center_target
    lights = []

    # 1. Warm Key Light (Front-left, -Y, -X)
    key = create_point_or_area_light(
        name="Light_Key_Warm",
        light_type="AREA",
        color=(1.0, 0.94, 0.88),
        energy=260.0,
        location=(tx - 2.2, ty - 3.0, tz + 1.4),
        rotation=(62, -18, -32),
        size=1.8,
    )
    lights.append(key)

    # 2. Cool Fill Light (Front-right, -Y, +X)
    fill = create_point_or_area_light(
        name="Light_Fill_Cool",
        light_type="AREA",
        color=(0.84, 0.92, 1.0),
        energy=110.0,
        location=(tx + 2.6, ty - 2.8, tz + 0.9),
        rotation=(68, 15, 38),
        size=2.4,
    )
    lights.append(fill)

    # 3. Rim / Kicker Light Left (Behind subject left, +Y, -X)
    rim_l = create_point_or_area_light(
        name="Light_Rim_Left",
        light_type="AREA",
        color=(1.0, 0.98, 0.95),
        energy=180.0,
        location=(tx - 1.8, ty + 1.8, tz + 1.2),
        rotation=(-45, -30, 135),
        size=1.0,
    )
    lights.append(rim_l)

    # 4. Rim / Kicker Light Right (Behind subject right, +Y, +X)
    rim_r = create_point_or_area_light(
        name="Light_Rim_Right",
        light_type="AREA",
        color=(0.90, 0.95, 1.0),
        energy=160.0,
        location=(tx + 1.8, ty + 1.6, tz + 1.0),
        rotation=(-48, 25, -130),
        size=1.0,
    )
    lights.append(rim_r)

    # 5. Top / Hair Light
    hair_light = create_point_or_area_light(
        name="Light_Hair_Top",
        light_type="AREA",
        color=(1.0, 0.96, 0.92),
        energy=140.0,
        location=(tx, ty - 0.2, tz + 2.1),
        rotation=(15, 0, 0),
        size=1.2,
    )
    lights.append(hair_light)

    return lights


def create_camera_pointing_at(name, location, target, focal_length=85.0, dof_focus_obj=None, fstop=2.8):
    """
    Creates a camera positioned at `location` and aimed accurately at `target`.
    """
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = focal_length
    cam_data.clip_start = 0.1
    cam_data.clip_end = 100.0

    # Keep depth-of-field off for clear, pin-sharp rendering of anatomy, skin texture, and features
    cam_data.dof.use_dof = False

    cam_obj = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = location

    # Compute orientation to point at target
    loc = Vector(location)
    tgt = Vector(target)
    direction = (tgt - loc).normalized()

    # Calculate Euler angles from direction vector
    # Default camera points down -Z with +Y up
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()

    return cam_obj


def setup_cameras(target_subject=None, archetype=None, center=(0, 0, 1.0)):
    """
    Configures multiple camera views:
    - 3/4 Beauty View
    - Full Front View
    - Portrait Close-Up
    - Side Profile View
    """
    cx, cy, cz = center
    h = archetype["height"] if archetype else 1.80
    face_z = h - (archetype["head_length"] * 0.5 if archetype else 0.12)

    cameras = {}

    # 1. 3/4 Beauty Full-Body View (Framing full body head-to-toe)
    cameras["beauty_34"] = create_camera_pointing_at(
        name="Camera_Beauty_34",
        location=(cx + 1.2, cy - 4.5, cz + 0.1),
        target=(cx, cy, cz + 0.1),
        focal_length=55.0,
    )

    # 2. Front View (Direct front full body)
    cameras["front_full"] = create_camera_pointing_at(
        name="Camera_Front_Full",
        location=(cx, cy - 4.8, cz + 0.1),
        target=(cx, cy, cz + 0.1),
        focal_length=55.0,
    )

    # 3. Portrait Close-Up (Framing head and shoulders)
    cameras["portrait"] = create_camera_pointing_at(
        name="Camera_Portrait",
        location=(cx + 0.12, cy - 1.25, face_z),
        target=(cx, cy, face_z),
        focal_length=65.0,
        dof_focus_obj=target_subject,
        fstop=2.8,
    )

    # 4. Side Profile View (Right lateral profile)
    cameras["side_profile"] = create_camera_pointing_at(
        name="Camera_Side_Profile",
        location=(cx + 4.5, cy - 0.15, cz + 0.1),
        target=(cx, cy, cz + 0.1),
        focal_length=60.0,
    )

    return cameras


def configure_render_engine(scene=None, samples=48, resolution=(1920, 1080), engine='BLENDER_EEVEE'):
    """
    Configures scene render settings for realistic output.
    Supports BLENDER_EEVEE (default: fast, noise-free, smooth SSS & GTAO) and CYCLES.
    """
    if scene is None:
        scene = bpy.context.scene

    engine_upper = engine.upper()
    if "EEVEE" in engine_upper:
        scene.render.engine = 'BLENDER_EEVEE'
        scene.eevee.taa_render_samples = min(64, samples)
        scene.eevee.use_gtao = True
        scene.eevee.gtao_distance = 0.25
        scene.eevee.gtao_factor = 1.0
        scene.eevee.use_ssr = True
        scene.eevee.use_ssr_refraction = True
        scene.eevee.use_soft_shadows = True
        scene.eevee.shadow_cube_size = '2048'
        scene.eevee.shadow_cascade_size = '2048'
    else:
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = samples
        scene.cycles.use_denoising = False  # Avoid headless OIDN dependency
        scene.cycles.preview_samples = 16
        scene.cycles.max_bounces = 12
        scene.cycles.diffuse_bounces = 4
        scene.cycles.glossy_bounces = 4
        scene.cycles.transmission_bounces = 6
        scene.cycles.volume_bounces = 2
        scene.cycles.transparent_max_bounces = 8

    # Image Resolution
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
