"""Assembles a complete figure out of blended distance-field solids.

The torso is lofted through a stack of elliptical cross sections whose widths
and depths come straight from the anthropometric tables, so the silhouette --
shoulder to waist to hip -- is correct before a single muscle is added.  Muscle
bellies, fat pads and skeletal landmarks are then blended on top, positioned in
each limb's own frame ("40 % along the thigh, 35 mm forward") and scaled by the
``muscle``, ``fat`` and ``sag`` parameters.

Wide blend radii are used where tissue really is continuous (a deltoid into a
shoulder) and narrow ones where the body has a crease (between fingers, along
the lip seam), which is what keeps the result from looking like a balloon
animal in one direction or a pile of intersecting cylinders in the other.
"""

from __future__ import annotations

from dataclasses import dataclass, field as dataclass_field

import numpy as np

from .anatomy import BodyParams, Measures
from .extremities import build_foot, build_hand
from .hair import build_hair
from .head import build_head
from .parts import Attachment
from .sdf import (
    Ellipsoid,
    Field,
    HalfSpace,
    RoundCone,
    Sphere,
    Vec3,
    normalize,
    rotation,
    surface_along,
    v3,
)
from .skeleton import LEFT, RIGHT, Skeleton, build_skeleton

# Torso cross sections: height as a fraction of stature, then which
# anthropometric breadth and depth drive the section and by how much.
#
# The chain is lofted with round cones, which end in a hemispherical cap.  Both
# ends therefore taper to almost nothing: a full-width cap at the top would
# balloon 13 cm up into the neck, and one at the bottom would fill the crotch
# and leave the legs fused halfway down the thigh.  The narrow end stations sit
# inside the neck and the perineum, where the neck column and the thighs cover
# them; since a cap reaches its own radius past the last station, that radius is
# what has to stay clear of the level the neck girth is measured at.
TORSO_STATIONS = (
    (0.462, "hip", 0.062, "hip_depth", 0.078),
    (0.487, "hip", 0.235, "hip_depth", 0.290),
    (0.505, "hip", 0.430, "hip_depth", 0.418),
    (0.545, "hip", 0.500, "hip_depth", 0.452),
    (0.585, "hip", 0.462, "hip_depth", 0.455),
    # The waist's depth fractions are deliberately smaller than its breadth
    # fractions.  Waist depth carries most of the fat response, and at anything
    # above lean a loft built on it straight is deeper at the navel than at the
    # sternum -- so in profile the belly is the frontmost part of an *average*
    # figure, which reads as a paunch on everyone.  The paunch belongs to the
    # abdominal mass, which is where the fat response can be made explicit.
    (0.620, "waist", 0.530, "waist_depth", 0.470),
    (0.662, "waist", 0.562, "waist_depth", 0.478),
    (0.700, "chest", 0.470, "chest_depth", 0.505),
    (0.736, "chest", 0.500, "chest_depth", 0.512),
    (0.776, "chest", 0.478, "chest_depth", 0.452),
    (0.800, "chest", 0.430, "chest_depth", 0.382),
    (0.820, "chest", 0.270, "chest_depth", 0.262),
    (0.833, "chest", 0.090, "chest_depth", 0.095),
)


@dataclass
class Figure:
    """A built figure: one solid body plus placed attachments."""

    params: BodyParams
    measures: Measures
    skeleton: Skeleton
    body: Field
    hair: Field | None = None
    """Hair and brows: a second solid, meshed and shaded separately from the skin."""

    attachments: list[Attachment] = dataclass_field(default_factory=list)
    landmarks: dict[str, Vec3] = dataclass_field(default_factory=dict)

    @property
    def height(self) -> float:
        return self.params.height


LOFT_SHRINK = 0.955
"""The lofted trunk is built slightly inside its tape measurements.

Every smooth union pushes the surface out by up to a quarter of its blend
radius, and a trunk carries dozens of them, so a loft built exactly on the
anthropometric breadths ends up measuring several centimetres too large.
"""


