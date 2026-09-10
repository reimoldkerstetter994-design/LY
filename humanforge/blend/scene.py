"""Turn a built :class:`~humanforge.figure.Figure` into a lit Blender scene."""

from __future__ import annotations

from dataclasses import dataclass

import bpy
import mathutils
import numpy as np

from ..figure import Figure
from ..parts import Attachment
from ..polygonize import Mesh, largest_component, polygonize, taubin_smooth
from ..shading import skin_attributes
from . import materials
from .primitives import nail_mesh, sphere_mesh


def reset_scene() -> bpy.types.Scene:
    """Empty the file, keeping the scene itself."""
    for collection in (
        bpy.data.objects,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.lights,
        bpy.data.cameras,
        bpy.data.worlds,
    ):
        for item in list(collection):
            collection.remove(item)
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new("world")
    scene.world.use_nodes = True
    return scene


def _transform(centre: np.ndarray, frame: np.ndarray) -> mathutils.Matrix:
    """A 4x4 placing local axes along the columns of ``frame``."""
    matrix = mathutils.Matrix.Identity(4)
    for column in range(3):
        for row in range(3):
            matrix[row][column] = float(frame[row, column])
        matrix[column][3] = float(centre[column])
    return matrix


def add_mesh(
    name: str,
    mesh: Mesh,
    material: bpy.types.Material,
    attributes: dict[str, np.ndarray] | None = None,
    transform: mathutils.Matrix | None = None,
) -> bpy.types.Object:
    """Create an object from a :class:`Mesh`, with optional vertex attributes.

    Filling the mesh through ``foreach_set`` rather than ``from_pydata`` matters
    here: a body at render resolution is well over a million triangles, and the
    Python-object path costs minutes where this costs a fraction of a second.
    """
    data = bpy.data.meshes.new(name)
    verts = np.ascontiguousarray(mesh.verts, dtype=np.float32)
    tris = np.ascontiguousarray(mesh.tris, dtype=np.int32)

    data.vertices.add(mesh.n_verts)
    data.vertices.foreach_set("co", verts.reshape(-1))
    data.loops.add(mesh.n_tris * 3)
    data.loops.foreach_set("vertex_index", tris.reshape(-1))
    data.polygons.add(mesh.n_tris)
    data.polygons.foreach_set(
        "loop_start", np.arange(0, mesh.n_tris * 3, 3, dtype=np.int32)
    )
    data.update()

    # Smooth shading everywhere: the surface really is smooth, and marching
    # tetrahedra's facets are an artefact of the extraction, not a feature.
    data.polygons.foreach_set("use_smooth", np.ones(mesh.n_tris, dtype=np.int8))

    for attribute_name, values in (attributes or {}).items():
        attribute = data.attributes.new(attribute_name, "FLOAT", "POINT")
        attribute.data.foreach_set(
            "value", np.ascontiguousarray(values, dtype=np.float32)
        )

    data.materials.append(material)
    obj = bpy.data.objects.new(name, data)
    if transform is not None:
        obj.matrix_world = transform
    bpy.context.collection.objects.link(obj)
    return obj


def add_attachments(
    attachments: list[Attachment],
    eye_material: bpy.types.Material,
    nail_material: bpy.types.Material,
) -> list[bpy.types.Object]:
    """Instance the eyeballs and nail plates at their reported transforms."""
    unit_sphere = sphere_mesh()
    objects = []
    for attachment in attachments:
        if attachment.kind == "eye":
            radius = float(attachment.size[0])
            objects.append(
                add_mesh(
                    attachment.name,
                    unit_sphere,
                    eye_material,
                    transform=_transform(
                        attachment.centre, attachment.frame * radius
                    ),
                )
            )
        elif attachment.kind == "nail":
            half_width, thickness, half_length = (float(v) for v in attachment.size)
            objects.append(
                add_mesh(
                    attachment.name,
                    nail_mesh(
                        width=half_width * 2.0,
                        length=half_length * 2.0,
                        thickness=max(thickness, 0.0002),
                        curvature=attachment.curvature,
                    ),
                    nail_material,
                    transform=_transform(attachment.centre, attachment.frame),
                )
            )
    return objects


# ---------------------------------------------------------------------------
# staging


@dataclass(frozen=True)
class Studio:
    """A three-point studio rig, sized relative to the figure.

    Powers are given for a subject about two metres from the key light and are
    rescaled with the square of the actual distance, so the same numbers hold for
    a full-length shot and a head-and-shoulders one.
    """

    key_power: float = 150.0
    fill_ratio: float = 0.16
    rim_ratio: float = 0.55
    bounce_ratio: float = 0.10

    key_yaw: float = 38.0
    """Degrees the key light sits to the figure's left of the camera axis."""

    key_pitch: float = 26.0
    key_size: float = 1.1
    """Key light diagonal in metres; this is what sets how soft the shadows are."""

    ambient: float = 0.012
    backdrop: bool = True


