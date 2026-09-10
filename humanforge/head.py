"""Head, face and neck construction.

Everything is laid out in a head-local frame so that a head turn or tilt moves
the whole face as one unit: the origin sits on the neck axis at chin height,
+Z runs to the vertex, +Y out through the face and +X to the figure's left.
Dimensions are fractions of the three head measurements (height, breadth,
depth), so they follow the anthropometry instead of being hard-coded.

The face is built by adding masses (cranium, cheekbones, jaw, nose, lips) and
then *carving* the features that are concave in reality -- eye apertures,
nostrils, the philtrum, the lip seam, nasolabial folds.  Carving with a small
blend radius keeps those edges crisp while the added masses use wide blends and
melt into one another.
"""

from __future__ import annotations

import numpy as np

from .anatomy import Measures
from .sdf import Ellipsoid, Field, HalfSpace, RoundBox, RoundCone, Sphere, Vec3, rotation, v3
from .skeleton import LEFT, RIGHT, Skeleton


class HeadFrame:
    """Maps head-local coordinates, expressed in head fractions, to the world."""

    def __init__(self, skeleton: Skeleton) -> None:
        m = skeleton.measures
        self.origin = skeleton.p("head_origin")
        self.basis = skeleton.frames["head"]
        self.height = m.b("head_height")
        self.width = m.b("head")
        self.depth = m.b("head_depth")

    def point(self, x: float, y: float, z: float) -> Vec3:
        """``x`` in head breadths, ``y`` in head depths, ``z`` in head heights."""
        local = v3(x * self.width, y * self.depth, z * self.height)
        return self.origin + self.basis @ local

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
    hh, hw, hd = h.height, h.width, h.depth
    soft = 0.35 + 0.65 * p.fat  # fleshiness of the face
    young = 1.0 if p.age in ("child", "teen") else 0.0
    female = 1.0 if p.sex == "female" else (0.5 if p.sex == "neutral" else 0.0)

    _build_neck(field, skeleton, h)

    # -- cranium ----------------------------------------------------------
    field.add(
        Ellipsoid(
            h.point(0.0, -0.05, 0.685),
            h.size(0.500, 0.445, 0.335),
            rot=h.orientation,
        ),
        blend=0.02 * hh,
        name="cranium",
    )
    field.add(
        Ellipsoid(
            h.point(0.0, -0.235, 0.605),
            h.size(0.430, 0.300, 0.280),
            rot=h.orientation,
        ),
        blend=0.055 * hh,
        name="occiput",
    )
    # Slight flattening of the temples keeps the skull from reading as an egg.
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.subtract(
            Sphere(h.point(side * 0.86, 0.055, 0.615), 0.40 * hw),
            blend=0.09 * hh,
            name=f"temple_{tag}",
        )

    # -- mid face ---------------------------------------------------------
    field.add(
        Ellipsoid(
            h.point(0.0, 0.150, 0.410),
            h.size(0.435, 0.310, 0.250),
            rot=h.orientation,
        ),
        blend=0.05 * hh,
        name="maxilla",
    )
    field.add(
        RoundCone(
            h.point(-0.360, 0.285, 0.575),
            h.point(0.360, 0.285, 0.575),
            0.052 * hh,
            0.052 * hh,
        ),
        blend=0.033 * hh,
        name="brow_ridge",
    )
    # A supraorbital ridge that projects is one of the strongest male cues.
    if female < 0.75:
        field.add(
            RoundCone(
                h.point(-0.230, 0.320, 0.585),
                h.point(0.230, 0.320, 0.585),
                0.038 * hh * (1.0 - female),
                0.038 * hh * (1.0 - female),
            ),
            blend=0.030 * hh,
            name="glabella",
        )

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            Ellipsoid(
                h.point(side * 0.345, 0.230, 0.415),
                h.size(0.150, 0.115, 0.075),
                rot=h.orientation,
            ),
            blend=0.033 * hh,
            name=f"zygomatic_{tag}",
        )
        field.add(
            Ellipsoid(
                h.point(side * 0.320, 0.215, 0.300),
                h.size(0.145, 0.115, 0.105 * soft * 1.4),
                rot=h.orientation,
            ),
            blend=0.045 * hh,
            name=f"cheek_{tag}",
        )

    _build_jaw(field, h, female, soft, p.age)
    _build_nose(field, h, female, young)
    _build_mouth(field, h, female, soft)
    landmarks = _build_eyes(field, skeleton, h, female, young)
    _build_ears(field, h)
    _build_aging(field, h, p.age, p.sag)

    landmarks["head_top"] = h.point(0.0, 0.0, 1.0)
    landmarks["head_centre"] = h.point(0.0, -0.03, 0.62)
    landmarks["chin"] = h.point(0.0, 0.300, 0.045)
    landmarks["nose_tip"] = h.point(0.0, 0.500, 0.395)
    return landmarks


