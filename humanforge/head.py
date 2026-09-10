"""Head, face and neck construction.

Everything is laid out in a head-local frame so that a head turn or tilt moves
the whole face as one unit: the origin sits on the neck axis at chin height,
+Z runs to the vertex, +Y out through the face and +X to the figure's left.
Dimensions are fractions of the three head measurements (height, breadth,
depth), so they follow the anthropometry instead of being hard-coded.

Every landmark position comes from :data:`FACE_Z`, :data:`FACE_X` and
:data:`FACE_Y` rather than being dialled in where it is used.  That is not
tidiness for its own sake: a face is judged almost entirely on proportion, and
the errors that matter are the ones that put a feature a few millimetres off the
canonical line -- eyes above the half-way point of the head, or a mouth too close
to the nose -- both of which are immediately legible as *wrong* without being
locatable.  Keeping the numbers in one table makes them checkable against a
reference instead of emergent.

The skull and mid-face are a *loft* -- a stack of horizontal sections, the same
construction the trunk uses -- rather than a heap of blended masses for the
maxilla, cheekbones and jaw.  A mass has to cross the skull at a glancing angle
to show at all, and a blend wide enough to melt it in is also wide enough to
raise a rim around it, so a mid-face built that way reads as a muzzle stuck onto
the front of the braincase.  Lofting it makes the surface continuous by
construction and leaves the blended masses for the features that really do stand
proud of the skull: the brow, the nose, the lips and the ears.  The features that
are genuinely concave -- eye apertures, nostrils, the philtrum, the lip seam,
nasolabial folds -- are carved with small blends so they stay crisp.
"""

from __future__ import annotations

import numpy as np

from .sdf import (
    Ellipsoid,
    Field,
    Intersection,
    Loft,
    RoundCone,
    Sphere,
    Vec3,
    rotation,
    v3,
)
from .skeleton import LEFT, RIGHT, Skeleton

# Heights as a fraction of head height, measured up from the chin.  Each is a
# published menton-referenced distance divided by a 232 mm head, so the table can
# be checked against a source rather than argued about: menton to subnasale is
# 72 mm, to the lip line 42 mm, to the pupil 115 mm, to the glabella 130 mm.
FACE_Z = {
    "chin": 0.000,
    "lip_lower": 0.129,
    "gonion": 0.151,
    "lip_line": 0.181,
    "lip_upper": 0.224,
    "subnasale": 0.310,
    "nose_tip": 0.353,
    "condyle": 0.379,
    "cheek": 0.400,
    "zygomatic": 0.431,
    "ear_top": 0.530,
    "eye": 0.495,
    "nasion": 0.526,
    "brow": 0.556,
    "hairline": 0.754,
    "crown": 0.870,
    "vertex": 1.000,
}

# Half widths as a fraction of head breadth.
FACE_X = {
    "skull": 0.500,
    "zygomatic": 0.437,
    "gonion": 0.336,
    "condyle": 0.430,
    "chin": 0.148,
    "alar": 0.117,
    "mouth": 0.166,
    "pupil": 0.202,
    "ear": 0.485,
}

# Depths as a fraction of the occiput-to-nose-tip span (see
# :attr:`humanforge.anatomy.Measures.face_depth`, which is *not* the same as head
# length); y = 0 is the middle of the head, which is roughly the ear canal.
# Each value is a measured sagittal landmark: distance forward of the occiput on
# a male head, divided by the occiput-to-nose-tip span.  Written this way the
# whole profile is checkable against a lateral cephalogram, and the glabella at
# 0.395 is what defines head length (see GLABELLA_SPAN).
FACE_Y = {
    "occiput": -0.500,
    "condyle": -0.140,
    "gonion": -0.125,
    "ear": -0.080,
    "crown": 0.207,
    "zygomatic": 0.339,
    "forehead": 0.339,
    "chin": 0.353,
    "nasion": 0.357,
    "cornea": 0.362,
    "lip": 0.375,
    "brow": 0.397,
    "subnasale": 0.406,
    "nose_tip": 0.498,
}

