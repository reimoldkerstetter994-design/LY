"""Hair: scalp styles, eyebrows, lashes and stubble as Blender hair curves.

Roots are sampled from the skin mesh itself, so the hairline follows the actual
head, and every strand is then integrated step by step: the direction starts
along the surface normal and rotates towards gravity, with per-strand noise,
clumping towards a guide strand, optional helical curl, and a collision push
against a coarse proxy of the head and shoulders so long hair lies on them
instead of through them.
"""

from __future__ import annotations

import numpy as np

import bpy

from . import materials, sdf

# kind: buzz | short | crop | long | ponytail
STYLES = {
    "bald": None,
    "short_dark": dict(kind="short", length=0.036, colour="dark", count=44000,
                       sweep=(0.22, 0.92, -0.30)),
    "short_light": dict(kind="short", length=0.031, colour="blond", count=42000,
                        sweep=(0.35, 0.85, -0.35)),
    "short_grey": dict(kind="short", length=0.027, colour="grey", count=26000,
                       thin=0.75, sweep=(0.18, 0.94, -0.28)),
    "buzz_dark": dict(kind="buzz", length=0.010, colour="dark", count=46000),
    "curly_dark": dict(kind="crop", length=0.056, colour="black", count=42000,
                       curl=0.016, curl_period=0.028, sweep=(0.30, 0.75, -0.55)),
    "long_dark": dict(kind="long", length=0.32, colour="dark", count=46000,
                      curl=0.006, curl_period=0.12),
    "long_auburn": dict(kind="long", length=0.30, colour="auburn", count=46000,
                        curl=0.008, curl_period=0.10),
    "ponytail_dark": dict(kind="ponytail", length=0.30, colour="dark", count=44000),
}


def _curves_object(name, paths, radii, mat, collection=None):
    """paths: (N, S, 3) float array; radii: (S,) profile shared by all strands."""
    n, s, _ = paths.shape
    hc = bpy.data.hair_curves.new(name)
    hc.add_curves([s] * n)
    hc.points.foreach_set("position", np.ascontiguousarray(paths, np.float32).reshape(-1))
    attr = hc.attributes.get("radius")
    if attr is None:
        attr = hc.attributes.new("radius", "FLOAT", "POINT")
    attr.data.foreach_set("value", np.tile(radii, n).astype(np.float32))
    ob = bpy.data.objects.new(name, hc)
    (collection or bpy.context.scene.collection).objects.link(ob)
    hc.materials.append(mat)
    return ob


def _normalise(v):
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    n[n < 1e-12] = 1.0
    return v / n


def _proxy_field(P, lm):
    """Coarse head + neck + shoulders used only for hair collision."""
    H = P.height
    hw, hd, hh = lm["head_size"]
    prof = lm.get("profile")
    f = sdf.Field()
    c = lm["head_centre"]
    f.add(sdf.Ellipsoid((0.0, c[1], lm["chin_z"] + 0.60 * hh),
                        (hw * 1.02, hd * 1.02, hh * 0.44)))
    f.add(sdf.Capsule((0.0, 0.008 * H, (P.z_neck - 0.04) * H),
                      (0.0, 0.008 * H, lm["chin_z"] + 0.02 * hh), P.neck_w * 1.05 * H),
          k=0.02)
    if prof is not None:
        zs = P.z_acromion * H
        f.add(sdf.Ellipsoid((0.0, prof.centre(zs), zs - 0.02 * H),
                            (P.girdle_w * 1.15 * H, 0.075 * H, 0.055 * H)),
              k=0.03)
        f.add(sdf.Ellipsoid((0.0, prof.centre(P.z_nipple * H), P.z_nipple * H),
                            (P.chest_w * 1.05 * H, 0.075 * H, 0.075 * H)), k=0.04)
    return f


def _smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def _sample_weighted(idx, weight, count, rng):
    """Sample roots in proportion to a density field, giving soft edges."""
    w = weight[idx]
    tot = w.sum()
    if tot <= 0:
        return None
    p = w / tot
    return idx[rng.choice(len(idx), size=count, p=p)]


