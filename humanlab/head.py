"""Head and face.

The skull is a single lofted volume -- a stack of super-elliptical transverse
sections from the chin to the crown -- rather than a heap of blended balls.
That gives a believable silhouette from every angle and a well behaved surface
to attach features to.  Section heights follow the classical canon, measured
from the chin in fractions of head height ``hh``: mouth 0.245, nose base 0.35,
eye line 0.53, brow 0.60, widest point of the skull 0.68, hairline 0.80.

Fillet radii here are absolute (metres, scaled by head height) so facial
features stay crisp regardless of the body's overall softness setting.
"""

from __future__ import annotations

import numpy as np

from . import sdf
from .proportions import Proportions

EYE_RADIUS = 0.0122  # metres; eyeballs barely vary with stature


def _shift(p, dx):
    return (p[0] + dx, p[1], p[2])


class Profile:
    """Front/back/width interpolators for a lofted volume."""

    def __init__(self, sections):
        s = sorted(sections, key=lambda r: r[0])
        self.z = np.array([r[0] for r in s])
        self.rx = np.array([r[1] for r in s])
        self.ryf = np.array([r[2] for r in s])
        self.ryb = np.array([r[3] for r in s])
        self.cy = np.array([r[4] for r in s])
        self.ex = np.array([r[5] if len(r) > 5 else 2.2 for r in s])
        zz, rx = sdf._smooth_table(self.z, self.rx)
        _, ryf = sdf._smooth_table(self.z, self.ryf)
        _, ryb = sdf._smooth_table(self.z, self.ryb)
        _, cy = sdf._smooth_table(self.z, self.cy)
        _, ex = sdf._smooth_table(self.z, self.ex)
        self.z, self.rx, self.ryf, self.ryb, self.cy, self.ex = zz, rx, ryf, ryb, cy, ex

    def front(self, z):
        return float(np.interp(z, self.z, self.cy - self.ryf))

    def back(self, z):
        return float(np.interp(z, self.z, self.cy + self.ryb))

    def width(self, z):
        return float(np.interp(z, self.z, self.rx))

    def centre(self, z):
        return float(np.interp(z, self.z, self.cy))

    def face(self, x, z):
        """Front surface y at lateral offset ``x``.

        Features have to be parked against the surface they actually sit on.
        Using the median front instead makes a cheekbone bulge tens of
        millimetres proud of the cheek and welds the whole face into one raised
        plate with a hard rim -- the classic "mask on a box" look.
        """
        rx = self.width(z)
        e = float(np.interp(z, self.z, self.ex))
        ryf = float(np.interp(z, self.z, self.ryf))
        t = min(abs(x) / max(rx, 1e-6), 1.0)
        v = (1.0 - t ** e) ** (1.0 / e)
        return self.centre(z) - v * ryf

    def nape(self, x, z):
        """Back surface y at lateral offset ``x``."""
        rx = self.width(z)
        e = float(np.interp(z, self.z, self.ex))
        ryb = float(np.interp(z, self.z, self.ryb))
        t = min(abs(x) / max(rx, 1e-6), 1.0)
        v = (1.0 - t ** e) ** (1.0 / e)
        return self.centre(z) + v * ryb


# Transverse sections of the skull: (t, half width / hw, front y / hd, back y / hd).
# Front and back are absolute surface positions rather than radii, which is how
# a profile is actually judged -- the facial angle falls straight out of the table.
_SKULL = [
    (0.000, 0.22, -0.42, 0.20),
    (0.055, 0.38, -0.72, 0.42),
    (0.115, 0.53, -0.80, 0.62),
    (0.175, 0.63, -0.83, 0.75),
    (0.245, 0.70, -0.86, 0.85),
    (0.350, 0.78, -0.89, 0.93),
    (0.440, 0.85, -0.90, 0.98),
    (0.530, 0.90, -0.90, 1.01),
    (0.600, 0.92, -0.91, 1.02),
    (0.680, 0.96, -0.88, 1.01),
    (0.750, 0.99, -0.83, 0.97),
    (0.840, 0.96, -0.72, 0.89),
    (0.900, 0.88, -0.61, 0.77),
    (0.950, 0.72, -0.46, 0.59),
    (0.980, 0.48, -0.31, 0.40),
    (1.000, 0.18, -0.12, 0.15),
]