class TorsoProfile:
    """Interpolates the lofted torso so features can be placed on its surface."""

    def __init__(self, skeleton: Skeleton) -> None:
        m = skeleton.measures
        self.z: list[float] = []
        self.half_w: list[float] = []
        self.half_d: list[float] = []
        self.centre_y: list[float] = []
        for z_frac, w_key, w_scale, d_key, d_scale in TORSO_STATIONS:
            z = z_frac * m.height
            half_w = m.b(w_key) * w_scale * LOFT_SHRINK
            half_d = m.b(d_key) * d_scale * LOFT_SHRINK
            _, spine_y = skeleton.spine_offset_at(z)
            self.z.append(z)
            self.half_w.append(half_w)
            self.half_d.append(half_d)
            # The vertebral column runs about 55 % of the way back, so the
            # section centre sits in front of it.
            self.centre_y.append(spine_y + half_d * 0.45)
        self._skeleton = skeleton
        self.height = m.height

    def width(self, z: float) -> float:
        return float(np.interp(z, self.z, self.half_w))

    def depth(self, z: float) -> float:
        return float(np.interp(z, self.z, self.half_d))

    def centre(self, z: float) -> float:
        return float(np.interp(z, self.z, self.centre_y))

    def front(self, z: float) -> float:
        return self.centre(z) + self.depth(z)

    def back(self, z: float) -> float:
        return self.centre(z) - self.depth(z)

    def point(self, z: float, across: float = 0.0, forward: float = 0.0) -> Vec3:
        x, _ = self._skeleton.spine_offset_at(z)
        return v3(x + across, self.centre(z) + forward, z)


def build_figure(params: BodyParams) -> Figure:
    """Build the complete body for ``params``."""
    skeleton = build_skeleton(params)
    m = skeleton.measures
    body = Field(f"body_{params.name}")
    attachments: list[Attachment] = []
    profile = TorsoProfile(skeleton)

    _build_torso(body, skeleton, profile)
    landmarks = build_head(body, skeleton)
    for side in (LEFT, RIGHT):
        _build_arm(body, skeleton, side)
        _build_leg(body, skeleton, profile, side)
        build_hand(body, skeleton, side, attachments)
        build_foot(body, skeleton, side, attachments)

    _add_eyes(skeleton, landmarks, attachments)

    # Flatten whatever crosses the floor, with a hair of softness so the sole
    # does not end in a razor edge.
    body.intersect(
        HalfSpace(v3(0.0, 0.0, 0.0), v3(0.0, 0.0, -1.0)),
        blend=0.0025,
        name="ground",
    )

    landmarks.update(
        {
            "root": v3(0.0, 0.0, 0.0),
            "hip": profile.point(m.h("hip_joint")),
            "chest": profile.point(m.h("nipple")),
            "shoulder_l": skeleton.p("acromion_l"),
            "shoulder_r": skeleton.p("acromion_r"),
            "hand_l": skeleton.p("hand_end_l"),
            "hand_r": skeleton.p("hand_end_r"),
        }
    )
    return Figure(
        params=params,
        measures=m,
        skeleton=skeleton,
        body=body,
        hair=build_hair(skeleton, params.hair, body),
        attachments=attachments,
        landmarks=landmarks,
    )


# ---------------------------------------------------------------------------
# torso


def _on_surface(
    body: Field, profile: TorsoProfile, x: float, z: float
) -> Vec3:
    """The point on the front of the body at ``(x, z)``, as built so far.

    Concave details are cut relative to this rather than to the lofted profile,
    because by the time they are added the pectorals, abdomen and glutes have
    moved the surface by a couple of centimetres, and not by the same amount at
    every height.
    """
    return surface_along(
        body.ops,
        v3(x, profile.centre(z), z),
        v3(0.0, 1.0, 0.0),
        reach=0.16 * profile.height,
    )