def scalp_roots(P, lm, verts, normals, count, rng):
    """Pick strand roots on the cranium, respecting a plausible hairline."""
    hw, hd, hh = lm["head_size"]
    zc = lm["chin_z"]
    ym = lm["head_centre"][1]
    t = (verts[:, 2] - zc) / hh
    x = np.abs(verts[:, 0])
    y = verts[:, 1]

    # the hairline climbs at the temples; the nape sits much lower
    t_front = 0.760 + 0.105 * np.clip(x / hw, 0, 1) ** 2
    s = np.clip((y - (ym - 0.34 * hd)) / (0.62 * hd), 0.0, 1.0)
    t_min = t_front * (1 - s) + 0.28 * s
    # a soft ramp instead of a hard threshold: the hairline stops looking cut out
    dens = _smoothstep((t - t_min) / 0.05)
    dens *= _smoothstep((1.04 - t) / 0.04)
    dens *= _smoothstep((normals[:, 2] + 0.35) / 0.3)
    dens *= 1.0 - 0.9 * _smoothstep((x / hw - 0.84) / 0.12) * _smoothstep(
        (0.64 - t) / 0.10) * _smoothstep((t - 0.26) / 0.10)
    idx = np.nonzero(dens > 0.004)[0]
    if len(idx) == 0:
        return None, None
    sel = _sample_weighted(idx, dens, count, rng)
    if sel is None:
        return None, None
    n = normals[sel]
    p = verts[sel]
    # jitter within the local tangent plane so roots do not stack on vertices
    a = _normalise(np.cross(n, np.array([0.0, 0.0, 1.0]) + 1e-6))
    b = _normalise(np.cross(n, a))
    j = 0.0022
    p = p + a * rng.normal(0, j, (count, 1)) + b * rng.normal(0, j, (count, 1))
    return p, _normalise(n)


