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


def front_groove(prof, z, r, depth, bulge=0.0):
    """Centre y for a cutter of radius r that leaves a groove `depth` deep.

    The centre must stay closer to the skin than its own radius, otherwise the
    cutter carves a sealed cavity and leaves a paper-thin wall behind.  `bulge`
    accounts for muscle volume fused in front of the lofted torso.
    """
    return prof.front(z) - bulge + max(r - depth, 0.15 * r)


def back_groove(prof, z, r, depth, bulge=0.0):
    return prof.back(z) + bulge - max(r - depth, 0.15 * r)


class TorsoProfile:
    """Interpolators for the lofted torso, used to park details on its skin."""

    def __init__(self, sections):
        s = sorted(sections, key=lambda r: r[0])
        self.z = np.array([r[0] for r in s])
        self.rx = np.array([r[1] for r in s])
        self.ryf = np.array([r[2] for r in s])
        self.ryb = np.array([r[3] for r in s])
        self.cy = np.array([r[4] for r in s])
        zz, rx = sdf._smooth_table(self.z, self.rx)
        _, ryf = sdf._smooth_table(self.z, self.ryf)
        _, ryb = sdf._smooth_table(self.z, self.ryb)
        _, cy = sdf._smooth_table(self.z, self.cy)
        self.z, self.rx, self.ryf, self.ryb, self.cy = zz, rx, ryf, ryb, cy

    def front(self, z):
        return float(np.interp(z, self.z, self.cy - self.ryf))

    def back(self, z):
        return float(np.interp(z, self.z, self.cy + self.ryb))

    def half_width(self, z):
        return float(np.interp(z, self.z, self.rx))

    def centre(self, z):
        return float(np.interp(z, self.z, self.cy))


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
        (P.z_armpit + 0.012, P.chest_w - 0.003, P.chest_f - 0.008, P.chest_b + 0.001,
         -0.002 * sway, P.torso_exp + 0.1),
        (P.z_acromion - 0.004, P.girdle_w, P.girdle_f, P.girdle_b, 0.0015 * sway, P.torso_exp),
        (P.z_neck + 0.004, P.girdle_w * 0.62, P.girdle_f * 0.72, P.girdle_b * 0.86,
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
            (0.046 * H, prof.back(zg) - 0.46 * gr, zg),
            (gr * 0.90, gr * 0.82, gr * 1.05 + 0.006 * H * P.sag),
        ),
        k=0.070 * H,
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
        k=0.020 * H,
        mirror=True,
    )

    # ---- chest ----------------------------------------------------------- #
    zn = P.z_nipple * H
    if P.breast > 0.0:
        br = P.breast * H
        cz = zn - P.breast_drop * H - 0.010 * H * P.sag
        cx = 0.048 * H
        cy = prof.front(cz) + 0.42 * br
        f.add(sdf.Ellipsoid((cx, cy, cz), (br * 1.02, br * 1.05, br * 1.12)), k=0.055 * H,
              mirror=True)
        # nipple / areola bump sits on the lower-outer face of the breast
        npt = (cx + 0.006 * H, cy - 0.62 * br, cz - 0.16 * br)
        f.add(sdf.Ellipsoid(npt, (0.0055 * H, 0.004 * H, 0.0055 * H)), k=0.006 * H,
              mirror=True)
        # inframammary fold
        f.sub(
            sdf.Capsule(
                (cx - 0.030 * H, cy - 0.30 * br, cz - 1.02 * br),
                (cx + 0.030 * H, cy - 0.20 * br, cz - 0.96 * br),
                0.010 * H,
            ),
            k=0.016 * H,
            mirror=True,
        )
    else:
        pz = zn + 0.019 * H - 0.012 * H * P.sag
        f.add(
            sdf.Ellipsoid(
                (0.046 * H, prof.front(pz) + 0.014 * H, pz),
                (0.050 * H, (0.013 + 0.004 * mus) * H, (0.027 + 0.003 * mus) * H),
            ),
            k=(0.075 - 0.030 * mus) * H,
            mirror=True,
        )
        f.add(sdf.Ellipsoid((0.048 * H, prof.front(zn) - 0.006 * H, zn),
                            (0.0055 * H, 0.0035 * H, 0.0055 * H)), k=0.008 * H, mirror=True)
        if mus > 0.45:
            # sternal furrow between the pectorals
            f.sub(
                sdf.Capsule(
                    (0.0, front_groove(prof, zn, 0.010 * H, 0.004 * H, 0.006 * H),
                     (P.z_nipple - 0.022) * H),
                    (0.0, front_groove(prof, zn, 0.010 * H, 0.004 * H, 0.006 * H),
                     (P.z_armpit + 0.004) * H),
                    0.010 * H,
                ),
                k=0.030 * H,
            )
            # lower border of the pectoral
            f.sub(
                sdf.Capsule(
                    (0.022 * H, front_groove(prof, zn, 0.007 * H, 0.004 * H, 0.006 * H),
                     (P.z_nipple - 0.030) * H),
                    (0.078 * H, front_groove(prof, zn, 0.007 * H, 0.004 * H, 0.002 * H),
                     (P.z_nipple - 0.014) * H),
                    0.007 * H,
                ),
                k=0.026 * H,
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
            w = (0.0195 - 0.0012 * i) * H
            f.add(
                sdf.Ellipsoid((0.0205 * H, prof.front(zz) + 0.011 * H, zz),
                              (w, 0.0145 * H, 0.0125 * H)),
                k=(0.030 - 0.010 * mus) * H,
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
    # trapezius sweeping from the neck to the acromion
    f.add(
        sdf.RoundCone(
            (0.014 * H, prof.back(P.z_neck * H) - 0.024 * H, (P.z_neck + 0.002) * H),
            (P.shoulder_x * 0.76 * H, prof.centre(P.z_acromion * H) + 0.012 * H,
             (P.z_acromion - 0.022) * H),
            0.012 * H,
            0.010 * H,
        ),
        k=0.070 * H,
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

    # deltoid cap
    dr = P.deltoid_r * H
    f.add(
        sdf.Ellipsoid((sx + 0.004 * H, cy_sh, (P.z_shoulder + 0.010) * H),
                      (dr * 1.02, dr * 0.98, dr * 1.30)),
        k=(0.085 - 0.025 * mus) * H,
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
    H = P.height
    d = (W - E) / np.linalg.norm(W - E)
    # the hand continues the forearm but curls slightly forwards
    hd = d + np.array([0.0, -0.16, 0.0])
    hd /= np.linalg.norm(hd)
    side = np.array([1.0, 0.0, 0.0])
    fwd = np.array([0.0, -1.0, 0.0])

    hand_len = P.hand_len * H
    palm_len = 0.55 * hand_len
    half_w = 0.5 * P.hand_w * H
    K = W + hd * palm_len  # knuckle line

    palm_centre = 0.5 * (W + K)
    palm = sdf.RoundCone(W + hd * 0.02 * H, K, P.wrist_r * 1.05 * H, 0.024 * H)
    f.add(sdf.Scaled(palm, (half_w / (0.024 * H), 0.52, 1.0), pivot=tuple(palm_centre)),
          k=0.020 * H, mirror=True)
    # thenar eminence (base of the thumb)
    f.add(
        sdf.Ellipsoid(tuple(palm_centre + side * (-half_w * 0.45) + fwd * 0.004 * H),
                      (0.012 * H, 0.008 * H, 0.018 * H)),
        k=0.018 * H,
        mirror=True,
    )

    finger_len = hand_len - palm_len
    rel = (0.92, 1.0, 0.96, 0.80)          # index .. little
    xs = (0.62, 0.21, -0.21, -0.60)
    rad = (0.0055, 0.0058, 0.0055, 0.0048)
    for i in range(4):
        root = K + side * (xs[i] * half_w * 0.92) - hd * 0.004 * H
        length = finger_len * rel[i]
        dirs = hd + fwd * (0.30 + 0.05 * i)
        dirs /= np.linalg.norm(dirs)
        p0 = root
        segs = (0.44, 0.32, 0.24)
        r0 = rad[i] * H
        for j, sfrac in enumerate(segs):
            curl = hd * (1.0 - 0.34 * (j + 1)) + fwd * (0.30 + 0.30 * j)
            curl /= np.linalg.norm(curl)
            p1 = p0 + curl * (length * sfrac)
            r1 = r0 * (0.90 - 0.06 * j)
            f.add(sdf.RoundCone(p0, p1, r0, r1), k=0.006 * H, mirror=True)
            p0, r0 = p1, r1
    # thumb: two segments swinging forwards off the medial side of the palm
    t0 = W + hd * (0.26 * palm_len) + side * (-half_w * 0.86)
    t1 = t0 + (fwd * 0.62 + hd * 0.78 + side * -0.10) / np.linalg.norm(
        (fwd * 0.62 + hd * 0.78 + side * -0.10)
    ) * (0.40 * hand_len)
    t2 = t1 + (fwd * 0.72 + hd * 0.66) / np.linalg.norm(fwd * 0.72 + hd * 0.66) * (
        0.26 * hand_len
    )
    f.add(sdf.RoundCone(t0, t1, 0.0085 * H, 0.0070 * H), k=0.014 * H, mirror=True)
    f.add(sdf.RoundCone(t1, t2, 0.0068 * H, 0.0058 * H), k=0.007 * H, mirror=True)


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
    # malleoli
    f.add(sdf.Ellipsoid((A[0] + P.ankle_r * 0.75 * H, A[1], A[2] + 0.010 * H),
                        (0.007 * H, 0.009 * H, 0.010 * H)), k=0.014 * H, mirror=True)
    f.add(sdf.Ellipsoid((A[0] - P.ankle_r * 0.70 * H, A[1], A[2] + 0.014 * H),
                        (0.007 * H, 0.009 * H, 0.010 * H)), k=0.014 * H, mirror=True)

    gap = [
        ((P.z_crotch - 0.004) * H, 0.004 * H),
        (0.5 * (P.z_crotch + P.z_knee) * H, 0.016 * H),
        ((P.z_knee + 0.010) * H, 0.010 * H),
        (0.5 * (P.z_knee + P.z_ankle) * H, 0.026 * H),
        ((P.z_ankle + 0.010) * H, 0.030 * H),
    ]
    for (za, ra), (zb, rb) in zip(gap[:-1], gap[1:]):
        f.sub(sdf.RoundCone((0.0, cy + 0.004 * H, za), (0.0, cy + 0.006 * H, zb), ra, rb),
              k=0.030 * H)

    build_foot(f, P, A)


def build_foot(f: sdf.Field, P: Proportions, A):
    H = P.height
    toe_out = np.deg2rad(7.0)
    pivot = tuple(A)
    flen = P.foot_len * H
    fw = P.foot_w * H
    ax, ay, az = A
    heel_y = ay + 0.30 * flen
    ball_y = ay - 0.44 * flen

    def put(prim, k):
        f.add(_rotz(prim, toe_out, pivot), k=k, mirror=True)

    put(sdf.Ellipsoid((ax, heel_y - 0.012 * H, az - 0.010 * H),
                      (0.024 * H, 0.030 * H, 0.030 * H)), 0.030 * H)
    put(sdf.RoundBox((ax, ay - 0.10 * flen, 0.020 * H),
                     (0.5 * fw - 0.008 * H, 0.20 * flen, 0.006 * H), 0.012 * H), 0.030 * H)
    put(sdf.RoundBox((ax + 0.002 * H, ball_y + 0.02 * flen, 0.019 * H),
                     (0.5 * fw - 0.004 * H, 0.10 * flen, 0.006 * H), 0.012 * H), 0.026 * H)
    # instep rising to the ankle
    put(sdf.RoundCone((ax, ay + 0.02 * flen, az + 0.004 * H),
                      (ax, ball_y + 0.03 * flen, 0.022 * H),
                      P.ankle_r * 1.05 * H, 0.022 * H), 0.030 * H)
    # arch on the medial side
    f.sub(
        _rotz(sdf.Ellipsoid((ax - 0.5 * fw + 0.002 * H, ay - 0.06 * flen, 0.006 * H),
                            (0.012 * H, 0.055 * H, 0.014 * H)), toe_out, pivot),
        k=0.016 * H,
        mirror=True,
    )
    # toes
    xs = (-0.34, -0.10, 0.11, 0.29, 0.43)
    lens = (0.115, 0.095, 0.088, 0.078, 0.062)
    rads = (0.0105, 0.0072, 0.0068, 0.0062, 0.0054)
    for i in range(5):
        x = ax + xs[i] * fw
        y0 = ball_y + 0.012 * flen
        r = rads[i] * H
        z = 0.014 * H + 0.002 * H * (1 - i * 0.2)
        y1 = y0 - lens[i] * flen
        put(sdf.RoundCone((x, y0, z + 0.004 * H), (x, y1, z), r * 1.25, r * 0.92), 0.010 * H)


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
