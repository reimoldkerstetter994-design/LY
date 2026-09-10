"""Assemble a whole body as one implicit field.

The construction mirrors how a sculptor blocks in a figure: first the torso
volume as a lofted cross-section stack, then the muscle masses smoothly fused
on top of it, then the creases (linea alba, spine groove, gluteal cleft,
inguinal folds) carved back out.  Limbs are tapered capsule chains with muscle
bellies attached at anatomically sensible fractions of their length.
"""

from __future__ import annotations

import numpy as np

from . import sdf
from .proportions import Proportions


def lerp(a, b, t):
    a = np.asarray(a, np.float64)
    b = np.asarray(b, np.float64)
    return a + (b - a) * t


def _rotz(prim, angle, pivot):
    return sdf.Transformed(prim, euler=(0.0, 0.0, angle), pivot=pivot)


def _rotx(prim, angle, pivot):
    return sdf.Transformed(prim, euler=(angle, 0.0, 0.0), pivot=pivot)


def front_groove(prof, z, r, depth, bulge=0.0, x=0.0):
    """Centre y for a cutter of radius r that leaves a groove `depth` deep.

    The centre must stay closer to the skin than its own radius, otherwise the
    cutter carves a sealed cavity and leaves a paper-thin wall behind.  `bulge`
    accounts for muscle volume fused in front of the lofted torso, and `x` for
    how far the torso has already curved away at that lateral offset.
    """
    return prof.front_at(x, z) - bulge + max(r - depth, 0.15 * r)


def back_groove(prof, z, r, depth, bulge=0.0, x=0.0):
    return prof.back_at(x, z) + bulge - max(r - depth, 0.15 * r)


class TorsoProfile:
    """Interpolators for the lofted torso, used to park details on its skin."""

    def __init__(self, sections):
        s = sorted(sections, key=lambda r: r[0])
        self.z = np.array([r[0] for r in s])
        self.rx = np.array([r[1] for r in s])
        self.ryf = np.array([r[2] for r in s])
        self.ryb = np.array([r[3] for r in s])
        self.cy = np.array([r[4] for r in s])
        self.ex = np.array([r[5] for r in s])
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

    def half_width(self, z):
        return float(np.interp(z, self.z, self.rx))

    def centre(self, z):
        return float(np.interp(z, self.z, self.cy))

    def _lateral(self, x, z):
        rx = self.half_width(z)
        e = float(np.interp(z, self.z, self.ex))
        t = min(abs(float(x)) / max(rx, 1e-6), 1.0)
        return (1.0 - t ** e) ** (1.0 / e)

    def front_at(self, x, z):
        """Front surface y at lateral offset `x`.

        A pectoral or a rectus pad parked at the median front pokes right out
        of the skin once it is mirrored out to the side, which is what turns it
        into a raised plate with a hard rim instead of a muscle under skin.
        """
        return self.centre(z) - self._lateral(x, z) * float(
            np.interp(z, self.z, self.ryf))

    def back_at(self, x, z):
        return self.centre(z) + self._lateral(x, z) * float(
            np.interp(z, self.z, self.ryb))


# --------------------------------------------------------------------------- #
def torso_sections(P: Proportions):
    H = P.height
    sway = P.spine_sway / 0.010
    # (z, half width, front depth, back depth, y centre, exponent)
    raw = [
        (P.z_pelvic_floor, P.pelvis_w, P.pelvis_f, P.pelvis_b, 0.0045 * sway, P.torso_exp + 0.2),
        (P.z_hip, P.hip_w, P.hip_f, P.hip_b, 0.0055 * sway, P.torso_exp + 0.15),
        (0.5 * (P.z_hip + P.z_iliac), 0.5 * (P.hip_w + P.iliac_w) + 0.002,
         0.5 * (P.hip_f + P.iliac_f), 0.5 * (P.hip_b + P.iliac_b), 0.0035 * sway, P.torso_exp),
        (P.z_iliac, P.iliac_w, P.iliac_f, P.iliac_b, 0.0005 * sway, P.torso_exp - 0.1),
        (P.z_waist, P.waist_w, P.waist_f, P.waist_b, -0.0035 * sway, P.torso_exp - 0.15),
        (P.z_ribs, P.ribs_w, P.ribs_f, P.ribs_b, -0.0025 * sway, P.torso_exp),
        (0.5 * (P.z_ribs + P.z_nipple), 0.5 * (P.ribs_w + P.chest_w),
         0.5 * (P.ribs_f + P.chest_f) + 0.001, 0.5 * (P.ribs_b + P.chest_b),
         -0.0035 * sway, P.torso_exp + 0.15),
        (P.z_nipple + 0.012, P.chest_w, P.chest_f, P.chest_b, -0.004 * sway, P.torso_exp + 0.2),
        # The ribcage must not narrow again on its way to the shoulders: any dip
        # here shows up as a horizontal groove ringing the whole chest.
        (P.z_armpit + 0.012, P.chest_w + 0.002, P.chest_f - 0.005, P.chest_b + 0.001,
         -0.002 * sway, P.torso_exp + 0.1),
        (P.z_acromion - 0.004, P.girdle_w, P.girdle_f, P.girdle_b, 0.0015 * sway, P.torso_exp),
        # eased shoulder-to-neck step, otherwise the loft overshoots and leaves a
        # collar-shaped ridge across the top of the chest
        (0.5 * (P.z_acromion + P.z_neck), P.girdle_w * 0.87, P.girdle_f * 0.88,
         P.girdle_b * 0.95, 0.003 * sway, P.torso_exp - 0.1),
        (P.z_neck + 0.004, P.girdle_w * 0.70, P.girdle_f * 0.72, P.girdle_b * 0.86,
         0.004 * sway, P.torso_exp - 0.2),
    ]
    return [(z * H, rx * H, f * H, b * H, cy * H, e) for z, rx, f, b, cy, e in raw]