def _build_neck(field: Field, skeleton: Skeleton, h: HeadFrame) -> None:
    m = skeleton.measures
    p = m.params
    neck_r = m.r("upper_arm") * 0.0 + m.b("neck") * 0.5
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
    if p.sex != "female" and p.age not in ("child",):
        field.add(
            Ellipsoid(
                h.point(0.0, 0.290, 0.045) + v3(0.0, 0.0, -m.b("neck") * 0.75),
                v3(neck_r * 0.26, neck_r * 0.22, neck_r * 0.34),
            ),
            blend=neck_r * 0.25,
            name="larynx",
        )


def _build_jaw(
    field: Field, h: HeadFrame, female: float, soft: float, age: str
) -> None:
    hh, hw = h.height, h.depth
    square = 1.0 - 0.45 * female  # a broader gonial angle reads as male
    chin_w = (0.135 + 0.045 * square) * h.width / h.width  # kept in head fractions

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            RoundCone(
                h.point(side * 0.400, -0.075, 0.310),
                h.point(side * 0.360, 0.020, 0.145),
                0.055 * hh,
                0.048 * hh,
            ),
            blend=0.030 * hh,
            name=f"ramus_{tag}",
        )
        field.add(
            RoundCone(
                h.point(side * 0.365, 0.010, 0.135),
                h.point(side * 0.105, 0.285, 0.085),
                0.050 * hh * (0.9 + 0.2 * square),
                0.044 * hh,
            ),
            blend=0.033 * hh,
            name=f"mandible_{tag}",
        )
        field.add(
            Ellipsoid(
                h.point(side * 0.375, -0.030, 0.150),
                h.size(0.075 * square, 0.085, 0.070),
                rot=h.orientation,
            ),
            blend=0.06 * hh,
            name=f"gonion_{tag}",
        )

    field.add(
        Ellipsoid(
            h.point(0.0, 0.290, 0.095),
            h.size(0.115 + 0.040 * square, 0.105, 0.085),
            rot=h.orientation,
        ),
        blend=0.033 * hh,
        name="chin",
    )
    # Mental crease under the lower lip.
    field.subtract(
        RoundCone(
            h.point(-0.090, 0.395, 0.175),
            h.point(0.090, 0.395, 0.175),
            0.016 * hh,
            0.016 * hh,
        ),
        blend=0.015 * hh,
        name="mental_crease",
    )
    if soft > 0.85 or age == "elder":
        field.add(
            Ellipsoid(
                h.point(0.0, 0.180, 0.010),
                h.size(0.230, 0.160, 0.075 * soft),
                rot=h.orientation,
            ),
            blend=0.05 * hh,
            name="submental_fullness",
        )


