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

    subsurface_radius: tuple[float, float, float] = (1.0, 0.34, 0.19)
    """Relative mean free path per channel.  Red travels furthest, which is why
    an ear lit from behind glows orange rather than white."""

    subsurface_scale: float = 0.0048
    """Mean free path of the red channel, in metres.

    Measurements of dermis put this near 5 mm for red and under 1 mm for blue,
    which is smaller than it is tempting to set it.  Too large and the scattering
    stops describing a surface and starts washing the whole body towards the
    albedo of milk -- the figure goes pale, loses its shadow terminator and reads
    as wax, and no amount of correcting the diffuse colour brings it back, because
    what is wrong is the distance the light travels, not its hue.
    """


# Diffuse albedos, deliberately darker and more saturated than a photograph of
# skin suggests.  Two things brighten these before they reach the image: the
# subsurface term adds most of a stop on anything convex, and AgX pulls saturation
# out of the top of its range.  Picking sRGB values straight off a photograph of a
# lit arm therefore lands about two stops high, which is what made every figure
# here look like unpainted porcelain until the whole table came down.
TONES: dict[str, SkinTone] = {
    "porcelain": SkinTone(
        "porcelain",
        base=(232, 198, 184),
        tanned=(214, 174, 154),
        flush=(206, 130, 121),
        subsurface_radius=(1.0, 0.32, 0.18),
        subsurface_scale=0.0056,
    ),
    "fair": SkinTone(
        "fair",
        base=(220, 180, 158),
        tanned=(193, 146, 119),
        flush=(196, 116, 104),
        subsurface_scale=0.0052,
    ),
    "olive": SkinTone(
        "olive",
        base=(196, 156, 121),
        tanned=(160, 120, 87),
        flush=(170, 100, 84),
        subsurface_radius=(1.0, 0.32, 0.17),
        subsurface_scale=0.0045,
    ),
    "tan": SkinTone(
        "tan",
        base=(174, 132, 99),
        tanned=(138, 98, 69),
        flush=(150, 86, 70),
        subsurface_radius=(1.0, 0.30, 0.15),
        subsurface_scale=0.0040,
    ),
    "brown": SkinTone(
        "brown",
        base=(131, 92, 64),
        tanned=(97, 64, 43),
        flush=(114, 62, 49),
        subsurface_radius=(1.0, 0.26, 0.12),
        subsurface_scale=0.0032,
    ),
    "deep": SkinTone(
        "deep",
        base=(88, 58, 41),
        tanned=(61, 38, 27),
        flush=(80, 42, 33),
        subsurface_radius=(1.0, 0.22, 0.10),
        subsurface_scale=0.0026,
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
    # An F1 Voronoi's distance output is already zero at each cell centre and rises
    # away from it, so it is a field of pits as it stands, which is what a pore is.
    # Inverting it -- the obvious thing to reach for -- turns every pore into a bump
    # and the skin into gooseflesh.
    pores = graph.voronoi(position, scale=1250.0, randomness=0.85, name="pores")

    normal = graph.bump(
        slack,
        strength=0.28 + 0.42 * look.age,
        distance=0.0010 + 0.0018 * look.age,
        name="bump_slack",
    )
    normal = graph.bump(
        wrinkle,
        strength=0.42 + 0.28 * look.age,
        distance=0.00060,
        normal=normal,
        name="bump_wrinkle",
    )
    # A pore is a couple of hundredths of a millimetre deep, but what has to read at
    # portrait distance is the specular breakup rather than the depth, and at the
    # true depth there is none: the cheek came back with no more high frequency
    # detail than a sphere.  So this is exaggerated, and knowingly.
    normal = graph.bump(
        pores, strength=0.55, distance=0.00030, normal=normal, name="bump_pore"
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
    #
    # The weight is high and the radius small, which is the right way round and
    # not the intuitive one.  A low weight leaves most of the surface Lambertian,
    # and Lambertian skin is matte paint: what makes flesh look like flesh is that
    # almost all of the light coming back out has been under the surface, only not
    # very far.  Weighting it low and compensating with a long radius produces the
    # opposite of skin -- translucent in the large and dead in the small.
    sss_weight = graph.math("MULTIPLY_ADD", thin, 0.22, 0.64)
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
    # of the broad, soft one coming out of the skin itself.  Kept thin and not very
    # smooth: a glossier film reads as a sheen of sweat at best and as lacquer at
    # worst, and it is what turns any grazing light into a clipped white patch.
    graph.feed(skin, "Coat Weight", graph.math("MULTIPLY_ADD", oil, 0.13, 0.02))
    graph.feed(skin, "Coat Roughness", 0.30 + 0.16 * look.age)
    graph.feed(skin, "Coat IOR", 1.45)

    # Vellus hair: a faint retroreflective rim, most visible on a backlit arm.
    # Faint is the operative word -- turned up it puts a pale halo round every
    # limb, which is the other half of how skin ends up looking like candle wax.
    graph.feed(skin, "Sheen Weight", 0.05)
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
        srgb(214, 205, 195),
        srgb(186, 108, 100),
    )
    # Shade the sclera down away from the gaze axis.  The eyeball is a whole sphere
    # in a socket, so the further round it a point is, the deeper under the lids and
    # into the corners it lies, and the less of the room reaches it.  Cycles gets
    # some of this from the lids themselves, but nowhere near enough at a portrait
    # aperture: left at one brightness the sclera reads as a white ball resting in
    # an eye-shaped hole, which is most of what makes a rendered eye look glass.
    sclera = graph.blend(
        "MULTIPLY",
        graph.ramp(radial, (iris_edge, (0.0,) * 3), (0.92, (1.0,) * 3)),
        sclera,
        (0.42, 0.40, 0.40, 1.0),
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


@dataclass(frozen=True)
class HairLook:
    """One hair colour, as sRGB triples in 0-255."""

    name: str
    root: tuple[float, float, float]
    """Colour at the scalp, where the hair is densest and least sun-bleached."""

    tip: tuple[float, float, float]
    grey: float = 0.0
    """Fraction of the fibre that has lost its pigment."""

    sheen: float = 0.5
    """How glossy the fibre is; wiry hair scatters more and shines less."""


HAIR_COLOURS: dict[str, HairLook] = {
    "black": HairLook("black", root=(22, 18, 17), tip=(38, 30, 27), sheen=0.62),
    "dark_brown": HairLook("dark_brown", root=(44, 30, 22), tip=(72, 50, 34)),
    "brown": HairLook("brown", root=(74, 50, 32), tip=(112, 78, 48)),
    "auburn": HairLook("auburn", root=(84, 44, 26), tip=(134, 70, 34), sheen=0.58),
    "blond": HairLook("blond", root=(126, 96, 54), tip=(196, 162, 100), sheen=0.66),
    "grey": HairLook("grey", root=(96, 92, 90), tip=(150, 148, 146), grey=0.75, sheen=0.34),
    "white": HairLook("white", root=(168, 165, 162), tip=(206, 204, 202), grey=1.0, sheen=0.30),
}


def hair_material(name: str, look: HairLook) -> bpy.types.Material:
    """A hair *shell*, shaded to read as a mass of fibres.

    The shell is one surface, not a million strands, so the shading has to supply
    what the geometry cannot.  Two things do almost all of the work.

    The first is anisotropy.  Hair's defining optical property is that every fibre
    is a cylinder, so the highlight is a *band* running across the direction of
    growth rather than a spot, and a shell with an isotropic highlight reads as a
    moulded plastic helmet however dark it is.  Blender's Principled BSDF can do
    this directly once the tangent runs along the growth direction, which for a
    scalp is roughly the vertical of the object's own generated coordinates.

    The second is that the silhouette must not be a hard edge.  Real hair thins out
    into individual strands, so a shell that ends in a clean line reads as a helmet
    again.  Fine noise on the alpha eats the edge away where the surface turns from
    the camera, which is where a shell's outline would otherwise be crispest.
    """
    material, graph = new_material(name)
    material.use_backface_culling = False

    coords = graph.add("ShaderNodeTexCoord")
    generated = coords.outputs["Generated"]
    across, deep, along = graph.separate(generated)

    # Root to tip.  A head of hair is darker in its own depths than a diffuse
    # surface would be, and it is that gradient rather than the base colour that
    # says "many fibres deep" instead of "one painted shell".
    strand = graph.ramp(
        along,
        (0.00, srgb(*look.root)[:3]),
        (0.55, srgb(*look.root)[:3]),
        (1.00, srgb(*look.tip)[:3]),
    )
    # Variation between neighbouring locks.  Without it the mass is a single flat
    # value, which no real hair is -- even black hair reads as several.
    locks = graph.noise(generated, scale=90.0, detail=4.0, roughness=0.60, name="locks")
    colour = graph.blend("OVERLAY", 0.28, strand, graph.ramp(locks, (0.3, (0.0,) * 3), (0.7, (1.0,) * 3)))
    if look.grey > 0.0:
        colour = graph.blend("MIX", look.grey * 0.35, colour, (0.62, 0.61, 0.60, 1.0))

    # Fibre relief: fine grooves along the growth direction, which is what breaks
    # the highlight up into strands.  The coordinates are stretched along the growth
    # axis so the noise is drawn out into lines rather than left as blobs.
    fibre = graph.noise(
        graph.combine(across, deep, graph.math("MULTIPLY", 0.05, along)),
        scale=260.0,
        detail=3.0,
        roughness=0.55,
        name="fibre",
    )
    normal = graph.bump(fibre, strength=0.55, distance=0.0007, name="bump_fibre")

    hair = graph.principled("hair")
    graph.feed(hair, "Base Color", colour)
    graph.feed(hair, "Roughness", 0.24 + 0.34 * (1.0 - look.sheen))
    graph.feed(hair, "Anisotropic", 0.85)
    graph.feed(hair, "Anisotropic Rotation", 0.25)
    graph.feed(hair, "IOR", 1.55)
    graph.feed(hair, "Normal", normal)
    # A little transmission: hair is not opaque, and the light that gets through the
    # outer layer is what stops a dark head from going to a silhouette.
    graph.feed(hair, "Subsurface Weight", 0.10 + 0.20 * look.grey)
    graph.feed(hair, "Subsurface Radius", (1.0, 0.70, 0.55))
    graph.feed(hair, "Subsurface Scale", 0.0012)

    # Fray the silhouette.  Real hair thins into separate strands at its outline, so
    # a shell that ends on a clean curve reads as a helmet no matter how it is
    # shaded -- and the outline is exactly where a shell is crispest, because that
    # is where the surface turns away from the camera.  Eating the alpha away with
    # fine noise, only where the surface is near grazing, breaks the line without
    # touching anything the camera sees face on.
    grazing = graph.add("ShaderNodeLayerWeight", "grazing")
    graph.feed(grazing, "Blend", 0.30)
    fray = graph.noise(generated, scale=520.0, detail=2.0, name="fray")
    edge = graph.clamp(
        graph.math("MULTIPLY", 3.0, graph.math("SUBTRACT", grazing.outputs["Facing"], 0.66)),
        0.0,
        1.0,
    )
    graph.feed(
        hair,
        "Alpha",
        graph.math(
            "SUBTRACT", 1.0, graph.math("MULTIPLY", edge, graph.math("SUBTRACT", 1.0, fray))
        ),
    )

    # The tangent is what turns an isotropic highlight into a band across the
    # direction of growth, and growth on a scalp runs radially out from the crown.
    tangent = graph.add("ShaderNodeTangent", "growth", direction_type="RADIAL")
    tangent.axis = "Z"
    graph.feed(hair, "Tangent", tangent.outputs["Tangent"])
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
