"""Signed-distance-field toolkit used to sculpt anatomy from smooth primitives.

The figures are described as a stack of implicit primitives combined with
smooth boolean operators, then polygonised with a "surface nets" (dual
contouring) mesher.  Smooth unions are what make the result read as flesh
rather than as a pile of intersecting shapes: muscles, breasts, deltoids and
so on are blended with a controllable fillet radius, while creases (spine
groove, gluteal cleft, lip line, nostrils) are carved with smooth subtraction.

Everything works in metres, Z up, and the figure faces -Y.
"""

from __future__ import annotations

import numpy as np

FAR = 1.0e3


# --------------------------------------------------------------------------- #
# smooth boolean operators
# --------------------------------------------------------------------------- #
def smin(a, b, k):
    """Polynomial smooth minimum (quadratic), k = fillet radius in metres."""
    if k <= 0.0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def smax(a, b, k):
    if k <= 0.0:
        return np.maximum(a, b)
    return -smin(-a, -b, k)


def ssub(d, cutter, k):
    """Carve `cutter` out of `d` with a smooth (k) transition."""
    return smax(d, -cutter, k)


# --------------------------------------------------------------------------- #
# primitives
# --------------------------------------------------------------------------- #
class Prim:
    """Base class.  Sub-classes provide `aabb` and `eval`."""

    aabb = ((-FAR, -FAR, -FAR), (FAR, FAR, FAR))

    def eval(self, X, Y, Z):  # pragma: no cover - interface
        raise NotImplementedError


def _aabb_ball(c, r):
    return ((c[0] - r, c[1] - r, c[2] - r), (c[0] + r, c[1] + r, c[2] + r))


class Ball(Prim):
    def __init__(self, center, radius):
        self.c = np.asarray(center, np.float64)
        self.r = float(radius)
        self.aabb = _aabb_ball(self.c, self.r)

    def eval(self, X, Y, Z):
        return np.sqrt(
            (X - self.c[0]) ** 2 + (Y - self.c[1]) ** 2 + (Z - self.c[2]) ** 2
        ) - self.r


class Ellipsoid(Prim):
    """Approximate SDF of an axis-aligned ellipsoid (exact at the surface)."""

    def __init__(self, center, radii):
        self.c = np.asarray(center, np.float64)
        self.r = np.asarray(radii, np.float64)
        self.aabb = (tuple(self.c - self.r), tuple(self.c + self.r))

    def eval(self, X, Y, Z):
        u = (X - self.c[0]) / self.r[0]
        v = (Y - self.c[1]) / self.r[1]
        w = (Z - self.c[2]) / self.r[2]
        k = np.sqrt(u * u + v * v + w * w)
        return (k - 1.0) * float(self.r.min())


class RoundCone(Prim):
    """Capsule with a different radius at each end -- the limb work-horse."""

    def __init__(self, a, b, r1, r2=None):
        self.a = np.asarray(a, np.float64)
        self.b = np.asarray(b, np.float64)
        self.r1 = float(r1)
        self.r2 = float(r1 if r2 is None else r2)
        lo = np.minimum(self.a - self.r1, self.b - self.r2)
        hi = np.maximum(self.a + self.r1, self.b + self.r2)
        self.aabb = (tuple(lo), tuple(hi))

    def eval(self, X, Y, Z):
        a, b, r1, r2 = self.a, self.b, self.r1, self.r2
        ba = b - a
        l2 = float(ba @ ba)
        if l2 < 1e-12:
            return np.sqrt((X - a[0]) ** 2 + (Y - a[1]) ** 2 + (Z - a[2]) ** 2) - max(
                r1, r2
            )
        rr = r1 - r2
        a2 = l2 - rr * rr
        if a2 <= 1e-12:  # one end sphere swallows the other
            d1 = np.sqrt((X - a[0]) ** 2 + (Y - a[1]) ** 2 + (Z - a[2]) ** 2) - r1
            d2 = np.sqrt((X - b[0]) ** 2 + (Y - b[1]) ** 2 + (Z - b[2]) ** 2) - r2
            return np.minimum(d1, d2)
        il2 = 1.0 / l2
        pax = X - a[0]
        pay = Y - a[1]
        paz = Z - a[2]
        y = pax * ba[0] + pay * ba[1] + paz * ba[2]
        z = y - l2
        x2 = (
            (pax * l2 - ba[0] * y) ** 2
            + (pay * l2 - ba[1] * y) ** 2
            + (paz * l2 - ba[2] * y) ** 2
        )
        y2 = y * y * l2
        z2 = z * z * l2
        k = np.sign(rr) * rr * rr * x2
        cap_b = np.sqrt(x2 + z2) * il2 - r2
        cap_a = np.sqrt(x2 + y2) * il2 - r1
        side = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1
        out = np.where(
            np.sign(z) * a2 * z2 > k, cap_b, np.where(np.sign(y) * a2 * y2 < k, cap_a, side)
        )
        return out


