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
    "alar": 0.130,
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

# Horizontal sections of the whole head, from under the chin to the vertex:
# height as a fraction of head height, half breadth as a fraction of head
# breadth, the front and back of the section in face depths, and the section's
# superellipse power (see :class:`~humanforge.sdf.Loft`).  The half breadths pass
# through the anthropometric landmarks -- 0.348 at the gonion, 0.44 at the
# zygomatic arch -- so the mid-face keeps its measured width instead of being
# whatever a stack of ellipsoids added up to.
#
# Two things about this table are easy to get wrong and ruin the head.
#
# The widest section is at 0.62, a little above the ear and well below the crown.
# Put it higher -- which is what happens if the vault is treated as the top of an
# egg -- and the head is at its broadest near the top: the cranium then reads as a
# balloon with a small face hung under it, and no amount of work on the features
# fixes it, because the fault is that the face is too narrow *relative to* the
# vault rather than too small.
#
# And the front column carries no brow ridge.  A step in it applies across the
# whole section, so a ridge put here comes with a ledge running round to the
# temples -- the same visor the ridge was moved into the loft to avoid.  The
# glabella's projection is a mass; see :func:`_build_brow`.
HEAD_STATIONS = (
    (0.010, 0.040, 0.336, 0.253, 2.0),
    (0.058, 0.111, 0.350, 0.150, 2.0),
    (0.100, 0.174, 0.362, 0.060, 2.0),
    (0.152, 0.348, 0.372, -0.125, 2.2),
    (0.215, 0.385, 0.382, -0.230, 2.3),
    (0.270, 0.405, 0.390, -0.300, 2.4),
    (0.330, 0.425, 0.372, -0.360, 2.5),
    (0.390, 0.437, 0.352, -0.410, 2.5),
    (0.440, 0.442, 0.339, -0.450, 2.5),
    (0.495, 0.460, 0.338, -0.474, 2.5),
    (0.526, 0.468, 0.346, -0.482, 2.5),
    (0.556, 0.476, 0.360, -0.492, 2.5),
    (0.590, 0.486, 0.370, -0.496, 2.4),
    (0.620, 0.492, 0.366, -0.498, 2.3),  # euryon: the widest section of the head
    (0.680, 0.488, 0.356, -0.497, 2.2),
    (0.740, 0.466, 0.336, -0.487, 2.1),
    (0.800, 0.428, 0.306, -0.462, 2.0),
    (0.860, 0.375, 0.266, -0.415, 2.0),
    (0.920, 0.300, 0.212, -0.338, 2.0),
    (0.960, 0.228, 0.158, -0.258, 2.0),
    (0.985, 0.140, 0.082, -0.155, 2.0),
    (1.000, 0.010, -0.010, -0.030, 2.0),
)

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
    # A round cone ends in a hemisphere of its own end radius, and a neck's radius
    # is around 55 mm, so a top station placed up at the jaw puts a ball that size
    # two thirds of the way up the head.  It is wider there than the mandible is,
    # so it swallows the jawline from the inside: the jaw then measures as wide as
    # the neck whatever the skull loft says, and no amount of shadow under it reads
    # as bone.  The top therefore sits low and narrow, and the throat under the jaw
    # is filled by its own mass, which can be flat enough not to reach the jaw's
    # width.
    top = h.point(0.0, -0.02, 0.060)

    field.add(
        RoundCone(base, top, neck_r * 1.18, neck_r * 0.78, section=(1.0, 1.04)),
        blend=0.008 * m.height,
        name="neck",
    )
    # Throat: the soft tissue between the jaw and the neck proper.  Without it the
    # submandibular hollow has nothing left to cut into and opens a gap straight
    # through under the chin.  It has to stay well behind the chin's own front,
    # though: reaching past it, the mass hangs under and in front of the jaw and the
    # figure gets a double chin it was not asked for.
    field.add(
        Ellipsoid(
            h.point(0.0, 0.055, 0.020),
            h.size(0.215, 0.185, 0.062),
            rot=h.orientation,
        ),
        blend=0.030 * h.height,
        name="throat",
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


def spline(knots: np.ndarray, values: np.ndarray, at: np.ndarray) -> np.ndarray:
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


def relax(values: np.ndarray, window: int = 5, passes: int = 2) -> np.ndarray:
    """Smooth a resampled profile so its curvature is continuous.

    A cubic Hermite through the station table is only C1: its curvature jumps at
    every knot.  That is invisible in the silhouette and glaringly visible under
    smooth shading, as broad horizontal bands across the skull wherever the table's
    stations are far apart.  A couple of box passes over a few millimetres removes
    the jumps and moves the surface itself by almost nothing.
    """
    kernel = np.ones(window) / window
    out = values
    for _ in range(passes):
        padded = np.pad(out, window // 2, mode="edge")
        out = np.convolve(padded, kernel, mode="valid")
    return out


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
    widths, fronts, backs, powers = (
        spline(knots, rows[:, c], zs) for c in (1, 2, 3, 4)
    )

    ramp = np.clip((zs - 0.18) / 0.20, 0.0, 1.0)
    widths = widths * (jaw + (cheek - jaw) * ramp * ramp * (3.0 - 2.0 * ramp))
    # How upright the forehead is, which is one of the few reliable sex differences
    # in the skull: a male one slopes back from a heavier ridge, a female one rises
    # almost vertically.  This is a whole-section change over 60 mm of height rather
    # than a step, so unlike a brow ridge it belongs in the front profile: it moves
    # the temples with the forehead, which is what a rounder skull does.
    fronts = fronts + 0.024 * female * np.exp(-(((zs - 0.760) / 0.150) ** 2))
    # The vertex station is nearly a point, and a cubic through it can undershoot
    # into negative widths just below the crown, which turns the top of the head
    # inside out.
    widths = np.maximum(relax(widths), 0.004)
    fronts = np.maximum(relax(fronts), backs + 0.010)
    backs = relax(backs)

    field.add(
        Loft(
            origin=h.origin,
            rot=h.orientation,
            heights=zs * hh,
            half_width=widths * h.width,
            half_depth=0.5 * (fronts - backs) * h.depth,
            offset=0.5 * (fronts + backs) * h.depth,
            exponent=np.maximum(relax(powers), 2.0),
        ),
        name="head_core",
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
        # The hollow starts well off the midline.  Started near it, the left and
        # right cuts overlap under the chin and trench straight through the throat.
        field.subtract(
            RoundCone(
                h.point(side * 0.135, FACE_Y["chin"] - 0.150, -0.020),
                h.point(side * 0.330, FACE_Y["gonion"] - 0.020, FACE_Z["gonion"] - 0.045),
                0.052 * hh * (1.25 - 0.45 * soft),
                0.060 * hh * (1.25 - 0.45 * soft),
            ),
            blend=0.030 * hh,
            name=f"submandibular_{tag}",
        )

    # Nothing is added at the gonial angle.  A mass there is the wrong tool twice
    # over: the loft already carries the mandible's width, so it adds nothing
    # laterally, and it is *deeper* than the section it sits on, so all it does is
    # bulge 25 mm out behind the jaw -- which in profile is a lump on the neck.  How
    # square the angle is comes from the width table's own jaw factor instead.

    # Mental protuberance: the chin proper.  The loft already carries how far the
    # chin projects, so this only adds the swell of the boss itself -- wide and
    # shallow, with a blend well under its own relief, or it becomes a pad stuck on
    # below the lip.
    field.add(
        Ellipsoid(
            h.point(0.0, FACE_Y["chin"] - 0.090, 0.072),
            h.size(FACE_X["chin"] + 0.048 * square, 0.105, 0.078),
            rot=h.orientation,
        ),
        blend=0.005 * hh,
        name="chin",
    )
    # Mental crease, the shadow under the lower lip.  Its axis sits in front of the
    # skin, not behind it: a cut whose centre is a couple of millimetres under the
    # surface breaks through only in patches and leaves a ragged line.
    field.subtract(
        RoundCone(
            h.point(-0.070, FACE_Y["lip"] + 0.004, FACE_Z["lip_lower"] - 0.032),
            h.point(0.070, FACE_Y["lip"] + 0.004, FACE_Z["lip_lower"] - 0.032),
            0.011 * hh,
            0.011 * hh,
        ),
        blend=0.007 * hh,
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
    """What the station table cannot carry of the supraorbital ridge.

    The ridge is a pair of wide, shallow masses over the orbits.  Neither of the two
    obvious alternatives works.  A cylinder laid across the face at constant depth
    is a visor: what makes a ridge read as bone is that it turns back almost ninety
    degrees by the time it reaches the outer corner of the eye.  And a step in the
    loft's front profile applies to the whole section, so it comes with a ledge
    running round to the temples -- the same visor from the other side.

    An ellipsoid does turn back, because it is set into the face and only its front
    emerges; the shape of the patch that emerges is the intersection of two curved
    surfaces, which sweeps back and dies out at the temple on its own.  What that
    demands is a blend well under the projection: a mass standing as far proud as
    its blend radius is wide raises a ring around its rim, and on a brow that ring
    reads as a bead sitting above the eye.
    """
    hh = h.height
    heavy = 1.0 - 0.55 * female

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            Ellipsoid(
                h.point(
                    side * 0.150,
                    FACE_Y["brow"] - 0.115,
                    FACE_Z["brow"] - 0.014,
                ),
                h.size(0.175, 0.115, 0.042),
                rot=h.rotated(v3(1.0, 0.0, 0.0), 8.0),
            ),
            blend=0.006 * hh,
            name=f"brow_ridge_{tag}",
        )
    if heavy > 0.4:
        field.add(
            Ellipsoid(
                h.point(0.0, FACE_Y["brow"] - 0.125, FACE_Z["brow"] - 0.026),
                h.size(0.095, 0.128, 0.050),
                rot=h.orientation,
            ),
            blend=0.006 * hh,
            name="glabella",
        )


# ---------------------------------------------------------------------------
# features


def _build_nose(field: Field, h: HeadFrame, female: float, young: float) -> None:
    """The nose, as its own loft: root, bridge, dorsum, tip and wings in one piece.

    Assembled from separate masses -- a cone for the bridge, another for the dorsum,
    a ball for the tip, one for each wing -- a nose comes out as a row of beads with
    a bulb on the end.  Each mass has to be blended into its neighbours, each blend
    raises a rim where the two surfaces cross, and the rims are at exactly the scale
    the eye reads as anatomy, so they look like structure that is not there.

    Lofting it fixes the whole class of problem at once, and the table below is
    directly checkable: the front column is the midline profile of a nose, so it
    peaks at the pronasale and dips at the nasion, and the width column is its
    breadth, so it reaches the measured alar width at the base.

    The back column is set well behind the face, not just behind the nose.  It puts
    the widest part of each section *inside* the cheek, which is what keeps the
    sidewalls from standing out as a pair of ridges: the nasofacial groove should be
    where the nose leaves the face, and if the section's widest point is in front of
    the cheek then the groove ends up on the nose itself.

    The last column is the sections' superellipse power (see
    :class:`~humanforge.sdf.Loft`).  It has to rise towards the base, because an
    elliptical section three quarters of the way out to the alar margin has already
    given up two thirds of its depth and so lies *behind* the cheek: the wings
    disappear into the face and the nose measures 27 mm across however wide the
    width column is made.  Squaring the lower sections off carries their depth out
    to the alar crease and lets the wing stand where the crease can cut around it.
    """
    hh = h.height
    width = 1.0 - 0.02 * female - 0.02 * young
    # How far the tip stands out past the *base* of the nose.  Scaling its depth
    # from mid head instead drags the 0.41 the whole face already sits forward
    # along with it, so a nominal tenth off a female nose removes half of it.
    reach = 1.0 - 0.07 * female - 0.08 * young
    base = FACE_Y["subnasale"]

    stations = (
        # z,     half width, front,  back,  power
        (0.585, 0.040, 0.372, 0.200, 2.0),  # root, running up into the glabella
        (0.556, 0.041, 0.362, 0.200, 2.0),
        (0.526, 0.043, 0.357, 0.200, 2.0),  # nasion, the dip of the bridge
        (0.480, 0.048, 0.381, 0.200, 2.1),
        (0.430, 0.055, 0.412, 0.200, 2.3),  # dorsum
        (0.390, 0.064, 0.450, 0.200, 2.7),
        (0.362, 0.076, 0.494, 0.200, 3.0),  # supratip
        (0.353, 0.080, 0.498, 0.200, 3.1),  # pronasale
        (0.336, 0.105, 0.464, 0.200, 3.4),  # lobule spreading into the wings
        (0.318, 0.126, 0.412, 0.200, 3.6),
        (0.304, 0.130, 0.382, 0.200, 3.6),  # alar base
        (0.292, 0.122, 0.350, 0.200, 3.4),
    )
    rows = np.asarray(stations[::-1], dtype=np.float64)
    knots = rows[:, 0]
    zs = np.linspace(knots[0], knots[-1], 128)
    widths, fronts, backs, powers = (
        relax(spline(knots, rows[:, c], zs)) for c in (1, 2, 3, 4)
    )
    fronts = base + (fronts - base) * reach

    field.add(
        Loft(
            origin=h.origin,
            rot=h.orientation,
            heights=zs * hh,
            half_width=widths * width * h.width,
            half_depth=0.5 * (fronts - backs) * h.depth,
            offset=0.5 * (fronts + backs) * h.depth,
            exponent=np.maximum(powers, 2.0),
        ),
        blend=0.006 * hh,
        name="nose",
    )
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
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
            blend=0.0045 * hh,
            name=f"nostril_{tag}",
        )
        # Alar crease, where the wing of the nose meets the cheek.
        field.subtract(
            RoundCone(
                h.point(
                    side * (FACE_X["alar"] + 0.030) * width,
                    FACE_Y["subnasale"] - 0.100,
                    FACE_Z["subnasale"] + 0.052,
                ),
                h.point(
                    side * (FACE_X["alar"] + 0.038) * width,
                    FACE_Y["subnasale"] - 0.120,
                    FACE_Z["subnasale"] + 0.004,
                ),
                0.010 * hh,
                0.012 * hh,
            ),
            blend=0.008 * hh,
            name=f"alar_crease_{tag}",
        )
    # Philtrum: the shallow groove from the nose base down towards the upper lip.
    # It stops short of the lip, because a cut that reaches the vermilion crosses the
    # lip's own rim at a glancing angle and the two together leave a ragged notch.
    field.subtract(
        RoundCone(
            h.point(0.0, FACE_Y["subnasale"] + 0.014, FACE_Z["subnasale"] - 0.004),
            h.point(0.0, FACE_Y["lip"] + 0.030, FACE_Z["lip_upper"] + 0.026),
            0.014 * hh,
            0.016 * hh,
        ),
        blend=0.010 * hh,
        name="philtrum",
    )


def _build_mouth(field: Field, h: HeadFrame, female: float) -> None:
    """The lips: shallow swells and a seam, not a stack of balls.

    The skull loft already carries how far the mouth projects -- at lip height the
    front of the loft *is* the lips -- so nothing here needs to add that, and adding
    it anyway is what turned the mouth into three balls for the upper lip and one
    for the lower.  What is missing is only the vermilion: a millimetre or two of
    relief with a definite border.

    That sets the blends.  A mass standing as far proud as its blend radius is wide
    raises a ring around its rim, so a two millimetre swell needs a blend well under
    two millimetres -- which is also what leaves the vermilion border crisp, the way
    it is on a face.
    """
    hh = h.height
    fullness = 1.0 + 0.30 * female
    half = FACE_X["mouth"]
    seam = 0.0055 * hh

    # Each lip is one form, standing decisively proud rather than grazing the face.
    # A mass that only just breaks the surface crosses it at a glancing angle over a
    # wide, thin sliver, and the mesher renders that sliver as a broken line -- which
    # on a mouth looks like a scar above the lip, not like a vermilion border.
    # Each lip runs wider than the mouth is measured, because an ellipsoid's relief
    # fades to nothing at its ends: a lip only as wide as the cheilion has under a
    # millimetre of vermilion for the last third of its span, which is not enough
    # for the seam to have two lips to sit between.  Where the mouth *ends* is set
    # by how far the seam is cut, not by where the swells run out.
    field.add(
        Ellipsoid(
            h.point(0.0, FACE_Y["lip"] - 0.038, FACE_Z["lip_upper"] - 0.004),
            h.size(half * 1.15, 0.058, 0.030 * fullness),
            rot=h.rotated(v3(1.0, 0.0, 0.0), -10.0),
        ),
        blend=seam,
        name="upper_lip",
    )
    field.add(
        Ellipsoid(
            h.point(0.0, FACE_Y["lip"] - 0.034, FACE_Z["lip_lower"] + 0.004),
            h.size(half * 1.08, 0.058, 0.036 * fullness),
            rot=h.rotated(v3(1.0, 0.0, 0.0), 12.0),
        ),
        blend=seam,
        name="lower_lip",
    )
    # Lip seam: a slit running from the midline out to each corner.  Two straight
    # slits rather than one lens shaped cut, because a lens is thinnest exactly
    # where the mouth is widest and so stops reading several millimetres inboard of
    # the cheilion.
    #
    # The axis sits a couple of millimetres *in front of* the lips all the way
    # along, and the slit's depth is what is left of the radius once that clearance
    # is taken off.  Sunk into the flesh instead -- which is what a straight line
    # between two anatomical points does, since the lips bulge 7 mm forward of the
    # lip plane at the midline and only 3 mm at the corner -- the cut stays entirely
    # inside the head over the outer half of the mouth and the seam simply stops.
    #
    # Which is also why the cutter is flattened rather than round.  A round cutter
    # standing 2 mm clear of the surface has to be 7 mm across to reach 5 mm into
    # it, and a 7 mm ball opens a 13 mm gash: the mouth ends up as a hole between
    # the lips rather than a line.  Squashing the section vertically keeps the depth
    # and gives back the thinness.
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.subtract(
            RoundCone(
                h.point(0.0, FACE_Y["lip"] + 0.043, FACE_Z["lip_line"]),
                h.point(
                    side * half * 0.75,
                    FACE_Y["lip"] + 0.012,
                    FACE_Z["lip_line"] + 0.004,
                ),
                0.034 * hh,
                0.034 * hh,
                section=(0.38, 1.0),
            ),
            blend=0.0035 * hh,
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
        # The fill has to come almost as far forward as the lid dome does.  Set
        # back from it -- which is where an orbit *bone* is -- the dome stands 12 mm
        # proud of everything round it, and cutting the aperture into a ball that
        # proud leaves a hard lens shaped rim standing off the face: the eye reads as
        # a goggle lens rather than as lids.  On a real face the lids are the
        # frontmost part of the region by two or three millimetres, no more.
        field.add(
            Ellipsoid(
                h.point(cx, FACE_Y["cornea"] - 0.120, FACE_Z["eye"] + 0.006),
                h.size(0.145, 0.110, 0.088),
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
            blend=0.0020 * hh,
            name=f"fissure_{tag}",
        )
        # Upper lid crease, a couple of millimetres above the lash line.  Shallow
        # and tight: a crease is a fold, and cut any deeper it becomes a slot with
        # its own pair of rims, which reads as a second eyelid.
        field.subtract(
            RoundCone(
                h.point(cx - 0.085, FACE_Y["cornea"] - 0.020, FACE_Z["eye"] + 0.044),
                h.point(cx + 0.085, FACE_Y["cornea"] - 0.020, FACE_Z["eye"] + 0.048),
                0.005 * hh,
                0.005 * hh,
            ),
            blend=0.003 * hh,
            name=f"lid_crease_{tag}",
        )
        # Lower lid: a thin ridge under the aperture.  It is what stops the eye
        # from being a slot in a flat cheek, and it has to be shallow -- three
        # millimetres of relief with a blend under one -- because at any more it
        # becomes a bag.
        field.add(
            Ellipsoid(
                h.point(cx, FACE_Y["cornea"] - 0.026, FACE_Z["eye"] - 0.044),
                h.size(0.100, 0.030, 0.016),
                rot=h.rotated(v3(1.0, 0.0, 0.0), 22.0),
            ),
            blend=0.004 * hh,
            name=f"lower_lid_{tag}",
        )

        landmarks[f"eye_{tag}"] = cornea
        landmarks[f"eyeball_{tag}"] = pivot
        landmarks[f"brow_{tag}"] = h.point(cx, FACE_Y["brow"], FACE_Z["brow"])

    landmarks["eye_mid"] = h.at(0.0, "eye", "cornea")
    landmarks["eye_radius"] = np.array([globe, 0.0, 0.0])
    return landmarks


def _build_ears(field: Field, h: HeadFrame) -> None:
    """An ear is a thin plate standing off the skull, hinged along its front edge.

    Three things have to be right or it does not read at all.

    The height: an ear spans the brow to the base of the nose, and placing it high
    is by far the commonest mistake.

    The stand-off: a real ear leaves a 15-20 mm gap between the helix and the
    skull, and everything that makes an ear legible is the shadow in that gap.

    And the thickness.  A pinna is 60 mm tall, 33 mm front to back and about 4 mm
    thick, so of the three dimensions the small one is the one that carries the
    feature.  Built from a mass thick enough to span from the skull out to the helix
    -- which is what happens if one ellipsoid is asked to be both the plate and its
    root -- the ear becomes a 30 mm bulge, and scooping a concha out of a bulge
    that deep leaves a ring: the shape reads as a spiral shell rather than an ear.
    So the plate and the root are separate, and only the root touches the skull.
    """
    hh = h.height
    top, bottom = FACE_Z["ear_top"] + 0.015, FACE_Z["subnasale"] - 0.032
    centre_z = 0.5 * (top + bottom)
    half_z = 0.5 * (top - bottom)
    # The skull's own half breadth at ear height, from the loft table.
    skull = float(
        np.interp(centre_z, [row[0] for row in HEAD_STATIONS], [row[1] for row in HEAD_STATIONS])
    )

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        tilt = h.rotated(v3(1.0, 0.0, 0.0), 16.0)
        # The plate: thin laterally, and set out far enough that its own thickness
        # never reaches the skull.  Its lower half is pulled forward and its upper
        # half back, which is the ear's characteristic lean.
        field.add(
            Ellipsoid(
                h.point(side * (skull + 0.056), FACE_Y["ear"] - 0.020, centre_z + 0.010),
                h.size(0.030, 0.074, half_z * 0.98),
                rot=tilt,
            ),
            blend=0.004 * hh,
            name=f"pinna_{tag}",
        )
        # The root, which is the only part that touches the skull: a wedge under the
        # front half of the plate, so the plate is hinged along the front edge and
        # free at the back the way an ear is.
        field.add(
            Ellipsoid(
                h.point(side * (skull + 0.014), FACE_Y["ear"] + 0.026, centre_z - 0.006),
                h.size(0.048, 0.040, half_z * 0.62),
                rot=tilt,
            ),
            blend=0.010 * hh,
            name=f"ear_root_{tag}",
        )
        # Concha: a shallow bowl in the outer face of the plate, centred behind the
        # canal.  Its centre sits outboard of the plate's own surface so that only
        # the near side of the sphere cuts, which is what keeps it a bowl instead of
        # a hole punched through a 4 mm plate.
        field.subtract(
            Ellipsoid(
                h.point(side * (skull + 0.116), FACE_Y["ear"] - 0.014, centre_z - 0.006),
                h.size(0.075, 0.034, half_z * 0.38),
                rot=tilt,
            ),
            blend=0.004 * hh,
            name=f"concha_{tag}",
        )
        # Helix: the rolled rim up the back and over the top.  Following the plate's
        # own outline rather than sitting inside it, so it thickens the edge.
        for label, (y, z, ry, rz) in {
            "back": (-0.062, 0.004, 0.032, half_z * 0.62),
            "top": (-0.012, half_z * 0.80, 0.052, 0.030),
        }.items():
            field.add(
                Ellipsoid(
                    h.point(
                        side * (skull + 0.052),
                        FACE_Y["ear"] + y,
                        centre_z + z,
                    ),
                    h.size(0.026, ry, rz),
                    rot=tilt,
                ),
                blend=0.005 * hh,
                name=f"helix_{label}_{tag}",
            )
        # Antihelix: the Y shaped ridge inside the bowl, and the only thing that
        # keeps the concha from reading as a plain dent.
        field.add(
            Ellipsoid(
                h.point(side * (skull + 0.062), FACE_Y["ear"] - 0.044, centre_z + 0.012),
                h.size(0.022, 0.024, half_z * 0.46),
                rot=tilt,
            ),
            blend=0.005 * hh,
            name=f"antihelix_{tag}",
        )
        # Tragus: the flap in front of the canal.
        field.add(
            Ellipsoid(
                h.point(side * (skull + 0.050), FACE_Y["ear"] + 0.036, centre_z - 0.014),
                h.size(0.020, 0.020, 0.026),
                rot=tilt,
            ),
            blend=0.005 * hh,
            name=f"tragus_{tag}",
        )
        field.add(
            Ellipsoid(
                h.point(side * (skull + 0.036), FACE_Y["ear"] - 0.004, bottom + 0.022),
                h.size(0.026, 0.030, 0.024),
                rot=tilt,
            ),
            blend=0.006 * hh,
            name=f"lobe_{tag}",
        )


def _build_aging(field: Field, h: HeadFrame, age: str, sag: float) -> None:
    """Nasolabial folds and eye-corner creases; the strongest age cues.

    Nothing is cut at all below a threshold, rather than cut faintly.  A crease a
    fraction of a millimetre deep does not read as a fine crease: it grazes the
    surface, breaks through only where the mesh happens to sample it, and shows up
    as a dotted line.  A young face is better off with no fold than a dotted one.
    """
    depth = {"child": 0.0, "teen": 0.12, "adult": 0.35, "elder": 1.0}[age]
    depth = min(1.0, depth + 0.35 * sag)
    if depth <= 0.45:
        return
    hh = h.height

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.subtract(
            RoundCone(
                h.point(side * 0.150, FACE_Y["subnasale"] + 0.010, FACE_Z["subnasale"] - 0.010),
                h.point(side * 0.205, FACE_Y["lip"] - 0.030, FACE_Z["lip_lower"] - 0.010),
                0.013 * hh * depth,
                0.017 * hh * depth,
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
