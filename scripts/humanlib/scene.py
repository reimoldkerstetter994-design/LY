"""Lighting, environments, camera framing and render settings."""

import math

import bpy
from mathutils import Vector


# --------------------------------------------------------------------------- render

def configure_render(scene, samples=128, resolution=(1080, 1620), scale=100, denoise=True, threads=0):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.01
    scene.cycles.use_denoising = denoise
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    scene.cycles.max_bounces = 10
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 6
    scene.cycles.transmission_bounces = 8
    scene.cycles.transparent_max_bounces = 48
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.blur_glossy = 0.5
    scene.cycles.tile_size = 512
    if threads > 0:
        scene.render.threads_mode = "FIXED"
        scene.render.threads = threads

    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = scale
    scene.render.film_transparent = False
    scene.render.filter_size = 1.5
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 93
    scene.render.image_settings.color_mode = "RGB"

    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0


# ----------------------------------------------------------------------- materials

def _simple_material(name, color, roughness=0.8, noise_scale=None, noise_strength=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    if noise_scale:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = noise_scale
        noise.inputs["Detail"].default_value = 8.0
        noise.inputs["Roughness"].default_value = 0.7
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        # Socket indices for ShaderNodeMix (RGBA): 0 = Factor, 6 = A colour, 7 = B colour, output 2 = colour.
        mix.inputs[6].default_value = (*color, 1.0)
        mix.inputs[7].default_value = (*[c * (1.0 - noise_strength) for c in color], 1.0)
        links.new(noise.outputs["Fac"], mix.inputs[0])
        links.new(mix.outputs[2], principled.inputs["Base Color"])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.15
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return material


# -------------------------------------------------------------------- environments

def _link(scene, obj):
    scene.collection.objects.link(obj)
    return obj


def _add_cyclorama(scene, color, width=14.0, depth=6.0, height=5.0, radius=1.5, segments=16):
    """Floor + curved back wall (a photo studio "cyc"), centred behind the origin."""
    verts = []
    faces = []
    # Profile in the (y, z) plane: flat floor, quarter circle, vertical wall.
    profile = [(-depth, 0.0)]
    for i in range(segments + 1):
        angle = math.pi / 2 * i / segments
        profile.append((depth - radius + radius * math.sin(angle), radius - radius * math.cos(angle)))
    profile.append((depth, height))
    xs = (-width / 2, width / 2)
    for y, z in profile:
        for x in xs:
            verts.append((x, y, z))
    for i in range(len(profile) - 1):
        a = 2 * i
        faces.append((a, a + 1, a + 3, a + 2))
    mesh = bpy.data.meshes.new("Cyclorama")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new("Cyclorama", mesh)
    obj.data.materials.append(_simple_material("CycloramaMat", color, roughness=0.85, noise_scale=3.0, noise_strength=0.08))
    return _link(scene, obj)


def _add_area_light(scene, name, location, target, energy, size, color=(1.0, 1.0, 1.0), shape="SQUARE", size_y=None):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.size = size
    light.shape = shape
    if size_y is not None:
        light.size_y = size_y
    light.color = color
    obj = bpy.data.objects.new(name, light)
    obj.location = location
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return _link(scene, obj)


def _set_world(scene, color, strength):
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (*color, 1.0)
    background.inputs["Strength"].default_value = strength
    scene.world = world
    return world


def _kelvin(temp):
    """Very small blackbody approximation returning linear RGB for a light colour."""
    table = {
        3200: (1.0, 0.70, 0.42),
        4000: (1.0, 0.80, 0.60),
        4800: (1.0, 0.88, 0.75),
        5600: (1.0, 0.95, 0.90),
        6500: (0.92, 0.95, 1.0),
        7500: (0.80, 0.88, 1.0),
    }
    keys = sorted(table)
    if temp <= keys[0]:
        return table[keys[0]]
    if temp >= keys[-1]:
        return table[keys[-1]]
    for lo, hi in zip(keys, keys[1:]):
        if lo <= temp <= hi:
            t = (temp - lo) / (hi - lo)
            return tuple(a + (b - a) * t for a, b in zip(table[lo], table[hi]))
    return (1.0, 1.0, 1.0)


def setup_studio(scene, subject_center, subject_height, variant="neutral"):
    """Three point studio lighting with a curved backdrop."""
    variants = {
        "neutral": {"backdrop": (0.55, 0.55, 0.56), "world": (0.35, 0.36, 0.40), "key_k": 5200, "fill_k": 6500, "key": 900},
        "warm": {"backdrop": (0.30, 0.22, 0.18), "world": (0.20, 0.16, 0.14), "key_k": 4000, "fill_k": 5600, "key": 800},
        "dark": {"backdrop": (0.10, 0.10, 0.11), "world": (0.05, 0.05, 0.06), "key_k": 4800, "fill_k": 7500, "key": 1000},
        "bright": {"backdrop": (0.85, 0.85, 0.85), "world": (0.7, 0.7, 0.72), "key_k": 5600, "fill_k": 6500, "key": 700},
    }
    v = variants[variant]
    _add_cyclorama(scene, v["backdrop"])
    _set_world(scene, v["world"], 0.22)

    cx, cy, cz = subject_center
    h = subject_height
    # Key: front-left, high.  Fill: front-right, large & soft.  Rim: behind, high.
    _add_area_light(scene, "Key", (cx - 2.0, cy - 2.4, cz + h * 1.0), (cx, cy, cz + h * 0.3), v["key"] * 1.0, 1.4, _kelvin(v["key_k"]))
    _add_area_light(scene, "Fill", (cx + 3.0, cy - 2.2, cz + h * 0.35), (cx, cy, cz + h * 0.3), v["key"] * 0.22, 3.5, _kelvin(v["fill_k"]))
    _add_area_light(scene, "Rim", (cx + 1.6, cy + 2.4, cz + h * 1.15), (cx, cy, cz + h * 0.45), v["key"] * 0.35, 0.8, _kelvin(6500))
    _add_area_light(scene, "Top", (cx, cy - 0.3, cz + h * 1.9), (cx, cy, cz), v["key"] * 0.12, 2.5, _kelvin(5600))


def setup_outdoor(scene, subject_center, subject_height, sun_elevation=38.0, sun_azimuth=-40.0):
    """Physically based sky (Nishita) plus a sun lamp and a large textured ground.

    ``sun_azimuth`` is measured like the camera azimuth: degrees from the subject's front
    (-Y), positive toward +X, so the default lights the face from the front-left.
    """
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    background = nodes["Background"]
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_disc = False
    az = math.radians(sun_azimuth)
    elev = math.radians(sun_elevation)
    # Unit vector pointing from the subject toward the sun.
    direction = Vector((math.sin(az) * math.cos(elev), -math.cos(az) * math.cos(elev), math.sin(elev)))
    sky.sun_elevation = elev
    # Blender's sky sun rotation is measured from +Y toward +X (verified empirically).
    sky.sun_rotation = math.atan2(direction.x, direction.y)
    sky.altitude = 50
    sky.air_density = 1.2
    sky.dust_density = 1.5
    sky.ozone_density = 1.0
    links.new(sky.outputs["Color"], background.inputs["Color"])
    background.inputs["Strength"].default_value = 0.06
    scene.world = world

    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(1.5)
    sun.color = _kelvin(5200)
    sun_obj = bpy.data.objects.new("Sun", sun)
    _link(scene, sun_obj)
    sun_obj.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.mesh.primitive_plane_add(size=80.0, location=(0.0, 0.0, 0.0))
    ground = bpy.context.active_object
    ground.name = "Ground"
    ground.data.materials.append(_simple_material("GroundMat", (0.32, 0.30, 0.27), roughness=0.95, noise_scale=6.0, noise_strength=0.35))

    cx, cy, cz = subject_center
    h = subject_height
    # A soft bounce from the camera side keeps the shadow side readable.
    _add_area_light(scene, "Bounce", (cx + 2.5, cy - 3.0, cz + h * 0.5), (cx, cy, cz + h * 0.4), 250, 4.0, _kelvin(6500))


def add_stool(scene, seat_point, radius=0.19, color=(0.16, 0.10, 0.06)):
    """A simple round wooden stool whose top is at ``seat_point``."""
    x, y, z = seat_point
    top_thickness = 0.04
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=top_thickness, location=(x, y + 0.03, z - top_thickness / 2 + 0.01))
    top = bpy.context.active_object
    top.name = "StoolTop"
    wood = _simple_material("StoolMat", color, roughness=0.45, noise_scale=12.0, noise_strength=0.3)
    top.data.materials.append(wood)
    bevel = top.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.008
    bevel.segments = 3
    legs_height = z - top_thickness
    for i in range(4):
        angle = math.radians(45 + 90 * i)
        lx = x + math.cos(angle) * radius * 0.7
        ly = y + 0.03 + math.sin(angle) * radius * 0.7
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.018, depth=legs_height, location=(lx, ly, legs_height / 2))
        leg = bpy.context.active_object
        leg.name = f"StoolLeg{i}"
        leg.data.materials.append(wood)
        # Splay the legs outward a little.
        leg.rotation_euler = (math.radians(-4.0 * math.sin(angle)), math.radians(4.0 * math.cos(angle)), 0.0)
    return top


