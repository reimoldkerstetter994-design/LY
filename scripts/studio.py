"""摄影棚：背景、HDRI 环境光、三点布光、相机和渲染设置。

所有函数都只依赖 bpy，与 MPFB 无关，可单独复用。
坐标约定：角色面朝 -Y，站在原点，+Z 向上。
"""

import math
import os

import bpy
import bmesh
from mathutils import Vector


# ----------------------------------------------------------------------------- 场景清理
def reset_scene():
    for obj in list(bpy.data.objects):
        if obj.name in ("Cube", "Light", "Camera") and obj.users_collection:
            bpy.data.objects.remove(obj, do_unlink=True)


# ----------------------------------------------------------------------------- 背景
def build_cyclorama(color=(0.42, 0.42, 0.44), roughness=0.75, width=14.0, depth_front=8.0, depth_back=2.5,
                    radius=1.4, wall_height=6.0, segments=16):
    """搭一个摄影棚常用的“无缝弧形背景”（地面 + 圆角 + 竖墙）。"""
    profile = []
    profile.append(Vector((0.0, -depth_front, 0.0)))
    corner_center = Vector((0.0, depth_back - radius, radius))
    for i in range(segments + 1):
        angle = -math.pi / 2 + (math.pi / 2) * i / segments
        profile.append(corner_center + Vector((0.0, radius * math.cos(angle), radius * math.sin(angle))))
    profile.append(Vector((0.0, depth_back, wall_height)))

    mesh = bpy.data.meshes.new("Cyclorama")
    bm = bmesh.new()
    left = [bm.verts.new(Vector((-width / 2, p.y, p.z))) for p in profile]
    right = [bm.verts.new(Vector((width / 2, p.y, p.z))) for p in profile]
    for i in range(len(profile) - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True

    obj = bpy.data.objects.new("Cyclorama", mesh)
    bpy.context.scene.collection.objects.link(obj)

    mat = bpy.data.materials.new("CycloramaMaterial")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular IOR Level"].default_value = 0.2
    obj.data.materials.append(mat)
    obj.cycles.is_shadow_catcher = False
    return obj


# ----------------------------------------------------------------------------- 环境光
def _studiolight_path(name):
    base = bpy.utils.system_resource("DATAFILES")
    path = os.path.join(base, "studiolights", "world", name)
    if not os.path.exists(path):
        raise FileNotFoundError(f"找不到内置 HDRI: {path}")
    return path


def setup_world(hdri="studio.exr", strength=0.6, rotation_deg=0.0, background_color=None):
    """用 Blender 自带的 HDRI（datafiles/studiolights/world）做环境光。

    background_color 不为 None 时，相机直接看到的背景用纯色替代（但环境光照仍来自 HDRI）。
    """
    scene = bpy.context.scene
    world = scene.world or bpy.data.worlds.new("StudioWorld")
    scene.world = world
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()

    output = tree.nodes.new("ShaderNodeOutputWorld")
    background = tree.nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = strength
    env = tree.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(_studiolight_path(hdri), check_existing=True)
    mapping = tree.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(rotation_deg))
    coords = tree.nodes.new("ShaderNodeTexCoord")

    tree.links.new(coords.outputs["Generated"], mapping.inputs["Vector"])
    tree.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    tree.links.new(env.outputs["Color"], background.inputs["Color"])

    if background_color is None:
        tree.links.new(background.outputs["Background"], output.inputs["Surface"])
    else:
        flat = tree.nodes.new("ShaderNodeBackground")
        flat.inputs["Color"].default_value = (*background_color, 1.0)
        flat.inputs["Strength"].default_value = 1.0
        light_path = tree.nodes.new("ShaderNodeLightPath")
        mix = tree.nodes.new("ShaderNodeMixShader")
        tree.links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Fac"])
        tree.links.new(background.outputs["Background"], mix.inputs[1])
        tree.links.new(flat.outputs["Background"], mix.inputs[2])
        tree.links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return world