def Capsule(a, b, r):
    return RoundCone(a, b, r, r)


class RoundBox(Prim):
    def __init__(self, center, half, radius=0.0):
        self.c = np.asarray(center, np.float64)
        self.h = np.asarray(half, np.float64)
        self.r = float(radius)
        self.aabb = (tuple(self.c - self.h - self.r), tuple(self.c + self.h + self.r))

    def eval(self, X, Y, Z):
        qx = np.abs(X - self.c[0]) - self.h[0]
        qy = np.abs(Y - self.c[1]) - self.h[1]
        qz = np.abs(Z - self.c[2]) - self.h[2]
        ox = np.maximum(qx, 0.0)
        oy = np.maximum(qy, 0.0)
        oz = np.maximum(qz, 0.0)
        outside = np.sqrt(ox * ox + oy * oy + oz * oz)
        inside = np.minimum(np.maximum(np.maximum(qx, qy), qz), 0.0)
        return outside + inside - self.r


class Slab(Prim):
    """Half space / slab used for trimming (e.g. clipping a shape at a plane)."""

    def __init__(self, axis, lo=-FAR, hi=FAR):
        self.axis = axis
        self.lo = lo
        self.hi = hi
        b_lo = [-FAR, -FAR, -FAR]
        b_hi = [FAR, FAR, FAR]
        b_lo[axis] = lo
        b_hi[axis] = hi
        self.aabb = (tuple(b_lo), tuple(b_hi))

    def eval(self, X, Y, Z):
        c = (X, Y, Z)[self.axis]
        mid = 0.5 * (self.lo + self.hi)
        half = 0.5 * (self.hi - self.lo)
        return np.abs(c - mid) - half


def _smooth_table(z, v, n=512):
    """Resample control values onto a dense grid with a Catmull-Rom spline.

    Linear interpolation between sections leaves a tangent break at every
    control height, which shows up on a smooth volume like the cranium as
    horizontal ridges.  A C1 spline removes them.
    """
    z = np.asarray(z, np.float64)
    v = np.asarray(v, np.float64)
    if z.size < 3:
        zz = np.linspace(z[0], z[-1], n)
        return zz, np.interp(zz, z, v)
    # centred differences give Catmull-Rom tangents, clamped at the ends
    d = np.zeros_like(v)
    d[1:-1] = (v[2:] - v[:-2]) / (z[2:] - z[:-2])
    d[0] = (v[1] - v[0]) / (z[1] - z[0])
    d[-1] = (v[-1] - v[-2]) / (z[-1] - z[-2])
    zz = np.linspace(z[0], z[-1], n)
    i = np.clip(np.searchsorted(z, zz) - 1, 0, z.size - 2)
    h = z[i + 1] - z[i]
    t = (zz - z[i]) / h
    t2 = t * t
    t3 = t2 * t
    h00 = 2 * t3 - 3 * t2 + 1
    h10 = t3 - 2 * t2 + t
    h01 = -2 * t3 + 3 * t2
    h11 = t3 - t2
    out = h00 * v[i] + h10 * h * d[i] + h01 * v[i + 1] + h11 * h * d[i + 1]
    return zz, out