ENVIRONMENTS = {
    "studio": lambda scene, c, h: setup_studio(scene, c, h, "neutral"),
    "studio_warm": lambda scene, c, h: setup_studio(scene, c, h, "warm"),
    "studio_dark": lambda scene, c, h: setup_studio(scene, c, h, "dark"),
    "studio_bright": lambda scene, c, h: setup_studio(scene, c, h, "bright"),
    "outdoor": lambda scene, c, h: setup_outdoor(scene, c, h),
    "outdoor_evening": lambda scene, c, h: setup_outdoor(scene, c, h, sun_elevation=14.0, sun_azimuth=-70.0),
}


def setup_environment(scene, name, subject_center, subject_height):
    if name not in ENVIRONMENTS:
        raise KeyError(f"Unknown environment '{name}', choose one of {sorted(ENVIRONMENTS)}")
    ENVIRONMENTS[name](scene, subject_center, subject_height)


# -------------------------------------------------------------------------- camera

def _fov(lens, sensor=36.0):
    return 2.0 * math.atan(sensor / (2.0 * lens))


def add_camera(scene, name="Camera"):
    cam_data = bpy.data.cameras.new(name)
    cam_data.sensor_fit = "AUTO"
    cam_data.sensor_width = 36.0
    cam = bpy.data.objects.new(name, cam_data)
    _link(scene, cam)
    scene.camera = cam
    return cam