# Horizontal sections of the head, from the point of the chin up to the brow,
# where the cranial vault takes over: height as a fraction of head height, half
# breadth as a fraction of head breadth, then the front and back of the section
# in face depths.  The half breadths pass through the anthropometric landmarks --
# 0.348 at the gonion, 0.45 at the zygomatic arch -- so the mid-face keeps its
# measured width instead of being whatever a stack of ellipsoids added up to.
#
HEAD_STATIONS = (
    (0.010, 0.040, 0.336, 0.253),
    (0.058, 0.111, 0.350, 0.150),
    (0.100, 0.174, 0.362, 0.060),
    (0.152, 0.348, 0.372, -0.125),
    (0.215, 0.385, 0.382, -0.230),
    (0.270, 0.405, 0.390, -0.300),
    (0.330, 0.425, 0.372, -0.360),
    (0.390, 0.437, 0.352, -0.410),
    (0.440, 0.440, 0.339, -0.450),
    (0.500, 0.450, 0.340, -0.475),
    (0.560, 0.462, 0.360, -0.492),
    (0.620, 0.480, 0.372, -0.497),
)

# The cranial vault, which carries the forehead, the parietals and the occiput as
# one surface.  Its top lands exactly on the vertex, its section at the topmost
# loft station matches that station, and it dies out just below the cheekbones
# rather than bulging out over the jaw.  The front stops short of the glabella,
# which the brow ridge supplies.
VAULT = ((0.0, -0.0625, 0.660), (0.500, 0.4375, 0.340))

# How finely the station table is resampled before it is handed to the loft.  The
# table is anatomical data and is deliberately sparse; the surface needs to be
# smooth, and :class:`~humanforge.sdf.Loft` interpolates its profile linearly, so
# the sampling has to be fine enough that the corners between samples fall below
# the resolution of the mesh -- half a millimetre or so apart.
LOFT_SEGMENTS = 256


class HeadFrame:
    """Maps head-local coordinates, expressed in head fractions, to the world."""

    def __init__(self, skeleton: Skeleton) -> None:
        m = skeleton.measures
        self.origin = skeleton.p("head_origin")
        self.basis = skeleton.frames["head"]
        self.height = m.b("head_height")
        self.width = m.b("head")
        self.depth = m.face_depth

    def point(self, x: float, y: float, z: float) -> Vec3:
        """``x`` in head breadths, ``y`` in head depths, ``z`` in head heights."""
        local = v3(x * self.width, y * self.depth, z * self.height)
        return self.origin + self.basis @ local

    def at(self, x: float, key: str, y_key: str | None = None) -> Vec3:
        """A named height, optionally at a named depth, at breadth ``x``."""
        return self.point(x, FACE_Y[y_key or key], FACE_Z[key])

    def size(self, x: float, y: float, z: float) -> Vec3:
        return v3(x * self.width, y * self.depth, z * self.height)

    def rotated(self, axis: Vec3, angle_deg: float) -> np.ndarray:
        return self.basis @ rotation(axis, angle_deg)

    @property
    def orientation(self) -> np.ndarray:
        return self.basis


def build_head(field: Field, skeleton: Skeleton) -> dict[str, Vec3]:
    """Add the neck and head to ``field``; returns feature landmarks."""
    m = skeleton.measures
    p = m.params
    h = HeadFrame(skeleton)
    soft = 0.35 + 0.65 * p.fat  # fleshiness of the face
    young = 1.0 if p.age in ("child", "teen") else 0.0
    female = 1.0 if p.sex == "female" else (0.5 if p.sex == "neutral" else 0.0)

    _build_neck(field, skeleton, h)
    _build_core(field, h, female, soft)
    _build_jawline(field, h, female, soft, p.age)
    _build_brow(field, h, female)
    _build_nose(field, h, female, young)
    _build_mouth(field, h, female)
    landmarks = _build_eyes(field, skeleton, h, female, young)
    _build_ears(field, h)
    _build_aging(field, h, p.age, p.sag)

    landmarks["head_top"] = h.point(0.0, -0.03, FACE_Z["vertex"])
    landmarks["head_centre"] = h.point(0.0, 0.02, 0.60)
    landmarks["chin"] = h.point(0.0, FACE_Y["chin"], 0.030)
    landmarks["nose_tip"] = h.at(0.0, "nose_tip")
    return landmarks


# ---------------------------------------------------------------------------
# neck