def skull_sections(P: Proportions):
    H = P.height
    hw = P.head_w * H
    hd = P.head_d * H
    zc = P.z_chin * H
    hh = (1.0 - P.z_chin) * H
    youth = 1.0 if P.sex == "c" else 0.0
    out = []
    for t, fx, front, back in _SKULL:
        if youth:  # a child's face fills less of a proportionally larger cranium
            fx = fx ** (1.0 - 0.20 * (1.0 - t))
            front *= 1.0 - 0.07 * (1.0 - t)
        f0 = front * hd
        b0 = back * hd
        r = 0.5 * (b0 - f0)
        ryf, ryb = r * 0.92, r * 1.08
        out.append((zc + t * hh, fx * hw, ryf, ryb, f0 + ryf, 2.02 + 0.10 * t))
    return out


def build_head(f: sdf.Field, P: Proportions, torso_prof):
    H = P.height
    hw = P.head_w * H
    hd = P.head_d * H
    zc = P.z_chin * H
    hh = (1.0 - P.z_chin) * H
    u = hh / 0.243          # feature scale: 1.0 for an adult male head
    youth = 1.0 if P.sex == "c" else 0.0
    sag = P.sag
    male = P.sex == "m"

    def Z(t):
        return zc + t * hh

    secs = skull_sections(P)
    prof = Profile(secs)
    fy = prof.front
    by = prof.back

    def sy(x, t):
        """Front surface y at lateral offset ``x`` and canon height ``t``."""
        return prof.face(x, Z(t))

    def ny(x, t):
        return prof.nape(x, Z(t))

    def project(p, d):
        """Slide ``p`` onto whatever surface the field currently has, along ``d``."""
        p = np.asarray(p, np.float64).copy()
        d = np.asarray(d, np.float64)
        d = d / np.linalg.norm(d)
        for _ in range(5):
            p -= d * float(sdf.eval_points(f, p[None, :])[0])
        return p

    def groove(x, t, r, depth, d=(0.0, -1.0, 0.0)):
        """Cutter centre for a radius-``r`` cutter biting ``depth`` into the face.

        Two rules matter here.  The cutter has to be measured against the surface
        that actually exists at this point in the program -- brows, cheeks, chin
        and lips have already been fused on top of the skull loft, so the loft's
        own surface is metres of nothing to do with the skin.  And the centre must
        stay closer to that surface than its own radius, or it stops carving a
        crease and hollows out a cavity under the skin instead.
        """
        p = project((x, sy(x, t), Z(t)), d)
        return tuple(p + np.asarray(d, np.float64) / np.linalg.norm(d)
                     * -max(r - depth, 0.25 * r))

    f.add(sdf.Loft(secs, cap_blend=0.020 * u), k=0.055 * H)

    # ---- brow ridge and forehead ----------------------------------------- #
    f.addk(
        sdf.Ellipsoid((hw * 0.30, sy(hw * 0.30, 0.596) + 0.004 * u, Z(0.594)),
                      (0.017 * u, (0.0090 - 0.002 * youth) * u, 0.0065 * u)),
        k=0.019 * u,
        mirror=True,
    )
    f.addk(  # tail of the ridge running out to the temple
        sdf.Ellipsoid((hw * 0.66, sy(hw * 0.66, 0.585) + 0.005 * u, Z(0.586)),
                      (0.012 * u, 0.0090 * u, 0.0055 * u)),
        k=0.018 * u,
        mirror=True,
    )
    f.subk(  # glabella
        sdf.Ball(groove(0.0, 0.612, 0.009 * u, 0.0025 * u), 0.009 * u), k=0.010 * u
    )
    if sag > 0.0:  # frontalis furrows
        for zt in (0.665, 0.700):
            f.subk(
                sdf.Capsule(_shift(groove(0.0, zt, 0.0035 * u, 0.0012 * u), -0.028 * u),
                            _shift(groove(0.0, zt, 0.0035 * u, 0.0012 * u), 0.028 * u),
                            0.0035 * u),
                k=0.004 * u,
            )

    # ---- muzzle: the maxillary mass the mouth sits on --------------------- #
    f.addk(
        sdf.Ellipsoid((0.0, fy(Z(0.290)) + 0.019 * u, Z(0.283)),
                      (0.028 * u, 0.017 * u, 0.031 * u)),
        k=0.024 * u,
    )
    f.addk(  # masseter / lower cheek plane
        sdf.Ellipsoid((hw * 0.60, sy(hw * 0.60, 0.230) + 0.014 * u, Z(0.240)),
                      (0.013 * u, 0.020 * u, 0.026 * u)),
        k=0.024 * u,
        mirror=True,
    )

    # ---- cheek bones, cheeks, temples ------------------------------------ #
    f.addk(
        sdf.Ellipsoid((hw * 0.72, sy(hw * 0.72, 0.465) + 0.004 * u, Z(0.462)),
                      (0.021 * u, 0.011 * u, 0.013 * u)),
        k=0.026 * u,
        mirror=True,
    )
    if P.softness > 0.4 or youth:
        f.addk(
            sdf.Ellipsoid((hw * 0.62, sy(hw * 0.62, 0.340) + 0.006 * u, Z(0.340 + 0.02 * youth)),
                          (0.020 * u * (1 + 0.2 * youth), 0.014 * u, 0.020 * u)),
            k=0.016 * u,
            mirror=True,
        )

    # ---- mandible -------------------------------------------------------- #
    jaw_pts = [
        (hw * 0.56, ny(hw * 0.56, 0.175) - 0.012 * u, Z(0.170)),
        (hw * 0.52, 0.5 * (sy(hw * 0.52, 0.115) + ny(hw * 0.52, 0.115)), Z(0.112)),
        (hw * 0.36, sy(hw * 0.36, 0.080) + 0.014 * u, Z(0.076)),
        (hw * 0.11, sy(hw * 0.11, 0.062) + 0.008 * u, Z(0.062)),
    ]
    for a, b in zip(jaw_pts[:-1], jaw_pts[1:]):
        f.addk(sdf.Capsule(a, b, (0.0115 - 0.002 * youth) * u), k=0.016 * u, mirror=True)
    if male:  # squarer gonial angle
        f.addk(
            sdf.Ellipsoid((hw * 0.58, ny(hw * 0.58, 0.150) - 0.013 * u, Z(0.140)),
                          (0.010 * u, 0.014 * u, 0.014 * u)),
            k=0.013 * u,
            mirror=True,
        )
    chin_w = (0.0170 if male else 0.0145) * u * (1.0 - 0.12 * youth)
    f.addk(
        sdf.Ellipsoid((0.0, fy(Z(0.072)) - 0.004 * u, Z(0.074)),
                      (chin_w, 0.011 * u, 0.015 * u)),
        k=0.014 * u,
    )
    f.addk(  # submental shelf so the chin has an underside
        sdf.Capsule((hw * 0.30, sy(hw * 0.30, 0.045) + 0.011 * u, Z(0.038)),
                    (-hw * 0.30, sy(hw * 0.30, 0.045) + 0.011 * u, Z(0.038)), 0.009 * u),
        k=0.014 * u,
    )
    f.subk(  # mentolabial sulcus
        sdf.Capsule(_shift(groove(0.0, 0.158, 0.0055 * u, 0.0020 * u), 0.014 * u),
                    _shift(groove(0.0, 0.158, 0.0055 * u, 0.0020 * u), -0.014 * u),
                    0.0055 * u),
        k=0.007 * u,
    )
    if sag > 0.0:
        f.addk(  # jowl
            sdf.Ellipsoid((hw * 0.76, sy(hw * 0.76, 0.130) + 0.008 * u, Z(0.115)),
                          (0.013 * u, 0.014 * u, 0.014 * u)),
            k=0.014 * u,
            mirror=True,
        )

    # ---- nose ------------------------------------------------------------ #
    ns = (1.0 - 0.22 * youth) * u
    f.addk(  # dorsum
        sdf.RoundCone((0.0, fy(Z(0.600)) + 0.006 * u, Z(0.600)),
                      (0.0, fy(Z(0.394)) - 0.009 * ns, Z(0.392)),
                      0.0055 * ns, 0.0085 * ns),
        k=0.011 * u,
    )
    tip = (0.0, fy(Z(0.382)) - 0.015 * ns, Z(0.368))
    f.addk(sdf.Ellipsoid(tip, (0.0092 * ns, 0.0100 * ns, 0.0080 * ns)), k=0.009 * u)
    f.addk(  # alae
        sdf.Ellipsoid((0.0098 * ns, fy(Z(0.360)) - 0.005 * ns, Z(0.354)),
                      (0.0074 * ns, 0.0082 * ns, 0.0064 * ns)),
        k=0.0065 * u,
        mirror=True,
    )
    f.subk(  # nostrils
        sdf.Ellipsoid((0.0076 * ns, fy(Z(0.350)) - 0.010 * ns, Z(0.342)),
                      (0.0030 * ns, 0.0046 * ns, 0.0036 * ns)),
        k=0.0028 * u,
        mirror=True,
    )
    f.subk(  # alar crease
        sdf.Capsule((0.0130 * ns, fy(Z(0.368)) + 0.0018 * ns, Z(0.372)),
                    (0.0098 * ns, fy(Z(0.340)) + 0.0060 * ns, Z(0.336)), 0.0034 * u),
        k=0.005 * u,
        mirror=True,
    )
    f.subk(  # columella / septum notch
        sdf.Ball((0.0, fy(Z(0.345)) - 0.0035 * ns, Z(0.336)), 0.0030 * u), k=0.004 * u
    )

    # ---- mouth ----------------------------------------------------------- #
    lip_w = (0.0255 if male else 0.0235) * u * (1.0 - 0.16 * youth)
    thin = 1.0 - 0.30 * sag
    zu, zl = Z(0.252), Z(0.228)
    f.addk(
        sdf.Ellipsoid((0.0, fy(zu) - 0.0018 * u, zu),
                      (lip_w, 0.0068 * u, 0.0052 * u * thin)),
        k=0.0060 * u,
    )
    f.addk(
        sdf.Ellipsoid((0.0, fy(zl) - 0.0024 * u, zl),
                      (lip_w * 0.92, 0.0076 * u, 0.0062 * u * thin)),
        k=0.0065 * u,
    )
    f.subk(  # lip line
        sdf.Ellipsoid(groove(0.0, 0.240, 0.0090 * u, 0.0030 * u),
                      (lip_w * 1.14, 0.0090 * u, 0.0016 * u)),
        k=0.0030 * u,
    )
    f.subk(  # philtrum
        sdf.Capsule(groove(0.0, 0.292, 0.0028 * u, 0.0010 * u),
                    groove(0.0, 0.272, 0.0028 * u, 0.0012 * u), 0.0028 * u),
        k=0.0040 * u,
    )
    f.subk(  # mouth corners
        sdf.Ball(groove(lip_w, 0.246, 0.0034 * u, 0.0016 * u), 0.0034 * u),
        k=0.0060 * u,
        mirror=True,
    )
    if sag > 0.2:  # nasolabial fold
        f.subk(
            sdf.Capsule((0.0125 * u, fy(Z(0.345)) + 0.002 * u, Z(0.342)),
                        (0.0205 * u, fy(Z(0.230)) + 0.010 * u, Z(0.212)), 0.0050 * u),
            k=0.0075 * u,
            mirror=True,
        )

    # ---- eyes ------------------------------------------------------------ #
    eye_r = EYE_RADIUS * (0.97 if P.sex == "c" else 1.0)
    eye_x = 0.0315 * u
    eye_z = Z(0.530)
    eye_y = sy(eye_x, 0.530) + eye_r * 0.62
    f.subk(  # orbital hollow, carved before the lids are laid over the globe
        sdf.Ellipsoid((eye_x, sy(eye_x, 0.530) + 0.005 * u, eye_z + 0.001 * u),
                      (eye_r * 1.45, eye_r * 0.95, eye_r * 1.25)),
        k=0.012 * u,
        mirror=True,
    )
    f.addk(  # lids wrapping the globe
        sdf.Ellipsoid((eye_x, eye_y + 0.0012 * u, eye_z),
                      (eye_r * 1.50, eye_r * 1.12, eye_r * 1.14)),
        k=0.009 * u,
        mirror=True,
    )
    slit_z = eye_z - eye_r * (0.16 + 0.10 * sag)
    f.subk(  # palpebral fissure
        sdf.Ellipsoid((eye_x, eye_y - eye_r * 0.58, slit_z),
                      (eye_r * 1.32, eye_r * 0.95, eye_r * (0.43 - 0.10 * sag))),
        k=0.0022 * u,
        mirror=True,
    )
    f.addk(  # lower lid ridge
        sdf.Capsule((eye_x - eye_r * 0.80, eye_y - eye_r * 0.76, eye_z - eye_r * 0.60),
                    (eye_x + eye_r * 0.80, eye_y - eye_r * 0.66, eye_z - eye_r * 0.56),
                    0.0020 * u),
        k=0.0045 * u,
        mirror=True,
    )
    f.subk(  # crease above the lid
        sdf.Capsule((eye_x - eye_r * 0.70, eye_y - eye_r * 0.70, eye_z + eye_r * 0.78),
                    (eye_x + eye_r * 0.80, eye_y - eye_r * 0.55, eye_z + eye_r * 0.72),
                    0.0022 * u),
        k=0.0032 * u,
        mirror=True,
    )
    if sag > 0.0:
        f.subk(
            sdf.Capsule((eye_x + eye_r * 1.30, eye_y - eye_r * 0.45, eye_z + eye_r * 0.30),
                        (eye_x + eye_r * 1.85, eye_y - eye_r * 0.15, eye_z + eye_r * 0.05),
                        0.0020 * u),
            k=0.0030 * u,
            mirror=True,
        )

    # ---- ears ------------------------------------------------------------ #
    # the auricle has to clear the skull wall, or it reads as a dent
    ear_x = prof.width(Z(0.450)) * 1.10
    ear_y = 0.5 * (fy(Z(0.450)) + by(Z(0.450))) + 0.002 * u
    ear_z = Z(0.435)
    ear_h = 0.029 * u
    tilt = np.deg2rad(14.0)

    def ear_put(prim, k, sub=False):
        t = sdf.Transformed(prim, euler=(tilt, 0.0, 0.0), pivot=(ear_x, ear_y, ear_z))
        (f.subk if sub else f.addk)(t, k=k, mirror=True)

    ear_put(sdf.Ellipsoid((ear_x, ear_y, ear_z), (0.0030 * u, ear_h * 0.56, ear_h)), 0.009 * u)
    ang = np.linspace(-1.65, 2.25, 10)
    pts = [
        (ear_x + 0.0022 * u, ear_y - np.sin(a) * ear_h * 0.50, ear_z + np.cos(a) * ear_h * 0.86)
        for a in ang
    ]
    for a, b in zip(pts[:-1], pts[1:]):
        ear_put(sdf.Capsule(a, b, 0.0034 * u), 0.0030 * u)
    ear_put(  # antihelix
        sdf.Capsule((ear_x + 0.0016 * u, ear_y - ear_h * 0.10, ear_z + ear_h * 0.40),
                    (ear_x + 0.0016 * u, ear_y - ear_h * 0.20, ear_z - ear_h * 0.35),
                    0.0024 * u),
        0.0030 * u,
    )
    ear_put(  # concha
        sdf.Ellipsoid((ear_x + 0.0030 * u, ear_y + 0.0020 * u, ear_z + ear_h * 0.02),
                      (0.0032 * u, ear_h * 0.24, ear_h * 0.36)),
        0.0032 * u,
        sub=True,
    )
    ear_put(
        sdf.Ellipsoid((ear_x, ear_y - ear_h * 0.10, ear_z - ear_h * 0.88),
                      (0.0030 * u, 0.0050 * u, 0.0062 * u)),
        0.0045 * u,
    )
    ear_put(  # crease where the auricle leaves the skull
        sdf.Capsule((ear_x - 0.006 * u, ear_y + 0.009 * u, ear_z + ear_h * 0.62),
                    (ear_x - 0.006 * u, ear_y + 0.009 * u, ear_z - ear_h * 0.55),
                    0.0026 * u),
        0.0034 * u,
        sub=True,
    )

    return {
        "eye_centre": (eye_x, eye_y, eye_z),
        "eye_radius": eye_r,
        "head_centre": (0.0, 0.5 * (fy(Z(0.6)) + by(Z(0.6))), Z(0.60)),
        "head_size": (hw, hd, hh),
        "head_profile": prof,
        "chin_z": zc,
        "hair_z": Z(0.79),
        "brow": (eye_x, fy(Z(0.598)), Z(0.598)),
        "lip": (0.0, fy(Z(0.244)), Z(0.244)),
        "nose_tip": tip,
        "ear": (ear_x, ear_y, ear_z),
        "top": Z(1.0),
        "unit": u,
    }
