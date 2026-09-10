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

Masses (cranium, cheekbones, jaw, nose, lips) are added with wide blends so they
melt into one another; the features that are genuinely concave -- eye apertures,
nostrils, the philtrum, the lip seam, nasolabial folds -- are carved with small
ones so they stay crisp.
"""

from __future__ import annotations

import numpy as np

from .sdf import (
    Ellipsoid,
    Field,
    Intersection,
    RoundCone,
    Sphere,
    Vec3,
    rotation,
    v3,
)
from .skeleton import LEFT, RIGHT, Skeleton

# Heights as a fraction of head height, measured up from the chin.  These are the
# classical canon, which population averages sit within a few millimetres of.
FACE_Z = {
    "chin": 0.000,
    "lip_lower": 0.123,
    "lip_line": 0.156,
    "lip_upper": 0.186,
    "gonion": 0.152,
    "subnasale": 0.260,
    "nose_tip": 0.278,
    "condyle": 0.335,
    "cheek": 0.375,
    "zygomatic": 0.430,
    "eye": 0.495,
    "nasion": 0.520,
    "brow": 0.556,
    "hairline": 0.715,
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
FACE_Y = {
    "occiput": -0.500,
    "gonion": -0.095,
    "condyle": -0.110,
    "forehead": 0.360,
    "nasion": 0.335,
    "cornea": 0.360,
    "brow": 0.395,
    "zygomatic": 0.300,
    "subnasale": 0.395,
    "nose_tip": 0.500,
    "lip": 0.415,
    "chin": 0.385,
    "ear": -0.070,
}


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
    _build_skull(field, h, female, young)
    _build_midface(field, h, female, soft)
    _build_jaw(field, h, female, soft, p.age)
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
    top = h.point(0.0, -0.02, 0.12)

    field.add(
        RoundCone(base, top, neck_r * 1.18, neck_r * 0.92, section=(1.0, 1.04)),
        blend=0.008 * m.height,
        name="neck",
    )
    # Sternocleidomastoids: the paired straps that define the front of a neck.
    notch = skeleton.p("neck_base") + skeleton.frames["head"] @ v3(
        0.0, m.b("neck") * 0.42, 0.0
    )
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            RoundCone(
                h.point(side * 0.400, -0.090, 0.150),
                notch + v3(side * m.b("neck") * 0.22, 0.0, 0.0),
                neck_r * 0.30,
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
# skull


def _build_skull(field: Field, h: HeadFrame, female: float, young: float) -> None:
    """The braincase: a rounded box, not a ball.

    A braincase reads as a balloon when it is too round, and the fix is not a
    bigger blend but a narrower occiput and a flattened temple: a real skull is
    widest well behind the eyes and above the ears, and almost flat down the
    sides between them.
    """
    hh = h.height
    field.add(
        Ellipsoid(
            h.point(0.0, -0.055, 0.645),
            h.size(FACE_X["skull"], 0.415, 0.360),
            rot=h.orientation,
        ),
        blend=0.030 * hh,
        name="cranium",
    )
    # Occipital bun and the base of the skull behind the ears.
    field.add(
        Ellipsoid(
            h.point(0.0, -0.205, FACE_Z["zygomatic"] + 0.130),
            h.size(0.400, 0.300, 0.245),
            rot=h.orientation,
        ),
        blend=0.035 * hh,
        name="occiput",
    )
    # Parietal fullness above and behind the ears, wider than the temples.
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            Ellipsoid(
                h.point(side * 0.290, -0.090, FACE_Z["crown"] - 0.130),
                h.size(0.230, 0.310, 0.185),
                rot=h.orientation,
            ),
            blend=0.045 * hh,
            name=f"parietal_{tag}",
        )
        # The temple is a shallow hollow, not a facet.  It has to be bounded in
        # height as well as depth: a sphere wide enough to flatten the side of
        # the skull is also tall enough to plane it from the cheekbone to the
        # crown, and the width it shaves off the parietal region is width the
        # head is measured on.
        field.subtract(
            Ellipsoid(
                h.point(side * 0.855, 0.130, FACE_Z["zygomatic"] + 0.115),
                h.size(0.400, 0.550, 0.095),
                rot=h.orientation,
            ),
            blend=0.028 * hh,
            name=f"temple_{tag}",
        )
    # Forehead: slightly sloped on a male, more upright on a female.
    field.add(
        Ellipsoid(
            h.point(0.0, 0.205 + 0.030 * female, FACE_Z["brow"] + 0.115),
            h.size(0.395, 0.190, 0.115 + 0.020 * young),
            rot=h.rotated(v3(1.0, 0.0, 0.0), 16.0 - 10.0 * female),
        ),
        blend=0.055 * hh,
        name="forehead",
    )


def _build_midface(field: Field, h: HeadFrame, female: float, soft: float) -> None:
    """Maxilla, cheekbones and cheeks.

    The bizygomatic breadth is nearly seven eighths of the head's, so a mid-face
    built any narrower leaves the skull looking inflated above a pinched little
    face -- which is the other half of the doll problem.
    """
    hh = h.height
    field.add(
        Ellipsoid(
            h.point(0.0, 0.175, FACE_Z["cheek"]),
            h.size(0.400, 0.260, 0.185),
            rot=h.orientation,
        ),
        blend=0.050 * hh,
        name="maxilla",
    )
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        # Zygomatic arch: a bar from the cheekbone back to the ear.  It is what
        # gives the face its width at eye level and a temple hollow above.
        field.add(
            RoundCone(
                h.at(side * (FACE_X["zygomatic"] - 0.055), "zygomatic"),
                h.at(side * FACE_X["condyle"], "condyle"),
                0.040 * hh,
                0.032 * hh,
            ),
            blend=0.028 * hh,
            name=f"zygomatic_arch_{tag}",
        )
        field.add(
            Ellipsoid(
                h.point(side * 0.315, 0.235, FACE_Z["zygomatic"] - 0.020),
                h.size(0.140, 0.115, 0.062),
                rot=h.orientation,
            ),
            blend=0.034 * hh,
            name=f"malar_{tag}",
        )
        # Cheek soft tissue, which is where facial fat actually shows.
        field.add(
            Ellipsoid(
                h.point(side * 0.275, 0.205, FACE_Z["cheek"] - 0.080),
                h.size(0.145, 0.110, 0.085 * (0.7 + 0.6 * soft)),
                rot=h.orientation,
            ),
            blend=0.050 * hh,
            name=f"cheek_{tag}",
        )


def _build_jaw(
    field: Field, h: HeadFrame, female: float, soft: float, age: str
) -> None:
    hh = h.height
    square = 1.0 - 0.45 * female  # a broader gonial angle reads as male

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        # Ramus: condyle down to the angle of the jaw.
        field.add(
            RoundCone(
                h.at(side * (FACE_X["condyle"] - 0.045), "condyle"),
                h.at(side * FACE_X["gonion"], "gonion"),
                0.050 * hh,
                0.044 * hh,
            ),
            blend=0.030 * hh,
            name=f"ramus_{tag}",
        )
        # Body of the mandible, angle forward to the chin.
        field.add(
            RoundCone(
                h.at(side * FACE_X["gonion"], "gonion"),
                h.point(side * FACE_X["chin"] * 0.75, FACE_Y["chin"], 0.055),
                0.046 * hh * (0.9 + 0.2 * square),
                0.040 * hh,
            ),
            blend=0.032 * hh,
            name=f"mandible_{tag}",
        )
        # The angle itself: squarer on a male, and one of the clearest sex cues.
        field.add(
            Ellipsoid(
                h.point(side * (FACE_X["gonion"] + 0.020), FACE_Y["gonion"], FACE_Z["gonion"]),
                h.size(0.070 * square, 0.095, 0.075),
                rot=h.orientation,
            ),
            blend=0.045 * hh,
            name=f"gonion_{tag}",
        )

    field.add(
        Ellipsoid(
            h.point(0.0, FACE_Y["chin"] - 0.045, 0.075),
            h.size(FACE_X["chin"] + 0.045 * square, 0.115, 0.090),
            rot=h.orientation,
        ),
        blend=0.032 * hh,
        name="chin",
    )
    # Mental crease, the shadow under the lower lip.
    field.subtract(
        RoundCone(
            h.point(-0.085, FACE_Y["lip"] - 0.005, FACE_Z["lip_lower"] - 0.030),
            h.point(0.085, FACE_Y["lip"] - 0.005, FACE_Z["lip_lower"] - 0.030),
            0.014 * hh,
            0.014 * hh,
        ),
        blend=0.013 * hh,
        name="mental_crease",
    )
    if soft > 0.85 or age == "elder":
        field.add(
            Ellipsoid(
                h.point(0.0, 0.170, -0.010),
                h.size(0.230, 0.165, 0.070 * soft),
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
            h.point(-0.300, FACE_Y["brow"] - 0.070, FACE_Z["brow"] - 0.008),
            h.point(0.300, FACE_Y["brow"] - 0.070, FACE_Z["brow"] - 0.008),
            0.030 * hh,
            0.030 * hh,
        ),
        blend=0.024 * hh,
        name="brow_ridge",
    )
    if female < 0.75:
        field.add(
            RoundCone(
                h.point(-0.190, FACE_Y["brow"] - 0.048, FACE_Z["brow"] - 0.020),
                h.point(0.190, FACE_Y["brow"] - 0.048, FACE_Z["brow"] - 0.020),
                0.024 * hh * (1.0 - female),
                0.024 * hh * (1.0 - female),
            ),
            blend=0.020 * hh,
            name="glabella",
        )


# ---------------------------------------------------------------------------
# features


def _build_nose(field: Field, h: HeadFrame, female: float, young: float) -> None:
    hh = h.height
    width = 1.0 - 0.10 * female - 0.05 * young
    projection = 1.0 - 0.10 * female - 0.12 * young

    root = h.at(0.0, "nasion")
    tip = h.point(0.0, FACE_Y["nose_tip"] * projection, FACE_Z["nose_tip"])
    bridge = 0.5 * (root + tip) + h.point(0.0, -0.030, 0.0) - h.point(0.0, 0.0, 0.0)

    field.add(
        RoundCone(root, bridge, 0.034 * hh, 0.029 * hh, section=(0.85 * width, 1.0)),
        blend=0.020 * hh,
        name="nasal_bridge",
    )
    field.add(
        RoundCone(bridge, tip, 0.029 * hh, 0.036 * hh, section=(1.05 * width, 1.0)),
        blend=0.017 * hh,
        name="nasal_dorsum",
    )
    field.add(
        Ellipsoid(tip, h.size(0.058 * width, 0.055, 0.042), rot=h.orientation),
        blend=0.013 * hh,
        name="nasal_tip",
    )
    # Columella and the septum between the nostrils.
    field.add(
        RoundCone(
            tip,
            h.point(0.0, FACE_Y["subnasale"], FACE_Z["subnasale"] - 0.012),
            0.020 * hh,
            0.017 * hh,
        ),
        blend=0.012 * hh,
        name="columella",
    )
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            Ellipsoid(
                h.point(side * FACE_X["alar"] * width, FACE_Y["subnasale"] - 0.035, FACE_Z["subnasale"] + 0.006),
                h.size(0.050 * width, 0.062, 0.038),
                rot=h.orientation,
            ),
            blend=0.014 * hh,
            name=f"ala_{tag}",
        )
        # Nostrils open downwards and slightly back.
        field.subtract(
            Ellipsoid(
                h.point(side * 0.068 * width, FACE_Y["subnasale"] + 0.005, FACE_Z["subnasale"] - 0.018),
                h.size(0.028, 0.052, 0.028),
                rot=h.rotated(v3(1.0, 0.0, 0.0), -20.0),
            ),
            blend=0.006 * hh,
            name=f"nostril_{tag}",
        )
        # Alar crease, where the wing of the nose meets the cheek.
        field.subtract(
            RoundCone(
                h.point(side * (FACE_X["alar"] + 0.030) * width, FACE_Y["subnasale"] - 0.040, FACE_Z["subnasale"] + 0.020),
                h.point(side * (FACE_X["alar"] + 0.038) * width, FACE_Y["subnasale"] - 0.060, FACE_Z["subnasale"] - 0.026),
                0.011 * hh,
                0.013 * hh,
            ),
            blend=0.009 * hh,
            name=f"alar_crease_{tag}",
        )
    # Philtrum: the shallow groove from the nose base down to the upper lip.
    field.subtract(
        RoundCone(
            h.point(0.0, FACE_Y["subnasale"] + 0.005, FACE_Z["subnasale"] - 0.020),
            h.point(0.0, FACE_Y["lip"] + 0.010, FACE_Z["lip_upper"] + 0.008),
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
                h.point(side * half, FACE_Y["lip"] - 0.055, FACE_Z["lip_line"]),
                h.size(0.048, 0.045, 0.028),
                rot=h.orientation,
            ),
            blend=0.018 * hh,
            name=f"mouth_corner_{tag}",
        )
    # Lip seam: a thin lens carved between the lips.
    field.subtract(
        Ellipsoid(
            h.point(0.0, FACE_Y["lip"] + 0.022, FACE_Z["lip_line"]),
            h.size(half * 1.13, 0.058, 0.007),
            rot=h.rotated(v3(1.0, 0.0, 0.0), -6.0),
        ),
        blend=0.007 * hh,
        name="lip_seam",
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
    hh = h.height
    # The ear spans brow to nose base, which is the check that catches an ear
    # placed too high -- by far the commonest mistake.
    top, bottom = FACE_Z["brow"], FACE_Z["subnasale"]
    centre_z = 0.5 * (top + bottom)
    half_z = 0.5 * (top - bottom)

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        tilt = h.rotated(v3(1.0, 0.0, 0.0), 14.0)
        centre = h.point(side * (FACE_X["ear"] - 0.030), FACE_Y["ear"], centre_z)
        field.add(
            Ellipsoid(centre, h.size(0.042, 0.098, half_z * 1.02), rot=tilt),
            blend=0.012 * hh,
            name=f"ear_{tag}",
        )
        # Concha, scooped out of the outer face of the ear.
        field.subtract(
            Ellipsoid(
                h.point(side * (FACE_X["ear"] + 0.045), FACE_Y["ear"] + 0.010, centre_z + 0.020),
                h.size(0.048, 0.062, half_z * 0.62),
                rot=tilt,
            ),
            blend=0.007 * hh,
            name=f"concha_{tag}",
        )
        # Helix: the rolled rim around the back and top.
        field.add(
            Ellipsoid(
                h.point(side * (FACE_X["ear"] + 0.012), FACE_Y["ear"] - 0.075, centre_z + 0.028),
                h.size(0.028, 0.034, half_z * 0.74),
                rot=tilt,
            ),
            blend=0.009 * hh,
            name=f"helix_{tag}",
        )
        field.add(
            Ellipsoid(
                h.point(side * (FACE_X["ear"] - 0.018), FACE_Y["ear"] + 0.010, bottom + 0.018),
                h.size(0.030, 0.042, 0.038),
                rot=tilt,
            ),
            blend=0.010 * hh,
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