def _build_torso(body: Field, skeleton: Skeleton, profile: TorsoProfile) -> None:
    m = skeleton.measures
    p = m.params
    H = m.height
    muscle, fat, sag = p.muscle, p.fat, p.sag
    female = 1.0 if p.sex == "female" else (0.5 if p.sex == "neutral" else 0.0)

    # -- lofted trunk -----------------------------------------------------
    for i in range(len(TORSO_STATIONS) - 1):
        z0, z1 = profile.z[i], profile.z[i + 1]
        a = profile.point(z0)
        b = profile.point(z1)
        w0, w1 = profile.half_w[i], profile.half_w[i + 1]
        mean_w = 0.5 * (w0 + w1)
        mean_d = 0.5 * (profile.half_d[i] + profile.half_d[i + 1])
        body.add(
            RoundCone(a, b, w0, w1, section=(1.0, mean_d / mean_w)),
            blend=0.005 * H,
            name=f"trunk_{i}",
        )

    # -- pelvis and buttocks ---------------------------------------------
    glute_size = 1.0 + 0.30 * female + 0.35 * (fat - 0.4) + 0.20 * (muscle - 0.5)
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        z = 0.506 * H
        # Parametrised by how far the buttock stands out behind the sacrum
        # (3-6 cm on an adult) rather than by the ellipsoid's centre, which is
        # easy to place several centimetres too far back.
        depth_radius = m.b("hip_depth") * 0.300 * glute_size
        protrusion = H * (0.010 + 0.009 * glute_size)
        body.add(
            Ellipsoid(
                v3(
                    side * m.b("hip") * 0.230,
                    profile.back(z) - protrusion + depth_radius,
                    z + 0.004 * H * (1.0 - sag),
                ),
                v3(
                    m.b("hip") * 0.240 * glute_size,
                    depth_radius,
                    0.048 * H * (1.0 + 0.10 * glute_size),
                ),
                rot=rotation((1.0, 0.0, 0.0), -8.0 + 6.0 * sag),
            ),
            blend=0.010 * H,
            name=f"gluteus_{tag}",
        )
        # Gluteal fold, deeper on softer figures.
        body.subtract(
            RoundCone(
                v3(side * m.b("hip") * 0.075, profile.back(0.478 * H), 0.474 * H),
                v3(side * m.b("hip") * 0.360, profile.back(0.482 * H) + 0.010 * H, 0.482 * H),
                0.011 * H * (0.6 + 0.6 * fat),
                0.009 * H * (0.6 + 0.6 * fat),
            ),
            blend=0.007 * H,
            name=f"gluteal_fold_{tag}",
        )

    # Sacral dimples and the groove between the buttocks.
    body.subtract(
        RoundCone(
            v3(0.0, profile.back(0.545 * H) + 0.004 * H, 0.545 * H),
            v3(0.0, profile.back(0.480 * H) - 0.012 * H, 0.480 * H),
            0.010 * H,
            0.020 * H,
        ),
        blend=0.007 * H,
        name="natal_cleft",
    )

    # -- abdomen ----------------------------------------------------------
    # Placed by how far it stands in front of the trunk, the same way the
    # pectoral and the buttock are, because that is the quantity anyone would
    # describe: nothing on a lean figure, a couple of centimetres on a heavy one.
    # Sized from the loft's own depth instead, the belly is whatever the fat
    # response happened to add and there is no height at which it is flat.
    z_belly = (0.648 - 0.012 * sag) * H
    depth_radius = m.b("waist_depth") * 0.330
    protrusion = max(0.0, fat - 0.30) * 0.052 * H
    body.add(
        Ellipsoid(
            v3(
                0.0,
                profile.front(z_belly) + protrusion - depth_radius,
                z_belly,
            ),
            v3(m.b("waist") * 0.430, depth_radius, 0.070 * H),
        ),
        blend=0.011 * H,
        name="abdomen",
    )
    navel_z = 0.635 * H
    body.subtract(
        Ellipsoid(
            _on_surface(body, profile, 0.0, navel_z) + v3(0.0, 0.0135 * H, 0.0),
            v3(0.0055 * H, 0.0155 * H, 0.0080 * H),
        ),
        blend=0.0022 * H,
        name="navel",
    )
    if muscle > 0.55 and fat < 0.38:
        _build_abdominal_definition(body, profile, m, muscle, fat)

    # -- chest ------------------------------------------------------------
    z_nipple = m.h("nipple") - sag * 0.020 * H
    z_pec = z_nipple + 0.025 * H
    # A pectoral is a wide, shallow form, and that combination is the hardest
    # thing to add to an SDF: a mass that only just breaks the surface meets it
    # at a glancing angle, and a blend comparable to the protrusion then leaves a
    # raised ring right around the rim.  Making the protrusion explicit and the
    # blend clearly larger than it keeps the swelling soft-edged.
    protrusion = (0.004 + 0.008 * muscle) * H
    depth_radius = 0.028 * H
    surfaces = {
        tag: _on_surface(body, profile, side * m.b("chest") * 0.270, z_pec)
        for side, tag in ((LEFT, "l"), (RIGHT, "r"))
    }
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        body.add(
            Ellipsoid(
                v3(
                    side * m.b("chest") * 0.270,
                    surfaces[tag][1] + protrusion - depth_radius,
                    z_pec,
                ),
                v3(
                    m.b("chest") * 0.245,
                    depth_radius,
                    (0.038 - 0.007 * female) * H,
                ),
                rot=rotation((1.0, 0.0, 0.0), 6.0),
            ),
            blend=0.012 * H,
            name=f"pectoral_{tag}",
        )
        if muscle > 0.6 and female < 0.5:
            # Cut against the surface as built, not against the loft.  The pectoral
            # above has just moved the chest forward by up to 19 mm, so an axis
            # placed off the loft sits well *behind* the skin, and a cut whose axis
            # is behind the surface breaks through only where the surface happens to
            # dip: what should be the lower border of the pectoral comes out as two
            # horizontal slashes with square ends, which is what it looked like.
            medial = _on_surface(body, profile, side * m.b("chest") * 0.100, z_nipple)
            lateral = _on_surface(
                body, profile, side * m.b("chest") * 0.440, z_nipple + 0.014 * H
            )
            body.subtract(
                RoundCone(
                    medial + v3(0.0, 0.0055 * H, -0.008 * H),
                    lateral + v3(0.0, 0.0075 * H, 0.0),
                    0.0088 * H,
                    0.0086 * H,
                ),
                blend=0.006 * H,
                name=f"pec_border_{tag}",
            )

    if female > 0.25:
        _build_breasts(body, profile, m, female, sag)
    _build_nipples(body, profile, m, female, sag)

    # -- shoulders, back and neck base -----------------------------------
    _build_shoulder_girdle(body, skeleton, profile)
    _build_back(body, skeleton, profile)

    # -- inguinal creases and pelvic front -------------------------------
    # The crease has to be cut against the front of the *built* pelvis, not the
    # loft it started from, or it turns into a bore hole through the groin.
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        # The medial end stops well short of the midline.  Run in to it, the two
        # creases meet in a sharp V over the pubis, and a symmetrical V across the
        # groin does not read as anatomy at all -- it reads as the waistband of
        # something the figure is wearing.
        medial = _on_surface(body, profile, side * m.b("hip") * 0.150, 0.483 * H)
        lateral = _on_surface(body, profile, side * m.b("hip") * 0.330, 0.524 * H)
        # Four millimetres deep, which is what an inguinal crease is.  The radii
        # have to be read together with the offset that lifts the axis clear of the
        # skin: at the radii a limb would use, the axis clearance is a fraction of
        # them and the crease becomes a 10 mm trench across the groin.
        body.subtract(
            RoundCone(
                medial + v3(0.0, 0.0042 * H, 0.0),
                lateral + v3(0.0, 0.0042 * H, 0.0),
                0.0064 * H,
                0.0074 * H,
            ),
            blend=0.004 * H,
            name=f"inguinal_{tag}",
        )
    body.add(
        Ellipsoid(
            v3(0.0, profile.front(0.500 * H) - 0.030 * H, 0.500 * H),
            v3(m.b("hip") * 0.215, m.b("hip_depth") * 0.290, 0.026 * H),
        ),
        blend=0.008 * H,
        name="pubic_mass",
    )
    _carve_crotch(body, profile, m)


