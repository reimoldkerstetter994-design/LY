"""Procedural materials: skin with subsurface scattering, eyes, hair, clay.

No UV maps are needed anywhere -- every texture is driven from object space,
which for these figures is the same as world space.  Local colour zones (lips,
cheeks, areolae, knuckles) are placed by measuring the distance from a
landmark, with an ``Absolute`` on the coordinate so one node group serves both
sides of the body.
"""

from __future__ import annotations

import bpy


def srgb(r, g, b, a=1.0):
    """8-bit sRGB triple -> linear RGBA, so the numbers above read like a swatch."""
    def f(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (f(r), f(g), f(b), a)


SKIN_TONES = {
    "pale": dict(base=(233, 199, 185), sss_scale=0.0045, sss=(1.0, 0.40, 0.22),
                 blush=(214, 132, 118), lip=(196, 118, 112), shadow=(150, 96, 92)),
    "light": dict(base=(227, 187, 163), sss_scale=0.0042, sss=(1.0, 0.38, 0.20),
                  blush=(206, 120, 104), lip=(190, 108, 100), shadow=(146, 90, 78)),
    "medium": dict(base=(198, 152, 120), sss_scale=0.0038, sss=(1.0, 0.34, 0.18),
                   blush=(178, 104, 84), lip=(160, 92, 80), shadow=(120, 74, 58)),
    "tan": dict(base=(170, 122, 90), sss_scale=0.0034, sss=(1.0, 0.30, 0.16),
                blush=(150, 88, 66), lip=(136, 78, 66), shadow=(100, 60, 44)),
    "deep": dict(base=(112, 76, 56), sss_scale=0.0028, sss=(1.0, 0.26, 0.14),
                 blush=(102, 58, 44), lip=(96, 56, 48), shadow=(64, 40, 30)),
}

IRIS_COLOURS = {
    "brown": (78, 46, 22),
    "hazel": (118, 84, 34),
    "amber": (146, 96, 30),
    "green": (74, 100, 58),
    "blue": (74, 104, 130),
    "grey": (96, 104, 108),
}


# --------------------------------------------------------------------------- #
def _nt(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    return nt


def _new(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        if k == "inputs":
            for name, val in v.items():
                n.inputs[name].default_value = val
        else:
            setattr(n, k, v)
    return n


def _dist_field(nt, coord, centre, radii, absolute_x=True):
    """|(p - centre) / radii| as a scalar -- an ellipsoidal falloff gizmo."""
    src = coord
    if absolute_x:
        ab = _new(nt, "ShaderNodeVectorMath", operation="ABSOLUTE")
        nt.links.new(coord, ab.inputs[0])
        # keep y and z signed: abs() on all axes then restore via a second math
        sep = _new(nt, "ShaderNodeSeparateXYZ")
        nt.links.new(ab.outputs["Vector"], sep.inputs["Vector"])
        sep_signed = _new(nt, "ShaderNodeSeparateXYZ")
        nt.links.new(coord, sep_signed.inputs["Vector"])
        comb = _new(nt, "ShaderNodeCombineXYZ")
        nt.links.new(sep.outputs["X"], comb.inputs["X"])
        nt.links.new(sep_signed.outputs["Y"], comb.inputs["Y"])
        nt.links.new(sep_signed.outputs["Z"], comb.inputs["Z"])
        src = comb.outputs["Vector"]
    sub = _new(nt, "ShaderNodeVectorMath", operation="SUBTRACT")
    sub.inputs[1].default_value = centre
    nt.links.new(src, sub.inputs[0])
    div = _new(nt, "ShaderNodeVectorMath", operation="DIVIDE")
    div.inputs[1].default_value = radii
    nt.links.new(sub.outputs["Vector"], div.inputs[0])
    ln = _new(nt, "ShaderNodeVectorMath", operation="LENGTH")
    nt.links.new(div.outputs["Vector"], ln.inputs[0])
    return ln.outputs["Value"]


def _falloff(nt, value, inner, outer, strength=1.0):
    mr = _new(nt, "ShaderNodeMapRange", clamp=True)
    mr.inputs["From Min"].default_value = inner
    mr.inputs["From Max"].default_value = outer
    mr.inputs["To Min"].default_value = strength
    mr.inputs["To Max"].default_value = 0.0
    nt.links.new(value, mr.inputs["Value"])
    return mr.outputs["Result"]


def _mix_colour(nt, fac, a, b):
    m = _new(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MIX")
    m.inputs["Factor"].default_value = 0.0
    if hasattr(fac, "name"):
        nt.links.new(fac, m.inputs["Factor"])
    else:
        m.inputs["Factor"].default_value = fac
    if hasattr(a, "name"):
        nt.links.new(a, m.inputs[6])
    else:
        m.inputs[6].default_value = a
    if hasattr(b, "name"):
        nt.links.new(b, m.inputs[7])
    else:
        m.inputs[7].default_value = b
    return m.outputs[2]


# --------------------------------------------------------------------------- #
def skin_material(P, lm, name="skin"):
    tone = SKIN_TONES[P.skin]
    H = P.height
    mat = bpy.data.materials.new(name)
    nt = _nt(mat)
    out = _new(nt, "ShaderNodeOutputMaterial")
    bsdf = _new(nt, "ShaderNodeBsdfPrincipled")
    bsdf.subsurface_method = "RANDOM_WALK"
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    coord = _new(nt, "ShaderNodeTexCoord")
    obj = coord.outputs["Object"]

    base = srgb(*tone["base"])
    blush = srgb(*tone["blush"])
    lip_c = srgb(*tone["lip"])
    shadow = srgb(*tone["shadow"])

    # ---- large scale tonal variation ------------------------------------- #
    n_big = _new(nt, "ShaderNodeTexNoise", inputs={"Scale": 2.6, "Detail": 6.0,
                                                   "Roughness": 0.55})
    nt.links.new(obj, n_big.inputs["Vector"])
    col = _mix_colour(nt, 0.0, base, base)  # placeholder to start the chain
    tinted = _new(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MIX")
    tinted.inputs[6].default_value = tuple(
        min(1.0, c * (1.16 if i == 0 else 1.02 if i == 1 else 0.94)) if i < 3 else c
        for i, c in enumerate(base)
    )
    tinted.inputs[7].default_value = tuple(
        (c * (0.82 if i == 0 else 0.88 if i == 1 else 0.96)) if i < 3 else c
        for i, c in enumerate(base)
    )
    nt.links.new(n_big.outputs["Fac"], tinted.inputs["Factor"])
    col = tinted.outputs[2]

    # medium mottling / capillary noise
    n_mid = _new(nt, "ShaderNodeTexNoise", inputs={"Scale": 26.0, "Detail": 8.0,
                                                   "Roughness": 0.62})
    nt.links.new(obj, n_mid.inputs["Vector"])
    n_mid_f = _new(nt, "ShaderNodeMapRange", clamp=True)
    n_mid_f.inputs["From Min"].default_value = 0.42
    n_mid_f.inputs["From Max"].default_value = 0.62
    n_mid_f.inputs["To Min"].default_value = 0.0
    n_mid_f.inputs["To Max"].default_value = 0.07
    nt.links.new(n_mid.outputs["Fac"], n_mid_f.inputs["Value"])
    col = _mix_colour(nt, n_mid_f.outputs["Result"], col, blush)

    # freckle / pigment speckle
    n_spk = _new(nt, "ShaderNodeTexNoise", inputs={"Scale": 160.0, "Detail": 4.0,
                                                  "Roughness": 0.5})
    nt.links.new(obj, n_spk.inputs["Vector"])
    spk = _new(nt, "ShaderNodeMapRange", clamp=True)
    spk.inputs["From Min"].default_value = 0.60
    spk.inputs["From Max"].default_value = 0.72
    spk.inputs["To Min"].default_value = 0.0
    spk.inputs["To Max"].default_value = 0.07
    nt.links.new(n_spk.outputs["Fac"], spk.inputs["Value"])
    col = _mix_colour(nt, spk.outputs["Result"], col, shadow)

    # ---- landmark colour zones ------------------------------------------- #
    if "lip" in lm:
        lx, ly, lz = lm["lip"]
        d = _dist_field(nt, obj, (0.0, ly, lz), (0.026 * H, 0.010 * H, 0.0085 * H))
        col = _mix_colour(nt, _falloff(nt, d, 0.70, 1.30, 0.55), col, lip_c)
        # cheeks
        cx = lm["eye_centre"][0] * 1.25
        cz = 0.5 * (lm["eye_centre"][2] + lz)
        d = _dist_field(nt, obj, (cx, ly + 0.006 * H, cz), (0.030 * H, 0.030 * H, 0.028 * H))
        col = _mix_colour(nt, _falloff(nt, d, 0.30, 1.45, 0.14), col, blush)
        # eyelid / socket warmth
        ex, ey, ez = lm["eye_centre"]
        d = _dist_field(nt, obj, (ex, ey, ez), (0.026 * H, 0.020 * H, 0.020 * H))
        col = _mix_colour(nt, _falloff(nt, d, 0.45, 1.35, 0.10), col, shadow)
        # ears catch the light and go pink
        erx, ery, erz = lm["ear"]
        d = _dist_field(nt, obj, (erx, ery, erz), (0.014 * H, 0.020 * H, 0.024 * H))
        col = _mix_colour(nt, _falloff(nt, d, 0.55, 1.25, 0.18), col, blush)
    if P.breast > 0.0 or P.sex == "m":
        zn = P.z_nipple * H
        prof = lm.get("profile")
        ny = prof.front(zn) - 0.004 * H if prof else -0.06 * H
        d = _dist_field(nt, obj, (0.048 * H, ny, zn - P.breast_drop * H),
                        (0.016 * H, 0.016 * H, 0.016 * H))
        col = _mix_colour(nt, _falloff(nt, d, 0.50, 1.30, 0.45), col, lip_c)

    # knees, elbows and knuckles read slightly darker and rougher
    knee_d = _dist_field(nt, obj, (P.ankle_x * H + 0.004 * H, 0.004 * H, P.z_knee * H),
                         (0.045 * H, 0.045 * H, 0.055 * H))
    knee_f = _falloff(nt, knee_d, 0.45, 1.35, 0.15)
    col = _mix_colour(nt, knee_f, col, shadow)
    elbow_d = _dist_field(nt, obj,
                          ((P.shoulder_x + 0.62 * P.arm_abduct) * H, 0.012 * H, P.z_elbow * H),
                          (0.035 * H, 0.035 * H, 0.045 * H))
    col = _mix_colour(nt, _falloff(nt, elbow_d, 0.45, 1.35, 0.15), col, shadow)

    # soles and palms lose the tan
    sole = _new(nt, "ShaderNodeMapRange", clamp=True)
    sep = _new(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(obj, sep.inputs["Vector"])
    sole.inputs["From Min"].default_value = 0.030 * H
    sole.inputs["From Max"].default_value = 0.012 * H
    sole.inputs["To Min"].default_value = 0.0
    sole.inputs["To Max"].default_value = 0.55
    nt.links.new(sep.outputs["Z"], sole.inputs["Value"])
    pale = tuple(min(1.0, c * 1.20) for c in base[:3]) + (1.0,)
    col = _mix_colour(nt, sole.outputs["Result"], col, pale)

    # very low frequency value drift, so limbs and torso do not share one flat tone
    n_reg = _new(nt, "ShaderNodeTexNoise", inputs={"Scale": 0.9, "Detail": 3.0,
                                                   "Roughness": 0.5})
    nt.links.new(obj, n_reg.inputs["Vector"])
    reg = _new(nt, "ShaderNodeMapRange", clamp=True)
    reg.inputs["From Min"].default_value = 0.35
    reg.inputs["From Max"].default_value = 0.65
    reg.inputs["To Min"].default_value = 0.0
    reg.inputs["To Max"].default_value = 0.06
    nt.links.new(n_reg.outputs["Fac"], reg.inputs["Value"])
    col = _mix_colour(nt, reg.outputs["Result"], col, shadow)

    nt.links.new(col, bsdf.inputs["Base Color"])

    # ---- surface response ------------------------------------------------- #
    bsdf.inputs["Subsurface Weight"].default_value = 0.82
    bsdf.inputs["Subsurface Radius"].default_value = tone["sss"]
    bsdf.inputs["Subsurface Scale"].default_value = tone["sss_scale"]
    bsdf.inputs["IOR"].default_value = 1.40
    bsdf.inputs["Specular IOR Level"].default_value = 0.40
    bsdf.inputs["Coat Weight"].default_value = 0.02
    bsdf.inputs["Coat Roughness"].default_value = 0.34
    bsdf.inputs["Sheen Weight"].default_value = 0.10
    bsdf.inputs["Sheen Roughness"].default_value = 0.42

    rough_n = _new(nt, "ShaderNodeTexNoise", inputs={"Scale": 55.0, "Detail": 6.0})
    nt.links.new(obj, rough_n.inputs["Vector"])
    rmap = _new(nt, "ShaderNodeMapRange", clamp=True)
    rmap.inputs["From Min"].default_value = 0.30
    rmap.inputs["From Max"].default_value = 0.70
    rmap.inputs["To Min"].default_value = 0.42
    rmap.inputs["To Max"].default_value = 0.74
    nt.links.new(rough_n.outputs["Fac"], rmap.inputs["Value"])
    nt.links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])

    # ---- micro relief: pores, then fine wrinkles ------------------------- #
    pores = _new(nt, "ShaderNodeTexVoronoi", inputs={"Scale": 1600.0, "Randomness": 1.0})
    pores.feature = "F1"
    nt.links.new(obj, pores.inputs["Vector"])
    pore_h = _new(nt, "ShaderNodeMapRange", clamp=True)
    pore_h.inputs["From Min"].default_value = 0.0
    pore_h.inputs["From Max"].default_value = 0.5
    pore_h.inputs["To Min"].default_value = 0.35
    pore_h.inputs["To Max"].default_value = 0.65
    nt.links.new(pores.outputs["Distance"], pore_h.inputs["Value"])

    micro = _new(nt, "ShaderNodeTexNoise", inputs={"Scale": 420.0, "Detail": 6.0,
                                                  "Roughness": 0.7})
    nt.links.new(obj, micro.inputs["Vector"])
    mix_h = _new(nt, "ShaderNodeMix", data_type="FLOAT", blend_type="MIX")
    mix_h.inputs["Factor"].default_value = 0.45
    nt.links.new(pore_h.outputs["Result"], mix_h.inputs[2])
    nt.links.new(micro.outputs["Fac"], mix_h.inputs[3])

    bump = _new(nt, "ShaderNodeBump", inputs={"Strength": 0.66, "Distance": 0.0030})
    nt.links.new(mix_h.outputs[0], bump.inputs["Height"])

    if P.sag > 0.0:
        # stretched noise reads as slack, creped skin on the face and hands
        wr_map = _new(nt, "ShaderNodeMapping")
        wr_map.inputs["Scale"].default_value = (1.0, 1.0, 0.12)
        nt.links.new(obj, wr_map.inputs["Vector"])
        wr = _new(nt, "ShaderNodeTexNoise", inputs={"Scale": 130.0, "Detail": 4.0,
                                                    "Roughness": 0.5})
        nt.links.new(wr_map.outputs["Vector"], wr.inputs["Vector"])
        wbump = _new(nt, "ShaderNodeBump", inputs={"Strength": 0.35, "Distance": 0.0022})
        nt.links.new(wr.outputs["Fac"], wbump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], wbump.inputs["Normal"])
        nt.links.new(wbump.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# --------------------------------------------------------------------------- #
def eye_material(iris="brown", name="eye"):
    mat = bpy.data.materials.new(name)
    nt = _nt(mat)
    out = _new(nt, "ShaderNodeOutputMaterial")
    bsdf = _new(nt, "ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    coord = _new(nt, "ShaderNodeTexCoord")
    obj = coord.outputs["Object"]
    sep = _new(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(obj, sep.inputs["Vector"])

    # radius in the plane of the iris (the eye looks down -Y)
    xz = _new(nt, "ShaderNodeCombineXYZ")
    nt.links.new(sep.outputs["X"], xz.inputs["X"])
    nt.links.new(sep.outputs["Z"], xz.inputs["Y"])
    rad = _new(nt, "ShaderNodeVectorMath", operation="LENGTH")
    nt.links.new(xz.outputs["Vector"], rad.inputs[0])

    iris_col = srgb(*IRIS_COLOURS[iris])
    # The white of the eye is nowhere near white: it sits in the shade of the
    # lids and brow, and rendering it at paper value is what makes CG eyes stare.
    sclera = srgb(196, 189, 182)
    limbus = srgb(46, 34, 28)
    pupil = (0.004, 0.0035, 0.0035, 1.0)

    # radial fibre detail in the iris
    fib_map = _new(nt, "ShaderNodeMapping")
    fib_map.inputs["Scale"].default_value = (60.0, 60.0, 3.0)
    nt.links.new(obj, fib_map.inputs["Vector"])
    fib = _new(nt, "ShaderNodeTexNoise", inputs={"Scale": 3.2, "Detail": 8.0,
                                                 "Roughness": 0.7})
    nt.links.new(fib_map.outputs["Vector"], fib.inputs["Vector"])
    iris_dark = tuple(c * 0.45 for c in iris_col[:3]) + (1.0,)
    iris_mix = _mix_colour(nt, fib.outputs["Fac"], iris_col, iris_dark)

    ramp_in = rad.outputs["Value"]
    col = iris_mix
    # pupil
    col = _mix_colour(nt, _falloff(nt, ramp_in, 0.0022, 0.0027), col, pupil)
    # limbus ring then sclera
    lim = _new(nt, "ShaderNodeMapRange", clamp=True)
    lim.inputs["From Min"].default_value = 0.0050
    lim.inputs["From Max"].default_value = 0.0062
    lim.inputs["To Min"].default_value = 0.0
    lim.inputs["To Max"].default_value = 1.0
    nt.links.new(ramp_in, lim.inputs["Value"])
    col = _mix_colour(nt, lim.outputs["Result"], col, limbus)
    scl = _new(nt, "ShaderNodeMapRange", clamp=True)
    scl.inputs["From Min"].default_value = 0.0060
    scl.inputs["From Max"].default_value = 0.0068
    scl.inputs["To Min"].default_value = 0.0
    scl.inputs["To Max"].default_value = 1.0
    nt.links.new(ramp_in, scl.inputs["Value"])
    # veins in the white
    vein = _new(nt, "ShaderNodeTexNoise", inputs={"Scale": 90.0, "Detail": 6.0,
                                                  "Roughness": 0.75})
    nt.links.new(obj, vein.inputs["Vector"])
    vf = _new(nt, "ShaderNodeMapRange", clamp=True)
    vf.inputs["From Min"].default_value = 0.56
    vf.inputs["From Max"].default_value = 0.66
    vf.inputs["To Min"].default_value = 0.0
    vf.inputs["To Max"].default_value = 0.55
    nt.links.new(vein.outputs["Fac"], vf.inputs["Value"])
    sclera_col = _mix_colour(nt, vf.outputs["Result"], sclera, srgb(196, 122, 116))
    # the globe darkens away from the cornea, where the lids never let light in
    shade = _new(nt, "ShaderNodeMapRange", clamp=True)
    shade.inputs["From Min"].default_value = 0.0070
    shade.inputs["From Max"].default_value = 0.0115
    shade.inputs["To Min"].default_value = 0.0
    shade.inputs["To Max"].default_value = 0.72
    nt.links.new(ramp_in, shade.inputs["Value"])
    sclera_col = _mix_colour(nt, shade.outputs["Result"], sclera_col, srgb(96, 84, 78))
    col = _mix_colour(nt, scl.outputs["Result"], col, sclera_col)

    nt.links.new(col, bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.22
    bsdf.inputs["Subsurface Weight"].default_value = 0.10
    bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.6, 0.5)
    bsdf.inputs["Subsurface Scale"].default_value = 0.002
    bsdf.inputs["Coat Weight"].default_value = 1.0
    bsdf.inputs["Coat Roughness"].default_value = 0.015
    bsdf.inputs["Coat IOR"].default_value = 1.38
    bsdf.inputs["Specular IOR Level"].default_value = 0.6
    return mat


# --------------------------------------------------------------------------- #
HAIR_COLOURS = {
    "black": dict(melanin=1.0, redness=0.15, rough=0.28),
    "dark": dict(melanin=0.92, redness=0.22, rough=0.30),
    "brown": dict(melanin=0.62, redness=0.32, rough=0.32),
    "auburn": dict(melanin=0.55, redness=0.75, rough=0.32),
    "blond": dict(melanin=0.18, redness=0.30, rough=0.34),
    # Grey has to sit very near zero melanin.  0.10 is still blond -- the elderly
    # preset came out with a golden cap rather than grey hair.
    "grey": dict(melanin=0.035, redness=0.02, rough=0.42),
    "white": dict(melanin=0.008, redness=0.0, rough=0.46),
}


def hair_material(colour="dark", name="hair"):
    spec = HAIR_COLOURS[colour]
    mat = bpy.data.materials.new(name)
    nt = _nt(mat)
    out = _new(nt, "ShaderNodeOutputMaterial")
    h = _new(nt, "ShaderNodeBsdfHairPrincipled")
    try:
        h.parametrization = "MELANIN"
    except Exception:
        pass
    for key, val in (("Melanin", spec["melanin"]), ("Melanin Redness", spec["redness"]),
                     ("Roughness", spec["rough"]), ("Radial Roughness", 0.28),
                     ("Random Color", 0.12), ("Random Roughness", 0.18),
                     ("Coat", 0.12), ("IOR", 1.55)):
        if key in h.inputs:
            h.inputs[key].default_value = val
    nt.links.new(h.outputs[0], out.inputs["Surface"])
    return mat


def clay_material(name="clay", value=0.42):
    mat = bpy.data.materials.new(name)
    nt = _nt(mat)
    out = _new(nt, "ShaderNodeOutputMaterial")
    b = _new(nt, "ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (value, value * 0.94, value * 0.88, 1.0)
    b.inputs["Roughness"].default_value = 0.52
    b.inputs["Specular IOR Level"].default_value = 0.35
    b.inputs["Subsurface Weight"].default_value = 0.12
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.5, 0.35)
    b.inputs["Subsurface Scale"].default_value = 0.004
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    return mat


def nail_material(name="nail"):
    mat = bpy.data.materials.new(name)
    nt = _nt(mat)
    out = _new(nt, "ShaderNodeOutputMaterial")
    b = _new(nt, "ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = srgb(224, 178, 164)
    b.inputs["Roughness"].default_value = 0.16
    b.inputs["Coat Weight"].default_value = 0.6
    b.inputs["Coat Roughness"].default_value = 0.08
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    return mat