def build_torso(f: sdf.Field, P: Proportions, prof: TorsoProfile):
    H = P.height
    soft = P.softness
    mus = P.muscle

    f.add(sdf.Loft(torso_sections(P), cap_blend=0.05 * H))

    # ---- belly / love handles -------------------------------------------- #
    if P.belly > 0.0:
        zb = 0.5 * (P.z_iliac + P.z_waist) * H
        r = P.belly * H
        f.add(
            sdf.Ellipsoid(
                (0.0, prof.front(zb) + 0.55 * r + 0.010 * H, zb - 0.010 * H),
                (r * 2.5, r * 1.5, r * 2.1),
            ),
            k=0.075 * H,
        )
        f.add(
            sdf.Ellipsoid(
                (prof.half_width(zb) * 0.86, prof.centre(zb) + 0.006 * H, zb + 0.006 * H),
                (r * 1.5, r * 1.9, r * 1.5),
            ),
            k=0.06 * H,
            mirror=True,
        )

    # ---- buttocks -------------------------------------------------------- #
    zg = (P.z_crotch + 0.042 - 0.020 * P.sag) * H
    gr = P.glute_r * H
    f.add(
        sdf.Ellipsoid(
            (0.046 * H, prof.back(zg) - 0.66 * gr, zg),
            (gr * 0.90, gr * 0.78, gr * 1.00 + 0.006 * H * P.sag),
        ),
        k=0.060 * H,
        mirror=True,
    )
    # gluteal cleft
    f.sub(
        sdf.Capsule(
            (0.0, prof.back(zg) - 0.16 * gr, (P.z_crotch - 0.006) * H),
            (0.0, prof.back(zg) - 0.30 * gr, zg + 0.55 * gr),
            0.014 * H,
        ),
        k=0.022 * H,
    )
    # gluteal fold underneath
    f.sub(
        sdf.Capsule(
            (0.018 * H, prof.back(zg) + 0.95 * gr, (P.z_crotch - 0.004) * H),
            (0.070 * H, prof.back(zg) + 0.80 * gr, (P.z_crotch + 0.004) * H),
            0.013 * H,
        ),
        k=0.030 * H,
        mirror=True,
    )

    # ---- chest ----------------------------------------------------------- #
    zn = P.z_nipple * H
    if P.breast > 0.0:
        br = P.breast * H
        cz = zn - 0.004 * H - P.breast_drop * H - 0.014 * H * P.sag
        cx = 0.048 * H
        # The mass has to sit *into* the chest wall: an ellipsoid parked in front
        # of the loft surface projects like a bolted-on sphere.
        cy = prof.front_at(cx, cz) - 0.16 * br
        f.add(sdf.Ellipsoid((cx, cy, cz), (br * 1.02, br * 0.98, br * 1.02)),
              k=0.090 * H, mirror=True)
        # lower pole carries most of the volume, which is what makes a teardrop
        f.add(
            sdf.Ellipsoid((cx - 0.002 * H, cy + 0.12 * br, cz - 0.46 * br),
                          (br * 0.84, br * 0.84, br * 0.58)),
            k=0.060 * H,
            mirror=True,
        )
        # flatten the upper pole: a breast slopes away from the collarbone
        f.sub(
            sdf.Ellipsoid((cx, cy - 0.62 * br, cz + 1.30 * br),
                          (br * 1.30, br * 0.70, br * 0.80)),
            k=0.055 * H,
            mirror=True,
        )
        npt = (cx + 0.004 * H, cy - 0.90 * br, cz - 0.26 * br)
        f.add(sdf.Ellipsoid(npt, (0.011 * H, 0.005 * H, 0.011 * H)), k=0.018 * H,
              mirror=True)   # areola
        f.add(sdf.Ellipsoid(npt, (0.0040 * H, 0.0042 * H, 0.0040 * H)), k=0.005 * H,
              mirror=True)
        # inframammary fold
        f.sub(
            sdf.Capsule(
                (cx - 0.024 * H, cy - 0.40 * br, cz - 1.02 * br),
                (cx + 0.028 * H, cy - 0.26 * br, cz - 0.94 * br),
                0.008 * H,
            ),
            k=0.030 * H,
            mirror=True,
        )
    else:
        pz = zn + 0.019 * H - 0.012 * H * P.sag
        px = 0.046 * H
        # A thin pancake fused onto the ribcage meets it at too steep an angle
        # and leaves a rim like a breastplate.  A fatter ellipsoid sunk into the
        # chest shows only its crown, so the pectoral emerges as a soft dome.
        f.add(
            sdf.Ellipsoid(
                (px, prof.front_at(px, pz) + (0.013 + 0.004 * mus) * H, pz),
                ((0.056 + 0.004 * mus) * H, (0.021 + 0.008 * mus) * H,
                 (0.033 + 0.005 * mus) * H),
            ),
            k=(0.070 - 0.024 * mus) * H,
            mirror=True,
        )
        f.add(sdf.Ellipsoid((0.048 * H, prof.front_at(0.048 * H, zn) - 0.004 * H, zn),
                            (0.0055 * H, 0.0035 * H, 0.0055 * H)), k=0.008 * H, mirror=True)
        if mus > 0.45:
            # sternal furrow between the pectorals
            f.sub(
                sdf.Capsule(
                    (0.0, front_groove(prof, zn, 0.010 * H, 0.004 * H, 0.006 * H),
                     (P.z_nipple - 0.022) * H),
                    (0.0, front_groove(prof, (P.z_armpit + 0.004) * H,
                                       0.010 * H, 0.004 * H, 0.006 * H),
                     (P.z_armpit + 0.004) * H),
                    0.010 * H,
                ),
                k=0.036 * H,
            )
            # lower border of the pectoral: a hint, not an engraved line
            za, zb = (P.z_nipple - 0.030) * H, (P.z_nipple - 0.014) * H
            f.sub(
                sdf.Capsule(
                    (0.022 * H,
                     front_groove(prof, za, 0.009 * H, 0.0025 * H, 0.012 * H, x=0.022 * H),
                     za),
                    (0.078 * H,
                     front_groove(prof, zb, 0.009 * H, 0.0020 * H, 0.004 * H, x=0.078 * H),
                     zb),
                    0.009 * H,
                ),
                k=0.034 * H,
                mirror=True,
            )

    # ---- abdominal wall --------------------------------------------------- #
    if mus > 0.5 and P.belly <= 0.004:
        # Rectus abdominis as a ladder of fused pads.  The valleys left between
        # them read as the linea alba and the tendinous lines, which looks far
        # more like muscle than grooves carved into a smooth belly.
        rows = np.linspace(P.z_iliac - 0.020, P.z_ribs - 0.004, 4)
        for i, zt in enumerate(rows):
            zz = zt * H
            w = (0.0215 - 0.0012 * i) * H
            f.add(
                sdf.Ellipsoid((0.0205 * H, prof.front_at(0.0205 * H, zz) + 0.019 * H, zz),
                              (w, 0.0225 * H, 0.0150 * H)),
                k=(0.034 - 0.010 * mus) * H,
                mirror=True,
            )
        # external oblique wrapping onto the flank
        zo = 0.5 * (P.z_iliac + P.z_waist) * H
        f.add(
            sdf.Ellipsoid((prof.half_width(zo) * 0.78, prof.centre(zo) - 0.012 * H, zo),
                          (0.024 * H, 0.028 * H, 0.034 * H)),
            k=0.055 * H,
            mirror=True,
        )
        # inguinal ligament line: barely there, just enough to close the V of
        # the lower abdomen
        f.sub(
            sdf.Capsule(
                (0.024 * H, front_groove(prof, P.z_crotch * H, 0.005 * H, 0.0014 * H),
                 (P.z_crotch + 0.032) * H),
                (0.050 * H, front_groove(prof, P.z_iliac * H, 0.005 * H, 0.0010 * H),
                 (P.z_iliac - 0.020) * H),
                0.005 * H,
            ),
            k=0.028 * H,
            mirror=True,
        )

    # ---- back ------------------------------------------------------------ #
    zl = 0.5 * (P.z_armpit + P.z_ribs) * H
    if mus > 0.35:
        f.add(
            sdf.Ellipsoid(
                (prof.half_width(zl) * 0.80, prof.back(zl) - 0.020 * H, zl + 0.010 * H),
                ((0.020 + 0.014 * mus) * H, (0.024 + 0.010 * mus) * H, 0.062 * H),
            ),
            k=0.06 * H,
            mirror=True,
        )
    # spinal groove
    zsp0 = (P.z_iliac - 0.030) * H
    zsp1 = (P.z_neck - 0.004) * H
    f.sub(
        sdf.Capsule((0.0, back_groove(prof, zsp0, 0.012 * H, 0.0045 * H), zsp0),
                    (0.0, back_groove(prof, zsp1, 0.012 * H, 0.0055 * H, 0.004 * H), zsp1),
                    0.012 * H),
        k=0.030 * H,
    )
    # dimples of Venus
    if P.softness < 0.6:
        f.sub(
            sdf.Ball((0.022 * H, prof.back(P.z_iliac * H) - 0.0055 * H, (P.z_iliac - 0.024) * H),
                     0.011 * H),
            k=0.018 * H,
            mirror=True,
        )
    # Trapezius sweeping from the neck down to the acromion.  This yoke has to
    # reach the full height of the shoulder line, otherwise the deltoid reads as
    # a shoulder pad sitting in a valley next to the neck.
    f.add(
        sdf.RoundCone(
            (0.020 * H, prof.back(P.z_neck * H) - 0.030 * H, (P.z_neck - 0.002) * H),
            (P.shoulder_x * 0.84 * H, prof.centre(P.z_acromion * H) + 0.008 * H,
             (P.z_acromion - 0.006) * H),
            0.016 * H,
            0.012 * H,
        ),
        k=0.075 * H,
        mirror=True,
    )
    if mus > 0.6:  # scapula ridge
        f.add(
            sdf.Capsule(
                (0.028 * H, prof.back(0.77 * H) - 0.012 * H, 0.780 * H),
                (0.070 * H, prof.back(0.75 * H) - 0.010 * H, 0.762 * H),
                0.010 * H,
            ),
            k=0.035 * H,
            mirror=True,
        )

    # ---- clavicles and the hollows above them ---------------------------- #
    zc = (P.z_acromion - 0.014) * H
    f.add(
        sdf.RoundCone((0.010 * H, prof.front(zc) + 0.004 * H, zc + 0.004 * H),
                      (P.shoulder_x * 0.78 * H, prof.centre(zc) - 0.010 * H, zc),
                      0.010 * H, 0.012 * H),
        k=0.024 * H,
        mirror=True,
    )
    f.sub(
        sdf.Ellipsoid((0.036 * H, prof.front(zc) + 0.0060 * H, (P.z_acromion + 0.008) * H),
                      (0.026 * H, 0.013 * H, 0.011 * H)),
        k=0.024 * H,
        mirror=True,
    )
    # sternal notch
    f.sub(sdf.Ball((0.0, prof.front(zc) + 0.0005 * H, zc + 0.008 * H), 0.0080 * H), k=0.016 * H)
    # navel
    zu = (P.z_iliac - 0.012) * H
    f.sub(
        sdf.Ellipsoid((0.0, prof.front(zu) + 0.0030 * H + P.belly * 1.4 * H, zu),
                      (0.0075 * H, 0.011 * H, 0.010 * H)),
        k=0.010 * H,
    )
    # crotch shadow
    f.sub(
        sdf.Capsule((0.0, prof.front(P.z_crotch * H) + 0.030 * H, (P.z_crotch - 0.02) * H),
                    (0.0, prof.back(P.z_crotch * H) - 0.030 * H, (P.z_crotch - 0.02) * H),
                    0.012 * H),
        k=0.02 * H,
    )
    if P.sex == "m":
        f.add(
            sdf.Ellipsoid((0.0, prof.front(P.z_crotch * H) + 0.010 * H,
                           (P.z_crotch + 0.002) * H),
                          (0.014 * H, 0.017 * H, 0.019 * H)),
            k=0.034 * H,
        )