def _build_neck(field: Field, skeleton: Skeleton, h: HeadFrame) -> None:
    m = skeleton.measures
    p = m.params
    neck_r = m.b("neck") * 0.5
    base = skeleton.p("neck_base")
    # The top station sits barely above the chin, not up at the jaw.  A round cone
    # ends in a hemisphere of its own end radius, and the neck's radius is around
    # 55 mm, so a top placed at jaw height puts a ball of that size two thirds of
    # the way up the head.  It is wider there than the mandible is, which swallows
    # the jawline from the inside: the jaw then measures as wide as the neck no
    # matter what the loft says, and no amount of shadow under it reads as bone.
    top = h.point(0.0, -0.02, 0.02)

    field.add(
        RoundCone(base, top, neck_r * 1.18, neck_r * 0.92, section=(1.0, 1.04)),
        blend=0.008 * m.height,
        name="neck",
    )
    # Sternocleidomastoids: the paired straps that define the front of a neck.
    # They run from the sternal notch up to the mastoid process, which is *behind*
    # the ear, not to the jaw -- attaching them at the jaw puts a bulge on the
    # angle of the mandible and makes the jaw measure as wide as the neck.
    notch = skeleton.p("neck_base") + skeleton.frames["head"] @ v3(
        0.0, m.b("neck") * 0.42, 0.0
    )
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            RoundCone(
                h.point(side * 0.290, FACE_Y["ear"] - 0.150, 0.290),
                notch + v3(side * m.b("neck") * 0.22, 0.0, 0.0),
                neck_r * 0.26,
                neck_r * 0.20,
            ),
            blend=neck_r * 0.30,
            name=f"scm_{tag}",
        )
    if p.sex != "female" and p.age != "child":
        field.add(
            Ellipsoid(
                h.point(0.0, 0.290, 0.045) + v3(0.0, 0.0, -m.b("neck") * 0.75),
                v3(neck_r * 0.26, neck_r * 0.22, neck_r * 0.34),
            ),
            blend=neck_r * 0.25,
            name="larynx",
        )


# ---------------------------------------------------------------------------
# skull and mid-face


def _spline(knots: np.ndarray, values: np.ndarray, at: np.ndarray) -> np.ndarray:
    """Cubic Hermite through ``values``, with finite-difference tangents.

    Passes through every knot, so the anatomical table still says exactly what the
    section is at each of its own heights, and is smooth in between, which a
    piecewise-linear resampling is not: resampling a polyline finely just yields
    the same corners.
    """
    tangents = np.gradient(values, knots)
    i = np.clip(np.searchsorted(knots, at) - 1, 0, knots.size - 2)
    span = knots[i + 1] - knots[i]
    t = (at - knots[i]) / span
    t2, t3 = t * t, t * t * t
    return (
        (2.0 * t3 - 3.0 * t2 + 1.0) * values[i]
        + (t3 - 2.0 * t2 + t) * tangents[i] * span
        + (-2.0 * t3 + 3.0 * t2) * values[i + 1]
        + (t3 - t2) * tangents[i + 1] * span
    )


def _build_core(field: Field, h: HeadFrame, female: float, soft: float) -> None:
    """The skull and mid-face, lofted from :data:`HEAD_STATIONS` in one piece.

    Sex and fleshiness act on the section widths rather than on masses added over
    the top, which is how they act on a real head: a female mandible is narrower
    at the angle, and facial fat widens the mid-face, but neither adds a lump.
    Both are ramped in over height rather than switched at a threshold, since a
    step in the width table is a step in the surface.
    """
    hh = h.height
    jaw = 1.0 - 0.060 * female
    cheek = 1.0 + 0.055 * (soft - 0.5)

    rows = np.asarray(HEAD_STATIONS, dtype=np.float64)
    knots = rows[:, 0]
    zs = np.linspace(knots[0], knots[-1], LOFT_SEGMENTS + 1)
    widths, fronts, backs = (_spline(knots, rows[:, c], zs) for c in (1, 2, 3))

    ramp = np.clip((zs - 0.18) / 0.20, 0.0, 1.0)
    widths = widths * (jaw + (cheek - jaw) * ramp * ramp * (3.0 - 2.0 * ramp))

    field.add(
        Loft(
            origin=h.origin,
            rot=h.orientation,
            heights=zs * hh,
            half_width=widths * h.width,
            half_depth=0.5 * (fronts - backs) * h.depth,
            offset=0.5 * (fronts + backs) * h.depth,
        ),
        name="head_core",
    )

    centre, radii = VAULT
    field.add(
        Ellipsoid(
            h.point(*centre),
            h.size(*radii),
            rot=h.orientation,
        ),
        blend=0.014 * hh,
        name="vault",
    )
    # Frontal eminences.  The vault already carries the forehead; all this does is
    # set how upright it is, which is one of the few reliable sex differences in
    # the skull -- a male forehead slopes back from a heavier ridge, a female one
    # rises almost vertically.  It has to stay small: the glabella is the front of
    # the upper face, and a frontal mass big enough to be a forehead in its own
    # right puts the bulge above the brow instead, which is an infant's skull.
    field.add(
        Ellipsoid(
            h.point(0.0, FACE_Y["forehead"] - 0.105 + 0.020 * female, FACE_Z["brow"] + 0.110),
            h.size(0.300, 0.110, 0.100),
            rot=h.rotated(v3(1.0, 0.0, 0.0), 16.0 - 12.0 * female),
        ),
        blend=0.035 * hh,
        name="forehead",
    )


