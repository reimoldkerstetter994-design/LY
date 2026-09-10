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
    (0.245, 0.65, -0.86, 0.85),
    (0.350, 0.72, -0.89, 0.93),
    (0.440, 0.80, -0.90, 0.98),
    (0.530, 0.85, -0.90, 1.01),
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
        own surface has nothing to do with the skin any more.  And the centre goes
        ``r - depth`` *outside* that surface: a sphere centred outside removes a
        cap (r - c) deep, whereas one centred inside removes (r + c), so putting
        it inside turns every crease into a gouge.
        """
        p = project((x, sy(x, t), Z(t)), d)
        return tuple(p + np.asarray(d, np.float64) / np.linalg.norm(d)
                     * max(r - depth, 0.0))

    def fyp(t, x=0.0):
        """Front y of the surface as built so far, not of the bare skull loft.

        The nose, lips and chin are fused on after the brow, muzzle and mandible,
        so measuring their projection from the loft leaves them half buried.
        """
        return float(project((x, sy(x, t), Z(t)), (0.0, -1.0, 0.0))[1])

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
        sdf.Ellipsoid((hw * 0.72, sy(hw * 0.72, 0.465) + 0.010 * u, Z(0.462)),
                      (0.024 * u, 0.017 * u, 0.016 * u)),
        k=0.032 * u,
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
        sdf.Ellipsoid((0.0, fyp(0.074) + 0.005 * u, Z(0.074)),
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
    # Nasal projection is measured forward from the mid-face plane: about 23 mm
    # at the tip on an adult, which is much more than it looks like in a table
    # of small offsets.  Too little and the nose vanishes into the cheeks.
    ns = (1.0 - 0.22 * youth) * u
    base = fyp(0.372)
    f.addk(  # dorsum, from the nasion down to just above the tip
        sdf.RoundCone((0.0, fyp(0.600) + 0.005 * u, Z(0.600)),
                      (0.0, base - 0.0150 * ns, Z(0.400)),
                      0.0050 * ns, 0.0084 * ns),
        k=0.011 * u,
    )
    tip = (0.0, base - 0.0224 * ns, Z(0.366))
    f.addk(sdf.Ellipsoid(tip, (0.0092 * ns, 0.0104 * ns, 0.0086 * ns)), k=0.009 * u)
    f.addk(  # alae
        sdf.Ellipsoid((0.0104 * ns, base - 0.0118 * ns, Z(0.352)),
                      (0.0078 * ns, 0.0088 * ns, 0.0066 * ns)),
        k=0.0065 * u,
        mirror=True,
    )
    f.addk(  # columella between the nostrils
        sdf.Capsule((0.0, base - 0.0175 * ns, Z(0.360)),
                    (0.0, base - 0.0105 * ns, Z(0.344)), 0.0032 * ns),
        k=0.004 * u,
    )
    f.subk(  # nostrils: they open downwards, so barely show from the front
        sdf.Transformed(
            sdf.Ellipsoid((0.0068 * ns, base - 0.0150 * ns, Z(0.3395)),
                          (0.0023 * ns, 0.0046 * ns, 0.0025 * ns)),
            euler=(np.deg2rad(-38.0), 0.0, 0.0),
            pivot=(0.0068 * ns, base - 0.0150 * ns, Z(0.3395)),
        ),
        k=0.0022 * u,
        mirror=True,
    )
    f.subk(  # alar crease
        sdf.Capsule((0.0146 * ns, base - 0.0086 * ns, Z(0.370)),
                    (0.0112 * ns, base - 0.0026 * ns, Z(0.336)), 0.0034 * u),
        k=0.005 * u,
        mirror=True,
    )
    f.subk(  # supratip break, the small dip above the tip
        sdf.Ball((0.0, base - 0.0072 * ns, Z(0.394)), 0.0060 * u), k=0.006 * u
    )

    # ---- mouth ----------------------------------------------------------- #
    # A pair of wide ellipsoids with a straight slot cut across them reads as a
    # letterbox.  The vermilion is built instead as a row of beads whose height,
    # projection and radius all fall away towards the corners, which is what puts
    # a cupid's bow on the upper lip and tucks the corners back into the cheek.
    lip_w = (0.0255 if male else 0.0235) * u * (1.0 - 0.16 * youth)
    thin = 1.0 - 0.30 * sag
    zm = 0.242
    lip_y = fyp(zm)
    # a mound of maxilla behind the vermilion, so the lip line has something to
    # be cut into instead of perforating a thin shell
    f.addk(
        sdf.Ellipsoid((0.0, lip_y + 0.0130 * u, Z(zm)),
                      (lip_w * 1.30, 0.0140 * u, 0.0170 * u)),
        k=0.014 * u,
    )

    def vermilion(row, sign):
        # (x / lip_w, height above the mouth line, forward projection, radius).
        # The two rows have to overlap across the mouth line: leave even half a
        # millimetre of daylight and the line cutter goes straight through the
        # lips and out the other side.
        for xf, dz, out, r in row:
            f.addk(
                sdf.Ellipsoid(
                    (xf * lip_w, lip_y + 0.0052 * u - out * u,
                     Z(zm) + sign * dz * u * thin),
                    (r * 1.45 * u, 0.0086 * u, r * 1.20 * u * thin),
                ),
                k=0.0026 * u,
                mirror=(xf > 0.0),
            )

    vermilion([(0.00, 0.0028, 0.0056, 0.0038),
               (0.28, 0.0036, 0.0054, 0.0036),
               (0.55, 0.0027, 0.0042, 0.0031),
               (0.79, 0.0013, 0.0024, 0.0025)], +1.0)
    vermilion([(0.00, 0.0040, 0.0066, 0.0044),
               (0.30, 0.0038, 0.0061, 0.0041),
               (0.58, 0.0029, 0.0045, 0.0033),
               (0.81, 0.0015, 0.0023, 0.0025)], -1.0)

    # The mouth line is one shallow slot, curved down towards the corners.  Its
    # depth is worked out from the vermilion crest arithmetically rather than by
    # projecting onto the surface: the junction is a concave saddle, where a
    # fixed-direction Newton march wanders and leaves the cut ragged.
    crest = lip_y - 0.0090 * u
    seam = [(0.00, 0.0006), (0.34, 0.0009), (0.64, 0.0000), (0.90, -0.0020)]
    pts = [(xf * lip_w, crest + (0.0024 - 0.0012 + 0.0024 * xf * xf) * u,
            Z(zm) + dz * u) for xf, dz in seam]
    for a, b in zip(pts[:-1], pts[1:]):
        f.subk(sdf.Capsule(a, b, 0.0024 * u), k=0.0014 * u, mirror=True)

    f.subk(  # philtrum
        sdf.Capsule(groove(0.0, 0.300, 0.0030 * u, 0.0013 * u),
                    groove(0.0, 0.276, 0.0030 * u, 0.0017 * u), 0.0030 * u),
        k=0.0042 * u,
    )
    f.addk(  # philtral columns flanking it
        sdf.Capsule((0.0044 * u, fyp(0.298, 0.0044 * u) + 0.0022 * u, Z(0.298)),
                    (0.0052 * u, fyp(0.272, 0.0052 * u) + 0.0026 * u, Z(0.272)),
                    0.0018 * u),
        k=0.0035 * u,
        mirror=True,
    )
    f.subk(  # mouth corners tuck back into the cheek
        sdf.Ball((lip_w * 1.00, crest + 0.0044 * u, Z(zm) - 0.0016 * u), 0.0034 * u),
        k=0.0038 * u,
        mirror=True,
    )
    if sag > 0.2:  # nasolabial fold
        f.subk(
            sdf.Capsule(groove(0.0135 * u, 0.330, 0.0050 * u, 0.0026 * u),
                        groove(0.0215 * u, 0.212, 0.0050 * u, 0.0036 * u), 0.0050 * u),
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
    # The auricle must be rooted a few millimetres *inside* the skull wall.  Sat
    # entirely outside it, only the fillet holds it on and it reads as a flap
    # stuck to the head, with the lobule trailing off as a separate drip.
    skull_x = prof.width(Z(0.470))
    ear_x = skull_x + 0.003 * u
    ear_y = 0.5 * (fy(Z(0.470)) + by(Z(0.470))) - 0.005 * u
    ear_z = Z(0.470)
    ear_h = 0.029 * u
    tilt = np.deg2rad(14.0)

    def ear_put(prim, k, sub=False):
        t = sdf.Transformed(prim, euler=(tilt, 0.0, 0.0), pivot=(ear_x, ear_y, ear_z))
        (f.subk if sub else f.addk)(t, k=k, mirror=True)

    ear_put(  # the shell of the auricle
        sdf.Ellipsoid((ear_x, ear_y, ear_z - ear_h * 0.05),
                      (0.0070 * u, ear_h * 0.50, ear_h * 0.95)),
        0.007 * u,
    )
    # helix: emerges at the front, sweeps over the top and down the back
    ang = np.linspace(0.32, 4.55, 13)
    rim = [
        (ear_x + 0.0030 * u,
         ear_y - np.cos(a) * ear_h * 0.44,
         ear_z + np.sin(a) * ear_h * 0.82)
        for a in ang
    ]
    for a, b in zip(rim[:-1], rim[1:]):
        ear_put(sdf.Capsule(a, b, 0.0032 * u), 0.0026 * u)
    ear_put(  # lobule, hanging off the end of the helix
        sdf.Ellipsoid((ear_x + 0.0006 * u, ear_y - ear_h * 0.06, ear_z - ear_h * 0.84),
                      (0.0044 * u, 0.0052 * u, 0.0058 * u)),
        0.0040 * u,
    )
    ear_put(  # antihelix
        sdf.Capsule((ear_x + 0.0020 * u, ear_y - ear_h * 0.08, ear_z + ear_h * 0.44),
                    (ear_x + 0.0020 * u, ear_y - ear_h * 0.18, ear_z - ear_h * 0.30),
                    0.0026 * u),
        0.0026 * u,
    )
    ear_put(  # tragus
        sdf.Ellipsoid((ear_x + 0.0018 * u, ear_y - ear_h * 0.38, ear_z - ear_h * 0.20),
                      (0.0026 * u, 0.0028 * u, 0.0040 * u)),
        0.0026 * u,
    )
    ear_put(  # concha
        sdf.Ellipsoid((ear_x + 0.0044 * u, ear_y - ear_h * 0.06, ear_z - ear_h * 0.04),
                      (0.0036 * u, ear_h * 0.20, ear_h * 0.30)),
        0.0028 * u,
        sub=True,
    )
    ear_put(  # crease where the auricle leaves the skull
        sdf.Capsule((ear_x - 0.0058 * u, ear_y + 0.008 * u, ear_z + ear_h * 0.58),
                    (ear_x - 0.0058 * u, ear_y + 0.008 * u, ear_z - ear_h * 0.50),
                    0.0024 * u),
        0.0030 * u,
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