def grow(roots, normals, style, rng, proxy=None, gather=None):
    kind = style["kind"]
    length = style["length"]
    segs = {"buzz": 3, "short": 8, "crop": 9, "long": 20, "ponytail": 18}[kind]
    n = len(roots)
    paths = np.empty((n, segs + 1, 3), np.float64)
    paths[:, 0] = roots
    pos = roots.copy()
    down = np.array([0.0, 0.0, -1.0])

    # per-strand variation
    jitter = rng.normal(0.0, 0.30, (n, 3))
    length_var = 1.0 + rng.normal(0.0, 0.18 if kind != "buzz" else 0.35, (n, 1))
    length_var = np.clip(length_var, 0.35, 1.6)
    # clumping: every strand is drawn towards one of a few hundred guides
    n_clump = max(24, n // 260)
    clump_of = rng.integers(0, n_clump, n)
    clump_dir = _normalise(rng.normal(0.0, 1.0, (n_clump, 3)) * np.array([1.0, 1.0, 0.45]))
    clump_pull = clump_dir[clump_of] * (0.35 if kind in ("long", "ponytail") else 0.22)

    curl = style.get("curl", 0.0)
    curl_period = style.get("curl_period", 0.04)
    phase = rng.uniform(0, 2 * np.pi, (n, 1))
    side = _normalise(np.cross(normals, down + 1e-6))
    up = _normalise(np.cross(side, normals))

    # short hair lies along the scalp: project the styling sweep onto the
    # tangent plane at each root so strands travel across the head, not out of it
    sweep = np.asarray(style.get("sweep", (0.20, 0.90, -0.35)), np.float64)
    sweep = sweep / np.linalg.norm(sweep)
    sweep = np.where(roots[:, :1] > 0, sweep, sweep * np.array([-1.0, 1.0, 1.0]))
    tang = _normalise(sweep - normals * np.sum(sweep * normals, axis=1, keepdims=True))

    step = length / segs
    d = normals.copy()
    for i in range(segs):
        u = (i + 0.5) / segs
        if kind == "buzz":
            g = 0.25 * u
        elif kind == "short":
            g = 0.92 * u**0.55
        elif kind == "crop":
            g = 0.88 * u**0.6
        else:
            g = min(1.0, 1.35 * u**0.5)
        if kind in ("buzz", "short", "crop"):
            flow = tang * 1.20 + down * 0.30
        else:
            flow = down * 1.6
        target = normals * (1.0 - g) + flow * g + jitter * 0.15 * (1.0 - 0.5 * u)
        target = target + clump_pull * u
        if gather is not None and kind == "ponytail":
            to_g = gather - pos
            w = np.clip(1.6 * (1.0 - u * 2.2), 0.0, 1.0)
            target = target * (1.0 - w) + _normalise(to_g) * (w * 2.0)
        d = _normalise(d * 0.45 + _normalise(target) * 0.55)
        pos = pos + d * (step * length_var)
        if curl > 0.0:
            ang = 2 * np.pi * (i + 1) * step / curl_period + phase
            pos = pos + (side * np.cos(ang) + up * np.sin(ang)) * curl * (0.3 + 0.7 * u)
        if proxy is not None and kind in ("long", "ponytail", "crop"):
            pos = sdf.push_outside(proxy, pos, margin=0.004)
        paths[:, i + 1] = pos
    return paths


def _radii(segs, root=6.0e-5, tip=1.6e-5, thin=1.0):
    t = np.linspace(0.0, 1.0, segs + 1)
    return (root * thin * (1.0 - t) ** 0.6 + tip * thin) .astype(np.float32)


def build_hair(P, lm, verts, normals, density=1.0, clay=False, seed=7):
    style = STYLES.get(P.hair)
    out = []
    rng = np.random.default_rng(seed)
    mat_cache = {}

    def mat_for(colour):
        if clay:
            key = "clay"
            if key not in mat_cache:
                mat_cache[key] = materials.hair_material("dark", "hair_clay")
            return mat_cache[key]
        if colour not in mat_cache:
            mat_cache[colour] = materials.hair_material(colour, f"hair_{colour}")
        return mat_cache[colour]

    if style is not None:
        count = max(600, int(style["count"] * density))
        roots, rn = scalp_roots(P, lm, verts, normals, count, rng)
        if roots is not None:
            proxy = _proxy_field(P, lm) if style["kind"] in ("long", "ponytail", "crop") else None
            gather = None
            if style["kind"] == "ponytail":
                hw, hd, hh = lm["head_size"]
                gather = np.array([0.0, lm["head_centre"][1] + 0.98 * hd,
                                   lm["chin_z"] + 0.60 * hh])
            paths = grow(roots, rn, style, rng, proxy=proxy, gather=gather)
            r = _radii(paths.shape[1] - 1, thin=style.get("thin", 1.0))
            out.append(_curves_object("hair_scalp", paths, r, mat_for(style["colour"])))

    colour = (style or {}).get("colour", "dark")
    brow_colour = {"blond": "brown", "grey": "grey", "white": "grey"}.get(colour, colour)

    # ---- eyebrows ---------------------------------------------------------- #
    hw, hd, hh = lm["head_size"]
    bx, by, bz = lm["brow"]
    u = lm.get("unit", 1.0)
    sel = []
    for sign in (1.0, -1.0):
        c = np.array([sign * bx * 0.98, by, bz + 0.002 * u])
        rel = (verts - c) / np.array([0.026 * u, 0.020 * u, 0.011 * u])
        m = (np.linalg.norm(rel, axis=1) < 1.0) & (normals[:, 1] < -0.25)
        idx = np.nonzero(m)[0]
        if len(idx) == 0:
            continue
        n_brow = max(300, int(1600 * density))
        pick = idx[rng.integers(0, len(idx), n_brow)]
        p = verts[pick]
        nn = normals[pick]
        # brows sweep outwards and slightly up
        d = _normalise(nn * 0.8 + np.array([sign * 0.75, 0.0, 0.42])
                       + rng.normal(0, 0.18, (n_brow, 3)))
        L = 0.009 * u * (1.0 + rng.normal(0, 0.25, (n_brow, 1)))
        paths = np.stack([p, p + d * L * 0.45, p + d * L], axis=1)
        sel.append(paths)
    if sel:
        paths = np.concatenate(sel)
        out.append(_curves_object("hair_brows", paths, _radii(2, 7.0e-5, 3.0e-5),
                                  mat_for(brow_colour)))

    # ---- eyelashes --------------------------------------------------------- #
    ex, ey, ez = lm["eye_centre"]
    er = lm["eye_radius"]
    lashes = []
    for sign in (1.0, -1.0):
        for upper in (True, False):
            n_l = max(40, int((150 if upper else 70) * density))
            a = rng.uniform(-1.15, 1.15, n_l)
            zz = ez + (er * 0.52 if upper else -er * 0.62) * np.cos(a * 0.8)
            xx = sign * ex + np.sin(a) * er * 1.02
            yy = ey - er * 0.92 + np.abs(np.sin(a)) * er * 0.12
            p = np.stack([xx, yy, zz], 1)
            d = np.stack([
                np.sin(a) * 0.35 + rng.normal(0, 0.1, n_l),
                -np.ones(n_l) * 0.9,
                (0.85 if upper else -0.75) * np.ones(n_l) + rng.normal(0, 0.12, n_l),
            ], 1)
            d = _normalise(d)
            L = (0.0085 if upper else 0.005) * u * (1 + rng.normal(0, 0.2, (n_l, 1)))
            mid = p + d * L * 0.5
            tipd = _normalise(d + np.array([0.0, -0.3, 0.55 if upper else -0.4]))
            lashes.append(np.stack([p, mid, mid + tipd * L * 0.55], axis=1))
    paths = np.concatenate(lashes)
    out.append(_curves_object("hair_lashes", paths, _radii(2, 5.5e-5, 2.5e-5),
                              mat_for("black" if not clay else "dark")))

    # ---- stubble ----------------------------------------------------------- #
    if P.sex == "m" and P.hair != "bald" and density > 0.25:
        zc = lm["chin_z"]
        t = (verts[:, 2] - zc) / hh
        ym = lm["head_centre"][1]
        x = np.abs(verts[:, 0])
        # beard density: full on the chin and jaw, fading up the cheek, with a
        # sideburn strip in front of the ear and nothing on the lips or nose
        dens = _smoothstep((0.32 - t) / 0.10) * _smoothstep((t + 0.10) / 0.06)
        dens *= _smoothstep((ym + 0.20 * hd - verts[:, 1]) / (0.25 * hd))
        dens *= 1.0 - 0.85 * _smoothstep((t - 0.20) / 0.12) * _smoothstep(
            (0.62 * hw - x) / (0.25 * hw))
        side = _smoothstep((x - 0.72 * hw) / (0.18 * hw)) * _smoothstep((0.52 - t) / 0.12) \
            * _smoothstep((t - 0.20) / 0.10)
        dens = np.maximum(dens, side * 0.9)
        lx, ly, lz = lm["lip"]
        rel = (verts - np.array([lx, ly - 0.004 * u, lz])) / np.array(
            [0.030 * u, 0.016 * u, 0.0085 * u])
        dens *= _smoothstep((np.linalg.norm(rel, axis=1) - 0.85) / 0.35)
        nx, ny, nz = lm["nose_tip"]
        rel = (verts - np.array([nx, ny + 0.008 * u, nz])) / np.array(
            [0.020 * u, 0.020 * u, 0.026 * u])
        dens *= _smoothstep((np.linalg.norm(rel, axis=1) - 0.9) / 0.4)
        dens *= _smoothstep((normals[:, 2] + 0.75) / 0.4)
        idx = np.nonzero(dens > 0.01)[0]
        if len(idx) > 20:
            n_s = max(2000, int(30000 * density))
            pick = _sample_weighted(idx, dens, n_s, rng)
            p = verts[pick]
            nn = normals[pick]
            d = _normalise(nn + rng.normal(0, 0.25, (n_s, 3)))
            L = 0.0016 * u * (1 + rng.normal(0, 0.3, (n_s, 1)))
            out.append(
                _curves_object("hair_stubble", np.stack([p, p + d * L], axis=1),
                               _radii(1, 6.5e-5, 5.0e-5),
                               mat_for("black" if colour in ("dark", "black") else colour))
            )
    return out