def _build_jawline(
    field: Field, h: HeadFrame, female: float, soft: float, age: str
) -> None:
    """What separates the jaw from the neck, and the chin from the jaw.

    The loft already carries the mandible's width and depth, so nothing needs to
    be added for the bone.  What it cannot do is put an edge on it: a jaw only
    reads as a jaw if there is a shadow under it, and without that the chin runs
    straight into the neck and the whole lower face looks boneless.
    """
    hh = h.height
    square = 1.0 - 0.45 * female

    # Submandibular hollow: the shadow under the jaw, scooped out from below and
    # behind so the mandible's lower border becomes an edge.  Soft faces keep
    # more of it filled in, which is most of what a double chin is.
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.subtract(
            RoundCone(
                h.point(side * 0.060, FACE_Y["chin"] - 0.180, -0.030),
                h.point(side * 0.330, FACE_Y["gonion"] - 0.020, FACE_Z["gonion"] - 0.045),
                0.052 * hh * (1.25 - 0.45 * soft),
                0.060 * hh * (1.25 - 0.45 * soft),
            ),
            blend=0.030 * hh,
            name=f"submandibular_{tag}",
        )
        # The gonial angle itself, squarer on a male: one of the clearest sex
        # cues in a face, and the only place the jaw stands proud of the loft.
        field.add(
            Ellipsoid(
                h.point(
                    side * (FACE_X["gonion"] - 0.082),
                    FACE_Y["gonion"] - 0.020,
                    FACE_Z["gonion"] + 0.010,
                ),
                h.size(0.055 * (0.7 + 0.6 * square), 0.105, 0.070),
                rot=h.orientation,
            ),
            blend=0.038 * hh,
            name=f"gonion_{tag}",
        )

    # Mental protuberance: the chin proper, a small pad on the front of the
    # mandible rather than the whole point of the jaw.
    field.add(
        Ellipsoid(
            h.point(0.0, FACE_Y["chin"] - 0.040, 0.062),
            h.size(FACE_X["chin"] + 0.030 * square, 0.075, 0.062),
            rot=h.orientation,
        ),
        blend=0.024 * hh,
        name="chin",
    )
    # Mental crease, the shadow under the lower lip.
    field.subtract(
        RoundCone(
            h.point(-0.075, FACE_Y["lip"] - 0.012, FACE_Z["lip_lower"] - 0.032),
            h.point(0.075, FACE_Y["lip"] - 0.012, FACE_Z["lip_lower"] - 0.032),
            0.013 * hh,
            0.013 * hh,
        ),
        blend=0.014 * hh,
        name="mental_crease",
    )
    if soft > 0.85 or age == "elder":
        field.add(
            Ellipsoid(
                h.point(0.0, 0.150, -0.035),
                h.size(0.210, 0.180, 0.075 * soft),
                rot=h.orientation,
            ),
            blend=0.050 * hh,
            name="submental_fullness",
        )