def _build_nose(field: Field, h: HeadFrame, female: float, young: float) -> None:
    hh = h.height
    length = 1.0 - 0.06 * female
    width = 1.0 - 0.10 * female - 0.05 * young
    projection = 1.0 - 0.10 * female - 0.12 * young

    root = h.point(0.0, 0.285, 0.570)
    bridge_mid = h.point(0.0, (0.360 * projection + 0.02), 0.480 * length)
    tip = h.point(0.0, 0.455 * projection + 0.045, 0.400 * length)

    field.add(
        RoundCone(root, bridge_mid, 0.038 * hh, 0.034 * hh, section=(0.85 * width, 1.0)),
        blend=0.022 * hh,
        name="nasal_bridge",
    )
    field.add(
        RoundCone(bridge_mid, tip, 0.034 * hh, 0.040 * hh, section=(1.05 * width, 1.0)),
        blend=0.019 * hh,
        name="nasal_dorsum",
    )
    field.add(
        Ellipsoid(
            tip, h.size(0.075 * width, 0.070, 0.055), rot=h.orientation
        ),
        blend=0.015 * hh,
        name="nasal_tip",
    )
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            Ellipsoid(
                h.point(side * 0.105 * width, 0.395, 0.360 * length),
                h.size(0.070 * width, 0.075, 0.050),
                rot=h.orientation,
            ),
            blend=0.017 * hh,
            name=f"ala_{tag}",
        )
        # Nostrils open downwards and slightly back.
        field.subtract(
            Ellipsoid(
                h.point(side * 0.070 * width, 0.400, 0.330 * length),
                h.size(0.030, 0.055, 0.030),
                rot=h.rotated(v3(1.0, 0.0, 0.0), -18.0),
            ),
            blend=0.006 * hh,
            name=f"nostril_{tag}",
        )
        field.subtract(
            RoundCone(
                h.point(side * 0.135 * width, 0.360, 0.365 * length),
                h.point(side * 0.150 * width, 0.330, 0.310 * length),
                0.012 * hh,
                0.014 * hh,
            ),
            blend=0.010 * hh,
            name=f"alar_crease_{tag}",
        )
    # Philtrum: the shallow groove from the nose base to the upper lip.
    field.subtract(
        RoundCone(
            h.point(0.0, 0.392, 0.330 * length),
            h.point(0.0, 0.400, 0.268),
            0.014 * hh,
            0.018 * hh,
        ),
        blend=0.011 * hh,
        name="philtrum",
    )


def _build_mouth(field: Field, h: HeadFrame, female: float, soft: float) -> None:
    hh = h.height
    fullness = 1.0 + 0.22 * female
    mouth_z = 0.232
    lip_y = 0.405

    # The upper lip is built from three lobes, which is what gives a cupid's bow.
    for offset, scale in ((0.0, 0.85), (-0.075, 1.0), (0.075, 1.0)):
        field.add(
            Ellipsoid(
                h.point(offset, lip_y - 0.005, mouth_z + 0.022),
                h.size(0.085 * scale, 0.050, 0.028 * fullness * scale),
                rot=h.orientation,
            ),
            blend=0.013 * hh,
            name="upper_lip",
        )
    field.add(
        Ellipsoid(
            h.point(0.0, lip_y, mouth_z - 0.030),
            h.size(0.155, 0.055, 0.036 * fullness),
            rot=h.orientation,
        ),
        blend=0.014 * hh,
        name="lower_lip",
    )
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        field.add(
            Ellipsoid(
                h.point(side * 0.175, 0.360, mouth_z - 0.005),
                h.size(0.050, 0.045, 0.030),
                rot=h.orientation,
            ),
            blend=0.019 * hh,
            name=f"mouth_corner_{tag}",
        )
    # Lip seam: a thin lens carved between the lips.
    field.subtract(
        Ellipsoid(
            h.point(0.0, lip_y + 0.020, mouth_z),
            h.size(0.190, 0.060, 0.008),
            rot=h.rotated(v3(1.0, 0.0, 0.0), -6.0),
        ),
        blend=0.008 * hh,
        name="lip_seam",
    )