class Loft(Prim):
    """Generalised cylinder along Z with super-elliptical cross sections.

    Each control section carries a half width (``rx``), separate front and
    back depths (``ryf`` / ``ryb``), a lateral/AP centre offset and a
    "squareness" exponent.  This is what shapes the torso: a ribcage that is
    boxy and deep, a waist that is rounder, buttocks that push backwards.
    """

    def __init__(self, sections, exponent=2.4, cap_blend=0.035):
        # sections: iterable of (z, rx, ryf, ryb, cy) or (z, rx, ryf, ryb, cy, exp)
        secs = sorted(sections, key=lambda s: s[0])
        self.z = np.array([s[0] for s in secs], np.float64)
        self.rx = np.array([s[1] for s in secs], np.float64)
        self.ryf = np.array([s[2] for s in secs], np.float64)
        self.ryb = np.array([s[3] for s in secs], np.float64)
        self.cy = np.array([s[4] for s in secs], np.float64)
        self.ex = np.array(
            [s[5] if len(s) > 5 else exponent for s in secs], np.float64
        )
        self.cap = float(cap_blend)
        zz, self._rx = _smooth_table(self.z, self.rx)
        _, self._ryf = _smooth_table(self.z, self.ryf)
        _, self._ryb = _smooth_table(self.z, self.ryb)
        _, self._cy = _smooth_table(self.z, self.cy)
        _, self._ex = _smooth_table(self.z, self.ex)
        self._zz = zz
        self._rx = np.maximum(self._rx, 1e-4)
        self._ryf = np.maximum(self._ryf, 1e-4)
        self._ryb = np.maximum(self._ryb, 1e-4)
        rxm = float(self.rx.max())
        ymin = float((self.cy - self.ryf).min())
        ymax = float((self.cy + self.ryb).max())
        m = self.cap
        self.aabb = (
            (-rxm - m, ymin - m, float(self.z[0]) - m),
            (rxm + m, ymax + m, float(self.z[-1]) + m),
        )

    def eval(self, X, Y, Z):
        zf = np.ravel(Z)
        shp = [1, 1, zf.size]
        rx = np.interp(zf, self._zz, self._rx).reshape(shp)
        ryf = np.interp(zf, self._zz, self._ryf).reshape(shp)
        ryb = np.interp(zf, self._zz, self._ryb).reshape(shp)
        cy = np.interp(zf, self._zz, self._cy).reshape(shp)
        ex = np.interp(zf, self._zz, self._ex).reshape(shp)
        yr = Y - cy
        # smooth front/back radius blend so the flanks stay tangent-continuous
        w = 0.5 * (1.0 - yr / np.sqrt(yr * yr + (0.35 * rx) ** 2))
        ry = w * ryf + (1.0 - w) * ryb
        u = np.abs(X / rx)
        v = np.abs(yr / ry)
        k = (u**ex + v**ex) ** (1.0 / ex)
        rmin = np.minimum(rx, np.minimum(ryf, ryb))
        d = (k - 1.0) * rmin
        zc = 0.5 * (self.z[0] + self.z[-1])
        hz = 0.5 * (self.z[-1] - self.z[0])
        return smax(d, np.abs(Z - zc) - hz, self.cap)