def _build_brow(field: Field, h: HeadFrame, female: float) -> None:
    """Supraorbital ridge; its projection is one of the strongest male cues."""
    hh = h.height
    field.add(
        RoundCone(
            h.point(-0.300, FACE_Y["brow"] - 0.031, FACE_Z["brow"] - 0.008),
            h.point(0.300, FACE_Y["brow"] - 0.031, FACE_Z["brow"] - 0.008),
            0.030 * hh,
            0.030 * hh,
        ),
        blend=0.024 * hh,
        name="brow_ridge",
    )
    if female < 0.75:
        field.add(
            RoundCone(
                h.point(-0.190, FACE_Y["brow"] - 0.020, FACE_Z["brow"] - 0.020),
                h.point(0.190, FACE_Y["brow"] - 0.020, FACE_Z["brow"] - 0.020),
                0.024 * hh * (1.0 - female),
                0.024 * hh * (1.0 - female),
            ),
            blend=0.020 * hh,
            name="glabella",
        )


# ---------------------------------------------------------------------------
# features


def _build_nose(field: Field, h: HeadFrame, female: float, young: float) -> None:
    """Bridge, dorsum, tip, columella and wings.

    Every part is placed by pulling its centre back from the landmark by its own
    radius, so the *surface* lands on the measurement.  Centring a mass on the
    landmark instead puts the skin a whole radius in front of it, and on a nose
    that is a centimetre -- half again as much projection as the nose is supposed
    to have, which is most of what makes a procedural nose look like a beak.
    """
    hh = h.height
    width = 1.0 - 0.02 * female - 0.05 * young
    projection = 1.0 - 0.10 * female - 0.12 * young

    tip_radius = 0.048
    root = h.point(0.0, FACE_Y["nasion"] - 0.030, FACE_Z["nasion"])
    # The projection factor scales how far the tip stands out *past the base of
    # the nose*, not its depth from the middle of the head.  Scaling the latter
    # takes the whole 0.41 the face already sits forward of mid head along with
    # it, so a nominal tenth off a female nose removes half of it.
    tip = h.point(
        0.0,
        FACE_Y["subnasale"]
        + (FACE_Y["nose_tip"] - FACE_Y["subnasale"]) * projection
        - tip_radius,
        FACE_Z["nose_tip"],
    )
    bridge = 0.5 * (root + tip)

    field.add(
        RoundCone(root, bridge, 0.026 * hh, 0.024 * hh, section=(0.85 * width, 1.0)),
        blend=0.011 * hh,
        name="nasal_bridge",
    )
    field.add(
        RoundCone(bridge, tip, 0.024 * hh, 0.028 * hh, section=(1.05 * width, 1.0)),
        blend=0.007 * hh,
        name="nasal_dorsum",
    )
    field.add(
        Ellipsoid(tip, h.size(0.046 * width, tip_radius, 0.028), rot=h.orientation),
        blend=0.005 * hh,
        name="nasal_tip",
    )
    # Columella and the septum between the nostrils.
    field.add(
        RoundCone(
            tip,
            h.point(0.0, FACE_Y["subnasale"] - 0.015, FACE_Z["subnasale"] + 0.015),
            0.017 * hh,
            0.015 * hh,
        ),
        blend=0.006 * hh,
        name="columella",
    )
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            Ellipsoid(
                h.point(
                    side * 0.080 * width,
                    FACE_Y["subnasale"] - 0.062,
                    FACE_Z["subnasale"] + 0.010,
                ),
                h.size(0.043 * width, 0.058, 0.024),
                rot=h.orientation,
            ),
            blend=0.007 * hh,
            name=f"ala_{tag}",
        )
        # Nostrils open downwards and slightly back.
        field.subtract(
            Ellipsoid(
                h.point(
                    side * 0.058 * width,
                    FACE_Y["subnasale"] - 0.082,
                    FACE_Z["subnasale"] - 0.002,
                ),
                h.size(0.024, 0.042, 0.026),
                rot=h.rotated(v3(1.0, 0.0, 0.0), -20.0),
            ),
            blend=0.005 * hh,
            name=f"nostril_{tag}",
        )
        # Alar crease, where the wing of the nose meets the cheek.
        field.subtract(
            RoundCone(
                h.point(
                    side * (FACE_X["alar"] + 0.022) * width,
                    FACE_Y["subnasale"] - 0.100,
                    FACE_Z["subnasale"] + 0.052,
                ),
                h.point(
                    side * (FACE_X["alar"] + 0.030) * width,
                    FACE_Y["subnasale"] - 0.120,
                    FACE_Z["subnasale"] + 0.004,
                ),
                0.010 * hh,
                0.012 * hh,
            ),
            blend=0.008 * hh,
            name=f"alar_crease_{tag}",
        )
    # Philtrum: the shallow groove from the nose base down to the upper lip.
    field.subtract(
        RoundCone(
            h.point(0.0, FACE_Y["subnasale"] + 0.010, FACE_Z["subnasale"]),
            h.point(0.0, FACE_Y["lip"] + 0.014, FACE_Z["lip_upper"] + 0.006),
            0.013 * hh,
            0.016 * hh,
        ),
        blend=0.010 * hh,
        name="philtrum",
    )