def _carve_crotch(body: Field, profile: TorsoProfile, m: Measures) -> None:
    """Open the gap between the thighs at the right height.

    Thighs genuinely touch just below the pelvis, so the loft and the limbs
    correctly merge there.  Left alone they stay merged much too far down,
    which shortens the legs visibly.  A narrow wedge along the mid line,
    stretched front to back by the section scale, ends the fusion at the crotch
    and lets the natural taper take over below it.
    """
    H = m.height
    y_centre = profile.centre(0.480 * H) - m.b("hip_depth") * 0.055
    top = v3(0.0, y_centre, 0.500 * H)
    bottom = v3(0.0, y_centre, 0.415 * H)
    body.subtract(
        RoundCone(
            top,
            bottom,
            0.0075 * H,
            0.0160 * H,
            section=(6.0, 1.0),
            frame=np.column_stack(
                (v3(0.0, 1.0, 0.0), v3(1.0, 0.0, 0.0), v3(0.0, 0.0, -1.0))
            ),
        ),
        blend=0.004 * H,
        name="perineum",
    )


def _build_abdominal_definition(
    body: Field, profile: TorsoProfile, m: Measures, muscle: float, fat: float
) -> None:
    """Carve the rectus grooves that show on a lean, trained torso."""
    H = m.height
    depth = (muscle - 0.55) * (0.38 - fat) * 9.0
    depth = float(np.clip(depth, 0.0, 1.0))
    if depth < 0.05:
        return

    # Every one of these is cut against the surface as built.  Taken off the loft
    # instead they sit behind the abdominal mass, which has moved the belly forward
    # by a centimetre or more, and a cut behind the surface reaches through it only
    # in patches: the tendinous lines of a rectus come out as a row of horizontal
    # slashes with hard square ends, which is not a subtle failure.
    for z_frac, width in ((0.664, 0.30), (0.692, 0.28), (0.716, 0.24)):
        z = z_frac * H
        left = _on_surface(body, profile, -m.b("waist") * width, z)
        right = _on_surface(body, profile, m.b("waist") * width, z)
        lift = v3(0.0, 0.0058 * H, 0.0)
        body.subtract(
            RoundCone(
                left + lift,
                right + lift,
                0.0080 * H * depth,
                0.0080 * H * depth,
            ),
            blend=0.005 * H,
            name="rectus_groove",
        )
    z0, z1 = 0.640 * H, 0.726 * H
    body.subtract(
        RoundCone(
            _on_surface(body, profile, 0.0, z0) + v3(0.0, 0.0052 * H, 0.0),
            _on_surface(body, profile, 0.0, z1) + v3(0.0, 0.0052 * H, 0.0),
            0.0070 * H * depth,
            0.0070 * H * depth,
        ),
        blend=0.004 * H,
        name="linea_alba",
    )