def _aim(obj: bpy.types.Object, target: np.ndarray) -> None:
    direction = mathutils.Vector(tuple(target)) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _area_light(
    name: str,
    location: np.ndarray,
    target: np.ndarray,
    power: float,
    size: float,
    colour: tuple[float, float, float],
    aspect: float = 1.4,
) -> bpy.types.Object:
    light = bpy.data.lights.new(name, type="AREA")
    light.shape = "RECTANGLE"
    light.size = size
    light.size_y = size * aspect
    light.energy = power
    light.color = colour
    obj = bpy.data.objects.new(name, light)
    obj.location = tuple(location)
    bpy.context.collection.objects.link(obj)
    _aim(obj, target)
    return obj


def light_studio(figure: Figure, look: Studio, aim_height: float) -> list[bpy.types.Object]:
    """Key, fill, rim and bounce, placed around the figure.

    The classic arrangement, and it is classic because of what it does to a face:
    a large key off to one side gives the nose and brow readable shadows, a broad
    fill keeps those shadows from going black, and a rim behind the shoulders
    separates skin from a dark backdrop -- which is exactly where subsurface
    scattering shows itself, in the glow through an ear or a nostril.
    """
    H = figure.height
    target = np.array([0.0, 0.0, aim_height])
    reach = max(1.6, 1.35 * H)

    def place(yaw: float, pitch: float, distance: float) -> np.ndarray:
        yaw_r, pitch_r = np.radians(yaw), np.radians(pitch)
        horizontal = distance * np.cos(pitch_r)
        return target + np.array(
            [
                -horizontal * np.sin(yaw_r),
                horizontal * np.cos(yaw_r),
                distance * np.sin(pitch_r),
            ]
        )

    def power(base: float, distance: float) -> float:
        return base * (distance / 2.0) ** 2

    lights = []
    key_at = place(look.key_yaw, look.key_pitch, reach)
    lights.append(
        _area_light(
            "key",
            key_at,
            target,
            power(look.key_power, reach),
            look.key_size,
            (1.0, 0.965, 0.925),
        )
    )
    # The fill is deliberately much larger and much weaker: its job is to raise
    # the shadow side without adding a second visible highlight.
    fill_at = place(-52.0, 12.0, reach * 1.15)
    lights.append(
        _area_light(
            "fill",
            fill_at,
            target,
            power(look.key_power * look.fill_ratio, reach * 1.15),
            look.key_size * 2.4,
            (0.93, 0.955, 1.0),
            aspect=1.6,
        )
    )
    rim_at = place(196.0, 34.0, reach * 0.95)
    lights.append(
        _area_light(
            "rim",
            rim_at,
            target,
            power(look.key_power * look.rim_ratio, reach * 0.95),
            look.key_size * 0.55,
            (0.90, 0.94, 1.0),
            aspect=2.2,
        )
    )
    # A reflector on the floor, which is what stops a standing figure's shins and
    # jaw from falling away into nothing.
    bounce_at = target + np.array([0.0, 1.05 * H, -aim_height + 0.12 * H])
    lights.append(
        _area_light(
            "bounce",
            bounce_at,
            target,
            power(look.key_power * look.bounce_ratio, reach),
            look.key_size * 2.8,
            (1.0, 0.97, 0.94),
            aspect=1.0,
        )
    )
    return lights


def add_world(scene: bpy.types.Scene, strength: float) -> None:
    """A dim neutral surround, standing in for the rest of the room."""
    tree = scene.world.node_tree
    tree.nodes.clear()
    background = tree.nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = (0.30, 0.33, 0.38, 1.0)
    background.inputs["Strength"].default_value = strength
    output = tree.nodes.new("ShaderNodeOutputWorld")
    tree.links.new(background.outputs["Background"], output.inputs["Surface"])


def add_backdrop(figure: Figure, material: bpy.types.Material) -> bpy.types.Object:
    """A cyclorama: floor sweeping up into a back wall, with no visible seam."""
    H = figure.height
    width, depth, rise = 3.2 * H, 1.9 * H, 2.1 * H
    radius = 0.45 * H

    # Profile in the (y, z) plane: flat floor, quarter-circle cove, flat wall.
    steps = 14
    angle = np.linspace(0.0, np.pi / 2.0, steps)
    profile = [(depth * 0.55, 0.0)]
    profile += [
        (-depth + radius - radius * np.sin(a), radius - radius * np.cos(a))
        for a in angle
    ]
    profile += [(-depth, rise)]

    verts, tris = [], []
    for index, (y, z) in enumerate(profile):
        verts.append((-width * 0.5, y, z))
        verts.append((width * 0.5, y, z))
        if index:
            a, b = 2 * (index - 1), 2 * (index - 1) + 1
            c, d = 2 * index, 2 * index + 1
            tris.append((a, c, d))
            tris.append((a, d, b))

    mesh = Mesh(np.asarray(verts, dtype=np.float32), np.asarray(tris, dtype=np.int32))
    return add_mesh("backdrop", mesh, material)


# ---------------------------------------------------------------------------
# cameras


