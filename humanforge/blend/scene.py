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

    key_power: float = 64.0
    """Key light power for a subject two metres away, in watts.

    Set so that lit skin lands near the middle of the AgX curve rather than the top
    of it.  Exposed a stop and a half higher, as it was, the figures came out both
    too light and washed out -- measurably: lit skin read (226, 211, 204) with about
    twenty units of chroma, where a photograph of the same complexion under the same
    rig gives something closer to (205, 180, 165) with fifty.  AgX pulls saturation
    out of the top of its range, so overexposing skin does not merely brighten it,
    it drains the colour, and correcting the albedo afterwards cannot put it back.
    """

    fill_ratio: float = 0.16
    rim_ratio: float = 0.26
    """A rim at over half the key blows out wherever it grazes a convex ridge --
    across both acromia and under the jaw, in hard-edged white patches that look
    like holes in the mesh and are not."""

    bounce_ratio: float = 0.06
    """The floor reflector aims upwards, so it lands square on the submental shelf
    and the soles.  Anything stronger and the underside of the jaw is the brightest
    thing in the frame, which no studio photograph of a person has ever been."""

    key_yaw: float = 38.0
    """Degrees the key light sits to the figure's left of the camera axis."""

    key_pitch: float = 26.0
    key_size: float = 0.58
    """Key light diagonal as a fraction of the framed height.

    A fraction rather than a size in metres, because how soft a light is depends
    entirely on how big it is *relative to the subject*.  A 1.1 m softbox is a
    good key for a standing figure and a giant flat panel for a head: rig one
    absolute size for both and the portrait comes out with no modelling at all,
    which is a lighting fault that reads as a modelling fault.
    """

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


