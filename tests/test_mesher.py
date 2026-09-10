"""Sanity checks for the SDF mesher, run inside Blender:

    blender -b --factory-startup --python tests/test_mesher.py
"""

import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from humanlab import sdf


def signed_volume(verts, quads):
    tris = np.concatenate([quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]])
    a, b, c = verts[tris[:, 0]], verts[tris[:, 1]], verts[tris[:, 2]]
    return float(np.sum(np.einsum("ij,ij->i", a, np.cross(b, c))) / 6.0)


def check(name, cond):
    print(("PASS  " if cond else "FAIL  ") + name, flush=True)
    return cond


ok = True

# --- single ball: volume + orientation + manifoldness -----------------------
f = sdf.Field()
f.add(sdf.Ball((0, 0, 0), 0.25))
t0 = time.time()
v, q = sdf.polygonise(f, voxel=0.004)
dt = time.time() - t0
vol = signed_volume(v, q)
exact = 4.0 / 3.0 * np.pi * 0.25**3
r = np.linalg.norm(v, axis=1)
print(f"ball: {len(v)} verts {len(q)} quads in {dt:.2f}s  vol={vol:.6f} exact={exact:.6f}")
print(f"      radius min/max = {r.min():.5f}/{r.max():.5f}")
ok &= check("ball volume within 1%", abs(vol - exact) / exact < 0.01)
ok &= check("ball outward winding", vol > 0)
ok &= check("ball radius accurate", abs(r.mean() - 0.25) < 0.0015)

# every edge must be shared by exactly two faces
e = np.concatenate([q[:, [0, 1]], q[:, [1, 2]], q[:, [2, 3]], q[:, [3, 0]]])
key = np.sort(e, axis=1)
uniq, cnt = np.unique(key, axis=0, return_counts=True)
print(f"      edges: {len(uniq)} unique, counts {np.unique(cnt)}")
ok &= check("ball is closed manifold", set(np.unique(cnt)) == {2})

# --- smooth union of two capsules across several slabs ---------------------
f = sdf.Field()
f.add(sdf.RoundCone((0, 0, -0.3), (0, 0, 0.3), 0.08, 0.05))
f.add(sdf.RoundCone((0, 0, 0.1), (0.25, 0, 0.35), 0.06, 0.03), k=0.04)
f.sub(sdf.Ball((0.0, -0.08, 0.0), 0.05), k=0.02)
t0 = time.time()
v, q = sdf.polygonise(f, voxel=0.003, slab=32)
print(f"limbs: {len(v)} verts {len(q)} quads in {time.time()-t0:.2f}s vol={signed_volume(v,q):.6f}")
e = np.concatenate([q[:, [0, 1]], q[:, [1, 2]], q[:, [2, 3]], q[:, [3, 0]]])
uniq, cnt = np.unique(np.sort(e, axis=1), axis=0, return_counts=True)
ok &= check("multi-slab result is closed manifold", set(np.unique(cnt)) == {2})
ok &= check("multi-slab outward winding", signed_volume(v, q) > 0)

# --- loft profile ----------------------------------------------------------
f = sdf.Field()
f.add(sdf.Loft([(0.0, 0.10, 0.07, 0.06, 0.0), (0.3, 0.08, 0.06, 0.05, 0.01),
                (0.6, 0.12, 0.09, 0.06, -0.01)]))
v, q = sdf.polygonise(f, voxel=0.004)
e = np.concatenate([q[:, [0, 1]], q[:, [1, 2]], q[:, [2, 3]], q[:, [3, 0]]])
uniq, cnt = np.unique(np.sort(e, axis=1), axis=0, return_counts=True)
print(f"loft: {len(v)} verts, z range {v[:,2].min():.3f}..{v[:,2].max():.3f}")
ok &= check("loft closed manifold", set(np.unique(cnt)) == {2})

# --- Blender upload -------------------------------------------------------
from humanlab import bl  # noqa: E402

bl.clear_scene()
ob = bl.mesh_from_arrays("test", v, q)
print("uploaded:", bl.object_mesh_stats(ob))
ok &= check("blender mesh matches arrays", bl.object_mesh_stats(ob) == (len(v), len(q)))

print("\nRESULT:", "ALL PASS" if ok else "FAILURES PRESENT")