# --------------------------------------------------------------------------- #
def build_neck(f: sdf.Field, P: Proportions, prof: TorsoProfile):
    H = P.height
    cy = 0.006 * H
    z0 = (P.z_neck - 0.030) * H
    z1 = (P.z_chin + 0.014) * H
    secs = [
        (z0, P.neck_w * 1.30 * H, P.neck_d * 1.15 * H, P.neck_d * 1.35 * H, cy * 0.6, 2.4),
        ((P.z_neck + 0.006) * H, P.neck_w * 1.00 * H, P.neck_d * 0.92 * H,
         P.neck_d * 1.05 * H, cy, 2.3),
        ((P.z_chin - 0.020) * H, P.neck_w * 0.90 * H, P.neck_d * 0.85 * H,
         P.neck_d * 0.96 * H, cy, 2.2),
        (z1, P.neck_w * 0.84 * H, P.neck_d * 0.74 * H, P.neck_d * 0.86 * H, cy * 1.4, 2.2),
    ]
    f.add(sdf.Loft(secs, cap_blend=0.03 * H), k=0.05 * H)
    # sterno-cleidomastoid
    f.add(
        sdf.RoundCone(
            (0.014 * H, cy - P.neck_d * 0.80 * H, (P.z_neck - 0.010) * H),
            (0.030 * H, cy + P.neck_d * 0.24 * H, (P.z_chin + 0.004) * H),
            0.0065 * H,
            0.0048 * H,
        ),
        k=0.036 * H,
        mirror=True,
    )
    if P.sex == "m":  # laryngeal prominence
        zl = (P.z_chin - 0.030) * H
        f.add(sdf.Ellipsoid((0.0, cy - P.neck_d * 0.95 * H, zl),
                            (0.009 * H, 0.008 * H, 0.013 * H)), k=0.020 * H)
    if P.sag > 0.0:  # slack submandibular tissue
        f.add(
            sdf.Ellipsoid((0.0, cy - P.neck_d * 0.72 * H, (P.z_chin - 0.012) * H),
                          (0.026 * H, 0.020 * H, 0.014 * H)),
            k=0.024 * H,
        )
        f.sub(
            sdf.Capsule((0.028 * H, cy - P.neck_d * 0.95 * H, (P.z_chin - 0.026) * H),
                        (-0.028 * H, cy - P.neck_d * 0.95 * H, (P.z_chin - 0.026) * H),
                        0.008 * H),
            k=0.014 * H,
        )


