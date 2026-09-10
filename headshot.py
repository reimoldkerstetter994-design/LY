"""Head-only preview at high resolution -- the fast loop for face work.

    blender -b --factory-startup --python headshot.py -- --preset adult_male
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from humanlab import bl, build, figure, head, materials, proportions, scene, sdf  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--preset", default="athletic_male")
    ap.add_argument("--voxel", type=float, default=0.0013)
    ap.add_argument("--samples", type=int, default=24)
    ap.add_argument("--res", default="460x600")
    ap.add_argument("--views", default="front,three,side")
    ap.add_argument("--out", default="out/head")
    ap.add_argument("--clay", type=int, default=1)
    ap.add_argument("--hair", type=int, default=0)
    ap.add_argument("--blend", type=float, default=0.20)
    a = ap.parse_args(argv)

    rx, ry = (int(v) for v in a.res.split("x"))
    P = proportions.get(a.preset)
    H = P.height
    bl.clear_scene()
    scene.setup_render(res=(rx, ry), samples=a.samples, denoise=True)
    scene.world_ambient(0.10)

    t0 = time.time()
    f = sdf.Field(blend_scale=a.blend)
    prof = figure.TorsoProfile(figure.torso_sections(P))
    figure.build_neck(f, P, prof)
    lm = head.build_head(f, P, prof)
    lm["profile"] = prof
    verts, quads = sdf.polygonise(f, voxel=a.voxel)
    verts = sdf.laplacian_smooth(verts, quads, 2, 0.5)
    ob = bl.mesh_from_arrays("head", verts, quads)
    bl.shade_smooth(ob)
    mat = materials.clay_material(value=0.46) if a.clay else materials.skin_material(P, lm)
    ob.data.materials.append(mat)
    build.add_eyes(P, lm)
    if not a.clay:
        pass
    else:
        for e in bpy_eyes():
            e.data.materials.clear()
            e.data.materials.append(materials.clay_material("clay_eye", 0.22))
    if a.hair:
        from humanlab import hair as hair_mod

        hair_mod.build_hair(P, lm, verts, build.vertex_normals(ob), clay=bool(a.clay))
    print(f"[head] built {len(verts)} verts in {time.time()-t0:.1f}s", flush=True)

    hz = P.z_chin * H + 0.52 * (1 - P.z_chin) * H
    target = (0.0, -0.012 * H, hz)
    scene.studio_lights(target=target, scale=0.55, key=3.2)
    views = {
        "front": (0, 0), "three": (34, 4), "side": (88, 2), "low": (24, -18),
        "high": (20, 22), "back": (150, 6),
    }
    os.makedirs(a.out, exist_ok=True)
    for v in a.views.split(","):
        az, el = views[v]
        dist = scene.frame_distance(0.30, 105.0, (rx, ry))
        loc = scene.orbit_position(target, dist, az, el)
        scene.camera(loc, target, lens=105.0, name=f"cam_{v}")
        scene.render(os.path.join(a.out, f"{a.preset}_{v}.png"))
        print(f"[head] {v} rendered", flush=True)


def bpy_eyes():
    import bpy

    return [o for o in bpy.data.objects if o.name.startswith("eye_")]


main()
