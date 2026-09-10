"""Skin, eye, nail and backdrop materials.

The skin shader is driven by the vertex attributes baked in
:mod:`humanforge.shading` -- ``exposure``, ``flush``, ``oil``, ``thin`` and
``crease`` -- so its variation follows the anatomy instead of a noise field that
happens to look busy.  On top of that sit three scales of procedural relief
(slack, micro-wrinkle, pore), because at conversational distance it is the
specular breakup from sub-millimetre detail, not the diffuse colour, that
separates skin from painted rubber.
"""

from __future__ import annotations

from dataclasses import dataclass

import bpy

from .nodes import Graph, new_material, srgb


@dataclass(frozen=True)
class SkinTone:
    """One complexion, given as sRGB triples in 0-255.

    ``base`` is the least exposed skin (the underside of an upper arm) and
    ``tanned`` the most exposed (the back of a hand).  The gap between them is
    wider than most references admit -- a couple of shades on the same body --
    and reproducing it is most of what makes a figure look lived in.
    """

    name: str
    base: tuple[float, float, float]
    tanned: tuple[float, float, float]
    flush: tuple[float, float, float]

    subsurface_radius: tuple[float, float, float] = (1.0, 0.32, 0.17)
    """Relative mean free path per channel.  Red travels furthest, which is why
    an ear lit from behind glows orange rather than white."""

    subsurface_scale: float = 0.0075
    """Mean free path of the red channel, in metres."""


TONES: dict[str, SkinTone] = {
    "porcelain": SkinTone(
        "porcelain",
        base=(246, 222, 209),
        tanned=(233, 197, 176),
        flush=(226, 148, 137),
        subsurface_radius=(1.0, 0.30, 0.16),
        subsurface_scale=0.0090,
    ),
    "fair": SkinTone(
        "fair",
        base=(238, 208, 190),
        tanned=(214, 172, 145),
        flush=(213, 132, 120),
        subsurface_scale=0.0082,
    ),
    "olive": SkinTone(
        "olive",
        base=(219, 184, 152),
        tanned=(184, 145, 110),
        flush=(191, 118, 100),
        subsurface_radius=(1.0, 0.30, 0.15),
        subsurface_scale=0.0070,
    ),
    "tan": SkinTone(
        "tan",
        base=(198, 158, 124),
        tanned=(160, 118, 86),
        flush=(170, 103, 86),
        subsurface_radius=(1.0, 0.28, 0.14),
        subsurface_scale=0.0062,
    ),
    "brown": SkinTone(
        "brown",
        base=(152, 111, 80),
        tanned=(115, 79, 55),
        flush=(133, 76, 62),
        subsurface_radius=(1.0, 0.24, 0.11),
        subsurface_scale=0.0050,
    ),
    "deep": SkinTone(
        "deep",
        base=(104, 71, 51),
        tanned=(74, 49, 35),
        flush=(96, 52, 42),
        subsurface_radius=(1.0, 0.20, 0.09),
        subsurface_scale=0.0040,
    ),
}


@dataclass(frozen=True)
class SkinLook:
    """Per-figure skin settings that are not part of the complexion itself."""

    tone: SkinTone

    age: float = 0.4
    """0 for a child's skin, 1 for heavily weathered: drives slack and dryness."""

    oiliness: float = 0.5


@dataclass(frozen=True)
class EyeLook:
    """Iris colour and how much of the sclera's vasculature shows."""

    iris_inner: tuple[float, float, float]
    iris_outer: tuple[float, float, float]
    pupil_scale: float = 1.0
    vein_strength: float = 0.6


IRISES: dict[str, EyeLook] = {
    "brown": EyeLook((118, 78, 40), (66, 42, 24)),
    "dark_brown": EyeLook((78, 50, 30), (40, 25, 15)),
    "hazel": EyeLook((146, 112, 52), (86, 74, 42)),
    "amber": EyeLook((176, 126, 48), (110, 74, 30)),
    "green": EyeLook((104, 128, 74), (54, 74, 52)),
    "blue": EyeLook((110, 146, 168), (52, 78, 104)),
    "grey": EyeLook((132, 138, 140), (74, 80, 86)),
}


# ---------------------------------------------------------------------------
# skin


