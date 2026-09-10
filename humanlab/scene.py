"""Studio: camera framing, three-point soft lighting, Cycles settings."""

from __future__ import annotations

import math
import os

import bpy


def setup_render(res=(900, 1200), samples=128, denoise=True, threads=0, exposure=0.0,
                 time_limit=0.0):
    """Cycles settings.  ``time_limit`` is seconds per frame, 0 for no limit.

    A cap is worth setting for batch work.  Cost per frame is not predictable
    from the geometry: the same figure at two camera angles a few degrees apart
    can differ twenty-fold, because whether sight lines happen to graze along the
    hair decides how many strands each ray crosses.  Frames that hit the cap are
    still denoised and, at these sample counts, hard to tell apart.
    """
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.time_limit = float(time_limit)
    sc.cycles.adaptive_min_samples = max(8, samples // 8)
    sc.cycles.adaptive_threshold = 0.012
    sc.cycles.use_denoising = denoise
    if denoise:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
        sc.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    sc.cycles.max_bounces = 10
    sc.cycles.diffuse_bounces = 3
    sc.cycles.glossy_bounces = 4
    sc.cycles.transmission_bounces = 6
    sc.cycles.transparent_max_bounces = 6
    sc.cycles.volume_bounces = 0
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.use_light_tree = True
    sc.cycles.blur_glossy = 1.0
    sc.cycles.min_light_bounces = 1
    sc.cycles.tile_size = 256
    if threads:
        sc.render.threads_mode = "FIXED"
        sc.render.threads = threads
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.compression = 20
    sc.view_settings.exposure = exposure
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - Medium Contrast"
    except Exception:
        pass
    return sc


def world_ambient(strength=0.05, colour=(0.55, 0.60, 0.70)):
    w = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "QUADRATIC"
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (math.radians(90), 0, 0)
    tex = nt.nodes.new("ShaderNodeTexCoord")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.03, 0.035, 0.045, 1)
    ramp.color_ramp.elements[1].color = (*colour, 1)
    nt.links.new(tex.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return w


def _area_light(name, location, target, size, power, colour=(1, 1, 1), shape="RECTANGLE",
                size_y=None):
    lamp = bpy.data.lights.new(name, type="AREA")
    lamp.shape = shape
    lamp.size = size
    if size_y is not None:
        lamp.size_y = size_y
    lamp.energy = power
    lamp.color = colour
    lamp.use_shadow = True
    ob = bpy.data.objects.new(name, lamp)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = location
    _aim(ob, target)
    return ob


def _aim(ob, target):
    import mathutils

    d = mathutils.Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def _rotz(v, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2])


def _softbox(name, offset, target, size, size_y, irradiance, colour):
    """Place an area light and size its wattage for a target irradiance (W/m^2).

    For a Blender area light the irradiance reaching the subject is roughly
    ``power / (pi * distance^2)``, so asking for irradiance instead of watts
    keeps the exposure stable no matter how the rig is scaled.
    """
    import mathutils

    loc = (target[0] + offset[0], target[1] + offset[1], target[2] + offset[2])
    d = mathutils.Vector(offset).length
    power = irradiance * math.pi * d * d
    return _area_light(name, loc, target, size, power, colour, size_y=size_y)


def studio_lights(target=(0, 0, 1.0), scale=1.0, key=3.4, warm=True, rim=True,
                  ratio=0.30, rim_gain=1.0, azimuth=0.0):
    """Large key softbox front-left, soft fill front-right, cool rim behind.

    The rig is laid out for a camera on -y and then swung about the subject by
    `azimuth`, which must be the camera's azimuth.  A fixed rig only lights the
    one view it was built for: shot from behind, the key ends up on the far side
    of the figure and the frame is nothing but rim light.
    """
    s = scale

    def box(name, offset, size, size_y, irradiance, colour):
        return _softbox(name, _rotz(offset, azimuth), target, size, size_y,
                        irradiance, colour)

    lights = [
        box("key", (-1.55 * s, -1.75 * s, 0.80 * s), 1.5 * s, 2.0 * s,
            key, (1.0, 0.955, 0.90) if warm else (1, 1, 1)),
        box("fill", (2.05 * s, -1.55 * s, 0.20 * s), 2.2 * s, 2.4 * s,
            key * ratio, (0.90, 0.94, 1.0)),
        box("bounce", (0.1 * s, -1.25 * s, -0.95 * s), 1.8 * s, 1.8 * s,
            key * 0.16, (1.0, 0.95, 0.92)),
    ]
    if rim:
        lights += [
            box("rim", (1.40 * s, 1.85 * s, 1.15 * s), 0.9 * s, 1.1 * s,
                key * 1.15 * rim_gain, (0.86, 0.92, 1.0)),
            box("rim2", (-1.75 * s, 1.60 * s, 0.55 * s), 0.8 * s, 1.0 * s,
                key * 0.55 * rim_gain, (1.0, 0.93, 0.86)),
        ]
    return lights


def frame_distance(fit_height, lens, res=None):
    """Distance at which `fit_height` metres exactly fill the frame vertically."""
    sc = bpy.context.scene
    rx = res[0] if res else sc.render.resolution_x
    ry = res[1] if res else sc.render.resolution_y
    sensor = 36.0 if ry >= rx else 36.0 * ry / rx
    return fit_height * lens / sensor


def backdrop(colour=(0.055, 0.058, 0.065), distance=1.9, size=9.0, floor=True,
             azimuth=0.0):
    """A wall `distance` behind the subject, as seen from a camera at `azimuth`.

    Swinging the wall with the camera matters more than it sounds: leave it on
    +y and a shot from behind puts the camera on the far side of it, so the whole
    frame is the unlit back face of a plane and the figure never appears.
    """
    mat = bpy.data.materials.new("backdrop")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = 0.72
    bsdf.inputs["Specular IOR Level"].default_value = 0.25

    at = _rotz((0.0, distance, size * 0.45), azimuth)
    bpy.ops.mesh.primitive_plane_add(size=size, location=at)
    wall = bpy.context.active_object
    wall.name = "backdrop"
    wall.rotation_euler = (math.radians(90), 0, math.radians(azimuth))
    wall.data.materials.append(mat)
    obs = [wall]
    if floor:
        bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0.0))
        fl = bpy.context.active_object
        fl.name = "floor"
        fl.data.materials.append(mat)
        obs.append(fl)
    return obs


def camera(location, target, lens=85.0, name="cam", dof_target=None, fstop=4.0):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.sensor_width = 36.0
    cam.clip_start = 0.02
    if dof_target is not None:
        import mathutils

        cam.dof.use_dof = True
        cam.dof.focus_distance = (mathutils.Vector(dof_target) - mathutils.Vector(location)).length
        cam.dof.aperture_fstop = fstop
    ob = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = location
    _aim(ob, target)
    bpy.context.scene.camera = ob
    return ob


def orbit_position(target, distance, azimuth_deg, elevation_deg):
    az = math.radians(azimuth_deg)
    el = math.radians(elevation_deg)
    return (
        target[0] + distance * math.cos(el) * math.sin(az),
        target[1] - distance * math.cos(el) * math.cos(az),
        target[2] + distance * math.sin(el),
    )


def render(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.context.scene.render.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    return path