# --------------------------------------------------------------------------- #
def build_arms(f: sdf.Field, P: Proportions, prof: TorsoProfile):
    H = P.height
    mus = P.muscle
    sx = P.shoulder_x * H
    cy_sh = prof.centre(P.z_shoulder * H)
    S = np.array([sx, cy_sh + 0.002 * H, P.z_shoulder * H])
    E = np.array([sx + 0.62 * P.arm_abduct * H, cy_sh - 0.004 * H, P.z_elbow * H])
    W = np.array([sx + P.arm_abduct * H, cy_sh - 0.016 * H, P.z_wrist * H])

    # Deltoid cap.  Its top must stay at the acromion: any higher and the
    # shoulder turns into a dome poking up beside the neck.
    dr = P.deltoid_r * H
    f.add(
        sdf.Ellipsoid((sx + 0.003 * H, cy_sh, (P.z_shoulder + 0.004) * H),
                      (dr * 1.00, dr * 0.96, dr * 0.74)),
        k=(0.075 - 0.022 * mus) * H,
        mirror=True,
    )
    # the muscle tapers to its insertion a third of the way down the humerus
    ins = lerp(S, E, 0.26)
    f.add(
        sdf.Ellipsoid((ins[0] + 0.002 * H, ins[1], ins[2]),
                      (dr * 0.72, dr * 0.68, dr * 0.62)),
        k=(0.070 - 0.020 * mus) * H,
        mirror=True,
    )
    if mus > 0.55:  # deltoid / pectoral furrow
        f.sub(
            sdf.Capsule((sx - dr * 0.50, front_groove(prof, P.z_armpit * H, 0.008 * H,
                                                      0.0030 * H, 0.010 * H),
                         (P.z_shoulder + 0.016) * H),
                        (sx - dr * 0.30, front_groove(prof, P.z_nipple * H, 0.008 * H,
                                                      0.0030 * H, 0.004 * H),
                         (P.z_armpit - 0.012) * H),
                        0.008 * H),
            k=0.024 * H,
            mirror=True,
        )

    # upper arm
    f.add(sdf.RoundCone(S, E, P.upperarm_r * 1.06 * H, P.elbow_r * H), k=0.05 * H, mirror=True)
    bic = lerp(S, E, 0.40)
    tri = lerp(S, E, 0.46)
    f.add(
        sdf.Ellipsoid((bic[0], bic[1] - 0.014 * H, bic[2]),
                      ((0.020 + 0.010 * mus) * H, (0.017 + 0.009 * mus) * H, 0.048 * H)),
        k=(0.055 - 0.018 * mus) * H,
        mirror=True,
    )
    f.add(
        sdf.Ellipsoid((tri[0] + 0.002 * H, tri[1] + 0.014 * H, tri[2] + 0.004 * H),
                      ((0.019 + 0.008 * mus) * H, (0.016 + 0.008 * mus) * H, 0.056 * H)),
        k=(0.055 - 0.018 * mus) * H,
        mirror=True,
    )
    # armpit hollow
    f.sub(
        sdf.Ellipsoid((sx - 0.012 * H, cy_sh - 0.004 * H, (P.z_armpit - 0.008) * H),
                      (0.020 * H, 0.026 * H, 0.024 * H)),
        k=0.030 * H,
        mirror=True,
    )

    # forearm
    f.add(sdf.RoundCone(E, W, P.forearm_r * H, P.wrist_r * H), k=0.045 * H, mirror=True)
    fa = lerp(E, W, 0.26)
    f.add(
        sdf.Ellipsoid((fa[0] + 0.004 * H, fa[1] - 0.004 * H, fa[2]),
                      ((0.016 + 0.008 * mus) * H, (0.016 + 0.008 * mus) * H, 0.042 * H)),
        k=0.050 * H,
        mirror=True,
    )
    f.add(sdf.Ellipsoid((E[0], E[1] + 0.008 * H, E[2]),
                        (P.elbow_r * 0.85 * H, P.elbow_r * 0.80 * H, P.elbow_r * 0.95 * H)),
          k=0.030 * H, mirror=True)
    # wrist bones
    f.add(sdf.Ellipsoid((W[0] + 0.008 * H, W[1], W[2] + 0.004 * H),
                        (0.006 * H, 0.008 * H, 0.008 * H)), k=0.012 * H, mirror=True)

    build_hand(f, P, E, W)