def _relief(graph: Graph, position, look: SkinLook):
    """Three chained bump layers, coarsest first.

    Each displaces the normal by a fraction of a millimetre.  The exact amounts
    matter far less than there being several octaves of them: one scale of bump
    reads as a texture, three read as skin.
    """
    slack = graph.noise(position, scale=46.0, detail=5.0, roughness=0.62, name="slack")
    wrinkle = graph.noise(
        position, scale=320.0, detail=6.0, roughness=0.72, name="micro_wrinkle"
    )
    # Pores read as pits, so the cell-centre peaks of an F1 Voronoi are inverted
    # rather than used directly.
    pores = graph.math(
        "SUBTRACT",
        1.0,
        graph.voronoi(position, scale=1250.0, randomness=0.85, name="pores"),
    )

    normal = graph.bump(
        slack,
        strength=0.28 + 0.42 * look.age,
        distance=0.0010 + 0.0018 * look.age,
        name="bump_slack",
    )
    normal = graph.bump(
        wrinkle,
        strength=0.42 + 0.28 * look.age,
        distance=0.00035,
        normal=normal,
        name="bump_wrinkle",
    )
    normal = graph.bump(
        pores, strength=0.34, distance=0.00012, normal=normal, name="bump_pore"
    )
    return normal, wrinkle


def skin_material(name: str, look: SkinLook) -> bpy.types.Material:
    """Build the skin shader for one figure."""
    tone = look.tone
    material, graph = new_material(name)

    # Object coordinates are metres, because the figure is modelled at real
    # scale; that is what lets the procedural scales below be read as sizes.
    position = graph.add("ShaderNodeTexCoord").outputs["Object"]

    exposure = graph.attribute("exposure")
    flush = graph.attribute("flush")
    oil = graph.attribute("oil")
    thin = graph.attribute("thin")
    crease = graph.attribute("crease")

    normal, wrinkle = _relief(graph, position, look)

    # -- base colour ------------------------------------------------------
    colour = graph.mix(
        "RGBA",
        graph.math("MULTIPLY", exposure, 0.55 + 0.30 * look.age),
        srgb(*tone.base),
        srgb(*tone.tanned),
    )
    colour = graph.mix(
        "RGBA", graph.math("MULTIPLY", flush, 0.45), colour, srgb(*tone.flush)
    )

    # Low-frequency blotching.  Skin is never a flat field, and this is what
    # keeps a full-body shot from reading as vinyl.
    blotch = graph.ramp(
        graph.noise(position, scale=11.0, detail=4.0, name="blotch"),
        (0.32, (0.88, 0.82, 0.81)),
        (0.50, (1.00, 1.00, 1.00)),
        (0.70, (1.05, 0.99, 0.95)),
    )
    colour = graph.blend("MULTIPLY", 0.55 + 0.25 * look.age, colour, blotch)

    # Creases hold shadow and a little grime: a stand-in for the occlusion a
    # fold would get from geometry finer than the voxel grid can resolve.
    colour = graph.blend(
        "MULTIPLY",
        graph.math("MULTIPLY", crease, 0.75),
        colour,
        (0.62, 0.50, 0.46, 1.0),
    )

    # -- roughness --------------------------------------------------------
    # Oily zones are glossier, dry and creased ones duller, and a fine random
    # component stops the specular from being one clean shape.
    roughness = graph.math(
        "SUBTRACT",
        0.52 + 0.10 * look.age,
        graph.math("MULTIPLY", oil, 0.20 * (0.4 + 1.2 * look.oiliness)),
    )
    roughness = graph.math("ADD", roughness, graph.math("MULTIPLY", crease, 0.12))
    roughness = graph.math(
        "MULTIPLY_ADD", graph.math("SUBTRACT", wrinkle, 0.5), 0.10, roughness
    )

    # -- subsurface -------------------------------------------------------
    # Thin tissue (eyelids, ears, lips, webbing) scatters much further relative
    # to its thickness, so both the weight and the mean free path rise there.
    sss_weight = graph.math("MULTIPLY_ADD", thin, 0.16, 0.17)
    sss_scale = graph.math(
        "MULTIPLY", tone.subsurface_scale, graph.math("MULTIPLY_ADD", thin, 0.9, 1.0)
    )

    skin = graph.principled(
        "skin", distribution="MULTI_GGX", subsurface_method="RANDOM_WALK_SKIN"
    )
    graph.feed(skin, "Base Color", colour)
    graph.feed(skin, "Roughness", graph.clamp(roughness, 0.16, 0.78))
    graph.feed(skin, "Normal", normal)
    graph.feed(skin, "Subsurface Weight", sss_weight)
    graph.feed(skin, "Subsurface Scale", sss_scale)
    graph.feed(skin, "Subsurface Radius", tone.subsurface_radius)
    graph.feed(skin, "Subsurface Anisotropy", 0.75)
    graph.feed(skin, "IOR", 1.40)

    # A thin sebum film over the epidermis: the crisp highlight that sits on top
    # of the broad, soft one coming out of the skin itself.
    graph.feed(skin, "Coat Weight", graph.math("MULTIPLY_ADD", oil, 0.22, 0.04))
    graph.feed(skin, "Coat Roughness", 0.24 + 0.16 * look.age)
    graph.feed(skin, "Coat IOR", 1.45)

    # Vellus hair: a faint retroreflective rim, most visible on a backlit arm.
    graph.feed(skin, "Sheen Weight", 0.12)
    graph.feed(skin, "Sheen Roughness", 0.30)
    graph.feed(skin, "Sheen Tint", srgb(238, 214, 198))
    return material