@dataclass(frozen=True)
class Shot:
    """One framing: what to look at, from how far, and with what lens."""

    name: str
    target: str
    """Landmark to centre on, or ``"body"`` for the whole figure."""

    covers: float
    """Height the frame should span, in metres."""

    focal: float = 85.0
    yaw: float = 16.0
    """Degrees around the figure; positive swings towards its left."""

    pitch: float = 2.0
    roll: float = 0.0


SHOTS = {
    "full": Shot("full", "body", 1.0, focal=85.0, yaw=14.0, pitch=1.0),
    "portrait": Shot("portrait", "head_centre", 0.34, focal=135.0, yaw=22.0, pitch=3.0),
    "face": Shot("face", "eye_mid", 0.17, focal=135.0, yaw=12.0, pitch=2.0),
    "hand": Shot("hand", "hand_l", 0.22, focal=135.0, yaw=28.0, pitch=14.0),
    "torso": Shot("torso", "chest", 0.60, focal=105.0, yaw=20.0, pitch=2.0),
    # Orthogonal views for checking anatomy rather than for showing it off.
    "front": Shot("front", "body", 1.0, focal=110.0, yaw=0.0, pitch=0.0),
    "side": Shot("side", "body", 1.0, focal=110.0, yaw=90.0, pitch=0.0),
    "back": Shot("back", "body", 1.0, focal=110.0, yaw=180.0, pitch=0.0),
    "head_front": Shot("head_front", "head_centre", 0.30, focal=120.0, yaw=0.0),
    "head_side": Shot("head_side", "head_centre", 0.30, focal=120.0, yaw=90.0),
}

SENSOR_HEIGHT = 24.0
"""Full-frame sensor height in millimetres, fixed so framing is predictable."""


def add_camera(figure: Figure, shot: Shot, margin: float = 1.08) -> bpy.types.Object:
    """Place a camera that frames ``shot`` and return it."""
    H = figure.height
    if shot.target == "body":
        covers = shot.covers * H * margin
        centre = np.array([0.0, 0.0, H * 0.50])
    else:
        covers = shot.covers * (H / 1.75) * margin
        centre = np.asarray(figure.landmarks[shot.target], dtype=float)

    distance = covers * shot.focal / SENSOR_HEIGHT
    yaw, pitch = np.radians(shot.yaw), np.radians(shot.pitch)
    horizontal = distance * np.cos(pitch)
    location = centre + np.array(
        [
            -horizontal * np.sin(yaw),
            horizontal * np.cos(yaw),
            distance * np.sin(pitch),
        ]
    )

    camera = bpy.data.cameras.new(shot.name)
    camera.lens = shot.focal
    camera.sensor_fit = "VERTICAL"
    camera.sensor_height = SENSOR_HEIGHT
    # A real portrait lens is shot near wide open; the shallow focus is part of
    # why a photograph of skin looks like one.
    camera.dof.use_dof = True
    camera.dof.focus_distance = distance
    camera.dof.aperture_fstop = 4.0 if shot.target == "body" else 2.8

    obj = bpy.data.objects.new(shot.name, camera)
    obj.location = tuple(location)
    bpy.context.collection.objects.link(obj)
    _aim(obj, centre)
    if shot.roll:
        obj.rotation_euler.rotate_axis("Z", np.radians(shot.roll))
    return obj


# ---------------------------------------------------------------------------
# assembly


@dataclass
class Staged:
    """Everything the renderer needs to know about one built scene."""

    figure: Figure
    body: bpy.types.Object
    mesh: Mesh
    attachments: list[bpy.types.Object]
    lights: list[bpy.types.Object]


def stage(
    figure: Figure,
    skin: materials.SkinLook,
    eyes: materials.EyeLook,
    voxel: float = 0.0042,
    studio: Studio = Studio(),
    smoothing: int = 4,
    clay: bool = False,
) -> Staged:
    """Polygonize ``figure``, dress it and light it."""
    scene = reset_scene()

    mesh = polygonize(figure.body, voxel=voxel)
    # Carving the eye sockets and mouth leaves sealed pockets inside the head;
    # they never show, but random-walk subsurface scattering traces real paths
    # through the volume and would find them.
    mesh = largest_component(mesh)
    mesh = taubin_smooth(mesh, iterations=smoothing)

    name = figure.params.name
    body = add_mesh(
        f"{name}_body",
        mesh,
        materials.clay_material("clay") if clay else materials.skin_material(f"skin_{name}", skin),
        attributes=None if clay else skin_attributes(figure, mesh, voxel),
    )
    attachments = add_attachments(
        figure.attachments,
        materials.clay_material("clay_eye", 0.20) if clay else materials.eye_material(f"eye_{name}", eyes),
        materials.clay_material("clay_nail", 0.40) if clay else materials.nail_material(f"nail_{name}", skin.tone),
    )

    add_world(scene, studio.ambient)
    if studio.backdrop:
        add_backdrop(figure, materials.backdrop_material("backdrop"))
    lights = light_studio(figure, studio, aim_height=figure.height * 0.62)

    return Staged(
        figure=figure, body=body, mesh=mesh, attachments=attachments, lights=lights
    )