def _build_mouth(field: Field, h: HeadFrame, female: float) -> None:
    hh = h.height
    fullness = 1.0 + 0.22 * female
    half = FACE_X["mouth"]

    # The upper lip is three lobes, which is what gives a cupid's bow.
    for offset, scale in ((0.0, 0.80), (-0.070, 1.0), (0.070, 1.0)):
        field.add(
            Ellipsoid(
                h.point(offset, FACE_Y["lip"] - 0.010, FACE_Z["lip_upper"]),
                h.size(half * 0.50 * scale, 0.040, 0.020 * fullness * scale),
                rot=h.orientation,
            ),
            blend=0.011 * hh,
            name="upper_lip",
        )
    field.add(
        Ellipsoid(
            h.point(0.0, FACE_Y["lip"], FACE_Z["lip_lower"]),
            h.size(half * 0.90, 0.044, 0.026 * fullness),
            rot=h.orientation,
        ),
        blend=0.012 * hh,
        name="lower_lip",
    )
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            Ellipsoid(
                h.point(side * (half + 0.006), FACE_Y["lip"] - 0.055, FACE_Z["lip_line"]),
                h.size(0.030, 0.045, 0.028),
                rot=h.orientation,
            ),
            blend=0.012 * hh,
            name=f"mouth_corner_{tag}",
        )
    # Lip seam: a slit of nearly constant depth, running from the midline back to
    # each corner.  A single lens shaped cut is thinnest exactly where the mouth is
    # widest, so it stops reading as a seam several millimetres inboard of the
    # corners and the mouth measures short of its breadth.  Two straight slits
    # instead follow the way the lips curve back around the teeth, and hold their
    # depth all the way out to the cheilion.
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.subtract(
            RoundCone(
                h.point(0.0, FACE_Y["lip"] + 0.006, FACE_Z["lip_line"]),
                h.point(
                    side * half * 1.02,
                    FACE_Y["lip"] - 0.048,
                    FACE_Z["lip_line"] + 0.004,
                ),
                0.017 * hh,
                0.013 * hh,
                section=(0.38, 1.0),
            ),
            blend=0.006 * hh,
            name=f"lip_seam_{tag}",
        )