# ---------------------------------------------------------------------------
# eyes


def eye_material(name: str, look: EyeLook) -> bpy.types.Material:
    """Sclera, limbal ring, iris and pupil on a single unit sphere.

    The eyeball is one sphere whose local ``+Y`` is the gaze direction, so every
    region is a function of the polar angle away from that axis: object
    coordinates run -1..1 and ``sqrt(x^2 + z^2)`` is the sine of that angle.
    Building it this way needs no UVs and keeps the iris centred however the head
    is turned.
    """
    material, graph = new_material(name)

    x, y, z = graph.separate(graph.add("ShaderNodeTexCoord").outputs["Object"])

    radius = graph.math(
        "SQRT",
        graph.math(
            "ADD", graph.math("MULTIPLY", x, x), graph.math("MULTIPLY", z, z)
        ),
    )
    # Fold the rear hemisphere out past the rim so the sclera wraps around it.
    radial = graph.mix("FLOAT", graph.math("GREATER_THAN", y, 0.0), 1.0, radius)

    iris_edge = 0.455
    pupil_edge = 0.185 * look.pupil_scale

    # Radial fibres of the iris stroma: noise in (angle, radius) rather than in
    # space, which is what makes the streaks run outwards from the pupil.
    angle = graph.math("ARCTAN2", x, z)
    fibres = graph.noise(
        graph.combine(
            graph.math("MULTIPLY", angle, 5.2), graph.math("MULTIPLY", radial, 0.9)
        ),
        scale=9.0,
        detail=6.0,
        roughness=0.68,
        distortion=0.4,
        name="iris_fibres",
    )
    iris = graph.mix("RGBA", fibres, srgb(*look.iris_inner), srgb(*look.iris_outer))
    # The collarette: the iris darkens noticeably towards the limbus.
    iris = graph.blend(
        "MULTIPLY",
        graph.ramp(radial, (0.10, (0.0,) * 3), (iris_edge, (1.0,) * 3)),
        iris,
        (0.55, 0.52, 0.50, 1.0),
    )

    # Sclera: never white.  A warm grey, yellower and more heavily veined towards
    # the corners; the vasculature is what makes an eye look alive.
    veins = graph.ramp(
        graph.noise(
            graph.add("ShaderNodeTexCoord").outputs["Object"],
            scale=26.0,
            detail=8.0,
            roughness=0.78,
            distortion=2.2,
            name="veins",
        ),
        (0.58, (0.0,) * 3),
        (0.74, (1.0,) * 3),
    )
    sclera = graph.mix(
        "RGBA",
        graph.math(
            "MULTIPLY",
            graph.math("MULTIPLY", veins, look.vein_strength),
            # Veins thin out over the cornea and gather towards the corners.
            graph.ramp(radial, (iris_edge, (0.0,) * 3), (0.95, (1.0,) * 3)),
        ),
        srgb(232, 226, 219),
        srgb(186, 108, 100),
    )

    to_iris = graph.ramp(
        radial, (iris_edge - 0.012, (1.0,) * 3), (iris_edge + 0.012, (0.0,) * 3)
    )
    to_pupil = graph.ramp(
        radial, (pupil_edge - 0.010, (1.0,) * 3), (pupil_edge + 0.010, (0.0,) * 3)
    )
    limbus = graph.ramp(
        radial,
        (iris_edge - 0.075, (0.0,) * 3),
        (iris_edge - 0.008, (1.0,) * 3),
        (iris_edge + 0.022, (0.0,) * 3),
    )

    colour = graph.mix("RGBA", to_iris, sclera, iris)
    colour = graph.blend(
        "MULTIPLY",
        graph.math("MULTIPLY", limbus, 0.85),
        colour,
        (0.20, 0.16, 0.14, 1.0),
    )
    colour = graph.mix("RGBA", to_pupil, colour, (0.006, 0.006, 0.006, 1.0))

    eye = graph.principled("eye", subsurface_method="RANDOM_WALK")
    graph.feed(eye, "Base Color", colour)
    graph.feed(eye, "Roughness", 0.22)
    graph.feed(eye, "IOR", 1.38)
    graph.feed(eye, "Subsurface Weight", 0.10)
    graph.feed(eye, "Subsurface Radius", (0.6, 0.6, 0.7))
    graph.feed(eye, "Subsurface Scale", 0.0015)

    # The cornea is a wet, almost perfectly smooth lens over the iris only; the
    # sclera is merely damp.  Treating it as a coat rather than a second object
    # keeps the catchlight tight without paying for refraction.
    graph.feed(eye, "Coat Weight", graph.mix("FLOAT", to_iris, 0.35, 1.0))
    graph.feed(eye, "Coat Roughness", 0.02)
    graph.feed(eye, "Coat IOR", 1.376)
    return material