def build_hand(f: sdf.Field, P: Proportions, E, W):
    """A relaxed hand, palm turned towards the thigh.

    The palm is built from the four metacarpals rather than a single slab, so
    the dorsal ridges and the knuckle arc come out of the anatomy instead of
    having to be carved back in afterwards.
    """
    H = P.height
    d = (W - E) / np.linalg.norm(W - E)
    # the hand continues the forearm with only a slight forward lean
    axis = d + np.array([0.0, -0.07, 0.0])
    axis /= np.linalg.norm(axis)

    # palm normal: faces the thigh and a little forwards, i.e. the mid-prone
    # position a hanging arm actually rests in
    nrm = np.array([-0.88, -0.47, 0.0])
    nrm -= axis * float(np.dot(nrm, axis))
    nrm /= np.linalg.norm(nrm)
    row = np.cross(axis, nrm)          # index (front) -> little (back)
    row /= np.linalg.norm(row)

    hand_len = P.hand_len * H
    palm_len = 0.56 * hand_len
    half_w = 0.5 * P.hand_w * H
    wr = P.wrist_r * H
    K = W + axis * palm_len            # knuckle line
    carp = W + axis * (0.16 * palm_len)

    # --- wrist: kept clearly narrower than the palm ------------------------ #
    f.add(sdf.RoundCone(tuple(W - axis * 0.010 * H), tuple(carp), wr * 0.90, wr * 0.94),
          k=0.014 * H, mirror=True)

    # --- metacarpals ------------------------------------------------------- #
    lat = (-0.85, -0.283, 0.283, 0.85)  # index .. little across the knuckle line
    knuck = (0.010, 0.022, 0.012, -0.014)  # the arc of the metacarpal heads
    heads = []
    for i in range(4):
        head = K + row * (lat[i] * half_w) + axis * (knuck[i] * hand_len)
        base = carp + row * (lat[i] * half_w * 0.30)
        heads.append(head)
        f.add(sdf.RoundCone(tuple(base), tuple(head), 0.0064 * H, 0.0056 * H),
              k=0.013 * H, mirror=True)

    # palmar side: a central pad plus the thenar and hypothenar eminences.  Built
    # from tapering masses rather than a slab so the palm keeps a hand silhouette
    # instead of a rectangular one.
    pmid = 0.5 * (carp + K)
    f.add(sdf.RoundCone(tuple(carp + nrm * 0.0030 * H), tuple(K + nrm * 0.0042 * H),
                        0.0085 * H, 0.0110 * H), k=0.016 * H, mirror=True)
    f.add(sdf.Ellipsoid(tuple(pmid + row * (-half_w * 0.50) + nrm * 0.0048 * H),
                        (0.0100 * H, 0.0100 * H, 0.0160 * H)), k=0.016 * H, mirror=True)
    f.add(sdf.Ellipsoid(tuple(pmid + row * (half_w * 0.58) + nrm * 0.0038 * H),
                        (0.0072 * H, 0.0072 * H, 0.0170 * H)), k=0.016 * H, mirror=True)
    # the palm is a shallow cup, not a cushion
    f.sub(sdf.Ellipsoid(tuple(pmid + row * (half_w * 0.02) + nrm * 0.0190 * H),
                        (0.0125 * H, 0.0125 * H, 0.0135 * H)), k=0.012 * H, mirror=True)

    # --- fingers ----------------------------------------------------------- #
    finger_len = hand_len - palm_len
    rel = (0.94, 1.0, 0.97, 0.80)
    rad = (0.0052, 0.0054, 0.0052, 0.0046)
    flex = np.deg2rad((11.0, 33.0, 47.0))   # cumulative MCP / PIP / DIP flexion
    segs = (0.45, 0.31, 0.24)
    for i in range(4):
        root = heads[i]
        length = finger_len * rel[i]
        r0 = rad[i] * H
        # the fingers converge very slightly towards the middle of the hand
        conv = row * (-0.09 * np.sign(lat[i]))
        p0 = root
        for j, sfrac in enumerate(segs):
            dirn = axis * np.cos(flex[j]) + nrm * np.sin(flex[j]) + conv
            dirn /= np.linalg.norm(dirn)
            p1 = p0 + dirn * (length * sfrac)
            r1 = r0 * (0.94 - 0.05 * j)
            f.add(sdf.RoundCone(tuple(p0), tuple(p1), r0, r1),
                  k=(0.010 if j == 0 else 0.005) * H, mirror=True)
            if j < 2:  # interphalangeal joints swell on the dorsal side
                f.add(sdf.Ellipsoid(tuple(p1 - nrm * (0.20 * r1)),
                                    (r1 * 1.04, r1 * 1.04, r1 * 0.80)),
                      k=0.005 * H, mirror=True)
            p0, r0 = p1, r1

    # --- thumb: metacarpal out of the thenar, then two phalanges ----------- #
    t0 = W + axis * (0.30 * palm_len) + row * (-half_w * 0.62) + nrm * 0.0030 * H
    dirs = (
        -row * 0.40 + axis * 0.86 + nrm * 0.24,
        -row * 0.22 + axis * 0.86 + nrm * 0.44,
        -row * 0.12 + axis * 0.78 + nrm * 0.60,
    )
    lens = (0.245, 0.155, 0.115)
    radii = ((0.0072, 0.0060), (0.0058, 0.0052), (0.0052, 0.0043))
    ks = (0.014, 0.007, 0.005)
    p = t0
    for dirn, ln, (ra, rb), k in zip(dirs, lens, radii, ks):
        u = dirn / np.linalg.norm(dirn)
        q = p + u * (ln * hand_len)
        f.add(sdf.RoundCone(tuple(p), tuple(q), ra * H, rb * H), k=k * H, mirror=True)
        p = q