def frame_camera(scene, cam, lo, hi, lens=70.0, azimuth=15.0, elevation=2.0, margin=1.12, aim_offset=(0.0, 0.0, 0.0), dof=None):
    """Place ``cam`` so the box ``lo``..``hi`` fills the frame.

    ``azimuth`` is measured in degrees from the subject's front (-Y), positive toward +X.
    ``elevation`` is the camera's angle above the box centre.
    """
    cam.data.lens = lens
    res_x = scene.render.resolution_x
    res_y = scene.render.resolution_y
    long_fov = _fov(lens)
    if res_x >= res_y:
        hfov, vfov = long_fov, 2.0 * math.atan(math.tan(long_fov / 2) * res_y / res_x)
    else:
        vfov, hfov = long_fov, 2.0 * math.atan(math.tan(long_fov / 2) * res_x / res_y)

    center = (lo + hi) * 0.5 + Vector(aim_offset)
    half_h = (hi.z - lo.z) * 0.5
    half_w = max(hi.x - lo.x, hi.y - lo.y) * 0.5
    distance = max(half_h * margin / math.tan(vfov / 2), half_w * margin / math.tan(hfov / 2))

    az = math.radians(azimuth)
    el = math.radians(elevation)
    offset = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * distance
    cam.location = center + offset
    cam.rotation_euler = (-offset).to_track_quat("-Z", "Y").to_euler()

    if dof:
        cam.data.dof.use_dof = True
        cam.data.dof.focus_distance = distance
        cam.data.dof.aperture_fstop = dof
    else:
        cam.data.dof.use_dof = False
    return distance