def _build_breasts(
    body: Field, profile: TorsoProfile, m: Measures, female: float, sag: float
) -> None:
    H = m.height
    p = m.params
    radius = 0.036 * H * p.bust * (0.85 + 0.30 * p.fat)
    z = m.h("nipple") + 0.012 * H - sag * 0.030 * H
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        jitter = 1.0 + 0.025 * (1 if side > 0 else -1)
        centre = v3(
            side * m.b("chest") * 0.245,
            profile.front(z) - radius * 0.42,
            z,
        )
        body.add(
            Ellipsoid(
                centre,
                v3(radius * 1.02 * jitter, radius * 0.95, radius * (1.05 - 0.15 * sag)),
                rot=rotation((1.0, 0.0, 0.0), -10.0 - 14.0 * sag),
            ),
            blend=0.011 * H,
            name=f"breast_{tag}",
        )
        # Inframammary fold.
        body.subtract(
            RoundCone(
                v3(side * m.b("chest") * 0.090, profile.front(z) - radius * 0.55, z - radius * 0.95),
                v3(side * m.b("chest") * 0.420, profile.front(z) - radius * 0.75, z - radius * 0.80),
                0.006 * H * (0.5 + sag),
                0.005 * H * (0.5 + sag),
            ),
            blend=0.006 * H,
            name=f"inframammary_{tag}",
        )


def _build_nipples(
    body: Field, profile: TorsoProfile, m: Measures, female: float, sag: float
) -> None:
    H = m.height
    p = m.params
    if p.age == "child":
        return
    z = m.h("nipple") + (0.006 * H - sag * 0.032 * H if female > 0.25 else -sag * 0.018 * H)
    across = m.b("chest") * (0.245 if female > 0.25 else 0.250)
    # Both pieces are placed by how far they stand off the skin -- 2 mm for the
    # areola, 4 mm for the nipple -- because the surface here has already been
    # moved forward by the pectoral, and an offset from the loft would leave a
    # cone sticking out of the chest.
    spread = 0.0075 + 0.0035 * female
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        surface = _on_surface(body, profile, side * across, z)[1]
        body.add(
            Ellipsoid(
                v3(side * across, surface + 0.0018 - 0.0060 * H, z),
                v3(spread * H, 0.0060 * H, spread * H),
            ),
            blend=0.0025 * H,
            name=f"areola_{tag}",
        )
        body.add(
            Sphere(
                v3(side * across, surface + 0.0040 - 0.0035 * H, z),
                0.0035 * H,
            ),
            blend=0.0018 * H,
            name=f"nipple_{tag}",
        )