def _build_eyes(
    field: Field, skeleton: Skeleton, h: HeadFrame, female: float, young: float
) -> dict[str, Vec3]:
    hh = h.height
    landmarks: dict[str, Vec3] = {}
    eye_x = 0.315
    eye_z = 0.545
    eye_y = 0.300
    opening = 1.0 + 0.10 * female + 0.08 * young

    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        jitter = skeleton.asym.factor(f"eye{tag}", side, 0.015)
        cx = side * eye_x * jitter
        centre = h.point(cx, eye_y, eye_z)

        # Orbital socket, then the soft lid mound that sits over the globe.
        field.subtract(
            Ellipsoid(centre, h.size(0.150, 0.140, 0.105), rot=h.orientation),
            blend=0.028 * hh,
            name=f"orbit_{tag}",
        )
        field.add(
            Ellipsoid(
                h.point(cx, eye_y + 0.055, eye_z),
                h.size(0.135, 0.105, 0.090),
                rot=h.orientation,
            ),
            blend=0.019 * hh,
            name=f"lid_mound_{tag}",
        )
        # Palpebral fissure: a tilted lens carved out to open the eye.  The
        # outer corner sits slightly higher than the inner one.
        field.subtract(
            Ellipsoid(
                h.point(cx, eye_y + 0.085, eye_z - 0.004),
                h.size(0.115, 0.075, 0.030 * opening),
                rot=h.rotated(v3(0.0, 1.0, 0.0), -side * 7.0),
            ),
            blend=0.006 * hh,
            name=f"fissure_{tag}",
        )
        # Epicanthal shelf, so the inner corner does not read as a hole.
        field.add(
            Ellipsoid(
                h.point(side * (eye_x - 0.115), eye_y + 0.060, eye_z - 0.010),
                h.size(0.040, 0.050, 0.035),
                rot=h.orientation,
            ),
            blend=0.010 * hh,
            name=f"canthus_{tag}",
        )
        # Brow soft tissue above the fissure.
        field.add(
            Ellipsoid(
                h.point(cx, eye_y + 0.045, eye_z + 0.070),
                h.size(0.140, 0.090, 0.045),
                rot=h.orientation,
            ),
            blend=0.019 * hh,
            name=f"upper_lid_{tag}",
        )

        landmarks[f"eye_{tag}"] = h.point(cx, eye_y + 0.055, eye_z)
        landmarks[f"brow_{tag}"] = h.point(cx, eye_y + 0.075, eye_z + 0.115)

    landmarks["eye_mid"] = h.point(0.0, eye_y + 0.055, eye_z)
    landmarks["eye_radius"] = np.array([0.058 * hh, 0.0, 0.0])
    return landmarks


def _build_ears(field: Field, h: HeadFrame) -> None:
    hh = h.height
    for side, tag in ((LEFT, "l"), (RIGHT, "r")):
        # Ears sit behind the mid line of the skull and tip back a little.
        tilt = h.rotated(v3(1.0, 0.0, 0.0), 14.0)
        centre = h.point(side * 0.455, -0.085, 0.455)
        field.add(
            Ellipsoid(centre, h.size(0.055, 0.105, 0.150), rot=tilt),
            blend=0.010 * hh,
            name=f"ear_{tag}",
        )
        # Concha: scooped out from the outer face of the ear.
        field.subtract(
            Ellipsoid(
                h.point(side * 0.500, -0.075, 0.470),
                h.size(0.050, 0.065, 0.095),
                rot=tilt,
            ),
            blend=0.008 * hh,
            name=f"concha_{tag}",
        )
        field.add(
            Ellipsoid(
                h.point(side * 0.470, -0.145, 0.480),
                h.size(0.030, 0.035, 0.110),
                rot=tilt,
            ),
            blend=0.010 * hh,
            name=f"helix_{tag}",
        )
        field.add(
            Ellipsoid(
                h.point(side * 0.440, -0.060, 0.360),
                h.size(0.032, 0.045, 0.040),
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
                h.point(side * 0.145, 0.370, 0.330),
                h.point(side * 0.205, 0.330, 0.205),
                0.012 * hh * depth,
                0.016 * hh * depth,
            ),
            blend=0.014 * hh,
            name=f"nasolabial_{tag}",
        )
        if depth > 0.6:
            field.subtract(
                RoundCone(
                    h.point(side * 0.320, 0.290, 0.575),
                    h.point(side * 0.395, 0.230, 0.520),
                    0.008 * hh * depth,
                    0.010 * hh * depth,
                ),
                blend=0.011 * hh,
                name=f"crow_foot_{tag}",
            )
            field.subtract(
                RoundCone(
                    h.point(-0.055, 0.330, 0.640),
                    h.point(0.055, 0.330, 0.640),
                    0.007 * hh * depth,
                    0.007 * hh * depth,
                ),
                blend=0.013 * hh,
                name="forehead_line",
            )