def _build_eyes(
    field: Field, skeleton: Skeleton, h: HeadFrame, female: float, young: float
) -> dict[str, Vec3]:
    """Orbit, lids and the aperture between them.

    The eyeball itself is a separate object (see
    :func:`humanforge.figure._add_eyes`); what is built here is the socket it
    sits in and the lids that close over it.  Because both have to agree on where
    the globe is to within a millimetre, the globe's centre is decided here, from
    the head frame alone, and exported as a landmark for the eyeball to be placed
    on -- deriving it later from the finished face surface makes the aperture
    depend on the very geometry it determines.

    The lids are added as a dome a couple of millimetres larger than the globe
    and then cut open, rather than carved out of the face directly, because a lid
    is a thin flap lying *on* the eye: model it as a hole in the cheek and the
    eye ends up at the bottom of a pit, which is what makes so many procedural
    faces look cadaverous.
    """
    hh = h.height
    landmarks: dict[str, Vec3] = {}
    opening = 1.0 + 0.10 * female + 0.10 * young
    # The eyeball is nearly the same size in everyone: a newborn's is already two
    # thirds of an adult's, which is exactly why children read as big-eyed.
    globe = 0.0122 * (skeleton.measures.height / 1.75) ** 0.25
    if skeleton.measures.params.age == "child":
        globe *= 1.04
    out = h.orientation @ v3(0.0, 1.0, 0.0)

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        jitter = skeleton.asym.factor(f"eye{tag}", side, 0.015)
        cx = side * FACE_X["pupil"] * jitter
        # The corneal apex sits on the canonical face depth, so the centre of
        # the globe is one radius behind it.
        cornea = h.point(cx, FACE_Y["cornea"], FACE_Z["eye"])
        pivot = cornea - out * globe

        # Soft tissue filling the orbit, then the lids as a dome over the globe.
        # Nothing is carved out first: an orbit deep enough to hold the globe and
        # a lid mound to fill it back in only fight each other, and the seam
        # between them is what leaves the eye at the bottom of a pit.  The fill
        # stops behind the globe's equator so that the dome, not the fill, is
        # what the aperture gets cut through; otherwise the rim of the aperture
        # is a centimetre of cheek instead of a two-millimetre lid.
        field.add(
            Ellipsoid(
                h.point(cx, FACE_Y["cornea"] - 0.150, FACE_Z["eye"] + 0.006),
                h.size(0.132, 0.100, 0.080),
                rot=h.orientation,
            ),
            blend=0.012 * hh,
            name=f"orbital_fill_{tag}",
        )
        field.add(
            Sphere(pivot, globe + 0.0024),
            blend=0.006 * hh,
            name=f"lids_{tag}",
        )
        # Palpebral fissure: 28 mm across and 10 mm tall on an adult, with the
        # outer corner a little higher than the inner one.
        #
        # The cut is the lens shaped window *intersected with* a shell around the
        # globe.  Neither half works alone.  A window on its own bores a slot
        # through the orbit; a fixed depth cut cannot open the aperture at all,
        # because the tissue standing in front of the globe is two millimetres
        # thick at the middle of the aperture and over a centimetre at its
        # corners, so any depth that clears the corners has already tunnelled
        # through the middle.  The window's own taper is what keeps the corners
        # from breaking through into the socket behind the globe.
        window = Ellipsoid(
            pivot + out * (globe * 0.45),
            v3(globe * 1.13, globe * 1.65, globe * 0.42 * opening),
            rot=h.rotated(v3(0.0, 1.0, 0.0), -side * 8.0),
        )
        field.subtract(
            Intersection((Sphere(pivot, globe * 2.15), window)),
            blend=0.0012 * hh,
            name=f"fissure_{tag}",
        )
        # Upper lid crease, a few millimetres above the lash line.
        field.subtract(
            RoundCone(
                h.point(cx - 0.090, FACE_Y["cornea"] - 0.010, FACE_Z["eye"] + 0.048),
                h.point(cx + 0.090, FACE_Y["cornea"] - 0.010, FACE_Z["eye"] + 0.052),
                0.007 * hh,
                0.007 * hh,
            ),
            blend=0.007 * hh,
            name=f"lid_crease_{tag}",
        )
        # Both canthi, so the corners of the aperture close into a point instead
        # of ending in a notch.  They sit level with the globe's equator, which
        # is behind the cut, so they cannot creep back over the eye.
        for reach, depth, lift, name in (
            (-0.112, 0.030, -0.012, "canthus_medial"),
            (0.086, 0.052, 0.004, "canthus_lateral"),
        ):
            field.add(
                Ellipsoid(
                    h.point(
                        side * (FACE_X["pupil"] + reach),
                        FACE_Y["cornea"] - depth - globe / h.depth,
                        FACE_Z["eye"] + lift,
                    ),
                    h.size(0.040, 0.048, 0.032),
                    rot=h.orientation,
                ),
                blend=0.010 * hh,
                name=f"{name}_{tag}",
            )

        landmarks[f"eye_{tag}"] = cornea
        landmarks[f"eyeball_{tag}"] = pivot
        landmarks[f"brow_{tag}"] = h.point(cx, FACE_Y["brow"], FACE_Z["brow"])

    landmarks["eye_mid"] = h.at(0.0, "eye", "cornea")
    landmarks["eye_radius"] = np.array([globe, 0.0, 0.0])
    return landmarks