def _build_shoulder_girdle(
    body: Field, skeleton: Skeleton, profile: TorsoProfile
) -> None:
    m = skeleton.measures
    p = m.params
    H = m.height
    muscle = p.muscle
    trap = 0.60 + 0.90 * muscle

    neck_base = skeleton.p("neck_base")
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        acromion = skeleton.p(f"acromion_{tag}")
        shoulder = skeleton.p(f"shoulder_{tag}")

        # Trapezius: the slope from neck to shoulder, the single most
        # recognisable line of the upper body.  It starts beside the neck rather
        # than on the mid line, so the neck itself stays slim.
        body.add(
            RoundCone(
                neck_base + v3(side * m.b("neck") * 0.46, -0.004 * H, 0.0),
                acromion + v3(-side * 0.010 * H, -0.006 * H, -0.012 * H),
                0.0185 * H * trap,
                0.019 * H * trap,
            ),
            blend=0.007 * H,
            name=f"trapezius_{tag}",
        )
        # Clavicle ridge with the hollow above it.
        sternum = v3(0.0, profile.front(0.800 * H) - 0.004 * H, 0.802 * H)
        body.add(
            RoundCone(
                sternum,
                acromion + v3(0.0, 0.006 * H, -0.004 * H),
                0.012 * H,
                0.014 * H,
            ),
            blend=0.006 * H,
            name=f"clavicle_{tag}",
        )
        # The hollow above the clavicle: a shallow trough, three millimetres deep,
        # cut from outside the surface it sits in.  It has to be long and shallow.
        # Short and deep -- which is what a round cutter sunk into the chest gives
        # -- it stops reading as the hollow behind a collarbone and becomes a pair
        # of drilled ovals on the upper chest.
        fossa = _on_surface(
            body, profile, side * m.b("biacromial") * 0.175, 0.824 * H
        )
        body.subtract(
            Ellipsoid(
                fossa + v3(0.0, 0.0080 * H, 0.0),
                v3(0.026 * H, 0.0105 * H, 0.0060 * H),
                rot=rotation((0.0, 1.0, 0.0), -side * 14.0),
            ),
            blend=0.0045 * H,
            name=f"supraclavicular_{tag}",
        )
        # Deltoid cap, oriented down the arm.
        upper = skeleton.s("upper_arm", side)
        r = m.r("deltoid")
        body.add(
            Ellipsoid(
                shoulder + upper.axis * r * 0.32,
                v3(r * 0.96, r * 0.88, r * 1.34),
                rot=upper.frame,
            ),
            blend=0.009 * H,
            name=f"deltoid_{tag}",
        )
        # Latissimus / serratus wall, which produces the V-taper.
        z = 0.700 * H
        body.add(
            Ellipsoid(
                v3(
                    side * (profile.width(z) - 0.021 * H),
                    profile.centre(z) - 0.020 * H,
                    z,
                ),
                v3(
                    (0.014 + 0.010 * muscle) * H,
                    m.b("chest_depth") * 0.300,
                    0.075 * H,
                ),
            ),
            blend=0.011 * H,
            name=f"latissimus_{tag}",
        )


def _build_back(body: Field, skeleton: Skeleton, profile: TorsoProfile) -> None:
    m = skeleton.measures
    H = m.height
    muscle = m.params.muscle

    # Paraspinal furrow: two erector columns with a groove between them.
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        z0, z1 = 0.560 * H, 0.790 * H
        body.add(
            RoundCone(
                v3(side * 0.016 * H, profile.back(z0) + 0.014 * H, z0),
                v3(side * 0.018 * H, profile.back(z1) + 0.016 * H, z1),
                0.016 * H * (0.7 + 0.6 * muscle),
                0.014 * H * (0.7 + 0.6 * muscle),
            ),
            blend=0.009 * H,
            name=f"erector_{tag}",
        )
        # Scapula: a flat plate that catches a highlight on the upper back.
        z = 0.762 * H
        body.add(
            Ellipsoid(
                v3(side * m.b("chest") * 0.290, profile.back(z) + 0.012 * H, z),
                v3(m.b("chest") * 0.220, 0.016 * H, 0.055 * H),
                rot=rotation((0.0, 1.0, 0.0), -side * 8.0),
            ),
            blend=0.010 * H,
            name=f"scapula_{tag}",
        )

    z0, z1 = 0.545 * H, 0.800 * H
    body.subtract(
        RoundCone(
            v3(0.0, profile.back(z0) - 0.002 * H, z0),
            v3(0.0, profile.back(z1) - 0.004 * H, z1),
            0.010 * H,
            0.012 * H,
        ),
        blend=0.008 * H,
        name="spinal_groove",
    )


# ---------------------------------------------------------------------------
# limbs