# ---------------------------------------------------------------------------
# nails and backdrop


def nail_material(name: str, tone: SkinTone) -> bpy.types.Material:
    """Keratin plate: pink over the bed, whitening at the free edge.

    Generated coordinates run 0..1 across the plate's own bounding box, with
    ``+Z`` towards the finger tip, so the lunula and the free edge are just two
    stops along that axis and the nail's real size never enters into it.
    """
    material, graph = new_material(name)

    _, _, along = graph.separate(graph.add("ShaderNodeTexCoord").outputs["Generated"])
    plate = graph.ramp(
        along,
        (0.02, (0.94, 0.92, 0.90)),  # lunula, the pale crescent at the cuticle
        (0.24, (1.00, 0.86, 0.82)),  # bed, pink from the capillaries beneath
        (0.82, (1.00, 0.88, 0.84)),
        (0.97, (0.97, 0.95, 0.93)),  # free edge, with no bed behind it
    )

    nail = graph.principled("nail", subsurface_method="RANDOM_WALK")
    graph.feed(nail, "Base Color", graph.blend("MULTIPLY", 0.85, plate, srgb(*tone.base)))
    graph.feed(nail, "Roughness", 0.16)
    graph.feed(nail, "IOR", 1.55)
    graph.feed(nail, "Subsurface Weight", 0.35)
    graph.feed(nail, "Subsurface Radius", (1.0, 0.55, 0.42))
    graph.feed(nail, "Subsurface Scale", 0.0018)
    graph.feed(nail, "Coat Weight", 0.55)
    graph.feed(nail, "Coat Roughness", 0.10)
    return material


def clay_material(name: str, value: float = 0.32) -> bpy.types.Material:
    """Matte grey with no colour, texture or scattering.

    Sculptors work in clay for the same reason this exists: subsurface
    scattering and pore detail hide form.  Anything wrong with the anatomy is
    obvious here and easy to miss on rendered skin.
    """
    material, graph = new_material(name)
    clay = graph.principled("clay")
    graph.feed(clay, "Base Color", (value, value * 0.97, value * 0.94, 1.0))
    graph.feed(clay, "Roughness", 0.52)
    graph.feed(clay, "Specular IOR Level", 0.35)
    return material


def backdrop_material(name: str, value: float = 0.055) -> bpy.types.Material:
    """Matte studio sweep, dark enough to keep skin the brightest thing in frame."""
    material, graph = new_material(name)
    backdrop = graph.principled("backdrop")
    graph.feed(backdrop, "Base Color", (value, value, value * 1.06, 1.0))
    graph.feed(backdrop, "Roughness", 0.85)
    graph.feed(backdrop, "Specular IOR Level", 0.22)
    return material