# ----------------------------------------------------------------------------- 灯光
def _add_area_light(name, location, target, energy, size, color=(1.0, 1.0, 1.0), shape="RECTANGLE", size_y=None,
                    spread_deg=180.0):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.shape = shape
    light.size = size
    if size_y is not None:
        light.size_y = size_y
    light.color = color
    light.spread = math.radians(spread_deg)  # 小角度 = 带蜂巢格栅的柔光箱，减少打到背景上的杂光
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def add_portrait_lighting(focus, key_energy=450.0, scale=1.0, warm=True):
    """经典人像布光：柔光箱主光 + 大面积补光 + 轮廓光 + 背景灯。

    focus: 角色胸口/面部附近的世界坐标，所有灯都朝向它。
    """
    fx, fy, fz = focus
    key_color = (1.0, 0.93, 0.86) if warm else (1.0, 1.0, 1.0)
    fill_color = (0.88, 0.93, 1.0)
    lights = [
        # 主光：右前方约 50°、略高于头顶的柔光箱（伦勃朗式布光，让脸有立体感）
        _add_area_light("KeyLight", (fx + 2.2 * scale, fy - 1.8 * scale, fz + 1.7 * scale), focus,
                        key_energy, 1.4 * scale, key_color, "RECTANGLE", 2.0 * scale, spread_deg=95.0),
        # 补光：左前，大而弱，只是把阴影托起来
        _add_area_light("FillLight", (fx - 2.8 * scale, fy - 2.2 * scale, fz + 0.3 * scale), focus,
                        key_energy * 0.16, 3.5 * scale, fill_color, "SQUARE", spread_deg=120.0),
        # 轮廓光：左后上方，勾出头发和肩线；带格栅避免打亮背景
        _add_area_light("RimLight", (fx - 1.7 * scale, fy + 2.0 * scale, fz + 1.5 * scale), focus,
                        key_energy * 1.1, 0.7 * scale, (1.0, 0.97, 0.94), "DISK", spread_deg=45.0),
        # 发光：从右后上方给头发一点高光
        _add_area_light("HairLight", (fx + 1.0 * scale, fy + 1.4 * scale, fz + 2.4 * scale), focus,
                        key_energy * 0.35, 0.6 * scale, (1.0, 1.0, 1.0), "DISK", spread_deg=40.0),
        # 背景灯：在人物身后的背景上打出柔和的光斑渐变，避免死黑
        _add_area_light("BackgroundLight", (fx, fy + 1.0 * scale, fz + 0.6 * scale), (fx, fy + 3.0, fz + 0.9),
                        key_energy * 0.25, 1.8 * scale, (1.0, 1.0, 1.0), "DISK", spread_deg=110.0),
    ]
    return lights


# ----------------------------------------------------------------------------- 相机
def add_camera(target, distance, lens=85.0, azimuth_deg=20.0, elevation_deg=4.0, fstop=None, focus_target=None,
               name="Camera"):
    """在 target 周围放相机：azimuth 是绕 Z 的水平方位角（0 = 正面），elevation 是俯仰。"""
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam_data.sensor_fit = "VERTICAL"
    cam_data.sensor_height = 24.0
    cam_data.sensor_width = 36.0
    cam_data.clip_end = 200.0
    if fstop is not None:
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = fstop
        cam_data.dof.aperture_blades = 9

    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)

    az = math.radians(azimuth_deg)
    el = math.radians(elevation_deg)
    target = Vector(target)
    offset = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * distance
    cam.location = target + offset
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    if fstop is not None:
        focus_point = Vector(focus_target) if focus_target is not None else target
        cam_data.dof.focus_distance = (focus_point - cam.location).length

    bpy.context.scene.camera = cam
    return cam


def distance_for_frame_height(frame_height, lens, sensor_height=24.0):
    """要让画面竖向恰好装下 frame_height 米，相机离目标多远。"""
    half_fov = math.atan((sensor_height / 2.0) / lens)
    return (frame_height / 2.0) / math.tan(half_fov)


# ----------------------------------------------------------------------------- 渲染
def configure_render(width, height, samples=128, output_path=None, engine="CYCLES", denoise=True,
                     time_limit=0.0, look="AgX - Medium High Contrast"):
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 60

    if engine == "CYCLES":
        cycles = scene.cycles
        cycles.device = "CPU"
        cycles.samples = samples
        cycles.use_adaptive_sampling = True
        cycles.adaptive_threshold = 0.02
        cycles.time_limit = time_limit
        cycles.use_denoising = denoise
        cycles.denoiser = "OPENIMAGEDENOISE"
        cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
        cycles.max_bounces = 8
        cycles.diffuse_bounces = 4
        cycles.glossy_bounces = 4
        cycles.transmission_bounces = 8
        cycles.transparent_max_bounces = 24  # 头发/睫毛用了大量 alpha 贴图
        cycles.caustics_reflective = False
        cycles.caustics_refractive = False
        cycles.blur_glossy = 0.5
        cycles.sample_clamp_indirect = 8.0
        cycles.use_light_tree = True

    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = look
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    if output_path:
        scene.render.filepath = output_path
    return scene


def render_to(path):
    scene = bpy.context.scene
    scene.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    return path