def _build_arm(body: Field, skeleton: Skeleton, side: float) -> None:
    m = skeleton.measures
    p = m.params
    H = m.height
    tag = "l" if side > 0 else "r"
    muscle = p.muscle
    upper = skeleton.s("upper_arm", side)
    fore = skeleton.s("forearm", side)

    r_upper = m.r("upper_arm")
    r_elbow = m.r("elbow")
    r_fore = m.r("forearm")
    r_wrist = m.r("wrist")

    # The cone is deliberately narrower than the measured radius, because the
    # muscles are what have to carry the girth out to it.  Sized to the radius
    # instead, the cone reaches the skin on its own and every mass blended onto it
    # afterwards sits *inside* it: the arithmetic is that a mass offset from the
    # axis by less than its own radius never breaks a surface already that far out,
    # so it adds volume nothing can see.  That is how a limb with a named belly for
    # every muscle group comes out as a smooth tapering tube, and it is invisible in
    # the code because each mass looks correctly placed relative to the *bone*.
    body.add(
        RoundCone(
            upper.start,
            upper.end,
            r_upper * 0.94,
            r_elbow * 1.06,
            section=(1.0, 0.96),
        ),
        blend=0.007 * H,
        name=f"upper_arm_{tag}",
    )
    # Biceps in front, triceps behind, both riding on the upper arm frame.
    body.add(
        Ellipsoid(
            upper.at(0.42, front=r_upper * 0.44),
            v3(r_upper * 0.76, r_upper * (0.54 + 0.32 * muscle), upper.length * 0.30),
            rot=upper.frame,
        ),
        blend=0.006 * H,
        name=f"biceps_{tag}",
    )
    body.add(
        Ellipsoid(
            upper.at(0.36, front=-r_upper * 0.44),
            v3(r_upper * 0.84, r_upper * (0.52 + 0.30 * muscle), upper.length * 0.36),
            rot=upper.frame,
        ),
        blend=0.0065 * H,
        name=f"triceps_{tag}",
    )
    body.add(
        Sphere(upper.end, r_elbow * 1.02),
        blend=0.005 * H,
        name=f"elbow_{tag}",
    )
    body.add(
        Ellipsoid(
            upper.at(1.0, front=-r_elbow * 0.55),
            v3(r_elbow * 0.55, r_elbow * 0.45, r_elbow * 0.60),
            rot=upper.frame,
        ),
        blend=0.004 * H,
        name=f"olecranon_{tag}",
    )

    body.add(
        RoundCone(
            fore.start,
            fore.end,
            r_fore * 0.86,
            r_wrist * 1.00,
            section=(1.0, 0.90),
        ),
        blend=0.006 * H,
        name=f"forearm_{tag}",
    )
    # Flexor and extensor mass, bunched towards the elbow.
    body.add(
        Ellipsoid(
            fore.at(0.24, front=r_fore * 0.32),
            v3(r_fore * 0.84, r_fore * (0.62 + 0.26 * muscle), fore.length * 0.30),
            rot=fore.frame,
        ),
        blend=0.0055 * H,
        name=f"flexors_{tag}",
    )
    body.add(
        Ellipsoid(
            fore.at(0.30, front=-r_fore * 0.34, side=-side * r_fore * 0.24),
            v3(r_fore * 0.62, r_fore * (0.54 + 0.24 * muscle), fore.length * 0.34),
            rot=fore.frame,
        ),
        blend=0.0055 * H,
        name=f"extensors_{tag}",
    )
    # Ulnar styloid, the bump on the little-finger side of the wrist.
    body.add(
        Sphere(fore.at(0.98, side=side * r_wrist * 0.55), r_wrist * 0.42),
        blend=0.004 * H,
        name=f"styloid_{tag}",
    )