# --------------------------------------------------------------------------- #
def build_legs(f: sdf.Field, P: Proportions, prof: TorsoProfile):
    H = P.height
    mus = P.muscle
    hx = P.hip_joint_x * H
    ax = P.ankle_x * H
    kx = ax + 0.004 * H
    cy = prof.centre(P.z_hip * H)
    HJ = np.array([hx, cy + 0.002 * H, (P.z_hip + 0.020) * H])
    K = np.array([kx, cy + 0.004 * H, P.z_knee * H])
    A = np.array([ax, cy + 0.012 * H, P.z_ankle * H])

    # thigh
    f.add(sdf.RoundCone(HJ, K, P.thigh_r * H, P.knee_r * 1.02 * H), k=0.06 * H, mirror=True)
    q = lerp(HJ, K, 0.52)
    f.add(  # quadriceps
        sdf.Ellipsoid((q[0] + 0.002 * H, q[1] - 0.016 * H, q[2] + 0.010 * H),
                      ((0.026 + 0.010 * mus) * H, (0.022 + 0.010 * mus) * H, 0.098 * H)),
        k=0.065 * H,
        mirror=True,
    )
    ham = lerp(HJ, K, 0.44)
    f.add(  # hamstrings
        sdf.Ellipsoid((ham[0], ham[1] + 0.018 * H, ham[2]),
                      ((0.024 + 0.009 * mus) * H, (0.020 + 0.010 * mus) * H, 0.098 * H)),
        k=0.065 * H,
        mirror=True,
    )
    add = lerp(HJ, K, 0.30)
    f.add(  # adductor
        sdf.Ellipsoid((add[0] - 0.008 * H, add[1] + 0.004 * H, add[2]),
                      (0.018 * H, 0.026 * H, 0.062 * H)),
        k=0.06 * H,
        mirror=True,
    )
    if mus > 0.6:  # vastus lateralis + iliotibial line
        vl = lerp(HJ, K, 0.40)
        f.add(
            sdf.Ellipsoid((vl[0] + 0.022 * H, vl[1] - 0.006 * H, vl[2]),
                          (0.016 * H, 0.024 * H, 0.070 * H)),
            k=0.055 * H,
            mirror=True,
        )

    # knee
    f.add(sdf.Ellipsoid(tuple(K), (P.knee_r * 0.98 * H, P.knee_r * 0.92 * H, P.knee_r * 1.15 * H)),
          k=0.035 * H, mirror=True)
    f.add(  # patella
        sdf.Ellipsoid((K[0], K[1] - P.knee_r * 0.78 * H, K[2] + 0.006 * H),
                      (0.016 * H, 0.010 * H, 0.020 * H)),
        k=0.024 * H,
        mirror=True,
    )
    f.sub(  # popliteal hollow
        sdf.Ellipsoid((K[0], K[1] + P.knee_r * 1.20 * H, K[2] + 0.004 * H),
                      (0.018 * H, 0.014 * H, 0.020 * H)),
        k=0.026 * H,
        mirror=True,
    )

    # calf
    f.add(sdf.RoundCone(K, A, P.calf_r * 0.90 * H, P.ankle_r * 1.10 * H), k=0.05 * H, mirror=True)
    g1 = lerp(K, A, 0.30)
    f.add(  # gastrocnemius, medial head sits lower and fuller
        sdf.Ellipsoid((g1[0] - 0.008 * H, g1[1] + 0.014 * H, g1[2] - 0.006 * H),
                      ((0.020 + 0.007 * mus) * H, (0.018 + 0.008 * mus) * H, 0.062 * H)),
        k=0.055 * H,
        mirror=True,
    )
    g2 = lerp(K, A, 0.24)
    f.add(
        sdf.Ellipsoid((g2[0] + 0.010 * H, g2[1] + 0.012 * H, g2[2] + 0.008 * H),
                      ((0.017 + 0.006 * mus) * H, (0.016 + 0.007 * mus) * H, 0.052 * H)),
        k=0.055 * H,
        mirror=True,
    )
    tib = lerp(K, A, 0.45)
    f.add(  # tibialis anterior
        sdf.Ellipsoid((tib[0] - 0.004 * H, tib[1] - 0.014 * H, tib[2]),
                      (0.013 * H, 0.014 * H, 0.070 * H)),
        k=0.05 * H,
        mirror=True,
    )
    # malleoli: the lateral one sits lower and further back than the medial
    f.add(sdf.Ellipsoid((A[0] + P.ankle_r * 0.68 * H, A[1] + 0.003 * H, A[2] + 0.006 * H),
                        (0.005 * H, 0.007 * H, 0.008 * H)), k=0.010 * H, mirror=True)
    f.add(sdf.Ellipsoid((A[0] - P.ankle_r * 0.62 * H, A[1] - 0.001 * H, A[2] + 0.013 * H),
                        (0.005 * H, 0.007 * H, 0.008 * H)), k=0.010 * H, mirror=True)

    # Daylight between the legs.  A round cutter only reaches the middle of the
    # depth and leaves the front and back of the crotch webbed together, so the
    # gap has to be a slot that spans the whole thickness of the legs.  A wide
    # blend also rounds the concave junction away to nothing, hence the tight k.
    gap = [
        ((P.z_crotch + 0.006) * H, 0.0025 * H, 3.4),
        ((P.z_crotch - 0.012) * H, 0.011 * H, 3.2),
        (0.5 * (P.z_crotch + P.z_knee) * H, 0.022 * H, 3.0),
        ((P.z_knee + 0.008) * H, 0.015 * H, 3.0),
        (0.5 * (P.z_knee + P.z_ankle) * H, 0.028 * H, 3.0),
        (-0.06 * H, 0.034 * H, 3.0),
    ]
    f.sub(
        sdf.Loft([(z, rx, 0.17 * H, 0.17 * H, cy + 0.005 * H, e) for z, rx, e in gap],
                 cap_blend=0.004 * H),
        k=0.014 * H,
    )

    build_foot(f, P, A)