class Transformed(Prim):
    """Rotate/translate any primitive (ZYX euler, radians)."""

    def __init__(self, prim, euler=(0.0, 0.0, 0.0), translate=(0.0, 0.0, 0.0), pivot=(0.0, 0.0, 0.0)):
        self.p = prim
        ex, ey, ez = euler
        cx, sx = np.cos(ex), np.sin(ex)
        cy, sy = np.cos(ey), np.sin(ey)
        cz, sz = np.cos(ez), np.sin(ez)
        Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
        Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
        Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
        self.R = Rz @ Ry @ Rx
        self.pivot = np.asarray(pivot, np.float64)
        self.t = np.asarray(translate, np.float64)
        lo = np.asarray(prim.aabb[0], np.float64)
        hi = np.asarray(prim.aabb[1], np.float64)
        corners = np.array(
            [[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
        )
        world = (corners - self.pivot) @ self.R.T + self.pivot + self.t
        self.aabb = (tuple(world.min(0)), tuple(world.max(0)))

    def eval(self, X, Y, Z):
        px = X - self.pivot[0] - self.t[0]
        py = Y - self.pivot[1] - self.t[1]
        pz = Z - self.pivot[2] - self.t[2]
        # inverse rotation (R transposed) then back to primitive space
        R = self.R
        lx = R[0, 0] * px + R[1, 0] * py + R[2, 0] * pz + self.pivot[0]
        ly = R[0, 1] * px + R[1, 1] * py + R[2, 1] * pz + self.pivot[1]
        lz = R[0, 2] * px + R[1, 2] * py + R[2, 2] * pz + self.pivot[2]
        return self.p.eval(lx, ly, lz)


class Scaled(Prim):
    """Anisotropic scaling of a primitive about a pivot (approximate SDF)."""

    def __init__(self, prim, scale, pivot=(0.0, 0.0, 0.0)):
        self.p = prim
        self.s = np.asarray(scale, np.float64)
        self.pv = np.asarray(pivot, np.float64)
        lo = (np.asarray(prim.aabb[0]) - self.pv) * self.s + self.pv
        hi = (np.asarray(prim.aabb[1]) - self.pv) * self.s + self.pv
        self.aabb = (tuple(np.minimum(lo, hi)), tuple(np.maximum(lo, hi)))
        self.k = float(self.s.min())

    def eval(self, X, Y, Z):
        lx = (X - self.pv[0]) / self.s[0] + self.pv[0]
        ly = (Y - self.pv[1]) / self.s[1] + self.pv[1]
        lz = (Z - self.pv[2]) / self.s[2] + self.pv[2]
        return self.p.eval(lx, ly, lz) * self.k


class Mirrored(Prim):
    """Mirror a primitive across the X=0 plane (kept as its own union node)."""

    def __init__(self, prim):
        self.p = prim
        lo, hi = prim.aabb
        self.aabb = ((-hi[0], lo[1], lo[2]), (-lo[0], hi[1], hi[2]))

    def eval(self, X, Y, Z):
        return self.p.eval(-X, Y, Z)


# --------------------------------------------------------------------------- #
# CSG program
# --------------------------------------------------------------------------- #
class Field:
    """Ordered list of smooth CSG operations.

    ``blend_scale`` globally tightens or loosens every fillet, which is the
    single most expressive knob in the whole system: low values give a lean,
    defined body, high values a soft one.
    """

    def __init__(self, blend_scale=1.0):
        self.ops = []  # (prim, mode, k)
        self.blend_scale = float(blend_scale)

    def add(self, prim, k=0.0, mirror=False):
        k = float(k) * self.blend_scale
        self.ops.append((prim, "union", k))
        if mirror:
            self.ops.append((Mirrored(prim), "union", k))
        return self

    def sub(self, prim, k=0.0, mirror=False):
        k = float(k) * self.blend_scale
        self.ops.append((prim, "sub", k))
        if mirror:
            self.ops.append((Mirrored(prim), "sub", k))
        return self

    # Faces need fillets set in absolute millimetres rather than scaled by the
    # global build softness, so features keep their crispness on any body.
    def addk(self, prim, k=0.0, mirror=False):
        self.ops.append((prim, "union", float(k)))
        if mirror:
            self.ops.append((Mirrored(prim), "union", float(k)))
        return self

    def subk(self, prim, k=0.0, mirror=False):
        self.ops.append((prim, "sub", float(k)))
        if mirror:
            self.ops.append((Mirrored(prim), "sub", float(k)))
        return self

    def isect(self, prim, k=0.0):
        self.ops.append((prim, "isect", float(k)))
        return self

    def bounds(self, margin=0.02):
        lo = np.full(3, FAR)
        hi = np.full(3, -FAR)
        for prim, mode, k in self.ops:
            if mode != "union":
                continue
            lo = np.minimum(lo, np.asarray(prim.aabb[0], np.float64) - k)
            hi = np.maximum(hi, np.asarray(prim.aabb[1], np.float64) + k)
        return lo - margin, hi + margin


# --------------------------------------------------------------------------- #
# polygonisation (surface nets, slab-by-slab to keep memory bounded)
# --------------------------------------------------------------------------- #
_EDGES = (
    (0, 1), (2, 3), (4, 5), (6, 7),   # along z
    (0, 2), (1, 3), (4, 6), (5, 7),   # along y
    (0, 4), (1, 5), (2, 6), (3, 7),   # along x
)


def _corner_views(d):
    return [
        d[:-1, :-1, :-1], d[:-1, :-1, 1:], d[:-1, 1:, :-1], d[:-1, 1:, 1:],
        d[1:, :-1, :-1], d[1:, :-1, 1:], d[1:, 1:, :-1], d[1:, 1:, 1:],
    ]


_OFFS = np.array(
    [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]],
    np.float64,
)


def _eval_block(field, X, Y, Z, box_lo, box_hi):
    """Evaluate the CSG program on one open grid block, culling by AABB."""
    shape = (X.size, Y.size, Z.size)
    d = np.full(shape, FAR, np.float32)
    xs, ys, zs = np.ravel(X), np.ravel(Y), np.ravel(Z)
    for prim, mode, k in field.ops:
        lo = np.asarray(prim.aabb[0], np.float64)
        hi = np.asarray(prim.aabb[1], np.float64)
        m = k + 0.012
        lo = lo - m
        hi = hi + m
        if np.any(hi < box_lo) or np.any(lo > box_hi):
            continue
        if mode == "isect":
            d = smax(d, prim.eval(X, Y, Z), k).astype(np.float32, copy=False)
            continue
        i0, i1 = np.searchsorted(xs, [lo[0], hi[0]])
        j0, j1 = np.searchsorted(ys, [lo[1], hi[1]])
        k0, k1 = np.searchsorted(zs, [lo[2], hi[2]])
        i0 = max(i0 - 1, 0)
        j0 = max(j0 - 1, 0)
        k0 = max(k0 - 1, 0)
        i1 = min(i1 + 1, shape[0])
        j1 = min(j1 + 1, shape[1])
        k1 = min(k1 + 1, shape[2])
        if i0 >= i1 or j0 >= j1 or k0 >= k1:
            continue
        sub = (slice(i0, i1), slice(j0, j1), slice(k0, k1))
        sx = xs[i0:i1].reshape(-1, 1, 1)
        sy = ys[j0:j1].reshape(1, -1, 1)
        sz = zs[k0:k1].reshape(1, 1, -1)
        dv = prim.eval(sx, sy, sz)
        cur = d[sub]
        if mode == "union":
            d[sub] = smin(cur, dv, k).astype(np.float32, copy=False)
        else:  # sub
            d[sub] = ssub(cur, dv, k).astype(np.float32, copy=False)
    return d


def polygonise(field, voxel=0.002, bounds=None, slab=48, verbose=False):
    """Mesh the zero level set.  Returns (verts float32[N,3], quads int32[M,4])."""
    if bounds is None:
        bounds = field.bounds()
    lo, hi = np.asarray(bounds[0], np.float64), np.asarray(bounds[1], np.float64)
    n = np.maximum(np.ceil((hi - lo) / voxel).astype(int) + 1, 4)
    xs = lo[0] + np.arange(n[0]) * voxel
    ys = lo[1] + np.arange(n[1]) * voxel
    zs = lo[2] + np.arange(n[2]) * voxel
    ny1, nz1 = n[1] - 1, n[2] - 1

    vert_chunks, cell_chunks, quad_chunks = [], [], []

    k = 0
    while k < nz1:
        k_hi = min(k + slab, nz1)          # cells [k, k_hi)
        zlo = max(k - 1, 0)                # one extra layer below for quads
        z_sl = zs[zlo : k_hi + 1]
        Zb = z_sl.reshape(1, 1, -1)
        Xb = xs.reshape(-1, 1, 1)
        Yb = ys.reshape(1, -1, 1)
        box_lo = np.array([xs[0], ys[0], z_sl[0]])
        box_hi = np.array([xs[-1], ys[-1], z_sl[-1]])
        d = _eval_block(field, Xb, Yb, Zb, box_lo, box_hi)

        c = _corner_views(d)
        neg = [ci < 0.0 for ci in c]
        cnt = neg[0].astype(np.uint8)
        for i in range(1, 8):
            cnt += neg[i]
        active = (cnt > 0) & (cnt < 8)
        # cell index space of this block: (nx-1, ny-1, len(z_sl)-1) starting at zlo
        ai, aj, ak = np.nonzero(active)
        if ai.size:
            psum = np.zeros((ai.size, 3), np.float64)
            pcnt = np.zeros(ai.size, np.float64)
            cv = np.empty((8, ai.size), np.float32)
            for i in range(8):
                cv[i] = c[i][ai, aj, ak]
            for e0, e1 in _EDGES:
                v0, v1 = cv[e0], cv[e1]
                m = (v0 < 0.0) != (v1 < 0.0)
                if not m.any():
                    continue
                t = v0[m] / (v0[m] - v1[m])
                p = _OFFS[e0] + t[:, None] * (_OFFS[e1] - _OFFS[e0])
                psum[m] += p
                pcnt[m] += 1.0
            pcnt = np.maximum(pcnt, 1.0)
            pos = psum / pcnt[:, None]
            vx = xs[ai] + pos[:, 0] * voxel
            vy = ys[aj] + pos[:, 1] * voxel
            vz = z_sl[ak] + pos[:, 2] * voxel
            gk = ak + zlo  # global cell k
            keep = gk >= k  # cells owned by this slab
            lin = (ai.astype(np.int64) * ny1 + aj) * nz1 + gk
            vert_chunks.append(np.stack([vx[keep], vy[keep], vz[keep]], 1).astype(np.float32))
            cell_chunks.append(lin[keep])

            # ---- quads: one per grid edge that changes sign ----
            def emit(mask, neighbours, flip):
                idx = np.nonzero(mask)
                if idx[0].size == 0:
                    return
                base_i, base_j, base_k = idx
                cols = []
                for di, dj, dk in neighbours:
                    ci = base_i + di
                    cj = base_j + dj
                    ck = base_k + dk + zlo
                    cols.append((ci.astype(np.int64) * ny1 + cj) * nz1 + ck)
                q = np.stack(cols, 1)
                f = ~flip[idx]  # keep the winding pointing away from the solid
                q[f] = q[f][:, ::-1]
                quad_chunks.append(q)

            nzb = d < 0.0
            sx = nzb[:-1, :, :] != nzb[1:, :, :]
            sy = nzb[:, :-1, :] != nzb[:, 1:, :]
            sz_ = nzb[:, :, :-1] != nzb[:, :, 1:]
            # z-edges live inside a single cell layer, so the overlap layer
            # brought in for the x/y edges must not re-emit them.
            kz0 = 1 if zlo < k else 0

            # X-edge at (i..i+1, j, kk): cells (i, j-1|j, kk-1|kk)
            mask = np.zeros_like(sx)
            mask[:, 1:-1, 1:-1] = sx[:, 1:-1, 1:-1]
            emit(mask, [(0, -1, -1), (0, 0, -1), (0, 0, 0), (0, -1, 0)], nzb[:-1, :, :])
            # Y-edge at (i, j..j+1, kk): cells (i-1|i, j, kk-1|kk)
            mask = np.zeros_like(sy)
            mask[1:-1, :, 1:-1] = sy[1:-1, :, 1:-1]
            emit(mask, [(-1, 0, -1), (-1, 0, 0), (0, 0, 0), (0, 0, -1)], nzb[:, :-1, :])
            # Z-edge at (i, j, kk..kk+1): cells (i-1|i, j-1|j, kk)
            mask = np.zeros_like(sz_)
            mask[1:-1, 1:-1, kz0:] = sz_[1:-1, 1:-1, kz0:]
            emit(mask, [(-1, -1, 0), (0, -1, 0), (0, 0, 0), (-1, 0, 0)], nzb[:, :, :-1])
        if verbose:
            print(f"  slab z[{k}:{k_hi}] verts={sum(len(v) for v in vert_chunks)}", flush=True)
        k = k_hi

    if not vert_chunks:
        return np.zeros((0, 3), np.float32), np.zeros((0, 4), np.int32)

    verts = np.concatenate(vert_chunks)
    cells = np.concatenate(cell_chunks)
    order = np.argsort(cells, kind="stable")
    cells_sorted = cells[order]
    verts = verts[order]
    quads = np.concatenate(quad_chunks) if quad_chunks else np.zeros((0, 4), np.int64)
    flat = quads.reshape(-1)
    pos = np.searchsorted(cells_sorted, flat)
    pos = np.clip(pos, 0, cells_sorted.size - 1)
    ok = cells_sorted[pos] == flat
    idx = pos.reshape(-1, 4)
    good = ok.reshape(-1, 4).all(axis=1)
    quads = idx[good].astype(np.int32)
    return verts, quads


def eval_points(field, pts):
    """Evaluate a CSG program on an (N,3) point cloud (used for hair collision)."""
    x = pts[:, 0]
    y = pts[:, 1]
    z = pts[:, 2]
    d = np.full(len(pts), FAR, np.float64)
    for prim, mode, k in field.ops:
        dv = prim.eval(x, y, z)
        if mode == "union":
            d = smin(d, dv, k)
        elif mode == "sub":
            d = ssub(d, dv, k)
        else:
            d = smax(d, dv, k)
    return d


def push_outside(field, pts, margin=0.0, eps=0.002):
    """Move points that are inside `field` out to its surface plus `margin`."""
    d = eval_points(field, pts)
    bad = d < margin
    if not bad.any():
        return pts
    p = pts[bad]
    g = np.empty_like(p)
    for i in range(3):
        o = np.zeros(3)
        o[i] = eps
        g[:, i] = eval_points(field, p + o) - eval_points(field, p - o)
    n = np.linalg.norm(g, axis=1, keepdims=True)
    n[n < 1e-9] = 1.0
    pts[bad] = p + g / n * (margin - d[bad])[:, None]
    return pts


def clamp_shell(field, pts, lo=0.0, hi=0.02, eps=0.002):
    """Keep points inside the shell ``lo <= d <= hi`` around a field's surface.

    Hair strands integrated purely from a direction leave the scalp tangentially
    and never come back, which is what turns long hair into a puffball.  Holding
    every point in a thin shell makes strands follow the head and shoulders and
    only fall away once they run past them.
    """
    d = eval_points(field, pts)
    bad = (d < lo) | (d > hi)
    if not bad.any():
        return pts
    p = pts[bad]
    g = np.empty_like(p)
    for i in range(3):
        o = np.zeros(3)
        o[i] = eps
        g[:, i] = eval_points(field, p + o) - eval_points(field, p - o)
    n = np.linalg.norm(g, axis=1, keepdims=True)
    n[n < 1e-9] = 1.0
    target = np.clip(d[bad], lo, hi)
    pts[bad] = p + g / n * (target - d[bad])[:, None]
    return pts


def laplacian_smooth(verts, quads, iterations=2, factor=0.5):
    """Uniform Laplacian relaxation; removes the last of the voxel stepping."""
    if iterations <= 0 or len(quads) == 0:
        return verts
    a = quads[:, [0, 1, 2, 3]].reshape(-1)
    b = quads[:, [1, 2, 3, 0]].reshape(-1)
    i = np.concatenate([a, b])
    j = np.concatenate([b, a])
    n = len(verts)
    deg = np.bincount(i, minlength=n).astype(np.float32)
    deg = np.maximum(deg, 1.0)
    v = verts.astype(np.float32).copy()
    for _ in range(iterations):
        acc = np.zeros_like(v)
        np.add.at(acc, i, v[j])
        v += factor * (acc / deg[:, None] - v)
    return v