def _build_leg(
    body: Field, skeleton: Skeleton, profile: TorsoProfile, side: float
) -> None:
    m = skeleton.measures
    p = m.params
    H = m.height
    tag = "l" if side > 0 else "r"
    muscle, fat = p.muscle, p.fat
    thigh = skeleton.s("thigh", side)
    shank = skeleton.s("shank", side)

    r_thigh = m.r("thigh")
    r_knee = m.r("knee")
    r_calf = m.r("calf")
    r_ankle = m.r("ankle")

    # As with the arm: the cone stays inside the measured radius so that the four
    # muscle groups are what bring the surface out to it.  A thigh is the clearest
    # case of why that matters -- it is markedly deeper than it is wide, and its
    # widest point is above its middle, neither of which a cone can be.
    body.add(
        RoundCone(
            thigh.start + thigh.axis * r_thigh * 0.35,
            thigh.end,
            r_thigh * 0.90,
            r_knee * 1.04,
            section=(1.0, 0.97),
        ),
        blend=0.004 * H,
        name=f"thigh_{tag}",
    )
    # Quadriceps, hamstrings, adductors and the outer sweep of the vastus.
    body.add(
        Ellipsoid(
            thigh.at(0.56, front=r_thigh * 0.40),
            v3(r_thigh * 0.78, r_thigh * (0.56 + 0.28 * muscle), thigh.length * 0.32),
            rot=thigh.frame,
        ),
        blend=0.0065 * H,
        name=f"quadriceps_{tag}",
    )
    body.add(
        Ellipsoid(
            thigh.at(0.40, front=-r_thigh * 0.42),
            v3(r_thigh * 0.80, r_thigh * (0.56 + 0.24 * muscle), thigh.length * 0.40),
            rot=thigh.frame,
        ),
        blend=0.0065 * H,
        name=f"hamstrings_{tag}",
    )
    body.add(
        Ellipsoid(
            thigh.at(0.16, side=side * r_thigh * 0.28),
            v3(
                r_thigh * (0.54 + 0.22 * fat),
                r_thigh * 0.66,
                thigh.length * 0.20,
            ),
            rot=thigh.frame,
        ),
        blend=0.006 * H,
        name=f"adductor_{tag}",
    )
    body.add(
        Ellipsoid(
            thigh.at(0.46, side=-side * r_thigh * 0.44),
            v3(
                r_thigh * (0.50 + 0.24 * muscle),
                r_thigh * 0.72,
                thigh.length * 0.36,
            ),
            rot=thigh.frame,
        ),
        blend=0.0075 * H,
        name=f"vastus_lateralis_{tag}",
    )

    # -- knee -------------------------------------------------------------
    body.add(
        Ellipsoid(
            thigh.end,
            v3(r_knee * 1.02, r_knee * 0.94, r_knee * 0.90),
            rot=thigh.frame,
        ),
        blend=0.006 * H,
        name=f"knee_{tag}",
    )
    body.add(
        Ellipsoid(
            thigh.at(1.0, front=r_knee * 0.62),
            v3(r_knee * 0.44, r_knee * 0.34, r_knee * 0.46),
            rot=thigh.frame,
        ),
        blend=0.004 * H,
        name=f"patella_{tag}",
    )
    body.subtract(
        RoundCone(
            thigh.at(1.06, front=-r_knee * 1.05, side=-r_knee * 0.6),
            thigh.at(1.06, front=-r_knee * 1.05, side=r_knee * 0.6),
            0.008 * H,
            0.008 * H,
        ),
        blend=0.006 * H,
        name=f"popliteal_{tag}",
    )

    # -- shank ------------------------------------------------------------
    body.add(
        RoundCone(
            shank.start,
            shank.end,
            r_knee * 0.92,
            r_ankle * 1.04,
            section=(1.0, 0.94),
        ),
        blend=0.007 * H,
        name=f"shank_{tag}",
    )
    # Gastrocnemius: the medial head sits lower than the lateral one.
    body.add(
        Ellipsoid(
            shank.at(0.30, front=-r_calf * 0.42, side=side * r_calf * 0.22),
            v3(r_calf * 0.62, r_calf * (0.62 + 0.26 * muscle), shank.length * 0.26),
            rot=shank.frame,
        ),
        blend=0.0060 * H,
        name=f"gastro_medial_{tag}",
    )
    body.add(
        Ellipsoid(
            shank.at(0.24, front=-r_calf * 0.40, side=-side * r_calf * 0.26),
            v3(r_calf * 0.58, r_calf * (0.58 + 0.24 * muscle), shank.length * 0.24),
            rot=shank.frame,
        ),
        blend=0.0060 * H,
        name=f"gastro_lateral_{tag}",
    )
    # Tibial crest, just under the skin along the front of the shin.
    body.add(
        RoundCone(
            shank.at(0.10, front=r_knee * 0.42, side=side * r_knee * 0.10),
            shank.at(0.86, front=r_ankle * 0.42, side=side * r_ankle * 0.10),
            r_knee * 0.30,
            r_ankle * 0.34,
        ),
        blend=0.0050 * H,
        name=f"tibia_{tag}",
    )
    body.add(
        Ellipsoid(
            shank.at(0.52, front=r_calf * 0.10, side=-side * r_calf * 0.42),
            v3(r_calf * 0.36, r_calf * 0.46, shank.length * 0.24),
            rot=shank.frame,
        ),
        blend=0.0060 * H,
        name=f"peroneal_{tag}",
    )


def _add_eyes(
    skeleton: Skeleton,
    landmarks: dict[str, Vec3],
    attachments: list[Attachment],
) -> None:
    """Place the eyeballs in the sockets the lids were cut around."""
    radius = float(landmarks["eye_radius"][0])
    head = skeleton.frames["head"]

    for tag in ("l", "r"):
        # The aperture was cut around this exact point, so use it rather than
        # hunting for the lid surface: that surface is a consequence of the
        # aperture, and deriving one from the other only moves the globe out of
        # the hole made for it.
        attachments.append(
            Attachment(
                kind="eye",
                name=f"eye_{tag}",
                centre=landmarks[f"eyeball_{tag}"],
                size=np.array([radius, radius, radius]),
                frame=head,
            )
        )