def light_studio(
    figure: Figure, look: Studio, aim_height: float, subject: float | None = None
) -> list[bpy.types.Object]:
    """Key, fill, rim and bounce, placed around the figure.

    The classic arrangement, and it is classic because of what it does to a face:
    a large key off to one side gives the nose and brow readable shadows, a broad
    fill keeps those shadows from going black, and a rim behind the shoulders
    separates skin from a dark backdrop -- which is exactly where subsurface
    scattering shows itself, in the glow through an ear or a nostril.

    Every distance is set from ``subject``, the height the frame covers, so the rig
    stays in proportion to what is being photographed rather than to the figure.
    A rig sized for a standing figure, used for a head, puts a two-metre-wide source
    a metre and a half from a face: the result has no shadow anywhere on it, and
    a face with no shadow on it has no shape.
    """
    H = figure.height
    target = np.array([0.0, 0.0, aim_height])
    subject = subject if subject else H
    reach = max(0.7, 2.2 * subject)

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
            look.key_size * subject,
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
            look.key_size * subject * 2.4,
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
            look.key_size * subject * 0.55,
            (0.90, 0.94, 1.0),
            aspect=2.2,
        )
    )
    # A reflector on the floor, which is what stops a standing figure's shins and
    # jaw from falling away into nothing.
    bounce_at = target + np.array([0.0, 0.85 * reach, -aim_height + 0.12 * H])
    lights.append(
        _area_light(
            "bounce",
            bounce_at,
            target,
            power(look.key_power * look.bounce_ratio, reach),
            look.key_size * subject * 2.8,
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

DEFAULT_ASPECT = 2.0 / 3.0
"""Frame width over height, matching the default render resolution."""


def relight(
    figure: Figure,
    studio: Studio,
    shot: Shot,
    aspect: float = DEFAULT_ASPECT,
) -> list[bpy.types.Object]:
    """Rebuild the studio rig around whatever ``shot`` frames.

    Called per shot rather than once per figure, since a rig in proportion to a
    standing figure is the wrong rig for a portrait taken from the same scene.
    Moving four lights costs nothing next to meshing the body, so there is no
    reason to share one compromise between them.
    """
    for obj in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(obj, do_unlink=True)
    for light in list(bpy.data.lights):
        bpy.data.lights.remove(light)
    centre, covers = framing(figure, shot, aspect=aspect)
    return light_studio(
        figure, studio, aim_height=float(centre[2]), subject=covers
    )


def _spread(figure: Figure, shot: Shot, centre: np.ndarray) -> float:
    """Half the width the figure occupies across ``shot``'s frame, in metres.

    Measured along the camera's own horizontal axis rather than along X, since a
    yawed camera sees a spread arm partly end-on and so foreshortens it.
    """
    yaw = np.radians(shot.yaw)
    right = np.array([np.cos(yaw), np.sin(yaw), 0.0])

    points = [np.asarray(p, dtype=float) for p in figure.skeleton.points.values()]
    offsets = [abs(float((p - centre) @ right)) for p in points]
    # Joints are bone, so allow for the flesh on the two that can be widest: the
    # fingers spread beyond the hand's axis, and the hips beyond the hip joints.
    m = figure.measures
    return max(max(offsets) + 0.5 * m.b("hand_breadth"), 0.5 * m.b("hip"))


def framing(
    figure: Figure,
    shot: Shot,
    margin: float = 1.08,
    aspect: float = DEFAULT_ASPECT,
) -> tuple[np.ndarray, float]:
    """Where ``shot`` is centred and how much height it covers, in metres.

    Shared by the camera and the lights so the two cannot disagree about what is
    being photographed.

    A whole figure needs ``aspect`` -- the frame's width over its height -- because
    with the arms abducted it is half again as wide as it is tall in a portrait
    frame, so fitting its height is not enough to fit the figure.  Fit whichever
    of the two binds.
    """
    H = figure.height
    if shot.target != "body":
        return (
            np.asarray(figure.landmarks[shot.target], dtype=float),
            shot.covers * (H / 1.75) * margin,
        )
    centre = np.array([0.0, 0.0, H * 0.50])
    tall = shot.covers * H * margin
    wide = 2.0 * _spread(figure, shot, centre) * margin / max(aspect, 1.0e-6)
    return centre, max(tall, wide)


def add_camera(
    figure: Figure,
    shot: Shot,
    margin: float = 1.08,
    aspect: float = DEFAULT_ASPECT,
) -> bpy.types.Object:
    """Place a camera that frames ``shot`` and return it."""
    centre, covers = framing(figure, shot, margin, aspect)

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
    hair: bpy.types.Object | None = None


def stage(
    figure: Figure,
    skin: materials.SkinLook,
    eyes: materials.EyeLook,
    hair: materials.HairLook | None = None,
    voxel: float = 0.0042,
    studio: Studio = Studio(),
    smoothing: int = 4,
    clay: bool = False,
    region: tuple[np.ndarray, np.ndarray] | None = None,
) -> Staged:
    """Polygonize ``figure``, dress it and light it."""
    scene = reset_scene()

    mesh = polygonize(figure.body, voxel=voxel, region=region)
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

    # The hair is its own mesh and its own material.  It has to be, since nothing
    # done to a skin shader turns part of it into hair, and a hairline has to be a
    # real edge in the geometry to survive a raking light.  It is meshed finer than
    # the body because a shell 12 mm thick sampled at a body's voxel spacing is only
    # a couple of cells through and comes out lumpy.
    hair_object = None
    if figure.hair is not None:
        # Every component is kept, unlike the body.  The eyebrows are separate
        # solids from the scalp by construction, so taking the largest component
        # here silently deletes them -- which is what left the faces browless while
        # the field they were built into contained them all along.  Nothing is
        # carved out of the hair, so there are no sealed pockets to worry about.
        hair_mesh = taubin_smooth(
            polygonize(figure.hair, voxel=min(voxel, 0.0026)),
            iterations=smoothing,
        )
        hair_object = add_mesh(
            f"{name}_hair",
            hair_mesh,
            materials.clay_material("clay_hair", 0.16)
            if clay
            else materials.hair_material(
                f"hair_{name}", hair or materials.HAIR_COLOURS["dark_brown"]
            ),
        )

    add_world(scene, studio.ambient)
    if studio.backdrop:
        add_backdrop(figure, materials.backdrop_material("backdrop"))
    lights = relight(figure, studio, SHOTS["full"])

    return Staged(
        figure=figure,
        body=body,
        mesh=mesh,
        attachments=attachments,
        lights=lights,
        hair=hair_object,
    )