def _build_ears(field: Field, h: HeadFrame) -> None:
    """An ear is a dish standing off the side of the skull, not a plate on it.

    Two things have to be right or it does not read at all.  The height: an ear
    spans the brow to the base of the nose, and placing it high is by far the
    commonest mistake.  And the stand-off: a real ear leaves a 15-20 mm gap
    between the helix and the skull, so building it flush -- which is what happens
    if it is centred on the skull's own surface -- loses the whole feature, since
    everything that makes an ear legible is the shadow behind that gap.
    """
    hh = h.height
    top, bottom = FACE_Z["ear_top"], FACE_Z["subnasale"] - 0.050
    centre_z = 0.5 * (top + bottom)
    half_z = 0.5 * (top - bottom)
    # The skull's own half breadth at ear height, from the loft table.
    skull = float(
        np.interp(centre_z, [row[0] for row in HEAD_STATIONS], [row[1] for row in HEAD_STATIONS])
    )

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        tilt = h.rotated(v3(1.0, 0.0, 0.0), 15.0)
        # Pinna: a flattened dish whose outer edge stands clear of the skull.
        field.add(
            Ellipsoid(
                h.point(side * (skull - 0.010), FACE_Y["ear"] + 0.010, centre_z + 0.005),
                h.size(0.098, 0.105, half_z * 0.78),
                rot=tilt,
            ),
            blend=0.010 * hh,
            name=f"ear_{tag}",
        )
        # Concha and scapha, scooped out of the outer face so the dish is a dish.
        field.subtract(
            Ellipsoid(
                h.point(side * (skull + 0.115), FACE_Y["ear"] + 0.020, centre_z + 0.010),
                h.size(0.105, 0.070, half_z * 0.66),
                rot=tilt,
            ),
            blend=0.006 * hh,
            name=f"concha_{tag}",
        )
        # The gap behind the ear, which is what actually makes it stand out.
        field.subtract(
            Ellipsoid(
                h.point(side * (skull + 0.040), FACE_Y["ear"] - 0.155, centre_z + 0.030),
                h.size(0.075, 0.090, half_z * 0.90),
                rot=tilt,
            ),
            blend=0.008 * hh,
            name=f"ear_gap_{tag}",
        )
        # Helix: the rolled rim around the top and back.
        field.add(
            Ellipsoid(
                h.point(side * (skull + 0.055), FACE_Y["ear"] - 0.045, centre_z + 0.025),
                h.size(0.042, 0.048, half_z * 0.70),
                rot=tilt,
            ),
            blend=0.007 * hh,
            name=f"helix_{tag}",
        )
        field.add(
            Ellipsoid(
                h.point(side * (skull + 0.010), FACE_Y["ear"] + 0.015, bottom + 0.030),
                h.size(0.038, 0.050, 0.030),
                rot=tilt,
            ),
            blend=0.009 * hh,
            name=f"lobe_{tag}",
        )


def _build_aging(field: Field, h: HeadFrame, age: str, sag: float) -> None:
    """Nasolabial folds and eye-corner creases; the strongest age cues."""
    depth = {"child": 0.0, "teen": 0.12, "adult": 0.35, "elder": 1.0}[age]
    depth = min(1.0, depth + 0.35 * sag)
    if depth <= 0.02:
        return
    hh = h.height

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.subtract(
            RoundCone(
                h.point(side * 0.150, FACE_Y["subnasale"] - 0.030, FACE_Z["subnasale"] - 0.010),
                h.point(side * 0.205, FACE_Y["lip"] - 0.075, FACE_Z["lip_lower"] - 0.010),
                0.011 * hh * depth,
                0.015 * hh * depth,
            ),
            blend=0.013 * hh,
            name=f"nasolabial_{tag}",
        )
        if depth > 0.6:
            field.subtract(
                RoundCone(
                    h.point(side * 0.310, FACE_Y["cornea"] - 0.070, FACE_Z["eye"] + 0.040),
                    h.point(side * 0.385, FACE_Y["cornea"] - 0.130, FACE_Z["eye"] - 0.005),
                    0.007 * hh * depth,
                    0.009 * hh * depth,
                ),
                blend=0.010 * hh,
                name=f"crow_foot_{tag}",
            )
            field.subtract(
                RoundCone(
                    h.point(-0.055, FACE_Y["forehead"] - 0.030, FACE_Z["brow"] + 0.085),
                    h.point(0.055, FACE_Y["forehead"] - 0.030, FACE_Z["brow"] + 0.085),
                    0.006 * hh * depth,
                    0.006 * hh * depth,
                ),
                blend=0.012 * hh,
                name="forehead_line",
            )