def build_foot(f: sdf.Field, P: Proportions, A):
    """A foot with a longitudinal arch, a defined heel and five separate toes.

    The sole is assembled from two fore-aft columns: the lateral border runs
    along the ground, while the medial one lifts over the midfoot.  That is
    what makes the arch, so it survives at any scale instead of being a groove
    cut into a slab.
    """
    H = P.height
    toe_out = np.deg2rad(7.0)
    pivot = tuple(A)
    L = P.foot_len * H
    fw = P.foot_w * H
    ax, ay, az = A
    y_heel = ay + 0.30 * L
    y_ball = ay - 0.42 * L
    arch = 1.0 - 0.5 * P.sag          # a slack foot flattens out

    def put(prim, k):
        f.add(_rotz(prim, toe_out, pivot), k=k, mirror=True)

    def cut(prim, k):
        f.sub(_rotz(prim, toe_out, pivot), k=k, mirror=True)

    # --- heel -------------------------------------------------------------- #
    put(sdf.Ellipsoid((ax, y_heel - 0.055 * L, 0.030 * H),
                      (0.0160 * H, 0.048 * L, 0.026 * H)), 0.022 * H)
    put(sdf.Ellipsoid((ax, y_heel - 0.075 * L, 0.013 * H),   # weight-bearing pad
                      (0.0175 * H, 0.060 * L, 0.014 * H)), 0.018 * H)

    # --- lateral border: on the ground from the heel to the little toe ------ #
    put(sdf.RoundCone((ax + 0.005 * H, y_heel - 0.10 * L, 0.015 * H),
                      (ax + 0.019 * H, y_ball + 0.01 * L, 0.014 * H),
                      0.0145 * H, 0.0135 * H), 0.020 * H)
    # --- medial border: lifts clear of the ground over the midfoot ---------- #
    put(sdf.RoundCone((ax - 0.004 * H, y_heel - 0.10 * L, 0.019 * H),
                      (ax - 0.014 * H, ay - 0.13 * L, (0.019 + 0.014 * arch) * H),
                      0.0140 * H, 0.0135 * H), 0.022 * H)
    put(sdf.RoundCone((ax - 0.014 * H, ay - 0.13 * L, (0.019 + 0.014 * arch) * H),
                      (ax - 0.019 * H, y_ball, 0.0165 * H),
                      0.0135 * H, 0.0150 * H), 0.022 * H)

    # --- transverse ball of the foot ---------------------------------------- #
    put(sdf.RoundCone((ax - 0.023 * H, y_ball - 0.005 * L, 0.0160 * H),
                      (ax + 0.022 * H, y_ball + 0.020 * L, 0.0135 * H),
                      0.0155 * H, 0.0120 * H), 0.016 * H)

    # --- tarsus and instep rising to the ankle ------------------------------ #
    put(sdf.RoundCone((ax, ay + 0.02 * L, az - 0.006 * H),
                      (ax - 0.002 * H, y_ball + 0.10 * L, 0.024 * H),
                      P.ankle_r * 0.96 * H, 0.021 * H), 0.026 * H)
    # navicular bump, the landmark on top of the arch
    put(sdf.Ellipsoid((ax - 0.013 * H, ay - 0.10 * L, 0.028 * H),
                      (0.005 * H, 0.016 * L, 0.009 * H)), 0.014 * H)

    # deepen the plantar vault under the midfoot
    cut(sdf.Ellipsoid((ax - 0.014 * H, ay - 0.10 * L, -0.006 * H),
                      (0.022 * H, 0.115 * L, (0.014 + 0.010 * arch) * H)), 0.018 * H)
    # slight hollow behind the ball on the lateral side
    cut(sdf.Ellipsoid((ax + 0.020 * H, ay - 0.16 * L, -0.004 * H),
                      (0.012 * H, 0.055 * L, 0.010 * H)), 0.014 * H)

    # --- toes: two phalanges each, tips dipping back down to the ground ----- #
    xs = (-0.0211, -0.0101, -0.0017, 0.0059, 0.0130)
    roots = (0.435, 0.455, 0.450, 0.435, 0.405)
    tips = (0.665, 0.670, 0.645, 0.610, 0.565)
    rads = (0.0064, 0.0045, 0.0040, 0.0037, 0.0035)
    for i in range(5):
        x = ax + xs[i] * H
        r = rads[i] * H
        y0 = ay - roots[i] * L
        y1 = ay - tips[i] * L
        ym = y0 + 0.60 * (y1 - y0)
        z0 = (r + 0.0035 * H) / 1.0
        put(sdf.RoundCone((x, y0, z0 + 0.0020 * H), (x, ym, z0 + 0.0010 * H),
                          r * 1.18, r * 1.00), 0.009 * H)
        put(sdf.RoundCone((x, ym, z0 + 0.0010 * H), (x, y1, z0 - 0.0010 * H),
                          r * 1.00, r * 0.86), 0.005 * H)

    # flatten whatever would otherwise sink through the floor
    f.sub(sdf.Slab(2, lo=-0.4, hi=0.0), k=0.004 * H)


# --------------------------------------------------------------------------- #
def build_figure(P: Proportions, with_head=True, blend=0.24):
    """Return (field, landmarks) for a complete standing figure."""
    f = sdf.Field(blend_scale=blend)
    prof = TorsoProfile(torso_sections(P))
    build_torso(f, P, prof)
    build_neck(f, P, prof)
    build_arms(f, P, prof)
    build_legs(f, P, prof)

    landmarks = {"profile": prof}
    if with_head:
        from . import head as head_mod

        landmarks.update(head_mod.build_head(f, P, prof))
    return f, landmarks
